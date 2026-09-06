import type { PageServerLoad } from './$types';
import { apiFetch } from '$lib/server/api';

export const load: PageServerLoad = async ({ request, parent }) => {
  const { activeTenant } = await parent();
  if (!activeTenant) return { events: [], verdict: null };
  const cookie = request.headers.get('cookie');
  const [events, verdict] = await Promise.all([
    apiFetch<Array<{ id: string; seq: number; kind: string; subjectType: string; subjectId: string; occurredAt: string; hash: string; actor: string }>>('/evidence?limit=100', { cookie, tenantId: activeTenant.id }),
    apiFetch<{ ok: boolean; checked: number; brokenAt: number | null; lastHash: string | null }>('/evidence/verify', { cookie, tenantId: activeTenant.id }),
  ]);
  return { events, verdict };
};
