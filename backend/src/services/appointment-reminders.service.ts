import { getClient } from '../db/supabase';
import { sendAppointmentReminder } from '../routes/line.routes';

type AppointmentRow = {
  id: string;
  patient_id: string;
  appointment_date: string;
  appointment_time: string;
  department: string;
  doctor: string;
  room?: string | null;
  purpose?: string | null;
  notes?: string | null;
};

type PatientRow = { id: string; full_name: string };

export type ReminderRunResult = {
  reminderDate: string;
  appointmentDateRange: { from: string; to: string };
  daysBefore: number;
  found: number;
  sent: number;
  skipped: number;
  failed: number;
};

function dateInTimeZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function dateTimeInTimeZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value || '';
  return { date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}` };
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function configuredReminderDays() {
  const { data, error } = await getClient().from('line_messages')
    .select('message_text')
    .eq('message_key', 'appointment_reminder_days')
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  if (!data?.message_text?.trim()) {
    throw new Error('appointment_reminder_days is not configured in line_messages');
  }
  const days = Number(data.message_text);
  if (!Number.isInteger(days) || days < 0 || days > 365) {
    throw new Error('appointment_reminder_days must be an integer from 0 to 365');
  }
  return days;
}

function isInsideReminderWindow(appointment: AppointmentRow, reminderDate: string, daysBefore: number, timeZone: string) {
  const lastReminderDate = addDays(reminderDate, daysBefore);
  if (appointment.appointment_date < reminderDate || appointment.appointment_date > lastReminderDate) return false;
  // Do not send a same-day reminder after its appointment time has passed.
  if (appointment.appointment_date === reminderDate) {
    const now = dateTimeInTimeZone(timeZone);
    return appointment.appointment_time.slice(0, 5) > now.time;
  }
  return true;
}

async function claimAndSendReminder(appointment: AppointmentRow, patient: PatientRow, reminderDate: string) {
  const client = getClient();
  const { data: reservation, error: reservationError } = await client.from('appointment_reminders')
    .upsert({ appointment_id: appointment.id, reminder_type: 'line', reminder_date: reminderDate, status: 'processing', sent_at: new Date().toISOString() }, {
      onConflict: 'appointment_id,reminder_type,reminder_date', ignoreDuplicates: true
    })
    .select('id')
    .maybeSingle();
  if (reservationError) throw reservationError;
  if (!reservation) return { attempted: false, sent: false, reason: 'already_sent_today' };

  const notification = await sendAppointmentReminder(appointment, patient);
  await client.from('appointment_reminders').update({
    status: notification.sent ? 'sent' : 'failed',
    error_message: notification.sent ? null : notification.reason || 'LINE delivery failed'
  }).eq('id', reservation.id);
  return notification;
}

/** Called after issuing an appointment. It uses the live Admin setting in
 * line_messages and sends now only when the appointment is already due for a reminder. */
export async function sendAppointmentReminderIfDue(appointment: AppointmentRow, patient: PatientRow) {
  const timeZone = process.env.APPOINTMENT_TIME_ZONE || 'Asia/Bangkok';
  const reminderDate = dateInTimeZone(timeZone);
  const daysBefore = await configuredReminderDays();
  if (!isInsideReminderWindow(appointment, reminderDate, daysBefore, timeZone)) {
    return { due: false, attempted: false, sent: false, reason: 'outside_reminder_window' };
  }
  const notification = await claimAndSendReminder(appointment, patient, reminderDate);
  return { due: true, ...notification };
}

/** Runs once per day. A unique reservation is created before calling LINE, so
 * Vercel retries or overlapping invocations cannot send a reminder twice. */
export async function runAppointmentReminders(): Promise<ReminderRunResult> {
  const timeZone = process.env.APPOINTMENT_TIME_ZONE || 'Asia/Bangkok';
  const daysBefore = await configuredReminderDays();
  const reminderDate = dateInTimeZone(timeZone);
  // `3` means send once each day from today through three days before the
  // appointment, while it is still pending.
  const appointmentDateFrom = reminderDate;
  const appointmentDateTo = addDays(reminderDate, daysBefore);
  const client = getClient();
  const { data: appointments, error } = await client.from('appointments')
    .select('id, patient_id, appointment_date, appointment_time, department, doctor, room, purpose, notes')
    .gte('appointment_date', appointmentDateFrom)
    .lte('appointment_date', appointmentDateTo)
    // Once patient confirms or requests a reschedule, staff owns next action;
    // do not keep sending the same daily reminder.
    .eq('status', 'pending')
    .limit(500);
  if (error) throw error;

  const result: ReminderRunResult = {
    reminderDate,
    appointmentDateRange: { from: appointmentDateFrom, to: appointmentDateTo },
    daysBefore,
    found: appointments?.length || 0,
    sent: 0,
    skipped: 0,
    failed: 0
  };
  for (const appointment of (appointments || []) as AppointmentRow[]) {
    const { data: patient, error: patientError } = await client.from('patients')
      .select('id, full_name')
    .eq('id', appointment.patient_id)
      .single();
    if (patientError || !patient) {
      result.failed += 1;
      continue;
    }
    if (!isInsideReminderWindow(appointment, reminderDate, daysBefore, timeZone)) { result.skipped += 1; continue; }
    const notification = await claimAndSendReminder(appointment, patient as PatientRow, reminderDate);
    if (notification.reason === 'already_sent_today') result.skipped += 1;
    else if (notification.sent) result.sent += 1;
    else result.failed += 1;
  }
  return result;
}
