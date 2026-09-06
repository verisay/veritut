# VERITUT — kalan işler

Son güncelleme: 2026-09-07 · K0–K4 tamamlandı (288 smoke senaryosu yeşil) · prod sunucu ayakta (`2.29.31.37`, tek makine).
Kaynak: `ai-plans/VERITUT-Uygulama-Plani.md` §14 (fazlar) ve §17 (açılış kontrol listesi).
Bu dosya **yaşayan listedir**: bir madde kapanınca buradan silinir, ilgili faz notu `CLAUDE.md` §7'ye yazılır.

---

## 1. Açık borçlar — tamamlanan fazlardan devreden

Önem sırasına göre. "Kritik" olanlar lansmanı bloke eder.

| # | Konu | Durum | Önem | Nereye ait |
| --- | --- | --- | --- | --- |
| B1 | **Prod topolojisi ve deploy** — `infra/prod/` yazıldı, `2.29.31.37` (`veritut-prod`) ayakta: 11 servis aktif, 5 migration + seed uygulandı, smoke yeşil. Kalan: DNS/TLS (D3), `deploy.sh` provası, geri alma provası. | **kısmen kapandı** | **kritik** | plan §13, `infra/prod/README.md` |
| B1a | **Status ana yığınla aynı makinede.** Plan §13 ayrı tedarikçi ister; şu an ana yığın düşerse durum sayfası da düşer. | açık | **kritik** | D14, plan §13 |
| B1b | **Yedekler aynı makinede (MinIO).** 3-2-1'in offsite bacağı yok; VERITUT'un kendi DB'si için yedek/restore tatbikatı da yapılmadı. | açık | **kritik** | plan §13, §17 |
| B1c | **Runner fiziksel olarak ayrı değil.** İzolasyon UNIX kullanıcısı + systemd düzeyinde (`veritut-runner`, DB kimliği yok, gelen port yok); ikinci sunucu gelince taşınacak. | açık | yüksek | D5, kararlar #37 |
| B2 | **Prometheus/Alertmanager tarafı eksik.** `workloads.monitoring_targets` doldurulur ama `file_sd` dosyası üretilmiyor, Prometheus/Alertmanager yapılandırması yok, portal grafik proxy'si (`query_range`) yazılmadı. Alarm ALICI ucu hazır; alarm ÜRETEN taraf yok. | açık | **kritik** | D16, plan §9 |
| B3 | **Runbook kütüphanesi boş.** `infra/runbooks/` dizini var, içi boş. Değişiklik yönetimi çalışıyor ama yazılı prosedür yok. | açık | yüksek | plan §14 K4/6, §5.2 |
| B4 | **E-posta sahte sağlayıcıda.** `MAIL_PROVIDER=mock`; davet, bildirim ve rapor e-postaları yalnız loglanıyor. SMTP/Mailjet adaptörü yazılmadı. | açık | yüksek | D9, K3 borcu |
| B5 | **Teleport CE kurulmadı.** `access.session` ucu ve kanıt akışı hazır, gerçek oturum kaydı yok; bastion `tlog` ingest'i de bağlanmadı. | açık | yüksek | plan §7.5, K4 borcu |
| B6 | **Hetzner apply gerçek token beklemiyor ama hiç koşulmadı.** `managed-vps`, `n8n`, `nextcloud`, `zammad` blueprint'leri yalnız `tofu validate` + `ansible --syntax-check` geçti. Gece entegrasyon işi (`.github/workflows/nightly-hetzner.yml`) `HCLOUD_TOKEN` secret'ı olmadan atlanıyor. | açık | yüksek | K2 borcu |
| B7 | **FOSSBilling ve Zammad canlı credential yok.** Adaptörler yazıldı; dev'de mock, aynı webhook yolunu kullanıyor. Geçiş adaptör değişimi. | açık | orta | D17/D18 |
| B8 | **Prod realm'inde MFA** — `render-realms.mjs` ops realm'inde `CONFIGURE_TOTP` varsayılan zorunlu üretiyor ve prod'a aktarıldı. Kalan: break-glass hesabının denenmesi ve kanıt düşmesi. | **kısmen kapandı** | orta | D6, kararlar #5/#41 |
| B9 | **Sentry ve Umami bağlanmadı.** pino var; hata izleme ve KVKK dostu analitik yok. | açık | orta | D23 |
| B10 | **Loki yok.** Log toplama merkezîleştirilmedi. | açık | düşük | plan §14 K4/10 |
| B11 | **Lighthouse ölçümü yapılmadı.** Public sayfalar `csr=false` yazıldı, performans hedefi (≥95) ölçülmedi. | açık | düşük | D21, K3 kabul |
| B12 | **Keycloak istemci provizyonu bootstrap admin ile.** Uygulama blueprint'leri OIDC istemcisini `KC_ADMIN_*` ile açıyor; prod'da dar yetkili servis hesabı olmalı. | açık | orta | kararlar #21 |
| B13 | **Staging ortamı yok.** Plan Faz 2'de öngörülmüştü. | açık | orta | plan §13 |
| B14 | **Prod'da e-posta, faturalama ve destek sağlayıcıları `mock`.** Kurulum bilinçli olarak mock ile açıldı; canlıya B4/B7 ile geçilir. | açık | yüksek | D9/D17/D18 |
| B15 | **Prod yedekleme otomasyonu yok:** Postgres için pg_dump zamanlaması, MinIO içeriği için offsite kopya, restore prosedürü yazılmadı. | açık | **kritik** | plan §13 |

