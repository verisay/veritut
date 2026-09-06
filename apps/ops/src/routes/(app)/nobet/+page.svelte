<script lang="ts">
  import { enhance } from '$app/forms';
  import { Card, Table, Button } from '@veritut/ui';
  import { formatDateTime } from '@veritut/shared';
  let { data, form } = $props();
  const staffList = $derived([...new Map(data.shifts.map((s) => [s.staffId, { id: s.staffId, name: s.name, email: s.email }])).values()]);
</script>

<h1 class="vt-h1" style="margin-bottom:6px">Nöbet ve bakım</h1>
<p class="vt-lead" style="margin:0 0 20px">Nöbetçi atanmamışsa eskalasyon tüm operatörlere düşer — sistem sessiz kalmaz.</p>
{#if form?.message}<div class="vt-status" data-state="down" style="margin-bottom:12px">{form.message}</div>{/if}

<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:14px; margin-bottom:14px">
  <Card><p class="vt-kicker">Şu an nöbetçi</p><p class="vt-h3" style="margin:4px 0 0">{data.current?.name ?? 'ATANMAMIŞ'}</p><p class="vt-help">{data.current?.email ?? 'eskalasyon tüm operatörlere gider'}</p></Card>
  <Card><p class="vt-kicker">Yedek (2. seviye)</p><p class="vt-h3" style="margin:4px 0 0">{data.backup?.name ?? '—'}</p><p class="vt-help">{data.backup?.email ?? ''}</p></Card>
</div>

<div style="display:grid; grid-template-columns:1fr 340px; gap:14px; align-items:start">
  <div style="display:grid; gap:14px">
    <Card title="Nöbet takvimi" padded={false}>
      <Table minWidth={520}>
        {#snippet head()}<th>Kişi</th><th>Seviye</th><th>Başlangıç</th><th>Bitiş</th><th></th>{/snippet}
        {#each data.shifts as s (s.id)}
          <tr><td>{s.name} <span class="muted">{s.email}</span></td><td class="num">{s.level}</td><td class="tnum">{formatDateTime(s.startsAt)}</td><td class="tnum">{formatDateTime(s.endsAt)}</td><td><form method="POST" action="?/deleteShift" use:enhance><input type="hidden" name="id" value={s.id} /><Button type="submit" size="sm" variant="ghost">Sil</Button></form></td></tr>
        {:else}
          <tr><td colspan="5" class="muted">Nöbet tanımlı değil.</td></tr>
        {/each}
      </Table>
    </Card>
    <Card title="Bakım pencereleri" subtitle="Planlı bakım uptime hesabından düşülür" padded={false}>
      <Table minWidth={560}>
        {#snippet head()}<th>Bakım</th><th>Başlangıç</th><th>Bitiş</th><th>Görünürlük</th>{/snippet}
        {#each data.maintenance as m (m.id)}
          <tr><td>{m.title}</td><td class="tnum">{formatDateTime(m.startsAt)}</td><td class="tnum">{formatDateTime(m.endsAt)}</td><td>{m.customerVisible ? 'müşteriye açık' : 'iç'}</td></tr>
        {:else}
          <tr><td colspan="4" class="muted">Planlı bakım yok.</td></tr>
        {/each}
      </Table>
    </Card>
  </div>

  <div style="display:grid; gap:14px">
    <Card title="Nöbet ekle">
      <form method="POST" action="?/shift" use:enhance style="display:grid; gap:10px">
        <div><label class="vt-label" for="staffId">Kişi</label><select class="vt-input" id="staffId" name="staffId" required>{#each staffList as s (s.id)}<option value={s.id}>{s.name}</option>{/each}</select>{#if staffList.length === 0}<p class="vt-help">Önce bir nöbet ekleyerek personel listesi oluşur; ilk kayıt için kimlik gerekir.</p>{/if}</div>
        <div><label class="vt-label" for="startsAt">Başlangıç</label><input class="vt-input" id="startsAt" name="startsAt" type="datetime-local" required /></div>
        <div><label class="vt-label" for="endsAt">Bitiş</label><input class="vt-input" id="endsAt" name="endsAt" type="datetime-local" required /></div>
        <div><label class="vt-label" for="escalationLevel">Seviye</label><select class="vt-input" id="escalationLevel" name="escalationLevel"><option value="1">1 — birincil</option><option value="2">2 — yedek</option><option value="3">3 — yönetim</option></select></div>
        <Button type="submit">Ekle</Button>
      </form>
    </Card>
    <Card title="Bakım penceresi">
      <form method="POST" action="?/maintenance" use:enhance style="display:grid; gap:10px">
        <div><label class="vt-label" for="mtitle">Başlık</label><input class="vt-input" id="mtitle" name="title" required minlength="4" /></div>
        <div><label class="vt-label" for="mtenant">Kiracı</label><select class="vt-input" id="mtenant" name="tenantId"><option value="">Platform (herkes)</option>{#each data.tenants as t (t.id)}<option value={t.id}>{t.name}</option>{/each}</select></div>
        <div><label class="vt-label" for="mworkload">İş yükü</label><select class="vt-input" id="mworkload" name="workloadId"><option value="">Tümü</option>{#each data.workloads as w (w.id)}<option value={w.id}>{w.tenantName} / {w.name}</option>{/each}</select></div>
        <div><label class="vt-label" for="mstart">Başlangıç</label><input class="vt-input" id="mstart" name="startsAt" type="datetime-local" required /></div>
        <div><label class="vt-label" for="mend">Bitiş</label><input class="vt-input" id="mend" name="endsAt" type="datetime-local" required /></div>
        <div><label class="vt-label" for="mbody">Açıklama</label><textarea class="vt-input" id="mbody" name="body" rows="2" style="height:auto; padding:8px 12px"></textarea></div>
        <label style="display:flex; gap:8px; align-items:center; font-size:13px"><input type="checkbox" name="customerVisible" checked /> Müşteriye bildir</label>
        <Button type="submit">Planla</Button>
      </form>
    </Card>
  </div>
</div>
