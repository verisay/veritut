import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export const load: PageServerLoad = async ({ request, parent }) => {
  const { activeTenant } = await parent();
  if (!activeTenant) return { tickets: [], workloads: [] };
  const cookie = request.headers.get('cookie');
  const [tickets, workloads] = await Promise.all([
    apiFetch<Array<{ id: string; number: string; title: string; state: string; priority: string; createdAt: string; lastActivityAt: string | null }>>('/support', { cookie, tenantId: activeTenant.id }),
    apiFetch<Array<{ id: string; name: string }>>('/workloads', { cookie, tenantId: activeTenant.id }),
  ]);
  return { tickets, workloads };
};

export const actions: Actions = {
  create: async ({ request, cookies }) => {
    const f = await request.formData();
    let t: { id: string } | null = null;
    try {
      t = await apiFetch<{ id: string }>('/support', { method: 'POST', cookie: request.headers.get('cookie'), tenantId: cookies.get('vt_tenant'), json: { title: f.get('title'), body: f.get('body'), priority: f.get('priority'), workloadId: f.get('workloadId') || null } });
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message, values: Object.fromEntries(f) });
      throw e;
    }
    redirect(303, `/panel/destek/${t.id}`);
  },
};
