#!/usr/bin/env node
/**
 * K2 devamlılık testi: provizyon sürerken runner konteyneri öldürülür; yeni runner job'ı 'stalled' olarak
 * alır ve run_steps'e göre tamamlanmış adımları ATLAYARAK bitirir. Host'ta docker gerekir.
 *   node apps/api/scripts/smoke-k2-resume.mjs
 */
import { execSync } from 'node:child_process';
import { OPS, ok, go, oidcLogin, done, json, waitRun, sleep } from './_smoke-common.mjs';

const ts = Date.now().toString(36);
const dc = 'docker compose -f /srv/fleet/projects/veritut/infra/compose.dev.yml';
console.log('K2 devamlılık — runner çökmesi');
await oidcLogin(OPS, 'ops', 'ops@veritut.local', 'ops-dev-parola');
const tenant = await (await go(`${OPS}/api/v1/ops/tenants`, json({ name: `K2r ${ts}`, slug: `k2r-${ts}`, residencyDefault: 'EU' }))).json();
const acc = await (await go(`${OPS}/api/v1/ops/provider-accounts`, json({ providerCode: 'mock', label: `mock-k2r-${ts}`, credentials: { seed: ts }, regions: ['eu-fra'], residencies: ['EU'] }))).json();
const prov = await (await go(`${OPS}/api/v1/ops/workloads/provision`, json({ tenantId: tenant.id, blueprint: 'mock-vps', version: '1.0.0', slug: `vm-${ts}`, name: `Resume ${ts}`, residency: 'EU', providerAccountId: acc.id, region: 'eu-fra', size: 'S', inputs: { hostname: `vm-${ts}`, admin_email: 'a@veritut.local', root_password: `Root-Parola-${ts}-XyZ` } }))).json();
// apply tamamlanınca (configure başlamadan/başlarken) runner'ı öldür
let killedAt = null;
for (let i = 0; i < 120; i++) {
  await sleep(500);
  const d = await (await go(`${OPS}/api/v1/ops/runs/${prov.run.id}`)).json();
  if (d.steps.some((s) => s.step === 'apply' && s.status === 'succeeded')) {
    execSync(`${dc} kill -s SIGKILL runner`, { stdio: 'ignore' });
    killedAt = d.steps.map((s) => `${s.step}:${s.status}`).join(',');
    break;
  }
  if (['succeeded', 'failed'].includes(d.run.status)) break;
}
ok('runner apply sonrası SIGKILL ile öldürüldü', killedAt !== null, killedAt ?? 'apply görülmedi');
execSync(`${dc} up -d runner`, { stdio: 'ignore' });
const r = await waitRun(OPS, prov.run.id, 240);
ok('yeni runner run\'ı devraldı ve succeeded', r?.run.status === 'succeeded', `${r?.run.status} ${JSON.stringify(r?.run.summary)}`);
const logText = r?.log.map((l) => l.line).join('\n') ?? '';
ok('log: tamamlanmış adımlar atlandı (↷ validate/unseal/plan/apply)', /↷ apply \(önceki denemede tamamlandı/.test(logText) && /↷ validate/.test(logText), logText.split('\n').filter((l) => l.includes('↷')).join(' | '));
ok('tofu apply İKİ KEZ koşmadı (tek "Apply complete")', (logText.match(/Apply complete/g) ?? []).length === 1);
ok('8 adım succeeded', r?.steps.filter((s) => s.status === 'succeeded').length === 8);
const wd = await (await go(`${OPS}/api/v1/ops/workloads/${prov.workload.id}`)).json();
ok('iş yükü active + endpoints', wd.workload.status === 'active' && wd.workload.endpoints.length === 1);
done();
