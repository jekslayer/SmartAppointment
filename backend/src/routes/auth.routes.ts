import { Router, Request, Response, NextFunction } from 'express';
import { getClient } from '../db/supabase';
import { generateToken } from '../middleware/jwt.utils';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { createError } from '../middleware/error.middleware';
function passwordMatches(password: string, user: { password?: string }): boolean {
  return password === user.password;
}

export const authRouter = Router();

// POST /api/auth/staff/login - Staff login
authRouter.post('/staff/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { employee_id, password } = req.body;

    if (!employee_id || !password) {
      return next(createError(400, 'กรุณากรอกรหัสพนักงานและรหัสผ่าน'));
    }

    const client = getClient();
    const { data: users, error } = await client
      .from('users')
      .select('*')
      .eq('employee_id', employee_id)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !users) {
      return next(createError(401, 'ไม่พบรหัสพนักงานนี้ในระบบ'));
    }

    if (users.role !== 'staff') {
      return next(createError(403, 'This account cannot sign in through the staff portal'));
    }

    if (!passwordMatches(password, users)) {
      return next(createError(401, 'รหัสผ่านไม่ถูกต้อง'));
    }

    const token = generateToken({
      id: users.id,
      employee_id: users.employee_id,
      role: users.role,
      full_name: users.full_name
    });

    res.json({
      access_token: token,
      refresh_token: token,
      token_type: 'Bearer',
      expires_in: parseInt(process.env.JWT_EXPIRES_IN || '43200'),
      user: {
        id: users.id,
        employee_id: users.employee_id,
        full_name: users.full_name,
        role: users.role,
        department: users.department_id,
        is_active: users.is_active,
        must_change_password: users.must_change_password === true
      },
      must_change_password: users.must_change_password === true
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/admin/login - Admin login
authRouter.post('/admin/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return next(createError(400, 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'));
    }

    const client = getClient();
    const { data: users, error } = await client
      .from('users')
      .select('*')
      .eq('username', username)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !users) {
      return next(createError(401, 'ไม่พบชื่อผู้ใช้นี้ในระบบ'));
    }

    if (users.role !== 'admin') {
      return next(createError(403, 'บัญชีนี้ไม่มีสิทธิ์เข้าถึงระบบผู้ดูแล'));
    }

    if (!passwordMatches(password, users)) {
      return next(createError(401, 'รหัสผ่านไม่ถูกต้อง'));
    }

    const token = generateToken({
      id: users.id,
      username: users.username,
      employee_id: users.employee_id,
      role: users.role,
      full_name: users.full_name
    });

    res.json({
      access_token: token,
      refresh_token: token,
      token_type: 'Bearer',
      expires_in: parseInt(process.env.JWT_EXPIRES_IN || '43200'),
      user: {
        id: users.id,
        username: users.username,
        employee_id: users.employee_id,
        full_name: users.full_name,
        role: users.role,
        is_active: users.is_active
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/change-password - Change password (after first login)
authRouter.post('/change-password', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { new_password } = req.body;
    const employee_id = req.user?.employee_id;

    if (req.user?.role !== 'staff' || !req.user.must_change_password) {
      return next(createError(403, 'Password change is not required for this account'));
    }

    if (!employee_id || typeof new_password !== 'string' || new_password.length < 6) {
      return next(createError(400, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'));
    }

    const client = getClient();

    const { data: updatedUser, error } = await client
      .from('users')
      .update({
        password: new_password,
        must_change_password: false
      })
      .eq('id', req.user!.id)
      .eq('employee_id', employee_id)
      .eq('must_change_password', true)
      .select('id')
      .maybeSingle();

    if (error) return next(createError(500, 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน'));
    if (!updatedUser) return next(createError(409, 'Password has already been changed'));

    res.json({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/refresh - Refresh token
authRouter.post('/refresh', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return next(createError(401, 'No token provided'));
    const { id, employee_id, username, role, full_name } = req.user;
    res.json({ access_token: generateToken({ id, employee_id, username, role, full_name }), token_type: 'Bearer', expires_in: parseInt(process.env.JWT_EXPIRES_IN || '43200') });
  } catch (error) {
    next(error);
  }
});
