<script lang="ts">
  import { enhance } from '$app/forms';
  import { Card, Table, Button, ResidencyBadge, StatusDot, Modal } from '@veritut/ui';
  let destroyOpen = $state(false);
  import { WORKLOAD_STATUS_LABEL, type WorkloadStatus } from '@veritut/types';
  import { formatDateTime, formatDuration } from '@veritut/shared';
  let { data, form } = $props();
  const w = $derived(data.workload);
  const period = new Date().toISOString().slice(0, 7);
</script>

<p class="vt-kicker"><a href="/is-yukleri">İş yükleri</a> / {w.slug}</p>
<div style="display:flex; justify-content:space-between; align-items:flex-end; margin:4px 0 20px; gap:16px">
  <div><h1 class="vt-h1">{w.name} <ResidencyBadge residency={w.residency} /></h1><p class="vt-help" style="margin:4px 0 0">{w.productSlug} · {w.providerCode ?? '—'}{w.region ? `/${w.region}` : ''} · {WORKLOAD_STATUS_LABEL[w.status as WorkloadStatus] ?? w.status} · <a href="/kiracilar/{w.tenantId}">kiracı</a></p></div>
  <div style="display:flex; gap:8px; align-items:center">
    {#if w.lastRunId}<a href="/calistirmalar/{w.lastRunId}" class="vt-btn vt-btn-ghost vt-btn-sm">Son çalıştırma</a>{/if}
    <form method="POST" action="?/backup" use:enhance><Button type="submit" variant="soft" disabled={!data.policy}>Yedek al (şimdi)</Button></form>
    {#if w.blueprintSlug}<Button variant="danger" onclick={() => (destroyOpen = true)} disabled={w.status === 'destroyed' || w.status === 'decommissioning'}>İş yükünü yok et</Button>{/if}
  </div>
</div>
<Modal bind:open={destroyOpen} title="İş yükünü yok etmek istiyor musunuz?">
  <p style="margin:0">Yüksek riskli değişiklik: <span class="mono">tofu destroy</span>. Başarılı bir yedek kanıtı olmadan başlamaz; plan sonrası talep edenden farklı bir kıdemli operatör onaylar (dört-göz).</p>
  {#snippet actions()}<Button variant="ghost" onclick={() => (destroyOpen = false)}>Vazgeç</Button><form method="POST" action="?/destroy" use:enhance><Button variant="danger" type="submit">Yıkımı başlat</Button></form>{/snippet}
</Modal>
{#if form?.destroyRun}<div class="vt-status" data-state="degraded" style="margin-bottom:12px">Yıkım çalıştırması açıldı → <a href="/calistirmalar/{form.destroyRun}">plan ve onay</a></div>{/if}
{#if form?.resizeRun}<div class="vt-status" data-state="ok" style="margin-bottom:12px">Boyut değişikliği başladı → <a href="/calistirmalar/{form.resizeRun}">canlı log</a></div>{/if}
{#if w.blueprintSlug}
  <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; align-items:start">
    <Card title="Blueprint" subtitle="{w.blueprintSlug}@{w.blueprintVersion}">
      {#if w.endpoints?.length}<ul style="margin:0 0 10px; padding:0; list-style:none; display:grid; gap:4px">{#each w.endpoints as e (e.url)}<li style="font-size:13px">{e.label}: <a href={e.url} class="mono">{e.url}</a></li>{/each}</ul>{/if}
      <div class="vt-codebox" style="font-size:11.5px">{JSON.stringify(w.outputs, null, 1).slice(0, 800)}</div>
    </Card>
    <Card title="Boyut değişikliği" subtitle="plan diff'e göre orta/yüksek risk">
      {#if data.bp}
        <form method="POST" action="?/resize" use:enhance style="display:flex; gap:10px; align-items:end">
          <div style="flex:1"><label class="vt-label" for="size">Yeni boyut</label><select class="vt-input" id="size" name="size">{#each data.bp.sizes as s (s.code)}<option value={s.code} disabled={s.code === w.size}>{s.title_tr}{s.code === w.size ? ' (mevcut)' : ''}</option>{/each}</select></div>
          <Button type="submit" variant="secondary" disabled={w.status !== 'active' && w.status !== 'degraded'}>Uygula</Button>
        </form>
      {/if}
    </Card>
  </div>
{/if}
{#if form?.message}<div class="vt-status" data-state="down" style="margin-bottom:12px">{form.message} {#if form.details}<code style="font-size:11px">{JSON.stringify(form.details)}</code>{/if}</div>{/if}
{#if form?.backupRun}<div class="vt-status" data-state="ok" style="margin-bottom:12px">Yedek çalıştırması başladı → <a href="/calistirmalar/{form.backupRun}">canlı log</a></div>{/if}

<div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; align-items:start">
  <Card title="Yedek politikası" subtitle="3-2-1 ve ikametgâh kuralları kodda zorlanır; ihlal 422">
    <form method="POST" action="?/policy" use:enhance style="display:grid; gap:10px">
      <div><label class="vt-label" for="primaryRepoId">Birincil depo</label><select class="vt-input" id="primaryRepoId" name="primaryRepoId">{#each data.repos as r (r.id)}<option value={r.id} selected={data.policy?.primaryRepoId === r.id}>{r.label} · {r.providerCode} · {r.residency}</option>{/each}</select></div>
      <div><label class="vt-label" for="offsiteRepoId">Offsite depo (farklı tedarikçi)</label><select class="vt-input" id="offsiteRepoId" name="offsiteRepoId"><option value="">— (3-2-1 ihlali)</option>{#each data.repos as r (r.id)}<option value={r.id} selected={data.policy?.offsiteRepoId === r.id}>{r.label} · {r.providerCode} · {r.residency}</option>{/each}</select></div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px">
        <div><label class="vt-label" for="schedule">Zamanlama (cron)</label><input class="vt-input mono" id="schedule" name="schedule" value={data.policy?.schedule ?? '0 2 * * *'} /></div>
        <div><label class="vt-label" for="paths">Yollar (virgülle; boş = örnek küme)</label><input class="vt-input mono" id="paths" name="paths" value={data.policy?.paths.join(',') ?? ''} /></div>
      </div>
      <div><label class="vt-label" for="retention">Saklama</label><input class="vt-input mono" id="retention" name="retention" value={data.policy?.retention ?? '--keep-daily 7 --keep-weekly 4 --keep-monthly 6'} /></div>
      {#if data.repos.length === 0}<p class="vt-help">Önce <a href="/yedekler">yedek deposu</a> tanımlayın.</p>{/if}
      <Button type="submit" variant="secondary" disabled={data.repos.length === 0}>Politikayı kaydet</Button>
      {#if form?.policyOk}<span class="vt-help">Kaydedildi.</span>{/if}
    </form>
  </Card>
  <Card title="Gelir (elle — K3'te fatura aynası)" subtitle="Marj raporu bu satırla hesaplanır">
    <form method="POST" action="?/revenue" use:enhance style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; align-items:end">
      <div><label class="vt-label" for="period">Dönem</label><input class="vt-input mono" id="period" name="period" value={period} /></div>
      <div><label class="vt-label" for="amount">Tutar</label><input class="vt-input tnum" id="amount" name="amount" type="number" step="0.01" min="0" required /></div>
      <div><label class="vt-label" for="currency">Para</label><select class="vt-input" id="currency" name="currency"><option>EUR</option><option>TRY</option><option>USD</option></select></div>
      <div style="grid-column:1/-1"><label class="vt-label" for="note">Not</label><input class="vt-input" id="note" name="note" /></div>
      <Button type="submit" variant="secondary">Kaydet</Button>
      {#if form?.revenueOk}<span class="vt-help">Kaydedildi.</span>{/if}
    </form>
  </Card>
</div>
<div style="margin-top:14px">
  <Card title="Yedek işleri" padded={false}>
    <Table minWidth={700}>
      {#snippet head()}<th></th><th>Snapshot</th><th class="num">Dosya</th><th class="num">Bayt</th><th class="num">Süre</th><th>Başlangıç</th><th>Çalıştırma</th>{/snippet}
      {#each data.jobs as j (j.id)}
        <tr>
          <td><StatusDot state={j.status === 'completed' ? 'ok' : j.status === 'failed' ? 'down' : 'maintenance'} small /></td>
          <td class="mono">{j.snapshotId ?? (j.error ? j.error.slice(0, 60) : '—')}</td>
          <td class="num">{j.files ?? '—'}</td><td class="num">{j.bytes ?? '—'}</td><td class="num">{j.durationS !== null ? formatDuration(j.durationS) : '—'}</td>
          <td class="tnum">{formatDateTime(j.startedAt)}</td>
          <td>{#if j.runId}<a href="/calistirmalar/{j.runId}" class="mono">{j.runId.slice(0, 8)}</a>{/if}</td>
        </tr>
      {:else}
        <tr><td colspan="7" class="muted">Henüz yedek işi yok.</td></tr>
      {/each}
    </Table>
  </Card>
</div>
