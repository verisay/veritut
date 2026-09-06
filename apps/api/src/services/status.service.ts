import { and, asc, desc, eq, gte, isNotNull, isNull, sql, inArray } from 'drizzle-orm';
import type { ComponentState, StatusSnapshot } from '@veritut/types';
import type { ProbeResults } from '@veritut/validators';
import { db } from '../db/db.js';
import { components, incidents, maintenanceWindows, probeResults, tenants } from '../db/schema/index.js';
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

/** Durum sayfası çubuk penceresi — probe_results saklama süresiyle aynı (90 gün). */
const BAR_DAYS = 90;

type DayState = ComponentState;
interface ComponentHistory {
  bars90d: DayState[];
  uptime90d: number | null;
}

/**
 * Bileşen başına 90 günlük günlük özet. Bir günde tek bir kötü sonda o günü boyar
 * (durum sayfası geleneği): down > degraded > maintenance > ok. Ölçümsüz gün `unknown`.
 */
async function componentHistory(componentIds: string[]): Promise<Map<string, ComponentHistory>> {
  const out = new Map<string, ComponentHistory>();
  const empty = (): ComponentHistory => ({ bars90d: Array.from({ length: BAR_DAYS }, (): DayState => 'unknown'), uptime90d: null });
  for (const id of componentIds) out.set(id, empty());
  if (componentIds.length === 0) return out;

  const since = new Date(Date.now() - BAR_DAYS * 86400000);
  const rows = await db
    .select({
      componentId: probeResults.componentId,
      daysAgo: sql<number>`(now()::date - ${probeResults.checkedAt}::date)::int`,
      dayState: sql<string>`CASE
        WHEN bool_or(${probeResults.state} = 'down') THEN 'down'
        WHEN bool_or(${probeResults.state} = 'degraded') THEN 'degraded'
        WHEN bool_or(${probeResults.state} = 'maintenance') THEN 'maintenance'
        WHEN bool_or(${probeResults.state} = 'ok') THEN 'ok'
        ELSE 'unknown'
      END`,
      okN: sql<number>`count(*) FILTER (WHERE ${probeResults.state} = 'ok')::int`,
      totalN: sql<number>`count(*)::int`,
    })
    .from(probeResults)
    .where(and(inArray(probeResults.componentId, componentIds), gte(probeResults.checkedAt, since)))
    .groupBy(probeResults.componentId, sql`2`);

  const tally = new Map<string, { ok: number; total: number }>();
  for (const r of rows) {
    const h = out.get(r.componentId);
    if (!h) continue;
    // daysAgo 0 = bugün → dizinin SON elemanı (eski → bugün sıralaması).
    const idx = BAR_DAYS - 1 - Number(r.daysAgo);
    if (idx >= 0 && idx < BAR_DAYS) h.bars90d[idx] = r.dayState as DayState;
    const t = tally.get(r.componentId) ?? { ok: 0, total: 0 };
    tally.set(r.componentId, { ok: t.ok + Number(r.okN), total: t.total + Number(r.totalN) });
  }
  for (const [id, t] of tally) {
    const h = out.get(id);
    if (h && t.total > 0) h.uptime90d = Math.round((t.ok / t.total) * 10000) / 100;
  }
  return out;
}

/** Müşteriye açık, henüz bitmemiş bakım pencereleri. `tenantId` null → platform geneli. */
async function visibleMaintenance(tenantId: string | null): Promise<StatusSnapshot['maintenance']> {
  const rows = await db
    .select({ id: maintenanceWindows.id, title: maintenanceWindows.title, body: maintenanceWindows.body, startsAt: maintenanceWindows.startsAt, endsAt: maintenanceWindows.endsAt })
    .from(maintenanceWindows)
    .where(and(eq(maintenanceWindows.customerVisible, true), tenantId === null ? isNull(maintenanceWindows.tenantId) : eq(maintenanceWindows.tenantId, tenantId), gte(maintenanceWindows.endsAt, new Date())))
    .orderBy(asc(maintenanceWindows.startsAt))
    .limit(10);
  return rows.map((r) => ({ id: r.id, title: r.title, body: r.body, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString() }));
}

/** Son 90 günde çözülmüş, müşteriye açık olaylar — "hata yaptık, düzelttik" geçmişi. */
async function resolvedIncidents(tenantId: string | null): Promise<StatusSnapshot['incidents']> {
  const since = new Date(Date.now() - BAR_DAYS * 86400000);
  const rows = await db
    .select({ id: incidents.id, title: incidents.title, summary: incidents.summary, severity: incidents.severity, createdAt: incidents.createdAt, resolvedAt: incidents.resolvedAt })
    .from(incidents)
    .where(and(eq(incidents.customerVisible, true), isNotNull(incidents.resolvedAt), gte(incidents.resolvedAt, since), tenantId === null ? isNull(incidents.tenantId) : eq(incidents.tenantId, tenantId)))
    .orderBy(desc(incidents.resolvedAt))
    .limit(10);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    severity: r.severity,
    startedAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt!.toISOString(),
    durationMin: Math.max(0, Math.round((r.resolvedAt!.getTime() - r.createdAt.getTime()) / 60000)),
  }));
}

export async function refreshPlatformSnapshot(): Promise<StatusSnapshot> {
  // Probe URL'siz `runner` bileşeni: provizyon kuyruğu erişilebilirse ok (K2'de runner heartbeat'i gelir).
  const q = await queueCounts();
  const runnerState: ComponentState = (q['provision']?.waiting ?? -1) >= 0 ? 'ok' : 'down';
  await setComponentState('runner', runnerState);
  const rows = await listPlatformComponents();
  const [history, maintenance, incidentHistory] = await Promise.all([
    componentHistory(rows.map((r) => r.id)),
    visibleMaintenance(null),
    resolvedIncidents(null),
  ]);
  const snap: StatusSnapshot = {
    generatedAt: new Date().toISOString(),
    overall: worst(rows.map((r) => r.state as ComponentState)),
    components: rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      state: r.state as ComponentState,
      latencyMs: r.latencyMs,
      checkedAt: (r.checkedAt ?? new Date(0)).toISOString(),
      bars90d: history.get(r.id)?.bars90d ?? [],
      uptime90d: history.get(r.id)?.uptime90d ?? null,
    })),
    maintenance,
    incidents: incidentHistory,
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
  const [history, maintenance, incidentHistory] = await Promise.all([
    componentHistory(rows.map((r) => r.id)),
    visibleMaintenance(tenantId),
    resolvedIncidents(tenantId),
  ]);
  const snap: StatusSnapshot = {
    generatedAt: new Date().toISOString(),
    overall: worst(rows.map((r) => r.state as ComponentState)),
    components: rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      state: r.state as ComponentState,
      latencyMs: r.latencyMs,
      checkedAt: (r.checkedAt ?? new Date(0)).toISOString(),
      bars90d: history.get(r.id)?.bars90d ?? [],
      uptime90d: history.get(r.id)?.uptime90d ?? null,
    })),
    maintenance,
    incidents: incidentHistory,
  };
  await redis.set(`status:tenant:${t.slug}`, JSON.stringify(snap), 'EX', 300);
  return snap;
}

/** probe_results saklama: 90 gün (cron). */
export async function pruneProbeResults(): Promise<void> {
  await db.execute(sql`DELETE FROM probe_results WHERE checked_at < now() - interval '90 days'`);
}
