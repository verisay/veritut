import type { PageServerLoad } from './$types';
import { apiFetch } from '$lib/server/api';
import type { Actions } from './$types';

export const load: PageServerLoad = async ({ request, url }) => {
  const period = url.searchParams.get('period') ?? new Date().toISOString().slice(0, 7);
  return { report: await apiFetch<{ period: string; rows: Array<{ tenantId: string; tenantName: string; workloadId: string; workloadName: string; productSlug: string; providerCode: string | null; revenue: number | null; revenueCurrency: string | null; cost: number; costCurrency: string | null; costMethod: string; marginPct: number | null; flag: string }>; totals: { revenueTry: number; costTry: number; marginPct: number | null; flagged: number } }>(`/ops/margin?period=${period}`, { cookie: request.headers.get('cookie') }) };
};

export const actions: Actions = {
  fx: async ({ request }) => {
    const f = await request.formData();
    await apiFetch('/ops/fx', { method: 'PUT', cookie: request.headers.get('cookie'), json: { period: f.get('period'), currency: f.get('currency'), toTry: f.get('toTry') } });
    return { ok: true };
  },
};
