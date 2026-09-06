<script lang="ts">
  import { enhance } from '$app/forms';
  import { Card, Table, Button, ResidencyBadge } from '@veritut/ui';
  import { PROVIDERS, RESIDENCIES, WORKLOAD_STATUS_LABEL, type WorkloadStatus } from '@veritut/types';
  let { data, form } = $props();
</script>

<div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:20px; gap:16px">
  <div><h1 class="vt-h1">İş yükleri</h1><p class="vt-lead" style="margin:4px 0 0">Kayıt defteri. K1: elle/CSV `legacy` kayıtlar; K2'de provizyon motoru aynı tabloya yazar.</p></div>
  <a href="/ice-aktarim" class="vt-btn vt-btn-secondary vt-btn-sm">CSV içe aktar</a>
</div>
<div style="display:grid; grid-template-columns:1fr 360px; gap:14px; align-items:start">
  <Card padded={false}>
    <Table minWidth={800}>
      {#snippet head()}<th>İş yükü</th><th>Kiracı</th><th>Ürün</th><th>Tedarikçi</th><th>İkametgâh</th><th>SLA</th><th>Durum</th>{/snippet}
      {#each data.workloads as w (w.id)}
        <tr>
          <td><a href="/is-yukleri/{w.id}">{w.name}</a> <span class="mono muted" style="font-size:11.5px">{w.slug}</span></td>
          <td>{w.tenantName}</td><td class="mono">{w.productSlug}</td>
          <td class="muted">{w.providerCode ?? '—'}{w.region ? `/${w.region}` : ''}{w.size ? ` · ${w.size}` : ''}</td>
          <td><ResidencyBadge residency={w.residency} small /></td><td class="mono">{w.slaTier}</td>
          <td>{WORKLOAD_STATUS_LABEL[w.status as WorkloadStatus] ?? w.status}</td>
        </tr>
      {:else}
        <tr><td colspan="7" class="muted">Henüz iş yükü yok.</td></tr>
      {/each}
    </Table>
  </Card>
  <Card title="Yeni iş yükü (legacy)" subtitle="Mevcut hizmet kaydı; provizyon yok">
    <form method="POST" action="?/create" use:enhance style="display:grid; gap:10px">
      <div><label class="vt-label" for="tenantId">Kiracı</label><select class="vt-input" id="tenantId" name="tenantId">{#each data.tenants as t (t.id)}<option value={t.id}>{t.name}</option>{/each}</select></div>
      <div><label class="vt-label" for="slug">Kısa ad</label><input class="vt-input mono" id="slug" name="slug" required value={form?.values?.slug ?? ''} /></div>
      <div><label class="vt-label" for="name">Ad</label><input class="vt-input" id="name" name="name" required value={form?.values?.name ?? ''} /></div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px">
        <div><label class="vt-label" for="productSlug">Ürün</label><input class="vt-input mono" id="productSlug" name="productSlug" value="legacy" /></div>
        <div><label class="vt-label" for="residency">İkametgâh</label><select class="vt-input" id="residency" name="residency">{#each RESIDENCIES as r (r)}<option value={r}>{r}</option>{/each}</select></div>
        <div><label class="vt-label" for="providerCode">Tedarikçi</label><select class="vt-input" id="providerCode" name="providerCode"><option value="">—</option>{#each PROVIDERS as p (p)}<option value={p}>{p}</option>{/each}</select></div>
        <div><label class="vt-label" for="region">Bölge</label><input class="vt-input mono" id="region" name="region" /></div>
        <div><label class="vt-label" for="size">Boyut</label><input class="vt-input mono" id="size" name="size" /></div>
        <div><label class="vt-label" for="slaTier">SLA</label><select class="vt-input" id="slaTier" name="slaTier"><option value="std_9x5">std_9x5</option><option value="crit_24x7">crit_24x7</option></select></div>
      </div>
      <div><label class="vt-label" for="probeUrl">Probe URL (status + uptime)</label><input class="vt-input mono" id="probeUrl" name="probeUrl" placeholder="https://…" /></div>
      <input type="hidden" name="status" value="active" />
      {#if form?.message}<p class="vt-field-error">{form.message}</p>{/if}
      <Button type="submit">Kaydet</Button>
    </form>
  </Card>
</div>
