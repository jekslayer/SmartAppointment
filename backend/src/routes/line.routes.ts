import crypto from 'crypto';
import { NextFunction, Request, Response, Router } from 'express';
import { getClient } from '../db/supabase';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { createError } from '../middleware/error.middleware';
import { hasReachedRescheduleLimit } from '../services/reschedule-limit';

const LINE_API = 'https://api.line.me/v2/bot/message';
const LINE_LOGIN_API = 'https://api.line.me/oauth2/v2.1/verify';
const channelSecret = () => process.env.LINE_CHANNEL_SECRET || '';
const channelToken = () => process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const liffChannelId = () => process.env.LINE_LIFF_CHANNEL_ID || '';
const lateCheckInMessage = 'เลยเวลานัดแล้ว ไม่สามารถเช็กอินได้ ระบบบันทึกสถานะไม่มาตามนัด กรุณาติดต่อโรงพยาบาลหรือแผนกที่นัดหมาย';

type LineEvent = {
  type?: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string };
  postback?: { data?: string };
};

type VerifiedLineIdToken = { sub?: string; aud?: string };
type PatientLineLink = { patient_id: string; line_user_id: string };

function configured() { return Boolean(channelSecret() && channelToken()); }
function isValidSignature(rawBody: Buffer, signature?: string) {
  if (!signature || !channelSecret()) return false;
  const expected = crypto.createHmac('sha256', channelSecret()).update(rawBody).digest('base64');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

async function lineRequest(path: string, body: unknown) {
  if (!configured()) throw createError(503, 'LINE Messaging API is not configured');
  const response = await fetch(`${LINE_API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${channelToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) {
    const details = await response.text();
    throw createError(502, 'LINE Messaging API request failed', details.slice(0, 500));
  }
}

async function recordDelivery(lineUserId: string, message: string, status: 'sent' | 'failed', errorMessage?: string) {
  const { error } = await getClient().from('line_message_deliveries').insert({
    line_user_id: lineUserId,
    message_text: message,
    status,
    error_message: errorMessage || null
  });
  if (error) console.error('Unable to record LINE delivery:', error.message);
}

type AppointmentNotification = { id: string; appointment_date: string; appointment_time: string; appointment_end_time?: string | null; department: string; doctor: string; room?: string | null; purpose?: string | null; notes?: string | null; };
type NotificationResult = { attempted: boolean; sent: boolean; reason?: string; };
type PatientAppointment = AppointmentNotification & { patient_id: string; status: string; created_at?: string | null; };

const DEFAULT_APPOINTMENT_MESSAGE = `ใบนัดพบแพทย์

สวัสดีค่ะ คุณ {{patient_name}}

ท่านมีนัดพบแพทย์ดังนี้:
วันที่: {{appointment_date}}
เวลา: {{appointment_time}} - {{appointment_end_time}}
แผนก: {{department}}
แพทย์: {{doctor_name}}

กรุณามาก่อนเวลานัด 30 นาที`;

/** "09:00:00" + "09:30:00" -> "09:00 - 09:30"; without an end time the start is shown as before. */
function formatAppointmentTime(appointment: { appointment_time: string; appointment_end_time?: string | null }) {
  return appointment.appointment_end_time
    ? `${appointment.appointment_time.slice(0, 5)} - ${appointment.appointment_end_time.slice(0, 5)}`
    : appointment.appointment_time;
}

/**
 * {{appointment_time}} is the START time and {{appointment_end_time}} the end time, so a
 * template can read "{{appointment_time}} - {{appointment_end_time}}". Appointments without an
 * end time drop the " - {{appointment_end_time}}" part instead of leaving a dangling dash.
 */
function renderAppointmentMessage(template: string, patientName: string, appointment: AppointmentNotification) {
  const endTime = appointment.appointment_end_time ? appointment.appointment_end_time.slice(0, 5) : '';
  const source = endTime ? template : template.replace(/\s*[-–]\s*{{\s*appointment_end_time\s*}}/gi, '');
  const values: Record<string, string> = { patient_name: patientName, appointment_date: appointment.appointment_date, appointment_time: appointment.appointment_time.slice(0, 5), appointment_end_time: endTime, department: appointment.department, doctor_name: appointment.doctor, room: appointment.room || '-', purpose: appointment.purpose || '-', notes: appointment.notes || '-' };
  return source.replace(/{{\s*([a-z_]+)\s*}}/gi, (_, key: string) => values[key.toLowerCase()] ?? '');
}

/** Saves delivery status without allowing an unavailable LINE service to lose an appointment. */
async function getPatientLineLink(patientId: string): Promise<PatientLineLink | null> {
  const { data, error } = await getClient().from('patient_line_links')
    .select('patient_id, line_user_id')
    .eq('patient_id', patientId)
    .maybeSingle();
  if (error) throw error;
  return data as PatientLineLink | null;
}

async function verifyLiffIdToken(idToken: unknown): Promise<string> {
  if (typeof idToken !== 'string' || !idToken.trim()) throw createError(400, 'Missing LINE identity token');
  if (!liffChannelId()) throw createError(503, 'LINE account linking is not configured');
  const response = await fetch(LINE_LOGIN_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: liffChannelId() }).toString(),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw createError(401, 'Unable to verify LINE account');
  const verified = await response.json() as VerifiedLineIdToken;
  if (!verified.sub || verified.aud !== liffChannelId()) throw createError(401, 'Unable to verify LINE account');
  return verified.sub;
}

function todayInBangkok() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function bangkokDateTimeNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value || '';
  return { date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}:${value('second')}` };
}

async function linkPatientRichMenu(lineUserId: string) {
  const richMenuId = process.env.LINE_PATIENT_RICH_MENU_ID;
  if (!richMenuId || !configured()) return;
  const response = await fetch(`${LINE_API}/user/${encodeURIComponent(lineUserId)}/richmenu/${encodeURIComponent(richMenuId)}`, {
    method: 'POST', headers: { Authorization: `Bearer ${channelToken()}` }, signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) console.error('Unable to link patient Rich Menu:', await response.text());
}

function appointmentDetailsMessage(appointment: AppointmentNotification) {
  return ['ใบนัดล่าสุด', `วันที่: ${appointment.appointment_date}`, `เวลา: ${formatAppointmentTime(appointment)} น.`, `แผนก: ${appointment.department}`, `แพทย์: ${appointment.doctor}`, `ห้อง: ${appointment.room || '-'}`, `วัตถุประสงค์: ${appointment.purpose || '-'}`].join('\n');
}

export async function sendAppointmentNotification(appointment: AppointmentNotification, patient: { id: string; full_name: string }): Promise<NotificationResult> {
  let link: PatientLineLink | null = null;
  let attempted = false;
  try {
    link = await getPatientLineLink(patient.id);
    if (!link) return { attempted: false, sent: false, reason: 'patient_not_linked' };
    if (!configured()) return { attempted: false, sent: false, reason: 'line_not_configured' };
    const { data: template, error } = await getClient().from('line_messages').select('message_text').eq('message_key', 'appointment_created').eq('is_active', true).maybeSingle();
    if (error) throw error;
    const message = renderAppointmentMessage(template?.message_text || DEFAULT_APPOINTMENT_MESSAGE, patient.full_name, appointment);
    attempted = true;
    await lineRequest('/push', { to: link.line_user_id, messages: [{ type: 'text', text: message }] });
    await recordDelivery(link.line_user_id, message, 'sent');
    await getClient().from('appointments').update({ line_sent_at: new Date().toISOString() }).eq('id', appointment.id);
    return { attempted: true, sent: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    if (link && attempted) {
      try { await recordDelivery(link.line_user_id, '', 'failed', reason); } catch (recordError) { console.error('Unable to record failed LINE delivery:', recordError); }
    }
    console.error('Unable to send appointment notification:', reason);
    return { attempted, sent: false, reason: attempted ? reason : 'notification_preparation_failed' };
  }
}

type AppointmentPostbackAction = 'confirm' | 'reschedule' | 'confirm_yes' | 'reschedule_yes' | 'reminder_back';

function appointmentPostbackData(action: AppointmentPostbackAction, appointmentId: string) {
  return new URLSearchParams({ action, appointment_id: appointmentId }).toString();
}

function appointmentLabel(appointment: { department: string; appointment_date: string; appointment_time: string; appointment_end_time?: string | null }) {
  return `แผนก${appointment.department}
วันที่ ${appointment.appointment_date} เวลา ${formatShortTime(appointment)} น.`;
}

/** The reminder's Confirm / Reschedule card. It names the appointment: a patient may get several reminders in a day. */
function reminderButtonsMessage(appointment: AppointmentNotification) {
  return {
    type: 'template',
    altText: `โปรดยืนยันหรือขอเลื่อนนัดแผนก${appointment.department}`.slice(0, 400),
    template: {
      type: 'buttons',
      text: `นัด${appointmentLabel(appointment)}
ต้องการดำเนินการอย่างไร`.slice(0, 160),
      actions: [
        { type: 'postback', label: 'ยืนยันมาตามนัด', data: appointmentPostbackData('confirm', appointment.id) },
        { type: 'postback', label: 'ขอเลื่อนนัด', data: appointmentPostbackData('reschedule', appointment.id) }
      ]
    }
  };
}

/** Second step: asks the patient to confirm a tap before anything is saved, so a mis-tap changes nothing. */
function postbackPromptMessage(kind: 'confirm' | 'reschedule', appointment: AppointmentNotification) {
  const yes = kind === 'confirm' ? 'confirm_yes' : 'reschedule_yes';
  const question = kind === 'confirm' ? 'ยืนยันมาตามนัด' : 'ขอเลื่อนนัด';
  return {
    type: 'template',
    altText: `${question}แผนก${appointment.department} ใช่ไหม`.slice(0, 400),
    template: {
      type: 'buttons',
      text: `${question}
${appointmentLabel(appointment)}
ใช่ไหม`.slice(0, 160),
      actions: [
        { type: 'postback', label: kind === 'confirm' ? 'ใช่ ยืนยันนัด' : 'ใช่ ขอเลื่อนนัด', data: appointmentPostbackData(yes, appointment.id) },
        { type: 'postback', label: 'ไม่ใช่ เลือกใหม่', data: appointmentPostbackData('reminder_back', appointment.id) }
      ]
    }
  };
}

/** Sends the configured pre-appointment reminder.  Duplicate protection lives
 * in the scheduler's appointment_reminders reservation, before this is called. */
export async function sendAppointmentReminder(appointment: AppointmentNotification, patient: { id: string; full_name: string }): Promise<NotificationResult> {
  let link: PatientLineLink | null = null;
  let attempted = false;
  try {
    link = await getPatientLineLink(patient.id);
    if (!link) return { attempted: false, sent: false, reason: 'patient_not_linked' };
    if (!configured()) return { attempted: false, sent: false, reason: 'line_not_configured' };
    const { data: template, error } = await getClient().from('line_messages')
      .select('message_text')
      .eq('message_key', 'appointment_reminder')
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw error;
    if (!template?.message_text?.trim()) return { attempted: false, sent: false, reason: 'reminder_template_not_configured' };
    const message = renderAppointmentMessage(template.message_text, patient.full_name, appointment);
    attempted = true;
    await lineRequest('/push', {
      to: link.line_user_id,
      messages: [{ type: 'text', text: message }, reminderButtonsMessage(appointment)]
    });
    await recordDelivery(link.line_user_id, message, 'sent');
    return { attempted: true, sent: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    if (link && attempted) {
      try { await recordDelivery(link.line_user_id, '', 'failed', reason); } catch (recordError) { console.error('Unable to record failed LINE delivery:', recordError); }
    }
    console.error('Unable to send appointment reminder:', reason);
    return { attempted, sent: false, reason: attempted ? reason : 'reminder_preparation_failed' };
  }
}

export const lineRouter = Router();

/**
 * Public LIFF endpoint.  A client-provided LINE user ID is never trusted: this
 * endpoint sends the raw LIFF ID token to LINE and uses LINE's verified `sub`.
 */
export async function verifyLiffPatientLink(req: Request, res: Response, next: NextFunction) {
  try {
    const { id_card_last4: idCardLast4, date_of_birth: dateOfBirth, id_token: idToken } = req.body;
    const normalizedIdCardLast4 = typeof idCardLast4 === 'string' ? idCardLast4.trim() : '';
    const validDateOfBirth = typeof dateOfBirth === 'string'
      && /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)
      && !Number.isNaN(Date.parse(`${dateOfBirth}T00:00:00Z`))
      && new Date(`${dateOfBirth}T00:00:00Z`).toISOString().slice(0, 10) === dateOfBirth;
    if (!/^\d{4}$/.test(normalizedIdCardLast4) || !validDateOfBirth || typeof idToken !== 'string' || !idToken.trim()) {
      return next(createError(400, 'กรุณากรอกเลขบัตรประชาชน 4 ตัวท้ายและวันเดือนปีเกิดให้ถูกต้อง แล้วเปิดผ่าน LINE อีกครั้ง'));
    }
    if (!liffChannelId()) return next(createError(503, 'ระบบเชื่อมบัญชี LINE ยังไม่ได้ตั้งค่า'));

    const verificationResponse = await fetch(LINE_LOGIN_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: liffChannelId() }).toString(),
      signal: AbortSignal.timeout(10_000)
    });
    if (!verificationResponse.ok) return next(createError(401, 'ไม่สามารถยืนยันบัญชี LINE ได้ กรุณาสแกน QR และเปิดหน้านี้ใน LINE อีกครั้ง'));
    const verified = await verificationResponse.json() as VerifiedLineIdToken;
    if (!verified.sub || verified.aud !== liffChannelId()) return next(createError(401, 'ไม่สามารถยืนยันบัญชี LINE ได้'));

    const client = getClient();
    const { data: patients, error: patientError } = await client.from('patients')
      .select('id')
      .eq('date_of_birth', dateOfBirth)
      .like('id_card', `%${normalizedIdCardLast4}`)
      .limit(2);
    if (patientError) throw patientError;
    if (!patients?.length) return next(createError(404, 'ไม่พบข้อมูลผู้ป่วยที่ตรงกับข้อมูลยืนยัน'));
    if (patients.length > 1) return next(createError(409, 'พบข้อมูลผู้ป่วยมากกว่าหนึ่งราย กรุณาติดต่อเจ้าหน้าที่'));
    const patient = patients[0] as { id: string };

    const { data: existingPatientLink, error: existingPatientLinkError } = await client.from('patient_line_links')
      .select('patient_id, line_user_id')
      .eq('patient_id', patient.id)
      .maybeSingle();
    if (existingPatientLinkError) throw existingPatientLinkError;
    if (existingPatientLink?.line_user_id === verified.sub) {
      await linkPatientRichMenu(verified.sub);
      return res.json({ linked: true, already_linked: true });
    }
    if (existingPatientLink) return next(createError(409, 'ข้อมูลผู้ป่วยนี้เชื่อมบัญชี LINE อื่นอยู่แล้ว'));

    const { data: linkedLineAccount, error: linkedLineAccountError } = await client.from('patient_line_links')
      .select('patient_id')
      .eq('line_user_id', verified.sub)
      .maybeSingle();
    if (linkedLineAccountError) throw linkedLineAccountError;
    if (linkedLineAccount && linkedLineAccount.patient_id !== patient.id) {
      return next(createError(409, 'บัญชี LINE นี้เชื่อมกับผู้ป่วยรายอื่นอยู่แล้ว'));
    }

    const { error: insertError } = await client.from('patient_line_links')
      .insert({ patient_id: patient.id, line_user_id: verified.sub });
    if (insertError?.code === '23505') {
      return next(createError(409, 'บัญชี LINE หรือข้อมูลผู้ป่วยนี้เชื่อมไว้แล้ว'));
    }
    if (insertError) throw insertError;
    await linkPatientRichMenu(verified.sub);
    res.json({ linked: true });
  } catch (error) { next(error); }
}

