import type { PageServerLoad } from './$types';
import { apiFetch } from '$lib/server/api';
export const load: PageServerLoad = async ({ request, params }) => ({
  d: await apiFetch<{ tenant: { id: string; slug: string; name: string; kind: string; residencyDefault: 'TR' | 'EU' | 'US'; status: string; createdAt: string }; members: Array<{ userId: string; email: string; displayName: string; role: string }>; workloads: Array<{ id: string; slug: string; name: string; productSlug: string; status: string; residency: 'TR' | 'EU' | 'US'; providerCode: string | null }>; evidence: { count: number; last: string | null }; month: { period: string; cost: number; revenue: number } }>(`/ops/tenants/${params.id}`, { cookie: request.headers.get('cookie') }),
});
