<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button, Card, PageHead, ResidencyBadge, Table } from '@veritut/ui';
  import { FEATURE_LABEL, type FeatureKey, type Residency } from '@veritut/types';
  let { data, form } = $props();
  let priceProduct = $state(data.products[0]?.slug ?? '');
  const featureRows = ['workloads.max', 'users.max', 'sla.tiers', 'api.keys.max', 'backup.drill.monthly', 'evidence.bundle', 'finops'] as FeatureKey[];
  const show = (v: unknown): string => (v === -1 ? '∞' : v === true ? '✓' : v === false || v === undefined ? '—' : Array.isArray(v) ? v.join(',') : String(v));
  const prices = $derived(data.prices.filter((p) => p.productSlug === priceProduct));
</script>

<PageHead title="Katalog" variant="ops" />
<p class="vt-lead" style="margin:0 0 20px">Ürün = satış birimi, blueprint = teknik tanım. Yayımlanan tek sürüm self-servise açılır.</p>
{#if form?.message}<div class="vt-status" data-state="down" style="margin-bottom:12px">{form.message}</div>{/if}
{#if form?.published}<div class="vt-status" data-state="ok" style="margin-bottom:12px">Sürüm yayımlandı.</div>{/if}

<Card title="Ürünler" padded={false}>
  <Table minWidth={800}>
    {#snippet head()}<th>Ürün</th><th>Katman</th><th>Blueprint</th><th>Yayımlı sürüm</th><th>Durum</th><th>Yayımla</th>{/snippet}
    {#each data.products as p (p.slug)}
      {@const pub = p.versions.find((v) => v.status === 'published')}
      {@const bpVersions = data.blueprints.filter((b) => b.slug === p.blueprintSlug)}
      <tr>
        <td><a href="/urunler/{p.slug}">{p.title}</a> <span class="mono muted" style="font-size:11px">{p.slug}</span></td>
        <td>{p.layer}</td>
        <td class="mono">{p.blueprintSlug ?? '—'}</td>
        <td class="mono">{pub?.blueprintVersion ?? '—'}</td>
        <td>{p.active ? 'aktif' : 'pasif'}</td>
        <td>
          {#if bpVersions.length}
            <form method="POST" action="?/publish" use:enhance style="display:flex; gap:6px; align-items:center">
              <input type="hidden" name="slug" value={p.slug} />
              <select class="vt-input" name="blueprintVersion" style="height:30px; width:auto; font-size:12px">{#each bpVersions as b (b.version)}<option value={b.version} selected={b.version === pub?.blueprintVersion}>{b.version}</option>{/each}</select>
              <Button type="submit" size="sm" variant="secondary">Yayımla</Button>
            </form>
          {/if}
        </td>
      </tr>
    {/each}
  </Table>
</Card>

<div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:14px; align-items:start">
  <Card title="Planlar" padded={false}>
    <div class="vt-table-wrap">
      <table class="vt-table" style="min-width:420px">
        <thead><tr><th>Özellik</th>{#each data.plans as p (p.code)}<th class="num">{p.title}</th>{/each}</tr></thead>
        <tbody>
          {#each featureRows as f (f)}
            <tr><td class="muted">{FEATURE_LABEL[f]}</td>{#each data.plans as p (p.code)}<td class="num">{show(p.features[f])}</td>{/each}</tr>
          {/each}
        </tbody>
      </table>
    </div>
  </Card>
  <Card title="SLA katmanları" padded={false}>
    <Table minWidth={380}>
      {#snippet head()}<th>Katman</th><th>Kapsam</th><th class="num">Yanıt</th><th class="num">Uptime</th><th class="num">Ek</th>{/snippet}
      {#each data.slaTiers as s (s.code)}<tr><td>{s.title}</td><td>{s.coverage}</td><td class="num">{s.responseMin} dk</td><td class="num">%{s.uptimeTarget}</td><td class="num">{s.monthlyUpliftPct > 0 ? `+%${s.monthlyUpliftPct}` : '—'}</td></tr>{/each}
    </Table>
  </Card>
</div>

<div style="margin-top:14px">
  <Card title="Fiyat listesi" padded={false}>
    <div style="padding:12px 22px; display:flex; gap:10px; align-items:end; border-bottom:1px solid var(--border); flex-wrap:wrap">
      <div><label class="vt-label" for="pp">Ürün</label><select class="vt-input" id="pp" bind:value={priceProduct} style="width:auto">{#each data.products as p (p.slug)}<option value={p.slug}>{p.title}</option>{/each}</select></div>
      <form method="POST" action="?/price" use:enhance style="display:flex; gap:8px; align-items:end; flex-wrap:wrap">
        <input type="hidden" name="productSlug" value={priceProduct} />
        <div><label class="vt-label" for="size">Boyut</label><input class="vt-input mono" id="size" name="size" required style="width:80px" /></div>
        <div><label class="vt-label" for="res">İkametgâh</label><select class="vt-input" id="res" name="residency" style="width:auto"><option>TR</option><option>EU</option><option>US</option></select></div>
        <div><label class="vt-label" for="pc">Plan</label><select class="vt-input" id="pc" name="planCode" style="width:auto">{#each data.plans as p (p.code)}<option value={p.code}>{p.code}</option>{/each}</select></div>
        <div><label class="vt-label" for="sc">SLA</label><select class="vt-input" id="sc" name="slaCode" style="width:auto">{#each data.slaTiers as s (s.code)}<option value={s.code}>{s.code}</option>{/each}</select></div>
        <div><label class="vt-label" for="cur">Para</label><select class="vt-input" id="cur" name="currency" style="width:auto"><option>TRY</option><option>EUR</option><option>USD</option></select></div>
        <div><label class="vt-label" for="mon">Aylık</label><input class="vt-input tnum" id="mon" name="monthly" type="number" step="0.01" required style="width:110px" /></div>
        <div><label class="vt-label" for="sf">Kurulum</label><input class="vt-input tnum" id="sf" name="setupFee" type="number" step="0.01" value="0" style="width:110px" /></div>
        <Button type="submit" size="sm">Kaydet</Button>
      </form>
    </div>
    <Table minWidth={560}>
      {#snippet head()}<th>Boyut</th><th>İkametgâh</th><th>Plan</th><th>SLA</th><th class="num">Aylık</th><th class="num">Kurulum</th>{/snippet}
      {#each prices as p (p.size + p.residency + p.planCode + p.slaCode)}
        <tr><td class="mono">{p.size}</td><td><ResidencyBadge residency={p.residency as Residency} small /></td><td>{p.planCode}</td><td class="mono">{p.slaCode}</td><td class="num">{p.monthly.toLocaleString('tr-TR')} {p.currency}</td><td class="num">{p.setupFee.toLocaleString('tr-TR')}</td></tr>
      {:else}
        <tr><td colspan="6" class="muted">Bu ürün için fiyat yok.</td></tr>
      {/each}
    </Table>
  </Card>
</div>
