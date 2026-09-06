#!/usr/bin/env bash
# VERITUT prod sunucu hazırlığı — Ubuntu 26.04, root, idempotent (yeniden koşabilir).
#   DOMAIN=veritut.com bash bootstrap.sh
#
# SAPMA NOTU: plan §13 altı sunucu öngörür (app/data/runner/kimlik/gözlem/durum-ayrı-tedarikçi).
# Bu betik hepsini TEK makineye kurar; runner ve status ayrı UNIX kullanıcılarıyla izole edilir
# (D5/D12/D14 uygulama sınırları korunur, fiziksel ayrım korunmaz). Açık borç: docs/kalan-isler.md B1.
set -euo pipefail

DOMAIN=${DOMAIN:-veritut.com}
REPO=${REPO:-https://github.com/verisay/veritut.git}
BRANCH=${BRANCH:-main}
APP_DIR=/srv/veritut/app
OPENTOFU_VERSION=${OPENTOFU_VERSION:-1.8.5}
KEYCLOAK_VERSION=${KEYCLOAK_VERSION:-26.0.7}
PNPM_VERSION=${PNPM_VERSION:-10.17.0}

SRC=$(cd "$(dirname "$0")" && pwd)

log() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "root gerekiyor"; exit 1; }

# --- 1. takas alanı: 3 GB RAM'de SvelteKit build'i takas olmadan OOM oluyor ---
log "takas alanı"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -qw vm.swappiness=10
grep -q '^vm.swappiness' /etc/sysctl.d/99-veritut.conf 2>/dev/null || echo 'vm.swappiness=10' > /etc/sysctl.d/99-veritut.conf

# --- 2. paketler ---
log "apt paketleri"
export DEBIAN_FRONTEND=noninteractive
. /etc/os-release
if [ ! -f /etc/apt/sources.list.d/pgdg.sources ]; then
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
  cat > /etc/apt/sources.list.d/pgdg.sources <<EOF
Types: deb
URIs: https://apt.postgresql.org/pub/repos/apt
Suites: ${VERSION_CODENAME}-pgdg
Components: main
Signed-By: /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
EOF
fi
apt-get update -qq
apt-get install -y -qq --no-install-recommends \
  postgresql-16 postgresql-client-16 redis-server nginx \
  nodejs npm git curl ca-certificates unzip jq openssl \
  openjdk-21-jre-headless restic ansible \
  certbot python3-certbot-nginx ufw fonts-dejavu-core acl
# PDF'lerdeki Türkçe karakterler için DejaVu ZORUNLU (tuzak #20).
[ -f /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf ] || { echo "DejaVuSans.ttf yok"; exit 1; }

log "pnpm $PNPM_VERSION"
npm ls -g pnpm 2>/dev/null | grep -q "pnpm@$PNPM_VERSION" || npm install -g -s "pnpm@$PNPM_VERSION"

log "OpenTofu $OPENTOFU_VERSION"
if ! command -v tofu >/dev/null || [ "$(tofu version | head -1 | grep -o '[0-9.]*')" != "$OPENTOFU_VERSION" ]; then
  curl -fsSL "https://github.com/opentofu/opentofu/releases/download/v${OPENTOFU_VERSION}/tofu_${OPENTOFU_VERSION}_linux_amd64.zip" -o /tmp/tofu.zip
  unzip -qo /tmp/tofu.zip tofu -d /usr/local/bin && rm -f /tmp/tofu.zip
fi
# Debian/Ubuntu ansible paketi eski community.docker taşır (tuzak #16).
ansible-galaxy collection install -f 'community.docker:>=3.10.0,<5' 'community.general:>=8.0.0,<10' \
  -p /usr/share/ansible/collections >/dev/null

# --- 3. kullanıcılar ve dizinler (D5/D12/D14 sınırları) ---
log "kullanıcılar"
for u in veritut veritut-runner veritut-status keycloak minio; do
  id -u "$u" >/dev/null 2>&1 || useradd --system --create-home --home-dir "/var/lib/$u" --shell /usr/sbin/nologin "$u"
