import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { apiFetch } from '$lib/server/api';

export interface RunRow { id: string; kind: string; status: string; risk: string; createdAt: string; finishedAt: string | null; exitCode: number | null }

export const load: PageServerLoad = async ({ request }) => ({ runs: await apiFetch<RunRow[]>('/ops/runs', { cookie: request.headers.get('cookie') }) });

export const actions: Actions = {
  echo: async ({ request }) => {
    const run = await apiFetch<{ id: string }>('/ops/runs/echo', { method: 'POST', cookie: request.headers.get('cookie'), json: {} });
    redirect(303, `/calistirmalar/${run.id}`);
  },
};