**Kapanan borçlar** (kayıt için): dini bayram takvimi seed'i (K4'te 41 gün), sapma taraması cron'u (K4), kanıt paketi PDF (K4), `restore_drills` gerçek uygulaması (K4).

---

## 2. K5 — Genişleme ve dogfooding (plan §14 K5, ~8 hafta)

| # | İş | Not |
| --- | --- | --- |
| K5.1 | **Blueprint fabrikası: 10+ uygulama.** Bugün 5 var (mock-vps, managed-vps, n8n, nextcloud, zammad). Eklenecek: Metabase, Grafana, Vaultwarden, Plane, Matomo, Chatwoot, Directus, Keycloak, Uptime Kuma, Mattermost (+ Odoo/ERPNext `L`). Her biri: SSO, yedek politikası, `checks/`, müşteri notu. | Ortak `docker-host` rolü hazır; iş rol yazmaktan ibaret |
| K5.2 | **Yönetilen PostgreSQL** ürünü: tek VM + PITR (wal-g), `M+` boyutta replika | yeni blueprint + ürün |
| K5.3 | **S3 nesne depolama** ürünü: MinIO/Garage tek kiracılı VM veya tedarikçi S3 yeniden satışı | |
| K5.4 | **VPN ürünü**: WireGuard/Headscale | BTK yetkilendirme sorusu önce netleşmeli (bkz. §4) |
| K5.5 | **AWS ve GCP driver'ları** (`IProviderDriver`): envanter + maliyet + yetenek. Ortaklık onayından sonra | bugün yalnız `hetzner` ve `mock` |
| K5.6 | **TR ikametgâhı için ilk TR-DC driver'ı** (Proxmox API üzerinden bare-metal) | TR kolokasyon anlaşması ön koşul |
| K5.7 | **Maliyet ingest: AWS CUR + GCP Billing Export**; çok tedarikçili marj | `provider-sync` iskeleti hazır |
| K5.8 | **FinOps v1**: müşteri hesabına salt-okuma bağlantısı, kural motoru (boşta kaynak, eski nesil tip, yedeksiz volume, ayrılmamış IP, rezervasyon fırsatı), tasarruf ölçümü, kazanç paylaşımı satırı | `finops` özellik bayrağı planlarda tanımlı |
| K5.9 | **Dogfooding**: `vt-app/data/runner/gozlem` ve Safran Labs ürünleri (MesajSepeti, LiftOrbis, Klasman, Kayda Değer) `internal` kiracı altında iş yükü olarak; kendi kanıt zincirimiz `/guvence`'de | B1 (prod) ön koşul |
| K5.10 | **Bölge başına gözlem yığını** (ikametgâh içi metrik/log) | B2 ön koşul |

**K5 kabul ölçütü:** 12+ ürün self-servis · 3 tedarikçide iş yükü + ikametgâh politikası e2e · FinOps bir gerçek müşteride ölçülmüş tasarruf · VERITUT kendi kanıt zinciri yayında · yoğunlaşma uyarısı (%60) gerçek veriyle çalışıyor.

---

## 3. K6 — Derinleşme (plan §14 K6, 12–24 ay)

Bayi ve beyaz etiket (hiyerarşik kiracı, bayi fiyat listesi, marka override) · Kubernetes platformu blueprint'i (k3s/RKE2 + ArgoCD) · TR kolokasyon ve kendi ASN sürecinin envanter tarafı · **AI altyapı blueprint'leri** (LiteLLM ağ geçidi, Qdrant/pgvector, MCP sunucu barındırma, GPU kiralama aracılığı) · **VERITUT MCP sunucusu** (kiracının AI ajanı iş yükü/kanıt/olay verisini salt-okuma sorgular) · Entranet faturalama adaptörü · OpenTofu provider'ı (`veritut_workload`) · `IDomainRegistrar` + `.tr` · EN portal · özel status alan adı · (opsiyonel) agent.

---

## 4. Kod dışı — kullanıcıya düşen

