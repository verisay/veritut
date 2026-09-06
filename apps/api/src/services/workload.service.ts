import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import type { ComponentState, ProviderCode, Residency, WorkloadHealthCard } from '@veritut/types';
import type { CreateWorkloadInput } from '@veritut/validators';
import { z } from 'zod';
import { createWorkloadSchema } from '@veritut/validators';
import { db } from '../db/db.js';
import { accessSessions, backupJobs, components, costAllocations, probeResults, providerInventory, tenants, workloadRevenue, workloads } from '../db/schema/index.js';
import { ApiError } from '../utils/ApiError.js';
import { audit } from './audit.service.js';

/** İş yükü kayıt defteri (K1): elle/ithal `legacy` kayıtlar; K2'de provizyon motoru aynı tabloya yazar. */
export async function createWorkload(input: CreateWorkloadInput, actor: { staffId?: string; userId?: string }, ip: string | null) {
  const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, input.tenantId)).limit(1);
  if (!t) throw ApiError.notFound('Kiracı bulunamadı');
  const [dup] = await db.select({ id: workloads.id }).from(workloads).where(and(eq(workloads.tenantId, input.tenantId), eq(workloads.slug, input.slug))).limit(1);
  if (dup) throw ApiError.conflict('Bu kiracıda aynı kısa adlı iş yükü var');
  const [w] = await db
    .insert(workloads)
    .values({
      tenantId: input.tenantId,
      slug: input.slug,
      name: input.name,
      productSlug: input.productSlug,
      residency: input.residency,
      providerCode: input.providerCode ?? null,
      providerAccountId: input.providerAccountId ?? null,
      region: input.region ?? null,
      size: input.size ?? null,
      slaTier: input.slaTier,
      status: input.status,
      probeUrl: input.probeUrl ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  await syncWorkloadComponent(w!.id);
  await audit({ actorType: actor.staffId ? 'staff' : 'user', actorId: actor.staffId ?? actor.userId ?? null, tenantId: input.tenantId, action: 'workload.create', subjectType: 'workload', subjectId: w!.id, after: { slug: w!.slug, productSlug: w!.productSlug, residency: w!.residency }, ip });
  return w!;
}

export async function updateWorkload(id: string, patch: Partial<CreateWorkloadInput>, staffId: string) {
  const [before] = await db.select().from(workloads).where(eq(workloads.id, id)).limit(1);
  if (!before) throw ApiError.notFound('İş yükü bulunamadı');
  const { status: _s, tenantId: _t, slug: _sl, ...rest } = patch as Partial<CreateWorkloadInput>;
  const [after] = await db
    .update(workloads)
    .set({ ...rest, providerCode: rest.providerCode ?? before.providerCode, probeUrl: rest.probeUrl === undefined ? before.probeUrl : rest.probeUrl })
    .where(eq(workloads.id, id))
    .returning();
  await syncWorkloadComponent(id);
  await audit({ actorType: 'staff', actorId: staffId, tenantId: before.tenantId, action: 'workload.update', subjectType: 'workload', subjectId: id, before: { name: before.name, region: before.region, size: before.size }, after: { name: after!.name, region: after!.region, size: after!.size } });
  return after!;
}

/** Probe URL'si olan iş yükü için kiracı bileşeni (status sayfası + uptime) otomatik. */
export async function syncWorkloadComponent(workloadId: string): Promise<void> {
  const [w] = await db.select().from(workloads).where(eq(workloads.id, workloadId)).limit(1);
  if (!w) return;
  if (!w.probeUrl) {
    await db.delete(components).where(eq(components.workloadId, workloadId));
    return;
  }
  await db.execute(sql`
    INSERT INTO components (tenant_id, workload_id, slug, name, probe_url, sort)
    VALUES (${w.tenantId}, ${w.id}, ${w.slug}, ${w.name}, ${w.probeUrl}, 100)
    ON CONFLICT (tenant_id, slug) DO UPDATE SET name = EXCLUDED.name, probe_url = EXCLUDED.probe_url, workload_id = EXCLUDED.workload_id`);
}

export async function listWorkloadsOps(opts: { tenantId?: string } = {}) {
  const where = opts.tenantId ? [eq(workloads.tenantId, opts.tenantId)] : [];
  return db
    .select({
      id: workloads.id,
      tenantId: workloads.tenantId,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      slug: workloads.slug,
      name: workloads.name,
      productSlug: workloads.productSlug,
      residency: workloads.residency,
      providerCode: workloads.providerCode,
      region: workloads.region,
      size: workloads.size,
      slaTier: workloads.slaTier,
      status: workloads.status,
      probeUrl: workloads.probeUrl,
      createdAt: workloads.createdAt,
    })
    .from(workloads)
    .innerJoin(tenants, eq(tenants.id, workloads.tenantId))
    .where(and(...where))
    .orderBy(tenants.name, workloads.name);
}

export async function getWorkloadOps(id: string) {
  const [w] = await db.select().from(workloads).where(eq(workloads.id, id)).limit(1);
  if (!w) throw ApiError.notFound('İş yükü bulunamadı');
  return w;
}

/** Portal: kiracı-kapsamlı iş yükü (kapsam dışı 404). */
export async function getWorkloadForTenant(tenantId: string, id: string) {
  const [w] = await db.select().from(workloads).where(and(eq(workloads.id, id), eq(workloads.tenantId, tenantId))).limit(1);
  if (!w) throw ApiError.notFound();
  return w;
}

function bars(results: Array<{ state: string; checkedAt: Date }>): WorkloadHealthCard['bars30d'] {
  const out: WorkloadHealthCard['bars30d'] = [];
  const dayMs = 86400_000;
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  for (let i = 29; i >= 0; i--) {
    const start = today.getTime() - i * dayMs;
    const day = results.filter((r) => r.checkedAt.getTime() >= start && r.checkedAt.getTime() < start + dayMs);
    if (day.length === 0) out.push('unknown');
    else if (day.some((r) => r.state === 'down') && day.filter((r) => r.state === 'down').length / day.length > 0.05) out.push('down');
    else if (day.some((r) => r.state === 'down' || r.state === 'degraded')) out.push('degraded');
    else if (day.every((r) => r.state === 'maintenance')) out.push('maintenance');
    else out.push('ok');
  }
  return out;
}

export async function healthCards(tenantId: string): Promise<WorkloadHealthCard[]> {
  const ws = await db.select().from(workloads).where(and(eq(workloads.tenantId, tenantId), sql`${workloads.status} <> 'destroyed'`)).orderBy(workloads.name);
  if (ws.length === 0) return [];
  const ids = ws.map((w) => w.id);
  const period = new Date().toISOString().slice(0, 7);
  const since = new Date(Date.now() - 30 * 86400_000);
  const [comps, probes, costs, lastBackups, drills, access] = await Promise.all([
    db.select({ id: components.id, workloadId: components.workloadId }).from(components).where(inArray(components.workloadId, ids)),
    db
      .select({ componentId: probeResults.componentId, state: probeResults.state, checkedAt: probeResults.checkedAt })
      .from(probeResults)
      .innerJoin(components, eq(components.id, probeResults.componentId))
      .where(and(inArray(components.workloadId, ids), gte(probeResults.checkedAt, since))),
    db.select({ workloadId: costAllocations.workloadId, total: sql<string>`sum(${costAllocations.amount})`, currency: sql<string>`min(${costAllocations.currency})` }).from(costAllocations).where(and(inArray(costAllocations.workloadId, ids), eq(costAllocations.period, period))).groupBy(costAllocations.workloadId),
    db.select().from(backupJobs).where(inArray(backupJobs.workloadId, ids)).orderBy(desc(backupJobs.startedAt)),
    Promise.resolve([] as Array<{ workloadId: string; at: Date }>), // restore_drills K4
    db.select({ workloadId: accessSessions.workloadId, n: sql<number>`count(*)::int` }).from(accessSessions).where(and(inArray(accessSessions.workloadId, ids), isNull(accessSessions.endedAt))).groupBy(accessSessions.workloadId),
  ]);
  const compByW = new Map(comps.map((c) => [c.workloadId, c.id]));
  return ws.map((w) => {
    const cid = compByW.get(w.id);
    const pr = cid ? probes.filter((p) => p.componentId === cid) : [];
    const okCount = pr.filter((p) => p.state === 'ok' || p.state === 'maintenance').length;
    const lb = lastBackups.find((b) => b.workloadId === w.id && b.status !== 'running' && b.status !== 'scheduled');
    const cost = costs.find((c) => c.workloadId === w.id);
    return {
      id: w.id,
      slug: w.slug,
      name: w.name,
      productSlug: w.productSlug,
      status: w.status,
      residency: w.residency as Residency,
      provider: (w.providerCode as ProviderCode | null) ?? null,
      region: w.region,
      size: w.size,
      slaTier: w.slaTier,
      uptime30d: pr.length ? Math.round((okCount / pr.length) * 10000) / 100 : null,
      bars30d: bars(pr),
      lastBackupAt: lb?.finishedAt?.toISOString() ?? null,
      lastBackupOk: lb ? lb.status === 'completed' : null,
      lastVerifiedRestoreAt: drills.find((d) => d.workloadId === w.id)?.at.toISOString() ?? null,
      monthCost: cost ? Number(cost.total) : null,
      costCurrency: cost?.currency ?? 'EUR',
      openAccessSessions: access.find((a) => a.workloadId === w.id)?.n ?? 0,
    };
  });
}

export async function workloadDetailForTenant(tenantId: string, id: string) {
  const w = await getWorkloadForTenant(tenantId, id);
  const [backups, access, revenue, inv] = await Promise.all([
    db.select().from(backupJobs).where(eq(backupJobs.workloadId, id)).orderBy(desc(backupJobs.startedAt)).limit(20),
    db.select().from(accessSessions).where(eq(accessSessions.workloadId, id)).orderBy(desc(accessSessions.startedAt)).limit(20),
    db.select().from(workloadRevenue).where(eq(workloadRevenue.workloadId, id)).orderBy(desc(workloadRevenue.period)).limit(12),
    db.select({ externalId: providerInventory.externalId, kind: providerInventory.kind, name: providerInventory.name, region: providerInventory.region, specs: providerInventory.specs }).from(providerInventory).where(eq(providerInventory.matchedWorkloadId, id)),
  ]);
  const { accessSealed: _a, ...safe } = w;
  return { workload: safe, backups, accessSessions: access, revenue, resources: inv };
}

/**
 * CSV içe aktarım — başlık: tenant_slug,tenant_name,workload_slug,name,product_slug,residency,provider,region,size,sla_tier,monthly_revenue,currency,probe_url,notes
 * Kiracı yoksa oluşturur; iş yükü varsa günceller (upsert). Gelir satırı bu döneme yazılır.
 */
export async function importWorkloadsCsv(csv: string, staffId: string) {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const header = lines.shift()?.split(',').map((h) => h.trim().toLowerCase()) ?? [];
  const need = ['tenant_slug', 'workload_slug', 'name', 'residency'];
  for (const n of need) if (!header.includes(n)) throw ApiError.badRequest(`CSV başlığında '${n}' yok`);
  const period = new Date().toISOString().slice(0, 7);
  const rowSchema = createWorkloadSchema.omit({ tenantId: true });
  const out = { tenantsCreated: 0, workloadsCreated: 0, workloadsUpdated: 0, revenueRows: 0, errors: [] as Array<{ line: number; error: string }> };
  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i]!.split(',').map((c) => c.trim());
    const rec: Record<string, string> = {};
    header.forEach((h, j) => (rec[h] = cols[j] ?? ''));
    try {
      let [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, rec['tenant_slug']!)).limit(1);
      if (!t) {
        const slug = z.string().regex(/^[a-z0-9-]{3,40}$/).parse(rec['tenant_slug']);
        [t] = await db.insert(tenants).values({ slug, name: rec['tenant_name'] || slug, residencyDefault: (rec['residency'] as Residency) || 'TR' }).returning({ id: tenants.id });
        out.tenantsCreated++;
      }
      const parsed = rowSchema.parse({
        slug: rec['workload_slug'],
        name: rec['name'],
        productSlug: rec['product_slug'] || 'legacy',
        residency: rec['residency'],
        providerCode: rec['provider'] || null,
        region: rec['region'] || null,
        size: rec['size'] || null,
        slaTier: rec['sla_tier'] || 'std_9x5',
        probeUrl: rec['probe_url'] || null,
        notes: rec['notes'] || null,
      });
      const [existing] = await db.select({ id: workloads.id }).from(workloads).where(and(eq(workloads.tenantId, t!.id), eq(workloads.slug, parsed.slug))).limit(1);
      let wid: string;
      if (existing) {
        await updateWorkload(existing.id, parsed, staffId);
        wid = existing.id;
        out.workloadsUpdated++;
      } else {
        wid = (await createWorkload({ ...parsed, tenantId: t!.id }, { staffId }, null)).id;
        out.workloadsCreated++;
      }
      if (rec['monthly_revenue']) {
        const amount = Number(rec['monthly_revenue'].replace(',', '.'));
        if (Number.isFinite(amount)) {
          await db
            .insert(workloadRevenue)
            .values({ workloadId: wid, period, amount: String(amount), currency: (rec['currency'] || 'EUR').toUpperCase(), note: 'csv import', enteredBy: staffId })
            .onConflictDoUpdate({ target: [workloadRevenue.workloadId, workloadRevenue.period], set: { amount: String(amount), currency: (rec['currency'] || 'EUR').toUpperCase() } });
          out.revenueRows++;
        }
      }
    } catch (e) {
      out.errors.push({ line: i + 2, error: e instanceof Error ? e.message : String(e) });
    }
  }
  await audit({ actorType: 'staff', actorId: staffId, action: 'workload.import_csv', after: { ...out, errors: out.errors.length } });
  return out;
}

export function isComponentState(s: string): s is ComponentState {
  return ['ok', 'degraded', 'down', 'maintenance', 'unknown'].includes(s);
}
