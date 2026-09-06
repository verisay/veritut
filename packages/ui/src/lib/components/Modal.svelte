<!-- Modal — onay diyaloğu; ESC ve arka plan tıklaması kapatır. Yıkıcı eylemlerde `danger` buton kullanılır. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    open = $bindable(false),
    title,
    children,
    actions,
  }: { open: boolean; title: string; children?: Snippet; actions?: Snippet } = $props();

  let dialogEl: HTMLDivElement | undefined = $state();
  function onkeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') open = false;
  }
  $effect(() => {
    if (open) dialogEl?.focus();
  });
</script>

<svelte:window {onkeydown} />

{#if open}
  <!-- Arka plan: tıklama kapatır; klavye kapatma svelte:window ESC ile. -->
  <div class="vt-backdrop" role="presentation" onclick={() => (open = false)}>
    <div
      class="vt-modal"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabindex="-1"
      bind:this={dialogEl}
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <p class="vt-modal-title">{title}</p>
      <div class="vt-modal-body">{@render children?.()}</div>
      {#if actions}<div class="vt-modal-actions">{@render actions()}</div>{/if}
    </div>
  </div>
{/if}
