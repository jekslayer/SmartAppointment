import { Router, Request, Response, NextFunction } from 'express';
import { getClient } from '../db/supabase';
import { authenticate } from '../middleware/auth.middleware';
import { createError } from '../middleware/error.middleware';
import { sendAppointmentNotification } from './line.routes';
import { sendAppointmentReminderIfDue } from '../services/appointment-reminders.service';
import { hasReachedRescheduleLimit } from '../services/reschedule-limit';

export const dataRouter = Router();

function isValidAppointmentDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function todayInBangkok() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

dataRouter.post('/appointments/create-and-notify', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as Request & { user?: { id: string; role: string } }).user;
    if (!user || !['staff', 'admin'].includes(user.role)) return next(createError(403, 'Access denied'));
    const { patient_id, appointment_date, appointment_time, department, doctor_id: doctorId, doctor, room, purpose, notes, reschedule_from_appointment_id: rescheduleFromAppointmentId } = req.body;
    if (![patient_id, appointment_date, appointment_time, department, doctor, room, purpose].every(value => typeof value === 'string' && value.trim())) return next(createError(400, 'Complete appointment details are required'));
    if (!isValidAppointmentDate(appointment_date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(appointment_time)) return next(createError(400, 'Invalid appointment date or time'));
    if (appointment_date < todayInBangkok()) return next(createError(400, 'Appointments cannot be scheduled in the past'));
    if (rescheduleFromAppointmentId !== undefined && (typeof rescheduleFromAppointmentId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rescheduleFromAppointmentId))) {
      return next(createError(400, 'Invalid rescheduled appointment reference'));
    }
    const client = getClient();
    const { data: patient, error: patientError } = await client.from('patients').select('id, full_name').eq('id', patient_id).single();
    if (patientError || !patient) return next(createError(404, 'Patient not found'));
    if (rescheduleFromAppointmentId) {
      const { data: sourceAppointment, error: sourceError } = await client
        .from('appointments')
        .select('id, patient_id, appointment_date')
        .eq('id', rescheduleFromAppointmentId)
        .maybeSingle();
      if (sourceError) throw sourceError;
      if (!sourceAppointment || sourceAppointment.patient_id !== patient_id) {
        return next(createError(404, 'Rescheduled appointment not found for this patient'));
      }
      if (sourceAppointment.appointment_date === appointment_date) {
        return next(createError(409, 'Rescheduled appointment must be on a different date'));
      }
      if (await hasReachedRescheduleLimit(patient_id, sourceAppointment.id)) {
        return next(createError(409, 'Reschedule limit reached'));
      }
    }
    if ((doctorId === null || doctorId === undefined || doctorId === '') && department.trim() !== 'โรคทั่วไป') {
      return next(createError(400, 'A valid doctor must be selected for this department'));
    }
    // A patient may have only one appointment awaiting attendance at a time.
    // Rescheduling remains possible because its source appointment is atomically
    // moved to `rescheduled` by the database RPC before the replacement is inserted.
    let activeAppointmentQuery = client
      .from('appointments')
      .select('id')
      .eq('patient_id', patient_id)
      .in('status', ['pending', 'confirmed']);
    if (rescheduleFromAppointmentId) activeAppointmentQuery = activeAppointmentQuery.neq('id', rescheduleFromAppointmentId);
    const { data: activeAppointments, error: activeAppointmentError } = await activeAppointmentQuery.limit(1);
    if (activeAppointmentError) throw activeAppointmentError;
    if (activeAppointments?.length) {
      return next(createError(409, 'Patient already has an active appointment'));
    }
    if (doctorId !== null && doctorId !== undefined) {
      if (typeof doctorId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(doctorId)) {
        return next(createError(400, 'Invalid doctor reference'));
      }
      const { data: selectedDoctor, error: doctorError } = await client
        .from('doctors')
        .select('id, name, max_patients_per_day, departments(name)')
        .eq('id', doctorId)
        .eq('is_active', true)
        .single();
      if (doctorError || !selectedDoctor) return next(createError(404, 'Doctor not found or inactive'));
      const doctorRecord = selectedDoctor as { name: string; departments?: { name?: string } | Array<{ name?: string }> | null };
      const doctorDepartment = Array.isArray(doctorRecord.departments)
        ? doctorRecord.departments[0]?.name
        : doctorRecord.departments?.name;
      if (doctorRecord.name !== doctor.trim() || doctorDepartment !== department.trim()) {
        return next(createError(400, 'Doctor does not belong to selected department'));
      }
      const [bookedForLinkedDoctor, legacyUnlinkedBookings] = await Promise.all([
        client.from('appointments').select('id', { count: 'exact', head: true })
          .eq('doctor_id', doctorId).eq('appointment_date', appointment_date)
          .neq('status', 'cancelled').neq('status', 'rescheduled'),
        client.from('appointments').select('id', { count: 'exact', head: true })
          .is('doctor_id', null).eq('doctor', doctor.trim()).eq('department', department.trim())
          .eq('appointment_date', appointment_date)
          .neq('status', 'cancelled').neq('status', 'rescheduled')
      ]);
      if (bookedForLinkedDoctor.error) throw bookedForLinkedDoctor.error;
      if (legacyUnlinkedBookings.error) throw legacyUnlinkedBookings.error;
      const currentCount = (bookedForLinkedDoctor.count || 0) + (legacyUnlinkedBookings.count || 0);
      if (currentCount >= selectedDoctor.max_patients_per_day) {
        return next(createError(409, 'Doctor daily capacity reached'));
      }
    }
    const appointmentPayload = { patient_id, appointment_date, appointment_time, department: department.trim(), doctor_id: doctorId || null, doctor: doctor.trim(), room: room.trim(), purpose: purpose.trim(), notes: typeof notes === 'string' ? notes.trim() || null : null, status: 'pending', created_by: user.id };
    const result = rescheduleFromAppointmentId
      ? await client.rpc('create_rescheduled_appointment', {
        p_source_appointment_id: rescheduleFromAppointmentId,
        p_patient_id: patient_id,
        p_appointment_date: appointment_date,
        p_appointment_time: appointment_time,
        p_department: appointmentPayload.department,
        p_doctor_id: appointmentPayload.doctor_id,
        p_doctor: appointmentPayload.doctor,
        p_room: appointmentPayload.room,
        p_purpose: appointmentPayload.purpose,
        p_notes: appointmentPayload.notes,
        p_created_by: user.id
      }).single()
      : await client.from('appointments').insert(appointmentPayload).select().single();
    let { data: appointment, error: appointmentError } = result;
    if (appointmentError?.code === 'P0001') {
      const message = /rescheduled appointment must be on a different date/i.test(appointmentError.message || '')
        ? 'Rescheduled appointment must be on a different date'
        : appointmentError.message;
      return next(createError(409, message));
    }
    if (appointmentError) throw appointmentError;
    const notification = await sendAppointmentNotification(appointment, patient);
    let reminderNotification: unknown;
    try {
      reminderNotification = await sendAppointmentReminderIfDue(appointment, patient);
    } catch (reminderError) {
      console.error('Unable to send immediate appointment reminder:', reminderError);
      reminderNotification = { due: false, attempted: false, sent: false, reason: 'reminder_check_failed' };
    }
    res.status(201).json({ appointment, notification, reminderNotification });
  } catch (error) { next(error); }
});

