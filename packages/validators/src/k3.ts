import { z } from 'zod';
import { FEATURE_KEYS, RESIDENCIES, USAGE_METRICS } from '@veritut/types';
import { slugSchema } from './common.js';
import { periodSchema } from './k1.js';

const money = z.coerce.number().min(0).max(9_999_999);
const currency = z.enum(['TRY', 'EUR', 'USD']);

export const upsertProductSchema = z.object({
  slug: slugSchema,
  layer: z.coerce.number().int().min(1).max(4),
  title: z.string().trim().min(2).max(120),
  summary: z.string().trim().max(400).default(''),
  blueprintSlug: z.string().regex(/^[a-z0-9-]+$/).nullable().optional(),
  seoTitle: z.string().max(120).nullable().optional(),
  seoDescription: z.string().max(300).nullable().optional(),
  bodyMd: z.string().max(40_000).default(''),
  faq: z.array(z.object({ q: z.string().min(2).max(300), a: z.string().min(2).max(2000) })).max(20).default([]),
  compare: z.array(z.object({ rival: z.string().min(1).max(60), title: z.string().min(2).max(160), summary: z.string().max(2000) })).max(10).default([]),
  active: z.boolean().default(true),
  sort: z.coerce.number().int().default(100),
});

export const publishVersionSchema = z.object({ blueprintVersion: z.string().regex(/^\d+\.\d+\.\d+$/), notes: z.string().max(2000).optional() });

const featureValue = z.union([z.boolean(), z.number(), z.array(z.string())]);
export const upsertPlanSchema = z.object({
  code: z.string().regex(/^[a-z0-9_]{2,30}$/),
  title: z.string().trim().min(2).max(60),
  summary: z.string().max(300).default(''),
  features: z.record(z.enum(FEATURE_KEYS), featureValue).default({}),
  sort: z.coerce.number().int().default(100),
  active: z.boolean().default(true),
});

export const upsertSlaSchema = z.object({
  code: z.string().regex(/^[a-z0-9_]{2,30}$/),
  title: z.string().trim().min(2).max(60),
  coverage: z.enum(['9x5', '24x7']),
  responseMin: z.coerce.number().int().min(5).max(10_080),
  resolveMin: z.coerce.number().int().min(15).max(43_200),
  uptimeTarget: z.coerce.number().min(90).max(100),
  monthlyUpliftPct: z.coerce.number().min(0).max(200).default(0),
  sort: z.coerce.number().int().default(100),
  active: z.boolean().default(true),
});

export const upsertPriceSchema = z.object({
  productSlug: slugSchema,
  size: z.string().min(1).max(40),
  residency: z.enum(RESIDENCIES),
  planCode: z.string().min(2).max(30),
  slaCode: z.string().min(2).max(30),
  currency: currency.default('TRY'),
  monthly: money,
  setupFee: money.default(0),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const featureOverrideSchema = z.object({ feature: z.enum(FEATURE_KEYS), value: featureValue, note: z.string().max(200).optional() });

/** Portal sipariş — blueprint girdileri ayrıca derlenmiş şemayla doğrulanır. */
export const createOrderSchema = z.object({
  productSlug: slugSchema,
  planCode: z.string().min(2).max(30),
  slaCode: z.string().min(2).max(30),
  residency: z.enum(RESIDENCIES),
  region: z.string().min(1).max(40),
  size: z.string().min(1).max(40),
  workloadSlug: slugSchema.min(3).max(40),
  workloadName: z.string().trim().min(2).max(120),
  inputs: z.record(z.unknown()).default({}),
  trial: z.boolean().default(false),
  utm: z.object({ source: z.string().max(60).optional(), medium: z.string().max(60).optional(), campaign: z.string().max(120).optional(), landingPath: z.string().max(200).optional() }).default({}),
  /** Sözleşme onayı — hizmet şartları + KVKK; onaysız sipariş kabul edilmez. */
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Hizmet şartlarını ve KVKK aydınlatmasını onaylamanız gerekir' }) }),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const quoteSchema = createOrderSchema.pick({ productSlug: true, planCode: true, slaCode: true, residency: true, size: true, trial: true });

export const createTicketSchema = z.object({
  title: z.string().trim().min(4).max(200),
  body: z.string().trim().min(4).max(20_000),
  workloadId: z.string().uuid().nullable().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
});
export const replyTicketSchema = z.object({ body: z.string().trim().min(1).max(20_000) });

export const createApiKeySchema = z.object({
  name: z.string().trim().min(2).max(60),
  scopes: z.array(z.enum(['workloads:read', 'evidence:read', 'orders:read', 'orders:write', 'status:read'])).min(1),
  ipAllow: z.array(z.string().max(64)).max(20).default([]),
  expiresInDays: z.coerce.number().int().min(1).max(3650).nullable().optional(),
});

export const usageRecordSchema = z.object({
  tenantId: z.string().uuid(),
  workloadId: z.string().uuid().nullable().optional(),
  period: periodSchema,
  metric: z.enum(USAGE_METRICS),
  qty: z.coerce.number(),
  unit: z.string().max(20).default('month'),
  currency: currency.default('TRY'),
  amount: z.coerce.number(),
  note: z.string().max(200).nullable().optional(),
});

/** Billing webhook (sağlayıcıdan bağımsız kanonik biçim; adaptör çevirir). */
export const billingWebhookSchema = z.object({
  event: z.enum(['invoice.created', 'invoice.paid', 'invoice.overdue', 'invoice.cancelled', 'subscription.cancelled']),
  tenantRef: z.string().min(1),
  invoice: z
    .object({
      billingRef: z.string().min(1),
      number: z.string().default(''),
      status: z.enum(['draft', 'unpaid', 'paid', 'refunded', 'cancelled']),
      currency: currency.default('TRY'),
      total: z.coerce.number(),
      issuedAt: z.string().datetime().nullable().optional(),
      dueAt: z.string().datetime().nullable().optional(),
      paidAt: z.string().datetime().nullable().optional(),
      payUrl: z.string().url().nullable().optional(),
      lines: z.array(z.object({ title: z.string(), qty: z.coerce.number(), amount: z.coerce.number() })).default([]),
    })
    .nullable()
    .optional(),
  subscriptionRef: z.string().nullable().optional(),
});

/** Ticket webhook (Zammad → kanonik). */
export const ticketWebhookSchema = z.object({
  event: z.enum(['ticket.updated', 'article.created']),
  externalRef: z.string().min(1),
  state: z.enum(['new', 'open', 'pending', 'resolved', 'closed']).optional(),
  minutesSpent: z.coerce.number().min(0).optional(),
  article: z.object({ externalRef: z.string().min(1), author: z.string().min(1), fromCustomer: z.boolean(), body: z.string().max(50_000) }).nullable().optional(),
});
