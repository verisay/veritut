<script lang="ts">
  import { Card, PageHead } from '@veritut/ui';
</script>

<svelte:head>
  <title>Geliştirici — VERITUT API</title>
  <meta name="description" content="İş yüklerinizi, kanıt defterinizi ve siparişlerinizi API ile yönetin. Bearer anahtar, kapsamlı yetki, OpenAPI." />
  <link rel="canonical" href="https://veritut.com/gelistirici" />
</svelte:head>

<article style="max-width:760px">
  <PageHead title="Geliştirici" variant="marketing" />
  <p class="vt-lead" style="margin:6px 0 24px">Ajanslar için: müşterinizin iş yükünü API ile kurun, sağlığını ve kanıt zincirini kendi panelinize taşıyın.</p>

  <Card title="Kimlik doğrulama">
    <p class="vt-help" style="margin:0 0 10px">Portal → API anahtarları bölümünden üretin. Anahtar yalnız üretim anında görünür; sonra geri okunamaz.</p>
    <div class="vt-codebox">curl -H "Authorization: Bearer vt_..." \
  https://api.veritut.com/api/v1/ext/workloads</div>
  </Card>

  <section style="margin-top:14px; display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px">
    <Card title="Kapsamlar">
      <ul style="margin:0; padding:0; list-style:none; display:grid; gap:6px; font-size:13px" class="mono">
        <li>workloads:read</li><li>evidence:read</li><li>orders:read</li><li>orders:write</li><li>status:read</li>
      </ul>
    </Card>
    <Card title="Sınırlar">
      <p class="vt-help" style="margin:0">Anahtar başına dakikada 120 istek. IP izin listesi tanımlayabilirsiniz. Anahtar kiracınıza bağlıdır; başka kiracının verisine erişemez.</p>
    </Card>
  </section>

  <section style="margin-top:14px">
    <Card title="Uçlar" padded={false}>
      <div class="vt-table-wrap">
        <table class="vt-table" style="min-width:520px">
          <thead><tr><th>Uç</th><th>Kapsam</th><th>Açıklama</th></tr></thead>
          <tbody>
            <tr><td class="mono">GET /ext/workloads</td><td class="mono">workloads:read</td><td>Sağlık kartları: durum, uptime, son yedek</td></tr>
            <tr><td class="mono">GET /ext/workloads/:id</td><td class="mono">workloads:read</td><td>Detay: uç noktalar, yedekler, erişim oturumları</td></tr>
            <tr><td class="mono">GET /ext/evidence</td><td class="mono">evidence:read</td><td>Kanıt olayları</td></tr>
            <tr><td class="mono">GET /ext/evidence/verify</td><td class="mono">evidence:read</td><td>Zincir bütünlüğü</td></tr>
            <tr><td class="mono">GET /ext/orders</td><td class="mono">orders:read</td><td>Siparişler</td></tr>
            <tr><td class="mono">POST /ext/orders</td><td class="mono">orders:write</td><td>Yeni iş yükü siparişi</td></tr>
          </tbody>
        </table>
      </div>
    </Card>
  </section>
  <p style="margin:20px 0 0"><a href="/api/v1/ext/openapi.json" class="vt-btn vt-btn-secondary vt-btn-sm" rel="external">OpenAPI tanımı</a></p>
</article>
