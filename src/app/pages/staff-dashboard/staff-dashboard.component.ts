import { Component, OnDestroy, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { Appointment, AppointmentStats } from '../../core/models';
import QRCode from 'qrcode';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-staff-dashboard',
  imports: [CommonModule, FormsModule],
  templateUrl: './staff-dashboard.component.html',
  styleUrls: ['./staff-dashboard.component.css'],
  host: {
    class: 'staff-dashboard-component'
  }
})
export class StaffDashboardComponent implements OnInit, OnDestroy {
  private readonly refreshIntervalMs = 5_000;
  private refreshTimer?: ReturnType<typeof setInterval>;
  // User session
  currentUser = computed(() => this.authService.currentUser());

  // Date selection
  selectedDate = signal(new Date());
  dateInputValue = signal('');

  // Appointments
  appointments = signal<Appointment[]>([]);
  filteredAppointments = computed(() => {
    const selected = this.selectedDate();
    const filter = this.filterStatus();
    const search = this.searchQuery().toLowerCase();

    let filtered = this.appointments().filter(apt => {
      const aptDate = new Date(apt.appointment_date);
      return aptDate.toDateString() === selected.toDateString();
    });

    if (filter !== 'all') {
      filtered = filtered.filter(apt => apt.status === filter);
    }

    if (search) {
      filtered = filtered.filter(apt =>
        (apt.patient_hn ?? '').toLowerCase().includes(search) ||
        (apt.patient_name ?? '').toLowerCase().includes(search) ||
        (apt.department ?? '').toLowerCase().includes(search)
      );
    }

    return filtered;
  });

  // Filters
  filterStatus = signal<string>('all');
  searchQuery = signal('');
  showCheckInQr = signal(false);
  checkInQr = signal('');

  // Stats
  stats = signal<AppointmentStats>({
    total: 0,
    today: 0,
    confirmed: 0,
    pending: 0,
    completed: 0,
    cancelled: 0,
    no_show: 0,
    rescheduled: 0
  });

  constructor(
    private router: Router,
    private authService: AuthService,
    private supabaseService: SupabaseService
  ) { }

  ngOnInit() {
    // Set initial date
    this.updateDateInput();

    // Load data
    this.loadAppointments();
    this.refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible') this.refreshData();
    }, this.refreshIntervalMs);
  }

  ngOnDestroy() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  updateDateInput() {
    this.dateInputValue.set(this.toLocalDateString(this.selectedDate()));
  }

  onDateChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const [year, month, day] = input.value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    this.selectedDate.set(date);
    this.updateDateInput();
    this.loadAppointments();
  }

  setFilter(status: string) {
    this.filterStatus.set(status);
  }

  onSearch(event: Event) {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  refreshData() {
    this.loadAppointments();
  }

  navigateToNewAppointment() {
    this.router.navigate(['/staff/new-appointment']);
  }

  async openCheckInQr() {
    const url = `https://liff.line.me/${environment.liffId}/?mode=checkin`;
    this.checkInQr.set(await QRCode.toDataURL(url, { width: 320, margin: 2, errorCorrectionLevel: 'M' }));
    this.showCheckInQr.set(true);
  }

  startRescheduledAppointment(appointment: Appointment) {
    this.router.navigate(['/staff/new-appointment'], {
      queryParams: {
        reschedule_patient_id: appointment.patient_id,
        reschedule_from_appointment_id: appointment.id
      }
    });
  }

  logout() {
    if (confirm('คุณต้องการออกจากระบบหรือไม่?')) {
      this.authService.logout();
    }
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'รอยืนยัน',
      confirmed: 'ยืนยันแล้ว',
      completed: 'เสร็จสิ้น',
      cancelled: 'ยกเลิก',
      no_show: 'ไม่มาตามนัด',
      rescheduled: 'ขอเลื่อนนัด'
    };
    return labels[status] || status;
  }

  getStatusClass(status: string): string {
    return `status-badge status-${status}`;
  }

  private async loadAppointments() {
    const dateStr = this.toLocalDateString(this.selectedDate());

    try {
      const client = this.supabaseService.getClient();

      const { data, error } = await client
        .from('appointments')
        .select(`
          *,
          patients!inner (
            hn,
            full_name
          )
        `)
        .eq('appointment_date', dateStr)
        .order('appointment_time', { ascending: true })
        .all();

      if (error) {
        console.error('Error loading appointments:', error);
        this.appointments.set([]);
        this.setStats([]);
        return;
      }

      // Transform data to match Appointment model
      const transformed = (data || []).map((apt: any) => ({
        ...apt,
        patient_hn: apt.patients?.hn || '',
        patient_name: apt.patients?.full_name || '',
        patient_id: apt.patient_id
      }));

      this.appointments.set(transformed);
      this.setStats(transformed);
    } catch (error) {
      console.error('Error loading appointments:', error);
      this.appointments.set([]);
      this.setStats([]);
    }
  }

  private setStats(appointments: Array<{ status: string }>) {
    const counts: AppointmentStats = {
      total: appointments.length,
      today: appointments.length,
      confirmed: 0,
      pending: 0,
      completed: 0,
      cancelled: 0,
      no_show: 0,
      rescheduled: 0
    };
    for (const appointment of appointments) {
      if (appointment.status in counts && appointment.status !== 'total' && appointment.status !== 'today') {
        counts[appointment.status as keyof Omit<AppointmentStats, 'total' | 'today'>]++;
      }
    }
    this.stats.set(counts);
  }

  /** Calendar date in staff's local timezone; never convert it through UTC. */
  private toLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
