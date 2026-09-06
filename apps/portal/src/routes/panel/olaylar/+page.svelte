<script lang="ts">
  import { Card, Table, StatusDot, EmptyState } from '@veritut/ui';
  import { INCIDENT_SEVERITY_LABEL, INCIDENT_STATUS_LABEL, type IncidentSeverity, type IncidentStatus } from '@veritut/types';
  import { formatDateTime } from '@veritut/shared';
  let { data } = $props();
</script>

<svelte:head><title>Olaylar — VERITUT</title></svelte:head>
<h1 class="vt-h1" style="margin-bottom:6px">Olaylar</h1>
<p class="vt-lead" style="margin:0 0 24px">Hizmetinizi etkileyen olaylar ve çözüm kayıtları. Kapattığımız her olay kanıt defterinize düşer.</p>
{#if data.incidents.length === 0}
  <EmptyState title="Açık veya geçmiş olay yok" text="Hizmetinizi etkileyen bir olay olduğunda burada ve alarm kanallarınızda görünür." />
{:else}
  <Card padded={false}>
    <Table minWidth={620}>
      {#snippet head()}<th></th><th>#</th><th>Olay</th><th>Ciddiyet</th><th>Durum</th><th>Açılış</th><th>Çözüm</th>{/snippet}
      {#each data.incidents as i (i.id)}
        <tr>
          <td><StatusDot state={i.resolvedAt ? 'ok' : 'degraded'} small /></td>
          <td class="num">{i.number}</td>
          <td><a href="/panel/olaylar/{i.id}">{i.title}</a></td>
          <td>{INCIDENT_SEVERITY_LABEL[i.severity as IncidentSeverity]?.split(' — ')[0] ?? i.severity}</td>
          <td>{INCIDENT_STATUS_LABEL[i.status as IncidentStatus] ?? i.status}</td>
          <td class="tnum">{formatDateTime(i.createdAt)}</td>
          <td class="tnum">{i.resolvedAt ? formatDateTime(i.resolvedAt) : '—'}</td>
        </tr>
      {/each}
    </Table>
  </Card>
{/if}
