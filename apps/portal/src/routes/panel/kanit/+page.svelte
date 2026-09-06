<!--
  Portal / Kanıt Defteri — tasarımın "Portal - Kanit Defteri" artboard'ı.
  Zincir hükmü manşet olur: bütünse yeşil, kırıksa kırmızı ve kopuk seq açıkça yazılır (D13) — maskelenmez.
-->
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Card, EmptyState, Button } from '@veritut/ui';
  import { EVIDENCE_KIND_LABEL, EVIDENCE_KIND_TONE, isEvidenceKind, type EvidenceKind } from '@veritut/types';
  import { formatDateTime, formatNumber, shortHash } from '@veritut/shared';
  let { data } = $props();

  type Filter = 'all' | 'backup' | 'drill' | 'access';
  let filter = $state<Filter>('all');
  let verifying = $state(false);
  let copied = $state(false);

  const matches = (kind: string, f: Filter): boolean =>
    f === 'all' ? true : f === 'backup' ? kind.startsWith('backup.') : f === 'drill' ? kind.startsWith('restore.drill.') : kind === 'access.session';

  const events = $derived(data.events.filter((e) => matches(e.kind, filter)));
  const label = (kind: string): string => (isEvidenceKind(kind) ? EVIDENCE_KIND_LABEL[kind] : kind);
  const tone = (kind: string): string => (isEvidenceKind(kind) ? EVIDENCE_KIND_TONE[kind as EvidenceKind] : 'info');

  /** Bu ayın dökümü — gösterilen olaylardan sayılır, elle girilmez. */
  const thisMonth = $derived.by(() => {
    const p = new Date().toISOString().slice(0, 7);
    const inMonth = data.events.filter((e) => e.occurredAt.slice(0, 7) === p);
    return {
      total: inMonth.length,
      backup: inMonth.filter((e) => e.kind.startsWith('backup.')).length,
      drill: inMonth.filter((e) => e.kind.startsWith('restore.drill.')).length,
      patch: inMonth.filter((e) => e.kind === 'patch.applied').length,
    };
  });

  async function verify(): Promise<void> {
    verifying = true;
    await invalidateAll();
    verifying = false;
  }
  async function copyAnchor(): Promise<void> {
    if (!data.verdict?.lastHash) return;
    try {
      await navigator.clipboard.writeText(data.verdict.lastHash);
      copied = true;
      setTimeout(() => (copied = false), 1600);
    } catch {
      /* clipboard yoksa sessiz */
    }
  }
</script>

<svelte:head><title>Kanıt Defteri — VERITUT</title></svelte:head>

<p class="vt-eyebrow vt-fade" style="margin-bottom:18px">( kanıt defteri )</p>