// Which of the given appointments are awaiting a replacement but already sit
// behind the maximum number of reschedules (staff must not issue another one).
dataRouter.post('/appointments/reschedule-limits', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as Request & { user?: { role: string } }).user;
    if (!user || !['staff', 'admin'].includes(user.role)) return next(createError(403, 'Access denied'));
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length > 100 || !ids.every((id: unknown) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
      return next(createError(400, 'Invalid appointment ids'));
    }
    if (!ids.length) return res.json({ limited_ids: [] });
    const { data, error } = await getClient().from('appointments').select('id, patient_id')
      .in('id', ids).eq('status', 'rescheduled').is('rescheduled_to_appointment_id', null);
    if (error) throw error;
    const limited: string[] = [];
    for (const row of data || []) {
      if (await hasReachedRescheduleLimit(row.patient_id, row.id)) limited.push(row.id);
    }
    res.json({ limited_ids: limited });
  } catch (error) { next(error); }
});

// Compatibility endpoint for legacy Angular screens. The whitelist and the
// supported operations deliberately prevent arbitrary SQL/RPC execution.
const TABLES = new Set(['users', 'patients', 'appointments', 'departments', 'doctors', 'appointment_reminders', 'line_messages']);
const ACTIONS = new Set(['select', 'insert', 'update', 'delete', 'upsert']);
// Explicit allow-list of non-sensitive columns returned for insert/update/select on users,
// so the password hash is never echoed back to the client.
const USERS_SAFE_COLUMNS = 'id, employee_id, username, full_name, role, department_id, is_active, must_change_password, created_at, updated_at';
const STAFF_PATIENT_COLUMNS = new Set(['id', 'hn', 'full_name', 'id_card', 'date_of_birth', 'phone', 'allergies', 'notes']);
const STAFF_PATIENT_HISTORY_RETURN_COLUMNS = 'id, hn, full_name, allergies, notes';

