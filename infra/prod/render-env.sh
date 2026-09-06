#!/usr/bin/env bash
# VERITUT prod — env dosyalarını üretir. Sunucuda root olarak koşar, idempotenttir.
#   bash infra/prod/render-env.sh
# Sırlar TEK kaynakta (/etc/veritut/secrets.env, 0600 root) tutulur; buradan servis başına
# env dosyaları türetilir. Ayrım tesadüfi değil:
#   common.env   → api (+ portal/ops SSR'ın ihtiyacı olan alt küme kendi dosyalarında)
#   worker.env   → DB kimliği YOK (D5)
#   runner.env   → RUNNER_PRIVATE_KEY yalnız burada, grup veritut-runner (D12)
#   status.env   → yalnız STATUS_REDIS_URL (D14)
set -euo pipefail

ETC=/etc/veritut
DOMAIN=${DOMAIN:-veritut.com}
APP_DIR=${APP_DIR:-/srv/veritut/app}

# 0751: servis kullanıcıları dizini GEÇEBİLİR (dosya modları erişimi belirler), listeleyemez.
install -d -m 0751 -o root -g root "$ETC"

gen_hex() { openssl rand -hex "$1"; }

# --- 1. sırlar: yalnız eksik olanlar üretilir, var olanlar korunur ---
SECRETS="$ETC/secrets.env"
touch "$SECRETS"; chmod 0600 "$SECRETS"
set_secret() {
  local key=$1 val=$2
  grep -q "^${key}=" "$SECRETS" || printf '%s=%s\n' "$key" "$val" >> "$SECRETS"
}
set_secret POSTGRES_APP_PASSWORD   "$(gen_hex 24)"
set_secret KC_DB_PASSWORD          "$(gen_hex 24)"
set_secret TFSTATE_DB_PASSWORD     "$(gen_hex 24)"
set_secret REDIS_PASSWORD          "$(gen_hex 24)"
set_secret REDIS_STATUS_PASSWORD   "$(gen_hex 16)"
set_secret SESSION_ENC_KEY         "$(gen_hex 32)"
set_secret INTERNAL_TOKEN          "$(gen_hex 24)"
set_secret TFSTATE_ENC_PASSPHRASE  "$(gen_hex 24)"
set_secret OIDC_MUSTERI_CLIENT_SECRET "$(gen_hex 24)"
set_secret OIDC_OPS_CLIENT_SECRET  "$(gen_hex 24)"
set_secret BILLING_WEBHOOK_SECRET  "$(gen_hex 24)"
set_secret TICKET_WEBHOOK_SECRET   "$(gen_hex 24)"
set_secret ALERTMANAGER_TOKEN      "$(gen_hex 24)"
set_secret KC_BOOTSTRAP_ADMIN_PASSWORD "$(gen_hex 20)"
set_secret S3_ACCESS_KEY           "veritut-prod"
set_secret S3_SECRET_KEY           "$(gen_hex 24)"

# Runner anahtar çifti (D12) — bir kez üretilir, rotasyon ayrı runbook işidir.
if ! grep -q '^RUNNER_PRIVATE_KEY=' "$SECRETS"; then
  node "$APP_DIR/tools/gen-runner-keys.mjs" >> "$SECRETS"
fi

# shellcheck disable=SC1090
set -a; . "$SECRETS"; set +a

DB_URL="postgres://veritut:${POSTGRES_APP_PASSWORD}@127.0.0.1:5432/veritut"
TFSTATE_URL="postgres://tfstate:${TFSTATE_DB_PASSWORD}@127.0.0.1:5432/veritut_tfstate"
REDIS_URL="redis://default:${REDIS_PASSWORD}@127.0.0.1:6379"

write_env() {  # write_env <dosya> <sahip> <grup> <mod>
  local f=$ETC/$1 owner=$2 group=$3 mode=$4
  cat > "$f.tmp"; mv "$f.tmp" "$f"; chown "$owner:$group" "$f"; chmod "$mode" "$f"
}

# --- 2. api (+ ortak) ---
write_env common.env root veritut 0640 <<EOF
NODE_ENV=production
LOG_LEVEL=info
DATABASE_URL=$DB_URL
REDIS_URL=$REDIS_URL
API_URL=http://127.0.0.1:4400
# seed'in platform bileşeni probe adresleri (status sayfası) — prod'da localhost portları.
PORTAL_INTERNAL_URL=http://127.0.0.1:5240
OPS_INTERNAL_URL=http://127.0.0.1:5241
PORTAL_URL=https://$DOMAIN
OPS_URL=https://ops.$DOMAIN
STATUS_URL=https://durum.$DOMAIN
CORS_ORIGIN=https://$DOMAIN,https://ops.$DOMAIN
KC_PUBLIC_URL=https://kimlik.$DOMAIN
KC_INTERNAL_URL=http://127.0.0.1:8080
KC_REALM_MUSTERI=veritut-musteri
KC_REALM_OPS=veritut-ops
OIDC_MUSTERI_CLIENT_ID=portal
OIDC_MUSTERI_CLIENT_SECRET=$OIDC_MUSTERI_CLIENT_SECRET
OIDC_OPS_CLIENT_ID=ops
OIDC_OPS_CLIENT_SECRET=$OIDC_OPS_CLIENT_SECRET
SESSION_ENC_KEY=$SESSION_ENC_KEY
INTERNAL_TOKEN=$INTERNAL_TOKEN
RUNNER_PUBLIC_KEY=$RUNNER_PUBLIC_KEY
BILLING_PROVIDER=mock
BILLING_WEBHOOK_SECRET=$BILLING_WEBHOOK_SECRET
TICKET_PROVIDER=mock
TICKET_WEBHOOK_SECRET=$TICKET_WEBHOOK_SECRET
ALERTMANAGER_TOKEN=$ALERTMANAGER_TOKEN
BLUEPRINTS_DIR=$APP_DIR/infra/blueprints
S3_ENDPOINT=http://127.0.0.1:9000
S3_ACCESS_KEY=$S3_ACCESS_KEY
S3_SECRET_KEY=$S3_SECRET_KEY
S3_BUCKET=veritut-prod
EOF

