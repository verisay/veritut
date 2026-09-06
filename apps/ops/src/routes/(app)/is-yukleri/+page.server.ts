import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export const load: PageServerLoad = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  const [workloads, tenants] = await Promise.all([
    apiFetch<Array<{ id: string; tenantName: string; tenantSlug: string; slug: string; name: string; productSlug: string; residency: 'TR' | 'EU' | 'US'; providerCode: string | null; region: string | null; size: string | null; slaTier: string; status: string; probeUrl: string | null }>>('/ops/workloads', { cookie }),
    apiFetch<Array<{ id: string; name: string }>>('/ops/tenants', { cookie }),
  ]);
  return { workloads, tenants };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const f = await request.formData();
    const body = Object.fromEntries(f) as Record<string, string>;
    try {
      await apiFetch('/ops/workloads', { method: 'POST', cookie: request.headers.get('cookie'), json: { ...body, providerCode: body['providerCode'] || null, region: body['region'] || null, size: body['size'] || null, probeUrl: body['probeUrl'] || null, notes: body['notes'] || null } });
      return { ok: true };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message, details: e.body.details, values: body });
      throw e;
    }
  },
};
