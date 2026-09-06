<!--
  Ops / Çalıştırma — tasarımın "Ops - Calistirmalar" artboard'ı:
  sol kuyruk rayı · yatay adım şeridi · canlı log + sağ ray (plan özeti, risk/onay).
  Tasarımdaki "politika kontrolleri" ve "sır zarfı" kartları, run yükü bu veriyi
  yapılandırılmış taşımadığı için gerçek karşılıklarıyla (plan kaynakları, risk/onay) verildi.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { Button, Modal, StatusDot } from '@veritut/ui';
  import { RUN_RISK_LABEL, RUN_STATUS_LABEL, RUN_STEPS, type ComponentState, type RunRisk, type RunStatus } from '@veritut/types';
  import { connectWs, formatDuration, formatRelative } from '@veritut/shared';
  let { data, form } = $props();
  let rejectOpen = $state(false);
  const d = $derived(data.detail);

  let lines = $state<Array<{ t: string; line: string; level: string }>>([]);
  let wsStatus = $state<'connecting' | 'open' | 'closed'>('connecting');
  let logEl: HTMLDivElement | undefined = $state();

  $effect(() => {
    lines = d.log.map((l) => ({ t: l.t, line: l.line, level: l.level }));
  });

  onMount(() => {
    const ws = connectWs({
      path: `/api/v1/ws/runs/${d.run.id}`,
      onStatus: (s) => (wsStatus = s),
      onMessage: (m) => {
        const msg = m as { type: string; t?: string; line?: string; level?: string };
        if (msg.type === 'log' && !lines.some((l) => l.t === msg.t && l.line === msg.line)) {
          lines = [...lines, { t: msg.t ?? '', line: msg.line ?? '', level: msg.level ?? 'info' }];
          queueMicrotask(() => logEl?.scrollTo({ top: logEl.scrollHeight }));
        }
        if (msg.type === 'finished' || msg.type === 'awaiting_approval' || msg.type === 'approved' || msg.type === 'rejected') void invalidateAll();
      },
    });
    return () => ws.close();
  });

  const stateOf = (status: string | undefined): ComponentState =>
    status === 'succeeded' ? 'ok' : status === 'failed' ? 'down' : status === 'running' ? 'maintenance' : 'unknown';
  const glyph: Record<ComponentState, string> = { ok: '✓', degraded: '!', down: '✕', maintenance: '↻', unknown: '·' };

  const steps = $derived(
    RUN_STEPS.map((name) => {
      const s = d.steps.find((x) => x.step === name);
      const state = stateOf(s?.status);
      const dur =
        s?.finishedAt && s.startedAt
          ? formatDuration((new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()) / 1000)
          : s?.status === 'running'
            ? 'sürüyor'
            : '—';
      return { name, state, dur, summary: s?.summary ?? null };
    }),
  );

  const runState = $derived(stateOf(d.run.status === 'succeeded' ? 'succeeded' : d.run.status === 'failed' ? 'failed' : d.run.status === 'running' ? 'running' : undefined));
  const queueState = (status: string): ComponentState =>
    status === 'running' || status === 'succeeded' ? (status === 'running' ? 'ok' : 'unknown') : status === 'awaiting_approval' ? 'degraded' : status === 'failed' ? 'down' : 'unknown';
</script>

<svelte:head><title>{d.run.kind} · {d.run.id.slice(0, 8)} — Ops</title></svelte:head>

