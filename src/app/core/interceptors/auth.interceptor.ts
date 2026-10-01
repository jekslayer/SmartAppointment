import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Get token from localStorage
  const token = localStorage.getItem('auth_token');
  
  // Skip adding token only for public login endpoints (no token available yet)
  const PUBLIC_ENDPOINTS = ['/auth/staff/login', '/auth/admin/login'];
  if (PUBLIC_ENDPOINTS.some(path => req.url.includes(path))) {
    return next(req);
  }
  
  // Clone request and add Authorization header if token exists
  if (token) {
    const clonedReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
    return next(clonedReq);
  }
  
  return next(req);
};