/** Public LIFF check-in. Identity comes only from LINE's verified ID token. */
export async function checkInWithLiff(req: Request, res: Response, next: NextFunction) {
  try {
    const lineUserId = await verifyLiffIdToken(req.body?.id_token);
    const client = getClient();
    const { data: link, error: linkError } = await client.from('patient_line_links')
      .select('patient_id').eq('line_user_id', lineUserId).maybeSingle();
    if (linkError) throw linkError;
    if (!link) return next(createError(403, 'LINE account is not linked to a patient'));

    const appointmentDate = todayInBangkok();
    const { data: appointments, error: appointmentError } = await client.from('appointments')
      .select('id, appointment_time, appointment_end_time, department, doctor, status')
      .eq('patient_id', link.patient_id).eq('appointment_date', appointmentDate)
      .in('status', ['pending', 'confirmed'])
      .order('appointment_time', { ascending: true }).limit(20);
    if (appointmentError) throw appointmentError;
    if (!appointments?.length) {
      const { data: checkedIn, error: checkedInError } = await client.from('appointments')
        .select('id').eq('patient_id', link.patient_id).eq('appointment_date', appointmentDate).eq('status', 'completed').maybeSingle();
      if (checkedInError) throw checkedInError;
      if (checkedIn) return res.json({ checkedIn: true, alreadyCheckedIn: true });
      const { data: noShow, error: noShowError } = await client.from('appointments')
        .select('id').eq('patient_id', link.patient_id).eq('appointment_date', appointmentDate).eq('status', 'no_show')
        .limit(1).maybeSingle();
      if (noShowError) throw noShowError;
      if (noShow) return next(createError(409, lateCheckInMessage));
      return next(createError(404, 'No appointment can be checked in today'));
    }
    // A patient may have several appointments today (different departments, different times).
    // One scan checks in the earliest one that has not started yet; scanning again later
    // checks in the next. Appointments whose time has already passed are left for the
    // automatic no-show job unless nothing upcoming remains.
    const now = bangkokDateTimeNow();
    const upcoming = appointments.filter(appointment => appointment.appointment_time > now.time);
    if (!upcoming.length) {
      const { error: noShowError } = await client.from('appointments')
        .update({ status: 'no_show', updated_at: new Date().toISOString() })
        .in('id', appointments.map(appointment => appointment.id)).in('status', ['pending', 'confirmed']);
      if (noShowError) throw noShowError;
      // Already checked in to today's other appointments: this scan is just a repeat.
      const { data: checkedInToday, error: checkedInTodayError } = await client.from('appointments')
        .select('id').eq('patient_id', link.patient_id).eq('appointment_date', appointmentDate).eq('status', 'completed').limit(1);
      if (checkedInTodayError) throw checkedInTodayError;
      if (checkedInToday?.length) return res.json({ checkedIn: true, alreadyCheckedIn: true });
      return next(createError(409, lateCheckInMessage));
    }

    const target = upcoming[0];
    const { data: updated, error: updateError } = await client.from('appointments')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', target.id).in('status', ['pending', 'confirmed'])
      .select('id, appointment_time, appointment_end_time, department, doctor').maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return next(createError(409, 'Appointment status already changed; contact staff'));
    const remaining = upcoming.slice(1).map(({ appointment_time, appointment_end_time, department }) => ({ appointment_time, appointment_end_time, department }));
    res.json({ checkedIn: true, appointment: updated, remaining });
  } catch (error) { next(error); }
}

