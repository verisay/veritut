<script lang="ts">
  let { data } = $props();
  const byLayer = $derived([2, 3, 4].map((l) => ({ layer: l, items: data.products.filter((p) => p.layer === l && p.published) })).filter((g) => g.items.length));
  const layerTitle: Record<number, string> = { 1: 'Zemin', 2: 'Yönetilen servisler', 3: 'Açık kaynak iş uygulamaları', 4: 'Danışmanlık' };
</script>

<svelte:head>
  <title>Ürünler — VERITUT</title>
  <meta name="description" content="Yönetilen sunucu, Nextcloud, n8n, Zammad. Yazılım lisansı ücretsiz; kurulum, güncelleme, yedek ve destek VERITUT'ta." />
  <link rel="canonical" href="https://veritut.com/urunler" />
</svelte:head>

<h1 class="vt-h1">Ürünler</h1>
<p class="vt-lead" style="margin:6px 0 28px; max-width:680px">Her ürün aynı disiplinle kurulur: kod olarak provizyon, 3-2-1 yedek, aylık geri dönüş tatbikatı ve kanıt defteri.</p>

{#each byLayer as g (g.layer)}
  <section style="margin-bottom:36px">
    <p class="vt-kicker" style="margin:0 0 12px">Katman {g.layer} · {layerTitle[g.layer]}</p>
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:14px">
      {#each g.items as p (p.slug)}
        <a href="/urunler/{p.slug}" class="vt-card vt-card-pad" style="color:inherit; display:block">
          <p class="vt-h3" style="margin:0 0 6px">{p.title}</p>
          <p class="vt-help" style="margin:0">{p.summary}</p>
        </a>
      {/each}
    </div>
  </section>
{/each}
