<script lang="ts">
  import { enhance } from '$app/forms';
  import { Card, HashChip, Table, Button } from '@veritut/ui';
  import { EVIDENCE_KIND_LABEL, isEvidenceKind } from '@veritut/types';
  import { formatDateTime, shortHash } from '@veritut/shared';
  let { data } = $props();
  const d = $derived(data.data);
</script>

<div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:20px; gap:16px">
  <div><h1 class="vt-h1">Kanıt Defteri — platform</h1><p class="vt-lead" style="margin:4px 0 0">VERITUT'un kendi zinciri. Aylık çapa /guvence'de yayımlanır.</p></div>
  <form method="POST" action="?/demo" use:enhance><Button type="submit" variant="secondary" size="sm">Demo kanıt ekle (dev)</Button></form>
</div>
{#if d.verdict.checked > 0}
  <div style="margin-bottom:16px"><HashChip hash={d.verdict.lastHash ?? ''} broken={!d.verdict.ok} label={d.verdict.ok ? `zincir bütün · ${d.verdict.checked} olay` : `seq ${d.verdict.brokenAt}'de kopuk`} /></div>
{/if}
<Card padded={false}>
  <Table>
    {#snippet head()}<th class="num">#</th><th>Olay</th><th>Konu</th><th>Zaman</th><th>Aktör</th><th>Hash</th>{/snippet}
    {#each d.events as e (e.id)}
      <tr><td class="num">{e.seq}</td><td>{isEvidenceKind(e.kind) ? EVIDENCE_KIND_LABEL[e.kind] : e.kind}</td><td class="mono">{e.subjectType}/{e.subjectId}</td><td class="tnum">{formatDateTime(e.occurredAt)}</td><td class="muted">{e.actor}</td><td class="mono" title={e.hash}>{shortHash(e.hash)}</td></tr>
    {:else}
      <tr><td colspan="6" class="muted">Henüz platform kanıtı yok.</td></tr>
    {/each}
  </Table>
</Card>
