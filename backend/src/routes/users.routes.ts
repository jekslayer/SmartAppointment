import { Router, Request, Response, NextFunction } from 'express';
import { getClient } from '../db/supabase';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { createError } from '../middleware/error.middleware';

export const usersRouter = Router();

usersRouter.use(authenticate, authorize('admin'));

// Only exposes local application accounts. Passwords and unrelated hospital data never leave the server.
usersRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await getClient()
      .from('users')
      .select('id, employee_id, username, full_name, role, is_active, created_at')
      .eq('role', 'staff')
      .order('full_name', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (error) { next(error); }
});

usersRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { employee_id, full_name } = req.body;
    if (typeof employee_id !== 'string' || !employee_id.trim() || typeof full_name !== 'string' || !full_name.trim()) {
      return next(createError(400, 'กรุณาระบุรหัสพนักงานและชื่อ-นามสกุล'));
    }
    const { data, error } = await getClient().from('users').insert({
      employee_id: employee_id.trim(),
      full_name: full_name.trim(),
      password: '123456',
      role: 'staff',
      is_active: true,
      must_change_password: true
    }).select('id, employee_id, username, full_name, role, is_active, created_at').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) { next(error); }
});

usersRouter.post('/:id/reset-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { new_password } = req.body;
    if (typeof new_password !== 'string' || new_password.length < 6) {
      return next(createError(400, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'));
    }
    const { data, error } = await getClient().from('users').update({
      password: new_password,
      must_change_password: true
    }).eq('id', req.params.id).eq('role', 'staff').select('id').maybeSingle();
    if (error) throw error;
    if (!data) return next(createError(404, 'ไม่พบบัญชีผู้ใช้'));
    res.json({ success: true });
  } catch (error) { next(error); }
});

usersRouter.patch('/:id/status', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { is_active } = req.body;
    if (typeof is_active !== 'boolean') return next(createError(400, 'สถานะบัญชีไม่ถูกต้อง'));
    if (req.params.id === req.user?.id && !is_active) return next(createError(400, 'ไม่สามารถปิดใช้งานบัญชีของตนเองได้'));
    const { data, error } = await getClient().from('users').update({ is_active }).eq('id', req.params.id).eq('role', 'staff')
      .select('id, employee_id, username, full_name, role, is_active, created_at').maybeSingle();
    if (error) throw error;
    if (!data) return next(createError(404, 'ไม่พบบัญชีผู้ใช้'));
    res.json(data);
  } catch (error) { next(error); }
});
