import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { DialogService } from '../../core/services/dialog.service';

interface DoctorCapacity {
  id: string;
  name: string;
  departmentName: string;
  maxPatientsPerDay: number;
}

@Component({
  selector: 'app-admin-departments',
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-departments.component.html',
  styleUrls: ['./admin-departments.component.css']
})
export class AdminDepartmentsComponent implements OnInit {
  doctors = signal<DoctorCapacity[]>([]);
  capacities = signal<Record<string, number>>({});
  isLoading = signal(false);
  isSaving = signal(false);

  constructor(
    private router: Router,
    private authService: AuthService,
    private supabaseService: SupabaseService,
    private dialog: DialogService
  ) {}

  ngOnInit() {
    this.loadDoctors();
  }

  async loadDoctors() {
    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabaseService.getClient()
        .from('doctors')
        .select('id, name, max_patients_per_day, departments(name)')
        .eq('is_active', true)
        .order('name', { ascending: true })
        .all();
      if (error) throw error;

      const doctors = (data || []).map((doctor: any) => ({
        id: doctor.id,
        name: doctor.name,
        departmentName: Array.isArray(doctor.departments)
          ? doctor.departments[0]?.name || '-'
          : doctor.departments?.name || '-',
        maxPatientsPerDay: doctor.max_patients_per_day
      }));
      this.doctors.set(doctors);
      this.capacities.set(Object.fromEntries(doctors.map((doctor: DoctorCapacity) => [doctor.id, doctor.maxPatientsPerDay])));
    } catch (error) {
      console.error('Unable to load doctor capacities:', error);
      await this.dialog.error('ไม่สามารถโหลดข้อมูลจำนวนรับนัดของแพทย์ได้');
    } finally {
      this.isLoading.set(false);
    }
  }

  setCapacity(doctorId: string, value: number) {
    this.capacities.update(capacities => ({ ...capacities, [doctorId]: value }));
  }

  async saveCapacity(doctor: DoctorCapacity) {
    const capacity = this.capacities()[doctor.id];
    if (!Number.isInteger(capacity) || capacity < 1) {
      await this.dialog.warning('จำนวนรับนัดต้องเป็นจำนวนเต็มตั้งแต่ 1 คนต่อวัน');
      return;
    }
    if (capacity === doctor.maxPatientsPerDay) return;

    this.isSaving.set(true);
    try {
      const { error } = await this.supabaseService.getClient()
        .from('doctors')
        .update({ max_patients_per_day: capacity })
        .eq('id', doctor.id);
      if (error) throw error;

      this.doctors.update(doctors => doctors.map(item => item.id === doctor.id
        ? { ...item, maxPatientsPerDay: capacity }
        : item));
      await this.dialog.success('บันทึกจำนวนรับนัดเรียบร้อยแล้ว');
    } catch (error) {
      console.error('Unable to save doctor capacity:', error);
      await this.dialog.error('ไม่สามารถบันทึกจำนวนรับนัดได้');
    } finally {
      this.isSaving.set(false);
    }
  }

  navigate(tab: 'overview' | 'notifications' | 'users') {
    const routes = { overview: '/admin-dashboard', notifications: '/admin/notifications', users: '/admin/users' };
    this.router.navigate([routes[tab]]);
  }

  async logout() {
    const confirmed = await this.dialog.confirm('ต้องการออกจากระบบหรือไม่?');
    if (confirmed) this.authService.logout('/admin-login');
  }
}
