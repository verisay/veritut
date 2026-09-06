# Blueprint yazım kılavuzu (bağlayıcı — K2)

Konum: `infra/blueprints/<slug>/<semver>/`. Semver zorunlu; **yayımlanmış sürüm değişmez**, yeni sürüm açılır; iş yükü `blueprint_slug@blueprint_version`'a bağlanır. Katalog API başlangıcında yüklenir (`POST /ops/blueprints/reload` ile yenilenir); geçersiz manifest katalogda görünmez ve loglanır.

## blueprint.yaml
| Alan | Zorunlu | Not |
| --- | --- | --- |
| `slug`, `version`, `layer` (1-4), `title_tr`, `summary_tr`, `product_slug` | evet | dizin adıyla eşleşmeli |
| `residencies`, `providers`, `regions{provider: [bölge]}` | evet | bölge → ikametgâh eşlemesi `provisioning.service` (K5'te driver'dan) |
| `sizes[]` `{code, title_tr, vars, price_hint_eur?}` | ≥1 | `vars` tofu değişkenleri (server_type, volume_gb, …) |
| `inputs.properties{ad: alan}`, `inputs.required[]` | — | alan: `type` string/number/integer/boolean · `title_tr` · `help_tr` · `default` · `enum` (+`enum_labels_tr`) · `minimum/maximum` · `minLength/maxLength` · `pattern` · `format` slug/hostname/email/url · `secret` (mühürlü, `TF_VAR_<ad>` ve `VT_SECRET_<AD>` env) · `ops_only` |
| `backup_policy {schedule, retention, paths}` \| null | — | uygun depo çifti varsa kurulumda otomatik politika |
| `checks[]` `{name, kind http/tcp/script, target, expect?, timeout_s?}` | — | `target` içinde `{{ outputs.<ad> }}`; script `checks/<dosya>.mjs`, `OUTPUTS_JSON` env, exit 0 = ok |
| `sso {oidc, redirect_path}`, `metrics[]`, `ports[]`, `playbook`, `apply_timeout_min` | — | |

## tofu/
- `backend "pg" {}` boş blok zorunlu (runner `-backend-config` ile `conn_str` + `schema_name=w_<uuid>` verir). State şifreli (runner env).
- Her değişken **yalnız** şu kaynaklardan gelir: inputs · `sizes[].vars` · `region` `size` `residency` `tenant_slug` `workload_slug` `workload_id` · sır girdileri (`TF_VAR_`) · `runner_ssh_public_key`. Başka değişken tanımlama.
- `file()` ile runner dosyası okuma YASAK (validate düşer). SSH için `var.runner_ssh_public_key`.
- Standart çıktılar: `host`/`ipv4` (Ansible envanteri; yoksa local), `url` (→ endpoint + probe), `probe_url`, `endpoints[]{label,url}`, `access{}` (sensitive; API mühürler), diğerleri portalda görünür (pass/secret/token/key içeren adlar süzülür).
- Her kaynağa `managed_by = "veritut"`, `veritut_workload`, `veritut_tenant`, `veritut_residency` etiketi (envanter eşlemesi + gece temizlik).

## ansible/
- `site.yml` (veya `playbook`), `hosts: target`. Envanter runner yazar (`host` çıktısı; local ise `ansible_connection=local`).
- Ortak roller `ANSIBLE_ROLES_PATH=infra/blueprints/_roles`: `docker-host` (sertleştirme, Docker, ufw, fail2ban, node_exporter, unattended-upgrades), `restic-backup` (cron + sonuç raporu → kanıt), `keycloak-oidc-client` (`oidc_client_id/secret/issuer` fact'leri), `app-compose`.
- Ek değişkenler `extra.json`: inputs + sizeVars + `outputs` + kimlikler. Sırlar YALNIZ env (`VT_SECRET_*`, `VT_RESTIC_*`, `VT_KC_*`) — extra.json'a yazılmaz; sır kullanan task `no_log: true`.
- Ansible çıktısı: `WORK_DIR/<workload_id>/ansible-outputs.json` → `outputs`'a eklenir (ör. `oidc_client_id`).

## checks/ ve docs/
`runbook.md`, `musteri-notu.md`, `degisiklik-gunlugu.md` zorunlu. Checks'ten biri düşerse iş yükü `degraded`, müşteriye teslim edilmez.

## Doğrulama
`tofu init -backend=false && tofu validate` + `ansible-playbook --syntax-check` CI'da (her blueprint); `apply` gece Hetzner işinde (`veritut_test=1` etiketi, bütçe korumalı `tools/hetzner-budget-guard.mjs`). mock-vps ile `smoke-k2.mjs` boru hattını uçtan uca kanıtlar.
