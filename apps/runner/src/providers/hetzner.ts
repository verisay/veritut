import type { InventoryItem, ProviderCapabilities, Residency } from '@veritut/types';
import type { IProviderDriver } from './types.js';

/**
 * Hetzner Cloud driver — hcloud API (fetch, SDK yok). Maliyet: `/pricing` × envanter (aylık brüt, EUR).
 * Fatura CSV'si ayrıca ops'tan içe aktarılır (gerçek maliyet tahmini ezer).
 */
const BASE = 'https://api.hetzner.cloud/v1';
const REGION_RESIDENCY: Record<string, Residency> = { fsn1: 'EU', nbg1: 'EU', hel1: 'EU', ash: 'US', hil: 'US', sin: 'EU' };

interface HcPricing {
  pricing: {
    server_types: Array<{ id: number; name: string; prices: Array<{ location: string; price_monthly: { gross: string } }> }>;
    volume: { price_per_gb_month: { gross: string } };
    primary_ips: Array<{ type: string; prices: Array<{ location: string; price_monthly: { gross: string } }> }>;
    load_balancer_types: Array<{ id: number; name: string; prices: Array<{ location: string; price_monthly: { gross: string } }> }>;
  };
}

async function hc<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`hcloud ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

async function all<T>(path: string, key: string, token: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page < 50; page++) {
    const j = await hc<Record<string, unknown> & { meta?: { pagination?: { next_page: number | null } } }>(`${path}?per_page=50&page=${page}`, token);
    out.push(...((j[key] as T[]) ?? []));
    if (!j.meta?.pagination?.next_page) break;
  }
  return out;
}

export const hetznerDriver: IProviderDriver = {
  code: 'hetzner',
  async capabilities(): Promise<ProviderCapabilities> {
    return {
      code: 'hetzner',
      regions: [
        { code: 'fsn1', residency: 'EU', name: 'Falkenstein' },
        { code: 'nbg1', residency: 'EU', name: 'Nürnberg' },
        { code: 'hel1', residency: 'EU', name: 'Helsinki' },
        { code: 'ash', residency: 'US', name: 'Ashburn' },
        { code: 'hil', residency: 'US', name: 'Hillsboro' },
      ],
      sizes: ['cx22', 'cx32', 'cx42', 'cx52', 'cpx11', 'cpx21', 'cpx31', 'cpx41', 'cpx51'],
    };
  },
  async healthcheck(creds) {
    try {
      await hc('/locations', creds['token'] ?? '');
      return true;
    } catch {
      return false;
    }
  },
  async listInventory(creds): Promise<InventoryItem[]> {
    const token = creds['token'];
    if (!token) throw new Error('hetzner: `token` kimlik alanı yok');
    const [pricing, servers, volumes, ips, lbs] = await Promise.all([
      hc<HcPricing>('/pricing', token),
      all<{ id: number; name: string; status: string; server_type: { name: string; cores: number; memory: number; disk: number }; datacenter: { location: { name: string } }; labels: Record<string, string>; public_net: { ipv4: { ip: string } | null } }>('/servers', 'servers', token),
      all<{ id: number; name: string; size: number; status: string; location: { name: string }; labels: Record<string, string>; server: number | null }>('/volumes', 'volumes', token),
      all<{ id: number; name: string; type: string; ip: string; datacenter: { location: { name: string } }; assignee_id: number | null; labels: Record<string, string> }>('/primary_ips', 'primary_ips', token),
      all<{ id: number; name: string; load_balancer_type: { name: string }; location: { name: string }; labels: Record<string, string> }>('/load_balancers', 'load_balancers', token),
    ]);
    const price = (list: Array<{ name: string; prices: Array<{ location: string; price_monthly: { gross: string } }> }>, name: string, loc: string): number | null => {
      const t = list.find((x) => x.name === name);
      const p = t?.prices.find((x) => x.location === loc) ?? t?.prices[0];
      return p ? Number(p.price_monthly.gross) : null;
    };
    const items: InventoryItem[] = [];
    for (const s of servers) {
      const loc = s.datacenter.location.name;
      items.push({ externalId: `server:${s.id}`, kind: 'server', name: s.name, region: loc, residency: REGION_RESIDENCY[loc] ?? null, status: s.status, specs: { serverType: s.server_type.name, cores: s.server_type.cores, memoryGb: s.server_type.memory, diskGb: s.server_type.disk, ipv4: s.public_net.ipv4?.ip ?? null }, tags: s.labels ?? {}, monthlyCostEstimate: price(pricing.pricing.server_types, s.server_type.name, loc), currency: 'EUR' });
    }
    const gb = Number(pricing.pricing.volume.price_per_gb_month.gross);
    for (const v of volumes) {
      items.push({ externalId: `volume:${v.id}`, kind: 'volume', name: v.name, region: v.location.name, residency: REGION_RESIDENCY[v.location.name] ?? null, status: v.status, specs: { sizeGb: v.size, attachedServer: v.server }, tags: v.labels ?? {}, monthlyCostEstimate: Math.round(v.size * gb * 100) / 100, currency: 'EUR' });
    }
    for (const ip of ips) {
      const loc = ip.datacenter.location.name;
      const unassigned = ip.assignee_id === null;
      items.push({ externalId: `ip:${ip.id}`, kind: 'ip', name: `${ip.name} (${ip.ip})`, region: loc, residency: REGION_RESIDENCY[loc] ?? null, status: unassigned ? 'unassigned' : 'assigned', specs: { type: ip.type, ip: ip.ip, assigneeId: ip.assignee_id }, tags: ip.labels ?? {}, monthlyCostEstimate: unassigned ? price(pricing.pricing.primary_ips.map((p) => ({ name: p.type, prices: p.prices })), ip.type, loc) : 0, currency: 'EUR' });
    }
    for (const lb of lbs) {
      items.push({ externalId: `lb:${lb.id}`, kind: 'load_balancer', name: lb.name, region: lb.location.name, residency: REGION_RESIDENCY[lb.location.name] ?? null, status: 'running', specs: { type: lb.load_balancer_type.name }, tags: lb.labels ?? {}, monthlyCostEstimate: price(pricing.pricing.load_balancer_types, lb.load_balancer_type.name, lb.location.name), currency: 'EUR' });
    }
    return items;
  },
};
