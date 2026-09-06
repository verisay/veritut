import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export const load: PageServerLoad = async ({ request, parent }) => {
  const { activeTenant } = await parent();
  if (!activeTenant || !['owner', 'admin'].includes(activeTenant.role)) return { keys: [], canManage: false };
  try {
    return { keys: await apiFetch<Array<{ id: string; name: string; keyPrefix: string; scopes: string[]; ipAllow: string[]; lastUsedAt: string | null; expiresAt: string | null; revokedAt: string | null; createdAt: string }>>('/api-keys', { cookie: request.headers.get('cookie'), tenantId: activeTenant.id }), canManage: true };
  } catch (e) {
    if (e instanceof ServerApiError) return { keys: [], canManage: true, loadError: e.body.message };
    throw e;
  }
};

export const actions: Actions = {
  create: async ({ request, cookies }) => {
    const f = await request.formData();
    try {
      const r = await apiFetch<{ token: string; name: string }>('/api-keys', { method: 'POST', cookie: request.headers.get('cookie'), tenantId: cookies.get('vt_tenant'), json: { name: f.get('name'), scopes: f.getAll('scopes'), ipAllow: String(f.get('ipAllow') ?? '').split(',').map((s) => s.trim()).filter(Boolean), expiresInDays: f.get('expiresInDays') ? Number(f.get('expiresInDays')) : null } });
      return { created: r };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message, details: e.body.details });
      throw e;
    }
  },
  revoke: async ({ request, cookies }) => {
    const f = await request.formData();
    try {
      await apiFetch(`/api-keys/${f.get('id')}`, { method: 'DELETE', cookie: request.headers.get('cookie'), tenantId: cookies.get('vt_tenant') });
      return { revoked: true };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message });
      throw e;
    }
  },
};
