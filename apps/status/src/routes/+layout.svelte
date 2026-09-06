<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';
  import { ThemeToggle } from '@veritut/ui';
  let { children }: { children: Snippet } = $props();
</script>

<svelte:head><meta http-equiv="refresh" content="30" /></svelte:head>
<header class="vt-topbar">
  <div class="page-wrap" style="display:flex; align-items:center; justify-content:space-between; height:60px">
    <a href="/" style="display:flex; align-items:center; gap:10px; color:inherit"><img src="/veritut-logo.png" alt="VERITUT" style="height:26px" /><span class="vt-kicker">durum</span></a>
    <ThemeToggle />
  </div>
</header>
<main class="page-wrap" style="padding-block:36px 80px; max-width:860px">{@render children()}</main>
<footer class="page-wrap vt-help" style="padding-block:20px; border-top:1px solid var(--border); max-width:860px">Bu sayfa ana yığından bağımsız çalışır ve 30 saniyede bir yenilenir. Aylık kanıt çapası için <a href="https://vt-portal.dev-fethi.entra.net/guvence">/guvence</a>.</footer>
