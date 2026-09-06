import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export const load: PageServerLoad = async ({ request, params, parent }) => {
  const { activeTenant } = await parent();
  if (!activeTenant) error(404, 'Bulunamadı');
  try {
    return await apiFetch<{
      workload: { id: string; slug: string; name: string; productSlug: string; status: string; residency: 'TR' | 'EU' | 'US'; providerCode: string | null; region: string | null; size: string | null; slaTier: string; endpoints: Array<{ label: string; url: string }>; notes: string | null; createdAt: string };
      backups: Array<{ id: string; status: string; snapshotId: string | null; bytes: number | null; files: number | null; durationS: number | null; error: string | null; startedAt: string; finishedAt: string | null; evidenceId: string | null }>;
      accessSessions: Array<{ id: string; actorLabel: string; source: string; target: string; reason: string | null; startedAt: string; endedAt: string | null }>;
      resources: Array<{ externalId: string; kind: string; name: string; region: string | null; specs: Record<string, unknown> }>;
    }>(`/workloads/${params.id}`, { cookie: request.headers.get('cookie'), tenantId: activeTenant.id });
  } catch (e) {
    if (e instanceof ServerApiError && e.status === 404) error(404, 'Bulunamadı');
    throw e;
  }
};
