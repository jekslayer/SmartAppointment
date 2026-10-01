// Auth Models
export interface User {
  id: string;
  employee_id?: string;
  username?: string;
  full_name: string;
  role: 'admin' | 'staff';
  department?: string;
  department_id?: string;
  is_active: boolean;
  must_change_password?: boolean;
}

export interface LoginRequest {
  employee_id?: string;
  username?: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: User;
  must_change_password?: boolean;
}

export interface AuthSession {
  token: string;
  user: User;
  expiresAt: number;
}

// Patient Models
export interface Patient {
  id: string;
  id_card_number: string;
  id_card?: string; // Alias for backward compatibility
  hn?: string; // Hospital Number (optional)
  title: string;
  first_name: string;
  last_name: string;
  full_name?: string; // Computed field
  date_of_birth?: string;
  gender?: string;
  phone_number: string;
  phone?: string; // Alias for backward compatibility
  email?: string;
  allergies?: string;
  notes?: string | null;
  chronic_diseases?: string;
  created_at: string;
}

export interface PatientSearchRequest {
  query: string;
  limit?: number;
}

export interface PatientSearchResponse extends Array<Patient> {}

// Appointment Models
export interface Appointment {
  id: string;
  patient_id: string;
  department_id: string;
  doctor_id: string;
  appointment_date: string;
  appointment_time?: string;
  queue_number: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled';
  rescheduled_to_appointment_id?: string | null;
  symptoms?: string;
  notes?: string;
  created_at: string;
  // Nested objects
  patients?: Patient;
  departments?: Department;
  doctors?: Doctor;
  // Computed/alias fields for backward compatibility
  patient_hn?: string;
  patient_name?: string;
  department?: string;
  doctor?: string;
}

export interface CreateAppointmentRequest {
  patient_id: string;
  department_id: string;
  doctor_id: string;
  appointment_date: string;
  appointment_time?: string;
  symptoms?: string;
  notes?: string;
}

export interface UpdateAppointmentRequest {
  appointment_date?: string;
  appointment_time?: string;
  status?: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled';
  symptoms?: string;
  notes?: string;
}

export interface AppointmentListRequest {
  date?: string;
  department_id?: string;
  doctor_id?: string;
  status?: string;
  patient_id?: string;
}

export interface AppointmentListResponse extends Array<Appointment> {}

export interface AppointmentStats {
  total: number;
  today?: number; // Today's appointments
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  no_show: number;
  rescheduled: number;
}

// Department Models
export interface Department {
  id: string;
  name: string;
  location: string;
  phone?: string | null;
  is_active: boolean;
  created_at: string;
  doctors?: Doctor[];
}

// Doctor Models
export interface Doctor {
  id: string;
  name: string;
  specialization: string;
  max_patients_per_day: number;
  department_id: string;
  departments?: Department;
}

// Dashboard Models
export interface DashboardStats {
  totalPatients: number;
  todayAppointments: number;
  pendingAppointments: number;
  completedAppointments: number;
  activeStaff: number;
  activeDepartments: number;
  date: string;
}

// Notification Models
export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  is_read: boolean;
  created_at: string;
}
