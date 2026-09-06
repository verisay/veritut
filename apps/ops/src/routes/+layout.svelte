<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';
  import { ToastStack } from '@veritut/ui';
  let { children }: { children: Snippet } = $props();
</script>

{@render children()}
<ToastStack />