async function patientIdForLineUser(lineUserId: string) {
  const { data, error } = await getClient().from('patient_line_links').select('patient_id').eq('line_user_id', lineUserId).maybeSingle();
  if (error) throw error;
  return data?.patient_id as string | undefined;
}

const APPOINTMENT_COLUMNS = 'id, patient_id, appointment_date, appointment_time, appointment_end_time, department, doctor, room, purpose, notes, status, created_at';

/** Appointments the patient still has to attend (today or later), soonest first. Past dates are history, never listed. */
async function activeAppointments(patientId: string): Promise<PatientAppointment[]> {
  const { data, error } = await getClient().from('appointments')
    .select(APPOINTMENT_COLUMNS)
    .eq('patient_id', patientId).in('status', ['pending', 'confirmed'])
    .gte('appointment_date', todayInBangkok())
    .order('appointment_date', { ascending: true }).order('appointment_time', { ascending: true }).limit(50);
  if (error) throw error;
  return (data || []) as PatientAppointment[];
}

type PatientReply = { text: string; quickReplies?: Array<{ label: string; data: string }>; message?: Record<string, unknown> };

const STATUS_LABELS: Record<string, string> = { pending: 'รอยืนยัน', confirmed: 'ยืนยันแล้ว' };
const MAX_LISTED_APPOINTMENTS = 8;
const MAX_QUICK_REPLIES = 13;

