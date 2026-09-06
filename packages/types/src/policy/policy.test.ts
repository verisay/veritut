import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkResidency, isResidencyCompatible } from './residency.js';
import { checkBackupTopology } from './backup.js';
import { computeConcentration } from './concentration.js';
import { addSlaMinutes, isBusinessMoment, fixedHolidaysForYear } from './sla-clock.js';

test('ikametgâh: TR verisi ABD kovasına gidemez', () => {
  assert.equal(isResidencyCompatible('TR', 'US'), false);
  assert.equal(isResidencyCompatible('TR', 'TR'), true);
  const v = checkResidency({ workload: 'TR', region: 'TR', primaryBackup: 'TR', offsiteBackup: 'US' });
  assert.deepEqual(v, [{ subject: 'offsite_backup', expected: 'TR', actual: 'US' }]);
});

test('ikametgâh: EU verisi TR\'ye çıkabilir, US\'e çıkamaz', () => {
  assert.equal(isResidencyCompatible('EU', 'TR'), true);
  assert.equal(isResidencyCompatible('EU', 'US'), false);
});

test('3-2-1: offsite aynı tedarikçide sayılmaz', () => {
  assert.deepEqual(checkBackupTopology({ primaryProvider: 'hetzner', offsiteProvider: 'hetzner' }), [
    'offsite_same_provider',
  ]);
  assert.deepEqual(checkBackupTopology({ primaryProvider: 'hetzner', offsiteProvider: null }), ['offsite_missing']);
  assert.deepEqual(checkBackupTopology({ primaryProvider: 'hetzner', offsiteProvider: 'aws' }), []);
});

test('yoğunlaşma: %60 üstü tedarikçi bayraklanır', () => {
  const r = computeConcentration(['hetzner', 'hetzner', 'hetzner', 'hetzner', 'aws']);
  assert.deepEqual(r.overThreshold, ['hetzner']);
  assert.deepEqual(computeConcentration(['hetzner', 'aws']).overThreshold, []);
});

test('SLA saati: 9x5 cuma 17:30 + 60 dk → pazartesi 09:30 (hafta sonu atlanır)', () => {
  const holidays = new Set(fixedHolidaysForYear(2026));
  // 2026-09-04 Cuma 17:30 İstanbul = 14:30Z
  const from = new Date('2026-09-04T14:30:00Z');
  const due = addSlaMinutes(from, 60, '9x5', holidays);
  // Pazartesi 2026-09-07 09:30 İstanbul = 06:30Z
  assert.equal(due.toISOString(), '2026-09-07T06:30:00.000Z');
});

test('SLA saati: 24x7 düz toplar; tatil iş anı değildir', () => {
  const holidays = new Set(fixedHolidaysForYear(2026));
  const from = new Date('2026-10-29T08:00:00Z'); // 29 Ekim 11:00 İstanbul
  assert.equal(isBusinessMoment(from, holidays), false);
  assert.equal(addSlaMinutes(from, 30, '24x7', holidays).toISOString(), '2026-10-29T08:30:00.000Z');
});

import { riskFor, requiresApproval } from './risk.js';
test('risk: destroy her zaman high; provision yalnız yaratım low; plan silme içeriyorsa high', () => {
  assert.equal(riskFor('destroy', null), 'high');
  assert.equal(riskFor('provision', { add: 5, change: 0, destroy: 0, replace: 0, resources: [] }), 'low');
  assert.equal(riskFor('provision', { add: 1, change: 0, destroy: 1, replace: 0, resources: [] }), 'high');
  assert.equal(riskFor('resize', { add: 0, change: 1, destroy: 0, replace: 0, resources: [] }), 'medium');
  assert.equal(riskFor('resize', { add: 0, change: 0, destroy: 0, replace: 1, resources: [] }), 'high');
  assert.equal(requiresApproval('high'), true);
  assert.equal(requiresApproval('medium'), false);
});

import { getEffectiveFeatures, hasFeature, allowedSlaTiers } from './entitlement.js';
import { quotaExceeded, UNLIMITED } from '../catalog.js';
test('entitlement: istisna planı ezer, bilinmeyen anahtar yok sayılır', () => {
  const f = getEffectiveFeatures({ 'workloads.max': 3, 'api.enabled': false }, { 'api.enabled': true, uydurma: 1 });
  assert.deepEqual(f, { 'workloads.max': 3, 'api.enabled': true });
  assert.equal(hasFeature(f, 'api.enabled'), true);
  assert.equal(hasFeature(f, 'finops'), false);
});

test('kota: -1 sınırsız, eşitlik aşım sayılır', () => {
  assert.equal(quotaExceeded(3, 2), false);
  assert.equal(quotaExceeded(3, 3), true);
  assert.equal(quotaExceeded(UNLIMITED, 9999), false);
  assert.equal(quotaExceeded(undefined, 5), false);
});

test('SLA katmanları: tanımsızsa yalnız standart', () => {
  assert.deepEqual(allowedSlaTiers({}), ['std_9x5']);
  assert.deepEqual(allowedSlaTiers({ 'sla.tiers': ['std_9x5', 'crit_24x7'] }), ['std_9x5', 'crit_24x7']);
});
