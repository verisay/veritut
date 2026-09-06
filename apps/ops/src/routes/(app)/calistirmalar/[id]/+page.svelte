<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { Card, StatusDot } from '@veritut/ui';
  import { RUN_STATUS_LABEL, RUN_STEPS, type RunStatus, type ComponentState } from '@veritut/types';
  import { connectWs } from '@veritut/shared';
  import { enhance } from '$app/forms';
  import { Button, Modal } from '@veritut/ui';
  import { RUN_RISK_LABEL, type RunRisk } from '@veritut/types';
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

  const stepState = (s: string): ComponentState => {
    const st = d.steps.find((x) => x.step === s)?.status;
    return st === 'succeeded' ? 'ok' : st === 'failed' ? 'down' : st === 'running' ? 'maintenance' : 'unknown';
  };
</script>

<p class="vt-kicker"><a href="/calistirmalar">Çalıştırmalar</a> / {d.run.id.slice(0, 8)}</p>
<h1 class="vt-h1" style="margin:4px 0 6px"><span class="mono">{d.run.kind}</span> · {RUN_STATUS_LABEL[d.run.status as RunStatus] ?? d.run.status}</h1>
<p class="vt-help" style="margin:0 0 14px">risk {RUN_RISK_LABEL[d.run.risk as RunRisk] ?? d.run.risk} · çıkış {d.run.exitCode ?? '—'} · canlı bağlantı: {wsStatus}{#if d.run.workloadId} · <a href="/is-yukleri/{d.run.workloadId}">iş yükü</a>{/if}</p>
{#if form?.message}<div class="vt-status" data-state="down" style="margin-bottom:12px">{form.message}</div>{/if}
{#if d.run.status === 'awaiting_approval'}
  <div class="vt-card" style="padding:16px 20px; margin-bottom:14px; border-color:var(--st-degraded)">
    <p class="vt-h3" style="margin:0 0 4px">Onay bekliyor — yüksek riskli değişiklik</p>
    <p class="vt-help" style="margin:0 0 12px">Onaylayan, talep edenden farklı bir kıdemli operatör olmalı (dört-göz). Plan: {d.run.planSummary?.add ?? 0} eklenecek, {d.run.planSummary?.change ?? 0} değişecek, <strong>{d.run.planSummary?.destroy ?? 0} silinecek, {d.run.planSummary?.replace ?? 0} yeniden yaratılacak</strong>.</p>
    <div style="display:flex; gap:10px">
      <form method="POST" action="?/approve" use:enhance><Button type="submit">Onayla ve uygula</Button></form>
      <Button variant="danger" onclick={() => (rejectOpen = true)}>Reddet</Button>
    </div>
  </div>
  <Modal bind:open={rejectOpen} title="Değişikliği reddet">
    <form method="POST" action="?/reject" use:enhance id="rejectForm" style="display:grid; gap:10px">
      <label class="vt-label" for="reason">Gerekçe</label><input class="vt-input" id="reason" name="reason" required minlength="2" />
    </form>
    {#snippet actions()}<Button variant="ghost" onclick={() => (rejectOpen = false)}>Vazgeç</Button><Button variant="danger" type="submit" form="rejectForm">Reddet</Button>{/snippet}
  </Modal>
{/if}
{#if d.run.rejectedReason}<div class="vt-status" data-state="down" style="margin-bottom:12px">Reddedildi: {d.run.rejectedReason}</div>{/if}
{#if d.run.planSummary}
  <div class="vt-card" style="padding:14px 18px; margin-bottom:14px">
    <p class="vt-kicker" style="margin:0 0 8px">tofu plan</p>
    <p class="mono" style="margin:0 0 8px; font-size:12.5px">+{d.run.planSummary.add} ~{d.run.planSummary.change} -{d.run.planSummary.destroy} ±{d.run.planSummary.replace}</p>
    <div style="display:grid; gap:2px">{#each d.run.planSummary.resources.filter((r) => r.action !== 'no-op' && r.action !== 'read') as r (r.address)}<div class="mono" style="font-size:12px"><span class="vt-state-text" data-state={r.action === 'create' ? 'ok' : r.action === 'update' ? 'degraded' : 'down'} style="display:inline-block; width:64px; font-weight:700">{r.action}</span>{r.address}</div>{/each}</div>
  </div>
{/if}

<div style="display:grid; grid-template-columns:260px 1fr; gap:14px; align-items:start">
  <Card title="Adımlar">
    <ol style="list-style:none; margin:0; padding:0; display:grid; gap:10px">
      {#each RUN_STEPS as s (s)}
        <li style="display:flex; gap:10px; align-items:center"><StatusDot state={stepState(s)} small /> <span class="mono" style="font-size:12.5px">{s}</span></li>
      {/each}
    </ol>
  </Card>
  <div class="vt-log" bind:this={logEl}>
    {#each lines as l, i (i)}
      <div class={l.level}><span class="t">{l.t.slice(11, 19)}</span>{l.line}</div>
    {:else}
      <div class="t">log bekleniyor…</div>
    {/each}
  </div>
</div>
