import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService, SupabaseService } from '../../core/services';
import { DialogService } from '../../core/services/dialog.service';
import { Department, Doctor, Patient } from '../../core/models';

type AppointmentDepartment = Pick<Department, 'id' | 'name'>;
type AppointmentDoctor = Pick<Doctor, 'id' | 'name' | 'department_id' | 'max_patients_per_day'>;

/** Returns a calendar date in the local timezone, not UTC. */
function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@Component({
  selector: 'app-new-appointment',
  imports: [CommonModule, FormsModule],
  templateUrl: './new-appointment.component.html',
  styleUrls: ['./new-appointment.component.css'],
  host: {
    class: 'new-appointment-component'
  }
})
export class NewAppointmentComponent implements OnInit {
  // Current step
  currentStep = signal(1);
  
  // Search
  searchQuery = signal('');
  isSearching = signal(false);
  searchResults = signal<Patient[]>([]);
  
  // Selected patient
  selectedPatient = signal<Patient | null>(null);
  historyPatient = signal<Patient | null>(null);
  isHistoryLoading = signal(false);
  isEditingHistory = signal(false);
  historyForm = signal({ allergies: '', notes: '' });
  
  // Appointment data
  appointmentData = signal({
    department: '',
    doctor_id: '',
    doctor: '',
    custom_doctor: '',
    appointment_date: '',
    appointment_time: '',
    room: '',
    purpose: '',
    notes: ''
  });

  // Time slots
  timeSlots = [
    '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', 
    '11:00', '11:30', '13:00', '13:30', '14:00', '14:30', 
    '15:00', '15:30', '16:00'
  ];

  // Appointment reference data
  departments = signal<AppointmentDepartment[]>([]);
  doctors = signal<AppointmentDoctor[]>([]);
  doctorAppointmentCount = signal(0);
  isLoadingDoctors = signal(false);
  private capacityRequestId = 0;
  private rescheduleFromAppointmentId: string | null = null;

  selectedDepartment = computed(() =>
    this.departments().find(department => department.name === this.appointmentData().department) || null
  );
  filteredDoctors = computed(() => {
    const departmentId = this.selectedDepartment()?.id;
    return departmentId ? this.doctors().filter(doctor => doctor.department_id === departmentId) : [];
  });
  selectedDoctor = computed(() =>
    this.filteredDoctors().find(doctor => doctor.id === this.appointmentData().doctor_id) || null
  );
  isGeneralDepartment = computed(() => this.appointmentData().department === 'โรคทั่วไป');
  remainingDoctorCapacity = computed(() => {
    const doctor = this.selectedDoctor();
    return doctor ? Math.max(doctor.max_patients_per_day - this.doctorAppointmentCount(), 0) : 0;
  });

  // Minimum selectable date (today) - prevents backdated appointments
  minDate = computed(() => toLocalDateString(new Date()));

  // Services
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private supabaseService = inject(SupabaseService);
  private dialog = inject(DialogService);

  ngOnInit() {
    // Check authentication
    if (!this.authService.isStaff()) {
      this.router.navigate(['/staff-login']);
      return;
    }
    void this.loadAppointmentReferenceData();
    const patientId = this.route.snapshot.queryParamMap.get('reschedule_patient_id');
    this.rescheduleFromAppointmentId = this.route.snapshot.queryParamMap.get('reschedule_from_appointment_id');
    if (patientId) void this.selectRescheduledPatient(patientId);
  }

  private async selectRescheduledPatient(patientId: string) {
    try {
      const result = await this.supabaseService.getClient().from('patients')
        .select('id, hn, full_name, id_card, date_of_birth, phone, allergies, notes')
        .eq('id', patientId)
        .single();
      const patient = result.data as Patient | null;
      if (!patient) throw new Error('Patient not found');
      this.selectedPatient.set(patient);
      this.currentStep.set(2);
    } catch (error) {
      console.error('Unable to load rescheduled patient:', error);
      await this.dialog.error('ไม่สามารถเปิดข้อมูลผู้ป่วยสำหรับออกใบนัดใหม่ได้');
      this.router.navigate(['/dashboard']);
    }
  }

  onDepartmentChange(value: string) {
    this.appointmentData.update(data => ({
      ...data,
      department: value,
      doctor_id: '',
      doctor: '',
      custom_doctor: ''
    }));
    this.doctorAppointmentCount.set(0);
  }

