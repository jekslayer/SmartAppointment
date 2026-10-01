import crypto from 'crypto';
import { NextFunction, Request, Response, Router } from 'express';
import { getClient } from '../db/supabase';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { createError } from '../middleware/error.middleware';

const LINE_API = 'https://api.line.me/v2/bot/message';
const LINE_LOGIN_API = 'https://api.line.me/oauth2/v2.1/verify';
const channelSecret = () => process.env.LINE_CHANNEL_SECRET || '';
const channelToken = () => process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const liffChannelId = () => process.env.LINE_LIFF_CHANNEL_ID || '';

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

type AppointmentNotification = { id: string; appointment_date: string; appointment_time: string; department: string; doctor: string; room?: string | null; purpose?: string | null; notes?: string | null; };
type NotificationResult = { attempted: boolean; sent: boolean; reason?: string; };
type PatientAppointment = AppointmentNotification & { patient_id: string; status: string; created_at?: string | null; };

const DEFAULT_APPOINTMENT_MESSAGE = `ใบนัดพบแพทย์

สวัสดีค่ะ คุณ {{patient_name}}

ท่านมีนัดพบแพทย์ดังนี้:
วันที่: {{appointment_date}}
เวลา: {{appointment_time}}
แผนก: {{department}}
แพทย์: {{doctor_name}}

กรุณามาก่อนเวลานัด 30 นาที`;

