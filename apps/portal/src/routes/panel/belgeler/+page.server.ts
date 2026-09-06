import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export const load: PageServerLoad = async ({ request, parent }) => {
  const { activeTenant } = await parent();
  if (!activeTenant) return { documents: [], canManage: false };
  return {
    documents: await apiFetch<Array<{ id: string; kind: string; period: string | null; version: number; title: string; sha256: string; bytes: number; createdAt: string }>>('/guvence/documents', { cookie: request.headers.get('cookie'), tenantId: activeTenant.id }),
    canManage: ['owner', 'admin'].includes(activeTenant.role),
  };
};

const gen = (path: string, withPeriod = false) => async ({ request, cookies }: { request: Request; cookies: { get: (k: string) => string | undefined } }) => {
  const f = await request.formData();
  try {
    return { generated: await apiFetch(`/guvence/documents/${path}`, { method: 'POST', cookie: request.headers.get('cookie'), tenantId: cookies.get('vt_tenant'), json: withPeriod ? { period: f.get('period') } : {} }) };
  } catch (e) {
    if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message, details: e.body.details });
    throw e;
  }
};

export const actions: Actions = {
  subprocessors: gen('subprocessors'),
  dpa: gen('dpa'),
  slaReport: gen('sla-report', true),
  evidenceBundle: gen('evidence-bundle', true),
};
