import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-admin-login', imports: [CommonModule, FormsModule],
  templateUrl: './admin-login.component.html', styleUrls: ['./admin-login.component.css'],
  host: { class: 'admin-login-component' }
})
export class AdminLoginComponent implements OnInit {
  username = signal(''); password = signal(''); showPassword = signal(false); isLoading = signal(false); error = signal('');
  constructor(private router: Router, private authService: AuthService) {}
  ngOnInit() {
    if (this.authService.isAdmin()) this.router.navigate(['/admin-dashboard']);
  }
  async handleLogin(event: Event) {
    event.preventDefault(); this.error.set('');
    if (!this.username().trim() || !this.password()) { this.error.set('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'); return; }
    this.isLoading.set(true);
    try {
      await firstValueFrom(this.authService.adminLogin(this.username(), this.password()));
      await this.router.navigate(['/admin-dashboard']);
    } catch (err: any) {
      console.error('Admin login error:', err);
      this.error.set(err?.error?.message || err?.message || 'ไม่สามารถเข้าสู่ระบบได้');
    } finally { this.isLoading.set(false); }
  }
  navigateToStaffLogin() { this.router.navigate(['/staff-login']); }
}
