import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Features } from '@veritut/types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export const load: PageServerLoad = async ({ request, parent, url }) => {
  const { activeTenant } = await parent();
  if (!activeTenant) return { invoices: [], subscriptions: [], usage: [], plan: null, period: '', canSeeBilling: false };
  const cookie = request.headers.get('cookie');
  const tenantId = activeTenant.id;
  const period = url.searchParams.get('period') ?? new Date().toISOString().slice(0, 7);
  const canSeeBilling = ['owner', 'admin', 'billing'].includes(activeTenant.role);
  const [subscriptions, plan] = await Promise.all([
    apiFetch<Array<{ id: string; planCode: string; slaCode: string; status: string; currency: string; monthly: string; trialEndsAt: string | null; workloadId: string | null }>>('/billing/subscriptions', { cookie, tenantId }),
    apiFetch<{ planCode: string; features: Features }>('/billing/plan', { cookie, tenantId }),
  ]);
  if (!canSeeBilling) return { invoices: [], subscriptions, usage: [], plan, period, canSeeBilling };
  const [invoices, usage] = await Promise.all([
    apiFetch<Array<{ id: string; billingRef: string; number: string; status: string; currency: string; total: string; issuedAt: string | null; dueAt: string | null; paidAt: string | null; payUrl: string | null; lines: Array<{ title: string; qty: number; amount: number }> }>>('/billing/invoices', { cookie, tenantId }),
    apiFetch<Array<{ metric: string; qty: string; amount: string; currency: string; note: string | null; pushedAt: string | null }>>(`/billing/usage?period=${period}`, { cookie, tenantId }),
  ]);
  return { invoices, subscriptions, usage, plan, period, canSeeBilling };
};

export const actions: Actions = {
  pay: async ({ request, cookies }) => {
    const f = await request.formData();
    try {
      await apiFetch('/billing/mock-pay', { method: 'POST', cookie: request.headers.get('cookie'), tenantId: cookies.get('vt_tenant'), json: { billingRef: f.get('billingRef') } });
      return { paid: true };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message });
      throw e;
    }
  },
};
