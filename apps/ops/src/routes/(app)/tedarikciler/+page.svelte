<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button, Card, PageHead, ResidencyBadge, StatusDot, Table } from '@veritut/ui';
  import { PROVIDERS, RESIDENCIES, type ComponentState, type Residency } from '@veritut/types';
  import { formatRelative } from '@veritut/shared';
  let { data, form } = $props();
  const d = $derived(data.data);
</script>

<PageHead title="Tedarikçi hesapları" variant="ops">
  {#snippet actions()}{/snippet}
</PageHead>
{#if d.singleAccountProviders.length}
  <div class="vt-status" data-state="degraded" style="margin-bottom:14px">Tek hesaplı tedarikçi: {d.singleAccountProviders.join(', ')} — askıya alınma riski, ikinci hesap açın.</div>
{/if}
{#if form?.synced}<div class="vt-status" data-state="ok" style="margin-bottom:14px">Senkron başlatıldı → <a href="/calistirmalar/{form.synced}">çalıştırma</a></div>{/if}

<div style="display:grid; grid-template-columns:1fr 380px; gap:14px; align-items:start">
  <Card padded={false}>
    <Table>
      {#snippet head()}<th>Hesap</th><th>Tedarikçi</th><th>İkametgâh</th><th>Sağlık</th><th>Son senkron</th><th></th>{/snippet}
      {#each d.accounts as a (a.id)}
        <tr>
          <td>{a.label} {#if !a.hasCredentials}<span class="vt-help">(kimlik yok)</span>{/if}</td>
          <td class="mono">{a.providerCode}</td>
          <td>{#each a.residencies as r (r)}<ResidencyBadge residency={r as Residency} small />{/each}</td>
          <td><StatusDot state={a.health as ComponentState} small /></td>
          <td class="muted">{a.lastSyncAt ? formatRelative(a.lastSyncAt) : '—'}</td>
          <td><form method="POST" action="?/sync" use:enhance><input type="hidden" name="id" value={a.id} /><Button type="submit" size="sm" variant="soft" disabled={!a.hasCredentials}>Senkronla</Button></form></td>
        </tr>
      {:else}
        <tr><td colspan="6" class="muted">Henüz tedarikçi hesabı yok.</td></tr>
      {/each}
    </Table>
  </Card>
  <Card title="Yeni hesap" subtitle="Kıdemli operatör; kimlik bilgisi API'de mühürlenir, geri okunamaz">
    <form method="POST" action="?/create" use:enhance style="display:grid; gap:12px">
      <div><label class="vt-label" for="providerCode">Tedarikçi</label><select class="vt-input" id="providerCode" name="providerCode">{#each PROVIDERS as p (p)}<option value={p}>{p}</option>{/each}</select></div>
      <div><label class="vt-label" for="label">Etiket</label><input class="vt-input" id="label" name="label" placeholder="hetzner-hesap-1" required /></div>
      <div><label class="vt-label" for="credentials">Kimlik bilgileri (ANAHTAR=değer, satır başına bir)</label><textarea class="vt-input mono" id="credentials" name="credentials" rows="3" placeholder="token=…" style="height:auto; padding:8px 12px"></textarea><p class="vt-help" style="margin:6px 0 0">mock: <code>seed=a</code> · hetzner: <code>token=…</code></p></div>
      <div><label class="vt-label" for="regions">Bölgeler (virgülle)</label><input class="vt-input mono" id="regions" name="regions" placeholder="fsn1,nbg1" /></div>
      <div><span class="vt-label">İkametgâh</span><div style="display:flex; gap:12px">{#each RESIDENCIES as r (r)}<label style="display:flex; gap:6px; align-items:center; font-size:13px"><input type="checkbox" name="residencies" value={r} checked={r !== 'US'} /> {r}</label>{/each}</div></div>
      {#if form?.message}<p class="vt-field-error">{form.message}</p>{/if}
      <Button type="submit">Hesabı mühürle ve kaydet</Button>
    </form>
  </Card>
</div>
