import type { PageServerLoad } from './$types';
import { apiFetch } from '$lib/server/api';

export const load: PageServerLoad = async () => {
  try {
    const verdict = await apiFetch<{ ok: boolean; checked: number; brokenAt: number | null; lastHash: string | null }>(
      '/evidence/public/verify?tenant=platform',
    );
    return { verdict };
  } catch {
    return { verdict: null };
  }
};
