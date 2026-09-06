import type { NextFunction, Request, Response } from 'express';
import { staffRoleAtLeast, type StaffRole } from '@veritut/types';
import { readStaffSession } from '../services/auth.service.js';
import { ApiError } from '../utils/ApiError.js';

export const OPS_COOKIE = 'vt_ops';

/** Personel oturumu (realm=ops). */
export async function requireStaff(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = (req.cookies as Record<string, string | undefined>)[OPS_COOKIE];
    if (!token) throw ApiError.unauthorized();
    const s = await readStaffSession(token);
    if (!s) throw ApiError.unauthorized('Oturum geçersiz veya süresi dolmuş');
    req.staff = s;
    next();
  } catch (e) {
    next(e);
  }
}

export function requireStaffRole(min: StaffRole) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.staff) return next(ApiError.unauthorized());
    if (!staffRoleAtLeast(req.staff.role, min)) return next(ApiError.forbidden());
    next();
  };
}
