<!-- HashChip — kanıt dili: hash mono + kopyala; kırık zincir kırmızı, gizlenmez. -->
<script lang="ts">
  let {
    hash,
    broken = false,
    label,
  }: { hash: string; broken?: boolean; label?: string } = $props();
  let copied = $state(false);
  const short = $derived(hash.length <= 12 ? hash : `${hash.slice(0, 4)}…${hash.slice(-4)}`);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(hash);
      copied = true;
      setTimeout(() => (copied = false), 1600);
    } catch {
      /* clipboard yoksa sessiz */
    }
  }
</script>

<span class="vt-hash" data-broken={broken}>
  {#if broken}
    ✕ {label ?? 'zincir doğrulanamadı'}
  {:else}
    ✓ {label ?? 'zincir bütün'}
  {/if}
  <code title={hash}>{short}</code>
  {#if !broken}
    <button type="button" onclick={copy}>{copied ? 'kopyalandı' : 'kopyala'}</button>
  {/if}
</span>
