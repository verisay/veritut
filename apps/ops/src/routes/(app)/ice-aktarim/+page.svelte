<script lang="ts">
  import { enhance } from '$app/forms';
  import { Card, Button } from '@veritut/ui';
  let { data, form } = $props();
  const period = new Date().toISOString().slice(0, 7);
  const sample = 'tenant_slug,tenant_name,workload_slug,name,product_slug,residency,provider,region,size,sla_tier,monthly_revenue,currency,probe_url,notes\naksu-yazilim,Aksu Yazılım,nc-muhasebe,Muhasebe Nextcloud,nextcloud,TR,hetzner,fsn1,cx32,std_9x5,120,EUR,https://nc.aksu.example/status.php,eski sözleşme';
</script>

<h1 class="vt-h1" style="margin-bottom:6px">İçe aktarım</h1>
<p class="vt-lead" style="margin:0 0 20px">İlk 30 gün: mevcut Verisay hizmetleri kiracı + iş yükü olarak; tedarikçi faturası CSV olarak.</p>
<div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; align-items:start">
  <Card title="Hizmet envanteri (CSV)" subtitle="Kiracı yoksa açılır; iş yükü varsa güncellenir; gelir bu döneme yazılır">
    <form method="POST" action="?/workloads" use:enhance style="display:grid; gap:10px">
      <textarea class="vt-input mono" name="csv" rows="10" style="height:auto; padding:8px 12px; font-size:12px" required>{sample}</textarea>
      <Button type="submit">İçe aktar</Button>
      {#if form?.result}<pre class="vt-codebox">{JSON.stringify(form.result, null, 2)}</pre>{/if}
    </form>
  </Card>
  <Card title="Tedarikçi faturası (CSV)" subtitle="Gerçek maliyet: eşleşen kaynağın tahmini tahsisi ezilir">
    <form method="POST" action="?/invoice" use:enhance style="display:grid; gap:10px">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px">
        <div><label class="vt-label" for="providerAccountId">Hesap</label><select class="vt-input" id="providerAccountId" name="providerAccountId">{#each data.accounts as a (a.id)}<option value={a.id}>{a.providerCode}/{a.label}</option>{/each}</select></div>
        <div><label class="vt-label" for="period">Dönem</label><input class="vt-input mono" id="period" name="period" value={period} /></div>
      </div>
      <textarea class="vt-input mono" name="csv" rows="8" style="height:auto; padding:8px 12px; font-size:12px" placeholder="resource,description,amount,currency&#10;server:12345,cx32 nc-muhasebe,13.10,EUR" required></textarea>
      <Button type="submit" variant="secondary">Faturayı işle</Button>
      {#if form?.invoice}<pre class="vt-codebox">{JSON.stringify(form.invoice, null, 2)}</pre>{/if}
    </form>
  </Card>
</div>
{#if form?.message}<p class="vt-field-error" style="margin-top:10px">{form.message}</p>{/if}
