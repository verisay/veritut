import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

/** Denetçi görünümü — kimliksiz, süreli token. Portal oturumu GEREKMEZ. */
export const load: PageServerLoad = async ({ params }) => {
  try {
    return { view: await apiFetch<{ tenant: { name: string; slug: string }; label: string; scope: string[]; chain?: { ok: boolean; checked: number; lastHash: string | null; brokenAt: number | null }; sla?: Array<{ period: string; uptimePct: number; target: number; incidents: number; responseBreaches: number; resolveBreaches: number }>; documents: Array<{ id: string; kind: string; period: string | null; title: string; sha256: string; createdAt: string }> }>(`/denetci/${params.token}`), token: params.token };
  } catch (e) {
    if (e instanceof ServerApiError && e.status === 404) error(404, 'Bağlantı geçersiz veya süresi dolmuş');
    throw e;
  }
};
