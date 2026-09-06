<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { ThemeToggle } from '@veritut/ui';
  let { children }: { children: Snippet } = $props();
  const nav = [
    { href: '/urunler', label: 'Ürünler' },
    { href: '/fiyatlandirma', label: 'Fiyatlandırma' },
    { href: '/sla', label: 'SLA' },
    { href: '/guvence', label: 'Güvence' },
    { href: '/gelistirici', label: 'Geliştirici' },
  ];
</script>

<header class="vt-topbar">
  <div class="page-wrap" style="display:flex; align-items:center; justify-content:space-between; height:64px; gap:16px">
    <a href="/" style="display:flex; align-items:center; gap:10px; color:inherit"><img src="/veritut-logo.png" alt="VERITUT" style="height:30px" /></a>
    <nav class="vt-nav" style="display:flex; gap:2px; align-items:center; flex-wrap:wrap">
      {#each nav as n (n.href)}<a href={n.href} aria-current={page.url.pathname.startsWith(n.href) ? 'page' : undefined}>{n.label}</a>{/each}
      <ThemeToggle />
      <a href="/panel" class="vt-btn vt-btn-primary vt-btn-sm" style="margin-left:8px">Portal</a>
    </nav>
  </div>
</header>

<main class="page-wrap" style="padding-block:40px 96px">{@render children()}</main>

<footer style="border-top:1px solid var(--border)">
  <div class="page-wrap" style="padding-block:24px; display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:20px">
    <div>
      <p class="vt-kicker" style="margin:0 0 8px">Ürünler</p>
      <div style="display:grid; gap:4px; font-size:13px"><a href="/urunler">Tüm ürünler</a><a href="/fiyatlandirma">Fiyatlandırma</a><a href="/sla">SLA katmanları</a></div>
    </div>
    <div>
      <p class="vt-kicker" style="margin:0 0 8px">Güven</p>
      <div style="display:grid; gap:4px; font-size:13px"><a href="/guvence">Kanıt defteri</a><a href="https://vt-status.dev-fethi.entra.net" rel="external">Durum sayfası</a><a href="/kvkk">KVKK aydınlatma</a><a href="/sozlesmeler">Sözleşmeler</a></div>
    </div>
    <div>
      <p class="vt-kicker" style="margin:0 0 8px">Geliştirici</p>
      <div style="display:grid; gap:4px; font-size:13px"><a href="/gelistirici">API</a><a href="/api/v1/ext/openapi.json" rel="external">OpenAPI</a></div>
    </div>
  </div>
  <div class="page-wrap vt-help" style="display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; padding-block:16px; border-top:1px solid var(--border)">
    <span>VERITUT · Verisay İletişim ve Bilgi Teknolojileri Ltd. Şti. · Yönetilen bulut operatörü</span>
    <span class="mono">veri + tutmak</span>
  </div>
</footer>
