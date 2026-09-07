<!--
  PageHead — sayfa başlığının TEK kalıbı: mono eyebrow + başlık + açıklama + eylemler.
  Yoğunluk yüzeye göre değişir (tasarım): pazarlama iri, portal ferah, ops sıkı.
  `mono` bir kimlik başlığı içindir (run:f3a9c21e gibi).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props {
    title: string;
    eyebrow?: string;
    lead?: string;
    variant?: 'marketing' | 'panel' | 'ops';
    mono?: boolean;
    /** Başlığın yanına giren rozet (ikametgâh, durum) — tasarımda ad ile aynı satırda durur. */
    badge?: Snippet;
    actions?: Snippet;
    children?: Snippet;
  }
  let { title, eyebrow, lead, variant = 'panel', mono = false, badge, actions, children }: Props = $props();
</script>

<header class="vt-pagehead" data-variant={variant}>
  <div style="min-width:0">
    {#if eyebrow}<p class="vt-eyebrow">( {eyebrow} )</p>{/if}
    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap">
      <h1 class="vt-pagetitle" class:mono>{title}</h1>
      {#if badge}{@render badge()}{/if}
    </div>
    {#if lead}<p class="vt-lead">{lead}</p>{/if}
    {@render children?.()}
  </div>
  {#if actions}<div class="vt-pagehead-actions">{@render actions()}</div>{/if}
</header>
