import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';

const APPOINTMENT_MESSAGE = `ใบนัดพบแพทย์

สวัสดีค่ะ คุณ {{patient_name}}

ท่านมีนัดพบแพทย์ดังนี้:
วันที่: {{appointment_date}}
เวลา: {{appointment_time}}
แผนก: {{department}}
แพทย์: {{doctor_name}}

กรุณามาก่อนเวลานัด 30 นาที`;

const REMINDER_MESSAGE = `แจ้งเตือนนัดพบแพทย์

สวัสดีค่ะ คุณ {{patient_name}}

เตือนความจำ: ท่านมีนัดพบแพทย์
วันที่: {{appointment_date}}
เวลา: {{appointment_time}}
แผนก: {{department}}
แพทย์: {{doctor_name}}

กรุณาเตรียมตัวและมาก่อนเวลานัด 30 นาที
หากไม่สะดวกมาตามนัด กรุณาติดต่อโรงพยาบาลล่วงหน้า`;

@Component({
  selector: 'app-admin-notifications',
  imports: [FormsModule],
  templateUrl: './admin-notifications.component.html',
  styleUrls: ['./admin-notifications.component.css']
})
export class AdminNotificationsComponent implements OnInit {
  activeTab = signal('notifications');
  appointmentMessage = signal(APPOINTMENT_MESSAGE);
  reminderMessage = signal(REMINDER_MESSAGE);
  reminderDays = signal(1);
  isSaving = signal(false);
  saveMessage = signal('');

  constructor(
    private router: Router,
    private authService: AuthService,
    private supabaseService: SupabaseService
  ) {}

  async ngOnInit() {
    try {
      const { data, error } = await this.supabaseService.getClient()
        .from('line_messages')
        .select('message_key, message_text');

      if (error) throw error;

      const messages = new Map<string, string>(
        (data || []).map((item: any) => [item.message_key, item.message_text] as [string, string])
      );
      this.appointmentMessage.set(messages.get('appointment_created') || APPOINTMENT_MESSAGE);
      this.reminderMessage.set(messages.get('appointment_reminder') || REMINDER_MESSAGE);
      const savedDays = Number(messages.get('appointment_reminder_days'));
      if (Number.isInteger(savedDays) && savedDays >= 0 && savedDays <= 365) {
        this.reminderDays.set(savedDays);
      }
    } catch (error) {
      console.error('Unable to load notification templates:', error);
    }
  }

  async saveSettings() {
    const days = Number(this.reminderDays());
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      this.saveMessage.set('กรุณาระบุจำนวนวันตั้งแต่ 0 ถึง 365 วัน');
      return;
    }

    this.isSaving.set(true);
    this.saveMessage.set('');

    try {
      const client = this.supabaseService.getClient();
      const { data: currentRows, error: loadError } = await client
        .from('line_messages')
        .select('id, message_key')
        .order('created_at', { ascending: true });
      if (loadError) throw loadError;

      const managedKeys = new Set([
        'appointment_created',
        'appointment_reminder',
        'appointment_reminder_days'
      ]);
      const rowsByKey = new Map<string, any[]>();
      for (const row of currentRows || []) {
        if (!managedKeys.has(row.message_key)) continue;
        const rows = rowsByKey.get(row.message_key) || [];
        rows.push(row);
        rowsByKey.set(row.message_key, rows);
      }

      const duplicateRows = [...rowsByKey.values()].flatMap(rows => rows.slice(1));
      const deleteResults = await Promise.all(
        duplicateRows.map(row => client.from('line_messages').delete().eq('id', row.id))
      );
      const deleteError = deleteResults.find((result: any) => result.error)?.error;
      if (deleteError) throw deleteError;

      const existingKeys = new Set<string>(rowsByKey.keys());
      const updatedAt = new Date().toISOString();
      const templates = [
        {
          message_key: 'appointment_created',
          message_text: this.appointmentMessage().trim(),
          description: 'ข้อความที่ส่งให้ผู้ป่วยเมื่อสร้างใบนัด',
          is_active: true,
          updated_at: updatedAt
        },
        {
          message_key: 'appointment_reminder',
          message_text: this.reminderMessage().trim(),
          description: 'ข้อความแจ้งเตือนที่ส่งก่อนถึงวันนัด',
          is_active: true,
          updated_at: updatedAt
        },
        {
          message_key: 'appointment_reminder_days',
          message_text: String(days),
          description: 'จำนวนวันสำหรับแจ้งเตือนก่อนวันนัด',
          is_active: true,
          updated_at: updatedAt
        }
      ];

      const results = await Promise.all(templates.map(template => {
        if (existingKeys.has(template.message_key)) {
          return client.from('line_messages').update(template).eq('message_key', template.message_key);
        }
        return client.from('line_messages').insert(template);
      }));
      const saveError = results.find((result: any) => result.error)?.error;
      if (saveError) throw saveError;

      this.saveMessage.set('บันทึกการตั้งค่าเรียบร้อยแล้ว');
    } catch (error) {
      console.error('Unable to save notification templates:', error);
      this.saveMessage.set('ไม่สามารถบันทึกการตั้งค่าได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      this.isSaving.set(false);
    }
  }

  setActiveTab(tab: string) {
    const routes: Record<string, string> = {
      overview: '/admin-dashboard',
      capacity: '/admin/capacity',
      users: '/admin/users'
    };

    if (routes[tab]) {
      this.router.navigate([routes[tab]]);
      return;
    }
    this.activeTab.set(tab);
  }

  logout() {
    if (confirm('คุณต้องการออกจากระบบหรือไม่?')) {
      this.authService.logout('/admin-login');
    }
  }
}
