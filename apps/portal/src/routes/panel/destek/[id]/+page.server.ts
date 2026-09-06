import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export const load: PageServerLoad = async ({ request, params, parent }) => {
  const { activeTenant } = await parent();
  if (!activeTenant) error(404, 'Bulunamadı');
  try {
    return await apiFetch<{ ticket: { id: string; number: string; title: string; state: string; priority: string; createdAt: string }; messages: Array<{ id: string; author: string; fromCustomer: boolean; body: string; createdAt: string }> }>(`/support/${params.id}`, { cookie: request.headers.get('cookie'), tenantId: activeTenant.id });
  } catch (e) {
    if (e instanceof ServerApiError && e.status === 404) error(404, 'Bulunamadı');
    throw e;
  }
};

export const actions: Actions = {
  reply: async ({ request, params, cookies }) => {
    const f = await request.formData();
    try {
      await apiFetch(`/support/${params.id}/reply`, { method: 'POST', cookie: request.headers.get('cookie'), tenantId: cookies.get('vt_tenant'), json: { body: f.get('body') } });
      return { ok: true };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message });
      throw e;
    }
  },
};
