<script lang="ts">
  import { enhance } from '$app/forms';
  import { Card, Table, Button } from '@veritut/ui';
  import { formatMoney } from '@veritut/shared';
  let { data, form } = $props();
</script>

<div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:20px; gap:16px; flex-wrap:wrap">
  <div><h1 class="vt-h1">SLA — {data.period}</h1><p class="vt-lead" style="margin:4px 0 0">Uptime sondalardan, planlı bakım düşülerek. Kredi talep beklemeden hesaplanır ve faturaya düşer.</p></div>
  <form method="POST" action="?/compute" use:enhance style="display:flex; gap:8px; align-items:end">
    <div><label class="vt-label" for="period">Dönem</label><input class="vt-input mono" id="period" name="period" value={data.period} /></div>
    <Button type="submit" size="sm" variant="secondary">Hesapla ve kredileri işle</Button>
  </form>
</div>
{#if form?.result}<div class="vt-status" data-state="ok" style="margin-bottom:12px">{JSON.stringify(form.result)}</div>{/if}

<Card padded={false}>
  <Table minWidth={880}>
    {#snippet head()}<th>Kiracı</th><th>İş yükü</th><th>SLA</th><th class="num">Uptime</th><th class="num">Hedef</th><th class="num">Kesinti</th><th class="num">Bakım</th><th class="num">Olay</th><th class="num">İhlal</th><th class="num">Kredi</th>{/snippet}
    {#each data.rows as r (r.sla.id)}
      <tr>
        <td>{r.tenantName ?? '—'}</td>
        <td>{r.workloadName ?? '—'}</td>
        <td class="mono">{r.sla.slaCode}</td>
        <td class="num"><span class="vt-state-text" data-state={Number(r.sla.uptimePct) < Number(r.sla.uptimeTarget) ? 'down' : 'ok'} style="font-weight:700">%{r.sla.uptimePct}</span></td>
        <td class="num">%{r.sla.uptimeTarget}</td>
        <td class="num">{r.sla.downtimeMin} dk</td>
        <td class="num">{r.sla.maintenanceMin} dk</td>
        <td class="num">{r.sla.incidents}</td>
        <td class="num">{r.sla.responseBreaches + r.sla.resolveBreaches}</td>
        <td class="num">{Number(r.sla.creditAmount) > 0 ? `${formatMoney(Number(r.sla.creditAmount), r.sla.currency as 'TRY')}${r.sla.creditAppliedAt ? ' ✓' : ''}` : '—'}</td>
      </tr>
    {:else}
      <tr><td colspan="10" class="muted">Bu dönem için hesap yok — "Hesapla".</td></tr>
    {/each}
  </Table>
</Card>
