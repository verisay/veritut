<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button, Card, PageHead, ResidencyBadge } from '@veritut/ui';
  import { formatMoney } from '@veritut/shared';
  let { data, form } = $props();
  const d = $derived(data.detail);
  const errs = $derived((form?.details ?? null) as Record<string, string[]> | null);
  let residency = $state<'TR' | 'EU' | 'US'>((form?.values?.residency as 'TR') ?? 'TR');
  let size = $state<string>((form?.values?.size as string) ?? '');
  let planCode = $state<string>((form?.values?.planCode as string) ?? data.preselectedPlan ?? 'baslangic');
  let slaCode = $state<string>((form?.values?.slaCode as string) ?? 'std_9x5');
  let trial = $state(form?.values?.trial === 'on');
  $effect(() => {
    if (d && !d.residencies.includes(residency)) residency = d.residencies[0] ?? 'EU';
    if (d && !d.sizes.some((s) => s.code === size)) size = d.sizes[0]?.code ?? '';
  });
  const provider = $derived(d?.providers[0] ?? '');
  const regions = $derived(d ? (d.regions[provider] ?? []) : []);
  const allowedSla = $derived((data.plans.find((p) => p.code === planCode)?.features['sla.tiers'] as string[] | undefined) ?? ['std_9x5']);
  $effect(() => {
    if (!allowedSla.includes(slaCode)) slaCode = allowedSla[0] ?? 'std_9x5';
  });
  const price = $derived(d?.prices.find((x) => x.size === size && x.residency === residency && x.planCode === planCode && x.slaCode === slaCode) ?? null);
</script>

<svelte:head><title>Yeni iş yükü — VERITUT</title></svelte:head>
<PageHead title="Yeni iş yükü" />
<p class="vt-lead" style="margin:6px 0 24px">Ürün, ikametgâh ve plan seçin. Onaydan sonra kurulum insan dokunmadan başlar; her adım kanıt defterinize düşer.</p>

