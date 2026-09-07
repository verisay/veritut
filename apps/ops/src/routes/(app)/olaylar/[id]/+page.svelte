<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button, Card, PageHead, StatusDot } from '@veritut/ui';
  import { INCIDENT_SEVERITY_LABEL, INCIDENT_STATUS_LABEL, INCIDENT_STATUSES, POSTMORTEM_REQUIRED, type IncidentSeverity, type IncidentStatus } from '@veritut/types';
  import { formatDateTime, formatDuration } from '@veritut/shared';
  let { data, form } = $props();
  const i = $derived(data.d.incident);
  const needsPostmortem = $derived(POSTMORTEM_REQUIRED.includes(i.severity as IncidentSeverity) && i.status === 'resolved');
</script>

<p class="vt-kicker"><a href="/olaylar">Olaylar</a> / #{i.number}</p>
<PageHead title={i.title} eyebrow="olaylar" variant="ops" />
<p class="vt-help" style="margin:0 0 6px">
  {INCIDENT_SEVERITY_LABEL[i.severity as IncidentSeverity]} · {INCIDENT_STATUS_LABEL[i.status as IncidentStatus]} · SLA <span class="mono">{i.slaCode ?? '—'}</span> · açılış {formatDateTime(i.createdAt)}
  {#if i.customerVisible} · müşteriye açık{/if}{#if i.escalatedAt} · eskalasyon {formatDateTime(i.escalatedAt)}{/if}
</p>
{#if form?.message}<div class="vt-status" data-state="down" style="margin:12px 0">{form.message}</div>{/if}

<div style="display:grid; grid-template-columns:1fr 320px; gap:14px; align-items:start; margin-top:14px">
  <div style="display:grid; gap:14px">
    <Card title="Zaman çizgisi" padded={false}>
      <div style="display:grid">
        {#each data.d.updates as u (u.id)}
          <div style="padding:14px 22px; border-bottom:1px solid var(--border)">
            <p class="vt-kicker" style="margin:0 0 4px">{formatDateTime(u.createdAt)} · {u.author}{#if u.status} · {INCIDENT_STATUS_LABEL[u.status as IncidentStatus]}{/if}{#if u.customerVisible} · müşteriye görünür{/if}</p>
            <p style="margin:0; white-space:pre-wrap; font-size:13.5px">{u.body}</p>
          </div>
        {/each}
      </div>
    </Card>

    {#if i.status !== 'resolved' && i.status !== 'postmortem_done'}
      <Card title="Güncelleme ekle">
        <form method="POST" action="?/update" use:enhance style="display:grid; gap:10px">
          <textarea class="vt-input" name="body" rows="3" required minlength="2" style="height:auto; padding:8px 12px"></textarea>
          <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap">
            <select class="vt-input" name="status" style="width:auto"><option value="">Durum değişmesin</option>{#each INCIDENT_STATUSES.filter((s) => s !== 'postmortem_done') as s (s)}<option value={s}>{INCIDENT_STATUS_LABEL[s]}</option>{/each}</select>
            <label style="display:flex; gap:8px; align-items:center; font-size:13px"><input type="checkbox" name="customerVisible" /> Müşteriye göster</label>
            <Button type="submit" size="sm">Ekle</Button>
          </div>
        </form>
      </Card>
      <Card title="Olayı çöz">
        <form method="POST" action="?/resolve" use:enhance style="display:grid; gap:10px">
          <textarea class="vt-input" name="body" rows="2" required minlength="2" placeholder="Kök neden ve alınan aksiyon" style="height:auto; padding:8px 12px"></textarea>
          <div style="display:flex; gap:12px; align-items:center">
            <label style="display:flex; gap:8px; align-items:center; font-size:13px"><input type="checkbox" name="customerVisible" checked /> Müşteriye bildir</label>
            <Button type="submit" size="sm" variant="soft">Çözüldü olarak işaretle</Button>
          </div>
        </form>
      </Card>
    {/if}

    {#if needsPostmortem}
      <Card title="Post-mortem (zorunlu)" subtitle="Sev1/Sev2 olaylar post-mortem yazılmadan kapanmaz">
        <form method="POST" action="?/postmortem" use:enhance style="display:grid; gap:10px">
          <textarea class="vt-input" name="postmortem" rows="8" required minlength="50" placeholder="Ne oldu · neden oldu · nasıl fark ettik · ne yaptık · tekrarını nasıl önleyeceğiz" style="height:auto; padding:8px 12px"></textarea>
          <Button type="submit">Post-mortem'i kaydet ve olayı kapat</Button>
        </form>
      </Card>
    {:else if i.postmortem}
      <Card title="Post-mortem"><p style="margin:0; white-space:pre-wrap; font-size:13.5px">{i.postmortem}</p></Card>
    {/if}
  </div>

  <div style="display:grid; gap:14px">
    <Card title="SLA saati">
      <div style="display:grid; gap:8px; font-size:13px">
        <div style="display:flex; justify-content:space-between; gap:10px"><span class="muted">İlk yanıt</span><span style="display:flex; gap:6px; align-items:center"><StatusDot state={i.responseBreached ? 'down' : i.respondedAt ? 'ok' : 'degraded'} small />{i.respondedAt ? formatDateTime(i.respondedAt) : i.responseDueAt ? `hedef ${formatDateTime(i.responseDueAt)}` : '—'}</span></div>
        <div style="display:flex; justify-content:space-between; gap:10px"><span class="muted">Çözüm</span><span style="display:flex; gap:6px; align-items:center"><StatusDot state={i.resolveBreached ? 'down' : i.resolvedAt ? 'ok' : 'degraded'} small />{i.resolvedAt ? formatDateTime(i.resolvedAt) : i.resolveDueAt ? `hedef ${formatDateTime(i.resolveDueAt)}` : '—'}</span></div>
        <div style="display:flex; justify-content:space-between"><span class="muted">Duran süre</span><span class="tnum">{formatDuration(i.clockPausedS)}</span></div>
      </div>
      {#if i.status !== 'resolved' && i.status !== 'postmortem_done'}
        <form method="POST" action="?/pause" use:enhance style="margin-top:12px">
          <input type="hidden" name="paused" value={i.pausedAt ? 'false' : 'true'} />
          <Button type="submit" size="sm" variant={i.pausedAt ? 'soft' : 'ghost'}>{i.pausedAt ? 'Saati devam ettir' : 'Müşteri bekleniyor — saati durdur'}</Button>
        </form>
      {/if}
    </Card>
    {#if data.d.workloads.length}
      <Card title="Etkilenen iş yükleri">
        <ul style="margin:0; padding:0; list-style:none; display:grid; gap:6px; font-size:13px">
          {#each data.d.workloads as w (w.id)}<li><a href="/is-yukleri/{w.id}">{w.name}</a> <span class="mono muted">{w.slug}</span></li>{/each}
        </ul>
      </Card>
    {/if}
  </div>
</div>
