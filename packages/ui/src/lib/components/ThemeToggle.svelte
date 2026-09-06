<script lang="ts">
  import { onMount } from 'svelte';
  import { initTheme, isDark, toggleTheme } from '@veritut/shared/stores/theme.svelte';
  onMount(initTheme);
</script>

<button type="button" class="vt-btn vt-btn-ghost vt-btn-sm" onclick={toggleTheme} aria-label="Temayı değiştir">
  {#if isDark()}
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke-linecap="round" /></svg>
  {:else}
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" stroke-linejoin="round" /></svg>
  {/if}
</button>
