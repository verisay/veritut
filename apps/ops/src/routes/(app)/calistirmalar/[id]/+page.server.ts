import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export interface RunDetail {
  run: { id: string; kind: string; status: string; risk: string; createdAt: string; startedAt: string | null; finishedAt: string | null; exitCode: number | null; summary: Record<string, unknown>; planSummary: { add: number; change: number; destroy: number; replace: number; resources: Array<{ address: string; action: string }> } | null; approvedBy: string | null; rejectedReason: string | null; triggeredByStaff: string | null; workloadId: string | null };
  steps: Array<{ step: string; status: string; summary: string | null; startedAt: string; finishedAt: string | null }>;
  log: Array<{ id: string; t: string; line: string; level: string }>;
}
/** Kuyruk rayı — tasarımdaki sol sütun; aynı listeden beslenir. */
export interface RunRow { id: string; kind: string; status: string; risk: string; createdAt: string; finishedAt: string | null; exitCode: number | null }

export const load: PageServerLoad = async ({ request, params }) => {
  const cookie = request.headers.get('cookie');
  const [detail, queue] = await Promise.all([
    apiFetch<RunDetail>(`/ops/runs/${params.id}`, { cookie }),
    apiFetch<RunRow[]>('/ops/runs', { cookie }).catch((): RunRow[] => []),
  ]);
  return { detail, queue };
};

export const actions: Actions = {
  approve: async ({ request, params }) => {
    try { await apiFetch(`/ops/runs/${params.id}/approve`, { method: 'POST', cookie: request.headers.get('cookie'), json: {} }); return { ok: true }; }
    catch (e) { if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message }); throw e; }
  },
  reject: async ({ request, params }) => {
    const f = await request.formData();
    try { await apiFetch(`/ops/runs/${params.id}/reject`, { method: 'POST', cookie: request.headers.get('cookie'), json: { reason: f.get('reason') } }); return { ok: true }; }
    catch (e) { if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message }); throw e; }
  },
};