/** "08:00:00" -> "08:00"; with an end time "08:00 - 08:20". */
function formatShortTime(appointment: { appointment_time: string; appointment_end_time?: string | null }) {
  const start = appointment.appointment_time.slice(0, 5);
  return appointment.appointment_end_time ? `${start} - ${appointment.appointment_end_time.slice(0, 5)}` : start;
}

/** One appointment keeps the familiar detail card; several are listed soonest first. */
function appointmentsListMessage(appointments: PatientAppointment[]) {
  if (appointments.length === 1) return appointmentDetailsMessage(appointments[0]);
  const lines = [`ใบนัดของท่าน (${appointments.length} รายการ)`];
  appointments.slice(0, MAX_LISTED_APPOINTMENTS).forEach((appointment, index) => {
    lines.push(
      '',
      `${index + 1}) วันที่ ${appointment.appointment_date} เวลา ${formatShortTime(appointment)} น.`,
      `แผนก: ${appointment.department} | แพทย์: ${appointment.doctor}`,
      `ห้อง: ${appointment.room || '-'} | สถานะ: ${STATUS_LABELS[appointment.status] || appointment.status}`
    );
  });
  if (appointments.length > MAX_LISTED_APPOINTMENTS) lines.push('', `และอีก ${appointments.length - MAX_LISTED_APPOINTMENTS} รายการ`);
  return lines.join('\n');
}

