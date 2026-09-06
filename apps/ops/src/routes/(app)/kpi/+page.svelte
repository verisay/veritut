<script lang="ts">
  import { enhance } from '$app/forms';
  import { Card, Table, Button } from '@veritut/ui';
  import { formatDateTime } from '@veritut/shared';
  let { data, form } = $props();
  const latest = $derived(data.snapshots[0] ?? null);
  const num = (v: string | null) => (v === null ? '—' : Number(v).toLocaleString('tr-TR'));
</script>

<div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:20px; gap:16px; flex-wrap:wrap">
  <div><h1 class="vt-h1">KPI</h1><p class="vt-lead" style="margin:4px 0 0">Modelin sağlığı: MRR, brüt marj, destek dakikası, churn. Arbitraj tuzağının erken uyarısı marjdır.</p></div>
  <div style="display:flex; gap:8px">
    <form method="POST" action="?/compute" use:enhance><Button type="submit" size="sm" variant="secondary">Şimdi hesapla</Button></form>
    <form method="POST" action="?/push" use:enhance><Button type="submit" size="sm" variant="ghost">Dönemi faturala</Button></form>
    <form method="POST" action="?/trials" use:enhance><Button type="submit" size="sm" variant="ghost">Denemeleri kapat</Button></form>
  </div>
</div>
{#if form?.push}<div class="vt-status" data-state="ok" style="margin-bottom:12px">Faturalama: {JSON.stringify(form.push)}</div>{/if}
{#if form?.trials}<div class="vt-status" data-state="ok" style="margin-bottom:12px">Deneme kapanışı: {JSON.stringify(form.trials)}</div>{/if}

{#if latest}
  <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:14px; margin-bottom:14px">
    <Card><p class="vt-kicker">MRR</p><p class="vt-h2 tnum">{num(latest.mrr)}</p><p class="vt-help">{latest.period}</p></Card>
    <Card><p class="vt-kicker">Brüt marj</p><p class="vt-h2 tnum">{latest.grossMarginPct === null ? '—' : `%${latest.grossMarginPct}`}</p><p class="vt-help">hedef ≥ %35</p></Card>
    <Card><p class="vt-kicker">Destek dk / müşteri</p><p class="vt-h2 tnum">{num(latest.supportMinPerCustomer)}</p><p class="vt-help">otomasyonun aynası</p></Card>
    <Card><p class="vt-kicker">Churn</p><p class="vt-h2 tnum">{latest.churnPct === null ? '—' : `%${latest.churnPct}`}</p></Card>
    <Card><p class="vt-kicker">Aktif kiracı / iş yükü</p><p class="vt-h2 tnum">{latest.activeTenants} / {latest.activeWorkloads}</p></Card>
  </div>
{/if}

<Card title="Dönemler" padded={false}>
  <Table minWidth={700}>
    {#snippet head()}<th>Dönem</th><th class="num">MRR</th><th class="num">Marj</th><th class="num">Destek dk</th><th class="num">Churn</th><th class="num">Kiracı</th><th class="num">İş yükü</th><th>Hesaplama</th>{/snippet}
    {#each data.snapshots as s (s.period)}
      <tr><td class="mono">{s.period}</td><td class="num">{num(s.mrr)}</td><td class="num">{s.grossMarginPct === null ? '—' : `%${s.grossMarginPct}`}</td><td class="num">{num(s.supportMinPerCustomer)}</td><td class="num">{s.churnPct === null ? '—' : `%${s.churnPct}`}</td><td class="num">{s.activeTenants}</td><td class="num">{s.activeWorkloads}</td><td class="tnum muted">{formatDateTime(s.computedAt)}</td></tr>
    {:else}
      <tr><td colspan="8" class="muted">Henüz anlık görüntü yok — "Şimdi hesapla".</td></tr>
    {/each}
  </Table>
</Card>
