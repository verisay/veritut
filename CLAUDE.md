# VERITUT — AI bağlam profili

Applies To: veritut monorepo (tüm app + paketler)
Runtime: **Node.js ≥ 22 + TypeScript 5.7 strict** | DB: **PostgreSQL 16 (yalnız Drizzle)** |
Web: **SvelteKit 2 + Svelte 5 runes** | API: **Express 5** | Kuyruk: **Redis 7 + BullMQ** | Kimlik: **Keycloak (OIDC)**

> **Ana plan:** `ai-plans/VERITUT-Uygulama-Plani.md` — donmuş kararlar (D1–D26), veri modeli (§4),
> kodlama fazları (K0–K6) ve kabul ölçütlerinin tek kaynağı. Strateji: `ai-plans/VERITUT-Stratejik-Plan.md`.
> Çelişkide **plan kazanır**, bu dosya güncellenir. Sapmalar: `docs/kararlar.md`.
> **API sözleşmesi:** `docs/api-sozlesme.md` (bağlayıcı). **Tasarım sistemi:** Claude Design
> "Veritut Design System" v1.0 → `packages/ui/src/lib/tokens.css` (verbatim).

---

# 1. Ürün özeti

Yönetilen çoklu-bulut operatörü / "veri emanetçisi". Satılan şey sunucu değil, **sorumluluğun kanıtlanabilir
devri**. Yazılım üç fiile hizmet eder (plan §0.3): **KUR** (katalog · blueprint · runner · iş yükü kayıt defteri),
**TUT** (yedek · gözlem · olay/SLA · değişiklik + runbook), **KANITLA** (hash zincirli Kanıt Defteri · SLA raporu ·
uyumluluk paketi · otomatik alt işleyen listesi). Bir modül bu üçünden birine hizmet etmiyorsa kapsam dışıdır.

**Dizin yapısı:**

| Yol | İçerik | Dev port |
| --- | --- | --- |
| `apps/api` | Express 5 + Drizzle + ws — REST `/api/v1`, OIDC oturum, `/internal`, WS canlı log | 4400 |
| `apps/worker` | BullMQ: probe · notify · report · rollup. **Tedarikçi sırrı ve DB erişimi YOK** (iç uçlar) | — |
| `apps/runner` | **İzole yürütücü**: provision · provider-sync · drill. X25519 özel anahtarı YALNIZ burada; gelen port yok | — |
| `apps/portal` | SvelteKit — `(public)` pazarlama + `/panel/*` müşteri portalı (aynı host, route grubu) | 5240 |
| `apps/ops` | SvelteKit — operasyon/NOC paneli; personel realm'i; varsayılan koyu tema | 5241 |
| `apps/status` | SvelteKit — **stateless** durum sayfası; yalnız Redis `status:*` okur (ACL kullanıcısı) | 5242 |
| `packages/ui` | tokens.css + components.css + Svelte bileşenleri — tasarım sisteminin TEK kaynağı | |
| `packages/types` | roller · etiketler · kanıt tür sözlüğü · **durum makineleri** (`machines/`) · **politika motoru** (`policy/`) | |
| `packages/validators` | Zod şemaları (api + frontend ORTAK) | |
| `packages/shared` | createApiFetch · WS istemcisi · Türkçe biçimleyiciler · rune store'lar (`*.svelte.ts`) | |
| `infra/blueprints/<slug>/<semver>/` | IaC ürün tanımları: `blueprint.yaml` + `tofu/` + `ansible/` + `checks/` + `docs/`; ortak roller `_roles/`. DB yalnız `slug@version` tutar. Yazım: `docs/blueprint-yazim.md` | |
| `infra/runbooks/` | Çalışma kitapları (markdown) | |

---

# 2. Gün-1 kuralları (pazarlık edilemez — plan §2 D1–D26 özeti)

