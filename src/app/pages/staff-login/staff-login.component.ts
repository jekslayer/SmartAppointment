import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationStart, Router } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-staff-login', imports: [CommonModule, FormsModule],
  templateUrl: './staff-login.component.html', styleUrls: ['./staff-login.component.css'],
  host: { class: 'staff-login-component' }
})
export class StaffLoginComponent implements OnInit {
  private destroyRef = inject(DestroyRef);
  employeeId = signal(''); password = signal(''); isLoading = signal(false); error = signal('');
  showPassword = signal(false); showNewPassword = signal(false); showConfirmPassword = signal(false);
  mustChangePassword = signal(false); currentStaff = signal<any>(null); newPassword = signal(''); confirmPassword = signal('');
  constructor(private router: Router, private authService: AuthService, private api: ApiService) {}
  ngOnInit() {
    this.router.events.pipe(
      filter((event): event is NavigationStart => event instanceof NavigationStart),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(event => {
      if (event.navigationTrigger === 'popstate' && this.mustChangePassword()) {
        this.authService.logoutSilently();
        this.mustChangePassword.set(false);
        this.currentStaff.set(null);
        this.password.set('');
        this.newPassword.set('');
        this.confirmPassword.set('');
        queueMicrotask(() => {
          void this.router.navigateByUrl('/staff-login', { replaceUrl: true });
        });
      }
    });

    if (this.authService.isStaff()) {
      if (this.authService.mustChangePassword()) {
        this.currentStaff.set(this.authService.currentUser());
        this.mustChangePassword.set(true);
      } else {
        this.router.navigate(['/dashboard']);
      }
    }
  }
  async handleLogin(event: Event) {
    event.preventDefault(); this.error.set('');
    if (!this.employeeId().trim() || !this.password()) { this.error.set('กรุณากรอกรหัสพนักงานและรหัสผ่าน'); return; }
    this.isLoading.set(true);
    try {
      const response = await firstValueFrom(this.authService.staffLogin(this.employeeId(), this.password()));
      if (response.must_change_password) { this.currentStaff.set(response.user); this.mustChangePassword.set(true); return; }
      await this.router.navigate(['/dashboard']);
    } catch (err: any) {
      console.error('Login error:', err); this.error.set(err?.error?.message || err?.message || 'ไม่สามารถเข้าสู่ระบบได้');
    } finally { this.isLoading.set(false); }
  }
  async handleChangePassword(event: Event) {
    event.preventDefault(); this.error.set('');
    if (this.newPassword().length < 6) { this.error.set('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return; }
    if (this.newPassword() !== this.confirmPassword()) { this.error.set('รหัสผ่านไม่ตรงกัน'); return; }
    this.isLoading.set(true);
    try {
      const staff = this.currentStaff();
      await firstValueFrom(this.api.post<any>('auth/change-password', { employee_id: staff.employee_id, new_password: this.newPassword() }));
      this.authService.markPasswordChanged();
      await this.router.navigate(['/dashboard']);
    } catch (err: any) { this.error.set(err?.error?.message || err?.message || 'ไม่สามารถเปลี่ยนรหัสผ่านได้'); }
    finally { this.isLoading.set(false); }
  }
  navigateToAdminLogin() { this.router.navigate(['/admin-login']); }
}
