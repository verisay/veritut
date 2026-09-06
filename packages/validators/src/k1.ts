import { z } from 'zod';
import { COMPONENT_STATES, INVENTORY_KINDS, PROVIDERS, RESIDENCIES, TENANT_ROLES, WORKLOAD_STATUSES } from '@veritut/types';
import { slugSchema } from './common.js';

export const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Dönem YYYY-AA biçiminde olmalı');
export const moneySchema = z.coerce.number().finite().min(0);
export const currencySchema = z.enum(['EUR', 'USD', 'TRY']);

/** Tedarikçi hesabı — kimlik bilgileri API'de mühürlenir, asla geri okunmaz. */
export const createProviderAccountSchema = z.object({
  providerCode: z.enum(PROVIDERS),
  label: z.string().trim().min(2).max(80),
  credentials: z.record(z.string(), z.string().min(1)).refine((c) => Object.keys(c).length > 0, 'En az bir kimlik alanı gerekir'),
  regions: z.array(z.string().min(1)).default([]),
  residencies: z.array(z.enum(RESIDENCIES)).default([]),
});
export type CreateProviderAccountInput = z.infer<typeof createProviderAccountSchema>;

export const createWorkloadSchema = z.object({
  tenantId: z.string().uuid(),
  slug: slugSchema,
  name: z.string().trim().min(2).max(120),
  productSlug: z.string().trim().min(1).max(60).default('legacy'),
  residency: z.enum(RESIDENCIES),
  providerCode: z.enum(PROVIDERS).nullable().optional(),
  providerAccountId: z.string().uuid().nullable().optional(),
  region: z.string().max(40).nullable().optional(),
  size: z.string().max(40).nullable().optional(),
  slaTier: z.string().max(40).default('std_9x5'),
  status: z.enum(WORKLOAD_STATUSES).default('active'),
  probeUrl: z.string().url().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type CreateWorkloadInput = z.infer<typeof createWorkloadSchema>;

export const updateWorkloadSchema = createWorkloadSchema.omit({ tenantId: true, slug: true }).partial();

/** CSV içe aktarım (K1): mevcut Verisay hizmetleri. Başlık satırı zorunlu. */
export const importCsvSchema = z.object({ csv: z.string().min(10).max(2_000_000) });

export const revenueSchema = z.object({
  period: periodSchema,
  amount: moneySchema,
  currency: currencySchema.default('EUR'),
  note: z.string().max(200).nullable().optional(),
});

export const fxRateSchema = z.object({ period: periodSchema, currency: currencySchema, toTry: z.coerce.number().positive() });

export const invoiceCsvSchema = z.object({ providerAccountId: z.string().uuid(), period: periodSchema, csv: z.string().min(5).max(5_000_000) });

export const matchInventorySchema = z.object({ workloadId: z.string().uuid() });
export const createFromInventorySchema = z.object({ tenantId: z.string().uuid(), slug: slugSchema, name: z.string().trim().min(2).max(120) });

export const createBackupRepoSchema = z.object({
  label: z.string().trim().min(2).max(80),
  providerCode: z.enum(PROVIDERS),
  providerAccountId: z.string().uuid().nullable().optional(),
  repoUrl: z.string().min(3).max(500),
  residency: z.enum(RESIDENCIES),
  credentials: z.record(z.string(), z.string()).default({}),
});

export const backupPolicySchema = z.object({
  primaryRepoId: z.string().uuid(),
  offsiteRepoId: z.string().uuid().nullable().optional(),
  schedule: z.string().min(9).max(60).default('0 2 * * *'),
  retention: z.string().max(200).default('--keep-daily 7 --keep-weekly 4 --keep-monthly 6'),
  paths: z.array(z.string().min(1)).default([]),
  enabled: z.boolean().default(true),
});

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(TENANT_ROLES).refine((r) => r !== 'owner', 'Sahip rolü davetle verilmez'),
});
export const acceptInviteSchema = z.object({ token: z.string().min(16).max(200) });
export const memberRoleSchema = z.object({ role: z.enum(TENANT_ROLES) });

export const createTenantOpsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema,
  residencyDefault: z.enum(RESIDENCIES).default('TR'),
  kind: z.enum(['customer', 'internal', 'reseller']).default('customer'),
});

/* ── İç uçlar ── */
export const inventoryItemSchema = z.object({
  externalId: z.string().min(1),
  kind: z.enum(INVENTORY_KINDS),
  name: z.string(),
  region: z.string().nullable(),
  residency: z.enum(RESIDENCIES).nullable(),
  status: z.string().default(''),
  specs: z.record(z.unknown()).default({}),
  tags: z.record(z.string()).default({}),
  monthlyCostEstimate: z.number().nullable(),
  currency: z.string().default('EUR'),
});
export const inventoryReportSchema = z.object({ items: z.array(inventoryItemSchema), period: periodSchema });
export type InventoryReport = z.infer<typeof inventoryReportSchema>;

export const backupResultSchema = z.object({
  workloadId: z.string().uuid(),
  repoId: z.string().uuid().nullable().optional(),
  runId: z.string().uuid().nullable().optional(),
  status: z.enum(['completed', 'failed']),
  snapshotId: z.string().nullable().optional(),
  bytes: z.number().int().nonnegative().nullable().optional(),
  files: z.number().int().nonnegative().nullable().optional(),
  durationS: z.number().int().nonnegative().nullable().optional(),
  error: z.string().max(4000).nullable().optional(),
});
export type BackupResult = z.infer<typeof backupResultSchema>;

export const accessSessionSchema = z.object({
  workloadId: z.string().uuid().nullable().optional(),
  tenantId: z.string().uuid().nullable().optional(),
  staffEmail: z.string().email().nullable().optional(),
  actorLabel: z.string().min(1).max(120),
  source: z.enum(['bastion', 'teleport', 'manual']).default('bastion'),
  target: z.string().min(1).max(200),
  reason: z.string().max(500).nullable().optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable().optional(),
  recordingRef: z.string().max(500).nullable().optional(),
});

export const probeResultsV2Schema = z.object({
  results: z
    .array(z.object({ componentId: z.string().uuid(), state: z.enum(COMPONENT_STATES), latencyMs: z.number().int().nonnegative().nullable(), checkedAt: z.string().datetime() }))
    .min(1),
});
