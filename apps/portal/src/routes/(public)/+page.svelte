<!--
  Ana sayfa — tasarımın "Ana Sayfa" artboard'ı.
  Kanıt kartı GERÇEK veriyle beslenir: platform zincirinin kimliksiz doğrulama hükmü (D13).
  Olay içeriği public uçtan dönmediği için kartta uydurma seq/hash gösterilmez —
  kaydettiğimiz kapalı olay sözlüğü ve zincirin gerçek durumu gösterilir.
-->
<script lang="ts">
  import { Mark, ResidencyBadge } from '@veritut/ui';
  import { EVIDENCE_KIND_LABEL, EVIDENCE_KIND_TONE, type EvidenceKind } from '@veritut/types';
  import { formatMoneyCompact, formatNumber, formatPercent, shortHash } from '@veritut/shared';
  let { data } = $props();

  /** Kartta gösterilen tür örnekleri — kapalı sözlükten (evidence-kinds.ts), uydurma değil. */
  const shown: EvidenceKind[] = ['backup.completed', 'restore.drill.passed', 'patch.applied', 'access.session', 'workload.provisioned'];
  const chainOk = $derived(data.verdict?.ok ?? null);
  const eventCount = $derived(data.verdict ? formatNumber(data.verdict.checked) : '—');
</script>

<svelte:head>
  <title>VERITUT — sunucu değil, sorumluluğun devri</title>
  <meta name="description" content="Yönetilen bulut. İş yükünüzü kurar, yamalar, yedekler, izleriz — ve her yedeğin geri döndüğünü tatbikatla kanıtlarız. Tek fatura, tek muhatap, tek sorumlu." />
  <link rel="canonical" href="https://veritut.com/" />
</svelte:head>

