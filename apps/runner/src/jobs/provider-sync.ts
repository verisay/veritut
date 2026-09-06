import { api, fetchCredentials, finish, log, step } from './context.js';
import { getDriver } from '../providers/index.js';

/** provider-sync: envanter + maliyet tahmini → API `/internal/provider-accounts/:id/inventory`. */
export async function runProviderSync(runId: string, providerAccountId: string, providerCode: string): Promise<void> {
  await step(runId, 'validate', 'running');
  await log(runId, `provider-sync · hesap=${providerAccountId} · driver=${providerCode}`);
  const driver = getDriver(providerCode);
  await step(runId, 'validate', 'succeeded');

  await step(runId, 'unseal', 'running');
  const { provider } = await fetchCredentials(runId);
  if (!provider) throw new Error('hesabın kimlik bilgisi açılamadı');
  await log(runId, `  kimlik bilgisi açıldı (alanlar: ${Object.keys(provider).join(', ')})`, 'ok');
  await step(runId, 'unseal', 'succeeded');

  await step(runId, 'plan', 'running');
  const healthy = await driver.healthcheck(provider);
  await log(runId, `  tedarikçi erişimi: ${healthy ? 'ok' : 'BAŞARISIZ'}`, healthy ? 'ok' : 'err');
  if (!healthy) throw new Error('tedarikçi API erişimi başarısız');
  await step(runId, 'plan', 'succeeded');

  await step(runId, 'apply', 'running');
  const items = await driver.listInventory(provider);
  const est = items.reduce((s, i) => s + (i.monthlyCostEstimate ?? 0), 0);
  await log(runId, `  ${items.length} kaynak listelendi · aylık tahmin ${est.toFixed(2)} ${items[0]?.currency ?? ''}`);
  for (const i of items) await log(runId, `    ${i.kind.padEnd(13)} ${i.externalId.padEnd(24)} ${i.name} · ${i.region ?? '-'} · ${i.status} · ${i.monthlyCostEstimate ?? '-'}`);
  await step(runId, 'apply', 'succeeded');

  await step(runId, 'register', 'running');
  const period = new Date().toISOString().slice(0, 7);
  const r = await api<{ total: number; inserted: number; gone: number }>(`/internal/provider-accounts/${providerAccountId}/inventory`, { method: 'POST', body: JSON.stringify({ items, period }) });
  await log(runId, `  envanter yazıldı: ${r.total} kaynak, ${r.inserted} yeni, ${r.gone} kayıp`, 'ok');
  await step(runId, 'register', 'succeeded');
  await finish(runId, 'succeeded', 0, { items: items.length, inserted: r.inserted, gone: r.gone, estimate: est });
}
