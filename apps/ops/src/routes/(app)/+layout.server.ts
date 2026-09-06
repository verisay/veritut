import { redirect } from '@sveltejs/kit';
import type { MeDto } from '@veritut/types';
import type { LayoutServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

/** Üst navdaki nöbetçi göstergesi — gerçek rotadan; kimse nöbette değilse öyle yazılır. */
interface OncallNow {
  current: { email: string; name: string } | null;
  backup: { email: string; name: string } | null;
}

export const load: LayoutServerLoad = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  try {
    const me = await apiFetch<MeDto>('/auth/me', { cookie });
    if (me.realm !== 'ops') redirect(302, '/giris');
    const oncall = await apiFetch<OncallNow>('/ops/oncall', { cookie }).catch(() => null);
    return { me, oncall };
  } catch (e) {
    if (e instanceof ServerApiError && e.status === 401) redirect(302, '/giris');
    throw e;
  }
};