<div class="vt-fade" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr)); gap:40px; align-items:end; padding-bottom:36px; border-bottom:1px solid var(--border); animation-delay:.08s">
  <div>
    {#if data.verdict === null}
      <p class="vt-display-2">Zincir durumu okunamadı.</p>
    {:else if data.verdict.ok}
      <p class="vt-display-2"><span style="color:var(--accent-text)">✓</span> Zincir bütün.</p>
    {:else}
      <p class="vt-display-2 vt-state-text" data-state="down">✕ Zincir doğrulanamadı.</p>
      <p class="vt-state-text" data-state="down" style="margin:12px 0 0; font-size:14.5px; font-weight:600">
        seq {data.verdict.brokenAt}'de kopukluk — olay açtık, sizi bilgilendireceğiz. Gizlemiyoruz.
      </p>
    {/if}
    <p class="vt-prose" style="margin:16px 0 0; font-size:15px; max-width:560px">
      Sizin için yaptığımız her iş bir öncekinin hash'ine bağlanarak kaydedilir. Kayıt sonradan değişmez; değişse zincir
      kopar ve bunu gizleyemeyiz.
    </p>
    <div style="display:flex; gap:10px; margin-top:22px; flex-wrap:wrap">
      <Button variant="soft" onclick={verify} loading={verifying}>{verifying ? 'Doğrulanıyor…' : 'Zinciri şimdi doğrula'}</Button>
      <Button href="/panel/belgeler">Aylık paketi indir</Button>
      <Button href="/panel/guvence" variant="secondary">Denetçi bağlantısı</Button>
    </div>
  </div>

  <div style="display:grid; grid-template-columns:1fr 1fr; gap:28px">
    <div>
      <p class="vt-stat-value" style="font-size:clamp(40px,4.2vw,56px)">{data.verdict ? formatNumber(data.verdict.checked) : '—'}</p>
      <p class="vt-stat-label">
        toplam olay ·
        <span style="display:inline-flex; align-items:center; gap:5px"><span class="vt-dot vt-dot-sm vt-live" data-state="ok"></span>canlı</span>
      </p>
    </div>
    <div>
      <p class="vt-stat-value" style="font-size:clamp(40px,4.2vw,56px)">{formatNumber(thisMonth.total)}</p>
      <p class="vt-stat-label">bu ay · {thisMonth.backup} yedek · {thisMonth.drill} tatbikat · {thisMonth.patch} yama</p>
    </div>
    {#if data.verdict?.lastHash}
      <div style="grid-column:1 / -1; display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding-top:6px">
        <span class="vt-help" style="font-weight:700">Son çapa</span>
        <code class="mono" style="font-size:12.5px; font-weight:600; background:var(--surface-2); border-radius:var(--r-chip); padding:5px 10px" title={data.verdict.lastHash}>{shortHash(data.verdict.lastHash)}</code>
        <button type="button" class="vt-chip" onclick={copyAnchor}>{copied ? 'kopyalandı' : 'kopyala'}</button>
        <a href="/guvence" style="font-size:12.5px; font-weight:700">/guvence'de kimliksiz doğrulanır</a>
      </div>
    {/if}
  </div>
</div>

<div class="vt-chipbar" style="margin-top:32px">
  <button type="button" class="vt-chip" aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}>Tümü</button>
  <button type="button" class="vt-chip" aria-pressed={filter === 'backup'} onclick={() => (filter = 'backup')}>Yedek</button>
  <button type="button" class="vt-chip" aria-pressed={filter === 'drill'} onclick={() => (filter = 'drill')}>Tatbikat</button>
  <button type="button" class="vt-chip" aria-pressed={filter === 'access'} onclick={() => (filter = 'access')}>Erişim</button>
</div>

{#if data.events.length === 0}
  <div style="margin-top:14px">
    <EmptyState title="Henüz kanıt yok" text="İlk yedek, tatbikat veya kurulum tamamlandığında burada görünür." />
  </div>
{:else}
  <Card padded={false} class="vt-ledger">
    <div class="vt-table-wrap">
      <table class="vt-table" style="font-size:14px; min-width:860px">
        <thead>
          <tr style="background:var(--surface-alt)">
            <th style="padding:12px 18px; width:72px">SEQ</th>
            <th style="padding:12px 14px; width:160px">ZAMAN</th>
            <th style="padding:12px 14px; width:190px">TÜR</th>
            <th style="padding:12px 14px">KONU</th>
            <th style="padding:12px 14px; width:150px">HASH</th>
          </tr>
        </thead>
        <tbody>
          {#each events as e (e.id)}
            <tr>
              <td class="mono tnum" style="height:48px; padding:0 18px; color:var(--text-3)">{e.seq}</td>
              <td class="mono tnum" style="padding:0 14px; color:var(--text-2); white-space:nowrap">{formatDateTime(e.occurredAt)}</td>
              <td style="padding:0 14px"><span class="vt-kind" data-tone={tone(e.kind)}>{label(e.kind)}</span></td>
              <td style="padding:10px 14px; line-height:1.45; font-weight:600">
                {e.subjectType}
                <span class="vt-help mono" style="display:block; margin-top:2px">{e.subjectId} · {e.actor}</span>
              </td>
              <td style="padding:0 14px"><code class="mono" style="font-size:11.5px; background:var(--surface-2); border-radius:var(--r-chip); padding:4px 8px" title={e.hash}>{shortHash(e.hash)}</code></td>
            </tr>
          {:else}
            <tr><td colspan="5" class="muted">Bu süzgece uyan olay yok.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </Card>
{/if}

<p class="vt-help" style="margin:28px 0 0; font-size:13.5px; line-height:1.6; max-width:760px">
  Her olayın hash'i <span class="mono">sha256(önceki ‖ içerik ‖ zaman)</span> ile hesaplanır. Doğrulama ucu herkese
  açıktır; denetçiniz kimlik açmadan zinciri yeniden hesaplayabilir.
</p>
