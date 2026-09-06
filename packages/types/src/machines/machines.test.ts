import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transition, InvalidTransitionError, isTerminal } from './machine.js';
import { workloadMachine } from './workload.js';
import { runMachine } from './run.js';
import { changeMachine } from './change.js';

test('workload: requested → provisioning → active geçerli', () => {
  const s1 = transition(workloadMachine, 'requested', 'provisioning');
  const s2 = transition(workloadMachine, s1, 'active');
  assert.equal(s2, 'active');
});

test('workload: requested → active doğrudan YASAK (verify adımı atlanamaz)', () => {
  assert.throws(() => transition(workloadMachine, 'requested', 'active'), InvalidTransitionError);
});

test('workload: destroyed terminal — hiçbir geçiş yok', () => {
  assert.equal(isTerminal(workloadMachine, 'destroyed'), true);
  assert.throws(() => transition(workloadMachine, 'destroyed', 'active'));
});

test('run: succeeded terminal, awaiting_approval yalnız running üzerinden', () => {
  assert.throws(() => transition(runMachine, 'queued', 'awaiting_approval'));
  assert.equal(transition(runMachine, 'running', 'awaiting_approval'), 'awaiting_approval');
  assert.throws(() => transition(runMachine, 'succeeded', 'running'));
});

test('change: verified sonrası geri alınamaz (yeni change açılır)', () => {
  assert.throws(() => transition(changeMachine, 'verified', 'rolled_back'));
});
