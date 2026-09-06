import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export interface IncidentRow {
  incident: { id: string; number: number; title: string; severity: string; status: string; customerVisible: boolean; createdAt: string; responseDueAt: string | null; resolveDueAt: string | null; respondedAt: string | null; resolvedAt: string | null; responseBreached: boolean; resolveBreached: boolean; escalatedAt: string | null; slaCode: string | null };
  tenantName: string | null;
  assignee: string | null;
}

export const load: PageServerLoad = async ({ request, url }) => {
  const cookie = request.headers.get('cookie');
  const acik = url.searchParams.get('acik') === '1';
  const [rows, tenants, workloads, alerts] = await Promise.all([
    apiFetch<IncidentRow[]>(`/ops/incidents${acik ? '?acik=1' : ''}`, { cookie }),
    apiFetch<Array<{ id: string; name: string }>>('/ops/tenants', { cookie }),
    apiFetch<Array<{ id: string; name: string; tenantName: string }>>('/ops/workloads', { cookie }),
    apiFetch<{ alerts: Array<{ id: string; alertname: string; severity: string; status: string; startsAt: string; incidentId: string | null }>; noise: Array<{ alertname: string; n: number; incidents: number }> }>('/ops/alerts', { cookie }),
  ]);
  return { rows, tenants, workloads, alerts, acik };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const f = await request.formData();
    let inc: { id: string } | null = null;
    try {
      inc = await apiFetch<{ id: string }>('/ops/incidents', {
        method: 'POST', cookie: request.headers.get('cookie'),
        json: { title: f.get('title'), summary: f.get('summary') ?? '', severity: f.get('severity'), tenantId: f.get('tenantId') || null, workloadIds: f.getAll('workloadIds').filter(Boolean), customerVisible: f.get('customerVisible') === 'on' },
      });
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message, details: e.body.details });
      throw e;
    }
    redirect(303, `/olaylar/${inc.id}`);
  },
};
