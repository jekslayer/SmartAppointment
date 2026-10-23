import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { environment } from '../../../environments/environment';

interface LiffSdk {
  init(config: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  isInClient(): boolean;
  login(options?: { redirectUri?: string }): void;
  getIDToken(): string | null;
  closeWindow(): void;
}

declare global {
  interface Window { liff?: LiffSdk; }
}

@Component({
  selector: 'app-line-link',
  imports: [FormsModule],
  templateUrl: './line-link.component.html',
  styleUrl: './line-link.component.css'
})
export class LineLinkComponent implements OnInit, OnDestroy {
  idCardLast4 = '';
  dateOfBirth = '';
  readonly ready = signal(false);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly success = signal(false);
  readonly checkInMode = signal(false);
  readonly alreadyCheckedIn = signal(false);
  readonly checkedInSlot = signal('');
  readonly remainingToday = signal<string[]>([]);
  readonly error = signal('');
  readonly countdown = signal(0);
  readonly closeUnavailable = signal(false);
  private countdownTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly api: ApiService) {}

  ngOnDestroy() { clearInterval(this.countdownTimer); }

  async ngOnInit() {
    if (!environment.liffId) {
      this.error.set('ระบบเชื่อม LINE ยังไม่ได้ตั้งค่า LIFF ID');
      this.loading.set(false);
      return;
    }
    if (!window.liff) {
      this.error.set('ไม่สามารถโหลด LINE LIFF ได้ กรุณาลองใหม่อีกครั้ง');
      this.loading.set(false);
      return;
    }
    try {
      await window.liff.init({ liffId: environment.liffId });
      if (!window.liff.isLoggedIn()) {
        window.liff.login({ redirectUri: window.location.href });
        return;
      }
      if (new URLSearchParams(window.location.search).get('mode') === 'checkin') {
        this.checkInMode.set(true);
        await this.checkIn();
        return;
      }
      this.ready.set(true);
    } catch (error) {
      this.error.set(this.getCheckInErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private async checkIn() {
    const idToken = window.liff?.getIDToken();
    if (!idToken) throw new Error('ไม่พบข้อมูลยืนยันตัวตนจาก LINE');
    const result = await firstValueFrom(this.api.post<{ alreadyCheckedIn?: boolean; appointment?: { department: string; appointment_time: string; appointment_end_time?: string | null }; remaining?: Array<{ department: string; appointment_time: string; appointment_end_time?: string | null }> }>('line/check-in', { id_token: idToken }));
    this.alreadyCheckedIn.set(Boolean(result.alreadyCheckedIn));
    this.checkedInSlot.set(result.appointment ? this.formatSlot(result.appointment) : '');
    this.remainingToday.set((result.remaining || []).map(slot => this.formatSlot(slot)));
    this.success.set(true);
    // Leave more time to read when other appointments remain today.
    if (window.liff?.isInClient()) setTimeout(() => (window.liff as any).closeWindow(), this.remainingToday().length ? 8000 : 2500);
  }

  private formatSlot(slot: { department: string; appointment_time: string; appointment_end_time?: string | null }) {
    const time = slot.appointment_end_time ? `${slot.appointment_time.slice(0, 5)} - ${slot.appointment_end_time.slice(0, 5)}` : slot.appointment_time.slice(0, 5);
    return `แผนก${slot.department} เวลา ${time} น.`;
  }

  private getCheckInErrorMessage(error: unknown) {
    const httpError = error as {
      status?: number;
      error?: { error?: { message?: string; statusCode?: number } };
    };
    const status = httpError?.status || httpError?.error?.error?.statusCode;

    switch (status) {
      case 401:
        return 'ยืนยันบัญชี LINE ไม่ผ่าน (401) กรุณาตรวจ LINE_LIFF_CHANNEL_ID บน Vercel';
      case 403:
        return 'บัญชี LINE นี้ยังไม่ผูกกับข้อมูลผู้ป่วย (403)';
      case 404:
        return 'ไม่พบนัดที่เช็กอินได้ในวันนี้ (404)';
      case 409:
        return 'พบข้อมูลนัดหมายขัดแย้ง กรุณาติดต่อเจ้าหน้าที่ (409)';
      case 429:
        return 'ลองเช็กอินหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่ (429)';
      case 503:
        return 'ระบบตรวจสอบบัญชี LINE บนเซิร์ฟเวอร์ยังตั้งค่าไม่ครบ (503)';
    }

    const apiMessage = httpError?.error?.error?.message;
    if (apiMessage) return `${apiMessage}${status ? ` (${status})` : ''}`;
    if (error instanceof Error) return error.message;
    return 'เช็กอินไม่สำเร็จ กรุณาลองใหม่หรือติดต่อเจ้าหน้าที่';
  }

  /** Closes the LIFF window inside the LINE app. Outside LINE it cannot be closed from script. */
  closePage() {
    clearInterval(this.countdownTimer);
    this.countdown.set(0);
    if (window.liff?.isInClient()) window.liff.closeWindow();
    else window.close();
    // If the page is still here a moment later, tell the patient to close it themselves.
    setTimeout(() => this.closeUnavailable.set(true), 800);
  }

  private startAutoClose(seconds: number) {
    this.countdown.set(seconds);
    this.countdownTimer = setInterval(() => {
      const remaining = this.countdown() - 1;
      this.countdown.set(Math.max(remaining, 0));
      if (remaining <= 0) this.closePage();
    }, 1000);
  }

  async linkPatient() {
    const idToken = window.liff?.getIDToken();
    if (!idToken) {
      this.error.set('ไม่พบข้อมูลยืนยันตัวตนจาก LINE กรุณาเปิดหน้านี้จากแอป LINE');
      return;
    }
    this.error.set('');
    this.submitting.set(true);
    try {
      await firstValueFrom(this.api.post('line/link/verify', {
        id_card_last4: this.idCardLast4.trim(),
        date_of_birth: this.dateOfBirth,
        id_token: idToken
      }));
      this.success.set(true);
      if (window.liff?.isInClient()) this.startAutoClose(3);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'ไม่สามารถเชื่อมบัญชีได้');
    } finally {
      this.submitting.set(false);
    }
  }
}
