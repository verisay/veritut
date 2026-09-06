import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export const load: PageServerLoad = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  const [oncall, maintenance, tenants, workloads] = await Promise.all([
    apiFetch<{ shifts: Array<{ id: string; staffId: string; email: string; name: string; startsAt: string; endsAt: string; level: number }>; current: { email: string; name: string } | null; backup: { email: string; name: string } | null }>('/ops/oncall', { cookie }),
    apiFetch<Array<{ id: string; title: string; body: string; startsAt: string; endsAt: string; customerVisible: boolean; tenantId: string | null }>>('/ops/maintenance', { cookie }),
    apiFetch<Array<{ id: string; name: string }>>('/ops/tenants', { cookie }),
    apiFetch<Array<{ id: string; name: string; tenantName: string }>>('/ops/workloads', { cookie }),
  ]);
  return { ...oncall, maintenance, tenants, workloads };
};

export const actions: Actions = {
  shift: async ({ request }) => {
    const f = await request.formData();
    try {
      await apiFetch('/ops/oncall', { method: 'POST', cookie: request.headers.get('cookie'), json: { staffId: f.get('staffId'), startsAt: new Date(String(f.get('startsAt'))).toISOString(), endsAt: new Date(String(f.get('endsAt'))).toISOString(), escalationLevel: f.get('escalationLevel') } });
      return { ok: true };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message, details: e.body.details });
      throw e;
    }
  },
  deleteShift: async ({ request }) => {
    const f = await request.formData();
    await apiFetch(`/ops/oncall/${f.get('id')}`, { method: 'DELETE', cookie: request.headers.get('cookie') });
    return { ok: true };
  },
  maintenance: async ({ request }) => {
    const f = await request.formData();
    try {
      await apiFetch('/ops/maintenance', { method: 'POST', cookie: request.headers.get('cookie'), json: { tenantId: f.get('tenantId') || null, workloadId: f.get('workloadId') || null, title: f.get('title'), body: f.get('body') ?? '', startsAt: new Date(String(f.get('startsAt'))).toISOString(), endsAt: new Date(String(f.get('endsAt'))).toISOString(), customerVisible: f.get('customerVisible') === 'on' } });
      return { ok: true };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message, details: e.body.details });
      throw e;
    }
  },
};
