import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { DialogService } from '../../core/services/dialog.service';

interface SystemUser {
  id: string;
  employee_id: string;
  full_name: string;
  role: 'staff';
  is_active: boolean;
  created_at: string;
}

@Component({
  selector: 'app-admin-users',
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-users.component.html',
  styleUrls: ['./admin-users.component.css']
})
export class AdminUsersComponent implements OnInit {
  users = signal<SystemUser[]>([]);
  isLoading = signal(false);
  isSaving = signal(false);
  showCreateForm = signal(false);
  resetTarget = signal<SystemUser | null>(null);
  employeeId = signal('');
  fullName = signal('');
  resetPassword = signal('');

  constructor(private api: ApiService, private router: Router, private auth: AuthService, private dialog: DialogService) {}

  ngOnInit() { this.loadUsers(); }

  get activeCount() { return this.users().filter(user => user.is_active).length; }

  async loadUsers() {
    this.isLoading.set(true);
    try { this.users.set(await firstValueFrom(this.api.get<SystemUser[]>('users'))); }
    catch { await this.dialog.error('ไม่สามารถโหลดรายชื่อผู้ใช้ได้'); }
    finally { this.isLoading.set(false); }
  }

  async createUser() {
    if (!this.employeeId().trim() || !this.fullName().trim()) {
      await this.dialog.warning('กรอกรหัสพนักงานและชื่อ-นามสกุลให้ครบถ้วน');
      return;
    }
    this.isSaving.set(true);
    try {
      const user = await firstValueFrom(this.api.post<SystemUser>('users', {
        employee_id: this.employeeId(), full_name: this.fullName()
      }));
      this.users.update(users => [...users, user].sort((a, b) => a.full_name.localeCompare(b.full_name, 'th')));
      this.employeeId.set(''); this.fullName.set(''); this.showCreateForm.set(false);
      await this.dialog.success('เพิ่มบัญชีผู้ใช้เรียบร้อยแล้ว รหัสผ่านเริ่มต้นคือ 123456 และผู้ใช้จะต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก');
    } catch (error: any) {
      await this.dialog.error(error?.error?.error?.message || 'ไม่สามารถเพิ่มบัญชีผู้ใช้ได้');
    } finally { this.isSaving.set(false); }
  }

  async submitResetPassword() {
    const user = this.resetTarget();
    if (!user) return;
    if (this.resetPassword().length < 6) { await this.dialog.warning('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return; }
    this.isSaving.set(true);
    try {
      await firstValueFrom(this.api.post(`users/${user.id}/reset-password`, { new_password: this.resetPassword() }));
      this.resetPassword.set(''); this.resetTarget.set(null);
      await this.dialog.success(`รีเซ็ตรหัสผ่านของ ${user.full_name} แล้ว ผู้ใช้จะต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบ`);
    } catch (error: any) {
      await this.dialog.error(error?.error?.error?.message || 'ไม่สามารถรีเซ็ตรหัสผ่านได้');
    } finally { this.isSaving.set(false); }
  }

  async setUserStatus(user: SystemUser) {
    const action = user.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน';
    if (!await this.dialog.confirm(`ต้องการ${action}บัญชีของ ${user.full_name} ใช่หรือไม่?`, `ยืนยันการ${action}`, action)) return;
    this.isSaving.set(true);
    try {
      const updated = await firstValueFrom(this.api.patch<SystemUser>(`users/${user.id}/status`, { is_active: !user.is_active }));
      this.users.update(users => users.map(item => item.id === user.id ? updated : item));
      await this.dialog.success(`${action}บัญชีเรียบร้อยแล้ว`);
    } catch (error: any) {
      await this.dialog.error(error?.error?.error?.message || `ไม่สามารถ${action}บัญชีได้`);
    } finally { this.isSaving.set(false); }
  }

  navigate(tab: 'overview' | 'capacity' | 'notifications') {
    const routes = { overview: '/admin-dashboard', capacity: '/admin/capacity', notifications: '/admin/notifications' };
    this.router.navigate([routes[tab]]);
  }

  async logout() {
    if (await this.dialog.confirm('ต้องการออกจากระบบหรือไม่?')) this.auth.logout('/admin-login');
  }
}
