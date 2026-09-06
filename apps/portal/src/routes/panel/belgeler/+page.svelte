<script lang="ts">
  import { enhance } from '$app/forms';
  import { Card, Table, Button } from '@veritut/ui';
  import { DOCUMENT_KIND_LABEL, type DocumentKind } from '@veritut/types';
  import { formatDateTime } from '@veritut/shared';
  let { data, form } = $props();
  const period = new Date().toISOString().slice(0, 7);
  const prevPeriod = (() => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
</script>

<svelte:head><title>Belgeler — VERITUT</title></svelte:head>
<h1 class="vt-h1" style="margin-bottom:6px">Belgeler</h1>
<p class="vt-lead" style="margin:0 0 24px">Denetimde "belgeyi kim verecek" sorusunun cevabı. Hepsi verinizden üretilir; elle doldurulan alan yok.</p>
{#if form?.message}<div class="vt-status" data-state="down" style="margin-bottom:14px">{form.message}</div>{/if}
{#if form?.generated}<div class="vt-status" data-state="ok" style="margin-bottom:14px">Belge üretildi.</div>{/if}

<div style="display:grid; grid-template-columns:1fr 320px; gap:14px; align-items:start">
  <Card padded={false}>
    <Table minWidth={640}>
      {#snippet head()}<th>Belge</th><th>Dönem</th><th class="num">Sürüm</th><th>SHA-256</th><th>Tarih</th><th></th>{/snippet}
      {#each data.documents as d (d.id)}
        <tr>
          <td>{DOCUMENT_KIND_LABEL[d.kind as DocumentKind] ?? d.kind}</td>
          <td class="mono">{d.period ?? '—'}</td>
          <td class="num">v{d.version}</td>
          <td class="mono" title={d.sha256} style="font-size:11px">{d.sha256.slice(0, 12)}…</td>
          <td class="tnum">{formatDateTime(d.createdAt)}</td>
          <td><a href="/api/v1/guvence/documents/{d.id}/download" class="vt-btn vt-btn-ghost vt-btn-sm" rel="external">İndir</a></td>
        </tr>
      {:else}
        <tr><td colspan="6" class="muted">Henüz belge yok — sağdan üretin.</td></tr>
      {/each}
    </Table>
  </Card>

  {#if data.canManage}
    <Card title="Belge üret">
      <div style="display:grid; gap:12px">
        <form method="POST" action="?/subprocessors" use:enhance><Button type="submit" variant="secondary" size="sm" fullWidth>Alt işleyen listesi</Button></form>
        <form method="POST" action="?/dpa" use:enhance><Button type="submit" variant="secondary" size="sm" fullWidth>Veri işleme sözleşmesi</Button></form>
        <form method="POST" action="?/slaReport" use:enhance style="display:grid; gap:6px">
          <input class="vt-input mono" name="period" value={prevPeriod} />
          <Button type="submit" variant="secondary" size="sm" fullWidth>Aylık SLA raporu</Button>
        </form>
        <form method="POST" action="?/evidenceBundle" use:enhance style="display:grid; gap:6px">
          <input class="vt-input mono" name="period" value={period} />
          <Button type="submit" size="sm" fullWidth>Kanıt paketi (PDF + JSON)</Button>
          <p class="vt-help" style="margin:0">Profesyonel ve üzeri planlarda.</p>
        </form>
      </div>
    </Card>
  {/if}
</div>
