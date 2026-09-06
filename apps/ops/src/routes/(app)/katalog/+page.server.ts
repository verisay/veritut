import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { BlueprintManifest, PlanDto, ProductDto, SlaTierDto } from '@veritut/types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export const load: PageServerLoad = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  const [catalog, blueprints] = await Promise.all([
    apiFetch<{ products: Array<ProductDto & { active: boolean; versions: Array<{ id: string; blueprintVersion: string; status: string; releasedAt: string | null }> }>; plans: PlanDto[]; slaTiers: SlaTierDto[]; prices: Array<{ productSlug: string; size: string; residency: string; planCode: string; slaCode: string; currency: string; monthly: number; setupFee: number }> }>('/ops/catalog', { cookie }),
    apiFetch<BlueprintManifest[]>('/ops/blueprints', { cookie }),
  ]);
  return { ...catalog, blueprints };
};

const act = (path: string, method: string) => async ({ request }: { request: Request }) => {
  const f = await request.formData();
  const body = Object.fromEntries(f) as Record<string, string>;
  try {
    await apiFetch(path.replace(':slug', body['slug'] ?? ''), { method, cookie: request.headers.get('cookie'), json: body });
    return { ok: true };
  } catch (e) {
    if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message, details: e.body.details });
    throw e;
  }
};

export const actions: Actions = {
  price: async ({ request }) => {
    const f = await request.formData();
    try {
      await apiFetch('/ops/catalog/prices', { method: 'PUT', cookie: request.headers.get('cookie'), json: { productSlug: f.get('productSlug'), size: f.get('size'), residency: f.get('residency'), planCode: f.get('planCode'), slaCode: f.get('slaCode'), currency: f.get('currency'), monthly: f.get('monthly'), setupFee: f.get('setupFee') } });
      return { ok: true };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message, details: e.body.details });
      throw e;
    }
  },
  publish: async ({ request }) => {
    const f = await request.formData();
    try {
      await apiFetch(`/ops/catalog/products/${f.get('slug')}/publish`, { method: 'POST', cookie: request.headers.get('cookie'), json: { blueprintVersion: f.get('blueprintVersion'), notes: f.get('notes') || undefined } });
      return { published: true };
    } catch (e) {
      if (e instanceof ServerApiError) return fail(e.status, { message: e.body.message });
      throw e;
    }
  },
  toggle: act('/ops/catalog/products', 'PUT'),
};
