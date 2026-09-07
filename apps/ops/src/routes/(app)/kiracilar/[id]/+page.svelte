<script lang="ts">
  import { Card, PageHead, ResidencyBadge, Table } from '@veritut/ui';
  import { TENANT_ROLE_LABEL, WORKLOAD_STATUS_LABEL, type TenantRole, type WorkloadStatus } from '@veritut/types';
  import { formatDate, formatDateTime } from '@veritut/shared';
  let { data } = $props();
  const d = $derived(data.d);
</script>

<PageHead title={d.tenant.name} eyebrow="kiracılar" variant="ops">
  {#snippet badge()}<ResidencyBadge residency={d.tenant.residencyDefault} />{/snippet}
  <p class="vt-help" style="margin:6px 0 0"><span class="mono">{d.tenant.slug}</span> · {d.tenant.kind} · {d.tenant.status} · kayıt {formatDate(d.tenant.createdAt)} · durum sayfası <a href="https://durum.veritut.com/{d.tenant.slug}" rel="external">/{d.tenant.slug}</a></p>
</PageHead>
<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:14px">
  <Card><p class="vt-kicker">İş yükü</p><p class="vt-h2 tnum">{d.workloads.length}</p></Card>
  <Card><p class="vt-kicker">Kanıt olayı</p><p class="vt-h2 tnum">{d.evidence.count}</p><p class="vt-help">{d.evidence.last ? `son: ${formatDateTime(d.evidence.last)}` : 'henüz yok'}</p></Card>
  <Card><p class="vt-kicker">{d.month.period} maliyet / gelir</p><p class="vt-h2 tnum">{d.month.cost.toFixed(2)} / {d.month.revenue.toFixed(2)}</p></Card>
</div>
<div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; align-items:start">
  <Card title="İş yükleri" padded={false}>
    <Table minWidth={420}>
      {#snippet head()}<th>Ad</th><th>Ürün</th><th>Durum</th>{/snippet}
      {#each d.workloads as w (w.id)}<tr><td><a href="/is-yukleri/{w.id}">{w.name}</a></td><td class="mono">{w.productSlug}</td><td>{WORKLOAD_STATUS_LABEL[w.status as WorkloadStatus] ?? w.status}</td></tr>{:else}<tr><td colspan="3" class="muted">Yok</td></tr>{/each}
    </Table>
  </Card>
  <Card title="Üyeler" padded={false}>
    <Table minWidth={420}>
      {#snippet head()}<th>Üye</th><th>Rol</th>{/snippet}
      {#each d.members as m (m.userId)}<tr><td>{m.displayName} <span class="muted">{m.email}</span></td><td>{TENANT_ROLE_LABEL[m.role as TenantRole] ?? m.role}</td></tr>{:else}<tr><td colspan="2" class="muted">Üye yok (CSV ile açılmış kiracı — davet gerekir)</td></tr>{/each}
    </Table>
  </Card>
</div>
