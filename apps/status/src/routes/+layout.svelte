<!--
  Durum kabuğu — tasarımın "Durum Sayfasi" artboard'ı: dar (880 px) kolon, mono alan adı,
  JSON çıkışı. Sayfa 30 saniyede bir kendini yeniler; JS gerekmez.
-->
<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';
  import { Mark, ThemeToggle } from '@veritut/ui';
  let { children }: { children: Snippet } = $props();
</script>

<svelte:head><meta http-equiv="refresh" content="30" /></svelte:head>

<header style="border-bottom:1px solid var(--border); background:var(--card)">
  <div class="page-wrap" style="max-width:880px; display:flex; align-items:center; justify-content:space-between; gap:16px; height:58px">
    <div style="display:flex; align-items:center; gap:12px">
      <Mark href="/" size={20} />
      <span class="mono vt-help">durum.veritut.com</span>
    </div>
    <div style="display:flex; align-items:center; gap:14px">
      <a href="/durum.json" class="mono vt-help" rel="external">JSON</a>
      <ThemeToggle />
    </div>
  </div>
</header>

<main class="page-wrap" style="padding-block:36px 72px; max-width:880px">{@render children()}</main>

<footer class="page-wrap vt-help" style="padding-block:20px 44px; border-top:1px solid var(--border); max-width:880px; display:flex; flex-direction:column; gap:10px">
  <span>
    Bu sayfa ana yığından bağımsız çalışır: veritabanına ve kimlik sunucusuna hiç bağlanmaz, yalnız durum
    anlık görüntüsünü okur. Ölçümler kendi sondalarımızdandır.
  </span>
  <span>Aylık kanıt çapası ve bağımsız zincir doğrulaması: <a href="https://veritut.com/guvence" rel="external">veritut.com/guvence</a>.</span>
</footer>
