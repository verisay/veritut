import type { PageServerLoad } from './$types';
import type { PlanDto, ProductDto, SlaTierDto } from '@veritut/types';
import { apiFetch } from '$lib/server/api';

export const load: PageServerLoad = async () => {
  const [catalog, ...details] = await Promise.all([
    apiFetch<{ products: Array<ProductDto & { published: boolean }>; plans: PlanDto[]; slaTiers: SlaTierDto[] }>('/catalog'),
    ...[] as never[],
  ]);
  const published = catalog.products.filter((p) => p.published);
  const prices = await Promise.all(published.map((p) => apiFetch<{ prices: Array<{ size: string; residency: string; planCode: string; slaCode: string; currency: string; monthly: number; setupFee: number }> }>(`/catalog/products/${p.slug}`).then((d) => ({ slug: p.slug, title: p.title, prices: d.prices }))));
  void details;
  return { plans: catalog.plans.filter((p) => p.code !== 'free'), slaTiers: catalog.slaTiers, products: published, prices };
};
