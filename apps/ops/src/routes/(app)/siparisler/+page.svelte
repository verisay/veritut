<script lang="ts">
  import { enhance } from '$app/forms';
  import { Card, Table, Button, ResidencyBadge } from '@veritut/ui';
  import { ORDER_STATUS_LABEL_TR, type Residency } from '@veritut/types';
  import { formatDateTime, formatMoney } from '@veritut/shared';
  let { data, form } = $props();
  let open = $state<string | null>(null);
</script>

<h1 class="vt-h1" style="margin-bottom:6px">Siparişler</h1>
<p class="vt-lead" style="margin:0 0 20px">Self-servis siparişler insan dokunmadan kurulur. Buradaki müdahale istisnadır.</p>
{#if form?.message}<div class="vt-status" data-state="down" style="margin-bottom:12px">{form.message}</div>{/if}
<Card padded={false}>
  <Table minWidth={880}>
    {#snippet head()}<th>Kiracı</th><th>İş yükü</th><th>Ürün</th><th>Plan / SLA</th><th>Yerleşim</th><th class="num">Aylık</th><th>Durum</th><th>Tarih</th><th></th>{/snippet}
    {#each data.rows as r (r.order.id)}
      <tr>
        <td>{r.tenantName}</td>
        <td>{r.order.workloadName}{#if r.order.isTrial}<span class="vt-help"> · deneme</span>{/if}</td>
        <td class="mono">{r.order.productSlug}</td>
        <td>{r.planTitle ?? r.order.planCode} / <span class="mono">{r.order.slaCode}</span></td>
        <td><ResidencyBadge residency={r.order.residency as Residency} small /> <span class="mono">{r.order.size}</span></td>
        <td class="num">{formatMoney(Number(r.order.monthly), r.order.currency as 'TRY')}</td>
        <td>{ORDER_STATUS_LABEL_TR[r.order.status] ?? r.order.status}</td>
        <td class="tnum">{formatDateTime(r.order.createdAt)}</td>
        <td style="display:flex; gap:4px">
          {#if r.order.runId}<a href="/calistirmalar/{r.order.runId}" class="vt-btn vt-btn-ghost vt-btn-sm">Log</a>{/if}
          {#if ['submitted', 'approved', 'provisioning'].includes(r.order.status)}<Button size="sm" variant="ghost" onclick={() => (open = open === r.order.id ? null : r.order.id)}>İptal</Button>{/if}
        </td>
      </tr>
      {#if open === r.order.id}
        <tr><td colspan="9" style="height:auto; padding:12px">
          <form method="POST" action="?/reject" use:enhance style="display:flex; gap:8px; align-items:end">
            <input type="hidden" name="id" value={r.order.id} />
            <div style="flex:1"><label class="vt-label" for="reason-{r.order.id}">İptal gerekçesi (müşteriye bildirilir)</label><input class="vt-input" id="reason-{r.order.id}" name="reason" required minlength="2" /></div>
            <Button type="submit" variant="danger" size="sm">Siparişi iptal et</Button>
          </form>
        </td></tr>
      {/if}
    {:else}
      <tr><td colspan="9" class="muted">Henüz sipariş yok.</td></tr>
    {/each}
  </Table>
</Card>
