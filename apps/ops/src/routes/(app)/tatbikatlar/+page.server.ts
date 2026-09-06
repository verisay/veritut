import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export const load: PageServerLoad = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  const [drills, workloads] = await Promise.all([
    apiFetch<Array<{ drill: { id: string; status: string; scheduledFor: string; snapshotId: string | null; checksumOk: boolean | null; appCheckOk: boolean | null; restoredBytes: number | null; durationS: number | null; error: string | null; runId: string | null; evidenceId: string | null; finishedAt: string | null }; workloadName: string; workloadSlug: string }>>('/ops/drills', { cookie }),
    apiFetch<Array<{ id: string; name: string; tenantName: string; status: string }>>('/ops/workloads', { cookie }),
  ]);
  return { drills, workloads: workloads.filter((w) => w.status === 'active' || w.status === 'degraded') };
};

export const actions: Actions = {
  run: async ({ request }) => {
    const f = await request.formData();
    try {
      const r = await apiFetch<{ run: { id: string } }>('/ops/drills', { method: 'POST', cookie: request.headers.get('cookie'), json: { workloadId: f.get('workloadId') } });
      return { runId: r.run.id };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message });
      throw e;
    }
  },
  schedule: async ({ request }) => ({ scheduled: await apiFetch('/ops/drills/schedule', { method: 'POST', cookie: request.headers.get('cookie'), json: {} }) }),
};
