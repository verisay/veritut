# VERITUT prod — tek makine kurulumu

`2.29.31.37` (`veritut-prod`, Ubuntu 26.04, 2 vCPU / 3 GB / 38 GB, Hetzner).

## Sapma (bilinçli)

Plan §13 altı sunucu öngörür: `vt-app` · `vt-data` · `vt-runner` · `vt-kimlik` · `vt-gozlem` ·
`vt-durum` (**farklı tedarikçi**). Bu kurulum hepsini tek makinede toplar. Uygulama sınırları
korunur, fiziksel ayrım korunmaz:

| Karar | Planda | Burada |
| --- | --- | --- |
| D5 runner izolasyonu | ayrı sunucu, gelen port yok | ayrı UNIX kullanıcısı (`veritut-runner`), DB kimliği yok, gelen port yok |
| D12 özel anahtar | yalnız runner sunucusunda | yalnız `/etc/veritut/runner.env` (0640 root:veritut-runner) — `veritut` okuyamaz |
| D14 status | farklı tedarikçi | ayrı kullanıcı + yalnız `STATUS_REDIS_URL` taşıyan env; **ana yığınla birlikte düşer** |
| 3-2-1 yedek | offsite farklı tedarikçi | MinIO aynı makinede — **yedek koruması yok** |

Bu üç madde `docs/kalan-isler.md` B1 altında açık borç olarak durur.

## Dosyalar

| Dosya | İş |
| --- | --- |
| `bootstrap.sh` | sunucu hazırlığı: takas, paketler (PG16, Redis, nginx, Node 22, Java, tofu, ansible, restic), kullanıcılar, Keycloak, MinIO, depo, env, nginx + self-signed TLS, ufw. İdempotent. |
| `render-env.sh` | `/etc/veritut/secrets.env` (tek kaynak) → servis başına env dosyası. Eksik sırrı üretir, var olanı korumaz-değiştirmez. |
| `deploy.sh` | **iş istasyonundan** koşar: ön kontrol → drain → checkout → install → build → (migration) → sıralı restart → smoke → kırmızıysa geri alma. |
| `smoke.sh` | sunucuda koşar: servisler, yüzeyler, issuer tutarlılığı, D12/D13/D14 sınırları. |
| `kc-import.sh` | prod realm'lerini üretir + içe aktarır; `OPS_ADMIN_EMAIL` verilirse ilk personel hesabını açar (geçici parola + TOTP zorunlu). |
| `render-realms.mjs` | dev realm JSON → prod realm JSON (host, sır, TOTP, `sslRequired=all`, dev kullanıcıları yok). |
| `tls-issue.sh` | DNS yöneldikten sonra Let's Encrypt'e geçiş. |

## Sıra

```bash
# 1. sunucuda, bir kez
DOMAIN=veritut.com bash infra/prod/bootstrap.sh
# 2. iş istasyonunda
RUN_MIGRATION=1 bash infra/prod/deploy.sh
# 3. sunucuda: realm'ler + ilk personel
OPS_ADMIN_EMAIL=... bash infra/prod/kc-import.sh
# 4. DNS geldiğinde, sunucuda
bash infra/prod/tls-issue.sh
```

## Portlar (hepsi 127.0.0.1)

api 4400 · portal 5240 · ops 5241 · status 5242 · keycloak 8080 (yönetim 9990) · postgres 5432 ·
redis 6379 · minio 9000/9001. Dışarı yalnız nginx: 80/443 (+22 ssh).
