<script lang="ts">
  import { Card, PageHead, ResidencyBadge } from '@veritut/ui';
  import { FEATURE_LABEL, type FeatureKey } from '@veritut/types';
  let { data } = $props();
  const featureRows = ['workloads.max', 'users.max', 'sla.tiers', 'backup.offsite', 'backup.drill.monthly', 'evidence.bundle', 'status.tenant_page', 'api.enabled', 'api.keys.max', 'support.priority', 'finops'] as FeatureKey[];
  const show = (v: unknown): string => (v === -1 ? 'sınırsız' : v === true ? '✓' : v === false || v === 0 || v === undefined ? '—' : Array.isArray(v) ? v.join(', ') : String(v));
  const cheapest = (slug: string, planCode: string) => {
    const list = data.prices.find((p) => p.slug === slug)?.prices.filter((x) => x.planCode === planCode) ?? [];
    return list.length ? list.reduce((a, b) => (a.monthly <= b.monthly ? a : b)) : null;
  };
</script>

<svelte:head>
  <title>Fiyatlandırma — VERITUT</title>
  <meta name="description" content="Üç plan, iki SLA katmanı. Fiyat sunucu başına değil, yönetilen iş yükü ve SLA seviyesi başına." />
  <link rel="canonical" href="https://veritut.com/fiyatlandirma" />
</svelte:head>

<PageHead title="Fiyatlandırma" eyebrow="katalog" variant="marketing" />
<p class="vt-lead" style="margin:6px 0 8px; max-width:720px">Fiyat sunucu başına değil, <strong>yönetilen iş yükü ve SLA seviyesi</strong> başınadır. Kapsam sözleşmede madde madde yazılıdır.</p>
<p class="vt-help" style="margin:0 0 28px">Tutarlar aylık ve KDV hariçtir. İkametgâh ve SLA katmanı fiyatı etkiler.</p>

<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:14px">
  {#each data.plans as p (p.code)}
    <Card title={p.title} subtitle={p.summary}>
      <div style="display:grid; gap:6px; font-size:13px">
        {#each featureRows as f (f)}
          {#if p.features[f] !== undefined}<div style="display:flex; justify-content:space-between; gap:10px"><span class="muted">{FEATURE_LABEL[f]}</span><span style="font-weight:700">{show(p.features[f])}</span></div>{/if}
        {/each}
      </div>
      <a href="/panel/siparis?plan={p.code}" class="vt-btn vt-btn-primary vt-btn-sm" style="margin-top:14px">Bu planla başla</a>
    </Card>
  {/each}
</div>

<section style="margin-top:36px">
  <h2 class="vt-h2" style="margin-bottom:6px">SLA katmanları</h2>
  <p class="vt-lead" style="margin:0 0 16px">Herkese 7x24 sözü vermiyoruz. Verdiğimiz sözü saatle ölçüyor, aylık raporluyoruz.</p>
  <Card padded={false}>
    <div class="vt-table-wrap">
      <table class="vt-table" style="min-width:560px">
        <thead><tr><th>Katman</th><th>Kapsam</th><th class="num">Yanıt</th><th class="num">Çözüm hedefi</th><th class="num">Uptime</th><th class="num">Ek ücret</th></tr></thead>
        <tbody>
          {#each data.slaTiers as s (s.code)}
            <tr><td>{s.title} <span class="mono muted" style="font-size:11px">{s.code}</span></td><td>{s.coverage === '24x7' ? '7x24' : 'İş günü 09:00-18:00'}</td><td class="num">{s.responseMin} dk</td><td class="num">{Math.round(s.resolveMin / 60)} sa</td><td class="num">%{s.uptimeTarget}</td><td class="num">{s.monthlyUpliftPct > 0 ? `+%${s.monthlyUpliftPct}` : '—'}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </Card>
</section>

<section style="margin-top:36px">
  <h2 class="vt-h2" style="margin-bottom:16px">Ürün başlangıç fiyatları</h2>
  <Card padded={false}>
    <div class="vt-table-wrap">
      <table class="vt-table" style="min-width:600px">
        <thead><tr><th>Ürün</th>{#each data.plans as p (p.code)}<th class="num">{p.title}</th>{/each}</tr></thead>
        <tbody>
          {#each data.products as u (u.slug)}
            <tr>
              <td><a href="/urunler/{u.slug}">{u.title}</a></td>
              {#each data.plans as p (p.code)}
                {@const c = cheapest(u.slug, p.code)}
                <td class="num">{c ? `${c.monthly.toLocaleString('tr-TR')} ${c.currency}` : '—'}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </Card>
  <p class="vt-help" style="margin:12px 0 0">En düşük boyut ve ikametgâh bileşimine göre. Tam matris ürün sayfasında. <ResidencyBadge residency="TR" small /> Türkiye ikametgâhı yaklaşık %10 farklıdır.</p>
</section>

<section style="margin-top:36px; max-width:720px">
  <Card title="14 gün deneme">
    <p class="vt-help" style="margin:0">Kart istemiyoruz. Deneme en küçük boyutta ve kiracı başına bir kezdir. Süre dolduğunda iş yükü durur, veriniz durur; 7 gün içinde planı başlatırsanız kaldığı yerden devam eder.</p>
  </Card>
</section>
