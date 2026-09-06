import type { PageServerLoad } from './$types';
import type { PlanDto, ProductDto, SlaTierDto } from '@veritut/types';
import { apiFetch } from '$lib/server/api';

export const load: PageServerLoad = async () => apiFetch<{ products: Array<ProductDto & { published: boolean }>; plans: PlanDto[]; slaTiers: SlaTierDto[] }>('/catalog');