function quickReplyLabel(appointment: PatientAppointment) {
  const date = appointment.appointment_date;
  const when = ` ${date.slice(8, 10)}/${date.slice(5, 7)} ${appointment.appointment_time.slice(0, 5)}`;
  // LINE limits quick reply labels to 20 characters: shorten the department, never the date/time.
  return `${appointment.department.slice(0, 20 - when.length)}${when}`;
}

// A reschedule can be requested at any time before the appointment starts.
function canRequestReschedule(appointmentDate: string, appointmentTime: string) {
  const now = bangkokDateTimeNow();
  return appointmentDate > now.date || (appointmentDate === now.date && appointmentTime > now.time);
}

const rescheduleLimitMessage ='ท่านขอเลื่อนนัดครบ 3 ครั้งแล้ว กรุณาติดต่อโรงพยาบาลหรือแผนกที่นัดหมาย';

/** Why this appointment cannot be rescheduled right now, or null when it can. */
async function rescheduleBlockedReason(patientId: string, appointment: PatientAppointment): Promise<string | null> {
  if (await hasReachedRescheduleLimit(patientId, appointment.id)) return rescheduleLimitMessage;
  if (!canRequestReschedule(appointment.appointment_date, appointment.appointment_time)) return 'ใบนัดนี้เลยเวลานัดแล้ว ไม่สามารถขอเลื่อนได้ กรุณาติดต่อโรงพยาบาลหรือแผนกที่นัดหมาย';
  return null;
}

