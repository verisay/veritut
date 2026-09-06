<!-- Card — `.vt-card` (14 px köşe, gölge yok). Başlık şeridi `title`/`header`, alt şerit `footer`. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title?: string;
    subtitle?: string;
    padded?: boolean;
    actions?: Snippet;
    header?: Snippet;
    footer?: Snippet;
    class?: string;
    children?: Snippet;
  }
  let { title, subtitle, padded = true, actions, header, footer, class: className = '', children }: Props = $props();
  const hasHead = $derived(Boolean(header || title || actions));
</script>

<div class="vt-card {className}">
  {#if hasHead}
    <div class="vt-card-head">
      {#if header}
        {@render header()}
      {:else}
        <div>
          {#if title}<h3 class="vt-card-title">{title}</h3>{/if}
          {#if subtitle}<p class="vt-card-sub">{subtitle}</p>{/if}
        </div>
      {/if}
      {#if actions}<div>{@render actions()}</div>{/if}
    </div>
  {/if}
  <div class={padded ? 'vt-card-pad' : ''}>{@render children?.()}</div>
  {#if footer}<div class="vt-card-foot">{@render footer()}</div>{/if}
</div>
