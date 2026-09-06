# VERITUT — Uygulama Planı v1.0 (yazılım platformu: kontrol düzlemi + portal + operasyon)

**Kaynak strateji:** `ai-plans/VERITUT-Stratejik-Plan.md` (Taslak v1.0, Eylül 2026). Bu doküman o planın
**yazılım karşılığıdır**: ne kurulacak, hangi yığınla, hangi sırayla, hangi kabul ölçütüyle.
**Referans yığın:** Klasman (`/srv/fleet/projects/klasman`) ve Kayda Değer (`/srv/fleet/projects/kaydadeger`)
— filo kalıbı birebir alınır; farklılaşan her nokta Ek A'da gerekçelidir.
**Hedef depo:** `/srv/fleet/projects/veritut` (bağımsız git deposu, filo Docker dev deseni).
Durum: Taslak v1.0 — stratejik planın Bölüm 10 kararları verilince v1.1'e çekilir (bkz. §0.2).

---

# 0. Kapsam, varsayımlar ve okuma anahtarı

## 0.1 Bu plan neyi kurar

Stratejik plan §5'teki üç katmanın **ortadaki ikisini** yazar:

```
  Müşteri Portalı · Operasyon Paneli · Durum Sayfası      ← bu plan (SvelteKit ×3)
                        │
              VERITUT Core (kontrol düzlemi)               ← bu plan (Express 5 API + worker + runner)
                        │
     OpenTofu + Ansible + Restic  →  Hetzner / AWS / GCP / TR-DC / Cloudflare   ← blueprint'ler (repo'da IaC)
```

**Satın alınan, yazılmayan:** Keycloak (kimlik), Prometheus + Alertmanager + Grafana (gözlem), Zammad (ticket),
FOSSBilling → Entranet (fatura/tahsilat), Teleport CE (bastion + oturum kaydı), Restic (yedek), OpenTofu + Ansible (IaC).
Core bu araçları **adaptör** arkasından yönetir; hiçbirinin UI'ı müşteriye tek muhatap olarak sunulmaz — müşteri her şeyi
VERITUT portalından görür ("tek fatura, tek muhatap, tek sorumlu"nun yazılımdaki karşılığı).

## 0.2 Stratejik plan Bölüm 10'a bağlılık (varsayımlar)

| Karar | Bu planın varsayımı | Karar değişirse etkisi |
|---|---|---|
| 1. Konumlanma | **Yönetilen bulut operatörü / veri emanetçisi.** Ürün dili "veri merkezi" demez; "iş yükü", "emanet", "kanıt" der | Yalnız metin/pazarlama; mimari değişmez |
| 2. Faturalama omurgası | **FOSSBilling ile başla, Entranet'e paralel geç.** Core para toplamaz; `IBillingProvider` adaptörü (D17) | Adaptör değişir, Core değişmez |
| 3. İlk segment | **Yazılım ajansları / geliştiriciler** self-servis dalgası (PLG) + orta ölçekli kurumsal için kanıt katmanı | Segment kararı **pazarlama sırasını** değiştirir, mimariyi değil: PLG (K3) ile güvence katmanı (K4) ikisi de yol haritasında |
| 4. Safran Labs içindeki yer | **İkisi birden:** bağımsız marka + portföyün altyapı omurgası → MesajSepeti/LiftOrbis/Klasman/KD **iç kiracı** olur (K5 dogfooding) | Yalnız kiracı seed'i değişir |

## 0.3 Ürünün üç fiili — mimarinin omurgası

Stratejik planın "sorumluluğun devri" cümlesi yazılımda üç fiile iner. Her modül bu üçünden birine hizmet eder; etmiyorsa kapsam dışıdır.

| Fiil | Anlamı | Core modülü |
|---|---|---|
| **KUR** | Sipariş → otomatik provizyon; elle kurulan müşteri ortamı yok | katalog · blueprint · runner · iş yükü kayıt defteri |
| **TUT** | Yama, yedek, izleme, olay müdahalesi, değişiklik yönetimi | yedek politikası · gözlem entegrasyonu · olay/SLA · değişiklik + runbook |
| **KANITLA** | "Yedekliyoruz" değil "geri döndüğünü kanıtladık"; denetimde belge | **Kanıt Defteri** (hash zincirli) · SLA raporu · uyumluluk paketi · alt işleyen listesi |

