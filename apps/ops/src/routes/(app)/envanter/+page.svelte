<script lang="ts">
  import { enhance } from '$app/forms';
  import { Card, Table, Button, ResidencyBadge } from '@veritut/ui';
  import type { Residency } from '@veritut/types';
  import { formatRelative } from '@veritut/shared';
  let { data, form } = $props();
  let open = $state<string | null>(null);
  const total = $derived(data.items.reduce((s, i) => s + Number(i.monthlyCostEstimate ?? 0), 0));
  const unmatched = $derived(data.items.filter((i) => !i.matchedWorkloadId));
</script>

<div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:20px; gap:16px">
  <div><h1 class="vt-h1">Tedarikçi envanteri</h1><p class="vt-lead" style="margin:4px 0 0">Sahipsiz kaynak = marj sızıntısı. Eşleyin veya iş yükü oluşturun.</p></div>
  <div style="display:flex; gap:8px">
    <a href="/envanter" class="vt-btn vt-btn-sm {data.unmatchedOnly ? 'vt-btn-ghost' : 'vt-btn-secondary'}">Hepsi</a>
    <a href="/envanter?sahipsiz=1" class="vt-btn vt-btn-sm {data.unmatchedOnly ? 'vt-btn-secondary' : 'vt-btn-ghost'}">Sahipsiz ({unmatched.length})</a>
  </div>
</div>
<p class="vt-help tnum" style="margin:0 0 12px">{data.items.length} kaynak · aylık tahmin {total.toFixed(2)} EUR · sahipsiz {unmatched.reduce((s, i) => s + Number(i.monthlyCostEstimate ?? 0), 0).toFixed(2)} EUR</p>
{#if form?.message}<p class="vt-field-error" style="margin-bottom:10px">{form.message}</p>{/if}
<Card padded={false}>
  <Table minWidth={900}>
    {#snippet head()}<th>Kaynak</th><th>Tür</th><th>Hesap</th><th>Bölge</th><th>Durum</th><th class="num">Aylık</th><th>İş yükü</th><th></th>{/snippet}
    {#each data.items as i (i.id)}
      <tr>
        <td><span class="mono">{i.externalId}</span> <span class="muted">{i.name}</span></td>
        <td>{i.kind}</td>
        <td class="muted">{i.providerCode}/{i.accountLabel}</td>
        <td>{i.region ?? '—'} {#if i.residency}<ResidencyBadge residency={i.residency as Residency} small />{/if}</td>
        <td class="muted">{i.status} · {formatRelative(i.firstSeenAt)}</td>
        <td class="num">{i.monthlyCostEstimate ?? '—'}</td>
        <td>{#if i.matchedWorkloadName}{i.matchedWorkloadName}{:else}<span class="vt-state-text" data-state="degraded" style="font-weight:700">sahipsiz</span>{/if}</td>
        <td>{#if !i.matchedWorkloadId}<Button size="sm" variant="ghost" onclick={() => (open = open === i.id ? null : i.id)}>Eşle</Button>{/if}</td>
      </tr>
      {#if open === i.id}
        <tr><td colspan="8" style="height:auto; padding:12px">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px">
            <form method="POST" action="?/match" use:enhance style="display:flex; gap:8px; align-items:end">
              <input type="hidden" name="id" value={i.id} />
              <div style="flex:1"><label class="vt-label" for="w-{i.id}">Var olan iş yüküne eşle</label><select class="vt-input" id="w-{i.id}" name="workloadId">{#each data.workloads as w (w.id)}<option value={w.id}>{w.tenantName} / {w.name}</option>{/each}</select></div>
              <Button type="submit" size="sm" variant="secondary">Eşle</Button>
            </form>
            <form method="POST" action="?/create" use:enhance style="display:flex; gap:8px; align-items:end; flex-wrap:wrap">
              <input type="hidden" name="id" value={i.id} />
              <div><label class="vt-label" for="t-{i.id}">Yeni iş yükü · kiracı</label><select class="vt-input" id="t-{i.id}" name="tenantId">{#each data.tenants as t (t.id)}<option value={t.id}>{t.name}</option>{/each}</select></div>
              <div><label class="vt-label" for="s-{i.id}">Kısa ad</label><input class="vt-input mono" id="s-{i.id}" name="slug" value={i.name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)} /></div>
              <div><label class="vt-label" for="n-{i.id}">Ad</label><input class="vt-input" id="n-{i.id}" name="name" value={i.name} /></div>
              <Button type="submit" size="sm">Oluştur + eşle</Button>
            </form>
          </div>
        </td></tr>
      {/if}
    {:else}
      <tr><td colspan="8" class="muted">Envanter boş — tedarikçi hesabını senkronlayın.</td></tr>
    {/each}
  </Table>
</Card>
