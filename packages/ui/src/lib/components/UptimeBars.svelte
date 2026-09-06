<!--
  UptimeBars — günlük erişilebilirlik çubukları (30 veya 90 gün).
  Renk semantik ve sabit; veri yoksa `unknown` çubuğu gösterilir — boşluk bırakılmaz.
-->
<script lang="ts">
  import type { ComponentState } from '@veritut/types';
  let {
    bars,
    height = 22,
    dense = false,
    animate = false,
  }: { bars: ComponentState[]; height?: number; dense?: boolean; animate?: boolean } = $props();
</script>

<div class="vt-bars" data-dense={dense || undefined} data-animate={animate || undefined} style="--bar-h:{height}px">
  {#each bars as b, i (i)}
    <span data-state={b} style={animate ? `animation-delay:${(i * 0.018).toFixed(3)}s` : undefined}></span>
  {/each}
</div>
