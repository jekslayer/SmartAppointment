export interface Patient {
  id: string;
  hn: string;
  full_name: string;
  id_card: string;
  phone: string;
  date_of_birth: string;
  gender: 'male' | 'female' | 'other';
  email?: string;
  line_id?: string;
  allergies?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientSearchRequest {
  query: string;
  limit?: number;
  offset?: number;
}

export interface PatientSearchResponse {
  patients: Patient[];
  total: number;
}
