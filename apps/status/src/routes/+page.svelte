<script lang="ts">
  import StatusBoard from '$lib/StatusBoard.svelte';
  let { data } = $props();
</script>

<svelte:head><title>VERITUT durum</title></svelte:head>
<StatusBoard snapshot={data.snapshot} title="VERITUT platform durumu" />
