import type { PageServerLoad } from './$types';
import type { PlanDto, ProductDto, Residency, SlaTierDto } from '@veritut/types';
import { apiFetch } from '$lib/server/api';

/** Ana sayfa ürün satırı — katalogdan gelen gerçek fiyat ve ikametgâh. */
export interface HomeProduct {
  slug: string;
  title: string;
  summary: string;
  residencies: Residency[];
  fromMonthly: number | null;
  currency: 'TRY' | 'EUR' | 'USD';
}

interface ProductDetail {
  residencies: Residency[];
  prices: Array<{ currency: string; monthly: number }>;
}

/** Kanıt Defteri zincir hükmü — kimliksiz doğrulama ucu (D13); olay içeriği DÖNMEZ. */
export interface ChainVerdict {
  ok: boolean;
  checked: number;
  brokenAt: number | null;
  lastHash: string | null;
}

export const load: PageServerLoad = async () => {
  const catalog = await apiFetch<{ products: Array<ProductDto & { published: boolean }>; plans: PlanDto[]; slaTiers: SlaTierDto[] }>('/catalog').catch(
    () => ({ products: [], plans: [], slaTiers: [] }),
  );
  const published = catalog.products.filter((p) => p.published).slice(0, 6);

  const [products, verdict] = await Promise.all([
    Promise.all(
      published.map(async (p): Promise<HomeProduct> => {
        const d = await apiFetch<ProductDetail>(`/catalog/products/${p.slug}`).catch(() => null);
        const monthly = d?.prices.map((x) => x.monthly).filter((m) => m > 0) ?? [];
        return {
          slug: p.slug,
          title: p.title,
          summary: p.summary,
          residencies: d?.residencies ?? [],
          fromMonthly: monthly.length > 0 ? Math.min(...monthly) : null,
          currency: (d?.prices[0]?.currency ?? 'TRY') as 'TRY' | 'EUR' | 'USD',
        };
      }),
    ),
    // Platform zinciri — kimliksiz doğrulanır; ana sayfadaki kanıt kartı bunu gösterir.
    apiFetch<ChainVerdict>('/evidence/public/verify?tenant=platform').catch(() => null),
  ]);

  const uptimeTarget = catalog.slaTiers.length > 0 ? Math.max(...catalog.slaTiers.map((s) => s.uptimeTarget)) : null;
  return { products, plans: catalog.plans.filter((p) => p.code !== 'free'), verdict, uptimeTarget };
};
