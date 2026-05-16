import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { initNeedsForRole, updateNeeds, resetNeedsAfterSleep, needWeight } from '../../js/game/agents/needs.js';

test('initNeedsForRole returns null for transient (role=null)', () => {
  assert.equal(initNeedsForRole(null), null);
});

test('initNeedsForRole returns full template for Resident', () => {
  const n = initNeedsForRole('Resident');
  assert.equal(n.thirst, 0);
  assert.equal(n.fatigue, 0);
  assert.equal(n.devotion, 0);
});

test('initNeedsForRole gives Guard no devotion', () => {
  const n = initNeedsForRole('Guard');
  assert.equal(n.thirst, 0);
  assert.equal(n.fatigue, 0);
  assert.equal(n.devotion, undefined);
});

test('updateNeeds increments by deltaMinutes * rate', () => {
  const a = { role: 'Resident', needs: { thirst: 0, fatigue: 0, devotion: 0 } };
  updateNeeds(a, 10); // 10 模拟分钟
  assert.ok(a.needs.thirst > 0, 'thirst should grow');
  assert.ok(a.needs.thirst < 1, 'thirst should not saturate in 10 min');
});

test('updateNeeds caps at 1.0', () => {
  const a = { role: 'Resident', needs: { thirst: 0.99, fatigue: 0, devotion: 0 } };
  updateNeeds(a, 600);
  assert.equal(a.needs.thirst, 1.0);
});

test('resetNeedsAfterSleep zeros thirst/devotion, low fatigue', () => {
  const a = { role: 'Resident', needs: { thirst: 0.8, fatigue: 0.9, devotion: 0.7 } };
  resetNeedsAfterSleep(a);
  assert.equal(a.needs.thirst, 0);
  assert.equal(a.needs.devotion, 0);
  assert.ok(a.needs.fatigue <= 0.15);
});

test('needWeight low at 0.0-0.4, ramping at 0.4-0.7, dominant past 0.7', () => {
  assert.ok(needWeight(0.0) <= 1.5);
  assert.ok(needWeight(0.5) > needWeight(0.3));
  assert.ok(needWeight(0.8) > needWeight(0.5));
  assert.ok(needWeight(1.0) > 5);
});
