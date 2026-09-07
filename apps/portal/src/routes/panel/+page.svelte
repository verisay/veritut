<!--
  Portal / İş yükleri — tasarımın "Portal - Is Yukleri" artboard'ı:
  mono eyebrow → dört büyük istatistik → filtre çipleri → sağlık kartları.
  Sayılar gerçek veriden türetilir; veri yoksa "veri yok" yazılır, uydurulmaz.
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button, Card, EmptyState, PageHead, ResidencyBadge, StatusDot, UptimeBars } from '@veritut/ui';
  import { RESIDENCIES, RESIDENCY_LABEL, WORKLOAD_STATUS_LABEL, type ComponentState, type WorkloadHealthCard, type WorkloadStatus } from '@veritut/types';
  import { formatNumber, formatPercent, formatRelative, formatMoney } from '@veritut/shared';
  let { data, form } = $props();
  const errs = $derived((form?.errors ?? {}) as Record<string, string[] | undefined>);

  const dot = (s: string): ComponentState =>
    s === 'active' ? 'ok' : s === 'degraded' ? 'degraded' : s === 'failed' || s === 'destroyed' ? 'down' : s === 'provisioning' || s === 'decommissioning' ? 'maintenance' : 'unknown';

  type Filter = 'all' | 'ok' | 'attention';
  let filter = $state<Filter>('all');
  let q = $state('');

  const cards = $derived(data.cards as WorkloadHealthCard[]);
  const counts = $derived({
    ok: cards.filter((c) => dot(c.status) === 'ok').length,
    attention: cards.filter((c) => dot(c.status) === 'degraded' || dot(c.status) === 'down').length,
    busy: cards.filter((c) => dot(c.status) === 'maintenance').length,
  });
  const shown = $derived(
    cards.filter((c) => {
      const d = dot(c.status);
      const passFilter = filter === 'all' || (filter === 'ok' ? d === 'ok' : d === 'degraded' || d === 'down');
      const needle = q.trim().toLocaleLowerCase('tr-TR');
      return passFilter && (needle === '' || c.name.toLocaleLowerCase('tr-TR').includes(needle) || c.productSlug.toLocaleLowerCase('tr-TR').includes(needle));
    }),
  );

  /** Ortalama erişilebilirlik — yalnız ölçümü olan iş yükleri üzerinden. */
  const avgUptime = $derived.by(() => {
    const vals = cards.map((c) => c.uptime30d).filter((v): v is number => v !== null);
    return vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0) / vals.length;
  });
  /** En yakın doğrulanmış geri dönüş — tatbikat kanıtı. */
  const lastRestore = $derived.by(() => {
    const ts = cards.map((c) => c.lastVerifiedRestoreAt).filter((v): v is string => v !== null).map((v) => new Date(v).getTime());
    return ts.length === 0 ? null : new Date(Math.max(...ts)).toISOString();
  });
</script>

