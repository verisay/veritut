<script lang="ts">
  import { enhance } from '$app/forms';
  import { Card, Table, Button } from '@veritut/ui';
  import { TENANT_ROLES, TENANT_ROLE_LABEL, type TenantRole } from '@veritut/types';
  import { formatDate } from '@veritut/shared';
  let { data, form } = $props();
</script>

<div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:24px">
  <div><h1 class="vt-h1">Ekip</h1><p class="vt-lead" style="margin:4px 0 0">Roller: sahip, yönetici, teknik, mali, salt okuma.</p></div>
</div>
{#if form?.message}<div class="vt-status" data-state="down" style="margin-bottom:12px">{form.message}</div>{/if}
{#if form?.invited}<div class="vt-status" data-state="ok" style="margin-bottom:12px">Davet gönderildi. {#if form.devToken}<span class="vt-help">(dev) bağlantı: <a href="/panel/davet/{form.devToken}" class="mono">/panel/davet/…</a></span>{/if}</div>{/if}
<div style="display:grid; grid-template-columns:1fr {data.canManage ? '340px' : ''}; gap:14px; align-items:start">
  <div style="display:grid; gap:14px">
    <Card padded={false}>
      <Table minWidth={520}>
        {#snippet head()}<th>Üye</th><th>Rol</th><th>Katılım</th>{#if data.isOwner}<th></th>{/if}{/snippet}
        {#each data.members as m (m.userId)}
          <tr>
            <td>{m.displayName} <span class="muted">· {m.email}</span></td>
            <td>
              {#if data.isOwner && m.userId !== data.me.id}
                <form method="POST" action="?/role" use:enhance style="display:inline"><input type="hidden" name="userId" value={m.userId} /><select class="vt-input" name="role" style="height:30px; width:auto; font-size:12.5px" onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()}>{#each TENANT_ROLES as r (r)}<option value={r} selected={r === m.role}>{TENANT_ROLE_LABEL[r]}</option>{/each}</select></form>
              {:else}{TENANT_ROLE_LABEL[m.role as TenantRole] ?? m.role}{/if}
            </td>
            <td class="tnum">{formatDate(m.since)}</td>
            {#if data.isOwner}<td>{#if m.userId !== data.me.id}<form method="POST" action="?/remove" use:enhance><input type="hidden" name="userId" value={m.userId} /><Button type="submit" size="sm" variant="ghost">Çıkar</Button></form>{/if}</td>{/if}
          </tr>
        {/each}
      </Table>
    </Card>
    {#if data.canManage && data.invitations.length}
      <Card title="Bekleyen davetler" padded={false}>
        <Table minWidth={420}>
          {#snippet head()}<th>E-posta</th><th>Rol</th><th>Son geçerlilik</th><th>Durum</th>{/snippet}
          {#each data.invitations as i (i.id)}<tr><td>{i.email}</td><td>{TENANT_ROLE_LABEL[i.role as TenantRole]}</td><td class="tnum">{formatDate(i.expiresAt)}</td><td>{i.acceptedAt ? 'kabul edildi' : 'bekliyor'}</td></tr>{/each}
        </Table>
      </Card>
    {/if}
  </div>
  {#if data.canManage}
    <Card title="Üye davet et" subtitle="7 gün geçerli bağlantı e-postayla gider">
      <form method="POST" action="?/invite" use:enhance style="display:grid; gap:10px">
        <div><label class="vt-label" for="email">E-posta</label><input class="vt-input" id="email" name="email" type="email" required /></div>
        <div><label class="vt-label" for="role">Rol</label><select class="vt-input" id="role" name="role">{#each TENANT_ROLES.filter((r) => r !== 'owner') as r (r)}<option value={r}>{TENANT_ROLE_LABEL[r]}</option>{/each}</select></div>
        <Button type="submit">Davet gönder</Button>
      </form>
    </Card>
  {/if}
</div>