done
install -d -m 0755 -o veritut -g veritut /srv/veritut
install -d -m 0700 -o veritut-runner -g veritut-runner /var/lib/veritut-runner/work
install -d -m 0750 -o minio -g minio /var/lib/minio
install -d -m 0755 /var/www/acme
install -d -m 0751 /etc/veritut
install -d -m 0750 /etc/veritut/tls

# --- 4. Keycloak ---
log "Keycloak $KEYCLOAK_VERSION"
if [ ! -x /opt/keycloak/bin/kc.sh ] || ! grep -q "$KEYCLOAK_VERSION" /opt/keycloak/version.txt 2>/dev/null; then
  curl -fsSL "https://github.com/keycloak/keycloak/releases/download/${KEYCLOAK_VERSION}/keycloak-${KEYCLOAK_VERSION}.zip" -o /tmp/kc.zip
  rm -rf /opt/keycloak.new && mkdir -p /opt/keycloak.new
  unzip -qo /tmp/kc.zip -d /opt/keycloak.new && rm -f /tmp/kc.zip
  rm -rf /opt/keycloak && mv "/opt/keycloak.new/keycloak-${KEYCLOAK_VERSION}" /opt/keycloak && rmdir /opt/keycloak.new
  echo "$KEYCLOAK_VERSION" > /opt/keycloak/version.txt
  chown -R keycloak:keycloak /opt/keycloak
fi

# --- 5. MinIO (yedek deposu; aynı makinede olması 3-2-1'i KARŞILAMAZ — açık borç) ---
log "MinIO"
if [ ! -x /usr/local/bin/minio ]; then
  curl -fsSL https://dl.min.io/server/minio/release/linux-amd64/minio -o /usr/local/bin/minio
  chmod +x /usr/local/bin/minio
fi
if [ ! -x /usr/local/bin/mc ]; then
  curl -fsSL https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc
  chmod +x /usr/local/bin/mc
fi

# --- 6. depo ---
log "depo: $REPO ($BRANCH)"
if [ ! -d "$APP_DIR/.git" ]; then
  sudo -u veritut git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
else
  sudo -u veritut git -C "$APP_DIR" fetch --all --prune
fi
# runner ve status uygulama kaynağını okumalı (çalıştırma), yazmamalı.
setfacl -R -m u:veritut-runner:rX -m u:veritut-status:rX "$APP_DIR" 2>/dev/null || true
setfacl -R -d -m u:veritut-runner:rX -d -m u:veritut-status:rX "$APP_DIR" 2>/dev/null || true

# --- 7. env dosyaları ---
log "env dosyaları"
DOMAIN="$DOMAIN" APP_DIR="$APP_DIR" bash "$SRC/render-env.sh"
set -a; . /etc/veritut/secrets.env; set +a

# --- 8. PostgreSQL 16 ---
log "PostgreSQL"
pg_lsclusters | grep -q '^16 *main' || pg_createcluster 16 main --start
systemctl enable --now postgresql@16-main
sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<EOF
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='veritut') THEN
    CREATE ROLE veritut LOGIN PASSWORD '${POSTGRES_APP_PASSWORD}';
  ELSE ALTER ROLE veritut PASSWORD '${POSTGRES_APP_PASSWORD}'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='keycloak') THEN
    CREATE ROLE keycloak LOGIN PASSWORD '${KC_DB_PASSWORD}';
  ELSE ALTER ROLE keycloak PASSWORD '${KC_DB_PASSWORD}'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='tfstate') THEN
    CREATE ROLE tfstate LOGIN PASSWORD '${TFSTATE_DB_PASSWORD}';
  ELSE ALTER ROLE tfstate PASSWORD '${TFSTATE_DB_PASSWORD}'; END IF;
