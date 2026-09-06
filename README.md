# VERITUT

Yönetilen çoklu-bulut operatörü — kontrol düzlemi (API + worker + runner), müşteri portalı, operasyon paneli, durum sayfası.
Plan: `ai-plans/VERITUT-Uygulama-Plani.md`. AI bağlamı: `CLAUDE.md`.

## Geliştirme (Docker filo)

```bash
cp infra/.env.example infra/.env          # sırları doldur (openssl rand -hex 32; node tools/gen-runner-keys.mjs)
docker compose -f infra/compose.dev.yml up -d --build
docker compose -f infra/compose.dev.yml exec api pnpm db:migrate
docker compose -f infra/compose.dev.yml exec api pnpm db:seed
```

Portal `https://vt-portal.dev-fethi.entra.net` · Ops `https://vt-ops.dev-fethi.entra.net` · Status `https://vt-status.dev-fethi.entra.net` · API `/api/v1/health`.

`pnpm check` · `pnpm test` · `pnpm lint` — Node ≥ 22 gerekir (container içinden: `docker compose -f infra/compose.dev.yml exec api pnpm check`).

## Smoke (K0 36 + K1 68 + K2 47 + devamlılık 6 + K3 69 + K4 62 = 288)

Host'tan koşar (container içinden dış HTTPS host'a dönüş çalışmaz — hairpin). Node ≥ 20 yeter, ek paket gerekmez.

```bash
node apps/api/scripts/smoke-k0.mjs
node apps/api/scripts/smoke-k1.mjs          # ön koşul: MinIO'da `veritut-backups` kovası
node apps/api/scripts/smoke-k2.mjs          # mock-vps ile gerçek OpenTofu (pg backend, şifreli state) + Ansible + dört-göz onayı
node apps/api/scripts/smoke-k2-resume.mjs   # runner SIGKILL → kaldığı adımdan devam (host'ta docker gerekir)
node apps/api/scripts/smoke-k3.mjs          # katalog → sipariş → fatura → ödeme → destek → public API
node apps/api/scripts/smoke-k4.mjs          # alarm → olay → SLA saati → çözüm · tatbikat · belgeler · denetçi bağlantısı
```

Kapsam: sağlık + fail-closed 403 · OIDC girişi (iki realm, Keycloak form POST) · kiracı oluşturma + izolasyon (404/400) ·
echo çalıştırması (runner → 8 adım → Redis stream → WS canlı log) · kanıt zinciri (append + public verify + kapalı sözlük) · status sayfası.
Her koşu `smoke-<ts>` adlı bir dev kiracısı bırakır.