{#if !data.activeTenant}
  <Card><p style="margin:0">Önce bir kiracı oluşturun.</p></Card>
{:else if !d}
  <Card><p style="margin:0">Self-servise açık ürün yok.</p></Card>
{:else}
  <div style="display:grid; grid-template-columns:1fr 320px; gap:14px; align-items:start">
    <div style="display:grid; gap:14px">
      <Card title="Ürün">
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px">
          {#each data.products as p (p.slug)}
            <a href="/panel/siparis?urun={p.slug}" class="vt-card vt-card-pad" style="color:inherit; border-color:{p.slug === data.selected ? 'var(--text)' : 'var(--border)'}">
              <p style="margin:0; font-weight:800; font-size:14px">{p.title}</p>
              <p class="vt-help" style="margin:4px 0 0">{p.summary.slice(0, 80)}</p>
            </a>
          {/each}
        </div>
      </Card>

      <form method="POST" action="?/order" use:enhance style="display:grid; gap:14px">
        <input type="hidden" name="productSlug" value={d.product.slug} />
        <Card title="Yerleşim ve boyut">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
            <div>
              <span class="vt-label">İkametgâh</span>
              <div style="display:flex; gap:12px; flex-wrap:wrap">
                {#each d.residencies as r (r)}
                  <label style="display:flex; gap:6px; align-items:center; font-size:13.5px"><input type="radio" name="residency" value={r} bind:group={residency} /> <ResidencyBadge residency={r} small /></label>
                {/each}
              </div>
              <p class="vt-help" style="margin:6px 0 0">Yedekler dâhil tüm kopyalar bu sınıfın dışına çıkmaz.</p>
            </div>
            <div><label class="vt-label" for="region">Bölge</label><select class="vt-input" id="region" name="region">{#each regions as r (r)}<option value={r}>{r}</option>{/each}</select></div>
            <div><label class="vt-label" for="size">Boyut</label><select class="vt-input" id="size" name="size" bind:value={size}>{#each d.sizes as s (s.code)}<option value={s.code}>{s.title}</option>{/each}</select></div>
            <div><label class="vt-label" for="planCode">Plan</label><select class="vt-input" id="planCode" name="planCode" bind:value={planCode}>{#each data.plans as p (p.code)}<option value={p.code}>{p.title}</option>{/each}</select></div>
            <div><label class="vt-label" for="slaCode">SLA</label><select class="vt-input" id="slaCode" name="slaCode" bind:value={slaCode}>{#each data.slaTiers.filter((s) => allowedSla.includes(s.code)) as s (s.code)}<option value={s.code}>{s.title}</option>{/each}</select></div>
            <div style="display:flex; align-items:end"><label style="display:flex; gap:8px; align-items:center; font-size:13.5px"><input type="checkbox" name="trial" bind:checked={trial} /> 14 gün deneme (kart yok)</label></div>
          </div>
        </Card>

        <Card title="İş yükü">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
            <div><label class="vt-label" for="workloadSlug">Kısa ad</label><input class="vt-input mono" id="workloadSlug" name="workloadSlug" required placeholder="muhasebe-{d.product.slug}" value={form?.values?.workloadSlug ?? ''} aria-invalid={errs?.workloadSlug ? 'true' : undefined} />{#if errs?.workloadSlug}<p class="vt-field-error">{errs.workloadSlug[0]}</p>{/if}</div>
            <div><label class="vt-label" for="workloadName">Görünen ad</label><input class="vt-input" id="workloadName" name="workloadName" required value={form?.values?.workloadName ?? ''} /></div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px">
            {#each Object.entries(d.inputs.properties) as [k, f] (k)}
              <div style={(f.minLength ?? 0) >= 40 ? 'grid-column:1/-1' : ''}>
                <label class="vt-label" for="in-{k}">{f.title_tr}{f.secret ? ' 🔒' : ''}{d.inputs.required.includes(k) ? '' : ' (isteğe bağlı)'}</label>
                {#if f.type === 'boolean'}
                  <label style="display:flex; gap:8px; align-items:center; font-size:13.5px; height:38px"><input type="checkbox" id="in-{k}" name="in.{k}" value="true" checked={f.default === true} /> evet</label>
                {:else if f.enum}
                  <select class="vt-input" id="in-{k}" name="in.{k}">{#each f.enum as v, i (v)}<option value={v}>{f.enum_labels_tr?.[i] ?? v}</option>{/each}</select>
                {:else if (f.minLength ?? 0) >= 40}
                  <textarea class="vt-input mono" id="in-{k}" name="in.{k}" rows="3" style="height:auto; padding:8px 12px" required={d.inputs.required.includes(k)}>{form?.values?.[`in.${k}`] ?? ''}</textarea>
                {:else}
                  <input class="vt-input" id="in-{k}" name="in.{k}" type={f.secret ? 'password' : f.type === 'string' ? 'text' : 'number'} required={d.inputs.required.includes(k)} value={f.secret ? '' : (form?.values?.[`in.${k}`] ?? f.default ?? '')} aria-invalid={errs?.[k] ? 'true' : undefined} />
                {/if}
                {#if f.help_tr}<p class="vt-help" style="margin:4px 0 0">{f.help_tr}</p>{/if}
                {#if errs?.[k]}<p class="vt-field-error">{errs[k][0]}</p>{/if}
              </div>
            {/each}
          </div>
        </Card>

        <Card>
          <label style="display:flex; gap:10px; align-items:flex-start; font-size:13.5px">
            <input type="checkbox" name="acceptTerms" required style="margin-top:3px" />
            <span><a href="/sozlesmeler">Hizmet şartlarını</a> ve <a href="/kvkk">KVKK aydınlatma metnini</a> okudum, onaylıyorum. Sipariş anındaki fiyat sözleşmedir.</span>
          </label>
          {#if form?.message}<p class="vt-field-error" style="margin:12px 0 0">{form.message}</p>{/if}
          <div style="margin-top:14px"><Button type="submit" size="lg">{trial ? 'Denemeyi başlat' : 'Siparişi onayla ve kur'}</Button></div>
        </Card>
      </form>
    </div>

    <Card title="Özet">
      <div style="display:grid; gap:8px; font-size:13.5px">
        <div style="display:flex; justify-content:space-between"><span class="muted">Ürün</span><span style="font-weight:700">{d.product.title}</span></div>
        <div style="display:flex; justify-content:space-between"><span class="muted">Boyut</span><span>{d.sizes.find((s) => s.code === size)?.title ?? size}</span></div>
        <div style="display:flex; justify-content:space-between"><span class="muted">İkametgâh</span><ResidencyBadge residency={residency} small /></div>
        <div style="display:flex; justify-content:space-between"><span class="muted">Plan / SLA</span><span>{data.plans.find((p) => p.code === planCode)?.title} · {slaCode}</span></div>
        <div style="border-top:1px solid var(--border); margin-top:6px; padding-top:10px">
          {#if price}
            <div style="display:flex; justify-content:space-between"><span class="muted">Aylık</span><span class="tnum" style="font-weight:800">{trial ? formatMoney(0, price.currency as 'TRY') : formatMoney(price.monthly, price.currency as 'TRY')}</span></div>
            <div style="display:flex; justify-content:space-between"><span class="muted">Kurulum</span><span class="tnum">{trial ? formatMoney(0, price.currency as 'TRY') : formatMoney(price.setupFee, price.currency as 'TRY')}</span></div>
            {#if trial}<p class="vt-help" style="margin:10px 0 0">14 gün ücretsiz. Süre bitiminde iş yükü durur, veriniz durur.</p>{:else}<p class="vt-help" style="margin:10px 0 0">İlk fatura: {formatMoney(price.monthly + price.setupFee, price.currency as 'TRY')} (KDV hariç)</p>{/if}
          {:else}
            <p class="vt-help" style="margin:0">Bu bileşim için fiyat tanımlı değil.</p>
          {/if}
        </div>
      </div>
    </Card>
  </div>
{/if}
