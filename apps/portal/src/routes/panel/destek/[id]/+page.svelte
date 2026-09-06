<script lang="ts">
  import { enhance } from '$app/forms';
  import { Card, Button } from '@veritut/ui';
  import { TICKET_STATE_LABEL, type TicketState } from '@veritut/types';
  import { formatDateTime } from '@veritut/shared';
  let { data, form } = $props();
  const t = $derived(data.ticket);
</script>

<svelte:head><title>{t.title} — VERITUT destek</title></svelte:head>
<p class="vt-kicker"><a href="/panel/destek">Destek</a> / {t.number}</p>
<h1 class="vt-h1" style="margin:4px 0 6px">{t.title}</h1>
<p class="vt-help" style="margin:0 0 20px">{TICKET_STATE_LABEL[t.state as TicketState] ?? t.state} · öncelik {t.priority} · açılış {formatDateTime(t.createdAt)}</p>

<div style="max-width:760px; display:grid; gap:10px">
  {#each data.messages as m (m.id)}
    <div class="vt-card vt-card-pad" style="border-color:{m.fromCustomer ? 'var(--border)' : 'var(--accent-bd)'}">
      <p class="vt-kicker" style="margin:0 0 6px">{m.fromCustomer ? m.author : `VERITUT · ${m.author}`} · {formatDateTime(m.createdAt)}</p>
      <p style="margin:0; white-space:pre-wrap; font-size:14px; line-height:1.6">{m.body}</p>
    </div>
  {/each}
  <Card title="Yanıt yaz">
    <form method="POST" action="?/reply" use:enhance style="display:grid; gap:10px">
      <textarea class="vt-input" name="body" rows="4" required style="height:auto; padding:8px 12px"></textarea>
      {#if form?.message}<p class="vt-field-error">{form.message}</p>{/if}
      <div><Button type="submit">Gönder</Button></div>
    </form>
  </Card>
</div>
