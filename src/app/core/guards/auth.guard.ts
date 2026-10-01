import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (_, state) => {
  const router = inject(Router);
  const authService = inject(AuthService);

  if (authService.isAuthenticated()) return true;

  const loginPath = state.url.startsWith('/admin') ? '/admin-login' : '/staff-login';
  return router.createUrlTree([loginPath], {
    queryParams: { returnUrl: state.url }
  });
};

export const staffGuard: CanActivateFn = () => {
  const router = inject(Router);
  const authService = inject(AuthService);

  return (authService.isStaff() && !authService.mustChangePassword())
    || router.createUrlTree(['/staff-login']);
};

export const adminGuard: CanActivateFn = () => {
  const router = inject(Router);
  const authService = inject(AuthService);

  return authService.isAdmin() || router.createUrlTree(['/admin-login']);
};
