<script lang="ts">
  import { Card, StatusPill, ResidencyBadge } from '@veritut/ui';
  const urunler = [
    { slug: 'nextcloud', ad: 'Yönetilen Nextcloud', ozet: 'Kurumsal dosya paylaşımı; SSO, yedek ve geri dönüş kanıtı dahil.' },
    { slug: 'n8n', ad: 'Yönetilen n8n', ozet: 'Otomasyon akışları; güncelleme ve yedek bizde, akış sizde.' },
    { slug: 'zammad', ad: 'Yönetilen Zammad', ozet: 'Destek masası; e-posta ve SSO hazır kurulur.' },
    { slug: 'sunucu', ad: 'Yönetilen sunucu', ozet: 'Yama, izleme, sertleştirme, 3-2-1 yedek, aylık tatbikat.' },
  ];
</script>

<section class="vt-hero" style="padding:64px 40px; display:grid; gap:18px; max-width:100%">
  <p class="vt-kicker" style="color:rgba(255,255,255,.7)">Yönetilen bulut operatörü · veri emanetçisi</p>
  <h1 class="vt-h1" style="font-size:40px; max-width:760px">Sunucu satmıyoruz. Sorumluluğu devralıyoruz.</h1>
  <p class="vt-lead" style="color:rgba(255,255,255,.82); max-width:640px">
    Kim kuracak, kim yedekleyecek, gece üçte kim müdahale edecek, denetimde belgeyi kim verecek? Tek muhatap: VERITUT.
    Yedeklediğimizi söylemiyoruz; geri döndüğünü kanıtlıyoruz.
  </p>
  <div style="display:flex; gap:10px; flex-wrap:wrap">
    <a href="/panel" class="vt-btn vt-btn-lg" style="background:#fff; color:#13223a">Portala gir</a>
    <a href="/guvence" class="vt-btn vt-btn-lg" style="border-color:rgba(255,255,255,.4); color:#fff">Kanıt zincirini gör</a>
  </div>
</section>

<section style="display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px; margin-top:36px">
  <Card title="Kur"><p class="vt-help" style="margin:0">Sipariş → otomatik kurulum. Elle kurulan müşteri ortamı yok; her şey kod olarak, sürümlü.</p></Card>
  <Card title="Tut"><p class="vt-help" style="margin:0">Yama, yedek, izleme, olay müdahalesi ve değişiklik yönetimi. Kapsam sözleşmede madde madde.</p></Card>
  <Card title="Kanıtla"><p class="vt-help" style="margin:0">Hash zincirli Kanıt Defteri, aylık SLA raporu, denetim için uyumluluk paketi ve otomatik alt işleyen listesi.</p></Card>
</section>

<section style="margin-top:56px">
  <h2 class="vt-h2">Ürünler</h2>
  <p class="vt-lead" style="margin:4px 0 20px">Yazılım lisansı ücretsiz; sunucu, kurulum, güncelleme, yedek ve destek bizde.</p>
  <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:14px">
    {#each urunler as u (u.slug)}
      <Card title={u.ad}>
        <p class="vt-help" style="margin:0 0 14px">{u.ozet}</p>
        <div style="display:flex; gap:6px; align-items:center">
          <ResidencyBadge residency="TR" small /><ResidencyBadge residency="EU" small />
          <span class="vt-help">verinizin duracağı yeri siz seçersiniz</span>
        </div>
      </Card>
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
  <Card title="SLA katmanları ayrı fiyatlanır">
    <p class="vt-help" style="margin:0">9x5 standart · 7x24 kritik · özel yanıt süresi. Herkese 7x24 sözü vermiyoruz; verdiğimiz sözü saatle ölçüyoruz.</p>
  </Card>
</section>
