import type { Actions, PageServerLoad } from './$types';
import { apiFetch } from '$lib/server/api';

export const load: PageServerLoad = async ({ request }) => ({
  data: await apiFetch<{
    events: Array<{ id: string; seq: number; kind: string; subjectType: string; subjectId: string; occurredAt: string; hash: string; actor: string }>;
    verdict: { ok: boolean; checked: number; brokenAt: number | null; lastHash: string | null };
  }>('/ops/evidence/platform', { cookie: request.headers.get('cookie') }),
});

export const actions: Actions = {
  demo: async ({ request }) => {
    await apiFetch('/ops/evidence/demo', { method: 'POST', cookie: request.headers.get('cookie'), json: { kind: 'patch.applied', note: 'K0 demo' } });
    return { ok: true };
  },
};
