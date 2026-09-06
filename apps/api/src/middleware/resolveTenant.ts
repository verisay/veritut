import type { NextFunction, Request, Response } from 'express';
import { tenantRoleAtLeast, type TenantRole } from '@veritut/types';
import { findMembership } from '../services/tenant.service.js';
import { ApiError } from '../utils/ApiError.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * TEK kiracı çözümleyici (D7). `X-Tenant-Id` → UUID regex (ham değer sorguya girmez) →
 * üyelik → `req.ctx`. Üye değilse 404 (403 değil: varlık sızmaz). Kiracı-kapsamlı TÜM
 * router'lar bu middleware'i kullanır; kendi çözümlemesini yazan router = veri sızıntısı bug sınıfı.
 */
export async function resolveTenant(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const raw = req.header('x-tenant-id') ?? '';
    if (!UUID_RE.test(raw)) throw ApiError.badRequest('X-Tenant-Id başlığı eksik veya geçersiz');
    const m = await findMembership(raw, req.user.id);
    if (!m) throw ApiError.notFound();
    req.ctx = { tenantId: m.tenantId, tenantSlug: m.tenantSlug, role: m.role };
    next();
  } catch (e) {
    next(e);
  }
}

export function requireTenantRole(min: TenantRole) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.ctx) return next(ApiError.unauthorized());
    if (!tenantRoleAtLeast(req.ctx.role, min)) return next(ApiError.forbidden());
    next();
  };
}
