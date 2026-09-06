<!--
  Mark — marka işareti: parantezin içinde tuttuğumuz şey. `( ▪ ) Veritut`
  Logonun tek kaynağı; `size` yalnız em ölçeğini büyütür, renk token'dan gelir.
-->
<script lang="ts">
  let {
    href,
    size = 22,
    wordmark = true,
    label = 'Veritut',
  }: { href?: string; size?: number; wordmark?: boolean; label?: string } = $props();
</script>

{#snippet inner()}
  <span aria-hidden="true">(</span><i aria-hidden="true"></i><span aria-hidden="true">)</span>
  {#if wordmark}<b>{label}</b>{/if}
{/snippet}

{#if href}
  <a {href} class="vt-mark" style="font-size:{size}px" aria-label={label}>{@render inner()}</a>
{:else}
  <span class="vt-mark" style="font-size:{size}px" role="img" aria-label={label}>{@render inner()}</span>
{/if}
