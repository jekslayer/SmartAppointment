import { Injectable, signal } from '@angular/core';

export interface DialogConfig {
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'confirm';
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class DialogService {
  private isVisible = signal(false);
  private config = signal<DialogConfig | null>(null);
  private resolveCallback: ((value: boolean) => void) | null = null;

  getVisibility() {
    return this.isVisible;
  }

  getConfig() {
    return this.config;
  }

  alert(message: string, title: string = 'แจ้งเตือน', type: 'info' | 'success' | 'warning' | 'error' = 'info'): Promise<boolean> {
    return this.show({
      title,
      message,
      type,
      confirmText: 'ตกลง'
    });
  }

  success(message: string, title: string = 'สำเร็จ'): Promise<boolean> {
    return this.alert(message, title, 'success');
  }

  error(message: string, title: string = 'เกิดข้อผิดพลาด'): Promise<boolean> {
    return this.alert(message, title, 'error');
  }

  warning(message: string, title: string = 'คำเตือน'): Promise<boolean> {
    return this.alert(message, title, 'warning');
  }

  confirm(message: string, title: string = 'ยืนยัน', confirmText: string = 'ยืนยัน', cancelText: string = 'ยกเลิก'): Promise<boolean> {
    return this.show({
      title,
      message,
      type: 'confirm',
      confirmText,
      cancelText
    });
  }

  private show(config: DialogConfig): Promise<boolean> {
    this.config.set(config);
    this.isVisible.set(true);

    return new Promise((resolve) => {
      this.resolveCallback = resolve;
    });
  }

  close(confirmed: boolean = false) {
    this.isVisible.set(false);
    this.config.set(null);

    if (this.resolveCallback) {
      this.resolveCallback(confirmed);
      this.resolveCallback = null;
    }
  }

  confirmDanger(message: string, title: string = 'ยืนยันการลบ', confirmText: string = 'ลบ', cancelText: string = 'ยกเลิก'): Promise<boolean> {
    return this.show({
      title,
      message,
      type: 'confirm',
      confirmText,
      cancelText,
      destructive: true
    });
  }
}