| # | İş | Neden bloke ediyor |
| --- | --- | --- |
| D1 | **Hukuk onayı**: hizmet şartları, SLA eki, DPA, KVKK aydınlatma metni | Sayfalar ve PDF'ler "TASLAK" damgalı; lansmanda imzalı metin gerekir |
| D2 | **BTK hukuki görüşü**: barındırma/alan adı bayiliği serbest; VPN ve IP tahsisi yetkilendirme sınırına yaklaşıyor | K5.4 (VPN ürünü) bu görüşe bağlı |
| D3 | **Domain**: `veritut.com` (+ `.com.tr`), DNS, wildcard sertifika, Cloudflare | B1 ile birlikte |
| D4 | **Prod sunucular**: app, data, runner, kimlik, gözlem + **status için farklı tedarikçi** | B1 ön koşulu |
| D5 | **Hetzner ikinci hesap** (yoğunlaşma politikası ≥2 hesap ister) + **AWS Partner Network** ve **Google Cloud Partner Advantage** başvuruları | K5.5 onay süreleri uzun, erken açılmalı |
| D6 | **FOSSBilling kurulumu + PayTR canlı** ve **Zammad kurulumu** | B7 |
| D7 | **Mevcut Verisay hizmetlerinin CSV envanteri**: hangi müşteri, hangi tedarikçide, hangi maliyetle, hangi fiyata | K1 içe aktarım ekranı hazır, veri bekliyor. Gerçek brüt marj bu veriyle çıkar |
| D8 | **Marka ve token onayı**: Claude Design çıktısı `packages/ui/tokens.css`'e alındı; logo/renk son onayı | kozmetik, bloke etmez |
| D9 | **Pilot kurumlar**: 3 sözlü taahhüt, 1'i ilk 30 günde gerçek iş yükü açıyor | plan §17 |
| D10 | **Bölüm 10 kararları** (stratejik plan): konumlanma, faturalama omurgası, ilk segment, Safran Labs içindeki yer — v1.1 için yazıya dökülmeli | mimari değişmez, pazarlama sırası değişir |

---

## 5. Lansman öncesi kontrol listesi (plan §17 durumu)

| Madde | Durum |
| --- | --- |
| Domain + DNS + wildcard sertifika | ✗ D3 — sunucu hazır, `infra/prod/tls-issue.sh` DNS'i bekliyor (şimdilik self-signed) |
| `deploy.sh` 3 kez sorunsuz + rollback provası | ~ `deploy.sh` yazıldı; ilk kurulum elle koşuldu, 3'lü prova ve geri alma provası yapılmadı |
| Status sayfası farklı tedarikçide, ana yığın kapalıyken ayakta | ✗ B1a — prod'da aynı makinede çalışıyor |
| VERITUT'un kendi DB'si için offsite yedek + restore tatbikatı | ✗ B1b + B15 |
| Kiracı izolasyon e2e + fail-closed testleri CI'da zorunlu | ~ testler var (288 senaryo), CI'da yalnız birim + tip + tofu validate koşuyor; smoke paketleri CI'ya bağlanmadı |
| Runner sunucusu: gelen port yok, anahtar 600, rotasyon runbook'u denendi | ~ gelen port yok ve anahtar yalnız `runner.env`'de (smoke ölçüyor); ayrı sunucu ve rotasyon runbook'u ✗ B1c + B3 |
| Keycloak ops realm MFA zorunlu + break-glass testi | ~ MFA zorunlu (prod realm'de); break-glass hesabı ve testi ✗ |
| FOSSBilling canlı + PayTR callback testi + deneme→askı→yıkım | ~ akış kodda testli (mock), canlı ✗ D6 |
| Hukuk metinleri onaylı | ✗ D1 |
| Hetzner ≥2 hesap, AWS/GCP başvuruları açık | ✗ D5 |
| Sentry + Umami + Alertmanager → nöbetçi telefonu | ✗ B2, B9 |
| Search Console + sitemap; 15 ürün landing + 10 karşılaştırma sayfası | ~ sitemap ve landing'ler üretiliyor (4 ürün, 4 karşılaştırma); içerik ve gönderim ✗ |
| Pilot: 3 kurum taahhüt | ✗ D9 |

---

## 6. Önerilen sıra

1. **D3 + B2** (alan adı/TLS ve gözlem yığını) — prod makine ayakta; eksik olan alan adı ve alarm üreten taraf. Ardından **B15/B1b** (yedek + restore tatbikatı) ve **B1a** (status'u ayrı tedarikçiye).
2. **D7** (mevcut hizmet envanteri) — gerçek brüt marj sayısı stratejik planın en kritik doğrulaması.
3. **B3, B4, B5** (runbook, e-posta, Teleport) — "yönetilen" sözünün operasyonel karşılığı.
4. **D1, D5** (hukuk, ortaklık başvuruları) — süreleri uzun, paralel yürütülmeli.
5. **K5.1** (blueprint fabrikası) — katalog derinliği satışın önünü açar.
