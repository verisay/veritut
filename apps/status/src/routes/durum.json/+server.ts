import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readSnapshot } from '$lib/server/redis';

/** Durum anlık görüntüsünün makine okunur çıktısı — status app'in tek dış ucu (D14: yalnız Redis). */
export const GET: RequestHandler = async () => {
  const snapshot = await readSnapshot('status:platform');
  return json(snapshot ?? { error: 'snapshot yok' }, {
    status: snapshot ? 200 : 503,
    headers: { 'cache-control': 'public, max-age=30' },
  });
};
