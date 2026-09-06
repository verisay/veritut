<script lang="ts">
  let { size = 16 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true" class="vt-spin">
  <path d="M12 3a9 9 0 1 0 9 9" stroke-linecap="round" />
</svg>

<style>
  .vt-spin {
    animation: vt-rot 0.8s linear infinite;
  }
  @keyframes vt-rot {
    to {
      transform: rotate(360deg);
    }
  }
</style>
