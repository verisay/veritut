import type { PageServerLoad } from './$types';
import { apiFetch } from '$lib/server/api';
import type { PlanDto, ProductDto } from '@veritut/types';

export const load: PageServerLoad = async () => {
  try {
    const c = await apiFetch<{ products: Array<ProductDto & { published: boolean }>; plans: PlanDto[] }>('/catalog');
    return { products: c.products.filter((p) => p.published).slice(0, 4), plans: c.plans.filter((p) => p.code !== 'free') };
  } catch {
    return { products: [], plans: [] };
  }
};
