// test/balance.test.js
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SPEC3_BALANCE } from '../../js/game/balance.js';

test('newcomer.intervalDays > 0', () => {
  assert.ok(SPEC3_BALANCE.newcomer.intervalDays > 0);
});

test('newcomer.partySize > 0', () => {
  assert.ok(SPEC3_BALANCE.newcomer.partySize > 0);
});

test('accept.giftWorkerOutputBonus in [0, 1]', () => {
  assert.ok(SPEC3_BALANCE.accept.giftWorkerOutputBonus >= 0);
  assert.ok(SPEC3_BALANCE.accept.giftWorkerOutputBonus <= 1);
});

test('house.capacity >= 1', () => {
  assert.ok(SPEC3_BALANCE.house.capacity >= 1);
});

test('weaver.maxWorkers >= 1', () => {
  assert.ok(SPEC3_BALANCE.weaver.maxWorkers >= 1);
});

test('all numeric values are number type', () => {
  function checkNumeric(obj, path = '') {
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      const fullPath = path ? `${path}.${k}` : k;
      if (typeof v === 'object') checkNumeric(v, fullPath);
      else if (typeof v === 'string') continue;  // sourceGate, etc.
      else assert.equal(typeof v, 'number', `${fullPath} not number`);
    }
  }
  checkNumeric(SPEC3_BALANCE);
});
