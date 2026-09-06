<script lang="ts">
  import { enhance } from '$app/forms';
  import { Card, Table, Button } from '@veritut/ui';
  import { formatDateTime } from '@veritut/shared';
  let { data, form } = $props();
</script>

<div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:20px; gap:16px; flex-wrap:wrap">
  <div><h1 class="vt-h1">Yapılandırma sapmaları</h1><p class="vt-lead" style="margin:4px 0 0">Gece taraması. "Üretime elle müdahale yasak" kuralının denetçisi budur.</p></div>
  <div style="display:flex; gap:8px">
    <a href="/sapmalar" class="vt-btn vt-btn-sm {data.yeni ? 'vt-btn-ghost' : 'vt-btn-secondary'}">Hepsi</a>
    <a href="/sapmalar?yeni=1" class="vt-btn vt-btn-sm {data.yeni ? 'vt-btn-secondary' : 'vt-btn-ghost'}">Onay bekleyen</a>
    <form method="POST" action="?/scan" use:enhance><Button type="submit" size="sm" variant="ghost">Şimdi tara</Button></form>
  </div>
</div>
{#if form?.scan}<div class="vt-status" data-state="ok" style="margin-bottom:12px">Tarama kuyruğa verildi: {JSON.stringify(form.scan)}</div>{/if}

<Card padded={false}>
  <Table minWidth={760}>
    {#snippet head()}<th>İş yükü</th><th class="num">+</th><th class="num">~</th><th class="num">-</th><th class="num">±</th><th>Kaynaklar</th><th>Tarih</th><th></th>{/snippet}
    {#each data.rows as r (r.drift.id)}
      <tr>
        <td><a href="/is-yukleri/{r.workloadSlug}">{r.workloadName}</a></td>
        <td class="num">{r.drift.diff.add}</td><td class="num">{r.drift.diff.change}</td><td class="num">{r.drift.diff.destroy}</td><td class="num">{r.drift.diff.replace}</td>
        <td class="mono" style="font-size:11.5px">{r.drift.diff.resources.filter((x) => x.action !== 'no-op').slice(0, 3).map((x) => `${x.action} ${x.address}`).join(' · ')}</td>
        <td class="tnum">{formatDateTime(r.drift.createdAt)}</td>
        <td>{#if r.drift.acknowledgedBy}<span class="vt-help">onaylandı</span>{:else}<form method="POST" action="?/ack" use:enhance><input type="hidden" name="id" value={r.drift.id} /><Button type="submit" size="sm" variant="ghost">Gördüm</Button></form>{/if}</td>
      </tr>
    {:else}
      <tr><td colspan="8" class="muted">Sapma yok — üretim kodla aynı.</td></tr>
    {/each}
  </Table>
</Card>
