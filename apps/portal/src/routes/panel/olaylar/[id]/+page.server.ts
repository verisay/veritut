import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export const load: PageServerLoad = async ({ request, params, parent }) => {
  const { activeTenant } = await parent();
  if (!activeTenant) error(404, 'Bulunamadı');
  try {
    return await apiFetch<{ incident: { id: string; number: number; title: string; summary: string; severity: string; status: string; createdAt: string; resolvedAt: string | null }; updates: Array<{ id: string; body: string; author: string; createdAt: string }>; workloads: Array<{ id: string; name: string }> }>(`/guvence/incidents/${params.id}`, { cookie: request.headers.get('cookie'), tenantId: activeTenant.id });
  } catch (e) {
    if (e instanceof ServerApiError && e.status === 404) error(404, 'Bulunamadı');
    throw e;
  }
};