<div style="display:grid; grid-template-columns:minmax(260px,320px) minmax(0,1fr); gap:18px; align-items:start">
  <!-- ── Kuyruk ─────────────────────────────────────────────────────── -->
  <aside class="vt-card" style="overflow:hidden">
    <div style="display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid var(--border)">
      <p style="margin:0; font-size:13px; font-weight:800">Kuyruk</p>
      <span class="mono vt-help">{data.queue.filter((q) => q.status === 'running').length} aktif</span>
    </div>
    {#each data.queue.slice(0, 12) as q (q.id)}
      <a href="/calistirmalar/{q.id}" class="vt-queue-item" data-state={queueState(q.status)} aria-current={q.id === d.run.id ? 'page' : undefined}>
        <span style="display:flex; align-items:center; justify-content:space-between; gap:8px">
          <span class="mono" style="font-size:12px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">run:{q.id.slice(0, 8)}</span>
          <span class="vt-state-text" data-state={queueState(q.status)} style="font-size:11px; font-weight:700; white-space:nowrap">{RUN_STATUS_LABEL[q.status as RunStatus] ?? q.status}</span>
        </span>
        <span class="vt-help" style="display:block; margin-top:4px">{q.kind} · {RUN_RISK_LABEL[q.risk as RunRisk] ?? q.risk} · {formatRelative(q.createdAt)}</span>
      </a>
    {:else}
      <p class="vt-help" style="margin:0; padding:12px 16px">Kuyruk boş.</p>
    {/each}
    <p class="vt-help" style="margin:0; padding:12px 16px">
      Runner çökerse iş kaldığı adımdan devam eder — <span class="mono">run_steps</span> tablosu.
    </p>
  </aside>

  <section style="display:flex; flex-direction:column; gap:14px; min-width:0">
    <!-- ── Başlık + adım şeridi ─────────────────────────────────────── -->
    <div class="vt-card" style="padding:20px 22px">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap">
        <div style="min-width:0">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap">
            <h1 class="mono" style="font-size:19px; font-weight:800; letter-spacing:-.01em; margin:0">run:{d.run.id.slice(0, 8)}</h1>
            <span class="vt-kind" data-tone="info">{d.run.kind}</span>
            <span style="display:inline-flex; align-items:center; gap:6px">
              <StatusDot state={runState} small />
              <span class="vt-state-text" data-state={runState} style="font-size:11.5px; font-weight:700">{RUN_STATUS_LABEL[d.run.status as RunStatus] ?? d.run.status}</span>
            </span>
          </div>
          <p class="vt-help" style="margin:8px 0 0">
            risk {RUN_RISK_LABEL[d.run.risk as RunRisk] ?? d.run.risk} · çıkış {d.run.exitCode ?? '—'} · canlı bağlantı: {wsStatus}
            {#if d.run.triggeredByStaff} · başlatan: {d.run.triggeredByStaff}{/if}
            {#if d.run.workloadId} · <a href="/is-yukleri/{d.run.workloadId}">iş yükü</a>{/if}
          </p>
        </div>
        <a href="/calistirmalar" class="vt-btn vt-btn-secondary vt-btn-sm">Tüm çalıştırmalar</a>
      </div>

      <div class="vt-steps" style="margin-top:20px">
        {#each steps as s (s.name)}
          <div class="vt-step" data-state={s.state} title={s.summary ?? undefined}>
            <div style="display:flex; align-items:center; gap:6px">
              <span class="vt-dot" data-state={s.state} style="width:13px; height:13px; font-size:8.5px">{glyph[s.state]}</span>
              <span class="vt-step-name">{s.name}</span>
            </div>
            <p class="vt-step-dur">{s.dur}</p>
          </div>
        {/each}
      </div>
    </div>

    {#if form?.message}<div class="vt-status" data-state="down">{form.message}</div>{/if}

    <!-- ── Dört-göz onayı ───────────────────────────────────────────── -->
    {#if d.run.status === 'awaiting_approval'}
      <div class="vt-card" style="padding:18px 22px; border-color:var(--st-degraded); display:flex; align-items:center; gap:16px; flex-wrap:wrap">
        <span class="vt-dot" data-state="degraded">!</span>
        <div style="flex:1; min-width:240px">
          <p class="vt-state-text" data-state="degraded" style="margin:0; font-size:13.5px; font-weight:800">Yüksek riskli plan — onay bekliyor</p>
          <p class="vt-help" style="margin:4px 0 0">
            Plan {d.run.planSummary?.destroy ?? 0} kaynak silecek, {d.run.planSummary?.replace ?? 0} kaynağı yeniden yaratacak.
            Kıdemli operatör onayı gerekiyor; onaylayan, talep edenden farklı olmalı.
          </p>
        </div>
        <div style="display:flex; gap:8px">
          <Button variant="secondary" size="sm" onclick={() => (rejectOpen = true)}>Reddet</Button>
          <form method="POST" action="?/approve" use:enhance><Button type="submit" size="sm">Planı onayla</Button></form>
        </div>
      </div>
      <Modal bind:open={rejectOpen} title="Değişikliği reddet">
        <form method="POST" action="?/reject" use:enhance id="rejectForm" style="display:grid; gap:10px">
          <label class="vt-label" for="reason">Gerekçe</label><input class="vt-input" id="reason" name="reason" required minlength="2" />
        </form>
        {#snippet actions()}<Button variant="ghost" onclick={() => (rejectOpen = false)}>Vazgeç</Button><Button variant="danger" type="submit" form="rejectForm">Reddet</Button>{/snippet}
      </Modal>
    {/if}
    {#if d.run.rejectedReason}<div class="vt-status" data-state="down">Reddedildi: {d.run.rejectedReason}</div>{/if}

    <!-- ── Canlı log + sağ ray ──────────────────────────────────────── -->
    <div style="display:grid; grid-template-columns:minmax(0,1fr) minmax(240px,300px); gap:14px; align-items:start">
      <div class="vt-card" style="overflow:hidden; min-width:0">
        <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid var(--border)">
          <p class="vt-kicker" style="margin:0">Canlı log</p>
          <span class="mono vt-state-text" style="display:inline-flex; align-items:center; gap:6px; font-size:11px" data-state={wsStatus === 'open' ? 'ok' : 'degraded'}>
            <span class="vt-dot vt-dot-sm" data-state={wsStatus === 'open' ? 'ok' : 'degraded'}></span>{wsStatus === 'open' ? 'ws bağlı' : wsStatus === 'connecting' ? 'ws bağlanıyor' : 'ws kapalı'}
          </span>
        </div>
        <div class="vt-log" bind:this={logEl} style="border:none; border-radius:0; height:340px; max-height:none">
          {#each lines as l, i (i)}
            <div class={l.level}><span class="t">{l.t.slice(11, 19)}</span>{l.line}</div>
          {:else}
            <div class="t">log bekleniyor…</div>
          {/each}
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:14px">
        {#if d.run.planSummary}
          <div class="vt-card vt-card-pad" style="padding:16px 18px">
            <p class="vt-kicker" style="margin:0 0 10px">Plan özeti</p>
            <div class="mono" style="font-size:12.5px; line-height:2">
              <div><span class="vt-state-text" data-state="ok">+ {d.run.planSummary.add}</span> <span class="muted">oluşturulacak</span></div>
              <div><span class="vt-state-text" data-state="degraded">~ {d.run.planSummary.change}</span> <span class="muted">değişecek</span></div>
              <div><span class="vt-state-text" data-state="down">− {d.run.planSummary.destroy}</span> <span class="muted">silinecek</span></div>
              <div><span class="vt-state-text" data-state="maintenance">± {d.run.planSummary.replace}</span> <span class="muted">yeniden yaratılacak</span></div>
            </div>
            <div style="border-top:1px solid var(--row-border); margin-top:10px; padding-top:10px; display:grid; gap:3px">
              {#each d.run.planSummary.resources.filter((r) => r.action !== 'no-op' && r.action !== 'read') as r (r.address)}
                <div class="mono" style="font-size:11.5px; overflow-wrap:anywhere">
                  <span class="vt-state-text" data-state={r.action === 'create' ? 'ok' : r.action === 'update' ? 'degraded' : 'down'} style="display:inline-block; width:58px; font-weight:700">{r.action}</span>{r.address}
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <div class="vt-card" style="padding:16px 18px">
          <p class="vt-kicker" style="margin:0 0 10px">Risk ve onay</p>
          <div style="display:grid; gap:8px; font-size:12.5px">
            <div style="display:flex; justify-content:space-between; gap:8px"><span class="vt-help">Risk</span><span style="font-weight:700">{RUN_RISK_LABEL[d.run.risk as RunRisk] ?? d.run.risk}</span></div>
            <div style="display:flex; justify-content:space-between; gap:8px"><span class="vt-help">Talep eden</span><span class="mono" style="overflow-wrap:anywhere">{d.run.triggeredByStaff ?? 'sistem'}</span></div>
            <div style="display:flex; justify-content:space-between; gap:8px"><span class="vt-help">Onaylayan</span><span class="mono" style="overflow-wrap:anywhere">{d.run.approvedBy ?? '—'}</span></div>
          </div>
          <p class="vt-help" style="margin:10px 0 0; line-height:1.6">
            Yüksek riskli çalıştırmada onaylayan, talep edenden farklı kıdemli operatör olmak zorundadır (dört-göz).
          </p>
        </div>

        <div class="vt-card" style="padding:16px 18px">
          <p class="vt-kicker" style="margin:0 0 8px">Sır zarfı</p>
          <p class="vt-help" style="margin:0; line-height:1.6">
            Kimlik bilgileri yalnız runner sürecinde açılır; API'de çözme fonksiyonu yoktur (D12). Bu sayfa mühürlü
            değerleri hiç görmez.
          </p>
        </div>
      </div>
    </div>
  </section>
</div>
