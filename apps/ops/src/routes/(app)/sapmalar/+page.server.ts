import type { Actions, PageServerLoad } from './$types';
import { apiFetch } from '$lib/server/api';

export const load: PageServerLoad = async ({ request, url }) => ({
  rows: await apiFetch<Array<{ drift: { id: string; hasDrift: boolean; diff: { add: number; change: number; destroy: number; replace: number; resources: Array<{ address: string; action: string }> }; acknowledgedBy: string | null; acknowledgedAt: string | null; createdAt: string; runId: string | null }; workloadName: string; workloadSlug: string }>>(`/ops/drift${url.searchParams.get('yeni') === '1' ? '?yeni=1' : ''}`, { cookie: request.headers.get('cookie') }),
  yeni: url.searchParams.get('yeni') === '1',
});

export const actions: Actions = {
  ack: async ({ request }) => {
    const f = await request.formData();
    await apiFetch(`/ops/drift/${f.get('id')}/acknowledge`, { method: 'POST', cookie: request.headers.get('cookie'), json: {} });
    return { ok: true };
  },
  scan: async ({ request }) => ({ scan: await apiFetch('/ops/drift/scan', { method: 'POST', cookie: request.headers.get('cookie'), json: {} }) }),
};
