<script lang="ts">
  import { Card, PageHead, StatusDot, Table } from '@veritut/ui';
  import { RUN_STATUS_LABEL, type RunStatus, type ComponentState } from '@veritut/types';
  import { formatRelative } from '@veritut/shared';
  let { data } = $props();
  const o = $derived(data.overview);
</script>

<PageHead title="Genel bakış" variant="ops" />
<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:14px">
  <Card title="Platform bileşenleri" subtitle="worker probe · 30 sn">
    <div style="display:grid; gap:8px">
      {#each o.components as c (c.slug)}
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px">
          <span style="display:flex; gap:8px; align-items:center"><StatusDot state={c.state as ComponentState} small /> {c.name}</span>
          <span class="vt-help tnum mono">{c.latencyMs === null ? '—' : `${c.latencyMs} ms`}</span>
        </div>
      {/each}
    </div>
  </Card>
  <Card title="Kuyruklar" subtitle="bekleyen / aktif">
    <div style="display:grid; gap:8px">
      {#each Object.entries(o.queues) as [name, q] (name)}
        <div style="display:flex; justify-content:space-between"><span class="mono" style="font-size:12.5px">{name}</span><span class="tnum mono" style="font-size:12.5px">{q.waiting} / {q.active}</span></div>
      {/each}
    </div>
  </Card>
  <Card title="Kiracılar">
    <p class="vt-stat-value tnum" style="font-size:clamp(36px,3.4vw,52px)">{o.tenantCount}</p>
    <p class="vt-stat-label">kayıtlı kiracı · <a href="/kiracilar">listeye git</a></p>
  </Card>
</div>
<div style="margin-top:14px">
  <Card title="Son çalıştırmalar" padded={false}>
    <Table minWidth={480}>
      {#snippet head()}<th>Tür</th><th>Durum</th><th>Zaman</th>{/snippet}
      {#each o.recentRuns as r (r.id)}
        <tr><td><a href="/calistirmalar/{r.id}" class="mono">{r.kind}</a></td><td>{RUN_STATUS_LABEL[r.status as RunStatus] ?? r.status}</td><td class="muted">{formatRelative(r.createdAt)}</td></tr>
      {:else}
        <tr><td colspan="3" class="muted">Henüz çalıştırma yok.</td></tr>
      {/each}
    </Table>
  </Card>
</div>
