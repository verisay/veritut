import { env } from '$env/dynamic/private';

/**
 * SSR fetch — container içinden dış HTTPS host'a dönüş çalışmaz (hairpin); iç ağdan API'ye gider.
 * Tarayıcı çerezi (vt_portal) `cookie` ile iletilir; kiracı bağlamı `tenantId` → X-Tenant-Id.
 */
const BASE = `${env.API_URL ?? 'http://localhost:4400'}/api/v1`;

export class ServerApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: { code?: string; message?: string; details?: unknown },
  ) {
    super(body.message ?? `API ${status}`);
  }
}

export interface ServerFetchOpts {
  cookie?: string | null;
  tenantId?: string | null;
  method?: string;
  json?: unknown;
}

export async function apiFetch<T>(path: string, o: ServerFetchOpts = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (o.cookie) headers['Cookie'] = o.cookie;
  if (o.tenantId) headers['X-Tenant-Id'] = o.tenantId;
  if (o.json !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { method: o.method ?? 'GET', headers, body: o.json !== undefined ? JSON.stringify(o.json) : undefined });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string; details?: unknown };
  if (!res.ok) throw new ServerApiError(res.status, body);
  return body as T;
}
