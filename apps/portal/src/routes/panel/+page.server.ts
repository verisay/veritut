import { fail, redirect } from '@sveltejs/kit';
import { createTenantSchema } from '@veritut/validators';
import type { WorkloadHealthCard } from '@veritut/types';
import type { Actions, PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export const load: PageServerLoad = async ({ request, parent }) => {
  const { activeTenant } = await parent();
  if (!activeTenant) return { cards: [] as WorkloadHealthCard[] };
  return { cards: await apiFetch<WorkloadHealthCard[]>('/workloads', { cookie: request.headers.get('cookie'), tenantId: activeTenant.id }) };
};

/** İlk kiracı — JS'siz çalışan sunucu action'ı (KD deseni). */
export const actions: Actions = {
  createTenant: async ({ request, cookies }) => {
    const form = await request.formData();
    const parsed = createTenantSchema.safeParse({ name: form.get('name'), slug: form.get('slug'), residencyDefault: form.get('residencyDefault') ?? 'TR' });
    if (!parsed.success) return fail(422, { errors: parsed.error.flatten().fieldErrors, values: Object.fromEntries(form) });
    try {
      const t = await apiFetch<{ id: string }>('/tenants', { method: 'POST', json: parsed.data, cookie: request.headers.get('cookie') });
      cookies.set('vt_tenant', t.id, { path: '/', sameSite: 'lax', httpOnly: false });
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message, values: Object.fromEntries(form) });
      throw e;
    }
    redirect(303, '/panel');
  },
};
