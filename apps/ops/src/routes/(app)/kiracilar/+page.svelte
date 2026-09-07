<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button, Card, PageHead, ResidencyBadge, Table } from '@veritut/ui';
  import { RESIDENCIES } from '@veritut/types';
  import { formatDate } from '@veritut/shared';
  let { data, form } = $props();
</script>

<PageHead title="Kiracılar" variant="ops" />
<div style="display:grid; grid-template-columns:1fr 340px; gap:14px; align-items:start">
  <Card padded={false}>
    <Table>
      {#snippet head()}<th>Kiracı</th><th>Kısa ad</th><th>Tür</th><th>İkametgâh</th><th>Durum</th><th>Kayıt</th>{/snippet}
      {#each data.tenants as t (t.id)}
        <tr><td><a href="/kiracilar/{t.id}">{t.name}</a></td><td class="mono">{t.slug}</td><td>{t.kind}</td><td><ResidencyBadge residency={t.residencyDefault} small /></td><td>{t.status}</td><td class="tnum">{formatDate(t.createdAt)}</td></tr>
      {/each}
    </Table>
  </Card>
  <Card title="Yeni kiracı" subtitle="Platform yöneticisi; üyeler portaldan davetle">
    <form method="POST" action="?/create" use:enhance style="display:grid; gap:10px">
      <div><label class="vt-label" for="name">Ad</label><input class="vt-input" id="name" name="name" required /></div>
      <div><label class="vt-label" for="slug">Kısa ad</label><input class="vt-input mono" id="slug" name="slug" required /></div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px">
        <div><label class="vt-label" for="residencyDefault">İkametgâh</label><select class="vt-input" id="residencyDefault" name="residencyDefault">{#each RESIDENCIES as r (r)}<option value={r}>{r}</option>{/each}</select></div>
        <div><label class="vt-label" for="kind">Tür</label><select class="vt-input" id="kind" name="kind"><option value="customer">customer</option><option value="internal">internal</option><option value="reseller">reseller</option></select></div>
      </div>
      {#if form?.message}<p class="vt-field-error">{form.message}</p>{/if}
      <Button type="submit">Oluştur</Button>
    </form>
  </Card>
</div>
