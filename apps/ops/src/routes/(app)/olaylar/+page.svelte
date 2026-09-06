<script lang="ts">
  import { enhance } from '$app/forms';
  import { Card, Table, Button, StatusDot } from '@veritut/ui';
  import { INCIDENT_SEVERITY_LABEL, INCIDENT_STATUS_LABEL, INCIDENT_SEVERITIES, type IncidentSeverity, type IncidentStatus } from '@veritut/types';
  import { formatDateTime, formatRelative } from '@veritut/shared';
  let { data, form } = $props();
  const dot = (r: (typeof data.rows)[number]) => (r.incident.resolveBreached || r.incident.responseBreached ? 'down' : r.incident.status === 'resolved' || r.incident.status === 'postmortem_done' ? 'ok' : 'degraded');
</script>

<div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:20px; gap:16px; flex-wrap:wrap">
  <div><h1 class="vt-h1">Olaylar</h1><p class="vt-lead" style="margin:4px 0 0">SLA saati olay açıldığında başlar. Sev1/Sev2 post-mortem yazılmadan kapanmaz.</p></div>
  <div style="display:flex; gap:8px">
    <a href="/olaylar" class="vt-btn vt-btn-sm {data.acik ? 'vt-btn-ghost' : 'vt-btn-secondary'}">Hepsi</a>
    <a href="/olaylar?acik=1" class="vt-btn vt-btn-sm {data.acik ? 'vt-btn-secondary' : 'vt-btn-ghost'}">Açık</a>
  </div>
</div>
{#if form?.message}<div class="vt-status" data-state="down" style="margin-bottom:12px">{form.message}</div>{/if}

<div style="display:grid; grid-template-columns:1fr 340px; gap:14px; align-items:start">
  <div style="display:grid; gap:14px">
    <Card padded={false}>
      <Table minWidth={860}>
        {#snippet head()}<th></th><th>#</th><th>Olay</th><th>Kiracı</th><th>Ciddiyet</th><th>Durum</th><th>Yanıt hedefi</th><th>Çözüm hedefi</th><th>Açılış</th>{/snippet}
        {#each data.rows as r (r.incident.id)}
          <tr>
            <td><StatusDot state={dot(r)} small /></td>
            <td class="num">{r.incident.number}</td>
            <td><a href="/olaylar/{r.incident.id}">{r.incident.title}</a>{#if r.incident.customerVisible}<span class="vt-help"> · müşteriye açık</span>{/if}</td>
            <td>{r.tenantName ?? 'platform'}</td>
            <td>{INCIDENT_SEVERITY_LABEL[r.incident.severity as IncidentSeverity]?.split(' — ')[0] ?? r.incident.severity}</td>
            <td>{INCIDENT_STATUS_LABEL[r.incident.status as IncidentStatus] ?? r.incident.status}</td>
            <td class="tnum"><span class="vt-state-text" data-state={r.incident.responseBreached ? 'down' : 'ok'}>{r.incident.respondedAt ? `✓ ${formatRelative(r.incident.respondedAt)}` : r.incident.responseDueAt ? formatRelative(r.incident.responseDueAt) : '—'}</span></td>
            <td class="tnum"><span class="vt-state-text" data-state={r.incident.resolveBreached ? 'down' : 'ok'}>{r.incident.resolvedAt ? `✓ ${formatRelative(r.incident.resolvedAt)}` : r.incident.resolveDueAt ? formatRelative(r.incident.resolveDueAt) : '—'}</span></td>
            <td class="tnum muted">{formatDateTime(r.incident.createdAt)}</td>
          </tr>
        {:else}
          <tr><td colspan="9" class="muted">Olay yok.</td></tr>
        {/each}
      </Table>
    </Card>

    <Card title="Alarm gürültüsü" subtitle="Son 7 gün — olaya dönüşmeyen tekrarlar otomasyon borcudur" padded={false}>
      <Table minWidth={420}>
        {#snippet head()}<th>Alarm</th><th class="num">Tekrar</th><th class="num">Olaya dönüşen</th>{/snippet}
        {#each data.alerts.noise as n (n.alertname)}
          <tr><td class="mono">{n.alertname}</td><td class="num">{n.n}</td><td class="num">{n.incidents}</td></tr>
        {:else}
          <tr><td colspan="3" class="muted">Alarm yok.</td></tr>
        {/each}
      </Table>
    </Card>
  </div>

  <Card title="Elle olay aç" subtitle="Alarmdan gelmeyen olaylar (müşteri bildirimi, planlı müdahale)">
    <form method="POST" action="?/create" use:enhance style="display:grid; gap:10px">
      <div><label class="vt-label" for="title">Başlık</label><input class="vt-input" id="title" name="title" required minlength="4" /></div>
      <div><label class="vt-label" for="severity">Ciddiyet</label><select class="vt-input" id="severity" name="severity">{#each INCIDENT_SEVERITIES as s (s)}<option value={s} selected={s === 'sev3'}>{INCIDENT_SEVERITY_LABEL[s]}</option>{/each}</select></div>
      <div><label class="vt-label" for="tenantId">Kiracı</label><select class="vt-input" id="tenantId" name="tenantId"><option value="">Platform</option>{#each data.tenants as t (t.id)}<option value={t.id}>{t.name}</option>{/each}</select></div>
      <div><label class="vt-label" for="workloadIds">İş yükleri</label><select class="vt-input" id="workloadIds" name="workloadIds" multiple size="4" style="height:auto">{#each data.workloads as w (w.id)}<option value={w.id}>{w.tenantName} / {w.name}</option>{/each}</select></div>
      <div><label class="vt-label" for="summary">Özet</label><textarea class="vt-input" id="summary" name="summary" rows="3" style="height:auto; padding:8px 12px"></textarea></div>
      <label style="display:flex; gap:8px; align-items:center; font-size:13px"><input type="checkbox" name="customerVisible" /> Müşteriye açık</label>
      <Button type="submit">Olayı aç</Button>
    </form>
  </Card>
</div>
