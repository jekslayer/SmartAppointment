import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const isPublicLineIdentityRequest = /\/api\/line\/(check-in|link\/verify)(?:\?|$)/.test(req.url);
  
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // These LIFF endpoints have their own patient-facing error states.  Keep
      // the response intact so the page can distinguish identity, link, and
      // appointment errors instead of showing a generic application message.
      if (isPublicLineIdentityRequest) return throwError(() => error);

      const backendMessage = error.error?.error?.message;
      if (error.status === 403 && backendMessage === 'Change your password before using the system') {
        authService.requirePasswordChange();
        return throwError(() => new Error(backendMessage));
      }

      let errorMessage = 'เกิดข้อผิดพลาด';
      
      if (error.error instanceof ErrorEvent) {
        // Client-side error
        errorMessage = `Error: ${error.error.message}`;
      } else {
        // Server-side error
        if (error.status === 401) {
          // Unauthorized - clear the in-memory and persisted session.
          authService.logout(authService.isAdmin() ? '/admin-login' : '/staff-login');
          errorMessage = 'กรุณาเข้าสู่ระบบใหม่';
        } else if (error.status === 403) {
          errorMessage = 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้';
        } else if (error.status === 404) {
          errorMessage = 'ไม่พบข้อมูลที่ต้องการ';
        } else if (error.status === 500) {
          errorMessage = 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง';
        } else if (error.error?.error?.message) {
          errorMessage = error.error.error.message;
        } else if (error.error?.message) {
          errorMessage = error.error.message;
        } else if (error.message) {
          errorMessage = error.message;
        }
      }
      
      console.error('HTTP Error:', errorMessage, error);
      return throwError(() => new Error(errorMessage));
    })
  );
};
