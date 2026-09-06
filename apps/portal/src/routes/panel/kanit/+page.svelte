<script lang="ts">
  import { Card, HashChip, Table, EmptyState } from '@veritut/ui';
  import { EVIDENCE_KIND_LABEL, isEvidenceKind } from '@veritut/types';
  import { formatDateTime, shortHash } from '@veritut/shared';
  let { data } = $props();
</script>

<h1 class="vt-h1">Kanıt Defteri</h1>
<p class="vt-lead" style="margin:4px 0 24px">Değiştirilemez, hash zincirli kayıt. Kırık zincir gizlenmez.</p>

{#if data.verdict && data.verdict.checked > 0}
  <div style="margin-bottom:18px"><HashChip hash={data.verdict.lastHash ?? ''} broken={!data.verdict.ok} label={data.verdict.ok ? `zincir bütün · ${data.verdict.checked} olay` : `seq ${data.verdict.brokenAt}'de kopuk`} /></div>
{/if}

{#if data.events.length === 0}
  <EmptyState title="Henüz kanıt yok" text="İlk yedek, tatbikat veya kurulum tamamlandığında burada görünür." />
{:else}
  <Card padded={false}>
    <Table>
      {#snippet head()}
        <th>#</th><th>Olay</th><th>Konu</th><th>Zaman</th><th>Aktör</th><th>Hash</th>
      {/snippet}
      {#each data.events as e (e.id)}
        <tr>
          <td class="num">{e.seq}</td>
          <td>{isEvidenceKind(e.kind) ? EVIDENCE_KIND_LABEL[e.kind] : e.kind}</td>
          <td class="mono">{e.subjectType}/{e.subjectId}</td>
          <td class="tnum">{formatDateTime(e.occurredAt)}</td>
          <td class="muted">{e.actor}</td>
          <td class="mono" title={e.hash}>{shortHash(e.hash)}</td>
        </tr>
      {/each}
    </Table>
  </Card>
{/if}
