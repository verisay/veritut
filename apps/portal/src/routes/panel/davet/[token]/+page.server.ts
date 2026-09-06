import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

/** Davet kabulü: oturum layout'ta kuruldu (Keycloak); token oturumdaki e-postayla eşleşmeli. */
export const load: PageServerLoad = async ({ request, params, cookies }) => {
  try {
    const r = await apiFetch<{ tenantId: string; role: string }>('/me/invitations/accept', { method: 'POST', cookie: request.headers.get('cookie'), json: { token: params.token } });
    cookies.set('vt_tenant', r.tenantId, { path: '/', sameSite: 'lax', httpOnly: false });
  } catch (e) {
    if (e instanceof ServerApiError) return { error: e.body.message ?? 'Davet kabul edilemedi' };
    throw e;
  }
  redirect(303, '/panel');
};
