<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button, Card, PageHead, ResidencyBadge, StatusDot, Table } from '@veritut/ui';
  import { PROVIDERS, RESIDENCIES } from '@veritut/types';
  import { formatDateTime, formatDuration } from '@veritut/shared';
  let { data, form } = $props();
</script>

<PageHead title="Yedekler" variant="ops" />
<p class="vt-lead" style="margin:0 0 20px">Restic, 3-2-1: offsite kopya farklı tedarikçide, ikametgâh kuralına tabi. Her sonuç kanıt zincirine düşer.</p>
<div style="display:grid; grid-template-columns:1fr 380px; gap:14px; align-items:start">
  <div style="display:grid; gap:14px">
    <Card title="Depolar" padded={false}>
      <Table minWidth={600}>
        {#snippet head()}<th>Depo</th><th>Tedarikçi</th><th>İkametgâh</th><th>URL</th>{/snippet}
        {#each data.repos as r (r.id)}
          <tr><td>{r.label}</td><td class="mono">{r.providerCode}</td><td><ResidencyBadge residency={r.residency} small /></td><td class="mono muted" style="font-size:11.5px">{r.repoUrl.replace(/\/\/[^@]+@/, '//[redakte]@')}</td></tr>
        {:else}
          <tr><td colspan="4" class="muted">Henüz depo yok.</td></tr>
        {/each}
      </Table>
    </Card>
    <Card title="Son yedek işleri" padded={false}>
      <Table minWidth={700}>
        {#snippet head()}<th></th><th>İş yükü</th><th>Snapshot</th><th class="num">Bayt</th><th class="num">Süre</th><th>Zaman</th><th>Kanıt</th>{/snippet}
        {#each data.jobs as j (j.id)}
          <tr>
            <td><StatusDot state={j.status === 'completed' ? 'ok' : j.status === 'failed' ? 'down' : 'maintenance'} small /></td>
            <td><a href="/is-yukleri/{j.workloadId}">{j.workloadName}</a></td>
            <td class="mono">{j.snapshotId ?? (j.error ? j.error.slice(0, 50) : '—')}</td>
            <td class="num">{j.bytes ?? '—'}</td><td class="num">{j.durationS !== null ? formatDuration(j.durationS) : '—'}</td>
            <td class="tnum">{formatDateTime(j.startedAt)}</td>
            <td>{#if j.evidenceId}<span class="vt-state-text" data-state="ok" style="font-size:12px; font-weight:700">✓ zincirde</span>{/if}</td>
          </tr>
        {:else}
          <tr><td colspan="7" class="muted">Henüz yedek işi yok.</td></tr>
        {/each}
      </Table>
    </Card>
  </div>
  <Card title="Yeni depo" subtitle="Kimlik bilgisi (RESTIC_PASSWORD, AWS_*) mühürlenir">
    <form method="POST" action="?/repo" use:enhance style="display:grid; gap:10px">
      <div><label class="vt-label" for="label">Etiket</label><input class="vt-input" id="label" name="label" required /></div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px">
        <div><label class="vt-label" for="providerCode">Tedarikçi</label><select class="vt-input" id="providerCode" name="providerCode">{#each PROVIDERS as p (p)}<option value={p}>{p}</option>{/each}</select></div>
        <div><label class="vt-label" for="residency">İkametgâh</label><select class="vt-input" id="residency" name="residency">{#each RESIDENCIES as r (r)}<option value={r}>{r}</option>{/each}</select></div>
      </div>
      <div><label class="vt-label" for="providerAccountId">Tedarikçi hesabı (ops.)</label><select class="vt-input" id="providerAccountId" name="providerAccountId"><option value="">—</option>{#each data.accounts as a (a.id)}<option value={a.id}>{a.providerCode}/{a.label}</option>{/each}</select></div>
      <div><label class="vt-label" for="repoUrl">Restic repo URL</label><input class="vt-input mono" id="repoUrl" name="repoUrl" placeholder="s3:http://veritut-minio:9000/veritut-backups/nc" required /></div>
      <div><label class="vt-label" for="credentials">Kimlik (ANAHTAR=değer)</label><textarea class="vt-input mono" id="credentials" name="credentials" rows="3" style="height:auto; padding:8px 12px" placeholder="RESTIC_PASSWORD=…&#10;AWS_ACCESS_KEY_ID=…&#10;AWS_SECRET_ACCESS_KEY=…"></textarea></div>
      {#if form?.message}<p class="vt-field-error">{form.message}</p>{/if}
      <Button type="submit">Depoyu mühürle ve kaydet</Button>
    </form>
  </Card>
</div>
