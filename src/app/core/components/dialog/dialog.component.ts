import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogService } from '../../services/dialog.service';

@Component({
  selector: 'app-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dialog.component.html',
  styleUrls: ['./dialog.component.css']
})
export class DialogComponent {
  private dialogService = inject(DialogService);
  
  isVisible = this.dialogService.getVisibility();
  config = this.dialogService.getConfig();

  iconType = computed(() => {
    const type = this.config()?.type;
    switch (type) {
      case 'success':
        return 'check-circle';
      case 'error':
        return 'x-circle';
      case 'warning':
        return 'alert-triangle';
      case 'confirm':
        return 'help-circle';
      default:
        return 'info';
    }
  });

  iconColor = computed(() => {
    const type = this.config()?.type;
    switch (type) {
      case 'success':
        return '#10B981';
      case 'error':
        return '#EF4444';
      case 'warning':
        return '#F59E0B';
      case 'confirm':
        return '#3B82F6';
      default:
        return '#3B82F6';
    }
  });

  onConfirm() {
    this.dialogService.close(true);
  }

  onCancel() {
    this.dialogService.close(false);
  }

  onOverlayClick() {
    if (this.config()?.type !== 'confirm') {
      this.dialogService.close(false);
    }
  }
}
