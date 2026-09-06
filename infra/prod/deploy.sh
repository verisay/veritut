#!/usr/bin/env bash
# VERITUT prod deploy — pull-based (plan §13). İş istasyonundan koşar, sunucuda git checkout eder.
#   bash infra/prod/deploy.sh                  # HEAD sha'sını deploy eder
#   RUN_MIGRATION=1 bash infra/prod/deploy.sh  # migration'ları da uygular
#   SHA=<sha> bash infra/prod/deploy.sh        # belirli bir sürüme (geri alma dâhil)
#
# Ön kontrol → checkout → install → build → (migration) → sıralı restart → smoke.
# Smoke kırmızıysa önceki sha'ya döner ve servisleri geri alır.
set -euo pipefail

TARGET=${TARGET:-root@2.29.31.37}
EXPECT_HOSTNAME=${EXPECT_HOSTNAME:-veritut-prod}
APP_DIR=/srv/veritut/app
BRANCH=${BRANCH:-main}
RUN_MIGRATION=${RUN_MIGRATION:-0}
DRAIN_TIMEOUT=${DRAIN_TIMEOUT:-180}
SERVICES="veritut-api veritut-worker veritut-runner veritut-portal veritut-ops veritut-status"

log()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
rssh() { ssh -o BatchMode=yes "$TARGET" "$@"; }

# --- 1. yerel ön kontrol ---
log "ön kontrol"
BR=$(git rev-parse --abbrev-ref HEAD)
[ "$BR" = "$BRANCH" ] || fail "dal $BR — deploy yalnız $BRANCH'ten"
# -uno: izlenmeyen dosyalar (yerel .claude/, notlar) deploy edilmez, kirlilik sayılmaz.
[ -z "$(git status --porcelain -uno)" ] || fail "çalışma ağacı kirli — commit'lenmemiş değişiklik deploy edilmez"
git fetch -q origin "$BRANCH"
SHA=${SHA:-$(git rev-parse HEAD)}
git merge-base --is-ancestor "$SHA" "origin/$BRANCH" || fail "$SHA origin/$BRANCH'te yok — önce push"
echo "sha: $SHA"

# --- 2. hedef doğrulaması (yanlış sunucuya deploy etmemek için) ---
HOST=$(rssh hostname)
[ "$HOST" = "$EXPECT_HOSTNAME" ] || fail "hedef hostname '$HOST', beklenen '$EXPECT_HOSTNAME'"
PREV=$(rssh "cat /etc/veritut/DEPLOYED_SHA 2>/dev/null || git -C $APP_DIR rev-parse HEAD")
echo "hedef: $HOST · önceki sürüm: ${PREV:0:12}"

# --- 3. runner drain: aktif run varken runner'ı kesme ---
log "runner kuyruğu drain"
rssh "bash -s" <<EOF
set -euo pipefail
. /etc/veritut/secrets.env
deadline=\$(( \$(date +%s) + $DRAIN_TIMEOUT ))
while :; do
  active=\$(redis-cli --no-auth-warning -a "\$REDIS_PASSWORD" LLEN bull:provision:active 2>/dev/null || echo 0)
  [ "\${active:-0}" = "0" ] && break
  [ \$(date +%s) -ge \$deadline ] && { echo "uyarı: \$active aktif run var, yine de devam ediliyor"; break; }
  echo "aktif run: \$active — bekleniyor"; sleep 5
done
systemctl stop veritut-runner || true
EOF

# --- 4. checkout + install + build ---
log "checkout + derleme"
rssh "bash -s" <<EOF
set -euo pipefail
sudo -u veritut git -C $APP_DIR fetch --all --prune -q
sudo -u veritut git -C $APP_DIR checkout -q --detach $SHA
sudo -u veritut env HOME=/var/lib/veritut sh -c 'cd $APP_DIR && pnpm install --frozen-lockfile --silent'
# 3 GB RAM: paralel derleme tsc'yi OOM'a sokuyor (tuzak #21) — tek iş, sınırlı heap.
sudo -u veritut env HOME=/var/lib/veritut NODE_OPTIONS=--max-old-space-size=1536 \
  sh -c 'cd $APP_DIR && pnpm turbo run build --concurrency=1'
EOF

# --- 5. migration (açık onay ister) ---
if [ "$RUN_MIGRATION" = "1" ]; then
  log "migration"
  rssh "sudo -u veritut env HOME=/var/lib/veritut \$(grep '^DATABASE_URL=' /etc/veritut/common.env | xargs) sh -c 'cd $APP_DIR && pnpm db:migrate'"
else
  echo "(migration atlandı — gerekiyorsa RUN_MIGRATION=1)"
fi

# --- 6. sıralı restart ---
log "servisler"
rssh "systemctl restart veritut-api && sleep 3 && systemctl restart veritut-worker veritut-runner veritut-portal veritut-ops veritut-status && sleep 5 && systemctl is-active $SERVICES | tr '\n' ' '"

# --- 7. smoke ---
log "smoke"
if rssh "bash -s" < "$(dirname "$0")/smoke.sh"; then
  rssh "echo $SHA > /etc/veritut/DEPLOYED_SHA"
  log "deploy tamam: ${SHA:0:12}"
else
  printf '\033[31m✗ smoke kırmızı — %s sürümüne geri alınıyor\033[0m\n' "${PREV:0:12}" >&2
  rssh "bash -s" <<EOF
set -euo pipefail
sudo -u veritut git -C $APP_DIR checkout -q --detach $PREV
sudo -u veritut env HOME=/var/lib/veritut sh -c 'cd $APP_DIR && pnpm install --frozen-lockfile --silent'
sudo -u veritut env HOME=/var/lib/veritut NODE_OPTIONS=--max-old-space-size=1536 \
  sh -c 'cd $APP_DIR && pnpm turbo run build --concurrency=1'
systemctl restart $SERVICES
EOF
  fail "deploy geri alındı — migration uygulandıysa şema ileri sürümde kalmıştır, elle kontrol edin"
fi