<!-- ── Hero ─────────────────────────────────────────────────────────── -->
<header class="vt-shell" style="padding:64px 0 40px; display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr)); gap:40px; align-items:center">
  <div>
    <h1 class="vt-display">
      <span style="display:block" class="vt-fade">Kuruyoruz.</span>
      <span style="display:block; animation-delay:.13s" class="vt-fade">Tutuyoruz.</span>
      <span style="display:block; color:var(--accent); animation-delay:.26s" class="vt-fade">Kanıtlıyoruz.</span>
    </h1>
    <p class="vt-prose vt-fade" style="margin:34px 0 0; font-size:18px; max-width:500px; animation-delay:.4s">
      Yönetilen bulut. İş yükünüzü kurar, yamalar, yedekler, izleriz — ve her yedeğin geri döndüğünü tatbikatla kanıtlarız.
      Tek fatura, tek muhatap, tek sorumlu.
    </p>
    <div class="vt-fade" style="display:flex; gap:14px; margin-top:38px; flex-wrap:wrap; animation-delay:.53s">
      <a href="/panel/siparis" class="vt-btn vt-btn-lg" style="background:var(--accent); color:var(--bg); font-weight:800">5 dakikada kurun</a>
      <a href="#kanit" class="vt-btn vt-btn-lg vt-btn-ghost" style="color:var(--text)">Kanıt nasıl çalışır →</a>
    </div>
  </div>

  <!-- Parantezin içinde tuttuğumuz şey: değiştirilemez kayıt -->
  <div class="vt-fade" style="display:flex; align-items:center; justify-content:center; min-width:0; animation-delay:.3s">
    <span aria-hidden="true" style="font-size:clamp(180px,22vw,320px); font-weight:800; line-height:.78; letter-spacing:-.05em; user-select:none; margin-right:-6px">(</span>
    <div class="vt-card" style="width:min(320px,100%); background:var(--surface-alt); overflow:hidden; flex-shrink:1">
      <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid var(--row-border)">
        <span class="mono vt-help" style="font-weight:600">kanıt defteri</span>
        <span class="mono" style="display:inline-flex; align-items:center; gap:6px; font-size:11px; color:var(--accent-text)">
          <span class="vt-dot vt-dot-sm vt-live" data-state="ok"></span>canlı
        </span>
      </div>
      <div style="padding:6px 16px 8px">
        {#each shown as k (k)}
          <div style="display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--row-border)">
            <span class="vt-kind" data-tone={EVIDENCE_KIND_TONE[k]} style="font-size:11px; padding:3px 8px">{EVIDENCE_KIND_LABEL[k]}</span>
            <span class="mono" style="flex:1; font-size:11px; color:var(--text-3); text-align:right; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">{k}</span>
          </div>
        {/each}
      </div>
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:11px 16px; background:var(--surface-2)">
        {#if chainOk === null}
          <span class="vt-help" style="font-weight:700">zincir durumu okunamadı</span>
        {:else if chainOk}
          <span style="font-size:12.5px; font-weight:800; color:var(--accent-text)">✓ zincir bütün</span>
          <span class="mono tnum vt-help">{eventCount} olay</span>
        {:else}
          <span class="vt-state-text" data-state="down" style="font-size:12.5px; font-weight:800">✕ zincir doğrulanamadı</span>
          <span class="mono tnum vt-help">seq {data.verdict?.brokenAt}</span>
        {/if}
      </div>
    </div>
    <span aria-hidden="true" style="font-size:clamp(180px,22vw,320px); font-weight:800; line-height:.78; letter-spacing:-.05em; user-select:none; margin-left:-6px">)</span>
  </div>
</header>

<p class="vt-shell mono vt-help" style="padding-bottom:90px; text-align:center">
  parantezin içinde tuttuğumuz şey: sizin için yaptığımız her işin değiştirilemez kaydı
</p>

<!-- ── Kur · Tut · Kanıtla ──────────────────────────────────────────── -->
<section style="border-top:1px solid var(--border)">
  <div class="vt-shell">
    <div class="vt-band">
      <div>
        <p class="vt-eyebrow" style="margin-bottom:14px">( 01 )</p>
        <p class="vt-word">Kur</p>
      </div>
      <p class="vt-prose">
        Sipariş verirsiniz; sunucu, güvenlik duvarı, SSO, TLS ve ilk yedek otomatik gelir. Elle kurulan ortam yok —
        her kurulum kod, her adım kayıtlı.
      </p>
      <ul class="mono" style="list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:9px; font-size:12.5px">
        <li style="display:flex; align-items:center; gap:11px"><span class="vt-dot" data-state="ok" style="width:14px; height:14px; font-size:9px">✓</span><span class="muted">plan · kaynaklar doğrulanır</span></li>
        <li style="display:flex; align-items:center; gap:11px"><span class="vt-dot" data-state="ok" style="width:14px; height:14px; font-size:9px">✓</span><span class="muted">apply · OpenTofu, şifreli state</span></li>
        <li style="display:flex; align-items:center; gap:11px"><span class="vt-dot" data-state="maintenance" style="width:14px; height:14px; font-size:9px">↻</span><span>configure · SSO + TLS + yedek</span></li>
        <li style="display:flex; align-items:center; gap:11px"><span style="width:14px; height:14px; border-radius:50%; border:1px solid var(--border-strong); box-sizing:border-box"></span><span class="vt-help">verify · teslimden önce kontroller</span></li>
      </ul>
    </div>

    <div class="vt-band">
      <div>
        <p class="vt-eyebrow" style="margin-bottom:14px">( 02 )</p>
        <p class="vt-word">Tut</p>
      </div>
      <p class="vt-prose">
        Güvenlik yamaları, 3-2-1 yedek, 7/24 izleme, SLA'lı müdahale. Sorun çıktığında nöbetçimiz uyanır — siz uyursunuz.
      </p>
      <div>
        <p class="vt-prose" style="margin:0; font-size:15px">
          Erişilebilirliği sondalardan ölçer, planlı bakımı düşer, aylık raporu kendimiz için değil sizin için yazarız.
        </p>
        <p class="vt-help" style="margin:10px 0 0">
          Canlı ölçüm <a href="https://durum.veritut.com" rel="external">durum sayfasında</a>.
        </p>
      </div>
    </div>

    <div class="vt-band">
      <div>
        <p class="vt-eyebrow" style="margin-bottom:14px">( 03 )</p>
        <p class="vt-word" style="color:var(--accent)">Kanıtla</p>
      </div>
      <p class="vt-prose">
        "Yedekliyoruz" demeyiz, gösteririz. Her ay yedeğiniz gerçekten geri döndürülür; sonuç, denetçinizin bağımsız
        doğrulayabildiği hash zincirine işlenir.
      </p>
      <div class="vt-chain">
        <span>sha256(önceki)</span>
        <hr />
        <span>‖ içerik ‖ zaman</span>
        <hr />
        <span data-head={data.verdict?.lastHash ? 'true' : undefined}>{data.verdict?.lastHash ? `${shortHash(data.verdict.lastHash)} ✓` : 'çapa'}</span>
      </div>
    </div>
  </div>
</section>

<!-- ── Kanıt Defteri ────────────────────────────────────────────────── -->
<section id="kanit" style="border-top:1px solid var(--border); background:var(--sunken)">
  <div class="vt-shell" style="padding-block:110px">
    <p class="vt-eyebrow" style="margin-bottom:26px">( kanıt defteri )</p>
    <h2 class="vt-display-2" style="max-width:960px">
      Tek bir kayıt değişse zincir kopar. <span style="color:var(--text-3)">Bunu gizleyemeyiz — tasarım gereği.</span>
    </h2>
    <div class="vt-stats" style="margin-top:64px; border-top:1px solid var(--border); padding-top:40px">
      <div>
        <p class="vt-stat-value">{eventCount}</p>
        <p class="vt-stat-label">platform zincirine işlenen olay — kimliksiz doğrulanabilir</p>
      </div>
      <div>
        <p class="vt-stat-value">{data.uptimeTarget === null ? '—' : formatPercent(data.uptimeTarget)}</p>
        <p class="vt-stat-label">en yüksek SLA taahhüdü — tutmazsak fatura kredisi otomatik önerilir</p>
      </div>
      <div>
        <p class="vt-stat-value">12<small>/yıl</small></p>
        <p class="vt-stat-label">geri dönüş tatbikatı — her iş yükünde, otomatik, kanıtlı</p>
      </div>
      <div>
        <p class="vt-stat-value">TR<span style="color:var(--text-3)">·</span>EU</p>
        <p class="vt-stat-label">ikametgâh sözleşmede değil kodda — TR verisi ABD'ye çıkamaz</p>
      </div>
    </div>
  </div>
</section>

<!-- ── Yönetilen uygulamalar ────────────────────────────────────────── -->
<section style="border-top:1px solid var(--border)">
  <div class="vt-shell" style="padding-top:100px">
    <p class="vt-eyebrow" style="margin-bottom:26px">( yönetilen uygulamalar )</p>
    <div style="border-top:1px solid var(--border)">
      {#each data.products as p (p.slug)}
        <a href="/urunler/{p.slug}" class="vt-rowlink">
          <span style="font-size:clamp(20px,2vw,26px); font-weight:800; letter-spacing:-.02em">{p.title}</span>
          <span class="vt-help" style="font-size:14.5px; line-height:1.5">{p.summary}</span>
          <span style="display:flex; gap:6px; white-space:nowrap">
            {#each p.residencies as r (r)}<ResidencyBadge residency={r} small />{/each}
          </span>
          <span class="mono tnum" style="font-size:13px; font-weight:600; color:var(--accent-text); text-align:right; min-width:88px; white-space:nowrap">
            {#if p.fromMonthly === null}fiyat isteyin{:else}{formatMoneyCompact(p.fromMonthly, p.currency)}<span class="vt-help">/ay</span>{/if}
          </span>
        </a>
      {:else}
        <p class="vt-help" style="padding:22px 12px">Katalog şu an yüklenemedi.</p>
      {/each}
    </div>
    <p class="vt-help" style="margin:18px 12px 0; font-size:13.5px">
      Hepsi tek girişle (SSO), yedekli ve kanıtlı. 14 gün deneyin — kart istemeyiz. <a href="/urunler" style="font-weight:700">Tüm katalog →</a>
    </p>
  </div>
</section>

<!-- ── Kapanış ──────────────────────────────────────────────────────── -->
<section class="vt-shell" style="padding:150px 0 130px; text-align:center">
  <p class="vt-display-2" style="font-size:clamp(40px,5.5vw,76px); line-height:1.1">
    <span style="color:var(--accent)">(</span> Sorumluluğu devredin <span style="color:var(--accent)">)</span>
  </p>
  <p class="vt-prose" style="margin:24px auto 0; font-size:16.5px; max-width:520px">
    Beğenmezseniz veriniz ve yedekleriniz paketlenmiş hâlde sizindir — kanıtıyla.
  </p>
  <div style="display:flex; gap:14px; justify-content:center; margin-top:38px; flex-wrap:wrap">
    <a href="/panel/siparis" class="vt-btn vt-btn-lg" style="background:var(--accent); color:var(--bg); font-weight:800">5 dakikada kurun</a>
    <a href="/guvence" class="vt-btn vt-btn-lg vt-btn-secondary">Kanıt zincirini doğrulayın</a>
  </div>
</section>
