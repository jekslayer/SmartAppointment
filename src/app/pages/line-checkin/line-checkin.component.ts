import { Component, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-line-checkin',
  templateUrl: './line-checkin.component.html',
  styleUrl: './line-checkin.component.css'
})
export class LineCheckInComponent implements OnInit {
  loading = signal(true);
  success = signal(false);
  alreadyCheckedIn = signal(false);
  error = signal('');

  constructor(private readonly api: ApiService) {}

  async ngOnInit() {
    if (!environment.liffId || !window.liff) {
      this.error.set('ไม่สามารถเปิดระบบเช็กอินได้ กรุณาเปิด QR นี้ผ่าน LINE');
      this.loading.set(false);
      return;
    }
    try {
      await window.liff.init({ liffId: environment.liffId });
      if (!window.liff.isLoggedIn()) {
        window.liff.login({ redirectUri: window.location.href });
        return;
      }
      const idToken = window.liff.getIDToken();
      if (!idToken) throw new Error('ไม่พบข้อมูลยืนยันตัวตนจาก LINE');
      const result = await firstValueFrom(this.api.post<{ checkedIn: boolean; alreadyCheckedIn?: boolean }>('line/check-in', { id_token: idToken }));
      this.alreadyCheckedIn.set(Boolean(result.alreadyCheckedIn));
      this.success.set(true);
    } catch (error) {
      const apiMessage = (error as { error?: { error?: { message?: string } } })?.error?.error?.message;
      this.error.set(apiMessage || (error instanceof Error ? error.message : 'เช็กอินไม่สำเร็จ กรุณาติดต่อเจ้าหน้าที่'));
    } finally {
      this.loading.set(false);
    }
  }

  close() { if (window.liff?.isInClient()) (window.liff as any).closeWindow(); }
}
