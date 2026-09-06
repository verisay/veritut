import { redirect } from '@sveltejs/kit';
import type { MeDto } from '@veritut/types';
import type { LayoutServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

/** Portal kapısı: oturum yoksa Keycloak'a (API /auth/login) yönlendir. Aktif kiracı `vt_tenant` çerezi. */
export const load: LayoutServerLoad = async ({ request, cookies, url }) => {
  const cookie = request.headers.get('cookie');
  let me: MeDto;
  try {
    me = await apiFetch<MeDto>('/auth/me', { cookie });
  } catch (e) {
    if (e instanceof ServerApiError && e.status === 401) {
      redirect(302, `/api/v1/auth/login?realm=musteri&next=${encodeURIComponent(url.pathname)}`);
    }
    throw e;
  }
  if (me.realm !== 'musteri') redirect(302, '/api/v1/auth/login?realm=musteri');
  const wanted = cookies.get('vt_tenant');
  const active = me.tenants.find((t) => t.id === wanted) ?? me.tenants[0] ?? null;
  return { me, activeTenant: active };
};
