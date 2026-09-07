<script lang="ts">
  import { Card, PageHead } from '@veritut/ui';
  let { data } = $props();
</script>

<svelte:head>
  <title>{data.cmp.title} — VERITUT</title>
  <meta name="description" content={data.cmp.summary} />
  <link rel="canonical" href="https://veritut.com/karsilastir/{data.product.slug}-vs-{data.cmp.rival}" />
</svelte:head>

<article style="max-width:720px">
  <p class="vt-kicker"><a href="/urunler/{data.product.slug}">{data.product.title}</a> · karşılaştırma</p>
  <PageHead title={data.cmp.title} eyebrow="karşılaştırma" variant="marketing" />
  <p class="vt-lead" style="margin:0 0 24px">{data.cmp.summary}</p>
  <Card title="VERITUT ne ekliyor?">
    <ul style="margin:0; padding-left:20px; display:grid; gap:8px; font-size:14px">
      <li>Kurulum kod olarak; elle yapılan değişiklik yok, her mutasyon kayıtlı.</li>
      <li>3-2-1 yedek ve aylık geri dönüş tatbikatı; sonucu kanıt defterinizde.</li>
      <li>Verinizin duracağı ülkeyi siz seçersiniz; alt işleyen listeniz otomatik üretilir.</li>
      <li>Personel erişimleri portalınızda görünür.</li>
    </ul>
  </Card>
  <div style="margin-top:20px"><a href="/urunler/{data.product.slug}" class="vt-btn vt-btn-primary">{data.product.title} detayı</a></div>
</article>
