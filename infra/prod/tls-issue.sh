#!/usr/bin/env bash
# DNS veritut.com → sunucuya yöneldikten SONRA gerçek sertifika alır ve nginx'i ona çevirir.
#   bash infra/prod/tls-issue.sh
# Öncesinde bootstrap'ın ürettiği self-signed sertifika kullanılır (tarayıcı uyarı verir).
set -euo pipefail
DOMAIN=${DOMAIN:-veritut.com}
EMAIL=${LE_EMAIL:-m.filiz@verisay.com}
NAMES=(-d "$DOMAIN" -d "www.$DOMAIN" -d "ops.$DOMAIN" -d "durum.$DOMAIN" -d "kimlik.$DOMAIN" -d "api.$DOMAIN" -d "s3.$DOMAIN")

for n in "$DOMAIN" ops."$DOMAIN" durum."$DOMAIN" kimlik."$DOMAIN" api."$DOMAIN" s3."$DOMAIN"; do
  ip=$(dig +short "$n" A | tail -1)
  [ -n "$ip" ] || { echo "✗ $n için A kaydı yok — DNS'i bekleyin"; exit 1; }
  echo "  $n → $ip"
done

certbot certonly --webroot -w /var/www/acme "${NAMES[@]}" \
  --email "$EMAIL" --agree-tos --no-eff-email --non-interactive

cat > /etc/nginx/snippets/veritut-tls.conf <<EOF
ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_session_cache shared:VERITUT:10m;
ssl_session_timeout 1d;
ssl_session_tickets off;
EOF
nginx -t && systemctl reload nginx
systemctl enable --now certbot.timer
echo "TLS tamam: Let's Encrypt sertifikası aktif, yenileme certbot.timer'da"
