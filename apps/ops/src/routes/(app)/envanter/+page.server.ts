import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export const load: PageServerLoad = async ({ request, url }) => {
  const cookie = request.headers.get('cookie');
  const q = url.searchParams.get('sahipsiz') === '1' ? '?sahipsiz=1' : '';
  const [items, workloads, tenants] = await Promise.all([
    apiFetch<Array<Record<string, unknown> & { id: string; providerCode: string; accountLabel: string; externalId: string; kind: string; name: string; region: string | null; residency: string | null; status: string; monthlyCostEstimate: string | null; currency: string; matchedWorkloadId: string | null; matchedWorkloadName: string | null; firstSeenAt: string }>>(`/ops/inventory${q}`, { cookie }),
    apiFetch<Array<{ id: string; name: string; tenantName: string; slug: string }>>('/ops/workloads', { cookie }),
    apiFetch<Array<{ id: string; name: string; slug: string }>>('/ops/tenants', { cookie }),
  ]);
  return { items, workloads, tenants, unmatchedOnly: q !== '' };
};

export const actions: Actions = {
  match: async ({ request }) => {
    const f = await request.formData();
    try {
      await apiFetch(`/ops/inventory/${f.get('id')}/match`, { method: 'POST', cookie: request.headers.get('cookie'), json: { workloadId: f.get('workloadId') } });
      return { ok: true };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message });
      throw e;
    }
  },
  create: async ({ request }) => {
    const f = await request.formData();
    try {
      await apiFetch(`/ops/inventory/${f.get('id')}/create-workload`, { method: 'POST', cookie: request.headers.get('cookie'), json: { tenantId: f.get('tenantId'), slug: f.get('slug'), name: f.get('name') } });
      return { ok: true };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message, details: e.body.details });
      throw e;
    }
  },
};