write_env api.env root veritut 0640 <<EOF
API_PORT=4400
EOF

# --- 3. worker: DB YOK, tedarikçi sırrı YOK ---
write_env worker.env root veritut 0640 <<EOF
NODE_ENV=production
LOG_LEVEL=info
REDIS_URL=$REDIS_URL
API_URL=http://127.0.0.1:4400
INTERNAL_TOKEN=$INTERNAL_TOKEN
MAIL_PROVIDER=mock
EOF

# --- 4. runner: özel anahtar yalnız burada ---
write_env runner.env root veritut-runner 0640 <<EOF
NODE_ENV=production
LOG_LEVEL=info
REDIS_URL=$REDIS_URL
API_URL=http://127.0.0.1:4400
INTERNAL_TOKEN=$INTERNAL_TOKEN
RUNNER_PRIVATE_KEY=$RUNNER_PRIVATE_KEY
TFSTATE_DATABASE_URL=$TFSTATE_URL
TFSTATE_ENC_PASSPHRASE=$TFSTATE_ENC_PASSPHRASE
PROVIDER_DRIVERS=mock,hetzner
BLUEPRINTS_DIR=$APP_DIR/infra/blueprints
WORK_DIR=/var/lib/veritut-runner/work
KC_INTERNAL_URL=http://127.0.0.1:8080
KC_ADMIN_PASSWORD=$KC_BOOTSTRAP_ADMIN_PASSWORD
S3_ENDPOINT=https://s3.$DOMAIN
S3_ACCESS_KEY=$S3_ACCESS_KEY
S3_SECRET_KEY=$S3_SECRET_KEY
S3_BUCKET=veritut-prod
EOF

# --- 5. SvelteKit yüzeyleri (adapter-node: ORIGIN + PORT + HOST) ---
write_env portal.env root veritut 0640 <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=5240
ORIGIN=https://$DOMAIN
API_URL=http://127.0.0.1:4400
EOF

write_env ops.env root veritut 0640 <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=5241
ORIGIN=https://ops.$DOMAIN
API_URL=http://127.0.0.1:4400
EOF

# D14: status'un DB'si, Keycloak'ı, iç token'ı YOK. Redis kullanıcısı yalnız status:* okur.
write_env status.env root veritut-status 0640 <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=5242
ORIGIN=https://durum.$DOMAIN
STATUS_REDIS_URL=redis://status:${REDIS_STATUS_PASSWORD}@127.0.0.1:6379
EOF

# --- 6. Keycloak + MinIO ---
write_env keycloak.env root keycloak 0640 <<EOF
KC_DB=postgres
KC_DB_URL=jdbc:postgresql://127.0.0.1:5432/keycloak
KC_DB_USERNAME=keycloak
KC_DB_PASSWORD=$KC_DB_PASSWORD
KC_HOSTNAME=https://kimlik.$DOMAIN
KC_HTTP_ENABLED=true
KC_HTTP_HOST=127.0.0.1
KC_HTTP_PORT=8080
KC_PROXY_HEADERS=xforwarded
KC_HEALTH_ENABLED=true
# KC 26 yönetim arayüzü varsayılan 9000 — MinIO ile çakışır, taşındı.
KC_HTTP_MANAGEMENT_PORT=9990
KC_BOOTSTRAP_ADMIN_USERNAME=admin
KC_BOOTSTRAP_ADMIN_PASSWORD=$KC_BOOTSTRAP_ADMIN_PASSWORD
# Tırnak şart: systemd EnvironmentFile tırnagi soyar, kabuk source ederken bosluk komut sanilir.
JAVA_OPTS_KC_HEAP="-Xms192m -Xmx640m"
EOF

write_env minio.env root minio 0640 <<EOF
MINIO_ROOT_USER=$S3_ACCESS_KEY
MINIO_ROOT_PASSWORD=$S3_SECRET_KEY
MINIO_BROWSER=off
EOF

echo "env dosyaları yazıldı: $ETC (sırlar $SECRETS içinde, 0600)"
