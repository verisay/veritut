import { redirect } from '@sveltejs/kit';
import type { MeDto } from '@veritut/types';
import type { LayoutServerLoad } from './$types';
import { apiFetch, ServerApiError } from '$lib/server/api';

export const load: LayoutServerLoad = async ({ request }) => {
  try {
    const me = await apiFetch<MeDto>('/auth/me', { cookie: request.headers.get('cookie') });
    if (me.realm !== 'ops') redirect(302, '/giris');
    return { me };
  } catch (e) {
    if (e instanceof ServerApiError && e.status === 401) redirect(302, '/giris');
    throw e;
  }
};
