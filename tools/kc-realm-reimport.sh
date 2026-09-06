#!/usr/bin/env bash
# Keycloak realm JSON'u değişince dev'de yeniden uygular. `start-dev --import-realm` VAR OLAN realm'i ATLAR
# (IGNORE_EXISTING) — bu yüzden realm silinip yeniden import edilir. YALNIZ DEV: realm'deki kullanıcı/oturumlar gider.
#   bash tools/kc-realm-reimport.sh veritut-musteri
set -euo pipefail
REALM=${1:?realm adı}
cd "$(dirname "$0")/.."
KC="docker compose -f infra/compose.dev.yml exec -T keycloak"
$KC sh -c '/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD"' >/dev/null
$KC /opt/keycloak/bin/kcadm.sh delete realms/"$REALM" && echo "realm silindi: $REALM"
docker compose -f infra/compose.dev.yml restart keycloak >/dev/null
echo "keycloak yeniden başlatıldı — import logunu bekleyin: docker compose -f infra/compose.dev.yml logs -f keycloak | grep -i import"
