<script lang="ts">
  import { enhance } from '$app/forms';
  import { Card, Table, Button, StatusDot } from '@veritut/ui';
  import { DRILL_STATUS_LABEL } from '@veritut/types';
  import { formatDate, formatDateTime, formatDuration } from '@veritut/shared';
  let { data, form } = $props();
</script>

<div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:20px; gap:16px; flex-wrap:wrap">
  <div><h1 class="vt-h1">Geri dönüş tatbikatları</h1><p class="vt-lead" style="margin:4px 0 0">"Yedekliyoruz" diyen çok, "geri döndüğünü kanıtlayan" az. Her tatbikat kanıt defterine düşer.</p></div>
  <form method="POST" action="?/schedule" use:enhance><Button type="submit" variant="ghost" size="sm">Aylık planı oluştur</Button></form>
</div>
{#if form?.message}<div class="vt-status" data-state="down" style="margin-bottom:12px">{form.message}</div>{/if}
{#if form?.runId}<div class="vt-status" data-state="ok" style="margin-bottom:12px">Tatbikat başladı → <a href="/calistirmalar/{form.runId}">canlı log</a></div>{/if}
{#if form?.scheduled}<div class="vt-status" data-state="ok" style="margin-bottom:12px">Planlandı: {JSON.stringify(form.scheduled)}</div>{/if}

<div style="display:grid; grid-template-columns:1fr 300px; gap:14px; align-items:start">
  <Card padded={false}>
    <Table minWidth={820}>
      {#snippet head()}<th></th><th>İş yükü</th><th>Plan tarihi</th><th>Snapshot</th><th>Checksum</th><th>Uygulama</th><th class="num">Veri</th><th class="num">Süre</th><th>Kanıt</th>{/snippet}
      {#each data.drills as d (d.drill.id)}
        <tr>
          <td><StatusDot state={d.drill.status === 'passed' ? 'ok' : d.drill.status === 'failed' ? 'down' : 'maintenance'} small /></td>
          <td><a href="/is-yukleri/{d.workloadSlug}">{d.workloadName}</a> <span class="vt-help">{DRILL_STATUS_LABEL[d.drill.status]}</span></td>
          <td class="tnum">{formatDate(d.drill.scheduledFor)}</td>
          <td class="mono">{d.drill.snapshotId?.slice(0, 8) ?? '—'}</td>
          <td>{d.drill.checksumOk === null ? '—' : d.drill.checksumOk ? '✓' : '✕'}</td>
          <td>{d.drill.appCheckOk === null ? '—' : d.drill.appCheckOk ? '✓' : '✕'}</td>
          <td class="num">{d.drill.restoredBytes ?? '—'}</td>
          <td class="num">{d.drill.durationS !== null ? formatDuration(d.drill.durationS) : '—'}</td>
          <td>{#if d.drill.evidenceId}<span class="vt-state-text" data-state="ok" style="font-size:12px; font-weight:700">✓ zincirde</span>{/if}{#if d.drill.runId}<a href="/calistirmalar/{d.drill.runId}" class="vt-help"> log</a>{/if}</td>
        </tr>
      {:else}
        <tr><td colspan="9" class="muted">Henüz tatbikat yok.</td></tr>
      {/each}
    </Table>
  </Card>
  <Card title="Şimdi tatbikat yap" subtitle="Son başarılı yedek geçici ortama geri yüklenir">
    <form method="POST" action="?/run" use:enhance style="display:grid; gap:10px">
      <div><label class="vt-label" for="workloadId">İş yükü</label><select class="vt-input" id="workloadId" name="workloadId" required>{#each data.workloads as w (w.id)}<option value={w.id}>{w.tenantName} / {w.name}</option>{/each}</select></div>
      <Button type="submit">Tatbikatı başlat</Button>
    </form>
  </Card>
</div>
