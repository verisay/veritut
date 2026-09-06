<script lang="ts">
  import { Card, ResidencyBadge } from '@veritut/ui';
  let { data } = $props();
  const p = $derived(data.product);
  const cheapest = $derived(data.prices.length ? data.prices.reduce((a, b) => (a.monthly <= b.monthly ? a : b)) : null);
  const jsonLd = $derived(
    JSON.stringify([
      {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: p.title,
        description: p.seoDescription ?? p.summary,
        brand: { '@type': 'Brand', name: 'VERITUT' },
        ...(cheapest ? { offers: { '@type': 'Offer', price: cheapest.monthly, priceCurrency: cheapest.currency, availability: 'https://schema.org/InStock', url: `https://veritut.com/urunler/${p.slug}` } } : {}),
      },
      ...(p.faq.length ? [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: p.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }] : []),
    ]),
  );
  /** Markdown'ın küçük alt kümesi — `marked` yerine (public sayfada JS ve bağımlılık yok). */
  function render(md: string): string {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return md
      .split(/\n{2,}/)
      .map((block) => {
        const b = block.trim();
        if (b.startsWith('## ')) return `<h2 class="vt-h2" style="margin:28px 0 8px">${esc(b.slice(3))}</h2>`;
        if (b.startsWith('- ')) return `<ul style="margin:0 0 12px; padding-left:20px">${b.split('\n').map((l) => `<li style="margin:4px 0">${esc(l.replace(/^- /, ''))}</li>`).join('')}</ul>`;
        return `<p style="margin:0 0 12px; line-height:1.65">${esc(b)}</p>`;
      })
      .join('');
  }
</script>

<svelte:head>
  <title>{p.seoTitle ?? `${p.title} — VERITUT`}</title>
  <meta name="description" content={p.seoDescription ?? p.summary} />
  <link rel="canonical" href="https://veritut.com/urunler/{p.slug}" />
  {@html `<script type="application/ld+json">${jsonLd}</script>`}
</svelte:head>

<article style="max-width:760px">
  <p class="vt-kicker"><a href="/urunler">Ürünler</a> · katman {p.layer}</p>
  <h1 class="vt-h1" style="margin:6px 0 8px">{p.title}</h1>
  <p class="vt-lead" style="margin:0 0 20px">{p.summary}</p>
  <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:24px">
    {#each data.residencies as r (r)}<ResidencyBadge residency={r} />{/each}
    {#if cheapest}<span class="vt-help">aylık {cheapest.monthly.toLocaleString('tr-TR')} {cheapest.currency} taban fiyattan başlar</span>{/if}
    <a href="/panel/siparis?urun={p.slug}" class="vt-btn vt-btn-primary vt-btn-sm">Kurulumu başlat</a>
  </div>
  {@html render(p.bodyMd)}
</article>

<section style="margin-top:36px; display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:14px">
  <Card title="Boyutlar">
    <ul style="margin:0; padding:0; list-style:none; display:grid; gap:6px; font-size:13.5px">
      {#each data.sizes as s (s.code)}<li><span class="mono">{s.code}</span> · {s.title}</li>{/each}
    </ul>
  </Card>
  <Card title="Dahil olanlar">
    <ul style="margin:0; padding:0; list-style:none; display:grid; gap:6px; font-size:13.5px">
      <li>Kod olarak kurulum, sürümlü blueprint {#if data.blueprintVersion}<span class="mono">{data.blueprintVersion}</span>{/if}</li>
      {#if data.backup}<li>Yedek: {data.backup.schedule} · offsite farklı tedarikçide</li>{/if}
      {#if data.sso}<li>VERITUT hesabıyla tek oturum açma</li>{/if}
      {#if data.checks.length}<li>Kurulum doğrulaması: {data.checks.join(', ')}</li>{/if}
      <li>Her kurulum, yedek ve erişim kanıt defterinde</li>
    </ul>
  </Card>
</section>

{#if data.prices.length}
  <section style="margin-top:14px">
    <Card title="Fiyatlar" subtitle="Aylık, KDV hariç. SLA katmanı ve ikametgâh fiyatı etkiler." padded={false}>
      <div class="vt-table-wrap">
        <table class="vt-table" style="min-width:560px">
          <thead><tr><th>Boyut</th><th>İkametgâh</th><th>Plan</th><th>SLA</th><th class="num">Aylık</th><th class="num">Kurulum</th></tr></thead>
          <tbody>
            {#each data.prices as pr (pr.size + pr.residency + pr.planCode + pr.slaCode)}
              <tr><td class="mono">{pr.size}</td><td><ResidencyBadge residency={pr.residency as 'TR'} small /></td><td>{data.plans.find((x) => x.code === pr.planCode)?.title ?? pr.planCode}</td><td class="mono">{pr.slaCode}</td><td class="num">{pr.monthly.toLocaleString('tr-TR')} {pr.currency}</td><td class="num">{pr.setupFee.toLocaleString('tr-TR')}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </Card>
  </section>
{/if}

{#if p.faq.length}
  <section style="margin-top:36px; max-width:760px">
    <h2 class="vt-h2" style="margin-bottom:14px">Sık sorulanlar</h2>
    <div style="display:grid; gap:10px">
      {#each p.faq as f (f.q)}
        <details class="vt-card vt-card-pad"><summary style="font-weight:700; cursor:pointer">{f.q}</summary><p class="vt-help" style="margin:10px 0 0">{f.a}</p></details>
      {/each}
    </div>
  </section>
{/if}

{#if p.compare.length}
  <section style="margin-top:36px">
    <h2 class="vt-h2" style="margin-bottom:14px">Karşılaştırma</h2>
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px">
      {#each p.compare as c (c.rival)}<a href="/karsilastir/{p.slug}-vs-{c.rival}" class="vt-card vt-card-pad" style="color:inherit"><p class="vt-h3" style="margin:0 0 6px">{c.title}</p><p class="vt-help" style="margin:0">{c.summary}</p></a>{/each}
    </div>
  </section>
{/if}
