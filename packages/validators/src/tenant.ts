import { z } from 'zod';
import { RESIDENCIES, TENANT_ROLES } from '@veritut/types';
import { slugSchema } from './common.js';

export const createTenantSchema = z.object({
  name: z.string().trim().min(2, 'En az 2 karakter').max(120),
  slug: slugSchema,
  residencyDefault: z.enum(RESIDENCIES).default('TR'),
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email('Geçerli bir e-posta girin'),
  role: z.enum(TENANT_ROLES).refine((r) => r !== 'owner', 'Sahip rolü davetle verilmez'),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
