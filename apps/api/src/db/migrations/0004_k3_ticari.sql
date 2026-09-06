-- VERITUT 0004 — K3: katalog, fiyat, plan/SLA, entitlement, sipariş, abonelik aynası, kullanım, ticket, KPI.
-- ── Katalog ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  slug TEXT PRIMARY KEY,
  layer INT NOT NULL CHECK (layer BETWEEN 1 AND 4),
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  blueprint_slug TEXT NULL,
  /** Programatik landing gövdesi (markdown) + SEO alanları */
  seo_title TEXT NULL,
  seo_description TEXT NULL,
  body_md TEXT NOT NULL DEFAULT '',
  faq JSONB NOT NULL DEFAULT '[]'::jsonb,
  /** Karşılaştırma sayfaları: {rakip, baslik, ozet} */
  compare JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  sort INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_products_updated ON products;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Ürün sürümü = blueprint sürümü (yayımlanan tek sürüm self-servise açılır).
CREATE TABLE IF NOT EXISTS product_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug TEXT NOT NULL REFERENCES products(slug) ON DELETE CASCADE,
  blueprint_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','deprecated')),
  released_at TIMESTAMPTZ NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_slug, blueprint_version)
);
CREATE UNIQUE INDEX IF NOT EXISTS product_versions_one_published ON product_versions (product_slug) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS plans (
  code TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  /** Özellik anahtarları → bool | sayı (kota). getEffectiveFeatures tek formül. */
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort INT NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_plans_updated ON plans;
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS sla_tiers (
  code TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  coverage TEXT NOT NULL CHECK (coverage IN ('9x5','24x7')),
  response_min INT NOT NULL,
  resolve_min INT NOT NULL,
  uptime_target NUMERIC(5,2) NOT NULL DEFAULT 99.50,
  /** Aylık ek ücret (fiyat listesinde de olabilir; burada varsayılan) */
  monthly_uplift_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  sort INT NOT NULL DEFAULT 100
);

-- Fiyat: ürün × boyut × ikametgâh × plan × sla × para birimi, dönemsel geçerlilik.
CREATE TABLE IF NOT EXISTS price_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug TEXT NOT NULL REFERENCES products(slug) ON DELETE CASCADE,
  size TEXT NOT NULL,
  residency TEXT NOT NULL CHECK (residency IN ('TR','EU','US')),
  plan_code TEXT NOT NULL REFERENCES plans(code),
  sla_code TEXT NOT NULL REFERENCES sla_tiers(code),
  currency TEXT NOT NULL DEFAULT 'TRY',
  monthly NUMERIC(12,2) NOT NULL,
  setup_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_slug, size, residency, plan_code, sla_code, currency, valid_from)
);
CREATE INDEX IF NOT EXISTS price_list_lookup ON price_list (product_slug, residency, plan_code, sla_code, size);

-- Aşım/eklenti birim fiyatları (depolama GB, trafik TB, yedek alanı GB…)
CREATE TABLE IF NOT EXISTS addons (
  code TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  unit TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TRY',
  unit_price NUMERIC(12,4) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);

-- ── Sipariş ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_slug TEXT NOT NULL REFERENCES products(slug),
  product_version_id UUID NULL REFERENCES product_versions(id),
  plan_code TEXT NOT NULL REFERENCES plans(code),
  sla_code TEXT NOT NULL REFERENCES sla_tiers(code),
  residency TEXT NOT NULL CHECK (residency IN ('TR','EU','US')),
  region TEXT NOT NULL,
  size TEXT NOT NULL,
  workload_slug TEXT NOT NULL,
  workload_name TEXT NOT NULL,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  /** Sipariş anındaki fiyat — sonradan fiyat değişse bile sözleşme bu satırdır. */
  currency TEXT NOT NULL DEFAULT 'TRY',
  monthly NUMERIC(12,2) NOT NULL DEFAULT 0,
  setup_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_trial BOOLEAN NOT NULL DEFAULT false,
  trial_days INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','provisioning','fulfilled','rejected','cancelled')),
  workload_id UUID NULL REFERENCES workloads(id),
  run_id UUID NULL REFERENCES runs(id),
  ordered_by UUID NULL REFERENCES users(id),
  approved_by UUID NULL REFERENCES staff(id),
  reject_reason TEXT NULL,
  utm JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_orders_updated ON orders;
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS orders_tenant_idx ON orders (tenant_id, created_at DESC);

