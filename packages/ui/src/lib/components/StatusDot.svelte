<!-- StatusDot — 5 durum, renk + işaret (yalnız renge güvenilmez). -->
<script lang="ts">
  import type { ComponentState } from '@veritut/types';
  import { COMPONENT_STATE_LABEL } from '@veritut/types';
  let { state, small = false }: { state: ComponentState; small?: boolean } = $props();
  const glyph: Record<ComponentState, string> = { ok: '✓', degraded: '!', down: '✕', maintenance: '↻', unknown: '?' };
</script>

<span class="vt-dot" class:vt-dot-sm={small} data-state={state} role="img" aria-label={COMPONENT_STATE_LABEL[state]}>
  {#if !small}{glyph[state]}{/if}
</span>
