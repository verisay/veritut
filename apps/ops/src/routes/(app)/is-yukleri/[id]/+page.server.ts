import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export const load: PageServerLoad = async ({ request, params }) => {
  const cookie = request.headers.get('cookie');
  const [d, repos] = await Promise.all([
    apiFetch<{ workload: Record<string, unknown> & { id: string; name: string; slug: string; tenantId: string; residency: 'TR' | 'EU' | 'US'; status: string; providerCode: string | null; region: string | null; size: string | null; productSlug: string; probeUrl: string | null; notes: string | null; blueprintSlug: string | null; blueprintVersion: string | null; endpoints: Array<{ label: string; url: string }>; outputs: Record<string, unknown>; lastRunId: string | null }; policy: { primaryRepoId: string; offsiteRepoId: string | null; schedule: string; retention: string; paths: string[]; enabled: boolean } | null; jobs: Array<{ id: string; status: string; snapshotId: string | null; bytes: number | null; files: number | null; durationS: number | null; error: string | null; startedAt: string; finishedAt: string | null; runId: string | null }> }>(`/ops/workloads/${params.id}`, { cookie }),
    apiFetch<Array<{ id: string; label: string; providerCode: string; residency: string; repoUrl: string }>>('/ops/backup-repos', { cookie }),
  ]);
  const bp = d.workload.blueprintSlug && d.workload.blueprintVersion ? await apiFetch<{ sizes: Array<{ code: string; title_tr: string }> }>('/ops/blueprints', { cookie }).then((l) => (l as unknown as Array<{ slug: string; version: string; sizes: Array<{ code: string; title_tr: string }> }>).find((b) => b.slug === d.workload.blueprintSlug && b.version === d.workload.blueprintVersion) ?? null) : null;
  return { ...d, repos, bp };
};

export const actions: Actions = {
  destroy: async ({ request, params }) => {
    try { const r = await apiFetch<{ id: string }>(`/ops/workloads/${params.id}/destroy`, { method: 'POST', cookie: request.headers.get('cookie'), json: {} }); return { destroyRun: r.id }; }
    catch (e) { if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message }); throw e; }
  },
  resize: async ({ request, params }) => {
    const f = await request.formData();
    try { const r = await apiFetch<{ id: string }>(`/ops/workloads/${params.id}/resize`, { method: 'POST', cookie: request.headers.get('cookie'), json: { size: f.get('size') } }); return { resizeRun: r.id }; }
    catch (e) { if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message }); throw e; }
  },
  policy: async ({ request, params }) => {
    const f = await request.formData();
    try {
      await apiFetch(`/ops/workloads/${params.id}/backup-policy`, { method: 'PUT', cookie: request.headers.get('cookie'), json: { primaryRepoId: f.get('primaryRepoId'), offsiteRepoId: f.get('offsiteRepoId') || null, schedule: f.get('schedule') || '0 2 * * *', retention: f.get('retention') || '--keep-daily 7 --keep-weekly 4 --keep-monthly 6', paths: String(f.get('paths') ?? '').split(',').map((s) => s.trim()).filter(Boolean), enabled: true } });
      return { policyOk: true };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message, details: e.body.details });
      throw e;
    }
  },
  backup: async ({ request, params }) => {
    try {
      const r = await apiFetch<{ run: { id: string } }>(`/ops/workloads/${params.id}/backup`, { method: 'POST', cookie: request.headers.get('cookie'), json: {} });
      return { backupRun: r.run.id };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message });
      throw e;
    }
  },
  revenue: async ({ request, params }) => {
    const f = await request.formData();
    try {
      await apiFetch(`/ops/workloads/${params.id}/revenue`, { method: 'PUT', cookie: request.headers.get('cookie'), json: { period: f.get('period'), amount: f.get('amount'), currency: f.get('currency'), note: f.get('note') || null } });
      return { revenueOk: true };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message, details: e.body.details });
      throw e;
    }
  },
};
