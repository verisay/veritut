import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { PlanDto, ProductDto, SlaTierDto } from '@veritut/types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export interface ProductDetail {
  product: ProductDto;
  published: boolean;
  blueprintVersion: string | null;
  sizes: Array<{ code: string; title: string; priceHint: number | null }>;
  residencies: Array<'TR' | 'EU' | 'US'>;
  regions: Record<string, string[]>;
  providers: string[];
  inputs: { properties: Record<string, { type: string; title_tr: string; help_tr?: string; secret?: boolean }>; required: string[] };
  backup: { schedule: string; retention: string } | null;
  sso: boolean;
  checks: string[];
  prices: Array<{ size: string; residency: string; planCode: string; slaCode: string; currency: string; monthly: number; setupFee: number }>;
}

export const load: PageServerLoad = async ({ params }) => {
  try {
    const [detail, catalog] = await Promise.all([
      apiFetch<ProductDetail>(`/catalog/products/${params.slug}`),
      apiFetch<{ plans: PlanDto[]; slaTiers: SlaTierDto[] }>('/catalog'),
    ]);
    return { ...detail, plans: catalog.plans.filter((p) => p.code !== 'free'), slaTiers: catalog.slaTiers };
  } catch (e) {
    if (e instanceof ServerApiError && e.status === 404) error(404, 'Ürün bulunamadı');
    throw e;
  }
};
