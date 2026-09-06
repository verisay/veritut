<!--
  Pazarlama kabuğu — tasarımın "Ana Sayfa" artboard'ı: temadan bağımsız koyu yüzey (`.vt-onyx`),
  parantez marka işareti, 80 px nav, sade alt bilgi. Gradient YOK (tasarım düz zemin kullanır).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { Mark } from '@veritut/ui';
  let { children }: { children: Snippet } = $props();
  const nav = [
    { href: '/urunler', label: 'Ürünler' },
    { href: '/fiyatlandirma', label: 'Fiyatlandırma' },
    { href: '/guvence', label: 'Güvence' },
    { href: '/gelistirici', label: 'Geliştirici' },
  ];
  const STATUS_URL = 'https://durum.veritut.com';
</script>

<div class="vt-onyx" style="min-height:100vh; display:flex; flex-direction:column">
  <header>
    <div class="vt-shell" style="height:80px; display:flex; align-items:center; gap:28px">
      <Mark href="/" size={24} />
      <nav class="vt-topnav" style="gap:4px">
        {#each nav as n (n.href)}
          <a href={n.href} aria-current={page.url.pathname.startsWith(n.href) ? 'page' : undefined}>{n.label}</a>
        {/each}
      </nav>
      <div style="display:flex; align-items:center; gap:18px">
        <a href={STATUS_URL} rel="external" class="mono vt-help" style="display:inline-flex; align-items:center; gap:7px; white-space:nowrap">
          <span class="vt-dot vt-dot-sm vt-live" data-state="ok"></span>sistem durumu
        </a>
        <a href="/panel" class="vt-btn vt-btn-sm" style="background:var(--text); color:var(--bg); font-weight:700">Panele giriş</a>
      </div>
    </div>
  </header>

  <main style="flex:1">{@render children()}</main>

  <footer style="border-top:1px solid var(--border)">
    <div class="vt-shell" style="padding-block:30px 44px; display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:24px">
      <div>
        <p class="vt-kicker" style="margin:0 0 8px">Ürünler</p>
        <div style="display:grid; gap:4px; font-size:13px"><a href="/urunler">Tüm ürünler</a><a href="/fiyatlandirma">Fiyatlandırma</a><a href="/sla">SLA katmanları</a></div>
      </div>
      <div>
        <p class="vt-kicker" style="margin:0 0 8px">Güvence</p>
        <div style="display:grid; gap:4px; font-size:13px"><a href="/guvence">Kanıt Defteri</a><a href={STATUS_URL} rel="external">Durum sayfası</a><a href="/kvkk">KVKK aydınlatma</a><a href="/sozlesmeler">Sözleşmeler</a></div>
      </div>
      <div>
        <p class="vt-kicker" style="margin:0 0 8px">Geliştirici</p>
        <div style="display:grid; gap:4px; font-size:13px"><a href="/gelistirici">API</a><a href="/api/v1/ext/openapi.json" rel="external">OpenAPI</a></div>
      </div>
    </div>
    <div class="vt-shell" style="padding-block:20px 30px; border-top:1px solid var(--border); display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; align-items:center">
      <div style="display:flex; align-items:center; gap:12px">
        <Mark size={18} wordmark={false} />
        <span class="vt-help">© {new Date().getFullYear()} VERITUT · Verisay İletişim ve Bilgi Teknolojileri Ltd. Şti.</span>
      </div>
      <span class="vt-help mono">veri + tutmak</span>
    </div>
  </footer>
</div>
