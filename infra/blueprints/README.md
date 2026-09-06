# Blueprint'ler (plan §3.4, D10)

`<slug>/<semver>/blueprint.yaml` + `tofu/` + `ansible/` + `checks/` + `docs/`. Yazım kuralları: `docs/blueprint-yazim.md`.
Ortak Ansible rolleri `_roles/` (docker-host · restic-backup · keycloak-oidc-client · app-compose) — uygulama blueprint'leri bunların üstüne biner.

| Blueprint | Katman | Tedarikçi | Not |
| --- | --- | --- | --- |
| mock-vps | 2 | mock | Gerçek kaynak yok; boru hattı testi (terraform_data, local Ansible). Smoke K2 bunu kullanır |
| managed-vps | 2 | hetzner | Sertleştirilmiş Docker host + restic + Cloudflare DNS |
| n8n · nextcloud · zammad | 3 | hetzner | managed-vps + compose stack + Caddy TLS + Keycloak OIDC |

Gerçek blueprint'ler `tofu validate` ile CI'da, `apply` ile gece Hetzner testinde (`HCLOUD_TOKEN`, bütçe korumalı) doğrulanır.
