import { getClient } from '../db/supabase';

export const RESCHEDULE_LIMIT = 3;

/**
 * True when the appointment already sits behind RESCHEDULE_LIMIT earlier
 * reschedules in its chain, so any further reschedule must be handled by staff
 * outside the system. Shared by the LINE flow and the staff/web flow.
 */
export async function hasReachedRescheduleLimit(patientId: string, appointmentId: string) {
  const client = getClient();
  let childId = appointmentId;
  for (let count = 0; count < RESCHEDULE_LIMIT; count += 1) {
    const { data, error } = await client.from('appointments').select('id')
      .eq('patient_id', patientId)
      .eq('rescheduled_to_appointment_id', childId)
      .eq('status', 'rescheduled')
      .limit(1);
    if (error) throw error;
    const parent = data?.[0];
    if (!parent) return false;
    childId = parent.id;
  }
  return true;
}
