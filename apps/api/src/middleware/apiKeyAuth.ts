import type { NextFunction, Request, Response } from 'express';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db/db.js';
import { apiKeys, tenants } from '../db/schema/index.js';
import { sha256Hex } from '../lib/crypto.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Public API kimliği (D19): `Authorization: Bearer vt_<token>`. Anahtar sha256 saklanır;
 * kapsam ve IP allow-list zorlanır. Kiracı bağlamı anahtarın kiracısıdır (X-Tenant-Id GEÇMEZ).
 */
export type ApiScope = 'workloads:read' | 'evidence:read' | 'orders:read' | 'orders:write' | 'status:read';

export async function apiKeyAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token.startsWith('vt_')) throw ApiError.unauthorized('API anahtarı gerekli');
    const [row] = await db
      .select({ id: apiKeys.id, tenantId: apiKeys.tenantId, scopes: apiKeys.scopes, ipAllow: apiKeys.ipAllow, tenantSlug: tenants.slug, tenantStatus: tenants.status })
      .from(apiKeys)
      .innerJoin(tenants, eq(tenants.id, apiKeys.tenantId))
      .where(and(eq(apiKeys.keyHash, sha256Hex(token)), isNull(apiKeys.revokedAt), or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, new Date()))))
      .limit(1);
    if (!row) throw ApiError.unauthorized('API anahtarı geçersiz veya süresi dolmuş');
    if (row.tenantStatus === 'offboarded' || row.tenantStatus === 'suspended') throw ApiError.forbidden('Kiracı hesabı aktif değil');
    const ip = req.ip ?? '';
    if (row.ipAllow.length > 0 && !row.ipAllow.includes(ip)) throw ApiError.forbidden('Bu IP adresi anahtarın izin listesinde değil');
    req.ctx = { tenantId: row.tenantId, tenantSlug: row.tenantSlug, role: 'viewer' };
    req.apiKey = { id: row.id, scopes: row.scopes as ApiScope[] };
    void db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id)).catch(() => undefined);
    next();
  } catch (e) {
    next(e);
  }
}

export function requireScope(scope: ApiScope) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.apiKey?.scopes.includes(scope)) return next(new ApiError(403, `Bu anahtarda '${scope}' kapsamı yok`, 'SCOPE_MISSING'));
    next();
  };
}

void sql;
