import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { ApiService } from './api.service';
import { 
  User, 
  LoginRequest, 
  LoginResponse
} from '../models';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private api = inject(ApiService);
  private router = inject(Router);

  private readonly TOKEN_KEY = 'auth_token';
  private readonly USER_KEY = 'auth_user';
  private readonly EXPIRES_KEY = 'auth_expires';

  // Signals
  private currentUserSignal = signal<User | null>(null);
  private isAuthenticatedSignal = signal<boolean>(false);

  // Computed
  currentUser = this.currentUserSignal.asReadonly();
  isAuthenticated = this.isAuthenticatedSignal.asReadonly();
  isAdmin = computed(() => this.currentUserSignal()?.role === 'admin');
  isStaff = computed(() => this.currentUserSignal()?.role === 'staff');
  mustChangePassword = computed(() => this.currentUserSignal()?.must_change_password === true);

  constructor() {
    this.loadSessionFromStorage();
  }

  /**
   * Staff Login
   */
  staffLogin(employeeId: string, password: string): Observable<LoginResponse> {
    const request: LoginRequest = { employee_id: employeeId, password };
    
    return this.api.post<LoginResponse>('auth/staff/login', request).pipe(
      tap(response => this.handleLoginSuccess(response)),
      catchError(error => {
        console.error('Staff login error:', error);
        throw error;
      })
    );
  }

  /**
   * Admin Login
   */
  adminLogin(username: string, password: string): Observable<LoginResponse> {
    const request: LoginRequest = { username, password };
    
    return this.api.post<LoginResponse>('auth/admin/login', request).pipe(
      tap(response => this.handleLoginSuccess(response)),
      catchError(error => {
        console.error('Admin login error:', error);
        throw error;
      })
    );
  }

  /**
   * Logout
   */
  logout(redirectUrl = '/staff-login'): void {
    this.clearSession();
    this.router.navigate([redirectUrl]);
  }

  logoutSilently(): void {
    this.clearSession();
  }

  markPasswordChanged(): void {
    const user = this.currentUserSignal();
    if (!user) return;
    const updatedUser = { ...user, must_change_password: false };
    localStorage.setItem(this.USER_KEY, JSON.stringify(updatedUser));
    this.currentUserSignal.set(updatedUser);
  }

  requirePasswordChange(): void {
    const user = this.currentUserSignal();
    if (!user || user.role !== 'staff') return;
    const updatedUser = { ...user, must_change_password: true };
    localStorage.setItem(this.USER_KEY, JSON.stringify(updatedUser));
    this.currentUserSignal.set(updatedUser);
    this.router.navigate(['/staff-login']);
  }

  /**
   * Get current token
   */
  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(): boolean {
    const expiresAt = localStorage.getItem(this.EXPIRES_KEY);
    if (!expiresAt) return true;
    
    const parsedExpiration = Number(expiresAt);
    return !Number.isFinite(parsedExpiration) || Date.now() >= parsedExpiration;
  }

  /**
   * Refresh token
   */
  refreshToken(): Observable<LoginResponse> {
    return this.api.post<LoginResponse>('auth/refresh', {}).pipe(
      tap(response => this.handleLoginSuccess(response)),
      catchError(error => {
        this.logout();
        return throwError(() => error);
      })
    );
  }

  /**
   * Handle login success
   */
  private handleLoginSuccess(response: LoginResponse): void {
    const expiresAt = new Date().getTime() + (response.expires_in * 1000);
    
    localStorage.setItem(this.TOKEN_KEY, response.access_token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(response.user));
    localStorage.setItem(this.EXPIRES_KEY, expiresAt.toString());
    
    this.currentUserSignal.set(response.user);
    this.isAuthenticatedSignal.set(true);
  }

  /**
   * Load session from storage
   */
  private loadSessionFromStorage(): void {
    const token = localStorage.getItem(this.TOKEN_KEY);
    const userJson = localStorage.getItem(this.USER_KEY);
    
    if (!token || !userJson || this.isTokenExpired()) {
      this.clearSession();
      return;
    }

    try {
      const user = JSON.parse(userJson) as User;
      this.currentUserSignal.set(user);
      this.isAuthenticatedSignal.set(true);
    } catch {
      // A stale or manually altered value must not prevent the app from starting.
      this.clearSession();
    }
  }

  /**
   * Clear session
   */
  private clearSession(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem(this.EXPIRES_KEY);
    
    // Clear old session keys
    localStorage.removeItem('staff_session');
    localStorage.removeItem('admin_session');
    
    this.currentUserSignal.set(null);
    this.isAuthenticatedSignal.set(false);
  }
}
