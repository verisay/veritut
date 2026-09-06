import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { z } from 'zod';
import type { auditorLinkSchema } from '@veritut/validators';
import { db } from '../db/db.js';
import { auditorLinks, documents, slaPeriods, tenants } from '../db/schema/index.js';
import { randomToken, sha256Hex } from '../lib/crypto.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { audit } from './audit.service.js';
import { verifyEvidenceChain } from './evidence.service.js';

/**
 * Denetçi bağlantısı (plan §1.3 `auditor_link`): süreli, kapsamlı, kimliksiz salt-okuma.
 * Kanıt zinciri doğrulaması, SLA raporu ve alt işleyen listesi paylaşılabilir — olay İÇERİĞİ paylaşılmaz.
 */
export async function createAuditorLink(tenantId: string, input: z.infer<typeof auditorLinkSchema>, userId: string) {
  const token = randomToken(24);
  const [row] = await db
    .insert(auditorLinks)
    .values({ tenantId, label: input.label, tokenHash: sha256Hex(token), scope: input.scope, expiresAt: new Date(Date.now() + input.expiresInDays * 86400_000), createdBy: userId })
    .returning({ id: auditorLinks.id, label: auditorLinks.label, scope: auditorLinks.scope, expiresAt: auditorLinks.expiresAt });
  await audit({ actorType: 'user', actorId: userId, tenantId, action: 'auditor_link.create', subjectType: 'auditor_link', subjectId: row!.id, after: { label: input.label, scope: input.scope } });
  return { ...row!, url: `${env.PORTAL_URL}/denetci/${token}` };
}

export async function listAuditorLinks(tenantId: string) {
  return db
    .select({ id: auditorLinks.id, label: auditorLinks.label, scope: auditorLinks.scope, expiresAt: auditorLinks.expiresAt, revokedAt: auditorLinks.revokedAt, lastUsedAt: auditorLinks.lastUsedAt, createdAt: auditorLinks.createdAt })
    .from(auditorLinks)
    .where(eq(auditorLinks.tenantId, tenantId))
    .orderBy(desc(auditorLinks.createdAt));
}

export async function revokeAuditorLink(tenantId: string, id: string, userId: string) {
  const [row] = await db.update(auditorLinks).set({ revokedAt: new Date() }).where(and(eq(auditorLinks.id, id), eq(auditorLinks.tenantId, tenantId), isNull(auditorLinks.revokedAt))).returning({ id: auditorLinks.id });
  if (!row) throw ApiError.notFound();
  await audit({ actorType: 'user', actorId: userId, tenantId, action: 'auditor_link.revoke', subjectType: 'auditor_link', subjectId: id });
}

/** Denetçi görünümü — token ile; kimlik istemez, içerik salt-okuma ve kapsamla sınırlı. */
export async function auditorView(token: string) {
  const [link] = await db
    .select({ id: auditorLinks.id, tenantId: auditorLinks.tenantId, scope: auditorLinks.scope, label: auditorLinks.label, tenantName: tenants.name, tenantSlug: tenants.slug })
    .from(auditorLinks)
    .innerJoin(tenants, eq(tenants.id, auditorLinks.tenantId))
    .where(and(eq(auditorLinks.tokenHash, sha256Hex(token)), isNull(auditorLinks.revokedAt), gt(auditorLinks.expiresAt, new Date())))
    .limit(1);
  if (!link) throw ApiError.notFound('Bağlantı geçersiz veya süresi dolmuş');
  void db.update(auditorLinks).set({ lastUsedAt: new Date() }).where(eq(auditorLinks.id, link.id)).catch(() => undefined);
  const scope = link.scope as string[];
  const out: Record<string, unknown> = { tenant: { name: link.tenantName, slug: link.tenantSlug }, label: link.label, scope };
  if (scope.includes('evidence')) out['chain'] = await verifyEvidenceChain(link.tenantId);
  if (scope.includes('sla')) {
    out['sla'] = (await db.select().from(slaPeriods).where(eq(slaPeriods.tenantId, link.tenantId)).orderBy(desc(slaPeriods.period)).limit(12)).map((s) => ({ period: s.period, uptimePct: Number(s.uptimePct), target: Number(s.uptimeTarget), incidents: s.incidents, responseBreaches: s.responseBreaches, resolveBreaches: s.resolveBreaches }));
  }
  const kinds = ['evidence_bundle', ...(scope.includes('subprocessors') ? ['subprocessors'] : []), ...(scope.includes('sla') ? ['sla_report'] : [])];
  out['documents'] = (await db.select({ id: documents.id, kind: documents.kind, period: documents.period, title: documents.title, sha256: documents.sha256, createdAt: documents.createdAt }).from(documents).where(eq(documents.tenantId, link.tenantId)).orderBy(desc(documents.createdAt)).limit(50)).filter((d) => kinds.includes(d.kind));
  return { tenantId: link.tenantId, view: out };
}

/** Denetçi belge indirmesi — yalnız kapsamdaki türler. */
export async function auditorDocument(token: string, documentId: string) {
  const { tenantId, view } = await auditorView(token);
  const allowed = (view['documents'] as Array<{ id: string; storageKey?: string }>).some((d) => d.id === documentId);
  if (!allowed) throw ApiError.notFound();
  const [d] = await db.select().from(documents).where(and(eq(documents.id, documentId), eq(documents.tenantId, tenantId))).limit(1);
  if (!d) throw ApiError.notFound();
  return d;
}
