<script lang="ts">
  import type { Residency } from '@veritut/types';
  import { RESIDENCY_LABEL } from '@veritut/types';
  let { residency, small = false }: { residency: Residency; small?: boolean } = $props();
</script>

<span class="vt-res" class:vt-res-sm={small} data-res={residency} title={RESIDENCY_LABEL[residency]}>{residency}</span>