-- ── Abonelik aynası (D17: Core para toplamaz; billing omurgası ilerletir) ──
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workload_id UUID NULL REFERENCES workloads(id) ON DELETE SET NULL,
  plan_code TEXT NOT NULL REFERENCES plans(code),
  sla_code TEXT NOT NULL REFERENCES sla_tiers(code),
  status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing','active','past_due','suspended','cancelled')),
  currency TEXT NOT NULL DEFAULT 'TRY',
  monthly NUMERIC(12,2) NOT NULL DEFAULT 0,
  period_start DATE NOT NULL DEFAULT CURRENT_DATE,
  period_end DATE NULL,
  trial_ends_at TIMESTAMPTZ NULL,
  /** Faturalama omurgasındaki kimlik (FOSSBilling/Entranet) */
  billing_ref TEXT NULL,
  cancelled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_subs_updated ON tenant_subscriptions;
CREATE TRIGGER trg_subs_updated BEFORE UPDATE ON tenant_subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS subs_tenant_idx ON tenant_subscriptions (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS subs_workload_uniq ON tenant_subscriptions (workload_id) WHERE workload_id IS NOT NULL AND status <> 'cancelled';

-- Plan üstü kiracıya özel açma/kapama (satış istisnaları)
CREATE TABLE IF NOT EXISTS tenant_feature_overrides (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  value JSONB NOT NULL,
  note TEXT NULL,
  set_by UUID NULL REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, feature)
);

-- ── Ölçümleme (Core ölçer, billing fatura keser) ───────────────────────────
CREATE TABLE IF NOT EXISTS usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workload_id UUID NULL REFERENCES workloads(id) ON DELETE SET NULL,
  period TEXT NOT NULL,
  metric TEXT NOT NULL,
  qty NUMERIC(14,4) NOT NULL,
  unit TEXT NOT NULL DEFAULT 'month',
  currency TEXT NOT NULL DEFAULT 'TRY',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  note TEXT NULL,
  pushed_at TIMESTAMPTZ NULL,
  billing_ref TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, period, metric, workload_id)
);
CREATE INDEX IF NOT EXISTS usage_push_idx ON usage_records (period, pushed_at);

-- Fatura aynası (billing omurgasından webhook ile gelir; Core fatura KESMEZ)
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  billing_ref TEXT NOT NULL,
  number TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('draft','unpaid','paid','refunded','cancelled')),
  currency TEXT NOT NULL DEFAULT 'TRY',
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  issued_at TIMESTAMPTZ NULL,
  due_at TIMESTAMPTZ NULL,
  paid_at TIMESTAMPTZ NULL,
  pay_url TEXT NULL,
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (billing_ref)
);
DROP TRIGGER IF EXISTS trg_invoices_updated ON invoices;
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS invoices_tenant_idx ON invoices (tenant_id, created_at DESC);

-- ── Destek (Zammad aynası) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workload_id UUID NULL REFERENCES workloads(id) ON DELETE SET NULL,
  external_ref TEXT NOT NULL,
  number TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'new',
  priority TEXT NOT NULL DEFAULT 'normal',
  created_by UUID NULL REFERENCES users(id),
  minutes_spent NUMERIC(8,2) NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (external_ref)
);
DROP TRIGGER IF EXISTS trg_tickets_updated ON tickets;
CREATE TRIGGER trg_tickets_updated BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS tickets_tenant_idx ON tickets (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  external_ref TEXT NULL,
  author TEXT NOT NULL,
  from_customer BOOLEAN NOT NULL DEFAULT true,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (external_ref)
);
CREATE INDEX IF NOT EXISTS ticket_messages_idx ON ticket_messages (ticket_id, created_at);

-- ── KPI (plan §7.3) ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kpi_snapshots (
  period TEXT PRIMARY KEY,
  mrr NUMERIC(14,2) NOT NULL DEFAULT 0,
  nrr NUMERIC(6,2) NULL,
  churn_pct NUMERIC(6,2) NULL,
  gross_margin_pct NUMERIC(6,2) NULL,
  support_min_per_customer NUMERIC(8,2) NULL,
  sla_breaches INT NOT NULL DEFAULT 0,
  active_tenants INT NOT NULL DEFAULT 0,
  active_workloads INT NOT NULL DEFAULT 0,
  cac NUMERIC(12,2) NULL,
  ltv NUMERIC(12,2) NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pazarlama edinim: UTM (plan §10.5) — sipariş `utm` kolonunda; ziyaret kaydı burada.
CREATE TABLE IF NOT EXISTS utm_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id UUID NULL REFERENCES orders(id) ON DELETE CASCADE,
  source TEXT NULL,
  medium TEXT NULL,
  campaign TEXT NULL,
  landing_path TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE workloads ADD COLUMN IF NOT EXISTS plan_code TEXT NULL REFERENCES plans(code);
ALTER TABLE workloads ADD COLUMN IF NOT EXISTS order_id UUID NULL;
ALTER TABLE workloads ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ NULL;
