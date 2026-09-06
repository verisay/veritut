import type { NextFunction, Request, Response } from 'express';
import { readUserSession } from '../services/auth.service.js';
import { ApiError } from '../utils/ApiError.js';

export const PORTAL_COOKIE = 'vt_portal';

/** Kiracı kullanıcısı oturumu (realm=musteri). `requireStaff` ile YER DEĞİŞTİRİLMEZ (plan §1.3). */
export async function requireUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = (req.cookies as Record<string, string | undefined>)[PORTAL_COOKIE];
    if (!token) throw ApiError.unauthorized();
    const s = await readUserSession(token);
    if (!s) throw ApiError.unauthorized('Oturum geçersiz veya süresi dolmuş');
    req.user = s;
    next();
  } catch (e) {
    next(e);
  }
}
