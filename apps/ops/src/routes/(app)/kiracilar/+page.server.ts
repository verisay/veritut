import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';
export const load: PageServerLoad = async ({ request }) => ({
  tenants: await apiFetch<Array<{ id: string; slug: string; name: string; kind: string; residencyDefault: 'TR' | 'EU' | 'US'; status: string; createdAt: string }>>('/ops/tenants', { cookie: request.headers.get('cookie') }),
});
export const actions: Actions = {
  create: async ({ request }) => {
    const f = await request.formData();
    try {
      await apiFetch('/ops/tenants', { method: 'POST', cookie: request.headers.get('cookie'), json: Object.fromEntries(f) });
      return { ok: true };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message });
      throw e;
    }
  },
};