Rakiplerin hiçbirinde üçüncü fiil yok. Bu planda **Kanıt Defteri gün-1 tablosudur** (K1'de gelir), süs değil.

---

# 1. Aktörler ve Uygulamalar

## 1.1 Monorepo yerleşimi

| Yol | İçerik | Dev port |
|---|---|---|
| `apps/api` | Express 5 + Drizzle + ws — tüm REST (`/api/v1`), OIDC oturum, iç uçlar (`/internal`), webhook alıcıları, WS canlı log/durum | 4400 |
| `apps/worker` | BullMQ tüketicisi — bildirim, HTTP/TCP probe, PDF rapor, KPI rollup, kanıt çapası. **Tedarikçi kimlik bilgisi taşımaz** | — |
| `apps/runner` | **İzole yürütücü** — OpenTofu/Ansible/Restic çalıştıran tek süreç; tedarikçi kimlik bilgilerini açan **tek** yer (D5, D12). Ayrı imaj, gelen port yok | — |
| `apps/portal` | SvelteKit — `veritut.com`: `(public)` pazarlama + ürün landing'leri (csr=false) · `(panel)` müşteri portalı `/panel/*` | 5240 |
| `apps/ops` | SvelteKit — `ops.veritut.com`: operasyon/NOC paneli (yalnız personel realm'i, MFA zorunlu) | 5241 |
| `apps/status` | SvelteKit — `durum.veritut.com` + `durum.veritut.com/<kiracı>`: **stateless**, yalnız Redis snapshot okur, DB kimlik bilgisi yok (D14) | 5242 |
| `packages/ui` | `tokens.css` + `components.css` + Svelte bileşenleri — tasarım sisteminin TEK kaynağı | |
| `packages/types` | Roller, **durum makineleri** (`machines/`), **politika motoru** (`policy/` — ikametgâh, 3-2-1, SLA saat), DTO'lar (saf TS) | |
| `packages/validators` | Zod şemaları (API sınırı + blueprint `inputs` derleyicisi — api + frontend ORTAK) | |
| `packages/shared` | `createApiFetch`, rune store'lar (`*.svelte.ts`), WS istemcisi, Türkçe biçimleyiciler (para, süre, tarih) | |
| `infra/blueprints/<slug>/<semver>/` | **IaC ürün tanımları** — `blueprint.yaml` + `tofu/` + `ansible/` + `checks/` + `docs/` (bkz. §3.4). Repo'da sürümlü; DB yalnız referans tutar | |
| `infra/runbooks/*.md` | Çalışma kitapları — her tekrarlayan olay için yazılı prosedür; ops panelinde okunur, otomatik olanlar "yürüt" butonuyla runner'a gider | |
| `infra/compose.dev.yml` · `infra/Dockerfile` · `infra/Dockerfile.runner` · `infra/prod/` | Filo dev stack + prod systemd birimleri + nginx + deploy | |
| `docs/api-sozlesme.md` · `docs/kararlar.md` · `docs/blueprint-yazim.md` | Bağlayıcı uç sözleşmesi · mikro karar kaydı · blueprint yazım kılavuzu | |

Portal ve pazarlama **aynı uygulama, aynı host** (route grubu, SvelteKit base path DEĞİL — KD `docs/prod.md` tuzağı).
Durum sayfası ayrı uygulama + **ayrı tedarikçide** sunucu (§13): ana yığın düştüğünde durum sayfası ayakta kalmalı.

## 1.2 Domain haritası

| Host | Uygulama | Not |
|---|---|---|
| `veritut.com` | portal `(public)` + `/panel` | Pazarlama + müşteri portalı; same-origin `/api/v1` |
| `ops.veritut.com` | ops | Personel; IP allow-list + MFA (Keycloak ops realm) |
| `durum.veritut.com` | status | Ayrı tedarikçi VM; Redis replika/snapshot çekimi |
| `kimlik.veritut.com` | Keycloak | 2 realm: `veritut-musteri`, `veritut-ops` |
| `api.veritut.com` | api | Public API (API anahtarı) — portal same-origin yolunun dış yüzü |
| `<kiracı>.uygulama.veritut.com` | Katman 3 uygulamaları (n8n, Nextcloud…) | Cloudflare wildcard; K2'de gelir |

Dev host'ları: `vt-portal` · `vt-ops` · `vt-status` · `vt-api` · `vt-kimlik` · `vt-s3` · `vt-grafana` `.dev-fethi.entra.net`
(sertifika SAN genişletme: `bash /srv/fleet/infra/dev-fethi-fleet-cert-add.sh vt-portal vt-ops vt-status vt-api vt-kimlik vt-s3 vt-grafana`).

## 1.3 Aktör modeli

| Aktör | Realm | Rol | Görür |
|---|---|---|---|
| Kiracı sahibi (`owner`) | müşteri | Tüm kiracı; faturalama; kullanıcı yönetimi | Portal |
| Kiracı yöneticisi (`admin`) | müşteri | İş yükü sipariş/yönet, kanıt, ticket | Portal |
| Teknik (`technical`) | müşteri | İş yükü görünürlük + erişim bilgisi + alarm kanalı; sipariş yok | Portal |
| Mali (`billing`) | müşteri | Fatura, kullanım, plan | Portal (mali sekme) |
| Salt okuma (`viewer`) | müşteri | Sağlık kartı + kanıt; denetçi için | Portal |
| Denetçi bağlantısı (`auditor_link`) | — | Süreli, imzalı link — tek kiracının kanıt paketine | Portal salt-okuma görünümü |
| Operatör (`operator`) | ops | Nöbet, olay, runbook yürütme | Ops |
| Kıdemli operatör (`senior`) | ops | Yüksek riskli değişiklik onayı, tedarikçi hesabı | Ops |
| Platform yöneticisi (`platform_admin`) | ops | Katalog, fiyat, kiracı yönetimi, KPI | Ops |
| Bayi (`reseller`) — Faz 4 | müşteri | Alt kiracıları yönetir (hiyerarşik kiracı, D7) | Portal bayi görünümü |

Roller `packages/types/src/roles.ts`'te; iki realm'in kullanıcıları **hiçbir tabloda karışmaz** (KD D22 deseni): `users` (müşteri) ↔ `staff` (ops),
`vt_portal` ↔ `vt_ops` çerezi, `/api/v1/*` ↔ `/api/v1/ops/*` uç öneki. `requireUser` ile `requireStaff` birbirinin yerine kullanılmaz.

## 1.4 Ekran envanteri (özet)

**Portal `(public)`:** ana sayfa · `/urunler` (katalogdan) · `/urunler/[slug]` programatik landing (her Katman 3 uygulaması + yönetilen sunucu/DB/depolama) · `/fiyatlandirma` · `/sla` · `/guvence` (Kanıt Defteri anlatımı + kamuya açık aylık çapa hash'leri) · `/kvkk`, `/sozlesmeler` · `/durum` (yönlendirme).
**Portal `(panel)`:** giriş (OIDC) · **İş yükleri** (sağlık kartı ızgarası) · iş yükü detayı (durum, uç noktalar, erişim, yedekler + son doğrulanmış geri dönüş, yama seviyesi, 30g uptime, maliyet, olaylar, değişiklik geçmişi, kanıt sekmesi) · **Sipariş** (katalog → blueprint girdi formu → ikametgâh → plan/SLA → onay) · **Kanıt Defteri** (filtre, doğrulama, paket indir) · **Olaylar & bakım** · **Ticket** (Zammad aynası) · **Faturalar & kullanım** · **Belgeler** (SLA, DPA, alt işleyen listesi — otomatik) · **Ekip & roller** · **API anahtarları** · **Alarm kanalları** (e-posta/SMS/webhook/Slack).
**Ops:** nöbet panosu (açık olaylar, SLA saatleri, alarm akışı) · kiracı 360 · iş yükü envanteri (tedarikçi/hesap/bölge/ikametgâh filtreli) · **Çalıştırmalar** (canlı log, plan diff, onay) · değişiklik kuyruğu · runbook kütüphanesi · tedarikçi hesapları (sağlık, kota, çıkış planı linki) · yedek/geri dönüş tatbikat takvimi · katalog & fiyat · maliyet & marj · KPI panosu · denetim kaydı.
**Status:** platform sayfası (bileşenler, 90 gün çubuk, aktif olay/bakım) · kiracı sayfası (yalnız kendi iş yükleri, `noindex`) · RSS/JSON feed · aylık kanıt çapası.

---

# 2. Donmuş Teknik Kararlar (D1–D26 — pazarlık edilemez)

| # | Karar | Gerekçe |
|---|---|---|
| D1 | **pnpm 10 + Turborepo monorepo:** 6 app (`api`, `worker`, `runner`, `portal`, `ops`, `status`) + 4 paket (`ui`, `types`, `validators`, `shared`) + `infra/blueprints` (IaC, npm paketi değil) | Filo kalıbı (Klasman D1 / KD D1). Runner ayrı app: kimlik bilgisi izolasyonu (D5) |
| D2 | **Node ≥ 22, TS 5.7 strict, ESM, `any` yasak** (`unknown` + narrow, eslint error) | Klasman standardı |
| D3 | **PostgreSQL 16 + yalnız Drizzle.** Servislerde raw `pg.Pool` yasak; ham SQL `db.execute(sql\`…\`)`. İstisna `db/migrate.ts`. Migration `NNNN_ad.sql`, 4 hane, idempotent, down yok | MK hibrit dersi (TKD-002) |
| D4 | **Redis 7 + BullMQ; worker ve runner ayrı süreç.** Kuyruklar: `provision`, `provider-sync`, `drill` (runner) · `probe`, `notify`, `report`, `rollup` (worker). BullMQ bağlantısı `maxRetriesPerRequest: null` | Klasman deseni; uzun süren IaC işleri API sürecinde koşamaz |
| D5 | **Tedarikçiye dokunan her şey runner'da.** API ve worker tedarikçi API'sine hiç çağrı yapmaz (maliyet ingest'i dahil). Runner'ın gelen portu yok; Redis + `INTERNAL_TOKEN`'lı `/internal/*` ile konuşur, DB kimlik bilgisi yok | Patlama yarıçapı: API ele geçirilse tedarikçi hesapları erişilemez kalır |
| D6 | **Kimlik: Keycloak, gün 1.** İki realm (`veritut-musteri`, `veritut-ops`). API OIDC istemcisi (`openid-client`, PKCE); tarayıcıya Keycloak token'ı **verilmez** — API opak oturum çerezi (`sessions` tablosu, sha256) keser, Keycloak refresh token'ı sunucuda şifreli tutar. Parola VERITUT'ta saklanmaz. Ops realm MFA zorunlu. **Break-glass:** tek yerel ops hesabı (`staff.local_totp`, `ops` realm düşükse), her kullanımı kanıt olayı | Stratejik plan §5.1 "SSO ilk günden"; aynı Keycloak kiracıların Katman 3 uygulamalarına (Nextcloud/Zammad/Grafana) realm-başına SSO verir → satılan ürün + iç altyapı aynı şey |
| D7 | **Tenancy: shared schema + `tenant_id` + TEK `resolveTenant` middleware.** `X-Tenant-Id` UUID regex → üyelik → `req.ctx`. Haritalanmamış segment → 403 + startup uyarısı (fail-closed). Kapsam dışı kaynak **404** (403 değil — varlık sızmaz, KD tuzağı 13). `tenants.parent_tenant_id` **gün 1'de nullable kolon** (Faz 4 bayi hiyerarşisi migration acısı yaşanmaz) | Klasman §7 + KD deseni |
| D8 | **Durum geçişleri yalnız makineden** (`packages/types/src/machines/`): workload, order, run, incident, change, backup_job, restore_drill, subscription. Elle `status` yazmak yasak; her geçiş `audit_log` + gerekli ise `evidence_events` | Klasman/KD gün-1 kuralı |
| D9 | **Dış bağımlılıklar factory arkasında:** `IProviderDriver` (hetzner · aws · gcp · cloudflare · trdc · mock), `IBillingProvider` (fossbilling · entranet · mock), `ITicketProvider` (zammad · mock), `IMailProvider`, `ISmsProvider`, `IStorageService` (S3), `IAlertSink` (webhook/Slack/Teams), `IDomainRegistrar` (Faz 4) | Stratejik plan §6 "hiçbir hizmet tek tedarikçiye bağlı olmasın"; sağlayıcı değişimi tek dosya |
| D10 | **IaC: OpenTofu (Terraform değil) + Ansible.** Blueprint = `infra/blueprints/<slug>/<semver>/` (§3.4); DB yalnız `slug@version` referansı tutar. Elle kurulan müşteri ortamı **yok**; ops paneli bile her mutasyonu bir `run` olarak açar | Stratejik plan §5.1 "her şey kod olarak". Terraform BSL lisansı yönetilen servis sağlayıcı için gri alan; OpenTofu MPL + yerleşik state şifreleme |
| D11 | **OpenTofu state: `pg` backend, ayrı veritabanı `veritut_tfstate`, ayrı rol, yalnız runner erişir; OpenTofu istemci-tarafı state şifreleme açık** (state gizli değer taşır) | Kilitleme bedava, S3 backend'e tedarikçi bağımlılığı yok |
| D12 | **Sırlar asimetrik zarfla:** API kiracı/tedarikçi kimlik bilgisini runner'ın X25519 açık anahtarıyla mühürler (`crypto` stdlib: X25519 + HKDF + AES-256-GCM); **API kendi yazdığını açamaz**, yalnız runner açar. Anahtar rotasyonu `key_version` kolonu. Faz 3 seçeneği: OpenBao | "Şifreli saklıyoruz" değil "API'nin çözmesi matematiksel olarak mümkün değil" |
| D13 | **Kanıt Defteri append-only + hash zinciri.** `evidence_events` kiracı-bazlı `seq` + `prev_hash` + `hash`; `UPDATE/DELETE` **DB trigger ile reddedilir**; aylık `evidence_anchors` kamuya yayımlanır (`/guvence`, status, e-posta). Doğrulama ucu public | Ürünün tek varlığı güvendir; kurcalanabilir kanıt kanıt değildir |
| D14 | **Status app stateless:** yalnız Redis snapshot (`status:<tenant>` JSON, worker 30 sn'de yazar) okur; DB/Keycloak bağımlılığı yok; prod'da **ana yığından farklı tedarikçide** | Ana yığın düştüğünde durum sayfası konuşmalı — aksi hâlde marka hasarı iki kat |
| D15 | **Yedek: Restic, 3-2-1, offsite kopya farklı tedarikçide, ikametgâh kuralına tabi** (TR verisi ABD kovasına gidemez — `policy/residency.ts`); **aylık geri dönüş tatbikatı otomatik** (runner `drill` kuyruğu: geçici ortama restore → checksum + uygulama sağlık kontrolü → kanıt olayı) | Stratejik plan §5.2 "en güçlü satış kanıtı" |
| D16 | **Gözlem: Prometheus + Alertmanager + Grafana satın alınır**; hedefler Core'dan üretilir (`file_sd` JSON'u worker yazar), alarmlar Alertmanager → API webhook → olay. **Uptime Kuma iç bağımlılık DEĞİL** (worker'da 200 satırlık probe); portal grafikleri Prometheus `query_range` proxy'si ile, `tenant` etiketi **sunucu tarafında zorla enjekte** (prom-label-proxy deseni) | Ek A sapma 1. Grafana embed kimlik karmaşası yerine Core kendi çizer; Grafana ops içi kalır |
| D17 | **Core para toplamaz.** Core = katalog + ölçümleme (`usage_records`) + entitlement; fatura kesme/tahsilat/PayTR yalnız faturalama omurgasında (`IBillingProvider`: FOSSBilling → Entranet). Portal faturayı aynadan gösterir, ödeme derin link | Stratejik plan §5.1 madde 1 + §10 karar 2; iki yerde para = mutabakat cehennemi |
| D18 | **Ticket = Zammad (dogfood), adaptörle.** Müşteri portalı Zammad REST'ten liste/oluştur/yanıtla; ops Zammad'ı doğrudan kullanır; destek dakikası KPI'ı Zammad time-accounting'den | Katalogda satılan ürünü kendin kullan; ticket sistemi yazmak kapsam dışı |
| D19 | **Public API gün 1 sözleşmeli:** `docs/api-sozlesme.md` bağlayıcı; OpenAPI Zod'dan üretilir; kiracı API anahtarları (`api_keys`: sha256 hash, kapsam listesi, IP allow-list, son kullanım) | PLG (stratejik §4 madde 5); Faz 4 OpenTofu provider'ı aynı API'yi kullanır |
| D20 | **Token tek kaynak:** `packages/ui/src/lib/tokens.css`. App içinde renk/ölçü yasak. Durum renkleri semantik ve sabit: `ok · degraded · down · maintenance · unknown`. İkametgâh rozetleri sabit (TR/EU/US). Gradient yalnız pazarlama hero'sunda | Klasman D7 / KD D4 |
| D21 | **Public sayfalar `csr=false`**, LCP < 1.2 s; ürün landing'leri katalogdan programatik; `sitemap.xml` kalite süzgeçli | QRindex/Klasman SEO deseni |
| D22 | **Prod: systemd sertleştirilmiş birimler (KD kalıbı) + pull-based `deploy.sh`** (sunucu GitHub'dan çeker; dev'den kod kopyalanmaz). Runner ayrı sunucu | Stratejik §5.2 "üretime elle müdahale yasak" → deploy'un kendisi izlenebilir olmalı. `MemoryDenyWriteExecute` KULLANILMAZ (KD ölçtü) |
| D23 | **Log/izleme:** pino 9 (+ pino-http), Sentry, Umami (self-host). Loki Faz 3 | Klasman |
| D24 | **UI Türkçe, kod İngilizce; i18n yok.** DB anahtarları İngilizce (`active`, `degraded`), etiket sözlüğü `packages/types/src/labels.ts` | Filo kuralı; EN portal Faz 4 (AB ikametgâh müşterisi) |
| D25 | **Politikalar kodda:** `packages/types/src/policy/` — ikametgâh (`residency.ts`), 3-2-1 (`backup.ts`), SLA saat + TR tatil takvimi (`sla-clock.ts`), tedarikçi yoğunlaşma (`concentration.ts`: aynı tedarikçide %60 üstü iş yükü → ops uyarısı). Dokümanda değil testte yaşar | Stratejik §6 "değişmez kural" ve §9 risk 3'ün zorlayıcısı |
| D26 | **İzinli bağımlılık listesi kapalı** (Ek B). Yeni paket = plan revizyonu. Kimlik için `bcrypt`/`jsonwebtoken` eklenmez (Keycloak + `openid-client` + `jose`) | KD D15 disiplini |

---

# 3. Teknik Mimari

## 3.1 Stack (nihai)

| Katman | Teknoloji | Not |
|---|---|---|
| Runtime | Node ≥ 22 · TS 5.7 strict · ES2022 · ESM | `any` eslint-error |
| Monorepo | pnpm 10 workspaces + Turborepo 2 | `build` `^build` bağımlı; `check` `tsc --noEmit` + `svelte-check` |
| API | Express 5 + helmet 8 + compression + cookie-parser + pino-http | Webhook router'ları (`/webhooks/alertmanager`, `/webhooks/billing`, `/webhooks/zammad`) `express.json`'dan ÖNCE mount (HMAC raw body) |
| Frontend | SvelteKit 2 + Svelte 5 runes + Vite 6 + Tailwind 4 (yalnız düzen) + adapter-node | `ssr.noExternal: [/^@veritut\//]` ZORUNLU (KD tuzağı) |
| DB | PostgreSQL 16 + Drizzle 0.38 (tek yöntem) | `veritut` (uygulama) + `veritut_tfstate` (yalnız runner) |
| Migration | `apps/api/src/db/migrations/NNNN_ad.sql` + `_migrations` + tek runner | idempotent, sıra atlama yok |
| Kuyruk / cache | Redis 7 + BullMQ 5 | 7 kuyruk (D4); job `jobId` = idempotens anahtarı (`run:<uuid>`) |
| Realtime | `ws` + Redis pub/sub (gün 1) | canlı çalıştırma logu (`run:<id>:log` stream → WS), olay akışı |
| Cron | node-cron + `NODE_APP_INSTANCE` leader guard + DB idempotens | drift plan (gece 02:00), tatbikat takvimi (ayın 1'i), SLA dönem kapanışı, kanıt çapası (ay sonu), maliyet ingest tetik, retention |
| Kimlik | Keycloak 26 (OIDC) + `openid-client` + `jose`; opak oturum çerezi | D6 |
| Validation | Zod (`packages/validators`) + blueprint `inputs` → Zod derleyici | tek doğrulama kaynağı: portal formu + API + runner girdi kontrolü |
| IaC yürütme | OpenTofu 1.8 + Ansible 10 + Restic 0.17 — `infra/Dockerfile.runner` imajında | runner Node süreci `child_process.spawn` ile çağırır, çıktıyı satır satır Redis stream'e yazar |
| Dosya | S3 uyumlu (MinIO dev / yurt içi S3 prod): kanıt paketleri, raporlar, Ansible artefaktları | presigned indirme, private ACL |
| E-posta / SMS | `IMailProvider` (SMTP/Mailjet) · `ISmsProvider` (Netgsm) — worker `notify` kuyruğu | Klasman adaptörleri port |
| PDF | **pdfkit** (Chromium yok) — SLA raporu, kanıt paketi, DPA | Tablo ağırlıklı belgeler; Klasman'ın ertelenen Chromium bağımlılığı tekrarlanmaz |
| Gözlem | Prometheus + Alertmanager + Grafana + node_exporter/blackbox (`observability` compose profili) | D16 |
| Arama | PG FTS (`simple` + unaccent) — iş yükü/olay/kanıt arama | Meilisearch gerekmez |
| Test | Vitest (makineler, politika, hash zinciri, SLA saati) + Playwright (kiracı izolasyon paketi, sipariş→provizyon mock) + gece Hetzner entegrasyonu (bütçe korumalı) | §15 |
| CI/CD | GitHub Actions (lint + check + test + `pnpm audit --prod` eşiği) + `deploy.sh` (pull-based) | D22 |

## 3.2 Süreç topolojisi ve güven sınırları

```
 tarayıcı ──HTTPS──▶ nginx ──▶ portal / ops / status (SvelteKit SSR, iç ağdan api'ye)
                          └──▶ api (Express) ──▶ Postgres(veritut) · Redis · Keycloak · S3
                                    │  ▲
                 BullMQ (Redis) ─────┘  │ /internal/* (INTERNAL_TOKEN, WireGuard)
                                       │
                 worker ── notify/probe/report/rollup ── S3 · SMTP · Prometheus API
                 runner ── provision/provider-sync/drill ── OpenTofu(pg tfstate) · Ansible(SSH) · Restic · tedarikçi API'leri
                                                            ▲ tek kimlik bilgisi çözücü (X25519 özel anahtarı yalnız burada)
```

- **Runner → hedef sunucular:** Ansible SSH, kısa ömürlü anahtar (Teleport CE ile K4'te sertifika tabanlı). Her müşteri VM'inde `veritut-agent` yok — **agentless**; gerekli kayıtlar (yedek sonucu, yama) Ansible/Restic çıktısından runner tarafından raporlanır. (Agent Faz 4'te değerlendirilir; agentless daha az saldırı yüzeyi.)
- **Worker probe'ları** yalnız kamuya açık uç noktaları test eder; iç sağlık Prometheus'tan.
- **Status** Redis'e salt-okunur kullanıcıyla bağlanır (`ACL` ile `GET status:*`).

## 3.3 Provizyon boru hattı (runner)

`orders` onaylanınca API bir `run` açar (`kind=provision`) ve `provision` kuyruğuna `jobId=run:<id>` atar. Runner:

1. **validate** — blueprint manifest'i çözer, `inputs`'u Zod ile yeniden doğrular, politika motorunu koşar (ikametgâh × tedarikçi × bölge, yoğunlaşma, 3-2-1 kovaları).
2. **unseal** — kiracı/tedarikçi kimlik bilgilerini X25519 ile açar, yalnız süreç belleğinde, `env` olarak alt süreçlere geçirir; diske yazmaz.
3. **plan** — `tofu plan -out` → diff özeti Redis stream'e; **yüksek riskli** (`destroy`, boyut küçültme, ikametgâh değişimi) ise `change` kaydı `awaiting_approval` → kıdemli operatör onayı (ops UI) → devam.
4. **apply** — `tofu apply`; iş yükü başına advisory lock (`pg_try_advisory_lock(hash(workload_id))`); zaman aşımı 45 dk; başarısızlıkta `failed` + otomatik `tofu plan` ile artık analizi.
5. **configure** — Ansible playbook (`docker-host` temel rolü: sertleştirme, unattended-upgrades, node_exporter, restic, WireGuard; sonra uygulama rolü: compose stack + Keycloak OIDC istemcisi + Cloudflare DNS + TLS).
6. **verify** — `checks/` (HTTP 200, TLS geçerli, ilk yedek başarılı, OIDC girişi 302) — biri düşerse `degraded`, müşteriye teslim edilmez.
7. **register** — uç noktalar, erişim bilgileri (mühürlü), Prometheus hedefi, yedek takvimi, status bileşeni, kanıt olayı `workload.provisioned`.
8. **handoff** — `workload → active`, müşteriye "kurulum tamamlandı" + kurulum notu (`docs/musteri-notu.md` render).

Aynı hat `kind=upgrade | resize | destroy | patch | rotate-secrets | drill | drift-plan` için koşar. **İdempotens:** her adım yeniden çalıştırılabilir; `run_steps` tablosu adım durumunu tutar, çöken runner kaldığı adımdan devam eder.

## 3.4 Blueprint anatomisi

```
infra/blueprints/nextcloud/1.2.0/
├─ blueprint.yaml        # slug, version, layer (1-4), title_tr, summary_tr, inputs (JSON Schema → Zod),
│                        # residencies [TR,EU,US], providers [hetzner,aws], sizes (S/M/L → tofu var'ları),
│                        # sla_tiers, backup_policy (schedule, retention, offsite), ports, healthchecks,
│                        # sso: {oidc: true}, metrics: [exporter'lar], price_hint (katalogla eşleşmez, ops referansı)
├─ tofu/                 # module: VM + volume + firewall + DNS (provider'a göre alt modüller)
├─ ansible/              # roles: docker-host (ortak, symlink) + nextcloud
├─ checks/               # post-provision smoke (node script — runner koşar)
└─ docs/  runbook.md · musteri-notu.md · degisiklik-gunlugu.md
```

Kurallar (`docs/blueprint-yazim.md`): semver zorunlu, yayımlanmış sürüm değişmez (yeni sürüm açılır), iş yükü sürüme bağlanır; `upgrade` run'ı sürüm farkını uygular. Ortak `docker-host` rolü **tek**, uygulamalar üstüne biner → 10+ uygulamaya çıkış (K5) rol yazmaktan ibarettir. `inputs` şeması portal sipariş formunu **otomatik** üretir (Klasman form motoru deseni: şema → Zod → Svelte alan bileşenleri).

## 3.5 Kimlik akışı

Portal `/panel` → `GET /api/v1/auth/login?realm=musteri` → Keycloak (PKCE) → `/api/v1/auth/callback` → API kullanıcıyı `users`'a yansıtır (ilk giriş → kiracı yoksa `onboarding` durumu), opak oturum (`sessions`: sha256(token), UA, IP, `expires_at`, `kc_refresh_enc`) → `vt_portal` HttpOnly/Secure/SameSite=Lax. Ops aynı akış `veritut-ops` realm + `vt_ops`; Keycloak tarafında MFA zorunlu + IP allow-list nginx'te. Katman 3 uygulamaları kiracı realm'inin **istemcisi** olarak provizyon edilir → müşteri Nextcloud'a VERITUT hesabıyla girer. Kiracı silinince realm de silinir (offboarding kanıtı).

## 3.6 Entegrasyon adaptörleri (özet sözleşme)

| Arayüz | Metotlar (özet) | K-fazı |
|---|---|---|
| `IProviderDriver` | `listInventory()`, `estimateCost(resources)`, `fetchCostLines(period)`, `healthcheck()`, `capabilities()` (bölgeler, ikametgâh, boyutlar) — **provizyonun kendisi OpenTofu'da**, driver yalnız envanter/maliyet/yetenek | hetzner K1 · mock K1 · aws/gcp K5 · cloudflare K2 · trdc K6 |
| `IBillingProvider` | `syncCustomer`, `pushUsage(lines)`, `listInvoices`, `invoicePayLink`, `onWebhook` | fossbilling K3 · entranet K6 |
| `ITicketProvider` | `create`, `list(tenant)`, `reply`, `timeAccounting(period)`, `onWebhook` | zammad K3 |
| `IAlertSink` | `send(event, channel)` — e-posta/SMS/webhook/Slack/Teams | K4 |
| `IDomainRegistrar` | `check`, `register`, `renew`, `dns()` | K6 (Katman 1 kapı — WHMCS/FOSSBilling modülüyle geçici) |

Her adaptörün `mock` sürümü dev/test'te zorunlu; CI adaptörsüz koşar.

---

# 4. Veri Modeli (dondurulmuş çekirdek, ~60 tablo)

UUID PK, `created_at/updated_at` TIMESTAMPTZ + trigger; kiracı verisi taşıyan her tabloda `tenant_id`. Drizzle şemaları `apps/api/src/db/schema/*.ts`.

### 4.1 Kimlik + kiracı
`tenants` (slug, ad, tür: `customer|internal|reseller`, `parent_tenant_id`, `residency_default`, `status`, `kc_realm`, `billing_ref`) · `users` (kc_sub, e-posta, ad) · `tenant_members` (tenant, user, role) · `sessions` · `staff` (kc_sub, rol, `local_totp_enc` break-glass) · `staff_sessions` · `api_keys` (tenant, ad, hash, scopes[], ip_allow[], last_used_at, expires_at) · `invitations`.

### 4.2 Katalog + fiyat + entitlement
`products` (slug, layer, title, blueprint_slug, active, seo_body_md) · `product_versions` (product, blueprint_version, status: `draft|published|deprecated`) · `plans` (Başlangıç/Profesyonel/Kurumsal; `features jsonb`, kotalar) · `sla_tiers` (code `std_9x5|crit_24x7|custom`, response_min, resolve_min, uptime_target, coverage) · `price_list` (product/plan/sla/size × ikametgâh × para birimi, `valid_from`) · `addons` · `tenant_subscriptions` (billing aynası: plan, dönem, durum) · `tenant_feature_overrides` · `usage_records` (tenant, workload, metric, qty, period, pushed_at) — `getEffectiveFeatures()` tek formül.

### 4.3 Tedarikçi
`providers` (code, ad, partner_status, exit_plan_doc) · `provider_accounts` (provider, label, `credentials_sealed`, key_version, regions[], residency[], quota jsonb, health, last_sync_at) — **her tedarikçide ≥2 hesap** politikası ops uyarısı · `provider_regions` · `provider_cost_lines` (account, period, resource_ref, amount, currency, raw jsonb) · `provider_inventory` (account, external_id, kind, region, tags, matched_workload_id) — **sahipsiz kaynak** = maliyet sızıntısı uyarısı.

### 4.4 İş yükü + provizyon
`workloads` (tenant, product_version, ad, slug, `residency`, provider_account, region, size, `sla_tier`, status, `inputs jsonb`, endpoints jsonb, `access_sealed`, monitoring_targets jsonb, `cost_center`) · `workload_secrets` (mühürlü, key_version, rotated_at) · `orders` (tenant, product_version, inputs, plan, sla, residency, status, approved_by) · `runs` (workload, kind, status, triggered_by, change_id, started/finished, exit_code, summary jsonb) · `run_steps` (run, step, status, log_ref, started/finished) · `changes` (tenant, workload, kind, risk, requested_by, approved_by, run_id, status, rollback_run_id) · `runbooks` (slug, title, path, automated bool, playbook_ref) · `drift_reports` (workload, run, diff jsonb, acknowledged_by).

### 4.5 Yedek + kanıt
`backup_policies` (workload, schedule, retention, `primary_repo`, `offsite_repo`, offsite_provider_account) · `backup_repos` (provider_account, bucket, residency, restic_key_sealed) · `backup_jobs` (workload, started/finished, status, snapshot_id, bytes, files, error) · `restore_drills` (workload, scheduled_for, run_id, status, checksum_ok, app_check_ok, duration_s, evidence_id) · **`evidence_events`** (tenant, seq, kind, subject_type, subject_id, payload jsonb, occurred_at, actor, prev_hash, hash) — trigger: UPDATE/DELETE → `RAISE EXCEPTION` · `evidence_anchors` (tenant | platform, period, last_seq, anchor_hash, published_at, published_to[]) · `evidence_bundles` (tenant, period, s3_key, sha256, generated_at) · `auditor_links` (tenant, token_hash, scope, expires_at).

Kanıt olay türleri (kapalı sözlük, `types/evidence-kinds.ts`): `workload.provisioned|upgraded|destroyed` · `backup.completed|failed` · `restore.drill.passed|failed` · `patch.applied` · `access.session` · `change.applied|rolled_back` · `incident.resolved` · `secret.rotated` · `tenant.offboarded` · `breakglass.used`.

### 4.6 Gözlem + olay + SLA
`components` (platform bileşenleri; status sayfası) · `probes` (workload/component, tür, hedef, aralık) · `probe_results` (partitioned, 90 g) · `alerts` (fingerprint, labels, starts/ends, incident_id) · `incidents` (tenant nullable=platform, severity, status, title, customer_visible, sla_tier, response_due, resolve_due, responded_at, resolved_at, clock_paused_s) · `incident_updates` · `incident_workloads` · `maintenance_windows` · `business_calendar` (TR resmî tatiller, yıllık seed) · `sla_periods` (tenant, workload, ay, uptime_pct, breaches, credit_suggested, report_s3_key) · `oncall_shifts` (staff, start/end, escalation_level) · `notification_channels` (tenant, tür, hedef_sealed, events[]) · `notifications` (in-app).

### 4.7 Maliyet + FinOps
`cost_allocations` (workload, period, amount, method: `direct|shared|estimate`) · `margin_rollups` (tenant/workload, period, revenue, cost, gross_margin_pct) · `kpi_snapshots` (period, mrr, nrr, churn, support_min_per_customer, sla_breaches, cac, ltv) · **FinOps ürünü (K5):** `finops_connections` (tenant, provider, read-only role/sa ref, status) · `finops_findings` (connection, rule, resource, monthly_saving, status) · `finops_savings` (period, measured, share_pct, billed).

### 4.8 Platform işletimi
`audit_log` (actor tip/id, tenant, action, subject, before/after jsonb, ip) — append-only · `webhook_inbox` (kaynak, imza_ok, payload, işlendi) · `documents` (tenant, tür: `sla|dpa|subprocessors|terms`, version, s3_key, generated_from jsonb) · `feature_flags` · `settings`.

---

# 5. Durum Makineleri (`packages/types/src/machines/`)

| Makine | Durumlar | Kritik kurallar |
|---|---|---|
| `workload` | `requested → provisioning → active ⇄ degraded → suspended → decommissioning → destroyed` + `failed` (provisioning'den) | `active`'e geçiş yalnız `verify` adımı yeşilse; `destroyed` yalnız `change.approved` + yedek `evidence` varsa; `suspended` faturalama sinyali (ödeme) — veri silinmez |
| `order` | `draft → submitted → approved → provisioning → fulfilled` + `rejected|cancelled` | `approved` → `run` açılır (tek, idempotent) |
| `run` | `queued → running → awaiting_approval → running → succeeded` + `failed|cancelled` | `awaiting_approval` yalnız `risk=high`; her geçiş `run_steps` ile tutarlı |
| `change` | `draft → approved → executing → verified` + `rolled_back|rejected` | Yüksek risk: onaylayan ≠ talep eden (dört-göz) |
| `incident` | `open → identified → monitoring → resolved → postmortem_done` | SLA saati `open`'da başlar, `resolved`'da durur; müşteri bekleniyor → `clock_paused` |
| `backup_job` | `scheduled → running → completed|failed` | `failed` ×2 ardışık → olay (sev3) otomatik |
| `restore_drill` | `scheduled → running → passed|failed` | `passed` → kanıt; `failed` → olay + müşteri bilgilendirme (şeffaflık) |
| `subscription` | `trialing → active → past_due → suspended → cancelled` | Yalnız billing webhook'u ilerletir; Core elle dokunmaz (D17) |

`transition(machine, from, to, ctx)` geçersiz geçişte fırlatır; servisler status kolonuna doğrudan yazmaz (eslint kuralı: `status:` literal yazımı `machines/` dışında yasak — grep tabanlı CI kontrolü).

---

# 6. Multi-Tenancy ve Yetkilendirme

1. **`resolveTenant`** tek middleware (D7). Portal: oturumdaki kullanıcının üyeliği; API anahtarı: anahtarın kiracısı. Ops uçları kiracı bağlamını **açık parametre** ile alır ve `audit_log`'a yazar.
2. **İzin iki katman:** `requireRole(...)` (kiracı rolü) + `requireFeature(feature)` (plan entitlement; HTTP metodu → eylem). Redis 5 dk izin cache + rol değişiminde `invalidate`.
3. **Fail-closed:** haritalanmamış route segmenti → 403 + startup uyarısı. Rate limiter: Redis düşükken genel istekler fail-open; **sipariş, API anahtarı üretimi, kimlik uçları, destroy fail-closed**.
4. **404 disiplini:** kapsam dışı kaynak 404 (KD). Kiracı A, B'nin iş yükü/kanıt/olay/status sayfasını göremez.
5. **Ops görünürlüğü:** operatör tüm kiracıları görür ama **erişim bilgisi açma** (`access_sealed` çözme talebi) kanıt olayı üretir ve müşteri portalında görünür ("VERITUT personeli X, iş yükünüze Y saatinde erişti") — şeffaflık satış argümanıdır.
6. **Kiracı izolasyon e2e paketi** (CI zorunlu): iş yükü, kanıt, status snapshot, API anahtarı, Prometheus proxy etiketi, S3 presigned URL kapsamı, Keycloak realm ayrımı.
7. **Bayi (Faz 4):** `parent_tenant_id` ile ağaç; bayi alt kiracının verisini görür, alt kiracı üstünü görmez; fiyat listesi bayi başına override.

---

# 7. Güvenlik, KVKK ve Veri İkametgâhı

## 7.1 Temel yığın
helmet (CSP `script-src 'self'`), CORS allow-list, Zod boundary, Drizzle parametreli sorgu, `trust proxy`, pre-commit secret tarama + Conventional Commits, `pnpm audit` CI eşiği (high → fail), Dependabot haftalık, API anahtarı sha256 + kapsam + IP allow-list, webhook HMAC/bearer (Alertmanager bearer, FOSSBilling/Zammad HMAC), `audit_log` append-only, oturum çerezleri HttpOnly/Secure/SameSite=Lax, ops IP allow-list (nginx), ops MFA (Keycloak).

## 7.2 Sır yönetimi (D12)
- Tedarikçi kimlik bilgisi, kiracı erişim bilgisi, Restic anahtarı, Keycloak istemci sırrı → **mühürlü** (`*_sealed`), `key_version`.
- Runner özel anahtarı: sunucuda `/etc/veritut/runner.key` (600, systemd `LoadCredential=`), dev'de `infra/.env`.
- Rotasyon runbook'u: yeni çift → API yeni açık anahtarla mühürler → runner iki anahtarla açar → eski süresi dolar. Rotasyon = kanıt olayı.
- Loglara sır düşmez: pino `redact` listesi (`*.password`, `*.token`, `*_sealed`, `env`) + runner alt süreç çıktısında regex maskeleme.

## 7.3 Veri ikametgâhı (politika motoru, D25)
- `residency ∈ {TR, EU, US}`; her `provider_region` ve `backup_repo` ikametgâh etiketli.
- Kural: iş yükü, birincil yedek ve **offsite yedek** aynı ikametgâh sınıfında kalır (TR → TR; EU → EU/TR seçilebilir, ABD'ye çıkmaz — sözleşme metniyle eş).
- Kural: Prometheus/loglar ikametgâh içinde (bölge başına gözlem yığını K5'te; K1-K4 tek bölge TR/EU Hetzner, portalda açıkça yazılır).
- Portal sipariş formunda ikametgâh **ilk soru**; sonrası filtrelenir. DPA belgesi ikametgâhı ve alt işleyenleri **veriden** üretir.

## 7.4 KVKK ürünleşmiş uyumluluk
- **Alt işleyen listesi otomatik:** kiracının iş yüklerinin dokunduğu `providers` kümesi → `documents(type=subprocessors)`; tedarikçi değişince yeni sürüm + müşteri bildirimi (sözleşmesel 30 gün).
- **DPA (veri işleme sözleşmesi)** şablon + kiracı verileriyle pdfkit; hukuk onayı Faz 0 çıktısı.
- **Saklama:** probe 90 g, log 90 g (Loki'de 30 g), kanıt defteri 10 yıl, yedekler politika kadar, `audit_log` 5 yıl. Cron ile silme + silme kanıtı.
- **Offboarding:** dışa aktarım paketi (yedek + erişim + kanıt) → müşteri onayı → `destroy` run → Keycloak realm silme → `tenant.offboarded` kanıtı + "imha belgesi" PDF.
- **Erişim şeffaflığı:** §6 madde 5.

## 7.5 Erişim ve bastion
K1-K3: bastion VM + WireGuard + SSH sertifikası (runner CA), oturum kaydı `tlog` → S3. **K4: Teleport CE** (oturum kaydı, RBAC, MFA, denetim dışa aktarımı) → `access.session` kanıt olayı. Üretime doğrudan SSH yalnız break-glass ve kanıtlı.

---

# 8. Kanıt Defteri ve SLA Motoru (ürünün kalbi)

## 8.1 Kanıt Defteri
- Yazım: `evidenceService.append(tenantId, kind, subject, payload)` → tek transaction içinde `seq = max+1`, `prev_hash`, `hash = sha256(prev_hash ‖ canonical_json(payload) ‖ occurred_at ‖ kind)`. Eşzamanlılık: kiracı başına advisory lock.
- Ay sonu cron: her kiracı için `anchor_hash = hash(son olay)`; platform çapası = tüm kiracı çapalarının Merkle kökü → `/guvence` sayfasında ve status feed'inde yayımlanır; isteyen kiracıya e-posta.
- Doğrulama: `GET /api/v1/evidence/verify?tenant=…&from=…&to=…` zinciri yeniden hesaplar; portalda "zincir bütün ✓" göstergesi; denetçi linkiyle kimliksiz doğrulama.
- **Kanıt paketi** (aylık, pdfkit + JSON eki): iş yükü envanteri, yedek/tatbikat özeti, yama tarihi, olaylar + SLA, erişim oturumları, değişiklikler, alt işleyenler, çapa hash'i. ISO 27001 / KVKK denetimine "belgeyi kim verecek" cevabı.

## 8.2 SLA saati
- `sla-clock.ts`: kapsam (`9x5` → iş günü 09:00-18:00 TR, `business_calendar` tatilleri; `24x7`), yanıt/çözüm hedefi dakika, `clock_paused_s`.
- Olay `open` → `response_due`, `resolve_due` hesaplanır; nöbetçiye bildirim + T-15 dk eskalasyon.
- Uptime: probe + ilan edilen olaylar (planlı bakım hariç) → `sla_periods.uptime_pct`; hedef altı → `credit_suggested` (sözleşme tablosu) → ops onayı → `IBillingProvider.pushUsage(negative line)`.
- Aylık **SLA raporu** PDF müşteriye otomatik; ihlal sayısı KPI'a.

## 8.3 Olay ve nöbet
Alertmanager → `/webhooks/alertmanager` → `alerts` upsert (fingerprint) → kural: aynı iş yükü 5 dk içinde ≥1 kritik alarm → olay otomatik (`sev2`), müşteriye görünürlük operatör onayıyla. `oncall_shifts` basit rota + `IAlertSink` (SMS/çağrı sağlayıcısı) — Grafana OnCall gibi dış rota sistemi **alınmaz** (arşivlenme riski). Post-mortem şablonu ops UI'da; `postmortem_done` olmadan `sev1/sev2` kapanmaz.

---

# 9. Gözlem ve Durum Sayfası

- Worker `probe` kuyruğu: iş yükü uç noktaları + platform bileşenleri; sonuçlar `probe_results` + Redis `status:<tenant>` snapshot (30 sn). Status app yalnız bu snapshot'ı okur (D14).
- Prometheus `file_sd`: worker her 60 sn `workloads.monitoring_targets` → `/var/lib/veritut/prom-targets/*.json` (Prometheus konteynerine paylaşımlı volume; prod'da gözlem sunucusuna rsync/HTTP SD). Etiketler: `tenant`, `workload`, `residency`, `provider`.
- Portal grafikleri: `GET /api/v1/workloads/:id/metrics?q=cpu|mem|disk|http_p95&range=24h` → API sorguyu **kendisi kurar**, kullanıcı PromQL yazamaz; `tenant="<id>"` zorunlu.
- Grafana ops içi; kiracı görünümü yok (D16).
- Yıllık 90 günlük çubuk, olay geçmişi, RSS/JSON, e-posta aboneliği (double opt-in) — status app'te.
- Dogfood: platformun kendi bileşenleri (api, portal, kimlik, runner kuyruğu gecikmesi) `components` tablosunda; VERITUT'un kendi SLA raporu kamuya açık (`/guvence`).

---

# 10. Faturalama, Ölçümleme ve FinOps

- **Ölçümleme (Core):** her iş yükü için `usage_records`: abonelik (plan × SLA × boyut, aylık), aşım (depolama GB, trafik, yedek alanı), tek seferlik (kurulum bedeli), kredi (SLA ihlali, negatif). Dönem kapanışında `pushUsage` → FOSSBilling fatura keser → webhook → `tenant_subscriptions` ayna → `suspended` sinyali makineye.
- **Fiyat ilkesi kodda:** `price_list` değer bazlı satırlar; "tedarikçi maliyeti + %" formülü **yok** — ama `margin_rollups` her iş yükünün brüt marjını gösterir (stratejik §9 risk 1'in erken uyarısı: marj < %35 → ops bayrağı).
- **Maliyet ingest (runner `provider-sync`):** Hetzner → `/pricing` × envanter (saatlik tahmin) + aylık fatura CSV içe aktarımı (ops yükler); AWS → CUR (S3 parquet, günlük); GCP → Billing Export (BigQuery sorgusu, runner'da `@google-cloud/bigquery`); Cloudflare → API. `cost_allocations` iş yüküne eşler; **sahipsiz kaynak** raporu.
- **KPI (`kpi_snapshots`, aylık):** MRR/NRR (billing aynası), brüt marj, destek dakikası/müşteri (Zammad), churn, SLA ihlali, CAC/LTV (ops elle girer). Ops KPI panosu = stratejik §7.3 tablosu birebir.
- **FinOps ürünü (K5):** müşteri kendi AWS/GCP hesabına salt-okunur rol/servis hesabı verir → runner ingest → kural motoru (`finops/rules/*.ts`: boşta kaynak, eski nesil tip, yedeksiz volume, ayrılmamış EIP, rezervasyon fırsatı) → bulgular portalda → müşteri onaylar → uygulanan tasarruf ölçülür → `finops_savings` kazanç paylaşımı satırı faturaya.

---

# 11. Tasarım Sistemi

Marka Faz 0 çıktısı (stratejik §8 Faz 0); token'lar bir **Claude Design projesinden** `packages/ui/src/lib/tokens.css`'e verbatim çekilir (KD deseni). Karakter şartları (bağlayıcı, tasarım bunlara göre yapılır):

- **His:** emanet, sükûnet, kanıt. Mühür/kasa çağrışımı; "startup neon"u yok. Nötr koyu petrol-lacivert zemin ailesi + tek sıcak vurgu (kanıt/doğrulandı dili için — renk DS'te seçilir); marka geçişi yalnız pazarlama hero'sunda.
- **Tipografi:** UI Manrope (self-host `@fontsource-variable/manrope`), veri/kimlik/hash/log **JetBrains Mono** (`@fontsource-variable/jetbrains-mono`), `tabular-nums` her sayısal sütunda.
- **Yoğunluk:** ops paneli veri-yoğun (tablo-önce, 13-14 px, satır 36 px); portal daha ferah (sağlık kartı ızgarası). İki mod zorunlu; ops **varsayılan koyu**.
- **Durum dili sabit:** `ok · degraded · down · maintenance · unknown` renk + ikon (yalnız renge güvenme — erişilebilirlik). İkametgâh rozeti (TR/EU/US) sabit biçim.
- **Kanıt dili:** hash'ler mono + kopyala butonu + "zincir bütün ✓"; kırık zincir kırmızı, gizlenmez.
- Köşe 10/14 px, gölge yok, glow yok, 150 ms geçiş; inline SVG Heroicons outline; emoji yok; illüstrasyon yok — görsel ağırlık tipografi + durum çubukları.
- İçerik dili: cümle düzeni, 1. çoğul ("yedeği doğruladık", "hata yaptık, düzelttik"), ünlem nadir, "devrim/muhteşem" yasak; belirsizlik gizlenmez ("Doğrulama bekliyor").

---

# 12. Büyüme Motoru (PLG)

- **Programatik landing'ler** (`/urunler/[slug]`): katalogdan; "Yönetilen n8n Türkiye", fiyat, SLA, ikametgâh seçenekleri, "5 dakikada kur" CTA → kayıt → sipariş. `Product` + `FAQPage` JSON-LD, `csr=false`, ~4 KB CSS.
- **Karşılaştırma sayfaları** (`/karsilastir/[a]-vs-[b]`: Nextcloud vs Google Drive, Zammad vs Zendesk, n8n vs Zapier) — SEO'nun asıl trafik motoru; içerik `content/*.md`.
- **Ücretsiz araçlar** (login'siz): bulut maliyet tahmincisi (Hetzner/AWS/GCP fiyat listesi × kaynak — driver `estimateCost` public yüzü), KVKK alt işleyen listesi üreteci, yedek 3-2-1 denetleyici (anket → rapor). Her araç e-posta yakalar.
- **Şeffaflık = pazarlama:** `/guvence` (kamuya açık çapa hash'leri, platform SLA raporu, tatbikat takvimi), status sayfası, post-mortem yayınları.
- **API + OpenAPI + örnekler** (`/gelistirici`): ajans segmenti için "müşterinize Nextcloud'u API ile kurun" hikâyesi; Faz 4 OpenTofu provider.
- **Deneme:** Katman 3 ürünlerinde 14 gün süreli deneme (kart yok, kaynak S boyutu, otomatik `suspended` → 7 gün sonra destroy; kanıtlı) — "ücretsiz katman sızması" (stratejik §9 risk 4) kodla kapatılır.
- Ölçüm: Umami (KVKK dostu) + `utm_attributions` siparişte + huni raporu ops panosunda.

---

# 13. Sunucu Topolojisi ve Deploy

**Prod Faz 1-2 (K1-K3):**

| Sunucu | Rol | Not |
|---|---|---|
| `vt-app` (Hetzner FSN/NBG — EU; TR ikametgâh için TR-DC K5) | api + worker + portal + ops (systemd, KD birim kalıbı) + nginx | `EnvironmentFile=/etc/veritut/<app>.env`, PORT birim içinde (KD tuzağı) |
| `vt-data` | PostgreSQL 16 (`veritut` + `veritut_tfstate`) + Redis 7 (parolalı, ACL) | private ağ; günlük pg_dump + **Restic offsite farklı tedarikçi** (dogfood 3-2-1) |
| `vt-runner` | runner (systemd, `LoadCredential=runner.key`) + OpenTofu/Ansible/Restic | gelen port yok, WireGuard ile app/data'ya; tedarikçi API'lerine çıkış |
| `vt-kimlik` | Keycloak (Postgres'i `vt-data`'da) | `vt-app` ile aynı makinede başlayabilir; K4'te ayrılır |
| `vt-gozlem` | Prometheus + Alertmanager + Grafana (+ Loki K4) | private ağ; hedef dosyaları worker'dan HTTP SD |
| `vt-durum` — **farklı tedarikçi** (ör. Hetzner ana ise OVH/Scaleway/DO) | status app + Redis replika (snapshot çekimi) | ana yığın düşse ayakta |
| bastion / Teleport (K4) | erişim | §7.5 |

**Deploy:** `deploy.sh` pull-based (KD): ön kontrol (main + temiz + `verify_targets` hostname) → sunucuda `git fetch && checkout <sha>` → `pnpm install --frozen-lockfile` → `turbo build` → migration onayı (`RUN_MIGRATION=1`) → `systemctl restart` sırayla (api → worker → runner → portal → ops) → smoke (`/api/v1/health`, portal `/`, ops `/giris`, status `/`, bir iş yükü sağlık kartı) → başarısızlıkta önceki sha'ya `checkout` + restart. Runner deploy'u **aktif run yokken** (kuyruk drain bekler).

**Dogfooding (K5 çıkış kriteri):** `vt-app/data/runner/gozlem` VERITUT'un kendi `internal` kiracısı altında iş yükü olarak kayıtlı; yedek/tatbikat/kanıt zinciri kendi üstünde çalışır; `/guvence` bunu gösterir.

**Dev (filo):** `infra/compose.dev.yml` — api, worker, runner, portal, ops, status, postgres, redis, minio, keycloak (realm import `infra/keycloak/realms/*.json`), profil `observability` (prometheus, alertmanager, grafana, blackbox). Runner dev'de `PROVIDER_DRIVERS=mock,hetzner` — Hetzner **gerçek dev projesi** (`HCLOUD_BUDGET_EUR=20`, gece testinde her şeyi `destroy` eder, bütçe aşımında kuyruğu durdurur).

---

# 14. Yol Haritası — Kodlama Fazları

Stratejik planın Faz 0-4 takvimine oturur. Fazlar sıralıdır; her fazın sonunda kabul komutları koşulur ve raporlanır.

## K0 — İskelet (2 hafta · stratejik Faz 0 içinde)
1. Depo (`/srv/fleet/projects/veritut`, main) + root konfig (pnpm, turbo, tsconfig.base, eslint/prettier) — Klasman şablonu.
2. Sözleşme katmanı: `packages/types` (roller, makineler iskeleti, `labels.ts`, `evidence-kinds.ts`, `policy/` iskelet), `packages/validators`, `packages/shared`, `docs/api-sozlesme.md` v0.
3. `packages/ui`: tokens.css (Claude Design çekimi) + components.css + temel bileşenler (Button, Card, Table, StatusDot, ResidencyBadge, HashChip, Modal, Toast, Tabs) — iki tema.
4. `infra/`: compose (10 servis + profil), Dockerfile + Dockerfile.runner (OpenTofu/Ansible/Restic), Keycloak realm JSON'ları, `.env.example`, sertifika SAN ekleme.
5. DB: `db.ts` (pool export yok), `migrate.ts`, `0001_init.sql` (§4.1-4.8 çekirdek + `evidence_events` trigger'ı), Drizzle şemaları, `seed.ts` (planlar, SLA katmanları, TR tatil takvimi 2026-2027, tedarikçiler, ops break-glass).
6. Kimlik: OIDC akışı iki realm, oturum tabloları, `resolveTenant`, `requireUser/requireStaff`, fail-closed guard + startup haritası kontrolü.
7. Worker + runner iskeleti: kuyruklar, `/internal/*`, X25519 mühür/aç yardımcıları (`packages/types` değil — `apps/api/src/lib/seal.ts` ve `apps/runner/src/lib/unseal.ts`), canlı log stream → WS.
8. `CLAUDE.md` (D1-D26 özeti + §16 sözleşmesi + komutlar) + `docs/kararlar.md`.

**Kabul:** compose sağlıklı · `pnpm db:migrate` 0001 · `pnpm check` sıfır hata · 4 host HTTPS'te (`/api/v1/health` `{ok:true, queues:{…}}`) · Keycloak ile portal ve ops'a giriş, çerezler ayrı · runner mock job alıp logu ops'ta canlı akıtıyor · mühürlenen sır API'de açılamıyor (test).

## K1 — Envanter, kanıt ve marj (6 hafta · stratejik Faz 1 "Konsolidasyon")
Amaç: **yeni müşteri aramadan önce mevcut Verisay hizmetlerini panele almak** ve stratejik "İlk 30 gün" madde 2-3'ü (envanter + gerçek brüt marj) sistemden cevaplamak.
1. Kiracı + üyelik + ekip yönetimi (portal) · kiracı 360 (ops) · CSV içe aktarım (mevcut müşteriler).
2. Tedarikçi hesapları (mühürlü kimlik bilgisi, ≥2 hesap uyarısı, çıkış planı linki) · `IProviderDriver` hetzner + mock: `listInventory` → `provider_inventory`; **iş yükü eşleme UI** (sahipsiz kaynak listesi).
3. İş yükü kayıt defteri: elle/ithal kayıt (blueprint'siz `legacy` ürünü), sağlık kartı (portal), envanter (ops).
4. **Kanıt Defteri v1:** append + zincir + doğrulama ucu + portal sekmesi; ilk olay türleri `backup.completed` (Restic çıktısı runner'dan — mevcut sunuculara Ansible ile restic kurulumu) + `access.session` (bastion log ingest).
5. Probe + status v1 (platform + kiracı sayfası) + Redis snapshot.
6. Maliyet ingest Hetzner (fiyat × envanter + CSV) → `cost_allocations` → **marj raporu** (ops: müşteri/iş yükü brüt marj; elle gelir girişi K3'e kadar).
7. Bildirim çekirdeği (in-app + e-posta) · `audit_log` her ops mutasyonunda.

**Kabul:** Verisay'ın tüm mevcut hizmetleri kiracı/iş yükü olarak kayıtlı; sahipsiz kaynak = 0 veya gerekçeli · her iş yükünün maliyeti ve (elle girilen) geliriyle marj raporu · en az 1 gerçek Restic yedeği kanıt zincirinde ve `verify` ✓ · status sayfası kiracı bazlı, Kiracı A B'yi göremiyor (e2e) · smoke paketi `smoke-k1.mjs`.

## K2 — Provizyon motoru (6 hafta · stratejik Faz 2 ilk yarı)
1. Blueprint sözleşmesi + `docs/blueprint-yazim.md` + `inputs → Zod → form` derleyicisi.
2. Runner boru hattı (§3.3) tam: OpenTofu pg backend + state şifreleme, plan diff, yüksek risk onayı, `run_steps` devamlılık, advisory lock, zaman aşımı.
3. Blueprint'ler: `managed-vps` (Hetzner: VM + firewall + volume + Cloudflare DNS + `docker-host` rolü) · `n8n` · `nextcloud` · `zammad` — her biri Keycloak realm istemcisi (SSO), Restic politikası (birincil + offsite farklı tedarikçi kovası), Prometheus hedefi, `checks/`.
4. Yedek otomasyonu: `backup_policies` → Ansible cron → sonuç `/internal/backup-result` → kanıt; ardışık 2 hata → olay.
5. Ops "Çalıştırmalar" ekranı (canlı log, diff, onay) + değişiklik kaydı otomatik.
6. Gece Hetzner entegrasyon testi (bütçe korumalı, otomatik destroy).

**Kabul:** ops panelinden 4 blueprint uçtan uca kuruluyor (`requested → active`), müşteri SSO ile Nextcloud'a giriyor · ilk yedek + kanıt otomatik · `destroy` dört-göz onayı olmadan koşmuyor · runner çökertilip yeniden başlatılınca run kaldığı adımdan devam ediyor (test) · API süreci içinden tedarikçi API'sine çağrı yok (grep + ağ politikası testi).

## K3 — Ticari katman ve lansman (5 hafta · stratejik Faz 2 ikinci yarı = LANSMAN)
1. Katalog + fiyat listesi + planlar + SLA katmanları (ops CRUD) · entitlement `getEffectiveFeatures`.
2. **Self-servis sipariş** (portal): ürün → ikametgâh → boyut → plan/SLA → özet → onay → provizyon → teslim e-postası. 14 gün deneme akışı + otomatik suspend/destroy.
3. `IBillingProvider` FOSSBilling: müşteri senk, `pushUsage`, fatura aynası, ödeme derin link, webhook → abonelik makinesi. PayTR FOSSBilling içinde.
4. `ITicketProvider` Zammad: portal ticket sekmesi, webhook, destek dakikası KPI.
5. Pazarlama `(public)`: ana sayfa, ürün landing'leri (programatik), fiyatlandırma, SLA, `/guvence`, KVKK/sözleşmeler, sitemap/robots, JSON-LD.
6. Public API + API anahtarları + OpenAPI (`/gelistirici`) · rate limiter (fail-closed set).
7. KPI panosu v1 (MRR aynası, marj, destek dk, churn).

**Kabul (= lansman kriteri):** anonim ziyaretçi landing → kayıt → sipariş → ödeme (FOSSBilling test) → n8n aktif → portalda sağlık kartı + ilk yedek kanıtı, **insan dokunmadan** · fatura portalda görünüyor · ticket açılıp Zammad'dan yanıtlanıyor · Lighthouse public sayfa ≥ 95 perf · kiracı izolasyon e2e yeşil.

## K4 — Güvence katmanı (8 hafta · stratejik Faz 3 "Yönetilen büyüme")
1. Olay yönetimi: Alertmanager webhook → alarm → olay kuralı; olay ekranları (ops + portal görünür/gizli), bakım pencereleri, post-mortem.
2. **SLA motoru:** saat, TR takvim, eskalasyon, `sla_periods`, aylık PDF raporu, kredi önerisi → billing.
3. Nöbet rotası + `IAlertSink` (SMS/çağrı) + T-15 eskalasyon.
4. **Geri dönüş tatbikatı otomasyonu:** aylık takvim → runner `drill` → geçici ortam → checksum + uygulama kontrolü → kanıt (+ başarısızlıkta müşteri bilgilendirme).
5. Drift tespiti (gece `tofu plan`) → `drift_reports` → ops onayı/uygulama.
6. Değişiklik yönetimi + runbook kütüphanesi (`infra/runbooks`, otomatik olanlar "yürüt").
7. Teleport CE + `access.session` kanıtı + erişim şeffaflığı (portal).
8. Belgeler: DPA, alt işleyen listesi (otomatik), **aylık kanıt paketi** PDF + JSON, denetçi linki, aylık çapa yayını.
9. Müşteri alarm kanalları (webhook/Slack/Teams/SMS).
10. Loki (opsiyonel) + Sentry.

**Kabul:** sentetik alarm → olay → SLA saati → çözüm → rapor uçtan uca · bir tatbikat otomatik geçti ve kanıt zincirinde · kiracı kanıt paketi indiriliyor, zincir doğrulanıyor · Teleport oturumu kanıt olayı ve portalda görünür · ISO 27001 hazırlık kontrol listesinin (Ek: `docs/iso27001-eslesme.md`) teknik maddeleri "sistemden kanıtlanır" işaretli.

## K5 — Genişleme ve dogfooding (8 hafta · stratejik Faz 3 sonu)
1. **Blueprint fabrikası:** `docker-host` üstüne 10+ uygulama — Metabase, Grafana, Vaultwarden, Plane, Matomo, Chatwoot, Directus, Keycloak, Uptime Kuma, Mattermost (+ Odoo/ERPNext `L` boyutu). Her biri: SSO, yedek, checks, müşteri notu.
2. Ürünler: yönetilen PostgreSQL (tek VM + PITR wal-g, replika `M+`), S3 nesne depolama (MinIO/Garage tek-kiracı VM veya tedarikçi S3 yeniden satış), WireGuard/Headscale VPN.
3. `IProviderDriver` **aws + gcp** (ortaklık onayı sonrası) + EU/US ikametgâh bölgeleri; TR ikametgâh için ilk TR-DC bare-metal driver'ı (Proxmox API).
4. Maliyet ingest AWS CUR + GCP Billing Export; çok tedarikçili marj.
5. **FinOps v1** (§10): bağlantı, kural motoru, bulgular, tasarruf ölçümü, kazanç paylaşımı satırı.
6. Dogfooding tamam: VERITUT kendi altyapısını `internal` kiracı olarak yönetiyor; Safran Labs ürünleri (MesajSepeti, LiftOrbis, Klasman, KD) iç kiracı.
7. Bölge başına gözlem yığını (ikametgâh içi metrik/log).

**Kabul:** 12+ ürün self-servis · 3 tedarikçide iş yükü + ikametgâh politikası e2e (TR verisi ABD kovasına gitmiyor — test) · FinOps bir gerçek müşteride ölçülmüş tasarruf · VERITUT'un kendi kanıt zinciri `/guvence`'de · yoğunlaşma uyarısı çalışıyor (%60 kuralı).

## K6 — Derinleşme (stratejik Faz 4, 12-24 ay — sprint planı v2.0'da)
Bayi/white-label (hiyerarşik kiracı, bayi fiyat listesi, marka override) · Kubernetes platformu blueprint'i (k3s/RKE2 + ArgoCD) · TR kolokasyon/kendi ASN sürecinin envanter tarafı · **AI altyapı blueprint'leri** (LiteLLM ağ geçidi, Qdrant/pgvector, MCP sunucu barındırma, GPU kiralama aracılığı) · **VERITUT MCP sunucusu** (kiracının AI ajanı iş yükü/kanıt/olay verisini salt-okunur sorgular) · Entranet billing adaptörü · OpenTofu provider'ı (`veritut_workload` kaynağı) · `IDomainRegistrar` + `.tr` · EN portal · özel status domain'i · opsiyonel agent.

---

# 15. Test Stratejisi

| Katman | Araç | Kapsam |
|---|---|---|
| Birim | Vitest | durum makineleri (geçersiz geçiş fırlatır), politika motoru (ikametgâh/3-2-1/yoğunlaşma), SLA saati (tatil, 9x5 sınırları, pause), hash zinciri (kurcalama tespiti), mühür/aç (API açamaz), blueprint `inputs` derleyicisi |
| API sözleşme | Vitest + supertest | `docs/api-sozlesme.md` ile OpenAPI üretimi eşleşir; fail-closed guard haritası; 404 disiplini |
| E2E | Playwright | **kiracı izolasyon paketi** (CI zorunlu), sipariş→provizyon (mock driver), kanıt indir/doğrula, olay→SLA→rapor, break-glass kanıtı |
| Runner entegrasyon | gece, Hetzner dev projesi | `managed-vps` + 1 uygulama gerçek kurulum → checks → destroy; `HCLOUD_BUDGET_EUR` koruması; kalan kaynak = fail |
| Adaptör sözleşmesi | Vitest + kayıtlı fixture | her `I*Provider` için mock ve gerçek adaptör aynı sözleşme testini geçer |
| Güvenlik | CI | `pnpm audit` high eşiği, secret tarama, `status:` literal grep (makine dışı), API sürecinden tedarikçi host'larına çıkış yok (ağ politikası testi) |
| Yük | k6 (K3 sonrası staging) | public landing p95 < 100 ms; API anahtarı uçları 500 RPS |
| Tatbikat | runbook | prod restore tatbikatı (VERITUT'un kendi DB'si) çeyrek başı; sonucu `/guvence`'de |

---

# 16. Riskler ve Önlemler (yazılım perspektifi)

| Risk | Önlem |
|---|---|
| Runner ele geçirilirse tüm tedarikçi hesapları | Runner ayrı sunucu, gelen port yok, tedarikçi hesap başına **en dar IAM/token kapsamı**, hesap bölme (≥2), anormal API hacminde otomatik kuyruk durdurma, anahtar rotasyonu runbook'u |
| OpenTofu state bozulması / kilit sızıntısı | pg backend + `_tfstate` günlük yedek + state şifreleme; run başına `tofu plan` doğrulaması; kilit sıkışması runbook'u (`force-unlock` yalnız kıdemli) |
| Keycloak tek hata noktası | Break-glass ops hesabı; K4'te Keycloak HA (2 node, Postgres'i data'da); status app Keycloak'sız |
| Uzun süren job + BullMQ | `lockDuration` uzun + `extendLock` heartbeat; `run_steps` ile devam; zaman aşımı → `failed` + artık analizi |
| "Elle müdahale" sızıntısı | Deploy pull-based + sha izli; sunucuda SSH yalnız Teleport/kanıtlı; drift tespiti geceleri elle değişikliği yakalar |
| Sahipsiz tedarikçi kaynağı = marj sızıntısı | `provider_inventory` eşleme raporu, eşlenmemiş kaynak 7 gün sonra ops olayı |
| Yanlış ikametgâh (sözleşme ihlali) | Politika motoru kodda + e2e testi; ikametgâh değişimi yüksek risk onayı |
| Ücretsiz deneme sızması | Deneme makinesi otomatik suspend/destroy, kart yok ama e-posta + telefon doğrulama, kiracı başına tek deneme |
| Alarm gürültüsü küçük ekibi yorar | Alertmanager gruplama/inhibit + olay kuralı eşiği + haftalık gürültü raporu (KPI) |
| Blueprint sürüm kaosu | Semver + değişmez yayım + `upgrade` run'ı + `degisiklik-gunlugu.md` zorunlu; 10+ uygulamada CI blueprint lint |
| Fatura mutabakatı | Core para toplamaz (D17); `usage_records.pushed_at` + billing webhook aynası; aylık mutabakat raporu |
| Anahtar kişi bağımlılığı | Runbook'lar repo'da, otomatik olanlar butonda; `CLAUDE.md` + plan + kararlar AI oturumunun devamlılığını taşır |

---

# 17. Açılış Kontrol Listesi

**Geliştirme:** `git clone` → `cp infra/.env.example infra/.env` → `docker compose -f infra/compose.dev.yml up -d` → `exec api pnpm db:migrate && pnpm db:seed` → 4 host + Keycloak açılır. Zincir README'de; kırıksa K0 bitmemiştir.

**Lansman (K3 sonu) öncesi:**
- [ ] Domain `veritut.com` (+ `.com.tr`), DNS, Cloudflare wildcard `*.uygulama.veritut.com`
- [ ] `deploy.sh` 3 kez sorunsuz + rollback provası (prod-sim konteyneri, Klasman deseni)
- [ ] Status sayfası **farklı tedarikçide** ayakta; ana yığın kapatılıp status'un yaşadığı test edildi
- [ ] VERITUT'un kendi DB'si için restic offsite + restore tatbikatı yapıldı ve kanıt zincirinde
- [ ] Kiracı izolasyon e2e + fail-closed testleri CI'da zorunlu ve yeşil
- [ ] Runner sunucusu: gelen port yok, `runner.key` 600, rotasyon runbook'u denendi
- [ ] Keycloak ops realm MFA zorunlu; break-glass hesabı test edildi ve kanıt düştü
- [ ] FOSSBilling canlı + PayTR canlı callback testi; deneme → suspend → destroy akışı test
- [ ] Hukuk: SLA, hizmet şartları, DPA, alt işleyen listesi şablonu, KVKK aydınlatma onaylı (stratejik Faz 0 çıktısı)
- [ ] Hetzner ≥2 hesap, AWS/GCP ortaklık başvuruları açık (K5 driver'ları için)
- [ ] Sentry + Umami + Alertmanager → nöbetçi telefonu; ilk nöbet rotası girildi
- [ ] Search Console + sitemap; ilk 15 ürün landing'i + 10 karşılaştırma sayfası yayında
- [ ] Pilot: mevcut Verisay müşterilerinin %100'ü panelde (K1), 3 yeni müşteri self-servis sipariş verdi

---

# 18. Çalışma Sözleşmesi (kodlamayı yürüten oturum için)

**Başlangıç ritüeli:** bu planı + `veritut/CLAUDE.md` + `docs/kararlar.md` oku → `git status` → kabul ölçütlerinden geriye giderek hangi K fazında kalındığını bul → sıradaki görevden devam et; tamamlanmış görevi yeniden açma.

**Yürütme:** D1-D26 ve §4 şeması tartışmaya kapalı ("daha iyi olurdu" → `docs/kararlar.md`'ye öneri). Görev sırası bozulmaz; faz kabul komutları koşmadan faz kapanmaz. Yeni dosya açmadan önce grep. UI Türkçe, sentence case, emoji yok, abartı yok. Commit/push yalnız kullanıcı isteyince; Conventional Commits; yalnız kendi dosyaların (`git add <açık path>`). Hata olduğu gibi raporlanır.

**Boşluk protokolü:** planın cevaplamadığı mikro karar → en yakın Klasman/KD deseni uygulanır, `docs/kararlar.md`'ye tek satır (`tarih · karar · gerekçe · dosya`), kullanıcı bloklanmaz. **Plan revizyonu gerektiren (kullanıcıya sorulur):** yeni bağımlılık, şema değişikliği (kolon dahil), yeni app/route grubu, yeni kanıt olay türü, politika kuralı değişikliği, tedarikçi/adaptör ekleme.

**Doğrulama:** her görev sonunda `pnpm check` + dokunulan ekranın iki temada elle kontrolü + akışın uçtan uca denenmesi; faz sonunda kabul ölçütleri + `smoke-kN.mjs` raporu.

**Prod güvenliği:** AI prod'a yalnız açık istekle ve runbook'la dokunur; tedarikçi hesabı/sır değeri sohbete yazılmaz; `destroy` içeren hiçbir komut onaysız koşmaz.

---

# Ek A — Tech Stack Kıyas: VERITUT × Klasman × Kayda Değer

| Katman | **VERITUT (plan)** | **Klasman** | **Kayda Değer** |
|---|---|---|---|
| Runtime | Node ≥22 · TS 5.7 strict · ESM · `any` yasak | aynı | aynı |
| Monorepo | pnpm 10 + Turborepo · **6 app** (api, worker, **runner**, portal, ops, status) + 4 paket + `infra/blueprints` | 4 app + worker + 4 paket | 4 app + 4 paket |
| Backend | Express 5 | Express 5 | Express 5 |
| Frontend | SvelteKit 2 + Svelte 5 + Tailwind 4 (düzen) + adapter-node | aynı | aynı |
| Veri | PG 16 + yalnız Drizzle; **ikinci DB `veritut_tfstate`** (yalnız runner) | PG 16 + Drizzle | PG 16 + Drizzle |
| Kuyruk | Redis 7 + BullMQ; **iki tüketici** (worker + runner) | Redis + BullMQ worker | **yok** (D5) |
| Kimlik | **Keycloak OIDC**, iki realm, opak oturum; parola saklanmaz | Kendi auth (refresh rotasyonu, `auth_sessions`) | Kendi auth (`crypto.scrypt`), iki kimlik ayrı tablo |
| Tenancy | shared schema + `resolveTenant` + fail-closed + 404 + `parent_tenant_id` gün 1 | `resolveActiveOrganization` fail-closed | `organizationId` oturumdan, 404 |
| Durum makineleri | 8 makine `packages/types/machines` | var | var |
| Provider factory | 7 arayüz (provider/billing/ticket/mail/sms/storage/alert) | 4 | — |
| IaC | **OpenTofu + Ansible + Restic, repo'da sürümlü blueprint** | — | — |
| Sır | **X25519 asimetrik zarf; API açamaz** | AES-GCM simetrik (MK deseni) | — |
| Kanıt/denetim | **hash zincirli append-only defter + aylık çapa + DB trigger** | audit log | `revisions` snapshot + gerekçe |
| Gözlem | Prometheus + Alertmanager + Grafana (satın) + kendi probe + status app ayrı tedarikçi | Sentry + pino + Umami | pino |
| PDF | pdfkit (Chromium yok) | Chromium ertelendi | — |
| Ödeme | Core toplamaz; FOSSBilling → Entranet adaptörü (PayTR omurgada) | PayTR factory | — |
| Deploy | **systemd sertleştirilmiş + pull-based deploy.sh** (KD) + runner ayrı sunucu | PM2 + rsync deploy.sh | systemd + pull-based |
| Dev | Docker filo compose + Keycloak + MinIO + gözlem profili | compose + MinIO | compose |
| Test | Vitest + Playwright izolasyon + **gece gerçek Hetzner entegrasyonu (bütçeli)** | Vitest + smoke paketleri | smoke |
| SEO/PLG | csr=false landing + programatik ürün/karşılaştırma + araçlar + public API | csr=false + programatik + araçlar | JSON-LD ClaimReview |

**Okuma anahtarı:** Omurga Klasman (kuyruk, factory, fail-closed tenancy, form derleyici, SEO), disiplin KD (kapalı bağımlılık, iki kimlik ayrımı, 404, systemd + pull-based deploy, mikro karar kaydı). VERITUT'a özgü eklemeler yalnız üç: **runner izolasyonu + asimetrik sır**, **IaC blueprint sistemi**, **Kanıt Defteri + SLA motoru** — üçü de ürünün "sorumluluğun kanıtlanabilir devri" iddiasından türer.

# Ek B — İzinli Bağımlılık Listesi (kapalı, D26)

- **api:** `express` 5, `helmet`, `cors`, `cookie-parser`, `compression`, `drizzle-orm`, `pg`, `zod`, `pino`, `pino-http`, `ioredis`, `bullmq`, `openid-client`, `jose`, `ws`, `node-cron`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `pdfkit`, `yaml`.
- **worker:** `bullmq`, `ioredis`, `pino`, `pdfkit`, `@aws-sdk/client-s3`, `zod`, `yaml`.
- **runner:** `bullmq`, `ioredis`, `pino`, `zod`, `yaml`, `execa`; tedarikçi SDK'ları yalnız envanter/maliyet için: `@aws-sdk/client-cost-explorer`, `@aws-sdk/client-s3` (CUR), `@google-cloud/bigquery` (K5'te eklenir; Hetzner/Cloudflare **fetch** ile, SDK yok). İmajda: `opentofu`, `ansible`, `restic`, `openssh-client`, `git`.
- **frontend (portal, ops, status):** `@sveltejs/kit`, `svelte`, `vite`, `@sveltejs/adapter-node`, `tailwindcss` + `@tailwindcss/vite`, `@fontsource-variable/manrope`, `@fontsource-variable/jetbrains-mono`, `marked` (yalnız portal `(public)` içerik).
- **dev/test:** `typescript`, `svelte-check`, `tsx`, `tsup`, `turbo`, `eslint` + `typescript-eslint`, `prettier` + `prettier-plugin-svelte`, `vitest`, `supertest`, `@playwright/test`.
- **Eklenmez:** `bcrypt`, `jsonwebtoken`, `passport`, `prisma`, `typeorm`, `axios`, `moment`, ikon paketleri, UI kit'leri, `puppeteer/playwright` runtime'da (yalnız test).

# Ek C — Stratejik Plandan Bilinçli Sapmalar

| # | Stratejik plan | Bu plan | Gerekçe |
|---|---|---|---|
| 1 | "Müşteri Paneli (Entranet tabanlı)" | Panel VERITUT'un kendi SvelteKit uygulaması; Entranet yalnız faturalama omurgası adaptörü (K6) | Panel = ürünün kendisi (kanıt, sağlık kartı, provizyon). Faturalama yazılımlarının UI'ı bunları veremez; stratejik §5.1 madde 1 zaten "hazır faturalama ile başla" der |
| 2 | Prometheus + Grafana + **Uptime Kuma** | Uptime Kuma iç bağımlılık değil (worker probe); Uptime Kuma Katman 3'te **satılan** ürün | Status sayfası izleme yığınından bağımsız olmalı; 200 satır probe vs. ayrı servis bağımlılığı |
| 3 | Terraform | **OpenTofu** | BSL lisans belirsizliği (yönetilen servis sağlayıcı), yerleşik state şifreleme, MPL |
| 4 | Keycloak **veya** Authentik | Keycloak | Realm-per-tenant olgunluğu; katalogda satılan ürünle aynı (dogfood); Ansible rolleri hazır |
| 5 | Bastion + MFA + oturum kaydı | K1-K3 bastion + `tlog`; **K4 Teleport CE** | Oturum kaydı + RBAC + denetim dışa aktarımı yazmak yerine satın alınır; ISO 27001 için hazır kanıt |
| 6 | Yedek: Restic/Borg | Restic (tek) | Tek araç, tek runbook, S3 uyumlu her hedef |
| 7 | (belirtilmemiş) | Katman 1 (alan adı/paylaşımlı hosting) Core'da **otomasyonlanmaz**; FOSSBilling modülleriyle satılır, K6'da `IDomainRegistrar` | Stratejik §3 Katman 1 "kâr değil kapı"; mühendislik marjın olduğu Katman 2-4'e |

---

*Bu plan stratejik planın (v1.0) Bölüm 10 kararları verilince v1.1'e çekilir: fiyat tablosu `price_list` seed'ine, 12 aylık gelir modeli `kpi_snapshots` hedef satırlarına, ekip planı nöbet rotasına dönüşür. Uygulama sırasında sapmalar `veritut/docs/kararlar.md` ve TKD ile kaydedilir.*
