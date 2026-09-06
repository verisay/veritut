<!-- Table — `.vt-table` sarmalayıcısı; `head` ve `children` (tbody satırları) snippet'leri. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { head, children, minWidth = 560 }: { head: Snippet; children: Snippet; minWidth?: number } = $props();
</script>

<div class="vt-table-wrap">
  <table class="vt-table" style="min-width:{minWidth}px">
    <thead><tr>{@render head()}</tr></thead>
    <tbody>{@render children()}</tbody>
  </table>
</div>
