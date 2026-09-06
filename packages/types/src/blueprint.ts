import type { ProviderCode, Residency } from './roles.js';

/**
 * Blueprint manifesti (plan §3.4, `infra/blueprints/<slug>/<semver>/blueprint.yaml`).
 * Repo'da sürümlü; DB yalnız `slug@version` referansı tutar. Yayımlanmış sürüm değişmez.
 */
export type BlueprintLayer = 1 | 2 | 3 | 4;

/** `inputs` — JSON Schema alt kümesi; `packages/validators` Zod'a derler, portal/ops formu üretir. */
export interface BlueprintInputField {
  type: 'string' | 'number' | 'integer' | 'boolean';
  title_tr: string;
  help_tr?: string;
  default?: string | number | boolean;
  enum?: Array<string | number>;
  enum_labels_tr?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: 'hostname' | 'email' | 'url' | 'slug';
  /** Sır: API mühürler (`workload_secrets`), runner açar; formda parola alanı, loglarda maskeli. */
  secret?: boolean;
  /** Ops'a görünür, müşteri formunda gizli (K3 self-servis). */
  ops_only?: boolean;
}

export interface BlueprintInputs {
  properties: Record<string, BlueprintInputField>;
  required: string[];
}

export interface BlueprintSize {
  code: string;
  title_tr: string;
  /** tofu değişkenleri (server_type, volume_gb, …) */
  vars: Record<string, string | number | boolean>;
  price_hint_eur?: number;
}

export interface BlueprintBackupPolicy {
  schedule: string;
  retention: string;
  paths: string[];
}

export interface BlueprintCheck {
  name: string;
  kind: 'http' | 'tcp' | 'script';
  /** `{{ outputs.<ad> }}` şablonları tofu çıktılarıyla doldurulur */
  target: string;
  expect?: number;
  timeout_s?: number;
}

export interface BlueprintManifest {
  slug: string;
  version: string;
  layer: BlueprintLayer;
  title_tr: string;
  summary_tr: string;
  /** Kanonik ürün (K3 katalog eşlemesi) */
  product_slug: string;
  residencies: Residency[];
  providers: ProviderCode[];
  /** provider → bölge listesi (ikametgâh eşlemesi driver'da) */
  regions: Partial<Record<ProviderCode, string[]>>;
  sizes: BlueprintSize[];
  sla_tiers: string[];
  inputs: BlueprintInputs;
  backup_policy: BlueprintBackupPolicy | null;
  ports: number[];
  checks: BlueprintCheck[];
  sso: { oidc: boolean; redirect_path?: string };
  metrics: string[];
  /** `tofu/` ve `ansible/` dizinleri yoksa (yalnız seed) false */
  has_tofu: boolean;
  has_ansible: boolean;
  /** Ansible playbook giriş dosyası */
  playbook?: string;
  /** Runner'da tofu apply zaman aşımı (dk) */
  apply_timeout_min?: number;
}

/** Runner → API plan özeti (tofu plan -json'dan). */
export interface PlanSummary {
  add: number;
  change: number;
  destroy: number;
  replace: number;
  resources: Array<{ address: string; action: 'create' | 'update' | 'delete' | 'replace' | 'no-op' | 'read' }>;
}

export type RunRisk = 'low' | 'medium' | 'high';
