<script lang="ts">
  import { enhance } from '$app/forms';
  import { Card, Table, Button, EmptyState } from '@veritut/ui';
  import { INVOICE_STATUS_LABEL, USAGE_METRIC_LABEL, FEATURE_LABEL, type FeatureKey, type InvoiceStatus, type UsageMetric } from '@veritut/types';
  import { formatDate, formatMoney } from '@veritut/shared';
  let { data, form } = $props();
  const featureRows = ['workloads.max', 'users.max', 'sla.tiers', 'backup.offsite', 'backup.drill.monthly', 'evidence.bundle', 'api.enabled', 'api.keys.max', 'support.priority'] as FeatureKey[];
  const show = (v: unknown): string => (v === -1 ? 'sınırsız' : v === true ? '✓' : v === false || v === 0 || v === undefined ? '—' : Array.isArray(v) ? v.join(', ') : String(v));
  const subStatus: Record<string, string> = { trialing: 'Deneme', active: 'Aktif', past_due: 'Vadesi geçti', suspended: 'Askıda', cancelled: 'İptal' };
</script>

<svelte:head><title>Faturalar — VERITUT</title></svelte:head>
<h1 class="vt-h1" style="margin-bottom:6px">Faturalar ve abonelikler</h1>
<p class="vt-lead" style="margin:0 0 24px">Fatura kesme ve tahsilat faturalama omurgamızda yapılır; burada aynasını görürsünüz.</p>
{#if form?.paid}<div class="vt-status" data-state="ok" style="margin-bottom:14px">Ödeme alındı, faturanız güncellendi.</div>{/if}
{#if form?.message}<div class="vt-status" data-state="down" style="margin-bottom:14px">{form.message}</div>{/if}

<div style="display:grid; grid-template-columns:1fr 300px; gap:14px; align-items:start">
  <div style="display:grid; gap:14px">
    {#if data.canSeeBilling}
      <Card title="Faturalar" padded={false}>
        {#if data.invoices.length === 0}
          <p class="vt-help" style="padding:16px 22px; margin:0">Henüz fatura yok.</p>
        {:else}
          <Table minWidth={620}>
            {#snippet head()}<th>Fatura</th><th>Durum</th><th class="num">Tutar</th><th>Kesim</th><th>Vade</th><th></th>{/snippet}
            {#each data.invoices as i (i.id)}
              <tr>
                <td class="mono">{i.number || i.billingRef}</td>
                <td>{INVOICE_STATUS_LABEL[i.status as InvoiceStatus] ?? i.status}</td>
                <td class="num">{formatMoney(Number(i.total), i.currency as 'TRY')}</td>
                <td class="tnum">{i.issuedAt ? formatDate(i.issuedAt) : '—'}</td>
                <td class="tnum">{i.dueAt ? formatDate(i.dueAt) : '—'}</td>
                <td>
                  {#if i.status === 'unpaid'}
                    <form method="POST" action="?/pay" use:enhance><input type="hidden" name="billingRef" value={i.billingRef} /><Button type="submit" size="sm" variant="soft">Öde</Button></form>
                  {/if}
                </td>
              </tr>
            {/each}
          </Table>
        {/if}
      </Card>

      <Card title="Bu dönem kullanım" subtitle={data.period} padded={false}>
        {#if data.usage.length === 0}
          <p class="vt-help" style="padding:16px 22px; margin:0">Bu dönem için kalem yok.</p>
        {:else}
          <Table minWidth={520}>
            {#snippet head()}<th>Kalem</th><th>Açıklama</th><th class="num">Miktar</th><th class="num">Tutar</th><th>Fatura</th>{/snippet}
            {#each data.usage as u (u.metric + (u.note ?? ''))}
              <tr><td>{USAGE_METRIC_LABEL[u.metric as UsageMetric] ?? u.metric}</td><td class="muted">{u.note ?? '—'}</td><td class="num">{Number(u.qty)}</td><td class="num">{formatMoney(Number(u.amount), u.currency as 'TRY')}</td><td class="muted">{u.pushedAt ? 'gönderildi' : 'bekliyor'}</td></tr>
            {/each}
          </Table>
        {/if}
      </Card>
    {:else}
      <EmptyState title="Mali bilgilere erişiminiz yok" text="Fatura ve kullanım detayları için sahip, yönetici veya mali rolü gerekir." />
    {/if}

    <Card title="Abonelikler" padded={false}>
      {#if data.subscriptions.length === 0}
        <p class="vt-help" style="padding:16px 22px; margin:0">Aktif abonelik yok.</p>
      {:else}
        <Table minWidth={520}>
          {#snippet head()}<th>Plan</th><th>SLA</th><th>Durum</th><th class="num">Aylık</th><th>Deneme bitişi</th>{/snippet}
          {#each data.subscriptions as s (s.id)}
            <tr><td>{s.planCode}</td><td class="mono">{s.slaCode}</td><td>{subStatus[s.status] ?? s.status}</td><td class="num">{formatMoney(Number(s.monthly), s.currency as 'TRY')}</td><td class="tnum">{s.trialEndsAt ? formatDate(s.trialEndsAt) : '—'}</td></tr>
          {/each}
        </Table>
      {/if}
    </Card>
  </div>

  <Card title="Planınız" subtitle={data.plan?.planCode ?? '—'}>
    <div style="display:grid; gap:6px; font-size:13px">
      {#each featureRows as f (f)}
        {#if data.plan?.features[f] !== undefined}<div style="display:flex; justify-content:space-between; gap:10px"><span class="muted">{FEATURE_LABEL[f]}</span><span style="font-weight:700">{show(data.plan.features[f])}</span></div>{/if}
      {/each}
    </div>
    <a href="/fiyatlandirma" class="vt-btn vt-btn-secondary vt-btn-sm" style="margin-top:14px">Planları karşılaştır</a>
  </Card>
</div>
