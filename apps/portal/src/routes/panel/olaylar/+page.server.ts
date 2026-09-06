import type { PageServerLoad } from './$types';
import { apiFetch } from '$lib/server/api';

export const load: PageServerLoad = async ({ request, parent }) => {
  const { activeTenant } = await parent();
  if (!activeTenant) return { incidents: [] };
  return { incidents: await apiFetch<Array<{ id: string; number: number; title: string; severity: string; status: string; createdAt: string; resolvedAt: string | null }>>('/guvence/incidents', { cookie: request.headers.get('cookie'), tenantId: activeTenant.id }) };
};