1. **ORM tek-tip: yalnız Drizzle.** Raw `pg.Pool` servislerde YASAK; ham SQL `db.execute(sql\`…\`)`. İstisna `db/migrate.ts`. `db.ts` pool'u export etmez.
2. **Tedarikçiye dokunan her şey runner'da (D5).** API ve worker tedarikçi API'sine çağrı yapmaz. Runner'ın gelen portu yok, DB kimlik bilgisi yok; Redis + `INTERNAL_TOKEN`'lı `/internal/*`.
3. **Sırlar asimetrik zarfla (D12).** `apps/api/src/lib/seal.ts` yalnız mühürler; çözme fonksiyonu API'de YOKTUR (test kanıtlar). Açma: `apps/runner/src/lib/unseal.ts`. `*_sealed` kolonlar plain loglanmaz.
4. **Kimlik = Keycloak, iki realm (D6).** `veritut-musteri` → `users`/`sessions`/`vt_portal`; `veritut-ops` → `staff`/`staff_sessions`/`vt_ops`. `requireUser` ile `requireStaff` birbirinin yerine KULLANILMAZ. Parola VERITUT'ta saklanmaz; tarayıcıya Keycloak token'ı verilmez.
5. **Tenancy TEK merkezden (D7).** Kiracı-kapsamlı router'lar `resolveTenant` altında (`X-Tenant-Id` UUID regex → üyelik). Kapsam dışı **404** (403 değil). `parent_tenant_id` gün 1 kolonu (bayi hiyerarşisi).
6. **Fail-closed segment haritası.** `apps/api/src/middleware/guardMap.ts` — yeni router = haritaya satır; haritasız segment 403 + startup uyarısı.
7. **Durum geçişleri yalnız makineden (D8).** `packages/types/src/machines/` dışında `status` yazmak yasak; `transition()` fırlatır.
8. **Kanıt Defteri append-only (D13).** `evidence_events` UPDATE/DELETE DB trigger ile reddedilir; yazım yalnız `evidenceService.appendEvidence` (advisory lock + hash zinciri). Olay türleri kapalı sözlük (`evidence-kinds.ts`) — yeni tür = plan revizyonu.
9. **Status app stateless (D14).** Yalnız Redis snapshot; DB/Keycloak/iç token env'i compose'da boşa ezilir.
10. **Politikalar kodda (D25).** İkametgâh, 3-2-1, yoğunlaşma, SLA saati `packages/types/src/policy/` — testleri var, dokümanda değil.
11. **Token TEK kaynak (D20):** `packages/ui/src/lib/tokens.css`. App içinde renk/ölçü yasak. Gradient yalnız `.vt-hero`. Durum renkleri semantik ve sabit (`ok·degraded·down·maintenance·unknown`).
12. **Migration:** `apps/api/src/db/migrations/NNNN_ad.sql` — 4 hane, sıra atlamak yok (runner kontrol eder), idempotent, down yok.
13. **`any` yasak**, `import type`, ESM, `===`. UI Türkçe / kod İngilizce; etiketler `packages/types/src/labels.ts`.
14. **İzinli bağımlılık listesi kapalı** (plan Ek B). Yeni paket = plan revizyonu. `bcrypt`/`jsonwebtoken`/`passport`/`axios` eklenmez.
15. **Webhook router'ları `express.json`'dan ÖNCE** mount edilir (HMAC raw body) — K3.

---

# 3. Tasarım sistemi ve içerik dili (bağlayıcı)

- **His:** emanet, sükûnet, kanıt. Nötr petrol-lacivert aile (`#13223A` mürekkep, `#0B1522` koyu zemin) + tek vurgu (kanıt yeşili `#2CC5A2` / metin `#0E8C70`). Startup neonu yok.
- **Tipografi:** UI Manrope; veri/kimlik/hash/log JetBrains Mono; her sayısal sütunda `tabular-nums` (`.tnum`).
- **Biçim:** köşe 10 (buton/input) / 14 (kart/modal) / 6 (çip) px; geçiş 150 ms; **gölge yok, glow yok, illüstrasyon yok, emoji yok**. İkon Heroicons outline inline SVG.
- **Yoğunluk:** portal ferah; ops veri-yoğun, tablo satırı 36 px, gövde 13 px, **varsayılan koyu** (`data-default-theme="dark"`).
- **Kanıt dili:** hash mono + kopyala (`HashChip`); kırık zincir kırmızı gösterilir, gizlenmez.
- **Dil:** cümle düzeni; 1. çoğul ("yedeği doğruladık", "hata yaptık, düzelttik"); ünlem nadir; "devrim/muhteşem" yasak; belirsizlik gizlenmez ("Doğrulama bekliyor").

