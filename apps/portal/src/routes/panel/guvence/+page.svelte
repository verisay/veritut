<script lang="ts">
  import { enhance } from '$app/forms';
  import { Card, Table, Button, StatusDot } from '@veritut/ui';
  import { CHANNEL_EVENTS, CHANNEL_EVENT_LABEL, CHANNEL_KINDS, CHANNEL_KIND_LABEL, DRILL_STATUS_LABEL, type ChannelKind } from '@veritut/types';
  import { formatDate, formatDateTime, formatDuration, formatMoney } from '@veritut/shared';
  let { data, form } = $props();
</script>

<svelte:head><title>Güvence — VERITUT</title></svelte:head>
<h1 class="vt-h1" style="margin-bottom:6px">Güvence</h1>
<p class="vt-lead" style="margin:0 0 24px">Hizmet seviyesi ölçümleri, geri dönüş tatbikatları, alarm kanallarınız ve denetçi erişimi.</p>
{#if form?.message}<div class="vt-status" data-state="down" style="margin-bottom:14px">{form.message}</div>{/if}
{#if form?.link}<Card title="Denetçi bağlantısı oluşturuldu" subtitle="Bu adresi denetçinizle paylaşın; kimlik istemez, süresi dolunca kapanır."><div class="vt-codebox" style="user-select:all">{form.link.url}</div></Card>{/if}

<div style="display:grid; gap:14px; margin-top:14px">
  <Card title="Hizmet seviyesi" subtitle="Uptime sondalarımızdan; planlı bakım düşülür. Kredi talebinize gerek yok." padded={false}>
    <Table minWidth={640}>
      {#snippet head()}<th>Dönem</th><th>İş yükü</th><th class="num">Uptime</th><th class="num">Hedef</th><th class="num">Kesinti</th><th class="num">Olay</th><th class="num">Kredi</th>{/snippet}
      {#each data.sla as s (s.id)}
        <tr>
          <td class="mono">{s.period}</td><td>{s.workloadName ?? '—'}</td>
          <td class="num"><span class="vt-state-text" data-state={Number(s.uptimePct) < Number(s.uptimeTarget) ? 'down' : 'ok'} style="font-weight:700">%{s.uptimePct}</span></td>
          <td class="num">%{s.uptimeTarget}</td><td class="num">{s.downtimeMin} dk</td><td class="num">{s.incidents}</td>
          <td class="num">{Number(s.creditAmount) > 0 ? formatMoney(Number(s.creditAmount), s.currency as 'TRY') : '—'}</td>
        </tr>
      {:else}
        <tr><td colspan="7" class="muted">Henüz ölçüm dönemi kapanmadı.</td></tr>
      {/each}
    </Table>
  </Card>

  <Card title="Geri dönüş tatbikatları" subtitle="Yedeğin geri döndüğünü ayda bir kanıtlarız" padded={false}>
    <Table minWidth={620}>
      {#snippet head()}<th></th><th>İş yükü</th><th>Tarih</th><th>Checksum</th><th>Uygulama</th><th class="num">Süre</th>{/snippet}
      {#each data.drills as d (d.id)}
        <tr>
          <td><StatusDot state={d.status === 'passed' ? 'ok' : d.status === 'failed' ? 'down' : 'maintenance'} small /></td>
          <td>{d.workloadName} <span class="vt-help">{DRILL_STATUS_LABEL[d.status]}</span></td>
          <td class="tnum">{d.finishedAt ? formatDateTime(d.finishedAt) : formatDate(d.scheduledFor)}</td>
          <td>{d.checksumOk === null ? '—' : d.checksumOk ? '✓' : '✕'}</td>
          <td>{d.appCheckOk === null ? '—' : d.appCheckOk ? '✓' : '✕'}</td>
          <td class="num">{d.durationS !== null ? formatDuration(d.durationS) : '—'}</td>
        </tr>
      {:else}
        <tr><td colspan="6" class="muted">Henüz tatbikat yok.</td></tr>
      {/each}
    </Table>
  </Card>

  {#if data.maintenance.length}
    <Card title="Planlı bakımlar" padded={false}>
      <Table minWidth={520}>
        {#snippet head()}<th>Bakım</th><th>Başlangıç</th><th>Bitiş</th>{/snippet}
        {#each data.maintenance as m (m.id)}<tr><td>{m.title}<p class="vt-help" style="margin:2px 0 0">{m.body}</p></td><td class="tnum">{formatDateTime(m.startsAt)}</td><td class="tnum">{formatDateTime(m.endsAt)}</td></tr>{/each}
      </Table>
    </Card>
  {/if}

  <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; align-items:start">
    <Card title="Alarm kanalları" subtitle="Olay ve tatbikat bildirimlerini kendi sisteminize alın">
      <div style="display:grid; gap:8px; margin-bottom:14px">
        {#each data.channels as c (c.id)}
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; border:1px solid var(--border); border-radius:10px; padding:10px 12px">
            <div>
              <p style="margin:0; font-weight:700; font-size:13.5px">{c.label} <span class="vt-help">{CHANNEL_KIND_LABEL[c.kind as ChannelKind]} · {c.targetHint}</span></p>
              <p class="vt-help" style="margin:2px 0 0">{c.events.map((e) => CHANNEL_EVENT_LABEL[e as keyof typeof CHANNEL_EVENT_LABEL] ?? e).join(', ')}</p>
              {#if c.lastError}<p class="vt-field-error" style="margin:2px 0 0">son hata: {c.lastError}</p>{/if}
            </div>
            <form method="POST" action="?/deleteChannel" use:enhance><input type="hidden" name="id" value={c.id} /><Button type="submit" size="sm" variant="ghost">Sil</Button></form>
          </div>
        {:else}
          <p class="vt-help" style="margin:0">Kanal tanımlı değil.</p>
        {/each}
      </div>
      <form method="POST" action="?/channel" use:enhance style="display:grid; gap:10px; border-top:1px solid var(--border); padding-top:12px">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px">
          <div><label class="vt-label" for="kind">Tür</label><select class="vt-input" id="kind" name="kind">{#each CHANNEL_KINDS as k (k)}<option value={k}>{CHANNEL_KIND_LABEL[k]}</option>{/each}</select></div>
          <div><label class="vt-label" for="label">Etiket</label><input class="vt-input" id="label" name="label" required /></div>
        </div>
        <div><label class="vt-label" for="target">Hedef (URL / e-posta / telefon)</label><input class="vt-input mono" id="target" name="target" required /><p class="vt-help" style="margin:4px 0 0">Şifreli saklanır; listede yalnız maskeli hâli görünür.</p></div>
        <div><span class="vt-label">Olaylar</span><div style="display:grid; gap:4px">{#each CHANNEL_EVENTS as e (e)}<label style="display:flex; gap:8px; align-items:center; font-size:13px"><input type="checkbox" name="events" value={e} checked={e === 'incident.opened' || e === 'incident.resolved'} /> {CHANNEL_EVENT_LABEL[e]}</label>{/each}</div></div>
        <Button type="submit" size="sm">Kanal ekle</Button>
      </form>
    </Card>

    <Card title="Denetçi bağlantıları" subtitle="Süreli, kimliksiz salt-okuma — olay içeriği paylaşılmaz">
      {#if !data.canManage}
        <p class="vt-help" style="margin:0">Denetçi bağlantısı için sahip veya yönetici rolü gerekir.</p>
      {:else}
        <div style="display:grid; gap:8px; margin-bottom:14px">
          {#each data.links as l (l.id)}
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; border:1px solid var(--border); border-radius:10px; padding:10px 12px; opacity:{l.revokedAt ? 0.5 : 1}">
              <div>
                <p style="margin:0; font-weight:700; font-size:13.5px">{l.label}</p>
                <p class="vt-help" style="margin:2px 0 0">{l.scope.join(', ')} · son geçerlilik {formatDate(l.expiresAt)}{#if l.lastUsedAt} · son kullanım {formatDateTime(l.lastUsedAt)}{/if}</p>
              </div>
              {#if !l.revokedAt}<form method="POST" action="?/revokeLink" use:enhance><input type="hidden" name="id" value={l.id} /><Button type="submit" size="sm" variant="ghost">İptal</Button></form>{:else}<span class="vt-help">iptal</span>{/if}
            </div>
          {:else}
            <p class="vt-help" style="margin:0">Bağlantı yok.</p>
          {/each}
        </div>
        <form method="POST" action="?/auditorLink" use:enhance style="display:grid; gap:10px; border-top:1px solid var(--border); padding-top:12px">
          <div><label class="vt-label" for="alabel">Etiket</label><input class="vt-input" id="alabel" name="label" required placeholder="ISO 27001 denetimi 2026" /></div>
          <div><span class="vt-label">Kapsam</span><div style="display:flex; gap:12px; flex-wrap:wrap">
            <label style="display:flex; gap:6px; align-items:center; font-size:13px"><input type="checkbox" name="scope" value="evidence" checked /> Kanıt zinciri</label>
            <label style="display:flex; gap:6px; align-items:center; font-size:13px"><input type="checkbox" name="scope" value="sla" checked /> SLA</label>
            <label style="display:flex; gap:6px; align-items:center; font-size:13px"><input type="checkbox" name="scope" value="subprocessors" /> Alt işleyenler</label>
          </div></div>
          <div><label class="vt-label" for="exp">Geçerlilik (gün)</label><input class="vt-input tnum" id="exp" name="expiresInDays" type="number" value="30" min="1" max="365" /></div>
          <Button type="submit" size="sm">Bağlantı oluştur</Button>
        </form>
      {/if}
    </Card>
  </div>
</div>