dataRouter.post('/query', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { table, action, columns = '*', count: countOption, filters = [], ordering = [], limit, offset = 0, payload, one, allowNull } = req.body;
    if (!TABLES.has(table) || !ACTIONS.has(action) || !Array.isArray(filters) || !Array.isArray(ordering)) {
      return next(createError(400, 'Invalid data request'));
    }
    if (table === 'users' && action === 'select' && (columns === '*' || /\bpassword(_hash)?\b/i.test(columns))) {
      return next(createError(400, 'Sensitive user fields cannot be requested'));
    }
    const user = (req as Request & { user?: { role: string } }).user;
    if (table === 'patients' && action === 'select' && user?.role === 'staff') {
      const requestedPatientColumns = typeof columns === 'string'
        ? columns.split(',').map((column: string) => column.trim())
        : [];
      if (!requestedPatientColumns.length || requestedPatientColumns.some((column: string) => !STAFF_PATIENT_COLUMNS.has(column))) {
        return next(createError(400, 'Requested patient fields are not available to staff'));
      }
    }
    if (table === 'appointments' && action === 'select' && user?.role === 'staff' && typeof columns === 'string') {
      const normalizedColumns = columns.replace(/\s+/g, '');
      const patientRelation = normalizedColumns.match(/(?:^|,)patients(?:!inner)?\(([^()]*)\)(?:,|$)/i);
      if (normalizedColumns.includes('(')
          && (!patientRelation || patientRelation[1].split(',').some((column: string) => !['hn', 'full_name'].includes(column)))) {
        return next(createError(400, 'Staff may only view patient HN and name with appointments'));
      }
      if (patientRelation && normalizedColumns.replace(patientRelation[0], '').includes('(')) {
        return next(createError(400, 'Nested appointment relationships are not available to staff'));
      }
    }
    const singleIdFilter = filters.filter((filter: any) =>
      filter.operator === 'eq' && filter.column === 'id' && typeof filter.value === 'string' && filter.value.trim()
    );
    const hasSingleIdFilter = singleIdFilter.length === 1;
    if (action === 'select' && user?.role !== 'admin' && !['patients', 'appointments', 'departments', 'doctors'].includes(table)) {
      return next(createError(403, 'Access denied'));
    }
    const staffMayUpdateAppointmentStatus = table === 'appointments' && action === 'update' && user?.role === 'staff'
      && hasSingleIdFilter
      && payload && typeof payload === 'object' && !Array.isArray(payload)
      && Object.keys(payload).length === 1 && Object.prototype.hasOwnProperty.call(payload, 'status')
      && ['completed', 'no_show'].includes(payload.status);
    const staffMayUpdatePatientHistory = table === 'patients' && action === 'update' && user?.role === 'staff'
      && hasSingleIdFilter
      && payload && typeof payload === 'object' && !Array.isArray(payload)
      && Object.keys(payload).length > 0
      && Object.keys(payload).every(key => key === 'allergies' || key === 'notes')
      && Object.values(payload).every(value => value === null || (typeof value === 'string' && value.length <= 5000));
    const adminMayUpdateCapacity = table === 'doctors' && action === 'update' && user?.role === 'admin'
      && hasSingleIdFilter
      && payload && typeof payload === 'object' && !Array.isArray(payload)
      && Object.keys(payload).length === 1 && Object.prototype.hasOwnProperty.call(payload, 'max_patients_per_day')
      && Number.isInteger(payload.max_patients_per_day) && payload.max_patients_per_day > 0;
    const adminMayManageMessageTemplates = table === 'line_messages'
      && ['insert', 'update', 'delete', 'upsert'].includes(action) && user?.role === 'admin'
      && (action === 'insert' || action === 'upsert'
        || (action === 'update' && filters.some((filter: any) => filter.operator === 'eq' && filter.column === 'message_key'))
        || (action === 'delete' && hasSingleIdFilter));
    if (action !== 'select' && !staffMayUpdateAppointmentStatus && !staffMayUpdatePatientHistory
      && !adminMayUpdateCapacity && !adminMayManageMessageTemplates) {
      return next(createError(403, 'Admin access required'));
    }
    if (action === 'upsert' && table !== 'line_messages') {
      return next(createError(400, 'Upsert is only supported for message templates'));
    }
    let safePayload = staffMayUpdateAppointmentStatus
      ? { status: payload.status, updated_at: new Date().toISOString() }
      : payload;
    if (table === 'users' && (action === 'insert' || action === 'update')) {
      safePayload = { ...payload };
      if ('require_password_change' in safePayload) {
        safePayload.must_change_password = safePayload.require_password_change;
        delete safePayload.require_password_change;
      }
    }
    const client = getClient();
    let query: any;
    const returnColumns = table === 'users'
      ? USERS_SAFE_COLUMNS
      : staffMayUpdatePatientHistory ? STAFF_PATIENT_HISTORY_RETURN_COLUMNS : undefined;
    if (action === 'select') query = client.from(table).select(columns, countOption === 'exact' ? { count: 'exact' } : undefined);
    if (action === 'insert') query = client.from(table).insert(safePayload).select(returnColumns);
    if (action === 'upsert') query = client.from(table).upsert(safePayload, { onConflict: 'message_key' }).select(returnColumns);
    if (action === 'update') {
      query = client.from(table).update(safePayload).select(returnColumns);
      if (staffMayUpdateAppointmentStatus) query = query.in('status', ['pending', 'confirmed']);
    }
    if (action === 'delete') query = client.from(table).delete();
    for (const filter of filters) {
      if (filter.operator === 'eq' && typeof filter.column === 'string') query = query.eq(filter.column, filter.value);
      else if (filter.operator === 'neq' && typeof filter.column === 'string') query = query.neq(filter.column, filter.value);
      else if (filter.operator === 'gte' && typeof filter.column === 'string') query = query.gte(filter.column, filter.value);
      else if (filter.operator === 'lte' && typeof filter.column === 'string') query = query.lte(filter.column, filter.value);
      else if (filter.operator === 'or' && table === 'patients' && typeof filter.value === 'string' && /^((hn|full_name|id_card)\.ilike\.%[^,%()]{1,100}%)(,(hn|full_name|id_card)\.ilike\.%[^,%()]{1,100}%)*$/.test(filter.value)) query = query.or(filter.value);
      else return next(createError(400, 'Invalid filter'));
    }
    for (const order of ordering) {
      if (typeof order.column !== 'string') return next(createError(400, 'Invalid sort'));
      query = query.order(order.column, { ascending: order.ascending !== false });
    }
    if (action === 'select' && (!Number.isInteger(limit) || limit < 1 || limit > 100)) return next(createError(400, 'Select requests require a limit between 1 and 100'));
    if (action === 'select' && (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000)) return next(createError(400, 'Invalid select offset'));
    if (Number.isInteger(limit) && limit > 0 && limit <= 100) query = query.range(offset, offset + limit - 1);
    if (one) query = allowNull ? query.maybeSingle() : query.single();
    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, error: null, count });
  } catch (error) { next(error); }
});
