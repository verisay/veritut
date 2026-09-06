import { fail, redirect } from '@sveltejs/kit';
import type { BlueprintManifest } from '@veritut/types';
import type { Actions, PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export const load: PageServerLoad = async ({ request, url }) => {
  const cookie = request.headers.get('cookie');
  const [blueprints, tenants, accounts] = await Promise.all([
    apiFetch<BlueprintManifest[]>('/ops/blueprints', { cookie }),
    apiFetch<Array<{ id: string; name: string; slug: string; residencyDefault: 'TR' | 'EU' | 'US' }>>('/ops/tenants', { cookie }),
    apiFetch<{ accounts: Array<{ id: string; label: string; providerCode: string; hasCredentials: boolean; active: boolean }> }>('/ops/provider-accounts', { cookie }),
  ]);
  const sel = url.searchParams.get('bp');
  const selected = blueprints.find((b) => `${b.slug}@${b.version}` === sel) ?? blueprints.find((b) => b.slug === 'mock-vps') ?? blueprints[0] ?? null;
  return { blueprints, tenants, accounts: accounts.accounts.filter((a) => a.active && a.hasCredentials), selected };
};

export const actions: Actions = {
  provision: async ({ request }) => {
    const f = await request.formData();
    const [blueprint, version] = String(f.get('bp') ?? '').split('@');
    const inputs: Record<string, unknown> = {};
    for (const [k, v] of f.entries()) if (k.startsWith('in.')) inputs[k.slice(3)] = v;
    try {
      const r = await apiFetch<{ run: { id: string } }>('/ops/workloads/provision', {
        method: 'POST', cookie: request.headers.get('cookie'),
        json: { tenantId: f.get('tenantId'), blueprint, version, slug: f.get('slug'), name: f.get('name'), residency: f.get('residency'), providerAccountId: f.get('providerAccountId'), region: f.get('region'), size: f.get('size'), slaTier: f.get('slaTier') ?? 'std_9x5', inputs },
      });
      redirect(303, `/calistirmalar/${r.run.id}`);
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message, details: e.body.details, values: Object.fromEntries(f) });
      throw e;
    }
  },
};
