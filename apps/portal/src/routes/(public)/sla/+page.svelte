<script lang="ts">
  import { Card } from '@veritut/ui';
  let { data } = $props();
</script>

<svelte:head>
  <title>Hizmet seviyesi taahhüdü (SLA) — VERITUT</title>
  <meta name="description" content="Yanıt ve çözüm süreleri, uptime hedefi, kredi mekanizması ve kapsam dışı hâller." />
  <link rel="canonical" href="https://veritut.com/sla" />
</svelte:head>

<article style="max-width:760px">
  <h1 class="vt-h1">Hizmet seviyesi taahhüdü</h1>
  <p class="vt-lead" style="margin:6px 0 24px">Söz verdiğimiz süreleri ölçer, aylık raporlar ve hedefin altında kalırsak krediyi kendimiz hesaplarız.</p>

  <Card padded={false}>
    <div class="vt-table-wrap">
      <table class="vt-table" style="min-width:520px">
        <thead><tr><th>Katman</th><th>Kapsam</th><th class="num">İlk yanıt</th><th class="num">Çözüm hedefi</th><th class="num">Uptime</th></tr></thead>
        <tbody>
          {#each data.slaTiers as s (s.code)}<tr><td>{s.title}</td><td>{s.coverage === '24x7' ? 'Her gün 7x24' : 'İş günleri 09:00-18:00 (TR)'}</td><td class="num">{s.responseMin} dk</td><td class="num">{Math.round(s.resolveMin / 60)} sa</td><td class="num">%{s.uptimeTarget}</td></tr>{/each}
        </tbody>
      </table>
    </div>
  </Card>

  <h2 class="vt-h2" style="margin:32px 0 8px">Saat nasıl işler</h2>
  <p style="margin:0 0 12px; line-height:1.65">Süre, olayın açıldığı anda başlar ve çözüldüğünde durur. 9x5 katmanında yalnız iş saatleri sayılır; resmî tatiller takvimden düşülür. Sizden bilgi beklediğimiz süre durdurulur ve raporda ayrıca gösterilir.</p>

  <h2 class="vt-h2" style="margin:32px 0 8px">Uptime ve kredi</h2>
  <p style="margin:0 0 12px; line-height:1.65">Uptime, dış izleme sondalarımız ve ilan edilmiş olaylarla hesaplanır. Planlı bakım pencereleri hesaba katılmaz. Hedefin altında kalırsak krediyi biz hesaplar, aylık raporda ve faturanızda gösteririz; talep etmenize gerek yoktur.</p>

  <h2 class="vt-h2" style="margin:32px 0 8px">Kapsam dışı</h2>
  <ul style="margin:0 0 12px; padding-left:20px; line-height:1.7">
    <li>Sizin veya üçüncü tarafların yaptığı, bizim onaylamadığımız değişiklikler</li>
    <li>Uygulamanızın kendi kodundan kaynaklanan hatalar</li>
    <li>Tedarikçi kaynaklı bölgesel kesintiler (bildiririz, kredi hesabına dahil edilir; çözüm süremiz tedarikçiye bağlıdır)</li>
    <li>Yetkisiz erişim sonucu sizin tarafınızda oluşan olaylar</li>
  </ul>
  <p class="vt-help" style="margin:24px 0 0">Bu sayfa özet niteliğindedir. Bağlayıcı metin sözleşmenizin ekidir. <a href="/sozlesmeler">Sözleşmeler</a></p>
</article>
