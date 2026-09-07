<script lang="ts">
  import { Card, PageHead, ResidencyBadge, StatusDot, Table, Tabs } from '@veritut/ui';
  import { WORKLOAD_STATUS_LABEL, type WorkloadStatus } from '@veritut/types';
  import { formatDateTime, formatDuration } from '@veritut/shared';
  let { data } = $props();
  const w = $derived(data.workload);
  let tab = $state('genel');
</script>

<svelte:head><title>{w.name} — VERITUT</title></svelte:head>
<PageHead title={w.name} eyebrow="iş yükleri">
  {#snippet badge()}<ResidencyBadge residency={w.residency} />{/snippet}
  <p class="vt-help" style="margin:6px 0 0"><span class="mono">{w.slug}</span> · {w.productSlug} · {w.providerCode ?? '—'}{w.region ? `/${w.region}` : ''}{w.size ? ` · ${w.size}` : ''} · SLA <span class="mono">{w.slaTier}</span> · {WORKLOAD_STATUS_LABEL[w.status as WorkloadStatus] ?? w.status}</p>
</PageHead>

<Tabs tabs={[{ id: 'genel', label: 'Genel' }, { id: 'yedek', label: `Yedekler (${data.backups.length})` }, { id: 'erisim', label: `Erişim (${data.accessSessions.length})` }]} bind:active={tab} />
<div style="margin-top:18px">
  {#if tab === 'genel'}
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:14px">
      <Card title="Kaynaklar" subtitle="Tedarikçi envanterinden eşlenen">
        {#if data.resources.length === 0}<p class="vt-help" style="margin:0">Henüz eşlenmiş kaynak yok.</p>{:else}
          <ul style="margin:0; padding:0; list-style:none; display:grid; gap:8px">
            {#each data.resources as r (r.externalId)}<li style="font-size:13px"><span class="mono">{r.externalId}</span> · {r.name} · {r.region ?? '—'} {#if r.specs['serverType']}· <span class="mono">{String(r.specs['serverType'])}</span>{/if}</li>{/each}
          </ul>
        {/if}
      </Card>
      <Card title="Uç noktalar">
        {#if !w.endpoints?.length}<p class="vt-help" style="margin:0">Tanımlı uç nokta yok.</p>{:else}
          <ul style="margin:0; padding:0; list-style:none; display:grid; gap:6px">{#each w.endpoints as e (e.url)}<li><a href={e.url} class="mono" style="font-size:13px">{e.label || e.url}</a></li>{/each}</ul>
        {/if}
      </Card>
      {#if w.notes}<Card title="Notlar"><p style="margin:0; font-size:13.5px; white-space:pre-wrap">{w.notes}</p></Card>{/if}
    </div>
  {:else if tab === 'yedek'}
    <Card padded={false}>
      <Table minWidth={640}>
        {#snippet head()}<th></th><th>Snapshot</th><th class="num">Dosya</th><th class="num">Bayt</th><th class="num">Süre</th><th>Zaman</th><th>Kanıt</th>{/snippet}
        {#each data.backups as b (b.id)}
          <tr>
            <td><StatusDot state={b.status === 'completed' ? 'ok' : b.status === 'failed' ? 'down' : 'maintenance'} small /></td>
            <td class="mono">{b.snapshotId ?? (b.error ? 'başarısız' : '—')}</td>
            <td class="num">{b.files ?? '—'}</td><td class="num">{b.bytes ?? '—'}</td><td class="num">{b.durationS !== null ? formatDuration(b.durationS) : '—'}</td>
            <td class="tnum">{formatDateTime(b.startedAt)}</td>
            <td>{#if b.evidenceId}<a href="/panel/kanit" class="vt-state-text" data-state="ok" style="font-size:12px; font-weight:700">✓ zincirde</a>{/if}</td>
          </tr>
        {:else}
          <tr><td colspan="7" class="muted">Henüz yedek yok.</td></tr>
        {/each}
      </Table>
    </Card>
  {:else}
    <Card padded={false}>
      <p class="vt-help" style="margin:0; padding:12px 22px; border-bottom:1px solid var(--border)">VERITUT personelinin iş yükünüze her erişimi burada ve kanıt defterinizde görünür. Bu bir tercih değil, ürünün kendisidir.</p>
      <Table minWidth={640}>
        {#snippet head()}<th>Personel</th><th>Kaynak</th><th>Hedef</th><th>Gerekçe</th><th>Başlangıç</th><th>Bitiş</th>{/snippet}
        {#each data.accessSessions as s (s.id)}
          <tr><td>{s.actorLabel}</td><td class="mono">{s.source}</td><td class="mono">{s.target}</td><td class="muted">{s.reason ?? '—'}</td><td class="tnum">{formatDateTime(s.startedAt)}</td><td class="tnum">{s.endedAt ? formatDateTime(s.endedAt) : 'açık'}</td></tr>
        {:else}
          <tr><td colspan="6" class="muted">Henüz erişim oturumu yok.</td></tr>
        {/each}
      </Table>
    </Card>
  {/if}
</div>
