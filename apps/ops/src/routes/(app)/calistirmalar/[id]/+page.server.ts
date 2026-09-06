import type { PageServerLoad } from './$types';
import { apiFetch } from '$lib/server/api';

export interface RunDetail {
  run: { id: string; kind: string; status: string; risk: string; createdAt: string; startedAt: string | null; finishedAt: string | null; exitCode: number | null; summary: Record<string, unknown> };
  steps: Array<{ step: string; status: string; summary: string | null; startedAt: string; finishedAt: string | null }>;
  log: Array<{ id: string; t: string; line: string; level: string }>;
}
export const load: PageServerLoad = async ({ request, params }) => ({ detail: await apiFetch<RunDetail>(`/ops/runs/${params.id}`, { cookie: request.headers.get('cookie') }) });
