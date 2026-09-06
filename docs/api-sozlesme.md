# VERITUT API sözleşmesi — v0 (K0)

Bağlayıcı uç sözleşmesi (D19). Taban: `/api/v1`. Hata gövdesi: `{ code, message, details? }` — mesaj Türkçe.
Kimlik: opak çerez (`vt_portal` | `vt_ops`), API anahtarı (`Authorization: Bearer vt_…`, K3). Kiracı bağlamı: `X-Tenant-Id` (UUID).
Kapsam dışı kaynak **404**. Haritasız segment **403** (fail-closed).

## Sağlık
| Uç | Kimlik | Dönüş |
| --- | --- | --- |
| `GET /health` | — | `HealthDto { status, db, redis, queues, ts }` · 200/503 |

## Kimlik (`/auth`)
| Uç | Açıklama |
| --- | --- |
| `GET /auth/login?realm=musteri\|ops&next=/…` | Keycloak'a 302 (PKCE + state Redis'te 10 dk) |
| `GET /auth/callback?code&state` | Token değişimi (iç ağ), ID token doğrulama, yerel yansıma, opak çerez, `next`'e 302 |
| `GET /auth/me` | `MeDto` — hangi çerez varsa o realm |
| `GET /auth/logout?realm=` | Oturum iptali + çerez temizleme + Keycloak end-session'a 302 |

## Kiracı (`/tenants`, `vt_portal`)
| Uç | Açıklama |
| --- | --- |
| `GET /tenants/mine` | Üyeliklerim `[ {id, slug, name, role} ]` |
| `POST /tenants` | `createTenantSchema` → 201 tenant; oluşturan `owner` |
| `GET /tenants/current` | `X-Tenant-Id` → kiracı + `myRole` |
| `GET /tenants/current/members` | Üyeler |

## Kanıt (`/evidence`)
| Uç | Kimlik | Açıklama |
| --- | --- | --- |
| `GET /evidence/public/verify?tenant=<slug>\|platform` | — | `{ ok, checked, brokenAt, lastHash }` — içerik dönmez |
| `GET /evidence?limit&kind` | `vt_portal` + `X-Tenant-Id` | Olaylar (yeniden eskiye) |
| `GET /evidence/verify` | `vt_portal` + `X-Tenant-Id` | Zincir doğrulama |

## İş yükleri (`/workloads`, `vt_portal` + `X-Tenant-Id`)
| Uç | Açıklama |
| --- | --- |
| `GET /workloads` | `WorkloadHealthCard[]` (30 g uptime çubukları, son yedek, maliyet, açık erişim oturumu) |
| `GET /workloads/:id` | detay: iş yükü (access_sealed HARİÇ), yedekler, erişim oturumları, gelir, eşlenen kaynaklar — kapsam dışı 404 |

## Ben (`/me`, `vt_portal`)
| Uç | Açıklama |
| --- | --- |
| `GET /me/notifications` · `POST /me/notifications/:id/read` | in-app bildirimler |
| `POST /me/invitations/accept {token}` | davet kabulü — token e-postası oturum e-postasıyla eşleşmeli (403), tek kullanım (404) |

## Kiracı ek (`/tenants/current/*`)
`GET/POST invitations` (admin+) · `PATCH members/:userId {role}` (owner) · `DELETE members/:userId` (owner; son sahip çıkarılamaz)

## Katalog (`/catalog`, KİMLİKSİZ, 240 istek/dk)
| Uç | Açıklama |
| --- | --- |
| `GET /catalog` | Yayımlanmış ürünler + planlar + SLA katmanları |
| `GET /catalog/products/:slug` | Ürün + boyut/bölge/ikametgâh + girdi şeması (ops-only alanlar hariç) + fiyat matrisi |
| `GET /catalog/quote?product&size&residency&plan&sla&trial` | Fiyat teklifi (422 `PRICE_NOT_FOUND`) |

