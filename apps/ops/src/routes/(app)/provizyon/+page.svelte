<script lang="ts">
  import { enhance } from '$app/forms';
  import { Card, Button, ResidencyBadge } from '@veritut/ui';
  let { data, form } = $props();
  const bp = $derived(data.selected);
  let provider = $state(data.accounts[0]?.providerCode ?? '');
  const accountsFor = $derived(data.accounts.filter((a) => bp?.providers.includes(a.providerCode as never)));
  const regions = $derived(bp ? (bp.regions[provider as never] ?? []) : []);
  const details = $derived((form?.details ?? null) as Record<string, string[]> | Array<{ policy: string; code: string }> | null);
  const fieldErr = (k: string) => (details && !Array.isArray(details) ? details[k]?.[0] : undefined);
</script>

<h1 class="vt-h1" style="margin-bottom:6px">Provizyon</h1>
<p class="vt-lead" style="margin:0 0 20px">Blueprint seç → girdiler → plan → (yüksek riskte dört-göz) → apply → Ansible → doğrulama → teslim. Her adım kanıtlı.</p>
<div style="display:grid; grid-template-columns:280px 1fr; gap:14px; align-items:start">
  <Card title="Blueprint" padded={false}>
    <ul style="list-style:none; margin:0; padding:6px">
      {#each data.blueprints as b (b.slug + b.version)}
        <li><a href="/provizyon?bp={b.slug}@{b.version}" class="vt-nav" style="display:block; padding:10px 12px; border-radius:10px; color:inherit; background:{bp?.slug === b.slug && bp?.version === b.version ? 'var(--surface-2)' : 'transparent'}">
          <span style="font-weight:800">{b.title_tr}</span> <span class="mono muted" style="font-size:11px">{b.slug}@{b.version}</span>
          <p class="vt-help" style="margin:2px 0 0">{b.summary_tr}</p>
          <p class="vt-help" style="margin:4px 0 0">katman {b.layer} · {b.providers.join(', ')} · {b.residencies.join('/')}</p>
        </a></li>
      {/each}
    </ul>
  </Card>
  {#if bp}
    <Card title={bp.title_tr} subtitle="{bp.slug}@{bp.version} · ürün {bp.product_slug}">
      <form method="POST" action="?/provision" use:enhance style="display:grid; gap:14px">
        <input type="hidden" name="bp" value="{bp.slug}@{bp.version}" />
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
          <div><label class="vt-label" for="tenantId">Kiracı</label><select class="vt-input" id="tenantId" name="tenantId" required>{#each data.tenants as t (t.id)}<option value={t.id}>{t.name}</option>{/each}</select></div>
          <div><label class="vt-label" for="residency">İkametgâh</label><select class="vt-input" id="residency" name="residency">{#each bp.residencies as r (r)}<option value={r}>{r}</option>{/each}</select></div>
          <div><label class="vt-label" for="slug">Kısa ad</label><input class="vt-input mono" id="slug" name="slug" required value={form?.values?.slug ?? ''} aria-invalid={fieldErr('slug') ? 'true' : undefined} /></div>
          <div><label class="vt-label" for="name">Ad</label><input class="vt-input" id="name" name="name" required value={form?.values?.name ?? ''} /></div>
          <div><label class="vt-label" for="providerAccountId">Tedarikçi hesabı</label><select class="vt-input" id="providerAccountId" name="providerAccountId" required onchange={(e) => (provider = data.accounts.find((a) => a.id === e.currentTarget.value)?.providerCode ?? '')}>{#each accountsFor as a (a.id)}<option value={a.id}>{a.providerCode}/{a.label}</option>{/each}</select>{#if accountsFor.length === 0}<p class="vt-field-error">Bu blueprint için kimlik bilgili tedarikçi hesabı yok.</p>{/if}</div>
          <div><label class="vt-label" for="region">Bölge</label>{#if regions.length}<select class="vt-input" id="region" name="region">{#each regions as r (r)}<option value={r}>{r}</option>{/each}</select>{:else}<input class="vt-input mono" id="region" name="region" required />{/if}</div>
          <div><label class="vt-label" for="size">Boyut</label><select class="vt-input" id="size" name="size">{#each bp.sizes as s (s.code)}<option value={s.code}>{s.title_tr}{s.price_hint_eur ? ` · ~${s.price_hint_eur} €/ay` : ''}</option>{/each}</select></div>
          <div><label class="vt-label" for="slaTier">SLA</label><select class="vt-input" id="slaTier" name="slaTier">{#each bp.sla_tiers as t (t)}<option value={t}>{t}</option>{/each}</select></div>
        </div>
        <div style="border-top:1px solid var(--border); padding-top:14px">
          <p class="vt-kicker" style="margin:0 0 10px">Blueprint girdileri</p>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
            {#each Object.entries(bp.inputs.properties) as [k, f] (k)}
              <div style={f.type === 'string' && (f.minLength ?? 0) >= 40 ? 'grid-column:1/-1' : ''}>
                <label class="vt-label" for="in-{k}">{f.title_tr}{bp.inputs.required.includes(k) ? '' : ' (isteğe bağlı)'}{f.secret ? ' 🔒' : ''}</label>
                {#if f.type === 'boolean'}
                  <label style="display:flex; gap:8px; align-items:center; font-size:13.5px; height:38px"><input type="checkbox" id="in-{k}" name="in.{k}" value="true" checked={f.default === true} /> evet</label>
                {:else if f.enum}
                  <select class="vt-input" id="in-{k}" name="in.{k}">{#each f.enum as v, i (v)}<option value={v} selected={f.default === v}>{f.enum_labels_tr?.[i] ?? v}</option>{/each}</select>
                {:else if f.type === 'string' && (f.minLength ?? 0) >= 40}
                  <textarea class="vt-input mono" id="in-{k}" name="in.{k}" rows="3" style="height:auto; padding:8px 12px" required={bp.inputs.required.includes(k)}>{form?.values?.[`in.${k}`] ?? f.default ?? ''}</textarea>
                {:else}
                  <input class="vt-input {f.format === 'slug' || f.format === 'hostname' ? 'mono' : ''}" id="in-{k}" name="in.{k}" type={f.secret ? 'password' : f.type === 'string' ? 'text' : 'number'} value={f.secret ? '' : (form?.values?.[`in.${k}`] ?? f.default ?? '')} required={bp.inputs.required.includes(k)} min={f.minimum} max={f.maximum} aria-invalid={fieldErr(k) ? 'true' : undefined} />
                {/if}
                {#if f.help_tr}<p class="vt-help" style="margin:4px 0 0">{f.help_tr}</p>{/if}
                {#if fieldErr(k)}<p class="vt-field-error">{fieldErr(k)}</p>{/if}
              </div>
            {/each}
          </div>
        </div>
        {#if form?.message}<div class="vt-status" data-state="down">{form.message}{#if Array.isArray(details)} — {details.map((d) => `${d.policy}:${d.code}`).join(', ')}{/if}</div>{/if}
        <div style="display:flex; justify-content:space-between; align-items:center">
          <span class="vt-help">Yedek: {bp.backup_policy ? `${bp.backup_policy.schedule} · uygun depo çifti varsa otomatik` : 'yok'} · SSO: {bp.sso.oidc ? 'Keycloak OIDC' : '—'} · checks: {bp.checks.map((c) => c.name).join(', ')}</span>
          <Button type="submit" disabled={accountsFor.length === 0}>Kur</Button>
        </div>
      </form>
    </Card>
  {/if}
</div>
