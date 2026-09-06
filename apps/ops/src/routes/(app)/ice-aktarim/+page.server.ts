import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';
export const load: PageServerLoad = async ({ request }) => ({
  accounts: (await apiFetch<{ accounts: Array<{ id: string; label: string; providerCode: string }> }>('/ops/provider-accounts', { cookie: request.headers.get('cookie') })).accounts,
});
export const actions: Actions = {
  workloads: async ({ request }) => {
    const f = await request.formData();
    try {
      return { result: await apiFetch('/ops/workloads/import-csv', { method: 'POST', cookie: request.headers.get('cookie'), json: { csv: f.get('csv') } }) };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message });
      throw e;
    }
  },
  invoice: async ({ request }) => {
    const f = await request.formData();
    try {
      return { invoice: await apiFetch('/ops/cost/invoice-csv', { method: 'POST', cookie: request.headers.get('cookie'), json: { providerAccountId: f.get('providerAccountId'), period: f.get('period'), csv: f.get('csv') } }) };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message });
      throw e;
    }
  },
};
