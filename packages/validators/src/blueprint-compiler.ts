import { z } from 'zod';
import type { BlueprintInputField, BlueprintInputs, BlueprintManifest } from '@veritut/types';
import { PROVIDERS, RESIDENCIES } from '@veritut/types';

/**
 * Blueprint `inputs` (JSON Schema alt kümesi) → Zod (plan §3.4). Tek doğrulama kaynağı:
 * portal/ops formu, API sınırı ve runner girdi kontrolü aynı derleyiciyi kullanır.
 */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function compileField(name: string, f: BlueprintInputField): z.ZodTypeAny {
  let s: z.ZodTypeAny;
  switch (f.type) {
    case 'string': {
      let str = z.string();
      if (f.minLength !== undefined) str = str.min(f.minLength, `${f.title_tr}: en az ${f.minLength} karakter`);
      if (f.maxLength !== undefined) str = str.max(f.maxLength, `${f.title_tr}: en fazla ${f.maxLength} karakter`);
      if (f.pattern) str = str.regex(new RegExp(f.pattern), `${f.title_tr}: biçim uygun değil`);
      if (f.format === 'slug') str = str.regex(SLUG_RE, `${f.title_tr}: küçük harf, rakam ve tire`);
      if (f.format === 'hostname') str = str.regex(HOSTNAME_RE, `${f.title_tr}: geçerli bir alan adı girin`);
      if (f.format === 'email') str = str.email(`${f.title_tr}: geçerli bir e-posta girin`);
      if (f.format === 'url') str = str.url(`${f.title_tr}: geçerli bir URL girin`);
      s = f.enum ? z.enum(f.enum.map(String) as [string, ...string[]]) : str;
      break;
    }
    case 'number':
    case 'integer': {
      let num = z.coerce.number();
      if (f.type === 'integer') num = num.int(`${f.title_tr}: tam sayı olmalı`);
      if (f.minimum !== undefined) num = num.min(f.minimum, `${f.title_tr}: en az ${f.minimum}`);
      if (f.maximum !== undefined) num = num.max(f.maximum, `${f.title_tr}: en fazla ${f.maximum}`);
      s = f.enum ? z.coerce.number().refine((v) => (f.enum as number[]).includes(v), `${f.title_tr}: izinli değerlerden biri olmalı`) : num;
      break;
    }
    case 'boolean':
      s = z.union([z.boolean(), z.enum(['true', 'false', 'on', '1', '0', ''])]).transform((v) => v === true || v === 'true' || v === 'on' || v === '1');
      break;
    default:
      throw new Error(`blueprint alanı ${name}: bilinmeyen tür`);
  }
  if (f.default !== undefined) s = s.default(f.default);
  return s;
}

export function compileInputs(inputs: BlueprintInputs): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [name, f] of Object.entries(inputs.properties)) {
    const base = compileField(name, f);
    shape[name] = inputs.required.includes(name) || f.default !== undefined ? base : base.optional();
  }
  return z.object(shape).strict();
}

/** Sır alanlarını ayırır: `plain` DB `inputs`'a, `secrets` mühürlenerek `workload_secrets`'a. */
export function splitSecrets(inputs: BlueprintInputs, values: Record<string, unknown>): { plain: Record<string, unknown>; secrets: Record<string, string> } {
  const plain: Record<string, unknown> = {};
  const secrets: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    if (inputs.properties[k]?.secret) secrets[k] = String(v);
    else plain[k] = v;
  }
  return { plain, secrets };
}

const fieldSchema = z.object({
  type: z.enum(['string', 'number', 'integer', 'boolean']),
  title_tr: z.string().min(1),
  help_tr: z.string().optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  enum: z.array(z.union([z.string(), z.number()])).min(1).optional(),
  enum_labels_tr: z.array(z.string()).optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  minLength: z.number().int().optional(),
  maxLength: z.number().int().optional(),
  pattern: z.string().optional(),
  format: z.enum(['hostname', 'email', 'url', 'slug']).optional(),
  secret: z.boolean().optional(),
  ops_only: z.boolean().optional(),
});

/** blueprint.yaml manifest doğrulaması (yükleme anında; hatalı manifest katalogda görünmez). */
export const blueprintManifestSchema = z.object({
  slug: z.string().regex(SLUG_RE),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'semver'),
  layer: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  title_tr: z.string().min(2),
  summary_tr: z.string().min(2),
  product_slug: z.string().regex(SLUG_RE),
  residencies: z.array(z.enum(RESIDENCIES)).min(1),
  providers: z.array(z.enum(PROVIDERS)).min(1),
  regions: z.record(z.array(z.string())).default({}),
  sizes: z.array(z.object({ code: z.string().min(1), title_tr: z.string(), vars: z.record(z.union([z.string(), z.number(), z.boolean()])), price_hint_eur: z.number().optional() })).min(1),
  sla_tiers: z.array(z.string()).default(['std_9x5']),
  inputs: z.object({ properties: z.record(fieldSchema).default({}), required: z.array(z.string()).default([]) }).default({ properties: {}, required: [] }),
  backup_policy: z.object({ schedule: z.string(), retention: z.string(), paths: z.array(z.string()) }).nullable().default(null),
  ports: z.array(z.number().int()).default([]),
  checks: z.array(z.object({ name: z.string(), kind: z.enum(['http', 'tcp', 'script']), target: z.string(), expect: z.number().int().optional(), timeout_s: z.number().int().optional() })).default([]),
  sso: z.object({ oidc: z.boolean(), redirect_path: z.string().optional() }).default({ oidc: false }),
  metrics: z.array(z.string()).default([]),
  has_tofu: z.boolean().default(true),
  has_ansible: z.boolean().default(true),
  playbook: z.string().optional(),
  apply_timeout_min: z.number().int().min(1).max(180).default(45),
}) satisfies z.ZodType<BlueprintManifest, z.ZodTypeDef, unknown>;

/** Ops/portal provizyon isteği — blueprint'e bağımlı `inputs` ayrıca derlenmiş şemayla doğrulanır. */
export const provisionRequestSchema = z.object({
  tenantId: z.string().uuid(),
  blueprint: z.string().regex(SLUG_RE),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  slug: z.string().regex(SLUG_RE).min(3).max(40),
  name: z.string().trim().min(2).max(120),
  residency: z.enum(RESIDENCIES),
  providerAccountId: z.string().uuid(),
  region: z.string().min(1).max(40),
  size: z.string().min(1).max(40),
  slaTier: z.string().max(40).default('std_9x5'),
  inputs: z.record(z.unknown()).default({}),
});
export type ProvisionRequest = z.infer<typeof provisionRequestSchema>;

export const planReportSchema = z.object({
  add: z.number().int().nonnegative(),
  change: z.number().int().nonnegative(),
  destroy: z.number().int().nonnegative(),
  replace: z.number().int().nonnegative(),
  resources: z.array(z.object({ address: z.string(), action: z.enum(['create', 'update', 'delete', 'replace', 'no-op', 'read']) })).max(500),
});

export const registerWorkloadSchema = z.object({
  endpoints: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
  /** Plain erişim bilgisi — API mühürler (RUNNER_PUBLIC_KEY), kendisi bir daha okuyamaz. */
  access: z.record(z.string()).optional(),
  monitoringTargets: z.array(z.object({ job: z.string(), target: z.string(), labels: z.record(z.string()).default({}) })).default([]),
  probeUrl: z.string().url().nullable().optional(),
  outputs: z.record(z.unknown()).default({}),
});
