import type { Actions, PageServerLoad } from './$types';
import { apiFetch } from '$lib/server/api';

export const load: PageServerLoad = async ({ request, url }) => {
  const period = url.searchParams.get('period') ?? new Date().toISOString().slice(0, 7);
  return {
    period,
    rows: await apiFetch<Array<{ sla: { id: string; period: string; slaCode: string; uptimePct: string; uptimeTarget: string; downtimeMin: number; maintenanceMin: number; incidents: number; responseBreaches: number; resolveBreaches: number; creditPct: string; creditAmount: string; currency: string; creditAppliedAt: string | null }; workloadName: string | null; tenantName: string | null }>>(`/ops/sla?period=${period}`, { cookie: request.headers.get('cookie') }),
  };
};

export const actions: Actions = {
  compute: async ({ request }) => {
    const f = await request.formData();
    return { result: await apiFetch('/ops/sla/compute', { method: 'POST', cookie: request.headers.get('cookie'), json: { period: f.get('period') } }) };
  },
};
