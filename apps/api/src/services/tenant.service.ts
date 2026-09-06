import { and, eq } from 'drizzle-orm';
import type { TenantRole } from '@veritut/types';
import type { CreateTenantInput } from '@veritut/validators';
import { db } from '../db/db.js';
import { tenantMembers, tenants } from '../db/schema/index.js';
import { ApiError } from '../utils/ApiError.js';
import { audit } from './audit.service.js';

export async function findMembership(tenantId: string, userId: string) {
  const [row] = await db
    .select({ tenantId: tenants.id, tenantSlug: tenants.slug, role: tenantMembers.role, status: tenants.status })
    .from(tenantMembers)
    .innerJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
    .where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.userId, userId)))
    .limit(1);
  if (!row || row.status === 'offboarded') return null;
  return { tenantId: row.tenantId, tenantSlug: row.tenantSlug, role: row.role as TenantRole };
}

export async function listUserTenants(userId: string) {
  return db
    .select({ id: tenants.id, slug: tenants.slug, name: tenants.name, role: tenantMembers.role })
    .from(tenantMembers)
    .innerJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
    .where(eq(tenantMembers.userId, userId))
    .orderBy(tenants.name);
}

/** İlk giriş → kiracı oluştur; oluşturan `owner`. Tek transaction. */
export async function createTenant(input: CreateTenantInput, userId: string, ip: string | null) {
  return db.transaction(async (tx) => {
    const [exists] = await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, input.slug)).limit(1);
    if (exists) throw ApiError.conflict('Bu kısa ad kullanımda');
    const [t] = await tx
      .insert(tenants)
      .values({ slug: input.slug, name: input.name, residencyDefault: input.residencyDefault })
      .returning();
    await tx.insert(tenantMembers).values({ tenantId: t!.id, userId, role: 'owner' });
    await audit({ actorType: 'user', actorId: userId, tenantId: t!.id, action: 'tenant.create', subjectType: 'tenant', subjectId: t!.id, after: { slug: t!.slug, name: t!.name }, ip });
    return t!;
  });
}

export async function getTenant(tenantId: string) {
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!t) throw ApiError.notFound();
  return t;
}

export async function listAllTenants() {
  return db.select().from(tenants).orderBy(tenants.createdAt);
}

export async function getTenantBySlug(slug: string) {
  const [t] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  return t ?? null;
}

export async function createTenantOps(input: { name: string; slug: string; residencyDefault: 'TR' | 'EU' | 'US'; kind: 'customer' | 'internal' | 'reseller' }, staffId: string) {
  const [exists] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, input.slug)).limit(1);
  if (exists) throw ApiError.conflict('Bu kısa ad kullanımda');
  const [t] = await db.insert(tenants).values(input).returning();
  await audit({ actorType: 'staff', actorId: staffId, tenantId: t!.id, action: 'tenant.create', subjectType: 'tenant', subjectId: t!.id, after: input });
  return t!;
}

/** Kiracı 360 (ops): üyeler + iş yükleri + kanıt sayısı + bu ay maliyet/gelir. */
export async function tenant360(tenantId: string) {
  const t = await getTenant(tenantId);
  const { users, workloads, evidenceEvents, costAllocations, workloadRevenue } = await import('../db/schema/index.js');
  const { sql, inArray } = await import('drizzle-orm');
  const period = new Date().toISOString().slice(0, 7);
  const members = await db
    .select({ userId: users.id, email: users.email, displayName: users.displayName, role: tenantMembers.role })
    .from(tenantMembers)
    .innerJoin(users, eq(users.id, tenantMembers.userId))
    .where(eq(tenantMembers.tenantId, tenantId));
  const ws = await db.select().from(workloads).where(eq(workloads.tenantId, tenantId)).orderBy(workloads.name);
  const ids = ws.map((w) => w.id);
  const [ev] = await db.select({ n: sql<number>`count(*)::int`, last: sql<string | null>`max(occurred_at)::text` }).from(evidenceEvents).where(eq(evidenceEvents.tenantId, tenantId));
  const cost = ids.length ? await db.select({ total: sql<string>`coalesce(sum(amount),0)` }).from(costAllocations).where(and(inArray(costAllocations.workloadId, ids), eq(costAllocations.period, period))) : [{ total: '0' }];
  const rev = ids.length ? await db.select({ total: sql<string>`coalesce(sum(amount),0)` }).from(workloadRevenue).where(and(inArray(workloadRevenue.workloadId, ids), eq(workloadRevenue.period, period))) : [{ total: '0' }];
  return { tenant: t, members, workloads: ws.map(({ accessSealed: _a, ...w }) => w), evidence: { count: ev?.n ?? 0, last: ev?.last ?? null }, month: { period, cost: Number(cost[0]?.total ?? 0), revenue: Number(rev[0]?.total ?? 0) } };
}
