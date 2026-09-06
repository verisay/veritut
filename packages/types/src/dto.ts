import type { Realm, StaffRole, TenantRole } from './roles.js';

/** `GET /api/v1/auth/me` — portal ve ops aynı şekli farklı realm'le alır. */
export interface MeDto {
  realm: Realm;
  id: string;
  email: string;
  displayName: string;
  /** realm=musteri: üyelikler; realm=ops: boş */
  tenants: Array<{ id: string; slug: string; name: string; role: TenantRole }>;
  /** realm=ops */
  staffRole?: StaffRole;
}

export interface HealthDto {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  redis: 'up' | 'down';
  queues: Record<string, { waiting: number; active: number }>;
  ts: string;
}

/**
 * Status app'in okuduğu Redis snapshot'ı (D14) — API yazar, status yalnız okur.
 * Durum sayfasının gösterdiği HER ŞEY buraya konur; status app'in DB'si yoktur.
 */
export interface StatusSnapshot {
  generatedAt: string;
  overall: 'ok' | 'degraded' | 'down' | 'maintenance' | 'unknown';
  components: Array<{
    slug: string;
    name: string;
    state: 'ok' | 'degraded' | 'down' | 'maintenance' | 'unknown';
    latencyMs: number | null;
    checkedAt: string;
    /** Son 90 günün günlük özeti (eski → bugün); o gün ölçüm yoksa `unknown`. */
    bars90d: Array<'ok' | 'degraded' | 'down' | 'maintenance' | 'unknown'>;
    /** Son 90 günde başarılı sonda oranı (%); hiç ölçüm yoksa null — sıfır yazılmaz. */
    uptime90d: number | null;
  }>;
  /** Müşteriye açık, henüz bitmemiş planlı bakım pencereleri. */
  maintenance: Array<{ id: string; title: string; body: string; startsAt: string; endsAt: string }>;
  /** Son 90 günde çözülmüş, müşteriye açık olaylar — geçmiş şeffaf tutulur. */
  incidents: Array<{ id: string; title: string; summary: string; severity: string; startedAt: string; resolvedAt: string; durationMin: number }>;
}