/** The menu never reschedules on one tap: it asks first, so a mis-tap changes nothing. */
function rescheduleConfirmMessage(appointment: PatientAppointment) {
  return {
    type: 'template',
    altText: `ขอเลื่อนนัดแผนก${appointment.department} ใช่ไหม`.slice(0, 400),
    template: {
      type: 'buttons',
      text: `ขอเลื่อนนัด\n${appointmentLabel(appointment)}\nใช่ไหม`.slice(0, 160),
      actions: [
        { type: 'postback', label: 'ใช่ ขอเลื่อนนัด', data: new URLSearchParams({ action: 'reschedule_confirm', appointment_id: appointment.id }).toString() },
        { type: 'postback', label: 'ไม่ใช่ ยกเลิก', data: new URLSearchParams({ action: 'reschedule_cancel' }).toString() }
      ]
    }
  };
}

/** Asks the patient to confirm, unless the appointment can no longer be rescheduled at all. */
async function askRescheduleConfirmation(patientId: string, appointment: PatientAppointment): Promise<PatientReply> {
  const blocked = await rescheduleBlockedReason(patientId, appointment);
  if (blocked) return { text: blocked };
  return { text: `ขอเลื่อนนัดแผนก${appointment.department} ใช่ไหม`, message: rescheduleConfirmMessage(appointment) };
}

/** Marks one appointment as a reschedule request and returns the text to tell the patient. */
async function requestRescheduleOf(patientId: string, appointment: PatientAppointment): Promise<string> {
  const blocked = await rescheduleBlockedReason(patientId, appointment);
  if (blocked) return blocked;
  const { data: updated, error } = await getClient().from('appointments').update({ status: 'rescheduled', updated_at: new Date().toISOString() })
    .eq('id', appointment.id).in('status', ['pending', 'confirmed']).select('id').maybeSingle();
  if (error) throw error;
  return updated
    ? `บันทึกคำขอเลื่อนนัดแผนก${appointment.department} วันที่ ${appointment.appointment_date} แล้ว เจ้าหน้าที่จะออกใบนัดใหม่และส่งให้ทาง LINE`
    : 'สถานะใบนัดเปลี่ยนแล้ว กรุณาลองใหม่อีกครั้ง';
}

const MENU_ACTIONS = ['view_appointment', 'request_reschedule', 'reschedule_pick', 'reschedule_confirm', 'reschedule_cancel', 'department_contacts'];

