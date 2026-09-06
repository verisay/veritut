import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export interface AccountRow { id: string; providerCode: string; label: string; regions: string[]; residencies: string[]; health: string; lastSyncAt: string | null; active: boolean; hasCredentials: boolean; createdAt: string }

export const load: PageServerLoad = async ({ request }) => ({
  data: await apiFetch<{ accounts: AccountRow[]; singleAccountProviders: string[] }>('/ops/provider-accounts', { cookie: request.headers.get('cookie') }),
});

export const actions: Actions = {
  create: async ({ request }) => {
    const f = await request.formData();
    const credentials: Record<string, string> = {};
    const raw = String(f.get('credentials') ?? '');
    for (const line of raw.split(/\r?\n/)) { const i = line.indexOf('='); if (i > 0) credentials[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
    try {
      await apiFetch('/ops/provider-accounts', { method: 'POST', cookie: request.headers.get('cookie'), json: { providerCode: f.get('providerCode'), label: f.get('label'), credentials, regions: String(f.get('regions') ?? '').split(',').map((s) => s.trim()).filter(Boolean), residencies: f.getAll('residencies') } });
      return { ok: true };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message, details: e.body.details });
      throw e;
    }
  },
  sync: async ({ request }) => {
    const f = await request.formData();
    const run = await apiFetch<{ id: string }>(`/ops/provider-accounts/${f.get('id')}/sync`, { method: 'POST', cookie: request.headers.get('cookie'), json: {} });
    return { synced: run.id };
  },
};
