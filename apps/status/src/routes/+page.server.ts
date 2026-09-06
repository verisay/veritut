import type { PageServerLoad } from './$types';
import { readSnapshot } from '$lib/server/redis';
export const load: PageServerLoad = async () => ({ snapshot: await readSnapshot('status:platform') });