async function applyPatientRichMenuPostback(event: LineEvent): Promise<PatientReply | null> {
  const lineUserId = event.source?.userId;
  const params = event.postback?.data ? new URLSearchParams(event.postback.data) : null;
  const action = params?.get('action') ?? null;
  if (!lineUserId || !params || !MENU_ACTIONS.includes(action || '')) return null;
  // Dismisses the reschedule chooser without touching any appointment.
  if (action === 'reschedule_cancel') return { text: 'ไม่มีการเปลี่ยนแปลงใบนัดของท่าน' };
  const patientId = await patientIdForLineUser(lineUserId);
  if (!patientId) return { text: 'ไม่พบบัญชีผู้ป่วยที่เชื่อมกับ LINE นี้' };
  if (action === 'department_contacts') {
    const { data, error } = await getClient().from('departments').select('name, phone').eq('is_active', true).order('name');
    if (error) throw error;
    return { text: data?.length ? ['เบอร์ติดต่อแผนก', ...data.map((department: { name: string; phone?: string | null }) => `${department.name}: ${department.phone?.trim() || 'ยังไม่มีเบอร์ติดต่อ'}`)].join('\n') : 'ยังไม่มีข้อมูลแผนกสำหรับติดต่อ' };
  }
  // A linked LINE account may belong to a patient with no active appointment. Keep department
  // contacts available, but never expose or change appointment state for someone else.
  const appointments = await activeAppointments(patientId);
  if (action === 'view_appointment') {
    return { text: appointments.length
      ? appointmentsListMessage(appointments)
      : 'ไม่พบใบนัดปัจจุบันของท่าน หากต้องการนัดหมายหรือตรวจสอบข้อมูล กรุณาติดต่อโรงพยาบาล' };
  }
  if (action === 'reschedule_pick' || action === 'reschedule_confirm') {
    // Only appointments that belong to this patient are in the list, so a forged id finds nothing.
    const chosen = appointments.find(appointment => appointment.id === params.get('appointment_id'));
    if (!chosen) return { text: 'ไม่พบใบนัดนี้หรือสถานะเปลี่ยนแล้ว กรุณากดเลื่อนนัดจากเมนูอีกครั้ง' };
    // Picking only asks for confirmation; nothing is saved until the patient answers "ใช่".
    return action === 'reschedule_pick' ? askRescheduleConfirmation(patientId, chosen) : { text: await requestRescheduleOf(patientId, chosen) };
  }
  if (!appointments.length) return { text: 'ไม่พบใบนัดปัจจุบัน' };
  if (appointments.length === 1) return askRescheduleConfirmation(patientId, appointments[0]);
  // One slot is kept for "ยกเลิก": LINE offers no close button on the quick reply bar, so tapping it is how a patient dismisses it.
  const choices = appointments.filter(appointment => canRequestReschedule(appointment.appointment_date, appointment.appointment_time)).slice(0, MAX_QUICK_REPLIES - 1);
  if (!choices.length) return { text: 'ใบนัดของท่านเลยเวลานัดแล้วทั้งหมด ไม่สามารถขอเลื่อนได้ กรุณาติดต่อโรงพยาบาลหรือแผนกที่นัดหมาย' };
  return {
    text: 'ต้องการเลื่อนใบนัดใบไหน กรุณาเลือกจากปุ่มด้านล่าง หรือกด "ยกเลิก" หากไม่ต้องการเลื่อน',
    quickReplies: [
      ...choices.map(appointment => ({
        label: quickReplyLabel(appointment),
        data: new URLSearchParams({ action: 'reschedule_pick', appointment_id: appointment.id }).toString()
      })),
      { label: 'ยกเลิก', data: new URLSearchParams({ action: 'reschedule_cancel' }).toString() }
    ]
  };
}

type PostbackOutcome = {
  result: 'confirmed' | 'rescheduled' | 'reschedule_limit_reached' | 'already_processed' | 'confirm_prompt' | 'reschedule_prompt' | 'show_card';
  appointment: AppointmentNotification;
};

/**
 * Buttons on the reminder card. "confirm"/"reschedule" only ASK the patient to confirm the tap;
 * nothing is saved until "confirm_yes"/"reschedule_yes", so a mis-tap changes nothing.
 * "reminder_back" re-sends the original card.
 */
async function applyAppointmentPostback(event: LineEvent): Promise<PostbackOutcome | null> {
  const lineUserId = event.source?.userId;
  const data = event.postback?.data;
  if (!lineUserId || !data) return null;
  const params = new URLSearchParams(data);
  const appointmentId = params.get('appointment_id');
  const action = params.get('action');
  if (!appointmentId || !['confirm', 'reschedule', 'confirm_yes', 'reschedule_yes', 'reminder_back'].includes(action || '')) return null;

  // Only the LINE account linked to this appointment's patient may act on it.
  const client = getClient();
  const { data: appointment, error } = await client.from('appointments')
    .select('id, patient_id, appointment_date, appointment_time, appointment_end_time, department, doctor, status')
    .eq('id', appointmentId).single();
  if (error || !appointment?.patient_id) return null;
  const link = await getPatientLineLink(appointment.patient_id);
  if (link?.line_user_id !== lineUserId) return null;

  const summary = appointment as unknown as AppointmentNotification;
  const wantsReschedule = action === 'reschedule' || action === 'reschedule_yes';
  // Only an appointment still awaiting a response can be confirmed or rescheduled from the card.
  if (appointment.status !== 'pending') return { result: 'already_processed', appointment: summary };
  if (wantsReschedule && await hasReachedRescheduleLimit(appointment.patient_id, appointment.id)) {
    return { result: 'reschedule_limit_reached', appointment: summary };
  }
  if (action === 'reminder_back') return { result: 'show_card', appointment: summary };
  if (action === 'confirm') return { result: 'confirm_prompt', appointment: summary };
  if (action === 'reschedule') return { result: 'reschedule_prompt', appointment: summary };

  const status = action === 'confirm_yes' ? 'confirmed' : 'rescheduled';
  // First valid response wins. The status predicate makes this atomic, so a
  // repeated tap or a competing confirm/reschedule tap cannot overwrite it.
  const { data: updatedAppointment, error: updateError } = await client.from('appointments')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', appointmentId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (updateError) throw updateError;
  return { result: updatedAppointment ? status : 'already_processed', appointment: summary };
}

