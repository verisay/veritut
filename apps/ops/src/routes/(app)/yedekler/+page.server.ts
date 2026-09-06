import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export const load: PageServerLoad = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  const [repos, jobs, accounts] = await Promise.all([
    apiFetch<Array<{ id: string; label: string; providerCode: string; residency: 'TR' | 'EU' | 'US'; repoUrl: string; active: boolean; hasCredentials: boolean }>>('/ops/backup-repos', { cookie }),
    apiFetch<Array<{ id: string; workloadId: string; workloadName: string; status: string; snapshotId: string | null; bytes: number | null; durationS: number | null; error: string | null; startedAt: string; runId: string | null; evidenceId: string | null }>>('/ops/backup-jobs', { cookie }),
    apiFetch<{ accounts: Array<{ id: string; label: string; providerCode: string }> }>('/ops/provider-accounts', { cookie }),
  ]);
  return { repos, jobs, accounts: accounts.accounts };
};

export const actions: Actions = {
  repo: async ({ request }) => {
    const f = await request.formData();
    const credentials: Record<string, string> = {};
    for (const line of String(f.get('credentials') ?? '').split(/\r?\n/)) { const i = line.indexOf('='); if (i > 0) credentials[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
    try {
      await apiFetch('/ops/backup-repos', { method: 'POST', cookie: request.headers.get('cookie'), json: { label: f.get('label'), providerCode: f.get('providerCode'), providerAccountId: f.get('providerAccountId') || null, repoUrl: f.get('repoUrl'), residency: f.get('residency'), credentials } });
      return { ok: true };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message, details: e.body.details });
      throw e;
    }
  },
};
