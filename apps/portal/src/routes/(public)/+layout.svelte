<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ThemeToggle } from '@veritut/ui';
  let { children }: { children: Snippet } = $props();
</script>

<svelte:head><title>VERITUT — Yönetilen bulut operatörü</title></svelte:head>

<header class="vt-topbar">
  <div class="page-wrap" style="display:flex; align-items:center; justify-content:space-between; height:64px; gap:16px">
    <a href="/" style="display:flex; align-items:center; gap:10px; color:inherit"><img src="/veritut-logo.png" alt="VERITUT" style="height:30px" /></a>
    <nav class="vt-nav" style="display:flex; gap:2px; align-items:center">
      <a href="/urunler">Ürünler</a>
      <a href="/guvence">Güvence</a>
      <a href="/fiyatlandirma">Fiyatlandırma</a>
      <a href="https://vt-status.dev-fethi.entra.net" rel="external">Durum</a>
      <ThemeToggle />
      <a href="/panel" class="vt-btn vt-btn-primary vt-btn-sm" style="margin-left:8px">Portal</a>
    </nav>
  </div>
</header>

<main class="page-wrap" style="padding-block:40px 96px">{@render children()}</main>

<footer style="border-top:1px solid var(--border)">
  <div class="page-wrap vt-help" style="display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; padding-block:20px">
    <span>VERITUT · Verisay İletişim ve Bilgi Teknolojileri Ltd. Şti. · Yönetilen bulut operatörü</span>
    <span class="mono">veri + tutmak</span>
  </div>
</footer>
