<script lang="ts">
  import type { ComponentState } from '@veritut/types';
  import { COMPONENT_STATE_LABEL } from '@veritut/types';
  import StatusDot from './StatusDot.svelte';
  let { state, label, small = false }: { state: ComponentState; label?: string; small?: boolean } = $props();
</script>

<span class="vt-status" class:vt-status-sm={small} data-state={state}>
  <StatusDot {state} />
  {label ?? COMPONENT_STATE_LABEL[state]}
</span>
