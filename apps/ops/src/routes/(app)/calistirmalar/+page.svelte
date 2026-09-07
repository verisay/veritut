<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button, Card, PageHead, Table } from '@veritut/ui';
  import { RUN_STATUS_LABEL, type RunStatus } from '@veritut/types';
  import { formatDateTime } from '@veritut/shared';
  let { data } = $props();
</script>

<PageHead title="Çalıştırmalar" variant="ops">
  {#snippet actions()}<form method="POST" action="?/echo" use:enhance><Button type="submit" variant="soft">Echo çalıştırması başlat</Button></form>{/snippet}
</PageHead>
<Card padded={false}>
  <Table>
    {#snippet head()}<th>Çalıştırma</th><th>Tür</th><th>Risk</th><th>Durum</th><th>Başlangıç</th><th class="num">Çıkış</th>{/snippet}
    {#each data.runs as r (r.id)}
      <tr>
        <td><a href="/calistirmalar/{r.id}" class="mono">{r.id.slice(0, 8)}</a></td>
        <td class="mono">{r.kind}</td>
        <td>{r.risk}</td>
        <td>{RUN_STATUS_LABEL[r.status as RunStatus] ?? r.status}</td>
        <td class="tnum">{formatDateTime(r.createdAt)}</td>
        <td class="num">{r.exitCode ?? '—'}</td>
      </tr>
    {:else}
      <tr><td colspan="6" class="muted">Henüz çalıştırma yok — Echo ile boru hattını deneyin.</td></tr>
    {/each}
  </Table>
</Card>
