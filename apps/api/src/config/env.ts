import { z } from 'zod';

/** Ortam değişkenleri — Zod ile başlangıçta doğrulanır; eksik/bozuk env ile süreç HİÇ kalkmaz. */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  API_PORT: z.coerce.number().int().default(4400),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  CORS_ORIGIN: z.string().default(''),

  /** Yüzey origin'leri — OIDC redirect_uri allow-list'i ve çerez ayrımı (portal/ops). */
  PORTAL_URL: z.string().url(),
  OPS_URL: z.string().url(),

  /** Keycloak — tarayıcının gittiği public taban ve API'nin konuştuğu iç taban (hairpin sorunu). */
  KC_PUBLIC_URL: z.string().url(),
  KC_INTERNAL_URL: z.string().url(),
  KC_REALM_MUSTERI: z.string().default('veritut-musteri'),
  KC_REALM_OPS: z.string().default('veritut-ops'),
  OIDC_MUSTERI_CLIENT_ID: z.string().default('portal'),
  OIDC_MUSTERI_CLIENT_SECRET: z.string().min(8),
  OIDC_OPS_CLIENT_ID: z.string().default('ops'),
  OIDC_OPS_CLIENT_SECRET: z.string().min(8),

  /** Oturumdaki Keycloak token'larını şifrelemek için (AES-256-GCM, hex 64). */
  SESSION_ENC_KEY: z.string().regex(/^[0-9a-f]{64}$/, 'SESSION_ENC_KEY 32 bayt hex olmalı'),
  SESSION_TTL_HOURS_PORTAL: z.coerce.number().int().default(12),
  SESSION_TTL_HOURS_OPS: z.coerce.number().int().default(8),

  /** Runner'ın X25519 AÇIK anahtarı (hex 64) — API yalnız mühürler (D12). Özel anahtar API'de YOK. */
  RUNNER_PUBLIC_KEY: z.string().regex(/^[0-9a-f]{64}$/, 'RUNNER_PUBLIC_KEY 32 bayt hex olmalı'),

  /** Worker/runner → API iç uçları. */
  INTERNAL_TOKEN: z.string().min(16),

  /** Faturalama omurgası (D17) — Core para toplamaz. */
  BILLING_PROVIDER: z.enum(['mock', 'fossbilling']).default('mock'),
  FOSSBILLING_URL: z.string().default(''),
  FOSSBILLING_API_KEY: z.string().default(''),
  BILLING_WEBHOOK_SECRET: z.string().min(16, 'BILLING_WEBHOOK_SECRET en az 16 karakter'),
  /** Destek masası (D18). */
  TICKET_PROVIDER: z.enum(['mock', 'zammad']).default('mock'),
  ZAMMAD_URL: z.string().default(''),
  ZAMMAD_TOKEN: z.string().default(''),
  TICKET_WEBHOOK_SECRET: z.string().min(16, 'TICKET_WEBHOOK_SECRET en az 16 karakter'),
  /** Blueprint kök dizini (dev: /app/infra/blueprints; prod deploy'da repo içi). */
  BLUEPRINTS_DIR: z.string().default(''),
  S3_ENDPOINT: z.string().default(''),
  S3_ACCESS_KEY: z.string().default(''),
  S3_SECRET_KEY: z.string().default(''),
  S3_BUCKET: z.string().default('veritut-dev'),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Ortam değişkenleri geçersiz:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env: Env = parsed.data;
