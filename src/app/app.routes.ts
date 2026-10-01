import { Routes } from '@angular/router';
import { StaffLoginComponent } from './pages/staff-login/staff-login.component';
import { AdminLoginComponent } from './pages/admin-login/admin-login.component';
import { StaffDashboardComponent } from './pages/staff-dashboard/staff-dashboard.component';
import { LineLinkComponent } from './pages/line-link/line-link.component';
import { LineCheckInComponent } from './pages/line-checkin/line-checkin.component';
import { authGuard, staffGuard, adminGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/staff-login', pathMatch: 'full' },
  { path: 'staff-login', component: StaffLoginComponent },
  { path: 'admin-login', component: AdminLoginComponent },
  { path: 'line-link', component: LineLinkComponent },
  { path: 'line-checkin', component: LineCheckInComponent },
  {
    path: 'dashboard',
    component: StaffDashboardComponent,
    canActivate: [authGuard, staffGuard]
  },
  { 
    path: 'admin-dashboard', 
    loadComponent: () => import('./pages/admin-dashboard/admin-dashboard.component')
      .then(m => m.AdminDashboardComponent),
    canActivate: [authGuard, adminGuard]
  },
  {
    path: 'admin/capacity',
    loadComponent: () => import('./pages/admin-departments/admin-departments.component')
      .then(m => m.AdminDepartmentsComponent),
    canActivate: [authGuard, adminGuard]
  },
  {
    path: 'admin/notifications', 
    loadComponent: () => import('./pages/admin-notifications/admin-notifications.component')
      .then(m => m.AdminNotificationsComponent),
    canActivate: [authGuard, adminGuard]
  },
  {
    path: 'admin/users',
    loadComponent: () => import('./pages/admin-users/admin-users.component')
      .then(m => m.AdminUsersComponent),
    canActivate: [authGuard, adminGuard]
  },
  { 
    path: 'staff/new-appointment', 
    loadComponent: () => import('./pages/new-appointment/new-appointment.component')
      .then(m => m.NewAppointmentComponent),
    canActivate: [authGuard, staffGuard]
  },
  { path: '**', redirectTo: '/staff-login' }
];
