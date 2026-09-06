<!--
  Portal kabuğu — tasarımın "Portal / İş yükleri" artboard'ı: 64 px üst nav, parantez marka işareti,
  çip biçimli gezinme, sağda tema anahtarı + kiracı + baş harfler. Kenar çubuğu YOK.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { Mark, ThemeToggle } from '@veritut/ui';
  import { TENANT_ROLE_LABEL, type MeDto, type TenantRole } from '@veritut/types';
  import { setActiveTenant } from '$lib/api';
  let { data, children }: { data: { me: MeDto; activeTenant: { id: string; name: string; role: TenantRole } | null }; children: Snippet } = $props();
  $effect(() => setActiveTenant(data.activeTenant?.id ?? null));

  const nav = [
    { href: '/panel', label: 'İş yükleri' },
    { href: '/panel/kanit', label: 'Kanıt Defteri' },
    { href: '/panel/olaylar', label: 'Olaylar' },
    { href: '/panel/destek', label: 'Destek' },
    { href: '/panel/faturalar', label: 'Faturalar' },
    { href: '/panel/belgeler', label: 'Belgeler' },
    { href: '/panel/guvence', label: 'Güvence' },
    { href: '/panel/siparisler', label: 'Siparişler' },
    { href: '/panel/ekip', label: 'Ekip' },
    { href: '/panel/api-anahtarlari', label: 'API anahtarları' },
    { href: '/panel/bildirimler', label: 'Bildirimler' },
  ];
  const isActive = (href: string): boolean =>
    href === '/panel' ? page.url.pathname === '/panel' || page.url.pathname.startsWith('/panel/is-yukleri') : page.url.pathname.startsWith(href);

  /** Kiracı baş harfleri — tasarımdaki yuvarlak rozet. */
  const initials = $derived(
    (data.activeTenant?.name ?? data.me.displayName ?? '?')
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] ?? '')
      .join('')
      .toLocaleUpperCase('tr-TR'),
  );
  const others = $derived(data.me.tenants.filter((t) => t.id !== data.activeTenant?.id));
</script>

<svelte:head><title>Portal — VERITUT</title></svelte:head>

<div style="min-height:100vh; display:flex; flex-direction:column">
  <header style="border-bottom:1px solid var(--border); background:var(--card)">
    <div class="vt-shell" style="height:64px; display:flex; align-items:center; gap:28px">
      <Mark href="/" size={22} />
      <nav class="vt-topnav">
        {#each nav as n (n.href)}
          <a href={n.href} aria-current={isActive(n.href) ? 'page' : undefined}>{n.label}</a>
        {/each}
      </nav>
      <div style="display:flex; align-items:center; gap:14px">
        <ThemeToggle />
        {#if data.activeTenant}
          <span style="display:flex; flex-direction:column; line-height:1.25; text-align:right">
            <span style="font-size:12.5px; font-weight:700; white-space:nowrap">{data.activeTenant.name}</span>
            <span class="vt-help" style="font-size:11px">{TENANT_ROLE_LABEL[data.activeTenant.role]}</span>
          </span>
        {/if}
        <span class="vt-avatar" title={data.me.email}>{initials}</span>
        <a href="/api/v1/auth/logout?realm=musteri" class="vt-btn vt-btn-ghost vt-btn-sm" rel="external">Çıkış</a>
      </div>
    </div>
    {#if others.length > 0}
      <div class="vt-shell" style="padding-bottom:10px; display:flex; gap:8px; align-items:center; flex-wrap:wrap">
        <span class="vt-help">Diğer kiracılar:</span>
        {#each others as t (t.id)}<a href="/panel/kiraci/{t.id}" class="vt-chip">{t.name}</a>{/each}
      </div>
    {/if}
  </header>

  <main class="vt-shell" style="flex:1; padding-block:44px 88px; min-width:0">{@render children()}</main>
</div>
