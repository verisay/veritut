import type { Actions, PageServerLoad } from './$types';
import { apiFetch } from '$lib/server/api';
export const load: PageServerLoad = async ({ request }) => ({
  items: await apiFetch<Array<{ id: string; kind: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }>>('/ops/notifications', { cookie: request.headers.get('cookie') }),
});
export const actions: Actions = {
  read: async ({ request }) => {
    const f = await request.formData();
    await apiFetch(`/ops/notifications/${f.get('id')}/read`, { method: 'POST', cookie: request.headers.get('cookie'), json: {} });
    return { ok: true };
  },
};
