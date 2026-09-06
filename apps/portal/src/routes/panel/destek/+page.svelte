<script lang="ts">
  import { enhance } from '$app/forms';
  import { Card, Table, Button } from '@veritut/ui';
  import { TICKET_STATE_LABEL, type TicketState } from '@veritut/types';
  import { formatRelative } from '@veritut/shared';
  let { data, form } = $props();
</script>

<svelte:head><title>Destek — VERITUT</title></svelte:head>
<h1 class="vt-h1" style="margin-bottom:6px">Destek</h1>
<p class="vt-lead" style="margin:0 0 24px">Tek muhatap. Talebiniz destek masamıza düşer; yanıtlar burada ve e-postanızda görünür.</p>

<div style="display:grid; grid-template-columns:1fr 360px; gap:14px; align-items:start">
  <Card padded={false}>
    <Table minWidth={520}>
      {#snippet head()}<th>Talep</th><th>Durum</th><th>Öncelik</th><th>Son hareket</th>{/snippet}
      {#each data.tickets as t (t.id)}
        <tr><td><a href="/panel/destek/{t.id}">{t.title}</a> <span class="mono muted" style="font-size:11px">{t.number}</span></td><td>{TICKET_STATE_LABEL[t.state as TicketState] ?? t.state}</td><td>{t.priority}</td><td class="muted">{formatRelative(t.lastActivityAt ?? t.createdAt)}</td></tr>
      {:else}
        <tr><td colspan="4" class="muted">Henüz talep yok.</td></tr>
      {/each}
    </Table>
  </Card>

  <Card title="Yeni talep">
    <form method="POST" action="?/create" use:enhance style="display:grid; gap:10px">
      <div><label class="vt-label" for="title">Konu</label><input class="vt-input" id="title" name="title" required minlength="4" value={form?.values?.title ?? ''} /></div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px">
        <div><label class="vt-label" for="priority">Öncelik</label><select class="vt-input" id="priority" name="priority"><option value="low">Düşük</option><option value="normal" selected>Normal</option><option value="high">Yüksek</option><option value="urgent">Acil</option></select></div>
        <div><label class="vt-label" for="workloadId">İş yükü</label><select class="vt-input" id="workloadId" name="workloadId"><option value="">—</option>{#each data.workloads as w (w.id)}<option value={w.id}>{w.name}</option>{/each}</select></div>
      </div>
      <div><label class="vt-label" for="body">Açıklama</label><textarea class="vt-input" id="body" name="body" rows="5" required minlength="4" style="height:auto; padding:8px 12px">{form?.values?.body ?? ''}</textarea></div>
      {#if form?.message}<p class="vt-field-error">{form.message}</p>{/if}
      <Button type="submit">Talebi gönder</Button>
    </form>
  </Card>
</div>
