import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { OrderQuote, PlanDto, ProductDto, SlaTierDto } from '@veritut/types';
import { apiFetch, ServerApiError } from '$lib/server/api';

interface Detail {
  product: ProductDto;
  published: boolean;
  sizes: Array<{ code: string; title: string }>;
  residencies: Array<'TR' | 'EU' | 'US'>;
  regions: Record<string, string[]>;
  providers: string[];
  inputs: { properties: Record<string, { type: string; title_tr: string; help_tr?: string; secret?: boolean; default?: unknown; enum?: Array<string | number>; enum_labels_tr?: string[]; minLength?: number }>; required: string[] };
  prices: Array<{ size: string; residency: string; planCode: string; slaCode: string; currency: string; monthly: number; setupFee: number }>;
}

export const load: PageServerLoad = async ({ request, url, parent }) => {
  const { activeTenant } = await parent();
  const cookie = request.headers.get('cookie');
  const catalog = await apiFetch<{ products: Array<ProductDto & { published: boolean }>; plans: PlanDto[]; slaTiers: SlaTierDto[] }>('/catalog');
  const published = catalog.products.filter((p) => p.published);
  const slug = url.searchParams.get('urun') ?? published[0]?.slug ?? null;
  const detail = slug ? await apiFetch<Detail>(`/catalog/products/${slug}`) : null;
  const plan = activeTenant ? await apiFetch<{ planCode: string; features: Record<string, unknown> }>('/billing/plan', { cookie, tenantId: activeTenant.id }) : null;
  return { products: published, plans: catalog.plans.filter((p) => p.code !== 'free'), slaTiers: catalog.slaTiers, detail, selected: slug, plan, preselectedPlan: url.searchParams.get('plan') };
};

export const actions: Actions = {
  quote: async ({ request, cookies }) => {
    const f = await request.formData();
    try {
      const q = await apiFetch<OrderQuote>('/orders/quote', {
        method: 'POST', cookie: request.headers.get('cookie'), tenantId: cookies.get('vt_tenant'),
        json: { productSlug: f.get('productSlug'), planCode: f.get('planCode'), slaCode: f.get('slaCode'), residency: f.get('residency'), size: f.get('size'), trial: f.get('trial') === 'on' },
      });
      return { quote: q, values: Object.fromEntries(f) };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message, details: e.body.details, values: Object.fromEntries(f) });
      throw e;
    }
  },
  order: async ({ request, cookies, url }) => {
    const f = await request.formData();
    const inputs: Record<string, unknown> = {};
    for (const [k, v] of f.entries()) if (k.startsWith('in.')) inputs[k.slice(3)] = v;
    let created: { orderId: string } | null = null;
    try {
      created = await apiFetch<{ orderId: string }>('/orders', {
        method: 'POST', cookie: request.headers.get('cookie'), tenantId: cookies.get('vt_tenant'),
        json: {
          productSlug: f.get('productSlug'), planCode: f.get('planCode'), slaCode: f.get('slaCode'), residency: f.get('residency'), region: f.get('region'), size: f.get('size'),
          workloadSlug: f.get('workloadSlug'), workloadName: f.get('workloadName'), inputs, trial: f.get('trial') === 'on',
          utm: { source: url.searchParams.get('utm_source') ?? undefined, medium: url.searchParams.get('utm_medium') ?? undefined, campaign: url.searchParams.get('utm_campaign') ?? undefined, landingPath: url.pathname },
          acceptTerms: f.get('acceptTerms') === 'on',
        },
      });
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message, details: e.body.details, values: Object.fromEntries(f) });
      throw e;
    }
    redirect(303, `/panel/siparisler/${created.orderId}`);
  },
};