---

# 4. Çalıştırma (dev — Docker filo)

```bash
cd /srv/fleet/projects/veritut
cp infra/.env.example infra/.env   # sırları doldur: openssl rand -hex 32 · node tools/gen-runner-keys.mjs
docker compose -f infra/compose.dev.yml up -d --build
docker compose -f infra/compose.dev.yml exec api pnpm db:migrate
docker compose -f infra/compose.dev.yml exec api pnpm db:seed
```

| Yüzey | Dev URL | Not |
| --- | --- | --- |
| Portal (+ pazarlama) | `https://vt-portal.dev-fethi.entra.net` | `/panel` OIDC kapılı |
| Ops | `https://vt-ops.dev-fethi.entra.net` | `/giris` |
| Status | `https://vt-status.dev-fethi.entra.net` | Redis snapshot |
| API | `https://vt-api.dev-fethi.entra.net/api/v1/health` (+ her yüzeyde same-origin `/api/v1`) | |
| Keycloak | `https://vt-kimlik.dev-fethi.entra.net` (admin: `KC_BOOTSTRAP_ADMIN_*`) | realm import `infra/keycloak/realms/` |
| MinIO | `https://vt-s3.dev-fethi.entra.net` | |

- Zincir: nginx(443) → 127.0.0.1:8090 → Traefik → container. Yeni host = `bash /srv/fleet/infra/dev-fethi-fleet-cert-add.sh vt-<ad>`.
- Kaynak bind-mount + HMR — rebuild GEREKMEZ. `package.json` değişince: `docker compose -f infra/compose.dev.yml run --rm api pnpm install`.
- DB: `docker compose -f infra/compose.dev.yml exec postgres psql -U veritut`. Ek DB'ler: `keycloak`, `veritut_tfstate` (yalnız runner rolü).
- Dev kimlikler (realm import): `musteri@veritut.local` / `ops@veritut.local` — parolalar realm JSON'unda, **yalnız dev**; prod realm export'u ayrı ve MFA `CONFIGURE_TOTP` zorunlu.
- Tip kontrolü `pnpm check`, test `pnpm test`, lint `pnpm lint` (container içinden veya Node 22 olan host'ta).

**Prod:** K3 sonunda (plan §13) — systemd sertleştirilmiş birimler + pull-based `deploy.sh`; runner ayrı sunucu; status ayrı tedarikçi. Şimdilik prod YOK.

---

# 5. Git kuralları

- **AI kendiliğinden commit/push YAPMAZ** — yalnız kullanıcı açıkça isteyince.
- Yalnızca kendi dosyalarını stage'le: `git add <açık path>` — `git add -A`/`.`/`-am` YASAK.
- Conventional Commits (`commit-msg` hook): `feat:` `fix:` `chore:` `refactor:` `docs:` `test:` `perf:` `style:`. Gövde Türkçe olabilir.
- Pre-commit hook secret tarar. Kurulum `bash tools/install-hooks.sh`. Bypass yalnız kullanıcı izniyle `SKIP_HOOKS=1`.
- `git stash`, `git reset --hard`, `git clean -fd` — çoklu oturum ortamında yasak.

---

# 6. Tuzaklar

1. **OIDC iç/dış host ayrımı:** tarayıcı `KC_PUBLIC_URL`'e gider, API `KC_INTERNAL_URL`'den token/JWKS çeker; `iss` doğrulaması public issuer ile. `KC_HOSTNAME` public olmalı, yoksa `iss` uyuşmaz (`lib/oidc.ts` uyarır).
2. **API özel anahtarı GÖRMEZ:** compose'da api/worker/portal/ops/status için `RUNNER_PRIVATE_KEY: ''` ile ezilir. Bu satırı kaldırmak D12'yi bozar.
3. **BullMQ bağlantısı `maxRetriesPerRequest: null`** ister; özel `jobId` içinde `:` yasak (`run-<uuid>`); API'de genel Redis ile kuyruk bağlantısı ayrıdır (`redis.ts`). Pub/sub abonesi de ayrı bağlantı.
4. **`.svelte.ts` uzantısı olmadan rune kullanımı compile error**; rune store'lar `@veritut/shared/stores/<ad>.svelte` yolundan import edilir, `index.ts`'ten re-export edilmez.
5. **`ssr.noExternal: [/^@veritut\//]`** her SvelteKit app'te ZORUNLU (workspace paketleri kaynak TS).
6. **SSR fetch İÇ ağdan:** `$lib/server/api.ts` → `API_URL` (http://veritut-api:4400); dış host'a hairpin çalışmaz. Tarayıcı çerezi `cookie` ile elle iletilir.
7. **Traefik ağı filo geneli paylaşımlı — çıplak `api`/`portal` adı BAŞKA projenin container'ına çözülebilir** (ölçüldü: ops `http://api:4400` → CarRentall API). İç URL'lerde her zaman proje-özel alias: `veritut-api`, `veritut-keycloak`, `veritut-portal` (compose `networks.proj.aliases`).
8. **Status app'in Redis kullanıcısı `status`** yalnız `status:*` okur (`infra/redis/users.acl`). Başka anahtar okumaya kalkan kod sessizce `null` görür — bu tasarımdır.
9. **Evidence UPDATE/DELETE trigger'ı** uygulama hatasında bile `RAISE EXCEPTION` atar; "düzeltme" gerekiyorsa yeni olay yazılır, eskisi silinmez.
10. **Migration sırası kesintisiz olmalı** — runner `0001, 0002, …` kontrol eder; atlayan dosya süreci durdurur.
11. **Keycloak `--import-realm` var olan realm'i ATLAR** (`IGNORE_EXISTING`). Realm JSON'u değişince ya `bash tools/kc-realm-reimport.sh <realm>` (dev, realm silinir) ya da kcadm ile noktasal değişiklik. Prod'da realm değişiklikleri kcadm/Terraform provider ile, JSON import'la değil.
12. **`awaiting_approval` yalnız `running`'den** geçilir; yüksek riskli çalıştırma onaylayan ≠ talep eden (dört-göz) — `approveRun` zorlar. `queued → failed` ilk adıma varamayan job için serbest.
13. **Durum geçişi ÖNCE, run SONRA.** `requestResize/requestDestroy` önce `setWorkloadStatus` (409 üretebilir), sonra `createRun` — tersi reddedilen istekte kuyrukta yetim run bırakır (K2 smoke'ta ölçüldü: 38 ms arayla iki resize).
14. **OpenTofu state ŞİFRELİ** (`TF_ENCRYPTION`, runner env). Runner dışından `tofu output` "encrypted state" hatası verir — normaldir; teşhis için runner container'ında aynı env ile koş. `tofu output -json` stdout'tan ayrıştırılır (stderr uyarıları JSON'u bozar).
15. **`hcloud_ssh_key.runner` = `var.runner_ssh_public_key`** — tofu'da `file(~/.ssh/…)` YASAK (validate düşer); runner anahtarını WORK_DIR/.ssh'ta üretir ve TF_VAR ile geçer.
16. **Debian `ansible` paketi eski `community.docker` içerir** (`docker_compose_v2` yok) → runner imajı `ansible-galaxy collection install community.docker` yapar; imaj yeniden build gerekir.
17. **Blueprint `tofu/` her tofu değişkenini `blueprint.yaml`'dan alır:** inputs + `sizes[].vars` + region/size/residency/tenant_slug/workload_slug/workload_id. Destroy/resize payload'ı da `sizeVars` taşımalı, yoksa "No value for required variable".

---

# 7. Yol haritası durumu

- **K0 — İskelet: TAMAM (2026-09-06).** 6 app + 4 paket ayakta; `0001_init.sql` (21 tablo, evidence trigger DB'de kanıtlı); Keycloak iki realm + OIDC oturum (portal/ops uçtan uca); `resolveTenant` + fail-closed harita; runner echo boru hattı (8 adım raporu + Redis stream + WS canlı log); worker probe → `status:platform` snapshot → status app; Redis ACL `status` kullanıcısı. Testler: 19 birim (mühür/hash/politika/makine) + `apps/api/scripts/smoke-k0.mjs` 36 senaryo yeşil; `pnpm check`/`lint` temiz. Ayrıntı: `docs/kararlar.md` (#1–#12).
- **K1 — Envanter, kanıt ve marj: TAMAM (2026-09-06).** `0002` (11 tablo: envanter, maliyet/gelir/kur, yedek depo/politika/iş, erişim oturumu, probe_results, bildirim). Tedarikçi hesapları mühürlü (`IProviderDriver` hetzner + mock, runner `provider-sync`); envanter → sahipsiz kaynak → eşle / iş yükü oluştur; CSV hizmet içe aktarımı (idempotent); **gerçek restic yedek** (runner → MinIO S3) → `backup.completed` kanıtı; yedek politikası 3-2-1 + ikametgâh **kodda 422**; erişim oturumu ingest → `access.session` kanıtı + kiracı bildirimi; marj raporu (tahmin/fatura CSV/direkt, kur, %35 bayrağı); davet akışı (e-posta eşleşmesi, tek kullanım); kiracı status snapshot'ı + portal sağlık kartları (30 g uptime çubukları). Ops UI 10 sayfa, portal 5. Smoke `smoke-k1.mjs` 68 senaryo yeşil (K0 36 ile birlikte 104). Kalan borç: dini bayram takvimi seed'i, bastion `tlog` gerçek ingest'i (K4 Teleport'a bırakıldı), e-posta SMTP adaptörü (K3).
- **K2 — Provizyon motoru: TAMAM (2026-09-06).** `0003` (workload_secrets, changes, drift_reports; runs.plan_summary/approved_by). Blueprint kataloğu repo'dan (`infra/blueprints/<slug>/<semver>/blueprint.yaml`, 5 manifest) + `inputs` JSON Schema → Zod derleyicisi (`packages/validators/blueprint-compiler.ts`) → ops formu otomatik; sır girdileri `workload_secrets`'a mühürlü. Runner boru hattı 8 adım: **gerçek OpenTofu** (pg backend `veritut_tfstate`, istemci tarafı state şifreleme `TF_ENCRYPTION` — D11 kanıtlı) → plan diff → `riskFor()` (destroy/replace → high) → `awaiting_approval` + **dört-göz** (talep eden onaylayamaz, senior şart; reddetme = geri çekme) → apply → Ansible (ortak roller `_roles/`: docker-host, restic-backup, keycloak-oidc-client, app-compose) → checks (http/tcp/script) → register (uç noktalar, erişim bilgisi API'de mühürlenir, izleme hedefleri) → handoff (verify yeşil → active + `workload.provisioned` kanıtı + müşteri bildirimi; kırmızı → degraded, teslim yok). Devamlılık: run_steps'e göre tamamlanmış adımlar atlanır, iş yükü kilidi aynı run'a yeniden verilir (SIGKILL testi geçti). Resize/destroy: durum geçişi ÖNCE, run sonra (yetim run bulgusu); destroy yedek kanıtı ister; ret boyutu/durumu geri alır. Blueprint'ler: mock-vps (uçtan uca testli), managed-vps, n8n, nextcloud, zammad (tofu validate yeşil; apply gece Hetzner işinde). Smoke `smoke-k2.mjs` 47 + `smoke-k2-resume.mjs` 6 (toplam 157). Borç: Hetzner apply'ı gerçek token bekliyor; Keycloak istemci provizyonu runner'da bootstrap admin ile (prod: servis hesabı); drift-plan cron K4.
- **K3 — Ticari katman ve lansman:** sırada (plan §14 K3).
