// test/wasteland_direct.test.js
// 直接型解锁：成本公式跳档、并发上限、tick 倒计时、totalUnlocked 计数。

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { unlockCost, canStartDirectUnlock, startDirectUnlock, tickWastelandWork, countActiveDirect } from '../../js/game/wasteland.js';

function fakeState(over = {}) {
  return {
    totalUnlocked: 0,
    stats: { labor: 20, wood: 20, money: 50, ...(over.stats || {}) },
    plots: over.plots || [],
    day: over.day || 1,
  };
}

function ruin(id) {
  return {
    id, status: 'wasteland',
    wasteland: { type: 'oldRuin', unlockMode: 'direct', tier: null, workDaysLeft: null },
  };
}

test('unlockCost 跳档：n=0/2 → 1.0×；n=3/6 → 1.5×；n=7+ → 2.5×', () => {
  const s0 = fakeState({ totalUnlocked: 0 }); s0.totalUnlocked = 0;
  assert.deepEqual(unlockCost(s0, 'oldRuin'), { labor: 4, wood: 6, money: 0, workDays: 5 });
  s0.totalUnlocked = 2;
  assert.deepEqual(unlockCost(s0, 'oldRuin'), { labor: 4, wood: 6, money: 0, workDays: 5 });
  s0.totalUnlocked = 3;
  assert.deepEqual(unlockCost(s0, 'oldRuin'), { labor: 6, wood: 9, money: 0, workDays: 8 });
  s0.totalUnlocked = 6;
  assert.deepEqual(unlockCost(s0, 'oldRuin'), { labor: 6, wood: 9, money: 0, workDays: 8 });
  s0.totalUnlocked = 7;
  assert.deepEqual(unlockCost(s0, 'oldRuin'), { labor: 10, wood: 15, money: 0, workDays: 13 });
});

test('canStartDirectUnlock：资源不足时 false', () => {
  const s = fakeState({ stats: { labor: 1, wood: 1, money: 0 } });
  assert.equal(canStartDirectUnlock(s, ruin('SE-05')).ok, false);
});

test('canStartDirectUnlock：并发 ≥2 时 false', () => {
  const a = ruin('SE-05'); a.wasteland.workDaysLeft = 3;
  const b = ruin('SE-06'); b.wasteland.workDaysLeft = 5;
  const s = fakeState({ plots: [a, b, ruin('SE-07')] });
  assert.equal(canStartDirectUnlock(s, s.plots[2]).ok, false);
});

test('startDirectUnlock 扣资源 + 设 workDaysLeft', () => {
  const p = ruin('SE-05');
  const s = fakeState({ plots: [p] });
  assert.equal(startDirectUnlock(s, p), true);
  assert.equal(s.stats.labor, 16);
  assert.equal(s.stats.wood, 14);
  assert.equal(p.wasteland.workDaysLeft, 5);
});

test('tickWastelandWork 每日 -1，归 0 转 empty 并 totalUnlocked +1', () => {
  const p = ruin('SE-05');
  p.wasteland.workDaysLeft = 2;
  const s = fakeState({ plots: [p] });
  const logs = [];
  const addLog = (msg) => logs.push(msg);
  tickWastelandWork(s, addLog);
  assert.equal(p.wasteland.workDaysLeft, 1);
  assert.equal(p.status, 'wasteland');
  tickWastelandWork(s, addLog);
  assert.equal(p.status, 'empty');
  assert.equal(p.wasteland, null);
  assert.equal(s.totalUnlocked, 1);
  assert.match(logs[0], /SE-05/);
});

test('countActiveDirect 计数', () => {
  const a = ruin('SE-05'); a.wasteland.workDaysLeft = 1;
  const b = ruin('SE-06');
  const s = fakeState({ plots: [a, b] });
  assert.equal(countActiveDirect(s), 1);
});

test('低洼地用 money 而不是 wood', () => {
  const p = { id: 'SW-01', status: 'wasteland',
              wasteland: { type: 'lowland', unlockMode: 'direct', tier: null, workDaysLeft: null } };
  const s = fakeState({ plots: [p] });
  assert.equal(startDirectUnlock(s, p), true);
  assert.equal(s.stats.labor, 15);
  assert.equal(s.stats.money, 38);
  assert.equal(s.stats.wood, 20);
  assert.equal(p.wasteland.workDaysLeft, 6);
});
