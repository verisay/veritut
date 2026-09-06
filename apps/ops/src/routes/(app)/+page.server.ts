import type { PageServerLoad } from './$types';
import { apiFetch } from '$lib/server/api';

interface Overview {
  tenantCount: number;
  components: Array<{ slug: string; name: string; state: 'ok' | 'degraded' | 'down' | 'maintenance' | 'unknown'; latencyMs: number | null; checkedAt: string | null }>;
  queues: Record<string, { waiting: number; active: number }>;
  recentRuns: Array<{ id: string; kind: string; status: string; createdAt: string }>;
}
export const load: PageServerLoad = async ({ request }) => ({ overview: await apiFetch<Overview>('/ops/overview', { cookie: request.headers.get('cookie') }) });
