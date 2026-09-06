/**
 * createApiFetch — filo deseni: tüm frontend app'ler API'ye bu wrapper üzerinden konuşur.
 * VERITUT'ta kimlik opak oturum ÇEREZİdir (D6) — Bearer token yok; `credentials: 'include'` yeter.
 */
export interface ApiFetchOptions {
  /** Örn. `/api/v1` (same-origin) veya tam URL (SSR: iç ağ). */
  baseUrl: string;
  /** SvelteKit `load` içinde server-side fetch geçirmek için. */
  fetchImpl?: typeof fetch;
  /** SSR'da tarayıcı çerezlerini iletmek için (Cookie header'ı). */
  headers?: () => Record<string, string>;
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export interface ApiFetch {
  <T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T>;
}

export function createApiFetch(opts: ApiFetchOptions): ApiFetch {
  const doFetch = opts.fetchImpl ?? fetch;
  return async function apiFetch<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
    const { json, headers: initHeaders, ...rest } = init;
    const headers = new Headers(initHeaders);
    headers.set('Accept', 'application/json');
    if (json !== undefined) headers.set('Content-Type', 'application/json');
    for (const [k, v] of Object.entries(opts.headers?.() ?? {})) headers.set(k, v);

    const res = await doFetch(`${opts.baseUrl}${path}`, {
      credentials: 'include',
      ...rest,
      headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });

    if (res.status === 204) return undefined as T;
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const err = (body ?? {}) as { code?: string; message?: string; details?: unknown };
      throw new ApiRequestError(res.status, err.code ?? 'UNKNOWN', err.message ?? `İstek başarısız (${res.status})`, err.details);
    }
    return body as T;
  } as ApiFetch;
}

/** ApiRequestError ise sunucunun Türkçe mesajını, değilse bağlantı hatası metnini döner. */
export function apiErrorMessage(e: unknown): string {
  if (e instanceof ApiRequestError) return e.message;
  return 'Bağlantı hatası — lütfen tekrar deneyin.';
}
