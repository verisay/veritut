<script lang="ts">
  import { Card, PageHead } from '@veritut/ui';
</script>

<svelte:head>
  <title>Sözleşmeler — VERITUT</title>
  <meta name="description" content="Hizmet şartları, SLA eki, veri işleme sözleşmesi ve alt işleyen listesi." />
  <link rel="canonical" href="https://veritut.com/sozlesmeler" />
</svelte:head>

<PageHead title="Sözleşmeler" eyebrow="hukuk" variant="marketing" />
<p class="vt-lead" style="margin:6px 0 24px; max-width:720px">"Yönetilen" kelimesinin neyi içerdiği ve neyi içermediği burada madde madde yazılıdır.</p>
<div class="vt-status" data-state="degraded" style="margin-bottom:20px">TASLAK — hukuk incelemesi sürüyor. Bağlayıcı metinler imzalı sözleşmenizdir.</div>

<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:14px">
  <Card title="Hizmet şartları"><p class="vt-help" style="margin:0">Kapsam, tarafların yükümlülükleri, ödeme, askıya alma ve fesih.</p></Card>
  <Card title="SLA eki"><p class="vt-help" style="margin:0">Yanıt/çözüm süreleri, uptime ölçümü, kredi hesabı ve kapsam dışı hâller. <a href="/sla">Özet</a></p></Card>
  <Card title="Veri işleme sözleşmesi (DPA)"><p class="vt-help" style="margin:0">Veri sorumlusu-işleyen ilişkisi, ikametgâh taahhüdü, güvenlik önlemleri, ihlal bildirimi.</p></Card>
  <Card title="Alt işleyen listesi"><p class="vt-help" style="margin:0">Kiracınıza özel liste portalınızda otomatik üretilir; değişiklikler önceden bildirilir.</p></Card>
</div>

<section style="margin-top:32px; max-width:760px">
  <h2 class="vt-h2" style="margin-bottom:8px">Kapsamın sınırı</h2>
  <ul style="margin:0; padding-left:20px; line-height:1.7">
    <li><strong>Dahil:</strong> kurulum, güvenlik yamaları, izleme, yedek ve geri dönüş tatbikatı, olay müdahalesi (SLA katmanınıza göre), sürüm yükseltmeleri, kanıt ve raporlama.</li>
    <li><strong>Dahil değil:</strong> uygulamanızın içindeki iş mantığı, üçüncü taraf eklenti geliştirme, içerik/veri girişi, sizin yaptığınız yapılandırma değişikliklerinden doğan sorunlar.</li>
    <li><strong>Talebe bağlı:</strong> göç projeleri, FinOps, uyumluluk hazırlığı — ayrı teklifle.</li>
  </ul>
</section>
