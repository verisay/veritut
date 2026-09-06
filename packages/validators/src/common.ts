import { z } from 'zod';

export const uuidSchema = z.string().uuid();

/** Slug: küçük harf, rakam, tire; alan adında kullanılır (portal form açıklaması). */
export const slugSchema = z
  .string()
  .min(3, 'En az 3 karakter')
  .max(40, 'En fazla 40 karakter')
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Küçük harf, rakam ve tire; başta/sonda tire olamaz');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type Pagination = z.infer<typeof paginationSchema>;
