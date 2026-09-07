<script lang="ts">
  import { Card, HashChip, PageHead } from '@veritut/ui';
  let { data } = $props();
</script>

<svelte:head><title>Güvence — VERITUT</title></svelte:head>

<PageHead title="Güvence" variant="marketing" />
<p class="vt-lead" style="margin:6px 0 28px; max-width:720px">
  Her yedek, her geri dönüş tatbikatı, her yama, her personel erişimi Kanıt Defteri'ne düşer. Kayıtlar hash zinciriyle
  bağlıdır; biri değiştirilirse zincir kopar ve bunu gizlemeyiz. Aylık çapa hash'i burada yayımlanır.
</p>

<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:14px">
  <Card title="Platform zinciri" subtitle="VERITUT'un kendi kanıt zinciri — kendi ilacımızı içiyoruz">
    {#if data.verdict === null}
      <p class="vt-help" style="margin:0">Doğrulama servisi şu an yanıt vermiyor.</p>
    {:else if data.verdict.checked === 0}
      <p class="vt-help" style="margin:0">Henüz platform kanıtı yok — ilk çalıştırmayla başlar.</p>
    {:else}
      <HashChip hash={data.verdict.lastHash ?? ''} broken={!data.verdict.ok} />
      <p class="vt-help" style="margin:12px 0 0">{data.verdict.checked} olay yeniden hesaplandı.</p>
    {/if}
  </Card>
  <Card title="Denetçi doğrulaması">
    <p class="vt-help" style="margin:0 0 10px">Kimlik gerektirmez. Kiracı kısa adıyla zincir bütünlüğü sorgulanır; olay içeriği dönmez.</p>
    <div class="vt-codebox">GET /api/v1/evidence/public/verify?tenant=&lt;kısa-ad&gt;</div>
  </Card>
</div>
