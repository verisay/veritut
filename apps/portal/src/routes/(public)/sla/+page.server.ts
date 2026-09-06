import type { PageServerLoad } from './$types';
import type { SlaTierDto } from '@veritut/types';
import { apiFetch } from '$lib/server/api';
export const load: PageServerLoad = async () => ({ slaTiers: (await apiFetch<{ slaTiers: SlaTierDto[] }>('/catalog')).slaTiers });
