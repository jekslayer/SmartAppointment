import { Request, Response, NextFunction } from 'express';
import { createError } from './error.middleware';
import * as jwt from './jwt.utils';
import { getClient } from '../db/supabase';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    employee_id?: string;
    username?: string;
    role: string;
    full_name: string;
    must_change_password?: boolean;
  };
}

const PUBLIC_PATHS = [
  '/api/auth/staff/login',
  '/api/auth/admin/login',
  '/api/health'
];

export const authenticate = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  if (PUBLIC_PATHS.includes(req.originalUrl.split('?')[0])) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(createError(401, 'ไม่มีการยืนยันตัวตน กรุณาเข้าสู่ระบบ'));
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verifyToken(token);
    const { data: account, error } = await getClient().from('users')
      .select('is_active, must_change_password, role')
      .eq('id', decoded.id)
      .maybeSingle();
    if (error) return next(createError(503, 'Unable to validate account status'));
    if (!account || !account.is_active || account.role !== decoded.role) {
      return next(createError(401, 'Account is inactive or no longer exists'));
    }

    const mustChangePassword = decoded.role === 'staff' && account.must_change_password === true;
    req.user = { ...decoded, must_change_password: mustChangePassword };
    const requestPath = req.originalUrl.split('?')[0];
    const isPasswordChangeRequest = req.method === 'POST' && requestPath.endsWith('/auth/change-password');
    if (mustChangePassword && !isPasswordChangeRequest) {
      return next(createError(403, 'Change your password before using the system'));
    }
    next();
  } catch (error) {
    return next(createError(401, 'โทเค็นไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบใหม่'));
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(createError(401, 'ไม่มีการยืนยันตัวตน'));
    }

    if (!roles.includes(req.user.role)) {
      return next(createError(403, 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้'));
    }

    next();
  };
};
