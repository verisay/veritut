<script lang="ts">
  import { Card, StatusPill, ResidencyBadge } from '@veritut/ui';
  let { data } = $props();
</script>

<svelte:head>
  <title>VERITUT — sunucu değil, sorumluluğun devri</title>
  <meta name="description" content="Yönetilen çoklu-bulut operatörü. Kurulum, yama, yedek ve nöbet bizde; her adım kanıt defterinize düşer. Verinizin duracağı ülkeyi siz seçersiniz." />
  <link rel="canonical" href="https://veritut.com/" />
</svelte:head>

<section class="vt-hero" style="padding:64px 40px; display:grid; gap:18px; max-width:100%">
  <p class="vt-kicker" style="color:rgba(255,255,255,.7)">Yönetilen bulut operatörü · veri emanetçisi</p>
  <h1 class="vt-h1" style="font-size:40px; max-width:760px">Sunucu satmıyoruz. Sorumluluğu devralıyoruz.</h1>
  <p class="vt-lead" style="color:rgba(255,255,255,.82); max-width:640px">
    Kim kuracak, kim yedekleyecek, gece üçte kim müdahale edecek, denetimde belgeyi kim verecek? Tek muhatap: VERITUT.
    Yedeklediğimizi söylemiyoruz; geri döndüğünü kanıtlıyoruz.
  </p>
  <div style="display:flex; gap:10px; flex-wrap:wrap">
    <a href="/urunler" class="vt-btn vt-btn-lg" style="background:#fff; color:#13223a">Ürünlere bak</a>
    <a href="/guvence" class="vt-btn vt-btn-lg" style="border-color:rgba(255,255,255,.4); color:#fff">Kanıt zincirini gör</a>
  </div>
</section>

<section style="display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px; margin-top:36px">
  <Card title="Kur"><p class="vt-help" style="margin:0">Sipariş → otomatik kurulum. Elle kurulan müşteri ortamı yok; her şey kod olarak, sürümlü.</p></Card>
  <Card title="Tut"><p class="vt-help" style="margin:0">Yama, yedek, izleme, olay müdahalesi ve değişiklik yönetimi. Kapsam sözleşmede madde madde.</p></Card>
  <Card title="Kanıtla"><p class="vt-help" style="margin:0">Hash zincirli Kanıt Defteri, aylık SLA raporu, denetim için uyumluluk paketi ve otomatik alt işleyen listesi.</p></Card>
</section>

<section style="margin-top:56px">
  <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:16px; flex-wrap:wrap">
    <div><h2 class="vt-h2">Ürünler</h2><p class="vt-lead" style="margin:4px 0 0">Yazılım lisansı ücretsiz; sunucu, kurulum, güncelleme, yedek ve destek bizde.</p></div>
    <a href="/urunler" style="font-size:13.5px; font-weight:700">Tümü →</a>
  </div>
  <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:14px; margin-top:20px">
    {#each data.products as u (u.slug)}
      <a href="/urunler/{u.slug}" class="vt-card vt-card-pad" style="color:inherit; display:block">
        <p class="vt-h3" style="margin:0 0 6px">{u.title}</p>
        <p class="vt-help" style="margin:0 0 14px">{u.summary}</p>
        <div style="display:flex; gap:6px; align-items:center"><ResidencyBadge residency="TR" small /><ResidencyBadge residency="EU" small /><span class="vt-help">ikametgâhı siz seçersiniz</span></div>
      </a>
    {:else}
      <p class="muted">Katalog şu an yüklenemedi.</p>
    {/each}
  </div>
</section>

<section style="margin-top:56px; display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:14px">
  <Card title="Şeffaflık pazarlama değil, ürün">
    <div style="display:flex; flex-direction:column; gap:10px">
      <div style="display:flex; justify-content:space-between; align-items:center"><span>Platform durumu</span><StatusPill state="ok" small /></div>
      <div style="display:flex; justify-content:space-between; align-items:center"><span>Personel erişimi</span><span class="vt-help">portalınızda görünür</span></div>
      <div style="display:flex; justify-content:space-between; align-items:center"><span>Aylık kanıt çapası</span><span class="vt-help">kamuya açık</span></div>
    </div>
  </Card>
  <Card title="Planlar">
    <div style="display:grid; gap:8px">
      {#each data.plans as p (p.code)}<div style="display:flex; justify-content:space-between; gap:12px"><span style="font-weight:700">{p.title}</span><span class="vt-help">{p.summary}</span></div>{/each}
    </div>
    <a href="/fiyatlandirma" class="vt-btn vt-btn-secondary vt-btn-sm" style="margin-top:14px">Fiyatlandırma</a>
  </Card>
</section>
