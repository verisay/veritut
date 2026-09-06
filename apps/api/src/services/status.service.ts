import { and, asc, eq, isNotNull, isNull, sql, inArray } from 'drizzle-orm';
import type { ComponentState, StatusSnapshot } from '@veritut/types';
import type { ProbeResults } from '@veritut/validators';
import { db } from '../db/db.js';
import { components, probeResults, tenants } from '../db/schema/index.js';
import { redis } from '../redis.js';
import { queueCounts } from '../queues.js';

/** Worker probe sonuçlarını yazar, Redis `status:platform` snapshot'ını üretir (D14). */
export const PLATFORM_SNAPSHOT_KEY = 'status:platform';

export async function listPlatformComponents() {
  return db.select().from(components).where(isNull(components.tenantId)).orderBy(asc(components.sort));
}

export async function applyProbeResults(p: ProbeResults): Promise<StatusSnapshot> {
  for (const r of p.results) {
    await db
      .update(components)
      .set({ state: r.state, latencyMs: r.latencyMs, checkedAt: new Date(r.checkedAt) })
      .where(sql`${components.slug} = ${r.componentSlug} AND ${components.tenantId} IS NULL`);
  }
  return refreshPlatformSnapshot();
}

/** Genel durum: down > degraded > maintenance > ok. `unknown` bileşenler bilinenleri gölgelemez; hiç bilinen yoksa unknown. */
function worst(states: ComponentState[]): StatusSnapshot['overall'] {
  if (states.includes('down')) return 'down';
  if (states.includes('degraded')) return 'degraded';
  if (states.includes('maintenance')) return 'maintenance';
  if (states.includes('ok')) return 'ok';
  return 'unknown';
}

export async function refreshPlatformSnapshot(): Promise<StatusSnapshot> {
  // Probe URL'siz `runner` bileşeni: provizyon kuyruğu erişilebilirse ok (K2'de runner heartbeat'i gelir).
  const q = await queueCounts();
  const runnerState: ComponentState = (q['provision']?.waiting ?? -1) >= 0 ? 'ok' : 'down';
  await setComponentState('runner', runnerState);
  const rows = await listPlatformComponents();
  const snap: StatusSnapshot = {
    generatedAt: new Date().toISOString(),
    overall: worst(rows.map((r) => r.state as ComponentState)),
    components: rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      state: r.state as ComponentState,
      latencyMs: r.latencyMs,
      checkedAt: (r.checkedAt ?? new Date(0)).toISOString(),
    })),
  };
  await redis.set(PLATFORM_SNAPSHOT_KEY, JSON.stringify(snap), 'EX', 180);
  return snap;
}

export async function setComponentState(slug: string, state: ComponentState): Promise<void> {
  await db.update(components).set({ state, checkedAt: new Date() }).where(sql`${components.slug} = ${slug} AND ${components.tenantId} IS NULL`);
  void eq;
}

/** Tüm probe hedefleri (platform + kiracı) — worker `componentId` ile raporlar. */
export async function listProbeTargets() {
  const rows = await db.select({ id: components.id, slug: components.slug, probeUrl: components.probeUrl, tenantId: components.tenantId }).from(components).where(sql`${components.probeUrl} IS NOT NULL`);
  return rows.map((r) => ({ componentId: r.id, slug: r.slug, probeUrl: r.probeUrl!, scope: r.tenantId ? 'tenant' : 'platform' }));
}

export async function applyProbeResultsV2(results: Array<{ componentId: string; state: ComponentState; latencyMs: number | null; checkedAt: string }>): Promise<{ platform: StatusSnapshot; tenants: number }> {
  for (const r of results) {
    await db.update(components).set({ state: r.state, latencyMs: r.latencyMs, checkedAt: new Date(r.checkedAt) }).where(eq(components.id, r.componentId));
  }
  await db.insert(probeResults).values(results.map((r) => ({ componentId: r.componentId, state: r.state, latencyMs: r.latencyMs, checkedAt: new Date(r.checkedAt) })));
  const platform = await refreshPlatformSnapshot();
  const touched = await db.select({ tenantId: components.tenantId }).from(components).where(and(inArray(components.id, results.map((r) => r.componentId)), isNotNull(components.tenantId)));
  const tenantIds = [...new Set(touched.map((t) => t.tenantId!))];
  for (const tid of tenantIds) await refreshTenantSnapshot(tid);
  return { platform, tenants: tenantIds.length };
}

/** Kiracı snapshot'ı `status:tenant:<slug>` — yalnız o kiracının bileşenleri (D14 izolasyon). */
export async function refreshTenantSnapshot(tenantId: string): Promise<StatusSnapshot | null> {
  const [t] = await db.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!t) return null;
  const rows = await db.select().from(components).where(eq(components.tenantId, tenantId)).orderBy(asc(components.sort), asc(components.name));
  const snap: StatusSnapshot = {
    generatedAt: new Date().toISOString(),
    overall: worst(rows.map((r) => r.state as ComponentState)),
    components: rows.map((r) => ({ slug: r.slug, name: r.name, state: r.state as ComponentState, latencyMs: r.latencyMs, checkedAt: (r.checkedAt ?? new Date(0)).toISOString() })),
  };
  await redis.set(`status:tenant:${t.slug}`, JSON.stringify(snap), 'EX', 300);
  return snap;
}

/** probe_results saklama: 90 gün (cron). */
export async function pruneProbeResults(): Promise<void> {
  await db.execute(sql`DELETE FROM probe_results WHERE checked_at < now() - interval '90 days'`);
}
