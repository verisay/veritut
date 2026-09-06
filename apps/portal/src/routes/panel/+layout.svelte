<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { ThemeToggle } from '@veritut/ui';
  import { TENANT_ROLE_LABEL } from '@veritut/types';
  import { setActiveTenant } from '$lib/api';
  let { data, children }: { data: { me: import('@veritut/types').MeDto; activeTenant: { id: string; name: string; role: import('@veritut/types').TenantRole } | null }; children: Snippet } = $props();
  $effect(() => setActiveTenant(data.activeTenant?.id ?? null));
  const nav = [
    { href: '/panel', label: 'İş yükleri' },
    { href: '/panel/siparis', label: 'Yeni iş yükü' },
    { href: '/panel/siparisler', label: 'Siparişler' },
    { href: '/panel/kanit', label: 'Kanıt Defteri' },
    { href: '/panel/faturalar', label: 'Faturalar' },
    { href: '/panel/destek', label: 'Destek' },
    { href: '/panel/ekip', label: 'Ekip' },
    { href: '/panel/api-anahtarlari', label: 'API anahtarları' },
    { href: '/panel/bildirimler', label: 'Bildirimler' },
  ];
</script>

<svelte:head><title>Portal — VERITUT</title></svelte:head>

<div style="display:grid; grid-template-columns:240px 1fr; min-height:100vh">
  <aside style="border-right:1px solid var(--border); padding:20px 14px; display:flex; flex-direction:column; gap:18px">
    <a href="/" style="display:flex; align-items:center; gap:10px; padding:0 8px"><img src="/veritut-logo.png" alt="VERITUT" style="height:26px" /></a>
    {#if data.activeTenant}
      <div class="vt-card" style="padding:12px 14px">
        <p class="vt-kicker" style="margin:0 0 4px">Kiracı</p>
        <p style="margin:0; font-weight:800">{data.activeTenant.name}</p>
        <p class="vt-help" style="margin:2px 0 0">{TENANT_ROLE_LABEL[data.activeTenant.role]}</p>
        {#if data.me.tenants.length > 1}
          <div style="margin-top:8px; display:flex; flex-direction:column; gap:4px">
            {#each data.me.tenants.filter((t) => t.id !== data.activeTenant?.id) as t (t.id)}
              <a href="/panel/kiraci/{t.id}" class="vt-help">→ {t.name}</a>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
    <nav class="vt-nav" style="display:flex; flex-direction:column; gap:2px">
      {#each nav as n (n.href)}
        <a href={n.href} aria-current={(n.href === '/panel' ? page.url.pathname === '/panel' || page.url.pathname.startsWith('/panel/is-yukleri') : page.url.pathname.startsWith(n.href)) ? 'page' : undefined}>{n.label}</a>
      {/each}
    </nav>
    <div style="margin-top:auto; display:flex; flex-direction:column; gap:8px; padding:0 8px">
      <p class="vt-help" style="margin:0; overflow-wrap:anywhere">{data.me.email}</p>
      <div style="display:flex; gap:6px; align-items:center">
        <ThemeToggle />
        <a href="/api/v1/auth/logout?realm=musteri" class="vt-btn vt-btn-ghost vt-btn-sm" rel="external">Çıkış</a>
      </div>
    </div>
  </aside>
  <main style="padding:32px 36px; min-width:0">{@render children()}</main>
</div>
