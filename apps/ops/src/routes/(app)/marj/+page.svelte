<script lang="ts">
  import { enhance } from '$app/forms';
  import { Card, Table, Button } from '@veritut/ui';
  let { data } = $props();
  const r = $derived(data.report);
  const flagLabel: Record<string, string> = { ok: '', low: 'marj < %35', no_revenue: 'gelir yok', no_cost: 'maliyet yok', fx_missing: 'kur yok' };
</script>

<div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:20px; gap:16px">
  <div><h1 class="vt-h1">Maliyet & marj — {r.period}</h1><p class="vt-lead" style="margin:4px 0 0">"Sunucu + %20" iş modeli değildir. Marj yönetilen katmanda; %35 altı bayraklanır.</p></div>
  <form method="GET" style="display:flex; gap:8px; align-items:end"><div><label class="vt-label" for="period">Dönem</label><input class="vt-input mono" id="period" name="period" value={r.period} /></div><Button type="submit" variant="secondary" size="sm">Göster</Button></form>
</div>
<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:14px">
  <Card><p class="vt-kicker">Gelir (TRY)</p><p class="vt-h2 tnum">{r.totals.revenueTry.toLocaleString('tr-TR')}</p></Card>
  <Card><p class="vt-kicker">Maliyet (TRY)</p><p class="vt-h2 tnum">{r.totals.costTry.toLocaleString('tr-TR')}</p></Card>
  <Card><p class="vt-kicker">Brüt marj</p><p class="vt-h2 tnum" class:vt-state-text={r.totals.marginPct !== null && r.totals.marginPct < 35} data-state="degraded">{r.totals.marginPct === null ? '—' : `%${r.totals.marginPct}`}</p></Card>
  <Card><p class="vt-kicker">Bayraklı</p><p class="vt-h2 tnum">{r.totals.flagged}</p></Card>
</div>
<Card padded={false}>
  <Table minWidth={900}>
    {#snippet head()}<th>Kiracı</th><th>İş yükü</th><th>Tedarikçi</th><th class="num">Gelir</th><th class="num">Maliyet</th><th>Yöntem</th><th class="num">Marj</th><th>Bayrak</th>{/snippet}
    {#each r.rows as row (row.workloadId)}
      <tr>
        <td>{row.tenantName}</td>
        <td><a href="/is-yukleri/{row.workloadId}">{row.workloadName}</a> <span class="mono muted" style="font-size:11px">{row.productSlug}</span></td>
        <td class="muted">{row.providerCode ?? '—'}</td>
        <td class="num">{row.revenue === null ? '—' : `${row.revenue.toFixed(2)} ${row.revenueCurrency}`}</td>
        <td class="num">{row.costCurrency ? `${row.cost.toFixed(2)} ${row.costCurrency}` : '—'}</td>
        <td class="muted">{row.costMethod}</td>
        <td class="num" style="font-weight:700">{row.marginPct === null ? '—' : `%${row.marginPct}`}</td>
        <td>{#if row.flag !== 'ok'}<span class="vt-state-text" data-state={row.flag === 'low' ? 'down' : 'degraded'} style="font-size:12px; font-weight:700">{flagLabel[row.flag]}</span>{/if}</td>
      </tr>
    {:else}
      <tr><td colspan="8" class="muted">Bu dönem için iş yükü yok.</td></tr>
    {/each}
  </Table>
</Card>
<div style="margin-top:14px; max-width:520px">
  <Card title="Döviz kuru (TRY'ye)" subtitle="Farklı para birimlerini karşılaştırmak için; K3'te TCMB'den otomatik">
    <form method="POST" action="?/fx" use:enhance style="display:grid; grid-template-columns:1fr 1fr 1fr auto; gap:10px; align-items:end">
      <div><label class="vt-label" for="fxp">Dönem</label><input class="vt-input mono" id="fxp" name="period" value={r.period} /></div>
      <div><label class="vt-label" for="fxc">Para</label><select class="vt-input" id="fxc" name="currency"><option>EUR</option><option>USD</option></select></div>
      <div><label class="vt-label" for="fxr">1 birim = TRY</label><input class="vt-input tnum" id="fxr" name="toTry" type="number" step="0.0001" min="0" required /></div>
      <Button type="submit" variant="secondary" size="sm">Kaydet</Button>
    </form>
  </Card>
</div>
