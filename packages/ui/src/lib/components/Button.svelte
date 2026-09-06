<!--
  Button — görünüm `.vt-btn*` sınıflarından; burada yalnız varyant/durum mantığı.
  `href` verilirse <a>, aksi hâlde <button>. Yıkıcı eylem (`danger`) her zaman dört-göz onayına gider.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Spinner from './Spinner.svelte';

  interface Props {
    variant?: 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    href?: string;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    loading?: boolean;
    fullWidth?: boolean;
    icon?: Snippet;
    onclick?: (event: MouseEvent) => void;
    class?: string;
    children?: Snippet;
    [key: string]: unknown;
  }

  let {
    variant = 'primary',
    size = 'md',
    href,
    type = 'button',
    disabled = false,
    loading = false,
    fullWidth = false,
    icon,
    onclick,
    class: className = '',
    children,
    ...rest
  }: Props = $props();

  const classes = $derived(
    ['vt-btn', `vt-btn-${variant}`, size !== 'md' ? `vt-btn-${size}` : '', fullWidth ? 'vt-btn-full' : '', className]
      .filter(Boolean)
      .join(' '),
  );
  const asLink = $derived(Boolean(href) && !disabled && !loading);
</script>

{#snippet inner()}
  {#if loading}
    <Spinner size={size === 'lg' ? 18 : 15} />
  {:else if icon}
    {@render icon()}
  {/if}
  {@render children?.()}
{/snippet}

{#if asLink}
  <a {href} class={classes} {onclick} {...rest}>{@render inner()}</a>
{:else}
  <button {type} class={classes} disabled={disabled || loading} aria-busy={loading ? 'true' : undefined} {onclick} {...rest}>
    {@render inner()}
  </button>
{/if}
