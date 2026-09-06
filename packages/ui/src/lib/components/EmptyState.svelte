<script lang="ts">
  import type { Snippet } from 'svelte';
  let { title, text, actions }: { title: string; text?: string; actions?: Snippet } = $props();
</script>

<div class="vt-card vt-card-pad" style="text-align:center; padding:40px 22px">
  <p class="vt-h3" style="margin-bottom:6px">{title}</p>
  {#if text}<p class="vt-help" style="margin:0 auto 16px; max-width:420px">{text}</p>{/if}
  {#if actions}<div style="display:flex; justify-content:center; gap:10px">{@render actions()}</div>{/if}
</div>
