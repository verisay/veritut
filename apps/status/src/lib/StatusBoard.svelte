<!--
  Durum tahtası — tasarımın "Durum Sayfasi" artboard'ı: manşet bandı, bileşen başına
  90 günlük çubuk, planlı bakım ve geçmiş olaylar. Tüm veri Redis snapshot'ından gelir (D14).
-->
<script lang="ts">
  import { StatusDot, UptimeBars } from '@veritut/ui';
  import { COMPONENT_STATE_LABEL, type StatusSnapshot } from '@veritut/types';
  import { formatDate, formatDateTime, formatDuration, formatPercent } from '@veritut/shared';
  let { snapshot, title }: { snapshot: StatusSnapshot | null; title: string } = $props();

  // Sürüm geçişi: Redis'teki snapshot bir ÖNCEKİ sürüm tarafından yazılmış olabilir
  // (TTL dolana kadar). Yeni alanlar eksikse sayfa patlamaz, boş görünür.
  const components = $derived(snapshot?.components ?? []);
  const maintenance = $derived(snapshot?.maintenance ?? []);
  const incidents = $derived(snapshot?.incidents ?? []);

  const overallText: Record<StatusSnapshot['overall'], string> = {
    ok: 'Tüm sistemler çalışıyor',
    degraded: 'Kısmi performans düşüşü',
    down: 'Erişim sorunu var',
    maintenance: 'Planlı bakım sürüyor',
    unknown: 'Durum bilgisi alınamıyor',
  };
</script>

{#if !snapshot}
  <div class="vt-banner" data-state="unknown">
    <StatusDot state="unknown" />
    <div>
      <p class="vt-banner-title">Durum bilgisi alınamıyor</p>
      <p style="margin:3px 0 0; font-size:14px; font-weight:500">
        Snapshot henüz üretilmedi veya okunamadı. Sonda turu 30 saniyede bir çalışır — sayfa kendini yeniler.
      </p>
    </div>
  </div>
{:else}
  <h1 class="vt-sr-only">{title}</h1>

  <div class="vt-banner" data-state={snapshot.overall} style="padding:22px 24px; gap:14px">
    <StatusDot state={snapshot.overall} />
    <div>
      <p class="vt-banner-title">{overallText[snapshot.overall]}</p>
      <p class="muted" style="margin:3px 0 0; font-size:14px; font-weight:500">
        Son kontrol: <span class="tnum">{formatDateTime(snapshot.generatedAt)}</span> — 30 saniyede bir yenilenir.
      </p>
    </div>
  </div>

  <section class="vt-card" style="margin-top:22px; padding:6px 24px">
    {#each components as c (c.slug)}
      <div style="padding:18px 0; border-bottom:1px solid var(--row-border)">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px">
          <span style="display:flex; align-items:center; gap:9px; min-width:0">
            <StatusDot state={c.state} small />
            <span style="font-size:14.5px; font-weight:700">{c.name}</span>
            <span class="vt-state-text vt-help" data-state={c.state} style="font-weight:700">{COMPONENT_STATE_LABEL[c.state]}</span>
          </span>
          <span class="mono tnum muted" style="font-size:12px; white-space:nowrap">
            {c.uptime90d === null || c.uptime90d === undefined ? 'ölçüm yok' : formatPercent(c.uptime90d)} — 90 gün
          </span>
        </div>
        {#if (c.bars90d?.length ?? 0) > 0}
          <UptimeBars bars={c.bars90d} height={26} dense />
        {:else}
          <p class="vt-help" style="margin:0">Bu bileşen için henüz sonda geçmişi yok.</p>
        {/if}
      </div>
    {/each}
    <div class="vt-help" style="display:flex; justify-content:space-between; padding:12px 0 14px; font-size:11.5px">
      <span>90 gün önce</span><span>bugün</span>
    </div>
  </section>

  <section style="margin-top:36px">
    <h2 class="vt-h3" style="margin:0 0 14px">Planlı bakım</h2>
    {#each maintenance as m (m.id)}
      <div class="vt-card vt-card-pad" style="padding:18px 22px; display:flex; gap:14px; align-items:flex-start; margin-bottom:10px">
        <StatusDot state="maintenance" />
        <div>
          <p style="margin:0; font-size:14px; font-weight:700">
            {m.title} — <span class="tnum">{formatDateTime(m.startsAt)} → {formatDateTime(m.endsAt)}</span>
          </p>
          {#if m.body}<p class="muted" style="margin:5px 0 0; font-size:14px; font-weight:500; line-height:1.6">{m.body}</p>{/if}
        </div>
      </div>
    {:else}
      <div class="vt-card vt-card-pad" style="padding:18px 22px"><p class="vt-help" style="margin:0">Planlanmış bakım yok.</p></div>
    {/each}
  </section>

  <section style="margin-top:36px">
    <h2 class="vt-h3" style="margin:0 0 14px">Geçmiş olaylar</h2>
    <div class="vt-card" style="padding:6px 22px">
      {#each incidents as i (i.id)}
        <div style="padding:16px 0; border-bottom:1px solid var(--row-border)">
          <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap">
            <p style="margin:0; font-size:14px; font-weight:700">{i.title}</p>
            <span class="mono vt-help" style="white-space:nowrap">
              {formatDate(i.resolvedAt)} · {formatDuration(i.durationMin * 60)} · {i.severity} · çözüldü
            </span>
          </div>
          {#if i.summary}<p class="muted" style="margin:5px 0 0; font-size:14px; font-weight:500; line-height:1.6">{i.summary}</p>{/if}
        </div>
      {:else}
        <p class="vt-help" style="padding:16px 0">Son 90 günde müşteriye açık, çözülmüş olay yok.</p>
      {/each}
    </div>
  </section>
{/if}
