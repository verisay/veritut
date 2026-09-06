import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { ProductDto } from '@veritut/types';
import { apiFetch } from '$lib/server/api';

/** Programatik karşılaştırma: `/karsilastir/<urun>-vs-<rakip>` (plan §12 SEO motoru). */
export const load: PageServerLoad = async ({ params }) => {
  const m = /^(.+)-vs-(.+)$/.exec(params.slug);
  if (!m) error(404, 'Bulunamadı');
  const [, productSlug, rival] = m;
  const c = await apiFetch<{ products: Array<ProductDto & { published: boolean }> }>('/catalog');
  const product = c.products.find((p) => p.slug === productSlug && p.published);
  const cmp = product?.compare.find((x) => x.rival === rival);
  if (!product || !cmp) error(404, 'Bulunamadı');
  return { product, cmp };
};