## Sipariş (`/orders`, `vt_portal` + `X-Tenant-Id`)
| Uç | Açıklama |
| --- | --- |
| `GET /orders` · `GET /orders/:id` | Kiracının siparişleri (kapsam dışı 404) |
| `POST /orders/quote` | Teklif |
| `POST /orders` (admin+, 20/saat fail-closed) | `createOrderSchema` + blueprint girdileri. 422 sözleşme onayı/girdi, 403 `SLA_NOT_IN_PLAN`/`QUOTA_EXCEEDED`, 422 `TRIAL_ALREADY_USED`/`PRODUCT_INACTIVE`. Başarıda sipariş → provizyon → abonelik → fatura |

## Mali (`/billing`, `vt_portal` + `X-Tenant-Id`)
`GET invoices` (mali+) · `GET subscriptions` · `GET usage?period` (mali+) · `GET plan` (etkin plan + özellikler) · `POST mock-pay` (yalnız development + mock omurga)

## Destek (`/support`) · API anahtarları (`/api-keys`, admin+)
`GET/POST support` · `GET support/:id` · `POST support/:id/reply` (30/saat) — `GET/POST/DELETE api-keys` (10/saat; ham anahtar yalnız üretimde döner)

## Public API (`/ext`, `Authorization: Bearer vt_…`, 120 istek/dk)
`GET openapi.json` (kimliksiz) · `GET whoami` · `GET workloads` · `GET workloads/:id` · `GET evidence` · `GET evidence/verify` · `GET orders` · `GET orders/:id` · `POST orders`.
Kapsamlar: `workloads:read` `evidence:read` `orders:read` `orders:write` `status:read` — eksik kapsam 403 `SCOPE_MISSING`. Kiracı bağlamı anahtardan gelir.

## Webhook (`/webhooks`, HMAC — `express.json`'dan ÖNCE mount)
`POST /webhooks/billing` · `POST /webhooks/tickets` — `x-veritut-signature` (sha256 HMAC, ham gövde). İmza geçersiz → 401 ve `webhook_inbox`'a kayıt. Sağlayıcı gövdesi adaptörde kanonik şemaya çevrilir.

## Operasyon (`/ops`, `vt_ops`)
| Uç | Rol | Açıklama |
| --- | --- | --- |
| `GET /ops/overview` | operator | kiracı sayısı, bileşenler, kuyruk sayaçları, son çalıştırmalar |
| `GET /ops/tenants` | operator | tüm kiracılar |
| `GET /ops/runs` · `GET /ops/runs/:id` | operator | liste · detay + adımlar + log (Redis stream) |
| `POST /ops/runs/echo` | operator | K0 demo çalıştırması → 201 run |
| `POST /ops/tenants` | platform_admin | kiracı oluştur |
| `GET /ops/tenants/:id` | operator | kiracı 360 |
| `GET/POST /ops/provider-accounts` · `GET /:id` · `POST /:id/sync` | operator / **senior (POST)** | kimlik bilgisi mühürlenir, asla dönmez; sync → `provider-sync` run |
| `GET /ops/inventory?sahipsiz=1&account=` · `POST /:id/match` · `POST /:id/create-workload` | operator | envanter, eşleme |
| `GET/POST /ops/workloads` · `GET/PATCH /:id` · `POST /import-csv` (senior) | operator | kayıt defteri |
| `PUT /ops/workloads/:id/revenue` · `PUT /:id/backup-policy` (422 POLICY_VIOLATION) · `POST /:id/backup` | operator | gelir, yedek politikası, elle yedek |
| `GET /ops/margin?period=` · `POST /ops/cost/invoice-csv` (senior) · `PUT /ops/fx` (senior) | operator | marj raporu |
| `GET/POST /ops/backup-repos` (POST senior) · `GET /ops/backup-jobs` | operator | depolar / işler |
| `GET /ops/notifications` · `POST /:id/read` | operator | bildirimler |
| `GET /ops/blueprints` · `POST /ops/blueprints/reload` (platform_admin) | operator | katalog (manifestler, sır değeri yok) |
| `POST /ops/workloads/provision` | operator | `provisionRequestSchema` + blueprint inputs (422 alan hataları / POLICY_VIOLATION) → 201 `{workload, run}` |
| `POST /ops/workloads/:id/resize {size}` | operator | 409 aktif değilse; run medium/high (plan diff) |
| `POST /ops/workloads/:id/destroy` | senior | 422 BACKUP_REQUIRED yedek kanıtı yoksa; run high |
| `POST /ops/runs/:id/approve` | senior, ≠ talep eden (403) | `awaiting_approval → running` |
| `POST /ops/runs/:id/reject {reason}` | senior | `→ cancelled`; iş yükü eski hâline |
| `GET /ops/changes` | operator | değişiklik kaydı |
| `GET /ops/catalog` · `PUT /catalog/{products,plans,sla-tiers,prices}` (platform_admin) · `POST /catalog/products/:slug/publish` | operator | katalog yönetimi |
| `GET /ops/orders` · `POST /ops/orders/:id/reject` (senior) | operator | sipariş kuyruğu |
| `GET/PUT/DELETE /ops/tenants/:id/entitlement` (PUT/DELETE senior) | operator | plan istisnaları |
| `GET /ops/kpi` · `POST /ops/kpi/compute` · `POST /ops/billing/push` (senior) · `POST /ops/billing/expire-trials` (senior) | operator | KPI ve dönem kapanışı |
| `GET /ops/evidence/platform` | operator | platform zinciri + verdict |
| `POST /ops/evidence/demo` | operator, **yalnız development** | demo kanıt olayı |

