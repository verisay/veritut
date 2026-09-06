<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { ThemeToggle } from '@veritut/ui';
  import { STAFF_ROLE_LABEL, type MeDto } from '@veritut/types';
  let { data, children }: { data: { me: MeDto }; children: Snippet } = $props();
  const nav = [
    { href: '/', label: 'Genel bakış' },
    { href: '/kiracilar', label: 'Kiracılar' },
    { href: '/is-yukleri', label: 'İş yükleri' },
    { href: '/envanter', label: 'Envanter' },
    { href: '/tedarikciler', label: 'Tedarikçiler' },
    { href: '/yedekler', label: 'Yedekler' },
    { href: '/marj', label: 'Maliyet & marj' },
    { href: '/calistirmalar', label: 'Çalıştırmalar' },
    { href: '/kanit', label: 'Kanıt Defteri' },
    { href: '/ice-aktarim', label: 'İçe aktarım' },
    { href: '/bildirimler', label: 'Bildirimler' },
  ];
  const isActive = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
</script>

<svelte:head><title>Ops — VERITUT</title></svelte:head>
<div style="display:grid; grid-template-columns:220px 1fr; min-height:100vh">
  <aside style="border-right:1px solid var(--border); padding:18px 12px; display:flex; flex-direction:column; gap:16px">
    <div style="display:flex; align-items:center; gap:10px; padding:0 8px"><img src="/veritut-logo.png" alt="VERITUT" style="height:24px" /><span class="vt-kicker">ops</span></div>
    <nav class="vt-nav" style="display:flex; flex-direction:column; gap:2px">
      {#each nav as n (n.href)}<a href={n.href} aria-current={isActive(n.href) ? 'page' : undefined}>{n.label}</a>{/each}
    </nav>
    <div style="margin-top:auto; padding:0 8px; display:flex; flex-direction:column; gap:6px">
      <p style="margin:0; font-size:13px; font-weight:700; overflow-wrap:anywhere">{data.me.displayName}</p>
      <p class="vt-help" style="margin:0">{data.me.staffRole ? STAFF_ROLE_LABEL[data.me.staffRole] : ''}</p>
      <div style="display:flex; gap:6px"><ThemeToggle /><a href="/api/v1/auth/logout?realm=ops" class="vt-btn vt-btn-ghost vt-btn-sm" rel="external">Çıkış</a></div>
    </div>
  </aside>
  <main style="padding:28px 32px; min-width:0">{@render children()}</main>
</div>
