# Blueprint yazım kılavuzu (taslak — K2'de bağlayıcı olur)

`infra/blueprints/<slug>/<semver>/` — plan §3.4. Semver zorunlu; yayımlanmış sürüm değişmez, yeni sürüm açılır.

```
blueprint.yaml   slug · version · layer · title_tr · summary_tr · inputs (JSON Schema → Zod) · residencies · providers ·
                 sizes (S/M/L → tofu var) · sla_tiers · backup_policy · ports · healthchecks · sso · metrics · price_hint
tofu/            modül (VM + volume + firewall + DNS) — pg backend `veritut_tfstate`, state şifreleme açık (D11)
ansible/         docker-host (ortak, symlink) + uygulama rolü; Keycloak OIDC istemcisi; restic; node_exporter
checks/          post-provision smoke (node script; runner koşar) — biri düşerse `degraded`, teslim edilmez
docs/            runbook.md · musteri-notu.md · degisiklik-gunlugu.md (zorunlu)
```
