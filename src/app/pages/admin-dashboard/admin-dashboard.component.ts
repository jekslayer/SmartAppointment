import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';

interface AdminStats {
  todayAppointments: number;
  totalDepartments: number;
}

interface DepartmentStat {
  name: string;
  count: number;
  percentage: number;
}

interface DailyChartData {
  date: string;
  count: number;
}

interface StatusStat {
  label: string;
  count: number;
  percentage: number;
  color: string;
}

@Component({
  selector: 'app-admin-dashboard',
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css']
})
export class AdminDashboardComponent implements OnInit {
  private dataLoadVersion = 0;
  currentUser = computed(() => this.authService.currentUser());
  
  selectedDate = signal(new Date());
  dateInputValue = signal('');
  
  activeTab = signal<string>('overview');
  
  stats = signal<AdminStats>({
    todayAppointments: 0,
    totalDepartments: 7
  });
  
  departmentStats = signal<DepartmentStat[]>([]);
  chartData = signal<DailyChartData[]>([]);
  statusStats = signal<StatusStat[]>([]);

  constructor(
    private router: Router,
    private authService: AuthService,
    private supabaseService: SupabaseService
  ) {}

  ngOnInit() {
    const today = new Date();
    this.selectedDate.set(today);
    this.updateDateInput();
    this.loadAllData();
  }

  updateDateInput() {
    const date = this.selectedDate();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const formatted = `${year}-${month}-${day}`;
    this.dateInputValue.set(formatted);
  }

  onDateChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const [year, month, day] = input.value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    this.selectedDate.set(date);
    this.updateDateInput();
    this.loadAllData();
  }

  setActiveTab(tab: string) {
    if (tab === 'capacity') {
      this.router.navigate(['/admin/capacity']);
      return;
    }
    if (tab === 'notifications') {
      this.router.navigate(['/admin/notifications']);
      return;
    }
    if (tab === 'users') {
      this.router.navigate(['/admin/users']);
      return;
    }
    this.activeTab.set(tab);
  }

  logout() {
    if (confirm('คุณต้องการออกจากระบบหรือไม่?')) {
      this.authService.logout('/admin-login');
    }
  }

  refreshData() {
    this.loadAllData();
  }

  async downloadDailyReport() {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf')
    ]);
    const report = document.createElement('article');
    report.setAttribute('lang', 'th');
    report.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;padding:48px;background:#fff;color:#172033;font:14px Tahoma,"Noto Sans Thai",Arial,sans-serif;';
    report.innerHTML = this.buildDailyReportHtml();
    document.body.appendChild(report);

    try {
      const canvas = await html2canvas(report, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const margin = 10;
      const width = 210 - (margin * 2);
      const height = (canvas.height * width) / canvas.width;
      const pageHeight = 297 - (margin * 2);
      for (let page = 0; page * pageHeight < height; page++) {
        if (page) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin - (page * pageHeight), width, height, undefined, 'FAST');
      }
      pdf.save(`รายงานสถิติการนัดหมาย-${this.dateInputValue()}.pdf`);
    } finally {
      report.remove();
    }
  }

  private async loadAllData() {
    const requestVersion = ++this.dataLoadVersion;
    const selectedDate = new Date(this.selectedDate());
    const selectedDateStr = this.toLocalDateString(selectedDate);
    const startDate = new Date(selectedDate);
    startDate.setDate(startDate.getDate() - 6);

    try {
      const client = this.supabaseService.getClient();
      const { data, error } = await client
        .from('appointments')
        .select('appointment_date, department, status')
        .gte('appointment_date', this.toLocalDateString(startDate))
        .lte('appointment_date', selectedDateStr)
        .all();
      if (error) throw error;
      if (requestVersion !== this.dataLoadVersion) return;

      const dailyAppointments = (data || []).filter(
        (appointment: any) => appointment.appointment_date === selectedDateStr
      );
      const departmentCounts = new Map<string, number>();
      const dailyStatusCounts: Record<string, number> = {
        pending: 0,
        confirmed: 0,
        completed: 0,
        no_show: 0,
        cancelled: 0,
        rescheduled: 0
      };
      const dailyChartCounts = new Map<string, number>();

      for (const appointment of data || []) {
        dailyChartCounts.set(
          appointment.appointment_date,
          (dailyChartCounts.get(appointment.appointment_date) || 0) + 1
        );
        if (appointment.appointment_date !== selectedDateStr) continue;
        departmentCounts.set(appointment.department, (departmentCounts.get(appointment.department) || 0) + 1);
        if (Object.prototype.hasOwnProperty.call(dailyStatusCounts, appointment.status)) {
          dailyStatusCounts[appointment.status]++;
        }
      }

      const dailyTotal = dailyAppointments.length;
      const departmentStats = [...departmentCounts.entries()]
        .map(([name, count]) => ({ name, count, percentage: dailyTotal ? (count / dailyTotal) * 100 : 0 }))
        .sort((first, second) => second.count - first.count);
      const chartData: DailyChartData[] = [];
      for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
        const date = new Date(selectedDate);
        date.setDate(date.getDate() - daysAgo);
        const dateStr = this.toLocalDateString(date);
        chartData.push({ date: dateStr, count: dailyChartCounts.get(dateStr) || 0 });
      }

      const statusLabels: Record<string, string> = {
        pending: 'รอยืนยัน',
        confirmed: 'ยืนยันแล้ว',
        completed: 'เสร็จสิ้น',
        no_show: 'ไม่มาตามนัด',
        cancelled: 'ยกเลิก',
        rescheduled: 'เลื่อนนัดแล้ว'
      };

      const statusColors: Record<string, string> = {
        pending: '#FBBF24',
        confirmed: '#22C55E',
        completed: '#A855F7',
        no_show: '#EF4444',
        cancelled: '#64748B',
        rescheduled: '#8B5CF6'
      };

      const statusStats = Object.entries(dailyStatusCounts).map(([key, count]) => ({
        label: statusLabels[key],
        count,
        percentage: dailyTotal > 0 ? (count / dailyTotal) * 100 : 0,
        color: statusColors[key]
      }));

      this.stats.set({ todayAppointments: dailyTotal, totalDepartments: departmentStats.length });
      this.departmentStats.set(departmentStats);
      this.chartData.set(chartData);
      this.statusStats.set(statusStats);
    } catch (error) {
      if (requestVersion === this.dataLoadVersion) console.error('Error loading dashboard data:', error);
    }
  }

  getMaxChartValue(): number {
    const values = this.chartData().map(d => d.count);
    return Math.max(...values, 1);
  }

  getChartBarHeight(count: number): number {
    const max = this.getMaxChartValue();
    return max > 0 ? (count / max) * 100 : 0;
  }

  formatChartDate(dateStr: string): string {
    const [, month, day] = dateStr.split('-');
    return `${day}/${month}`;
  }

  private buildDailyReportHtml(): string {
    const selectedDate = new Intl.DateTimeFormat('th-TH', {
      day: 'numeric', month: 'long', year: 'numeric'
    }).format(this.selectedDate());
    const generatedAt = new Intl.DateTimeFormat('th-TH', {
      dateStyle: 'medium', timeStyle: 'short'
    }).format(new Date());
    const statusRows = this.statusStats().map(stat =>
      `<tr><td><span class="status-dot" style="background:${this.escapeHtml(stat.color)}"></span>${this.escapeHtml(stat.label)}</td><td>${stat.count}</td><td>${stat.percentage.toFixed(1)}%</td></tr>`
    ).join('');
    const departmentRows = this.departmentStats().map((department, index) =>
      `<tr><td>${index + 1}</td><td>${this.escapeHtml(department.name)}</td><td>${department.count}</td><td>${department.percentage.toFixed(1)}%</td></tr>`
    ).join('');
    const trendRows = this.chartData().map(item =>
      `<tr><td>${this.escapeHtml(this.formatChartDate(item.date))}</td><td>${item.count}</td></tr>`
    ).join('');

    return `<style>
      * { box-sizing: border-box; } h1, h2, p { margin: 0; } .header { border-bottom: 3px solid #1d4ed8; padding-bottom: 14px; margin-bottom: 18px; }
      h1 { font-size: 24px; color: #0f172a; } .subtitle { margin-top: 5px; color: #475569; font-size: 16px; } .generated { margin-top: 5px; color: #64748b; font-size: 11px; }
      .summary { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 18px; } .summary-card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; background: #f8fafc; }
      .summary-label { color: #475569; } .summary-value { margin-top: 5px; color: #1d4ed8; font-size: 28px; font-weight: 700; }
      section { margin-top: 18px; } h2 { color: #1e3a8a; font-size: 16px; margin-bottom: 8px; } table { width: 100%; border-collapse: collapse; }
      th, td { padding: 8px 9px; border: 1px solid #cbd5e1; text-align: left; } th { background: #e0e7ff; color: #1e3a8a; font-weight: 700; } td:nth-child(n+2), th:nth-child(n+2) { text-align: right; }
      .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; } .empty { color: #64748b; padding: 12px 0; }
      footer { margin-top: 22px; padding-top: 9px; border-top: 1px solid #cbd5e1; color: #64748b; font-size: 11px; }
    </style>
    <header class="header"><h1>รายงานสถิติการนัดหมายประจำวัน</h1><p class="subtitle">วันที่ ${this.escapeHtml(selectedDate)}</p><p class="generated">จัดทำเมื่อ ${this.escapeHtml(generatedAt)}</p></header>
    <div class="summary"><div class="summary-card"><div class="summary-label">จำนวนใบนัดทั้งหมด</div><div class="summary-value">${this.stats().todayAppointments}</div></div><div class="summary-card"><div class="summary-label">แผนกที่มีนัด</div><div class="summary-value">${this.stats().totalDepartments}</div></div></div>
    <section><h2>สถานะใบนัด</h2>${statusRows ? `<table><thead><tr><th>สถานะ</th><th>จำนวน</th><th>สัดส่วน</th></tr></thead><tbody>${statusRows}</tbody></table>` : '<p class="empty">ไม่มีข้อมูลใบนัด</p>'}</section>
    <section><h2>สรุปตามแผนก</h2>${departmentRows ? `<table><thead><tr><th>ลำดับ</th><th>แผนก</th><th>จำนวนใบนัด</th><th>สัดส่วน</th></tr></thead><tbody>${departmentRows}</tbody></table>` : '<p class="empty">ไม่มีข้อมูลใบนัด</p>'}</section>
    <section><h2>แนวโน้ม 7 วันถึงวันที่เลือก</h2><table><thead><tr><th>วันที่</th><th>จำนวนใบนัด</th></tr></thead><tbody>${trendRows}</tbody></table></section>
    <footer>เอกสารนี้จัดทำจากระบบนัดหมาย สำหรับใช้งานภายในโรงพยาบาล</footer>`;
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>'"]/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character] || character));
  }

  /** Returns a calendar date in the administrator's local timezone, not UTC. */
  private toLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
