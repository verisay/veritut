import type { PageServerLoad } from './$types';
import { apiFetch } from '$lib/server/api';

export const load: PageServerLoad = async ({ request, parent }) => {
  const { activeTenant } = await parent();
  if (!activeTenant) return { orders: [] };
  return { orders: await apiFetch<Array<{ id: string; productSlug: string; workloadName: string; planCode: string; slaCode: string; residency: string; size: string; status: string; currency: string; monthly: string; setupFee: string; isTrial: boolean; createdAt: string; workloadId: string | null }>>('/orders', { cookie: request.headers.get('cookie'), tenantId: activeTenant.id }) };
};
