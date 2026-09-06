<script lang="ts">
  import { enhance } from '$app/forms';
  import { Card, Table, Button, EmptyState } from '@veritut/ui';
  import { formatDate, formatRelative } from '@veritut/shared';
  let { data, form } = $props();
  const scopes = ['workloads:read', 'evidence:read', 'orders:read', 'orders:write', 'status:read'];
</script>

<svelte:head><title>API anahtarları — VERITUT</title></svelte:head>
<h1 class="vt-h1" style="margin-bottom:6px">API anahtarları</h1>
<p class="vt-lead" style="margin:0 0 24px">İş yüklerinizi ve kanıt defterinizi kendi sisteminize taşıyın. <a href="/gelistirici">Belgeler</a></p>

{#if !data.canManage}
  <EmptyState title="Yetkiniz yok" text="API anahtarı yönetimi için sahip veya yönetici rolü gerekir." />
{:else}
  {#if form?.created}
    <Card title="Anahtar üretildi" subtitle="Bu değeri bir daha gösteremeyiz; şimdi kopyalayın.">
      <div class="vt-codebox" style="user-select:all">{form.created.token}</div>
    </Card>
  {/if}
  {#if form?.message}<div class="vt-status" data-state="down" style="margin:14px 0">{form.message}</div>{/if}
  {#if data.loadError}<div class="vt-status" data-state="degraded" style="margin:14px 0">{data.loadError}</div>{/if}

  <div style="display:grid; grid-template-columns:1fr 340px; gap:14px; align-items:start; margin-top:14px">
    <Card padded={false}>
      <Table minWidth={620}>
        {#snippet head()}<th>Ad</th><th>Önek</th><th>Kapsam</th><th>Son kullanım</th><th>Bitiş</th><th></th>{/snippet}
        {#each data.keys as k (k.id)}
          <tr style="opacity:{k.revokedAt ? 0.5 : 1}">
            <td>{k.name}</td>
            <td class="mono">{k.keyPrefix}…</td>
            <td class="mono" style="font-size:11.5px">{k.scopes.join(', ')}</td>
            <td class="muted">{k.lastUsedAt ? formatRelative(k.lastUsedAt) : 'hiç'}</td>
            <td class="tnum">{k.expiresAt ? formatDate(k.expiresAt) : '—'}</td>
            <td>{#if !k.revokedAt}<form method="POST" action="?/revoke" use:enhance><input type="hidden" name="id" value={k.id} /><Button type="submit" size="sm" variant="ghost">İptal</Button></form>{:else}<span class="vt-help">iptal</span>{/if}</td>
          </tr>
        {:else}
          <tr><td colspan="6" class="muted">Henüz anahtar yok.</td></tr>
        {/each}
      </Table>
    </Card>
    <Card title="Yeni anahtar">
      <form method="POST" action="?/create" use:enhance style="display:grid; gap:10px">
        <div><label class="vt-label" for="name">Ad</label><input class="vt-input" id="name" name="name" required placeholder="panel-entegrasyonu" /></div>
        <div>
          <span class="vt-label">Kapsamlar</span>
          <div style="display:grid; gap:4px">
            {#each scopes as s (s)}<label style="display:flex; gap:8px; align-items:center; font-size:13px"><input type="checkbox" name="scopes" value={s} checked={s === 'workloads:read'} /> <span class="mono">{s}</span></label>{/each}
          </div>
        </div>
        <div><label class="vt-label" for="ipAllow">IP izin listesi (virgülle, boş = her yer)</label><input class="vt-input mono" id="ipAllow" name="ipAllow" /></div>
        <div><label class="vt-label" for="expiresInDays">Geçerlilik (gün, boş = süresiz)</label><input class="vt-input tnum" id="expiresInDays" name="expiresInDays" type="number" min="1" max="3650" /></div>
        <Button type="submit">Anahtar üret</Button>
      </form>
    </Card>
  </div>
{/if}