  onDoctorChange(value: string) {
    const doctor = this.filteredDoctors().find(item => item.id === value);
    this.appointmentData.update(data => ({
      ...data,
      doctor_id: value,
      doctor: doctor?.name || ''
    }));
    void this.loadDoctorAppointmentCount();
  }

  onCustomDoctorChange(value: string) {
    this.appointmentData.update(data => ({
      ...data,
      doctor_id: '',
      custom_doctor: value
    }));
  }

  onDateChange(value: string) {
    this.appointmentData.update(data => ({
      ...data,
      appointment_date: value
    }));
    void this.loadDoctorAppointmentCount();
  }

  onTimeChange(value: string) {
    this.appointmentData.update(data => ({
      ...data,
      appointment_time: value
    }));
  }

  onRoomChange(value: string) {
    this.appointmentData.update(data => ({
      ...data,
      room: value
    }));
  }

  onPurposeChange(value: string) {
    this.appointmentData.update(data => ({
      ...data,
      purpose: value
    }));
  }

  onNotesChange(value: string) {
    this.appointmentData.update(data => ({
      ...data,
      notes: value
    }));
  }

  private async loadAppointmentReferenceData() {
    this.isLoadingDoctors.set(true);
    try {
      const client = this.supabaseService.getClient();
      const [departmentsResult, doctorsResult] = await Promise.all([
        client.from('departments').select('id, name').eq('is_active', true).order('name'),
        client.from('doctors').select('id, name, department_id, max_patients_per_day').eq('is_active', true).order('name')
      ]);
      const departments = (departmentsResult.data || []) as AppointmentDepartment[];
      this.departments.set(departments.sort((first, second) => {
        if (first.name === 'โรคทั่วไป') return -1;
        if (second.name === 'โรคทั่วไป') return 1;
        return first.name.localeCompare(second.name, 'th');
      }));
      this.doctors.set(doctorsResult.data || []);
    } catch (error) {
      console.error('Error loading appointment reference data:', error);
      await this.dialog.error('ไม่สามารถโหลดรายชื่อแผนกและแพทย์ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      this.isLoadingDoctors.set(false);
    }
  }

  private async loadDoctorAppointmentCount() {
    const data = this.appointmentData();
    if (!data.doctor || !data.appointment_date) {
      this.doctorAppointmentCount.set(0);
      return;
    }

    const requestId = ++this.capacityRequestId;
    try {
      const result = await this.supabaseService.getClient()
        .from('appointments')
        .select('id', { count: 'exact' })
        // Keep this read compatible with the existing appointment history.
        // doctor_id is still written and enforced by the create endpoint.
        .eq('doctor', data.doctor)
        .eq('department', data.department)
        .eq('appointment_date', data.appointment_date)
        .neq('status', 'cancelled')
        .neq('status', 'rescheduled');
      if (requestId === this.capacityRequestId) {
        this.doctorAppointmentCount.set(result.count || 0);
      }
    } catch (error) {
      console.error('Error loading doctor appointment capacity:', error);
      if (requestId === this.capacityRequestId) this.doctorAppointmentCount.set(0);
    }
  }

  async onSearch() {
    const query = this.searchQuery().trim();
    if (query.length < 2) {
      this.searchResults.set([]);
      return;
    }

    this.isSearching.set(true);
    
    try {
      // Use Supabase service directly for search
      const results = await this.supabaseService.searchPatients(query, 10);
      this.searchResults.set(results || []);
    } catch (error) {
      console.error('Error searching patients:', error);
      this.searchResults.set([]);
    } finally {
      this.isSearching.set(false);
    }
  }

  selectPatient(patient: Patient) {
    this.selectedPatient.set(patient);
    this.currentStep.set(2);
  }

  async viewPatientHistory(patient: Patient, event: Event) {
    event.stopPropagation();
    this.historyPatient.set(patient);
    this.isEditingHistory.set(false);
    this.isHistoryLoading.set(true);
    try {
      const result = await this.supabaseService.getClient()
        .from('patients')
        .select('id, hn, full_name, id_card, date_of_birth, phone, allergies, notes')
        .eq('id', patient.id)
        .single();
      const record = result.data as Patient | null;
      if (record) {
        this.historyPatient.set(record);
        this.historyForm.set({ allergies: record.allergies || '', notes: record.notes || '' });
      }
    } catch (error) {
      console.error('Error loading patient history:', error);
      await this.dialog.error('ไม่สามารถโหลดประวัติผู้ป่วยได้ กรุณาลองใหม่อีกครั้ง');
      this.closePatientHistory();
    } finally {
      this.isHistoryLoading.set(false);
    }
  }

  closePatientHistory() {
    this.historyPatient.set(null);
    this.isEditingHistory.set(false);
  }

  startEditingHistory() {
    const patient = this.historyPatient();
    if (!patient) return;
    this.historyForm.set({ allergies: patient.allergies || '', notes: patient.notes || '' });
    this.isEditingHistory.set(true);
  }

  async savePatientHistory() {
    const patient = this.historyPatient();
    if (!patient) return;
    try {
      const values = this.historyForm();
      const result = await this.supabaseService.getClient()
        .from('patients')
        .update({ allergies: values.allergies.trim() || null, notes: values.notes.trim() || null })
        .eq('id', patient.id)
        .single();
      const updated = result.data as Patient;
      this.historyPatient.set(updated);
      this.historyForm.set({ allergies: updated.allergies || '', notes: updated.notes || '' });
      this.searchResults.update(items => items.map(item => item.id === updated.id ? { ...item, ...updated } : item));
      this.isEditingHistory.set(false);
    } catch (error) {
      console.error('Error updating patient history:', error);
      await this.dialog.error('ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
    }
  }

  goBack() {
    if (this.currentStep() === 1) {
      this.router.navigate(['/dashboard']);
    } else {
      this.currentStep.update(step => step - 1);
      if (this.currentStep() === 1) {
        this.selectedPatient.set(null);
      }
    }
  }

  async nextStep() {
    if (this.currentStep() === 2) {
      // Validate form
      const data = this.appointmentData();
      if (!data.department || !data.appointment_date || !data.appointment_time ||
          !data.room || !data.purpose) {
        await this.dialog.warning('กรุณากรอกข้อมูลให้ครบถ้วน');
        return;
      }

      // Prevent backdated appointments
      if (data.appointment_date < this.minDate()) {
        await this.dialog.warning('ไม่สามารถออกใบนัดย้อนหลังได้ กรุณาเลือกวันที่ปัจจุบันหรือวันถัดไป');
        return;
      }

      if (this.isGeneralDepartment() && !data.custom_doctor.trim()) {
        await this.dialog.warning('กรุณากรอกชื่อแพทย์');
        return;
      }

      if (!this.isGeneralDepartment() && !data.doctor) {
        await this.dialog.warning('กรุณาเลือกแพทย์');
        return;
      }

      if (!this.isGeneralDepartment() && this.remainingDoctorCapacity() <= 0) {
        await this.dialog.warning('แพทย์ที่เลือกมีคิวเต็มแล้ว กรุณาเลือกแพทย์หรือวันนัดอื่น');
        return;
      }
      
      this.currentStep.set(3);
    }
  }

  async saveAppointment() {
    try {
      const patient = this.selectedPatient();
      const data = this.appointmentData();
      
      if (!patient) {
        await this.dialog.warning('กรุณาเลือกผู้ป่วย');
        return;
      }

      if (data.appointment_date < this.minDate()) {
        await this.dialog.warning('ไม่สามารถออกใบนัดย้อนหลังได้ กรุณาเลือกวันที่ปัจจุบันหรือวันถัดไป');
        return;
      }

      // Prepare appointment data
      const appointmentData = {
        patient_id: patient.id,
        appointment_date: data.appointment_date,
        appointment_time: data.appointment_time,
        department: data.department,
        doctor_id: this.isGeneralDepartment() ? null : data.doctor_id || null,
        doctor: this.getDoctorName(),
        room: data.room,
        purpose: data.purpose,
        notes: data.notes,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(this.rescheduleFromAppointmentId ? { reschedule_from_appointment_id: this.rescheduleFromAppointmentId } : {})
      };

      const existingAppointments = await this.supabaseService.getClient()
        .from('appointments')
        .select('id')
        .eq('doctor', appointmentData.doctor)
        .eq('appointment_date', appointmentData.appointment_date)
        .eq('appointment_time', appointmentData.appointment_time)
        .neq('status', 'cancelled')
        .neq('status', 'rescheduled');

      if (existingAppointments.data?.length) {
        await this.showDuplicateAppointmentDialog(appointmentData);
        return;
      }

      // The backend saves first, then sends LINE without losing the appointment if delivery fails.
      const result = await this.supabaseService.createAppointmentAndNotify(appointmentData);
      const notification = result.notification as { sent?: boolean; reason?: string } | undefined;
      if (notification?.sent) {
        await this.dialog.success('บันทึกใบนัดและส่งข้อความ LINE สำเร็จ');
      } else if (notification?.reason === 'patient_not_linked') {
        await this.dialog.warning('บันทึกใบนัดสำเร็จ แต่ยังไม่ได้ส่ง LINE เนื่องจากผู้ป่วยยังไม่ผูกบัญชี LINE');
      } else if (notification?.reason === 'line_not_configured') {
        await this.dialog.warning('บันทึกใบนัดสำเร็จ แต่ระบบ LINE ยังไม่ได้ตั้งค่า');
      } else {
        await this.dialog.warning('บันทึกใบนัดสำเร็จ แต่ส่งข้อความ LINE ไม่สำเร็จ กรุณาตรวจสอบสถานะการส่ง');
      }
      
      // Navigate back to dashboard
      this.router.navigate(['/dashboard']);
    } catch (error) {
      console.error('Error saving appointment:', error);
      const apiError = error as { status?: number; message?: string; error?: { message?: string; details?: string; error?: { message?: string; statusCode?: number } } };
      const errorMessage = [apiError.error?.message, apiError.error?.error?.message, apiError.error?.details, apiError.message]
        .filter((message): message is string => typeof message === 'string')
        .join(' ');
      if (/rescheduled appointment must be on a different date|same day.*reschedul|reschedul.*same day/i.test(errorMessage)) {
        await this.dialog.warning('ไม่สามารถเลื่อนนัดเป็นวันเดิมได้ กรุณาเลือกวันที่นัดใหม่');
        return;
      }
      if (/patient already has an active appointment/i.test(errorMessage)) {
        await this.dialog.warning(
          'ผู้ป่วยรายนี้มีใบนัดที่ยังรอเข้ารับบริการอยู่ กรุณาให้มาตามนัดหรือเลื่อนใบนัดเดิมให้เรียบร้อยก่อนออกใบนัดใหม่',
          'ผู้ป่วยมีใบนัดค้างอยู่'
        );
        return;
      }
      if (/doctor daily capacity reached/i.test(errorMessage)) {
        await this.dialog.warning('แพทย์ที่เลือกมีคิวเต็มแล้ว กรุณาเลือกแพทย์หรือวันนัดอื่น');
        return;
      }
      const isDuplicateAppointment = apiError.status === 409
        || apiError.error?.error?.statusCode === 409
        || /duplicate|unique|ซ้ำ|ถูกจองแล้ว/i.test(errorMessage);

      if (isDuplicateAppointment) {
        await this.showDuplicateAppointmentDialog({
          ...this.appointmentData(),
          doctor: this.getDoctorName()
        });
        return;
      }

      await this.dialog.error('เกิดข้อผิดพลาดในการบันทึกใบนัด กรุณาลองใหม่อีกครั้ง');
    }
  }

  private async showDuplicateAppointmentDialog(appointment: { appointment_date: string; appointment_time: string; doctor: string }) {
    await this.dialog.warning(
      `แพทย์ ${appointment.doctor} มีผู้ป่วยจองคิวแล้ว\nวันนัด: ${appointment.appointment_date}\nเวลานัด: ${appointment.appointment_time} น.\n\nกรุณาเลือกวันหรือเวลาใหม่ก่อนออกใบนัด`,
      'เวลานัดนี้ถูกจองแล้ว'
    );
  }

  getInitials(name?: string | null): string {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return parts[0].charAt(0) + parts[1].charAt(0);
    }
    return name.charAt(0);
  }

  getDoctorName(): string {
    return this.isGeneralDepartment()
      ? this.appointmentData().custom_doctor.trim()
      : this.appointmentData().doctor;
  }
}