function renderAppointmentMessage(template: string, patientName: string, appointment: AppointmentNotification) {
  const values: Record<string, string> = { patient_name: patientName, appointment_date: appointment.appointment_date, appointment_time: appointment.appointment_time, department: appointment.department, doctor_name: appointment.doctor, room: appointment.room || '-', purpose: appointment.purpose || '-', notes: appointment.notes || '-' };
  return template.replace(/{{\s*([a-z_]+)\s*}}/gi, (_, key: string) => values[key.toLowerCase()] ?? '');
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

async function linkPatientRichMenu(lineUserId: string) {
  const richMenuId = process.env.LINE_PATIENT_RICH_MENU_ID;
  if (!richMenuId || !configured()) return;
  const response = await fetch(`${LINE_API}/user/${encodeURIComponent(lineUserId)}/richmenu/${encodeURIComponent(richMenuId)}`, {
    method: 'POST', headers: { Authorization: `Bearer ${channelToken()}` }, signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) console.error('Unable to link patient Rich Menu:', await response.text());
}

function appointmentDetailsMessage(appointment: AppointmentNotification) {
  return ['ใบนัดล่าสุด', `วันที่: ${appointment.appointment_date}`, `เวลา: ${appointment.appointment_time} น.`, `แผนก: ${appointment.department}`, `แพทย์: ${appointment.doctor}`, `ห้อง: ${appointment.room || '-'}`, `วัตถุประสงค์: ${appointment.purpose || '-'}`].join('\n');
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
    const postbackData = (action: 'confirm' | 'reschedule') => new URLSearchParams({
      action, appointment_id: appointment.id
    }).toString();
    await lineRequest('/push', {
      to: link.line_user_id,
      messages: [
        { type: 'text', text: message },
        {
          type: 'template',
          altText: 'โปรดยืนยันหรือขอเลื่อนนัด',
          template: {
            type: 'buttons',
            text: 'ต้องการดำเนินการกับนัดนี้อย่างไร',
            actions: [
              { type: 'postback', label: 'ยืนยันมาตามนัด', data: postbackData('confirm') },
              { type: 'postback', label: 'ขอเลื่อนนัด', data: postbackData('reschedule') }
            ]
          }
        }
      ]
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
      .select('id, appointment_time, department, doctor, status')
      .eq('patient_id', link.patient_id).eq('appointment_date', appointmentDate)
      .in('status', ['pending', 'confirmed'])
      // A patient-confirmed appointment is the explicit check-in target.  It
      // must win over another still-pending appointment on the same day.
      .order('status', { ascending: true }).order('appointment_time', { ascending: true }).limit(2);
    if (appointmentError) throw appointmentError;
    if (!appointments?.length) {
      const { data: checkedIn, error: checkedInError } = await client.from('appointments')
        .select('id').eq('patient_id', link.patient_id).eq('appointment_date', appointmentDate).eq('status', 'completed').maybeSingle();
      if (checkedInError) throw checkedInError;
      if (checkedIn) return res.json({ checkedIn: true, alreadyCheckedIn: true });
      return next(createError(404, 'No appointment can be checked in today'));
    }
    const confirmedAppointments = appointments.filter(appointment => appointment.status === 'confirmed');
    const checkInCandidates = confirmedAppointments.length ? confirmedAppointments : appointments;
    if (checkInCandidates.length > 1) return next(createError(409, 'More than one appointment found today; contact staff'));

    const { data: updated, error: updateError } = await client.from('appointments')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', checkInCandidates[0].id).in('status', ['pending', 'confirmed'])
      .select('id, appointment_time, department, doctor').maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return next(createError(409, 'Appointment status already changed; contact staff'));
    res.json({ checkedIn: true, appointment: updated });
  } catch (error) { next(error); }
}

async function patientIdForLineUser(lineUserId: string) {
  const { data, error } = await getClient().from('patient_line_links').select('patient_id').eq('line_user_id', lineUserId).maybeSingle();
  if (error) throw error;
  return data?.patient_id as string | undefined;
}

async function currentAppointment(patientId: string): Promise<PatientAppointment | null> {
  const { data, error } = await getClient().from('appointments')
    .select('id, patient_id, appointment_date, appointment_time, department, doctor, room, purpose, notes, status, created_at')
    .eq('patient_id', patientId).in('status', ['pending', 'confirmed']).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data as PatientAppointment | null;
}

async function hasAwaitingReplacementAppointment(patientId: string) {
  const { data, error } = await getClient().from('appointments').select('id')
    .eq('patient_id', patientId)
    .eq('status', 'rescheduled')
    .is('rescheduled_to_appointment_id', null)
    .limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

function canRequestReschedule(appointmentDate: string) {
  const blockedFrom = new Date(`${todayInBangkok()}T00:00:00.000Z`);
  blockedFrom.setUTCDate(blockedFrom.getUTCDate() + 3);
  return appointmentDate >= blockedFrom.toISOString().slice(0, 10);
}

async function applyPatientRichMenuPostback(event: LineEvent): Promise<string | null> {
  const lineUserId = event.source?.userId;
  const action = event.postback?.data ? new URLSearchParams(event.postback.data).get('action') : null;
  if (!lineUserId || !['view_appointment', 'request_reschedule', 'department_contacts'].includes(action || '')) return null;
  const patientId = await patientIdForLineUser(lineUserId);
  if (!patientId) return 'ไม่พบบัญชีผู้ป่วยที่เชื่อมกับ LINE นี้';
  if (action === 'department_contacts') {
    const { data, error } = await getClient().from('departments').select('name, phone').eq('is_active', true).order('name');
    if (error) throw error;
    return data?.length ? ['เบอร์ติดต่อแผนก', ...data.map((department: { name: string; phone?: string | null }) => `${department.name}: ${department.phone?.trim() || 'ยังไม่มีเบอร์ติดต่อ'}`)].join('\n') : 'ยังไม่มีข้อมูลแผนกสำหรับติดต่อ';
  }
  const appointment = await currentAppointment(patientId);
  // A linked LINE account may still belong to a patient with no active appointment.
  // Keep department contacts available, but do not expose or change appointment state.
  if (!appointment) {
    if (action === 'view_appointment') {
      return 'ไม่พบใบนัดปัจจุบันของท่าน หากต้องการนัดหมายหรือตรวจสอบข้อมูล กรุณาติดต่อโรงพยาบาล';
    }
    return 'ไม่พบใบนัดปัจจุบัน';
  }
  if (action === 'view_appointment') {
    if (appointment) return appointmentDetailsMessage(appointment);
    return (await hasAwaitingReplacementAppointment(patientId)) ? 'เจ้าหน้าที่กำลังออกใบนัดใหม่ ระบบจะส่งใบนัดใหม่ให้ภายหลัง' : 'ไม่พบใบนัดปัจจุบัน';
  }
  if (!appointment) return (await hasAwaitingReplacementAppointment(patientId)) ? 'ได้รับคำขอเลื่อนนัดแล้ว เจ้าหน้าที่กำลังออกใบนัดใหม่' : 'ไม่พบใบนัดที่สามารถขอเลื่อนได้';
  if (!canRequestReschedule(appointment.appointment_date)) return 'ขอเลื่อนนัดได้ก่อนวันนัดอย่างน้อย 3 วัน กรุณาติดต่อแผนก';
  const { data: updated, error } = await getClient().from('appointments').update({ status: 'rescheduled', updated_at: new Date().toISOString() })
    .eq('id', appointment.id).in('status', ['pending', 'confirmed']).select('id').maybeSingle();
  if (error) throw error;
  return updated ? 'บันทึกคำขอเลื่อนนัดแล้ว เจ้าหน้าที่จะออกใบนัดใหม่และส่งให้ทาง LINE' : 'สถานะใบนัดเปลี่ยนแล้ว กรุณาลองใหม่อีกครั้ง';
}

async function applyAppointmentPostback(event: LineEvent): Promise<'confirmed' | 'rescheduled' | null> {
  const lineUserId = event.source?.userId;
  const data = event.postback?.data;
  if (!lineUserId || !data) return null;
  const params = new URLSearchParams(data);
  const appointmentId = params.get('appointment_id');
  const action = params.get('action');
  const status = action === 'confirm' ? 'confirmed' : action === 'reschedule' ? 'rescheduled' : null;
  if (!appointmentId || !status) return null;

  // Only the LINE account linked to this appointment's patient may change it.
  const client = getClient();
  const { data: appointment, error } = await client.from('appointments')
    .select('id, patient_id')
    .eq('id', appointmentId).single();
  if (error || !appointment?.patient_id) return null;
  const link = await getPatientLineLink(appointment.patient_id);
  if (link?.line_user_id !== lineUserId) return null;
  // First valid response wins. The status predicate makes this atomic, so a
  // repeated tap or a competing confirm/reschedule tap cannot overwrite it.
  const { data: updatedAppointment, error: updateError } = await client.from('appointments')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', appointmentId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (updateError) throw updateError;
  return updatedAppointment ? status : null;
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
        const patientMessage = await applyPatientRichMenuPostback(event);
        if (patientMessage && event.replyToken) {
          try { await lineRequest('/reply', { replyToken: event.replyToken, messages: [{ type: 'text', text: patientMessage }] }); }
          catch (replyError) { console.error('Unable to reply to patient Rich Menu:', replyError); }
          continue;
        }
        const status = await applyAppointmentPostback(event);
        if (status && event.replyToken) {
          const message = status === 'confirmed'
            ? 'บันทึกการยืนยันนัดเรียบร้อยแล้ว'
            : 'บันทึกคำขอเลื่อนนัดเรียบร้อยแล้ว เจ้าหน้าที่จะออกใบนัดใหม่ให้';
          try {
            await lineRequest('/reply', { replyToken: event.replyToken, messages: [{ type: 'text', text: message }] });
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
