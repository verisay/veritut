/**
 * Aktör modeli (plan §1.3). İki realm'in kullanıcıları hiçbir tabloda karışmaz:
 * kiracı kullanıcıları `users`/`tenant_members`, personel `staff`.
 */
export const TENANT_ROLES = ['owner', 'admin', 'technical', 'billing', 'viewer'] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

export const STAFF_ROLES = ['operator', 'senior', 'platform_admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const REALMS = ['musteri', 'ops'] as const;
export type Realm = (typeof REALMS)[number];

/** Kiracı rolü sıralaması — `atLeast(role, 'admin')` karşılaştırmaları için. */
const TENANT_RANK: Record<TenantRole, number> = { viewer: 0, billing: 1, technical: 2, admin: 3, owner: 4 };
export function tenantRoleAtLeast(role: TenantRole, min: TenantRole): boolean {
  return TENANT_RANK[role] >= TENANT_RANK[min];
}

const STAFF_RANK: Record<StaffRole, number> = { operator: 0, senior: 1, platform_admin: 2 };
export function staffRoleAtLeast(role: StaffRole, min: StaffRole): boolean {
  return STAFF_RANK[role] >= STAFF_RANK[min];
}

export const RESIDENCIES = ['TR', 'EU', 'US'] as const;
export type Residency = (typeof RESIDENCIES)[number];

export const PROVIDERS = ['hetzner', 'aws', 'gcp', 'cloudflare', 'trdc', 'mock'] as const;
export type ProviderCode = (typeof PROVIDERS)[number];

export const COMPONENT_STATES = ['ok', 'degraded', 'down', 'maintenance', 'unknown'] as const;
export type ComponentState = (typeof COMPONENT_STATES)[number];
