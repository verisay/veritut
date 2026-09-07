<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { Button, Card, PageHead, ResidencyBadge, StatusDot } from '@veritut/ui';
  import { ORDER_STATUS_LABEL_TR, type Residency } from '@veritut/types';
  import { formatDateTime, formatMoney } from '@veritut/shared';
  let { data } = $props();
  const o = $derived(data.order);
  const steps = ['submitted', 'approved', 'provisioning', 'fulfilled'];
  const idx = $derived(steps.indexOf(o.status));
  /** Kurulum sürerken sayfa kendini tazeler (WS ops'a özel; portalda hafif polling). */
  onMount(() => {
    if (o.status === 'provisioning' || o.status === 'approved') {
      const t = setInterval(() => void invalidateAll(), 5000);
      return () => clearInterval(t);
    }
  });
</script>

<svelte:head><title>{o.workloadName} siparişi — VERITUT</title></svelte:head>
<p class="vt-kicker"><a href="/panel/siparisler">Siparişler</a> / {o.workloadSlug}</p>
<PageHead title={o.workloadName} eyebrow="siparişler" />
<p class="vt-help" style="margin:0 0 24px">{o.productSlug} · {o.planCode}/{o.slaCode} · <ResidencyBadge residency={o.residency as Residency} small /> {o.region} · {o.size} · {formatDateTime(o.createdAt)}</p>

<div style="display:grid; grid-template-columns:1fr 320px; gap:14px; align-items:start">
  <Card title="Kurulum durumu" subtitle={o.status === 'fulfilled' ? 'Teslim edildi' : 'İnsan dokunmadan ilerliyor'}>
    <ol style="list-style:none; margin:0; padding:0; display:grid; gap:12px">
      {#each steps as s, i (s)}
        <li style="display:flex; gap:10px; align-items:center">
          <StatusDot state={idx > i ? 'ok' : idx === i ? (o.status === 'fulfilled' ? 'ok' : 'maintenance') : 'unknown'} small />
          <span style="font-weight:{idx === i ? 800 : 500}">{ORDER_STATUS_LABEL_TR[s]}</span>
        </li>
      {/each}
    </ol>
    {#if o.rejectReason}<div class="vt-status" data-state="down" style="margin-top:14px">{o.rejectReason}</div>{/if}
    {#if o.workloadId}
      <div style="margin-top:16px; display:flex; gap:8px">
        <Button href="/panel/is-yukleri/{o.workloadId}" variant="secondary" size="sm">İş yüküne git</Button>
        <Button href="/panel/kanit" variant="ghost" size="sm">Kanıt defteri</Button>
      </div>
    {/if}
  </Card>
  <Card title="Tutar">
    <div style="display:grid; gap:8px; font-size:13.5px">
      <div style="display:flex; justify-content:space-between"><span class="muted">Aylık</span><span class="tnum" style="font-weight:800">{formatMoney(Number(o.monthly), o.currency as 'TRY')}</span></div>
      <div style="display:flex; justify-content:space-between"><span class="muted">Kurulum</span><span class="tnum">{formatMoney(Number(o.setupFee), o.currency as 'TRY')}</span></div>
      {#if o.isTrial}<p class="vt-help" style="margin:6px 0 0">{o.trialDays} günlük deneme sürüyor; bu dönem için ücret tahakkuk etmedi.</p>{/if}
    </div>
    <a href="/panel/faturalar" class="vt-btn vt-btn-ghost vt-btn-sm" style="margin-top:12px">Faturalar</a>
  </Card>
</div>
