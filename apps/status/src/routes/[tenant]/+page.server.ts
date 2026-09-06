import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { readSnapshot } from '$lib/server/redis';

/** Kiracı durum sayfası — snapshot yoksa 404 (varlık sızmaz). K1'de worker kiracı snapshot'ı üretir. */
export const load: PageServerLoad = async ({ params }) => {
  if (!/^[a-z0-9-]{3,40}$/.test(params.tenant)) error(404, 'Bulunamadı');
  const snapshot = await readSnapshot(`status:tenant:${params.tenant}`);
  if (!snapshot) error(404, 'Bulunamadı');
  return { snapshot, tenant: params.tenant };
};
