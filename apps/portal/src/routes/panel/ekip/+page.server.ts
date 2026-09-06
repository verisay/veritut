import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export const load: PageServerLoad = async ({ request, parent }) => {
  const { activeTenant } = await parent();
  if (!activeTenant) return { members: [], invitations: [], canManage: false, isOwner: false };
  const cookie = request.headers.get('cookie');
  const canManage = activeTenant.role === 'owner' || activeTenant.role === 'admin';
  const [members, invitations] = await Promise.all([
    apiFetch<Array<{ userId: string; email: string; displayName: string; role: string; since: string }>>('/tenants/current/members', { cookie, tenantId: activeTenant.id }),
    canManage ? apiFetch<Array<{ id: string; email: string; role: string; expiresAt: string; acceptedAt: string | null }>>('/tenants/current/invitations', { cookie, tenantId: activeTenant.id }) : Promise.resolve([]),
  ]);
  return { members, invitations, canManage, isOwner: activeTenant.role === 'owner' };
};

export const actions: Actions = {
  invite: async ({ request, cookies }) => {
    const f = await request.formData();
    try {
      const r = await apiFetch<{ token?: string }>('/tenants/current/invitations', { method: 'POST', cookie: request.headers.get('cookie'), tenantId: cookies.get('vt_tenant'), json: { email: f.get('email'), role: f.get('role') } });
      return { invited: true, devToken: r.token ?? null };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message, details: e.body.details });
      throw e;
    }
  },
  role: async ({ request, cookies }) => {
    const f = await request.formData();
    try {
      await apiFetch(`/tenants/current/members/${f.get('userId')}`, { method: 'PATCH', cookie: request.headers.get('cookie'), tenantId: cookies.get('vt_tenant'), json: { role: f.get('role') } });
      return { ok: true };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message });
      throw e;
    }
  },
  remove: async ({ request, cookies }) => {
    const f = await request.formData();
    try {
      await apiFetch(`/tenants/current/members/${f.get('userId')}`, { method: 'DELETE', cookie: request.headers.get('cookie'), tenantId: cookies.get('vt_tenant') });
      return { ok: true };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message });
      throw e;
    }
  },
};
