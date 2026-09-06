<!--
  Ops kabuğu — tasarımın "Ops / Çalıştırmalar" artboard'ı: 56 px üst nav, OPS rozeti,
  yatay kaydırmalı gezinme, sağda nöbetçi göstergesi + baş harfler. Veri-yoğun, varsayılan koyu.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { ThemeToggle } from '@veritut/ui';
  import { STAFF_ROLE_LABEL, type MeDto } from '@veritut/types';
  let {
    data,
    children,
  }: { data: { me: MeDto; oncall: { current: { name: string } | null; backup: { name: string } | null } | null }; children: Snippet } = $props();

  const nav = [
    { href: '/', label: 'Genel bakış' },
    { href: '/nobet', label: 'Nöbet' },
    { href: '/kiracilar', label: 'Kiracılar' },
    { href: '/is-yukleri', label: 'İş yükleri' },
    { href: '/calistirmalar', label: 'Çalıştırmalar' },
    { href: '/provizyon', label: 'Provizyon' },
    { href: '/olaylar', label: 'Olaylar' },
    { href: '/sapmalar', label: 'Sapmalar' },
    { href: '/katalog', label: 'Katalog' },
    { href: '/siparisler', label: 'Siparişler' },
    { href: '/envanter', label: 'Envanter' },
    { href: '/tedarikciler', label: 'Tedarikçiler' },
    { href: '/sla', label: 'SLA' },
    { href: '/yedekler', label: 'Yedekler' },
    { href: '/tatbikatlar', label: 'Tatbikatlar' },
    { href: '/marj', label: 'Maliyet & marj' },
    { href: '/kpi', label: 'KPI' },
    { href: '/kanit', label: 'Kanıt Defteri' },
    { href: '/ice-aktarim', label: 'İçe aktarım' },
    { href: '/bildirimler', label: 'Bildirimler' },
  ];
  const isActive = (href: string): boolean => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));

  const initials = $derived(
    (data.me.displayName || data.me.email)
      .split(/[\s@.]+/)
      .slice(0, 2)
      .map((w) => w[0] ?? '')
      .join('')
      .toLocaleUpperCase('tr-TR'),
  );
  const oncallText = $derived(data.oncall?.current ? `Nöbette: ${data.oncall.current.name}` : 'Nöbetçi atanmadı');
</script>

<svelte:head><title>Ops — VERITUT</title></svelte:head>

<div style="min-height:100vh; display:flex; flex-direction:column">
  <header style="border-bottom:1px solid var(--border); background:var(--bg)">
    <div style="max-width:1400px; margin:0 auto; padding:0 28px; height:56px; display:flex; align-items:center; gap:24px">
      <a href="/" style="display:flex; align-items:center; gap:9px; color:var(--text)">
        <span aria-hidden="true" style="width:18px; height:18px; border-radius:5px; background:var(--accent); display:inline-block"></span>
        <span style="font-size:16px; font-weight:800; letter-spacing:-.01em">Veritut</span>
        <span class="mono" style="font-size:10.5px; font-weight:600; color:var(--text-2); border:1px solid var(--border); border-radius:var(--r-chip); padding:2px 7px">OPS</span>
      </a>
      <nav class="vt-topnav" data-density="ops">
        {#each nav as n (n.href)}<a href={n.href} aria-current={isActive(n.href) ? 'page' : undefined}>{n.label}</a>{/each}
      </nav>
      <div style="display:flex; align-items:center; gap:12px">
        <ThemeToggle />
        <a
          href="/nobet"
          class="vt-help"
          style="display:inline-flex; align-items:center; gap:7px; font-size:12px; font-weight:600; border:1px solid var(--border); border-radius:8px; padding:4px 10px; white-space:nowrap"
        >
          <span class="vt-dot vt-dot-sm" data-state={data.oncall?.current ? 'ok' : 'degraded'}></span>{oncallText}
        </a>
        <span class="vt-avatar" title="{data.me.displayName} · {data.me.staffRole ? STAFF_ROLE_LABEL[data.me.staffRole] : ''}" style="width:30px; height:30px; background:var(--accent); color:var(--bg)">{initials}</span>
        <a href="/api/v1/auth/logout?realm=ops" class="vt-btn vt-btn-ghost vt-btn-sm" rel="external">Çıkış</a>
      </div>
    </div>
  </header>

  <main style="max-width:1400px; margin:0 auto; width:100%; box-sizing:border-box; padding:26px 28px 64px; flex:1; min-width:0">{@render children()}</main>
</div>
