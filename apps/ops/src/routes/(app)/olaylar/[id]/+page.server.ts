import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export const load: PageServerLoad = async ({ request, params }) => ({
  d: await apiFetch<{
    incident: { id: string; number: number; title: string; summary: string; severity: string; status: string; customerVisible: boolean; slaCode: string | null; responseDueAt: string | null; resolveDueAt: string | null; respondedAt: string | null; resolvedAt: string | null; clockPausedS: number; pausedAt: string | null; responseBreached: boolean; resolveBreached: boolean; escalatedAt: string | null; postmortem: string | null; createdAt: string; tenantId: string | null };
    updates: Array<{ id: string; body: string; status: string | null; customerVisible: boolean; author: string; createdAt: string }>;
    workloads: Array<{ id: string; name: string; slug: string }>;
  }>(`/ops/incidents/${params.id}`, { cookie: request.headers.get('cookie') }),
});

const post = (path: string) => async ({ request, params }: { request: Request; params: { id: string } }) => {
  const f = await request.formData();
  const json = Object.fromEntries([...f.entries()].map(([k, v]) => [k, v === 'on' ? true : v]));
  try {
    return { ok: await apiFetch(`/ops/incidents/${params.id}/${path}`, { method: 'POST', cookie: request.headers.get('cookie'), json }) };
  } catch (e) {
    if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message, details: e.body.details });
    throw e;
  }
};

export const actions: Actions = {
  update: post('updates'),
  resolve: post('resolve'),
  postmortem: post('postmortem'),
  pause: async ({ request, params }) => {
    const f = await request.formData();
    try {
      await apiFetch(`/ops/incidents/${params.id}/pause`, { method: 'POST', cookie: request.headers.get('cookie'), json: { paused: f.get('paused') === 'true' } });
      return { ok: true };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message });
      throw e;
    }
  },
};