{#if !data.activeTenant}
  <PageHead title="Hoş geldiniz" />
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
  <p class="vt-eyebrow vt-fade" style="margin-bottom:18px">( iş yükleri )</p>

  <div class="vt-stats vt-fade" style="align-items:end; padding-bottom:36px; border-bottom:1px solid var(--border); animation-delay:.08s">
    <div>
      <p class="vt-stat-value">{formatNumber(cards.length)}</p>
      <p class="vt-stat-label">iş yükü · {counts.ok} sağlıklı · {counts.attention} uyarıda · {counts.busy} kuruluyor</p>
    </div>
    <div>
      <p class="vt-stat-value">{avgUptime === null ? 'veri yok' : formatPercent(avgUptime)}</p>
      <p class="vt-stat-label">ortalama erişilebilirlik · 30 gün</p>
    </div>
    <div>
      <p class="vt-stat-value" style="font-size:clamp(28px,3.4vw,44px)">{lastRestore === null ? 'tatbikat bekliyor' : formatRelative(lastRestore)}</p>
      <p class="vt-stat-label">son doğrulanmış geri dönüş</p>
    </div>
    <div>
      {#if data.verdict === null}
        <p class="vt-stat-value" style="font-size:clamp(28px,3.4vw,44px)">—</p>
        <p class="vt-stat-label">zincir durumu okunamadı</p>
      {:else if data.verdict.ok}
        <p class="vt-stat-value" style="color:var(--accent-text)">✓</p>
        <p class="vt-stat-label">zincir bütün · <span class="mono tnum">{formatNumber(data.verdict.checked)}</span> olay · <a href="/panel/kanit">deftere git</a></p>
      {:else}
        <p class="vt-stat-value vt-state-text" data-state="down">✕</p>
        <p class="vt-stat-label">zincir doğrulanamadı · seq {data.verdict.brokenAt} · <a href="/panel/kanit">deftere git</a></p>
      {/if}
    </div>
  </div>

  <div class="vt-chipbar" style="margin-top:32px">
    <button type="button" class="vt-chip" aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}>Tümü</button>
    <button type="button" class="vt-chip" aria-pressed={filter === 'ok'} onclick={() => (filter = 'ok')}>Sağlıklı</button>
    <button type="button" class="vt-chip" aria-pressed={filter === 'attention'} onclick={() => (filter = 'attention')}>Uyarıda</button>
    <input class="vt-input" style="margin-left:auto; width:220px" placeholder="İş yükü ara" aria-label="İş yükü ara" bind:value={q} />
    <Button href="/panel/siparis">Yeni iş yükü</Button>
  </div>

  {#if cards.length === 0}
    <div style="margin-top:18px">
      <EmptyState title="Henüz iş yükü yok" text="Mevcut hizmetleriniz VERITUT ekibi tarafından envantere alındığında burada sağlık kartlarıyla görünür: durum, son doğrulanmış geri dönüş, 30 günlük uptime, ikametgâh." />
    </div>
  {:else}
    <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(330px,1fr)); gap:14px; margin-top:18px">
      {#each shown as c (c.id)}
        <a href="/panel/is-yukleri/{c.id}" class="vt-card vt-card-pad" style="color:inherit; display:flex; flex-direction:column">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px">
            <span style="display:flex; align-items:center; gap:10px; min-width:0">
              <StatusDot state={dot(c.status)} />
              <span style="font-size:16px; font-weight:800; letter-spacing:-.01em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">{c.name}</span>
            </span>
            <ResidencyBadge residency={c.residency} small />
          </div>
          <p class="vt-help" style="margin:6px 0 0 26px">{c.productSlug} · {c.provider ?? '—'}{c.region ? ` ${c.region}` : ''}{c.size ? ` · ${c.size}` : ''} · {WORKLOAD_STATUS_LABEL[c.status as WorkloadStatus] ?? c.status}</p>

          {#if c.openAccessSessions > 0}
            <p class="vt-kind" data-tone="warn" style="margin:12px 0 0; display:block; padding:8px 11px; line-height:1.5">
              Şu an {c.openAccessSessions} açık personel oturumu — gerekçesi ve kaydı Kanıt Defteri'nde.
            </p>
          {/if}

          <div style="margin-top:18px"><UptimeBars bars={c.bars30d} height={26} animate /></div>
          <div style="display:flex; justify-content:space-between; margin-top:8px" class="vt-help">
            <span>30 gün</span>
            <span class="tnum" style="color:var(--text); font-weight:800">{c.uptime30d === null ? 'veri yok' : formatPercent(c.uptime30d)}</span>
          </div>

          <div style="border-top:1px solid var(--row-border); margin-top:16px; padding-top:12px; display:grid; gap:8px; font-size:13px">
            <div style="display:flex; justify-content:space-between; gap:8px">
              <span class="vt-help">Son yedek</span>
              <span class="vt-state-text" data-state={c.lastBackupOk === null ? 'unknown' : c.lastBackupOk ? 'ok' : 'down'} style="font-weight:700">
                {c.lastBackupAt ? `${c.lastBackupOk ? '✓' : '✕'} ${formatRelative(c.lastBackupAt)}` : 'henüz yok'}
              </span>
            </div>
            <div style="display:flex; justify-content:space-between; gap:8px">
              <span class="vt-help">Doğrulanmış geri dönüş</span>
              <span class="vt-state-text" data-state={c.lastVerifiedRestoreAt ? 'ok' : 'degraded'} style="font-weight:800">
                {c.lastVerifiedRestoreAt ? `✓ ${formatRelative(c.lastVerifiedRestoreAt)}` : 'Doğrulama bekliyor'}
              </span>
            </div>
            {#if c.monthCost !== null}
              <div style="display:flex; justify-content:space-between; gap:8px">
                <span class="vt-help">Bu ay altyapı</span><span class="tnum">{formatMoney(c.monthCost, c.costCurrency as 'EUR')}</span>
              </div>
            {/if}
          </div>
        </a>
      {:else}
        <p class="vt-help" style="padding:22px 12px">Bu süzgece uyan iş yükü yok.</p>
      {/each}
    </div>
  {/if}

  <p class="vt-help" style="margin:32px 0 0; font-size:13.5px">
    Sağlık verisi sondalardan gelir. Geri dönüş tatbikatları her ay otomatik koşar ve <a href="/panel/kanit">Kanıt Defteri</a>'ne işlenir.
  </p>
{/if}