/** What to send back for a card tap: a question, the card again, or the final confirmation text. */
function postbackReplyMessages({ result, appointment }: PostbackOutcome) {
  const label = `แผนก${appointment.department} วันที่ ${appointment.appointment_date} เวลา ${formatShortTime(appointment)} น.`;
  switch (result) {
    case 'confirm_prompt': return [postbackPromptMessage('confirm', appointment)];
    case 'reschedule_prompt': return [postbackPromptMessage('reschedule', appointment)];
    case 'show_card': return [reminderButtonsMessage(appointment)];
    case 'confirmed': return [{ type: 'text', text: `บันทึกการยืนยันนัด${label} เรียบร้อยแล้ว` }];
    case 'rescheduled': return [{ type: 'text', text: `บันทึกคำขอเลื่อนนัด${label} เรียบร้อยแล้ว เจ้าหน้าที่จะออกใบนัดใหม่ให้` }];
    case 'reschedule_limit_reached': return [{ type: 'text', text: rescheduleLimitMessage }];
    default: return [{ type: 'text', text: `ใบนัด${label} ได้รับการดำเนินการแล้ว` }];
  }
}

function toLineTextMessage(reply: PatientReply) {
  if (reply.message) return reply.message;
  return {
    type: 'text', text: reply.text,
    ...(reply.quickReplies?.length ? {
      quickReply: { items: reply.quickReplies.map(item => ({ type: 'action', action: { type: 'postback', label: item.label, data: item.data } })) }
    } : {})
  };
}

/** Must be registered before express.json() so LINE's signature checks the exact request bytes. */
export async function lineWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const raw = req.body;
    if (!Buffer.isBuffer(raw) || !isValidSignature(raw, req.header('x-line-signature'))) {
      return next(createError(401, 'Invalid LINE webhook signature'));
    }
    const payload = JSON.parse(raw.toString('utf8')) as { events?: LineEvent[] };
    for (const event of payload.events || []) {
      if (event.type === 'postback') {
        const patientReply = await applyPatientRichMenuPostback(event);
        if (patientReply) {
          if (event.replyToken) {
            try { await lineRequest('/reply', { replyToken: event.replyToken, messages: [toLineTextMessage(patientReply)] }); }
            catch (replyError) { console.error('Unable to reply to patient Rich Menu:', replyError); }
          }
          continue;
        }
        const outcome = await applyAppointmentPostback(event);
        if (outcome && event.replyToken) {
          try {
            await lineRequest('/reply', { replyToken: event.replyToken, messages: postbackReplyMessages(outcome) });
          } catch (replyError) {
            console.error('Unable to reply to appointment postback:', replyError);
          }
        }
        continue;
      }
      if (event.type !== 'follow' || !event.source?.userId) continue;
      if (event.replyToken) await lineRequest('/reply', { replyToken: event.replyToken, messages: [{ type: 'text', text: 'ยินดีต้อนรับ กรุณาสแกน QR กลางเพื่อเชื่อมบัญชีและรับใบนัดผ่าน LINE' }] });
    }
    res.sendStatus(200);
  } catch (error) { next(error); }
}

lineRouter.use(authenticate, authorize('admin'));

lineRouter.get('/status', (_req, res) => res.json({ configured: configured() }));

lineRouter.post('/push', async (req, res, next) => {
  try {
    const { line_user_id, text } = req.body;
    if (typeof line_user_id !== 'string' || typeof text !== 'string' || !text.trim() || text.length > 5000) {
      return next(createError(400, 'line_user_id and a message up to 5,000 characters are required'));
    }
    const message = text.trim();
    try {
      await lineRequest('/push', { to: line_user_id, messages: [{ type: 'text', text: message }] });
      await recordDelivery(line_user_id, message, 'sent');
    } catch (error) {
      await recordDelivery(line_user_id, message, 'failed', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
    res.status(202).json({ accepted: true });
  } catch (error) { next(error); }
});
