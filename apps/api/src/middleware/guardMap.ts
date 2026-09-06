import type { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * FAIL-CLOSED segment haritası (D7 / plan §6.3). `/api/v1/<segment>` için koruma sınıfı
 * burada bildirilir; haritada olmayan segment → 403 + startup uyarısı. Yeni router eklemek
 * = bu haritaya satır eklemek; unutulursa uç açılmaz (sessiz açık yerine gürültülü kapalı).
 */
export type GuardClass = 'public' | 'user' | 'staff' | 'internal' | 'webhook' | 'apikey';

export const SEGMENT_GUARDS: Record<string, GuardClass> = {
  health: 'public',
  auth: 'public', // kendi içinde oturum kurar
  evidence: 'user', // tenant-scoped + public verify alt yolu router içinde açıkça işaretli
  tenants: 'user',
  workloads: 'user',
  me: 'user',
  ops: 'staff',
  internal: 'internal',
  webhooks: 'webhook',
  ws: 'staff',
  catalog: 'public', // pazarlama + fiyat hesaplayıcı (kimliksiz, rate limitli)
  orders: 'user',
  billing: 'user',
  support: 'user',
  'api-keys': 'user',
  ext: 'apikey', // public API — Bearer vt_… (D19)
  guvence: 'user',
  denetci: 'public', // süreli token'lı denetçi görünümü (kimliksiz, rate limitli)
};

export function guardMap(req: Request, _res: Response, next: NextFunction): void {
  const seg = req.path.split('/').filter(Boolean)[0] ?? '';
  if (!(seg in SEGMENT_GUARDS)) {
    logger.warn({ seg, path: req.path }, 'haritasız segment — fail-closed 403');
    return next(ApiError.forbidden('Bu uç koruma haritasında tanımlı değil'));
  }
  next();
}

/** Startup: mount edilen router yollarını haritayla kıyasla, eksik olanı uyar. */
export function auditGuardMap(mounted: string[]): void {
  for (const m of mounted) {
    if (!(m in SEGMENT_GUARDS)) logger.error({ segment: m }, 'ROUTER HARİTASIZ — istekler 403 alacak');
  }
  for (const k of Object.keys(SEGMENT_GUARDS)) {
    if (!mounted.includes(k)) logger.warn({ segment: k }, 'haritada var, router yok');
  }
}
