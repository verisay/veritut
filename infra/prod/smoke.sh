#!/usr/bin/env bash
# VERITUT prod smoke — sunucuda koşar (deploy.sh çağırır, elle de koşulabilir).
# Yüzeyler + kimlik + D12/D14 sınırları. Çıkış kodu 0 = yeşil.
set -uo pipefail
FAIL=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=1; }
code() { curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$@" 2>/dev/null || echo 000; }
DOMAIN=$(grep -oP '(?<=^PORTAL_URL=https://).*' /etc/veritut/common.env)

echo "· servisler"
for s in veritut-api veritut-worker veritut-runner veritut-portal veritut-ops veritut-status veritut-keycloak veritut-minio nginx postgresql@16-main redis-server; do
  systemctl is-active --quiet "$s" && ok "$s aktif" || bad "$s AKTİF DEĞİL"
done

echo "· iç uçlar"
[ "$(code http://127.0.0.1:4400/api/v1/health)" = 200 ] && ok "api /health" || bad "api /health"
[ "$(code http://127.0.0.1:5240/)" = 200 ] && ok "portal /" || bad "portal /"
[ "$(code http://127.0.0.1:5241/giris)" = 200 ] && ok "ops /giris" || bad "ops /giris"
[ "$(code http://127.0.0.1:5242/)" = 200 ] && ok "status /" || bad "status /"
[ "$(code http://127.0.0.1:8080/realms/veritut-musteri/.well-known/openid-configuration)" = 200 ] \
  && ok "keycloak müşteri realm" || bad "keycloak müşteri realm"
[ "$(code http://127.0.0.1:8080/realms/veritut-ops/.well-known/openid-configuration)" = 200 ] \
  && ok "keycloak ops realm" || bad "keycloak ops realm"

echo "· nginx (TLS, Host başlığıyla)"
for h in "$DOMAIN:/" "ops.$DOMAIN:/giris" "durum.$DOMAIN:/" "kimlik.$DOMAIN:/realms/veritut-musteri" "api.$DOMAIN:/api/v1/health"; do
  host=${h%%:*}; path=${h#*:}
  c=$(code -k --resolve "$host:443:127.0.0.1" "https://$host$path")
  [ "$c" = 200 ] && ok "https://$host$path" || bad "https://$host$path → $c"
done

echo "· issuer tutarlılığı (tuzak #1)"
iss=$(curl -sS --max-time 10 http://127.0.0.1:8080/realms/veritut-musteri/.well-known/openid-configuration | jq -r .issuer 2>/dev/null)
[ "$iss" = "https://kimlik.$DOMAIN/realms/veritut-musteri" ] && ok "issuer $iss" || bad "issuer beklenmedik: $iss"

echo "· D12 — özel anahtar API tarafında YOK"
grep -q RUNNER_PRIVATE_KEY /etc/veritut/common.env /etc/veritut/api.env /etc/veritut/worker.env 2>/dev/null \
  && bad "RUNNER_PRIVATE_KEY api/worker env'inde!" || ok "RUNNER_PRIVATE_KEY yalnız runner.env'de"
sudo -u veritut test -r /etc/veritut/runner.env 2>/dev/null && bad "veritut kullanıcısı runner.env'i okuyabiliyor" || ok "runner.env veritut'a kapalı"

echo "· D14 — status'un DB/Keycloak erişimi yok"
grep -qE 'DATABASE_URL|KC_|INTERNAL_TOKEN' /etc/veritut/status.env && bad "status.env'de yasak değişken" || ok "status.env yalnız Redis"

echo "· D13 — kanıt defteri append-only trigger'ı"
trg=$(sudo -u postgres psql -d veritut -tAc "SELECT tgname FROM pg_trigger WHERE tgrelid='evidence_events'::regclass AND NOT tgisinternal" 2>/dev/null)
[ "$trg" = trg_evidence_immutable ] && ok "trg_evidence_immutable kurulu" || bad "evidence trigger'ı yok: '$trg'"
# Trigger FOR EACH ROW: boş tabloda tetiklenmez. Satır varsa gerçek reddi de ölç.
rows=$(sudo -u postgres psql -d veritut -tAc "SELECT count(*) FROM evidence_events" 2>/dev/null)
if [ "${rows:-0}" != 0 ]; then
  out=$(sudo -u postgres psql -d veritut -tAc "UPDATE evidence_events SET kind=kind" 2>&1 || true)
  case "$out" in *append-only*) ok "evidence UPDATE reddedildi ($rows satır)" ;; *) bad "evidence UPDATE engellenmedi: $out" ;; esac
else
  echo "  · evidence_events boş — trigger davranışı ilk kanıt yazımında ölçülecek"
fi

[ $FAIL = 0 ] && echo "smoke: YEŞİL" || echo "smoke: KIRMIZI"
exit $FAIL
