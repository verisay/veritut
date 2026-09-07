<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button, Card, PageHead } from '@veritut/ui';
  import { NOTIFICATION_KIND_LABEL, type NotificationKind } from '@veritut/types';
  import { formatRelative } from '@veritut/shared';
  let { data } = $props();
</script>

<PageHead title="Bildirimler" variant="ops" />
<div style="display:grid; gap:10px; max-width:820px">
  {#each data.items as n (n.id)}
    <Card>
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start">
        <div>
          <p class="vt-kicker" style="margin:0 0 4px">{NOTIFICATION_KIND_LABEL[n.kind as NotificationKind] ?? n.kind} · {formatRelative(n.createdAt)}</p>
          <p style="margin:0; font-weight:{n.readAt ? 500 : 800}">{n.title}</p>
          {#if n.body}<p class="vt-help" style="margin:4px 0 0">{n.body}</p>{/if}
          {#if n.link}<a href={n.link} style="font-size:13px; font-weight:700">Aç →</a>{/if}
        </div>
        {#if !n.readAt}<form method="POST" action="?/read" use:enhance><input type="hidden" name="id" value={n.id} /><Button type="submit" size="sm" variant="ghost">Okundu</Button></form>{/if}
      </div>
    </Card>
  {:else}
    <p class="muted">Bildirim yok.</p>
  {/each}
</div>
