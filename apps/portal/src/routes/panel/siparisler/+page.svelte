<script lang="ts">
  import { Card, Table, ResidencyBadge, Button, EmptyState } from '@veritut/ui';
  import { ORDER_STATUS_LABEL_TR, type Residency } from '@veritut/types';
  import { formatDateTime, formatMoney } from '@veritut/shared';
  let { data } = $props();
</script>

<svelte:head><title>Siparişler — VERITUT</title></svelte:head>
<div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:24px; gap:16px">
  <div><h1 class="vt-h1">Siparişler</h1><p class="vt-lead" style="margin:4px 0 0">Sipariş anındaki fiyat sözleşmedir.</p></div>
  <Button href="/panel/siparis">Yeni iş yükü</Button>
</div>
{#if data.orders.length === 0}
  <EmptyState title="Henüz sipariş yok" text="Katalogdan bir ürün seçip birkaç dakikada kurabilirsiniz." />
{:else}
  <Card padded={false}>
    <Table minWidth={720}>
      {#snippet head()}<th>İş yükü</th><th>Ürün</th><th>Plan / SLA</th><th>Yerleşim</th><th class="num">Aylık</th><th>Durum</th><th>Tarih</th>{/snippet}
      {#each data.orders as o (o.id)}
        <tr>
          <td><a href="/panel/siparisler/{o.id}">{o.workloadName}</a>{#if o.isTrial}<span class="vt-help"> · deneme</span>{/if}</td>
          <td class="mono">{o.productSlug}</td>
          <td>{o.planCode} / <span class="mono">{o.slaCode}</span></td>
          <td><ResidencyBadge residency={o.residency as Residency} small /> <span class="mono">{o.size}</span></td>
          <td class="num">{formatMoney(Number(o.monthly), o.currency as 'TRY')}</td>
          <td>{ORDER_STATUS_LABEL_TR[o.status] ?? o.status}</td>
          <td class="tnum">{formatDateTime(o.createdAt)}</td>
        </tr>
      {/each}
    </Table>
  </Card>
{/if}
