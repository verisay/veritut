import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export const load: PageServerLoad = async ({ request, parent }) => {
  const { activeTenant } = await parent();
  if (!activeTenant) return { sla: [], drills: [], channels: [], links: [], maintenance: [], canManage: false };
  const cookie = request.headers.get('cookie');
  const tenantId = activeTenant.id;
  const canManage = ['owner', 'admin'].includes(activeTenant.role);
  const [sla, drills, channels, maintenance] = await Promise.all([
    apiFetch<Array<{ id: string; period: string; slaCode: string; uptimePct: string; uptimeTarget: string; downtimeMin: number; incidents: number; creditAmount: string; currency: string; workloadName: string | null }>>('/guvence/sla', { cookie, tenantId }),
    apiFetch<Array<{ id: string; status: string; scheduledFor: string; checksumOk: boolean | null; appCheckOk: boolean | null; durationS: number | null; finishedAt: string | null; workloadName: string }>>('/guvence/drills', { cookie, tenantId }),
    apiFetch<Array<{ id: string; kind: string; label: string; targetHint: string; events: string[]; active: boolean; lastSentAt: string | null; lastError: string | null }>>('/guvence/channels', { cookie, tenantId }),
    apiFetch<Array<{ id: string; title: string; body: string; startsAt: string; endsAt: string }>>('/guvence/maintenance', { cookie, tenantId }),
  ]);
  const links = canManage ? await apiFetch<Array<{ id: string; label: string; scope: string[]; expiresAt: string; revokedAt: string | null; lastUsedAt: string | null }>>('/guvence/auditor-links', { cookie, tenantId }) : [];
  return { sla, drills, channels, links, maintenance, canManage };
};

export const actions: Actions = {
  channel: async ({ request, cookies }) => {
    const f = await request.formData();
    try {
      await apiFetch('/guvence/channels', { method: 'POST', cookie: request.headers.get('cookie'), tenantId: cookies.get('vt_tenant'), json: { kind: f.get('kind'), label: f.get('label'), target: f.get('target'), events: f.getAll('events') } });
      return { ok: true };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message, details: e.body.details });
      throw e;
    }
  },
  deleteChannel: async ({ request, cookies }) => {
    const f = await request.formData();
    await apiFetch(`/guvence/channels/${f.get('id')}`, { method: 'DELETE', cookie: request.headers.get('cookie'), tenantId: cookies.get('vt_tenant') });
    return { ok: true };
  },
  auditorLink: async ({ request, cookies }) => {
    const f = await request.formData();
    try {
      return { link: await apiFetch<{ url: string; label: string }>('/guvence/auditor-links', { method: 'POST', cookie: request.headers.get('cookie'), tenantId: cookies.get('vt_tenant'), json: { label: f.get('label'), scope: f.getAll('scope'), expiresInDays: Number(f.get('expiresInDays') ?? 30) } }) };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message });
      throw e;
    }
  },
  revokeLink: async ({ request, cookies }) => {
    const f = await request.formData();
    await apiFetch(`/guvence/auditor-links/${f.get('id')}`, { method: 'DELETE', cookie: request.headers.get('cookie'), tenantId: cookies.get('vt_tenant') });
    return { ok: true };
  },
};
