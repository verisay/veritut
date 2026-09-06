import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Kiracı değiştirici — yalnız çerez yazar; yetki kontrolü layout'ta (üyelik listesinde yoksa ilk kiracıya düşer). */
export const GET: RequestHandler = ({ params, cookies }) => {
  cookies.set('vt_tenant', params.id, { path: '/', sameSite: 'lax', httpOnly: false });
  redirect(302, '/panel');
};
