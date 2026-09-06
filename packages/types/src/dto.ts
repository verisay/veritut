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

/** Status app'in okuduğu Redis snapshot'ı (D14) — worker yazar, status okur. */
export interface StatusSnapshot {
  generatedAt: string;
  overall: 'ok' | 'degraded' | 'down' | 'maintenance' | 'unknown';
  components: Array<{
    slug: string;
    name: string;
    state: 'ok' | 'degraded' | 'down' | 'maintenance' | 'unknown';
    latencyMs: number | null;
    checkedAt: string;
  }>;
}
