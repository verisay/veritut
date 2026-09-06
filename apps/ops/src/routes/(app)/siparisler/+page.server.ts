import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export const load: PageServerLoad = async ({ request }) => ({
  rows: await apiFetch<Array<{ order: { id: string; workloadName: string; productSlug: string; planCode: string; slaCode: string; residency: string; size: string; status: string; currency: string; monthly: string; isTrial: boolean; createdAt: string; workloadId: string | null; runId: string | null; rejectReason: string | null }; tenantName: string; tenantSlug: string; planTitle: string | null }>>('/ops/orders', { cookie: request.headers.get('cookie') }),
});

export const actions: Actions = {
  reject: async ({ request }) => {
    const f = await request.formData();
    try {
      await apiFetch(`/ops/orders/${f.get('id')}/reject`, { method: 'POST', cookie: request.headers.get('cookie'), json: { reason: f.get('reason') } });
      return { ok: true };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message });
      throw e;
    }
  },
};
