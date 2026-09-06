<script lang="ts">
  import { enhance } from '$app/forms';
  import { Card, EmptyState, ResidencyBadge, Button, StatusDot } from '@veritut/ui';
  import { RESIDENCIES, RESIDENCY_LABEL, WORKLOAD_STATUS_LABEL, type ComponentState, type WorkloadStatus } from '@veritut/types';
  import { formatPercent, formatRelative, formatMoney } from '@veritut/shared';
  let { data, form } = $props();
  const errs = $derived((form?.errors ?? {}) as Record<string, string[] | undefined>);
  const dot = (s: string): ComponentState => (s === 'active' ? 'ok' : s === 'degraded' ? 'degraded' : s === 'failed' || s === 'destroyed' ? 'down' : s === 'provisioning' || s === 'decommissioning' ? 'maintenance' : 'unknown');
</script>

{#if !data.activeTenant}
  <h1 class="vt-h1">Hoş geldiniz</h1>
  <p class="vt-lead" style="margin:6px 0 24px; max-width:640px">Başlamak için bir kiracı (kurum hesabı) oluşturun. Verinizin varsayılan ikametgâhını burada seçersiniz; iş yükü başına değiştirebilirsiniz.</p>
  <Card title="Yeni kiracı" subtitle="Siz sahip (owner) olursunuz; ekip üyelerini sonra davet edersiniz">
    <form method="POST" action="?/createTenant" use:enhance style="display:grid; gap:16px; max-width:480px">
      <div>
        <label class="vt-label" for="name">Kurum adı</label>
        <input class="vt-input" id="name" name="name" value={form?.values?.name ?? ''} aria-invalid={errs.name ? 'true' : undefined} required />
        {#if errs.name}<p class="vt-field-error">{errs.name[0]}</p>{/if}
      </div>
      <div>
        <label class="vt-label" for="slug">Kısa ad</label>
        <input class="vt-input mono" id="slug" name="slug" value={form?.values?.slug ?? ''} placeholder="aksu-yazilim" aria-invalid={errs.slug ? 'true' : undefined} required />
        <p class="vt-help" style="margin:6px 0 0">Küçük harf ve tire; alan adında ve kanıt doğrulamasında kullanılır, sonradan değişmez.</p>
        {#if errs.slug}<p class="vt-field-error">{errs.slug[0]}</p>{/if}
      </div>
      <div>
        <span class="vt-label">Varsayılan ikametgâh</span>
        <div style="display:flex; gap:14px">
          {#each RESIDENCIES as r (r)}
            <label style="display:flex; gap:6px; align-items:center; font-size:13.5px"><input type="radio" name="residencyDefault" value={r} checked={r === 'TR'} /> <ResidencyBadge residency={r} small /> {RESIDENCY_LABEL[r]}</label>
          {/each}
        </div>
      </div>
      {#if form?.message}<p class="vt-field-error">{form.message}</p>{/if}
      <div><Button type="submit">Kiracıyı oluştur</Button></div>
    </form>
  </Card>
{:else}
  <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:16px; flex-wrap:wrap; margin-bottom:24px">
    <div><h1 class="vt-h1">İş yükleri</h1><p class="vt-lead" style="margin:4px 0 0">{data.activeTenant.name}</p></div>
    <Button disabled title="Self-servis sipariş K3'te açılır">Yeni iş yükü</Button>
  </div>
  {#if data.cards.length === 0}
    <EmptyState title="Henüz iş yükü yok" text="Mevcut hizmetleriniz VERITUT ekibi tarafından envantere alındığında burada sağlık kartlarıyla görünür: durum, son doğrulanmış geri dönüş, 30 günlük uptime, ikametgâh." />
  {:else}
    <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:14px">
      {#each data.cards as c (c.id)}
        <a href="/panel/is-yukleri/{c.id}" class="vt-card" style="padding:18px; color:inherit; display:block">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px">
            <span style="display:flex; align-items:center; gap:10px"><StatusDot state={dot(c.status)} /><span style="font-size:15px; font-weight:800">{c.name}</span></span>
            <ResidencyBadge residency={c.residency} small />
          </div>
          <p class="vt-help" style="margin:6px 0 14px">{c.productSlug} · {c.provider ?? '—'}{c.region ? ` ${c.region}` : ''}{c.size ? ` · ${c.size}` : ''} · {WORKLOAD_STATUS_LABEL[c.status as WorkloadStatus] ?? c.status}</p>
          <div class="vt-bars">{#each c.bars30d as b, i (i)}<span data-state={b}></span>{/each}</div>
          <div style="display:flex; justify-content:space-between; margin-top:8px" class="vt-help"><span>30 gün</span><span class="tnum" style="color:var(--text); font-weight:700">{c.uptime30d === null ? 'veri yok' : formatPercent(c.uptime30d)}</span></div>
          <div style="border-top:1px solid var(--border); margin-top:14px; padding-top:12px; display:grid; gap:6px; font-size:12.5px">
            <div style="display:flex; justify-content:space-between"><span class="muted">Son yedek</span><span class="vt-state-text" data-state={c.lastBackupOk === null ? 'unknown' : c.lastBackupOk ? 'ok' : 'down'} style="font-weight:700">{c.lastBackupAt ? `${c.lastBackupOk ? '✓' : '✕'} ${formatRelative(c.lastBackupAt)}` : 'henüz yok'}</span></div>
            <div style="display:flex; justify-content:space-between"><span class="muted">Son doğrulanmış geri dönüş</span><span class="muted">{c.lastVerifiedRestoreAt ? formatRelative(c.lastVerifiedRestoreAt) : 'tatbikat bekliyor'}</span></div>
            {#if c.monthCost !== null}<div style="display:flex; justify-content:space-between"><span class="muted">Bu ay altyapı</span><span class="tnum">{formatMoney(c.monthCost, c.costCurrency as 'EUR')}</span></div>{/if}
            {#if c.openAccessSessions > 0}<div class="vt-state-text" data-state="degraded" style="font-weight:700">Şu an {c.openAccessSessions} açık personel oturumu</div>{/if}
          </div>
        </a>
      {/each}
    </div>
  {/if}
{/if}
