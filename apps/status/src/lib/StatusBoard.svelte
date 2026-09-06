<script lang="ts">
  import { Card, StatusDot, StatusPill } from '@veritut/ui';
  import { COMPONENT_STATE_LABEL, type StatusSnapshot } from '@veritut/types';
  import { formatDateTime } from '@veritut/shared';
  let { snapshot, title }: { snapshot: StatusSnapshot | null; title: string } = $props();
  const overallText: Record<StatusSnapshot['overall'], string> = {
    ok: 'Tüm sistemler çalışıyor',
    degraded: 'Kısmi sorun var',
    down: 'Erişim sorunu var',
    maintenance: 'Planlı bakım sürüyor',
    unknown: 'Durum bilgisi alınamıyor',
  };
</script>

<h1 class="vt-h1" style="margin-bottom:6px">{title}</h1>
{#if !snapshot}
  <p class="vt-lead" style="margin:0 0 24px">Durum bilgisi alınamıyor.</p>
  <Card><p class="vt-help" style="margin:0">Snapshot henüz üretilmedi veya okunamadı. Worker probe turu 30 saniyede bir çalışır.</p></Card>
{:else}
  <div style="display:flex; align-items:center; gap:14px; margin:0 0 24px; flex-wrap:wrap">
    <StatusPill state={snapshot.overall} label={overallText[snapshot.overall]} />
    <span class="vt-help tnum">güncelleme: {formatDateTime(snapshot.generatedAt)}</span>
  </div>
  <Card padded={false}>
    {#each snapshot.components as c, i (c.slug)}
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:14px 22px; {i > 0 ? 'border-top:1px solid var(--border)' : ''}">
        <span style="display:flex; align-items:center; gap:10px"><StatusDot state={c.state} />{c.name}</span>
        <span style="display:flex; align-items:center; gap:14px">
          <span class="vt-help tnum mono">{c.latencyMs === null ? '—' : `${c.latencyMs} ms`}</span>
          <span class="vt-state-text" data-state={c.state} style="font-size:13px; font-weight:700">{COMPONENT_STATE_LABEL[c.state]}</span>
        </span>
      </div>
    {/each}
  </Card>
{/if}
