import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export const load: PageServerLoad = async ({ request, params, parent }) => {
  const { activeTenant } = await parent();
  if (!activeTenant) error(404, 'Bulunamadı');
  const cookie = request.headers.get('cookie');
  try {
    const order = await apiFetch<{ id: string; productSlug: string; workloadName: string; workloadSlug: string; planCode: string; slaCode: string; residency: string; region: string; size: string; status: string; currency: string; monthly: string; setupFee: string; isTrial: boolean; trialDays: number; createdAt: string; workloadId: string | null; runId: string | null; rejectReason: string | null }>(`/orders/${params.id}`, { cookie, tenantId: activeTenant.id });
    const cards = order.workloadId ? await apiFetch<Array<{ id: string; status: string; lastBackupAt: string | null }>>('/workloads', { cookie, tenantId: activeTenant.id }) : [];
    return { order, workload: cards.find((c) => c.id === order.workloadId) ?? null };
  } catch (e) {
    if (e instanceof ServerApiError && e.status === 404) error(404, 'Bulunamadı');
    throw e;
  }
};
