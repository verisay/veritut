<script lang="ts">
  import StatusBoard from '$lib/StatusBoard.svelte';
  let { data } = $props();
</script>

<svelte:head><title>{data.tenant} durum — VERITUT</title><meta name="robots" content="noindex" /></svelte:head>
<StatusBoard snapshot={data.snapshot} title="{data.tenant} iş yükleri" />
