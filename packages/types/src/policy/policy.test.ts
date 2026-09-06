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
