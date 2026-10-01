export interface Appointment {
  id: string;
  patient_id: string;
  patient_hn: string;
  patient_name: string;
  department: string;
  doctor_id?: string | null;
  doctor: string;
  appointment_date: string;
  appointment_time: string;
  room: string;
  purpose: string;
  notes?: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled';
  rescheduled_to_appointment_id?: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  line_sent?: boolean;
  line_sent_at?: string;
}

export interface CreateAppointmentRequest {
  patient_id: string;
  department: string;
  doctor_id?: string | null;
  doctor?: string;
  appointment_date: string;
  appointment_time: string;
  room: string;
  purpose: string;
  notes?: string;
}

export interface UpdateAppointmentRequest {
  appointment_date?: string;
  appointment_time?: string;
  room?: string;
  purpose?: string;
  notes?: string;
  status?: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled';
}

export interface AppointmentListRequest {
  date?: string;
  status?: string;
  department?: string;
  patient_id?: string;
  limit?: number;
  offset?: number;
}

export interface AppointmentListResponse {
  appointments: Appointment[];
  total: number;
}

export interface AppointmentStats {
  today: number;
  confirmed: number;
  pending: number;
  completed: number;
  no_show: number;
  rescheduled: number;
}
