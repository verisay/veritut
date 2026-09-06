#!/usr/bin/env bash
# Prod realm'lerini üretir ve Keycloak'a aktarır. Sunucuda root olarak koşar.
#   bash infra/prod/kc-import.sh              # realm'leri içe aktar
#   OPS_ADMIN_EMAIL=... bash kc-import.sh     # + ilk personel hesabını aç (break-glass)
# UYARI: `kc.sh import` var olan realm'i günceller; dev'deki --import-realm ATLAMA davranışı
# burada geçerli değil (tuzak #11). Realm değişikliği prod'da kcadm ile noktasal yapılmalıdır.
set -euo pipefail
DOMAIN=${DOMAIN:-veritut.com}
APP_DIR=${APP_DIR:-/srv/veritut/app}
SRC=$(cd "$(dirname "$0")" && pwd)
# secrets.env sırları taşır; kullanıcı adı gibi sır olmayan ayarlar keycloak.env'de.
set -a; . /etc/veritut/secrets.env; . /etc/veritut/keycloak.env; set +a

install -d -m 0700 /etc/veritut/realms
DOMAIN="$DOMAIN" REALM_SRC="$APP_DIR/infra/keycloak/realms" \
  node "$SRC/render-realms.mjs" /etc/veritut/realms
chown -R keycloak:keycloak /etc/veritut/realms

was_active=$(systemctl is-active veritut-keycloak || true)
systemctl stop veritut-keycloak || true
for r in veritut-musteri veritut-ops; do
  # Yönetim arayüzü portu import sırasında da gerekir: varsayılan 9000 MinIO'da.
  sudo -u keycloak env KC_DB=postgres KC_HTTP_MANAGEMENT_PORT=9990 \
    KC_DB_URL="jdbc:postgresql://127.0.0.1:5432/keycloak" \
    KC_DB_USERNAME=keycloak "KC_DB_PASSWORD=$KC_DB_PASSWORD" \
    /opt/keycloak/bin/kc.sh import --file "/etc/veritut/realms/$r.json" --override true
done
[ "$was_active" = active ] && systemctl start veritut-keycloak || systemctl start veritut-keycloak
sleep 8

# İlk personel hesabı: parola geçici, ilk girişte TOTP + parola değişimi zorunlu.
if [ -n "${OPS_ADMIN_EMAIL:-}" ]; then
  TMP_PW=$(openssl rand -base64 18)
  KC=/opt/keycloak/bin/kcadm.sh
  $KC config credentials --server http://127.0.0.1:8080 --realm master \
    --user "${KC_BOOTSTRAP_ADMIN_USERNAME:-admin}" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null
  $KC create users -r veritut-ops -s "username=$OPS_ADMIN_EMAIL" -s "email=$OPS_ADMIN_EMAIL" \
    -s enabled=true -s emailVerified=true -s 'requiredActions=["UPDATE_PASSWORD","CONFIGURE_TOTP"]' >/dev/null || true
  $KC set-password -r veritut-ops --username "$OPS_ADMIN_EMAIL" --new-password "$TMP_PW" --temporary
  $KC add-roles -r veritut-ops --uusername "$OPS_ADMIN_EMAIL" --rolename platform_admin --rolename senior --rolename operator
  echo "personel hesabı açıldı: $OPS_ADMIN_EMAIL"
  echo "geçici parola (bir kez gösterilir): $TMP_PW"
fi
