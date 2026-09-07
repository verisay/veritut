<script lang="ts">
  import { Card, PageHead } from '@veritut/ui';
  import { INCIDENT_SEVERITY_LABEL, INCIDENT_STATUS_LABEL, type IncidentSeverity, type IncidentStatus } from '@veritut/types';
  import { formatDateTime } from '@veritut/shared';
  let { data } = $props();
  const i = $derived(data.incident);
</script>

<svelte:head><title>{i.title} — VERITUT</title></svelte:head>
<p class="vt-kicker"><a href="/panel/olaylar">Olaylar</a> / #{i.number}</p>
<PageHead title={i.title} eyebrow="olaylar" />
<p class="vt-help" style="margin:0 0 20px">{INCIDENT_SEVERITY_LABEL[i.severity as IncidentSeverity]} · {INCIDENT_STATUS_LABEL[i.status as IncidentStatus]} · açılış {formatDateTime(i.createdAt)}{#if i.resolvedAt} · çözüm {formatDateTime(i.resolvedAt)}{/if}</p>

<div style="max-width:760px; display:grid; gap:10px">
  {#if data.workloads.length}
    <Card title="Etkilenen iş yükleri"><p style="margin:0; font-size:13.5px">{data.workloads.map((w) => w.name).join(', ')}</p></Card>
  {/if}
  {#each data.updates as u (u.id)}
    <Card>
      <p class="vt-kicker" style="margin:0 0 6px">{formatDateTime(u.createdAt)}</p>
      <p style="margin:0; white-space:pre-wrap; font-size:14px; line-height:1.6">{u.body}</p>
    </Card>
  {/each}
</div>
