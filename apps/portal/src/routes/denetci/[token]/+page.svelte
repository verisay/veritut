<script lang="ts">
  import { Card, Table, HashChip } from '@veritut/ui';
  import { DOCUMENT_KIND_LABEL, type DocumentKind } from '@veritut/types';
  import { formatDateTime } from '@veritut/shared';
  let { data } = $props();
  const v = $derived(data.view);
</script>

<svelte:head><title>Denetçi görünümü — VERITUT</title><meta name="robots" content="noindex" /></svelte:head>

<div style="max-width:900px; margin:0 auto; padding:40px 20px">
  <p class="vt-kicker">VERITUT · denetçi görünümü</p>
  <h1 class="vt-h1" style="margin:6px 0 4px">{v.tenant.name}</h1>
  <p class="vt-lead" style="margin:0 0 24px">{v.label} · salt-okuma · kapsam: {v.scope.join(', ')}</p>

  {#if v.chain}
    <Card title="Kanıt zinciri" subtitle="Kayıtlar hash zinciriyle bağlı; biri değişirse zincir kopar">
      <HashChip hash={v.chain.lastHash ?? ''} broken={!v.chain.ok} label={v.chain.ok ? `zincir bütün · ${v.chain.checked} olay` : `seq ${v.chain.brokenAt}'de kopuk`} />
      <p class="vt-help" style="margin:12px 0 0">Olay içerikleri denetçi görünümünde paylaşılmaz; doğrulanabilir özet ve belgeler sunulur.</p>
    </Card>
  {/if}

  {#if v.sla?.length}
    <div style="margin-top:14px">
      <Card title="Hizmet seviyesi geçmişi" padded={false}>
        <Table minWidth={520}>
          {#snippet head()}<th>Dönem</th><th class="num">Uptime</th><th class="num">Hedef</th><th class="num">Olay</th><th class="num">Yanıt ihlali</th><th class="num">Çözüm ihlali</th>{/snippet}
          {#each v.sla as s (s.period)}
            <tr><td class="mono">{s.period}</td><td class="num">%{s.uptimePct}</td><td class="num">%{s.target}</td><td class="num">{s.incidents}</td><td class="num">{s.responseBreaches}</td><td class="num">{s.resolveBreaches}</td></tr>
          {/each}
        </Table>
      </Card>
    </div>
  {/if}

  <div style="margin-top:14px">
    <Card title="Belgeler" padded={false}>
      <Table minWidth={560}>
        {#snippet head()}<th>Belge</th><th>Dönem</th><th>SHA-256</th><th>Tarih</th><th></th>{/snippet}
        {#each v.documents as d (d.id)}
          <tr><td>{DOCUMENT_KIND_LABEL[d.kind as DocumentKind] ?? d.kind}</td><td class="mono">{d.period ?? '—'}</td><td class="mono" style="font-size:11px" title={d.sha256}>{d.sha256.slice(0, 12)}…</td><td class="tnum">{formatDateTime(d.createdAt)}</td><td><a href="/api/v1/denetci/{data.token}/documents/{d.id}" class="vt-btn vt-btn-ghost vt-btn-sm" rel="external">İndir</a></td></tr>
        {:else}
          <tr><td colspan="5" class="muted">Paylaşılan belge yok.</td></tr>
        {/each}
      </Table>
    </Card>
  </div>
  <p class="vt-help" style="margin:20px 0 0">Bu bağlantı süreli ve iptal edilebilir. Erişimleriniz kayıt altına alınır.</p>
</div>
