<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { Card, StatusDot } from '@veritut/ui';
  import { RUN_STATUS_LABEL, RUN_STEPS, type RunStatus, type ComponentState } from '@veritut/types';
  import { connectWs } from '@veritut/shared';
  let { data } = $props();
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
        if (msg.type === 'finished') void invalidateAll();
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
<p class="vt-help" style="margin:0 0 20px">risk {d.run.risk} · çıkış {d.run.exitCode ?? '—'} · canlı bağlantı: {wsStatus}</p>

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