END \$\$;
SELECT 'CREATE DATABASE veritut OWNER veritut' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname='veritut')\gexec
SELECT 'CREATE DATABASE keycloak OWNER keycloak' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname='keycloak')\gexec
SELECT 'CREATE DATABASE veritut_tfstate OWNER tfstate' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname='veritut_tfstate')\gexec
EOF
# 3 GB RAM: Postgres'i mütevazı tut.
install -m 0644 "$SRC/postgres/veritut.conf" /etc/postgresql/16/main/conf.d/veritut.conf
systemctl restart postgresql@16-main

# --- 9. Redis 7+ (ACL: status kullanıcısı yalnız status:* okur — tuzak #8) ---
log "Redis"
cat > /etc/redis/users.acl <<EOF
user default on >${REDIS_PASSWORD} ~* &* +@all
user status on >${REDIS_STATUS_PASSWORD} ~status:* +get +mget +exists +ping +ttl
EOF
chown redis:redis /etc/redis/users.acl && chmod 0640 /etc/redis/users.acl
install -d -m 0755 /etc/redis/redis.conf.d
cat > /etc/redis/redis.conf.d/veritut.conf <<'EOF'
bind 127.0.0.1 -::1
appendonly yes
aclfile /etc/redis/users.acl
maxmemory 256mb
maxmemory-policy noeviction
EOF
grep -q 'include /etc/redis/redis.conf.d/veritut.conf' /etc/redis/redis.conf \
  || echo 'include /etc/redis/redis.conf.d/veritut.conf' >> /etc/redis/redis.conf
systemctl enable --now redis-server && systemctl restart redis-server

# Keycloak'u optimize derle (--optimized ile başlatmanın ön koşulu; env render'dan sonra).
log "Keycloak build"
# Build-time seçenekler (KC_DB, KC_HEALTH_ENABLED …) start sırasında değişemez —
# derleme env dosyasının TAMAMIYLA yapılmalı, yoksa start "differ from what is persisted" ile düşer.
sudo -u keycloak env KC_DB=postgres KC_HEALTH_ENABLED=true /opt/keycloak/bin/kc.sh build >/dev/null

# --- 10. systemd birimleri ---
log "systemd birimleri"
install -m 0644 "$SRC"/systemd/veritut-*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable veritut-keycloak veritut-minio veritut-api veritut-worker veritut-runner veritut-portal veritut-ops veritut-status >/dev/null

# --- 11. nginx + geçici self-signed sertifika (DNS gelince tls-issue.sh değiştirir) ---
log "nginx"
install -d -m 0755 /etc/nginx/snippets
install -m 0644 "$SRC/nginx/veritut-tls.conf" "$SRC/nginx/veritut-guvenlik.conf" "$SRC/nginx/veritut-acme.conf" /etc/nginx/snippets/
install -m 0644 "$SRC/nginx/veritut.conf" /etc/nginx/sites-available/veritut.conf
ln -sf /etc/nginx/sites-available/veritut.conf /etc/nginx/sites-enabled/veritut.conf
rm -f /etc/nginx/sites-enabled/default
if [ ! -f /etc/veritut/tls/fullchain.pem ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 90 \
    -keyout /etc/veritut/tls/privkey.pem -out /etc/veritut/tls/fullchain.pem \
    -subj "/CN=$DOMAIN" \
    -addext "subjectAltName=DNS:$DOMAIN,DNS:www.$DOMAIN,DNS:ops.$DOMAIN,DNS:durum.$DOMAIN,DNS:kimlik.$DOMAIN,DNS:api.$DOMAIN,DNS:s3.$DOMAIN" 2>/dev/null
  chmod 0640 /etc/veritut/tls/privkey.pem; chown root:root /etc/veritut/tls/privkey.pem
fi
nginx -t && systemctl enable --now nginx && systemctl reload nginx

# --- 12. güvenlik duvarı ---
log "ufw"
ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ufw status | head -8

log "bootstrap tamam — sıra: infra/prod/deploy.sh (derleme + migration + servisler)"
