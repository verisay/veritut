import type { Actions, PageServerLoad } from './$types';
import { apiFetch } from '$lib/server/api';

export const load: PageServerLoad = async ({ request }) => ({
  snapshots: await apiFetch<Array<{ period: string; mrr: string; churnPct: string | null; grossMarginPct: string | null; supportMinPerCustomer: string | null; slaBreaches: number; activeTenants: number; activeWorkloads: number; computedAt: string }>>('/ops/kpi', { cookie: request.headers.get('cookie') }),
});

export const actions: Actions = {
  compute: async ({ request }) => ({ snapshot: await apiFetch('/ops/kpi/compute', { method: 'POST', cookie: request.headers.get('cookie'), json: {} }) }),
  push: async ({ request }) => ({ push: await apiFetch('/ops/billing/push', { method: 'POST', cookie: request.headers.get('cookie'), json: {} }) }),
  trials: async ({ request }) => ({ trials: await apiFetch('/ops/billing/expire-trials', { method: 'POST', cookie: request.headers.get('cookie'), json: {} }) }),
};
