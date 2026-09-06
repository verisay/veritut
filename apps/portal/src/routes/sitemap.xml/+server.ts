import type { RequestHandler } from './$types';
import { apiFetch } from '$lib/server/api';
import type { ProductDto } from '@veritut/types';

/** Kalite süzgeçli sitemap (D21): yalnız yayımlanmış ürünler ve gerçek içerikli karşılaştırmalar. */
export const GET: RequestHandler = async ({ url }) => {
  const origin = url.origin.replace(/^http:\/\/(?!localhost)/, 'https://');
  const statik = ['/', '/urunler', '/fiyatlandirma', '/sla', '/guvence', '/gelistirici', '/kvkk', '/sozlesmeler'];
  let dinamik: string[] = [];
  try {
    const c = await apiFetch<{ products: Array<ProductDto & { published: boolean }> }>('/catalog');
    for (const p of c.products.filter((x) => x.published)) {
      dinamik.push(`/urunler/${p.slug}`);
      for (const cmp of p.compare) dinamik.push(`/karsilastir/${p.slug}-vs-${cmp.rival}`);
    }
  } catch {
    dinamik = [];
  }
  const now = new Date().toISOString().slice(0, 10);
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...statik, ...dinamik]
    .map((p) => `  <url><loc>${origin}${p}</loc><lastmod>${now}</lastmod><changefreq>${p === '/' ? 'daily' : 'weekly'}</changefreq><priority>${p === '/' ? '1.0' : p.startsWith('/urunler/') ? '0.8' : '0.6'}</priority></url>`)
    .join('\n')}\n</urlset>`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
};