## İç uçlar (`/internal`, `X-Internal-Token`)
| Uç | Kaynak | Açıklama |
| --- | --- | --- |
| `POST /internal/runs/:id/steps` | runner | `runStepReportSchema` |
| `POST /internal/runs/:id/finish` | runner | `runFinishSchema` |
| `GET /internal/components` | worker | probe hedefleri |
| `POST /internal/probe-results` | worker | `probeResultsSchema` → snapshot `status:platform` |
| `POST /internal/evidence` | runner/worker | kanıt olayı (tür kapalı sözlükten) |
| `GET /internal/runs/:id/credentials` | runner | mühürlü kimlik bilgisi (API çözmez) |
| `POST /internal/provider-accounts/:id/inventory` | runner | envanter raporu → upsert + gone + tahmini maliyet |
| `POST /internal/backup-result` | runner | backup_jobs + kanıt; 2 ardışık hata → bildirim |
| `POST /internal/access-session` | bastion/teleport | erişim oturumu → kanıt + kiracı bildirimi |
| `GET /internal/runs/:id/state` · `GET /internal/runs/:id/workload-secrets` · `GET /internal/blueprints/:slug/:version` | runner | devam için adımlar; mühürlü girdiler; manifest |
| `POST /internal/runs/:id/plan` → `{status, risk}` · `GET /internal/runs/:id/approval` → `{state}` | runner | plan raporu → risk → onay yoklaması |
| `GET /internal/workloads/:id` · `POST /:id/register` · `POST /:id/handoff` · `POST /:id/destroyed` · `POST /:id/failed` | runner | boru hattı kayıt/teslim |
| `GET /internal/probe-targets` · `POST /internal/probe-results-v2` | worker | platform + kiracı bileşenleri; kiracı snapshot `status:tenant:<slug>` |

## WS
`GET /api/v1/ws/runs/:id` (upgrade, `vt_ops` çerezi) → geçmiş `{type:'log', t, line, level}` + canlı yayın + `{type:'finished', status}`.

## Redis anahtarları
`oidc:state:<state>` (10 dk) · `run:<id>:log` (stream, ~10k) · `run:<id>` (pub/sub) · `status:platform` · `status:tenant:<slug>` · `lock:workload:<id>` (runner, 1 sa, değer = runId)

## Kuyruklar (BullMQ)
runner: `provision` (kinds: echo · backup · provision · resize · destroy · upgrade · drift-plan) · `provider-sync` · `drill` — worker: `probe` (30 sn tekrarlı) · `notify` · `report` · `rollup`. `jobId=run-<uuid>` idempotens (BullMQ özel id'de `:` yasak).
