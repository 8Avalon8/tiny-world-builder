// test/wasteland_opening_loop.test.js
// 开局闭环：接新民不立刻给木料；兑现成功后才奖励木料 +4。

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resetState, state } from '../../js/game/state.js';
import { PROMISE_BALANCE } from '../../js/game/balance-promises.js';
import { INITIAL_PLOTS } from '../../js/game/plots.js';
import { acceptNewcomerPetition } from '../../js/game/petitions.js';
import { createPromise, settlePromiseSuccess, tickPromises } from '../../js/game/promises.js';
import { summarizeDay } from '../../js/game/day.js';
import { tickWastelandWork, startDirectUnlock, canStartDirectUnlock } from '../../js/game/wasteland.js';
import { makeFakeState } from './_helpers.js';

test('newcomerSettle.success 包含 wood +4 与 fame +5', () => {
  assert.equal(PROMISE_BALANCE.newcomerSettle.success.wood, 4);
  assert.equal(PROMISE_BALANCE.newcomerSettle.success.fame, 5);
});

test('接纳新民请愿当下不应提前发放 wood +4', () => {
  const s = makeFakeState({ stats: { money: 50, wood: 10 } });
  const pet = { id: 'pet-001', kind: 'newcomer', count: 3, sourceGate: 'S', resolved: false };
  s.petitions.push(pet);

  const ok = acceptNewcomerPetition(s, pet);
  assert.equal(ok, true);
  assert.equal(s.stats.wood, 10);
  assert.equal(s.promises.length, 1);
  assert.equal(s.promises[0].kind, 'newcomer-settle');
});

test('新民承诺成功结算时发放 wood +4、fame +5 并写入成功日志', () => {
  const cfg = PROMISE_BALANCE.newcomerSettle;
  const s = makeFakeState({ stats: { cloth: 6, wood: 10, fame: 25 } });
  const logs = [];
  const p = createPromise(s, {
    kind: 'newcomer-settle',
    sourceId: 'pet-001',
    sourceGate: 'S',
    deadlineDays: cfg.deadlineDays,
    spatial: cfg.spatial,
    resources: cfg.resources,
    success: cfg.success,
    failure: cfg.failure,
  });

  settlePromiseSuccess(s, p, msg => logs.push(msg));

  assert.equal(s.stats.wood, 14);
  assert.equal(s.stats.fame, 30);
  assert.equal(p.outcome, 'success');
  assert.match(logs[0], /声望 \+5/);
  assert.match(logs[0], /木料 \+4/);
});

test('真实日结顺序：新民成功结算后，先推进到织户阶段而不是寺线抢戏', () => {
  resetState();
  state.day = 2;
  state.plots = INITIAL_PLOTS.map(p => ({
    ...p,
    origin: { ...p.origin },
    size: { ...p.size },
    cells: p.cells.map(c => ({ ...c })),
    doorCell: { ...p.doorCell },
    mergeableWith: [...p.mergeableWith],
    wasteland: p.wasteland ? { ...p.wasteland } : null,
  }));
  state.buildings = {
    'house-01': { kind: 'house' },
    'house-02': { kind: 'house' },
    'house-03': { kind: 'house' },
    ciDengTemple: { kind: 'temple' },
  };
  state.stats.money = 50;
  state.stats.wood = 2;
  state.stats.cloth = 4;
  state.stats.fame = 25;

  const pet = {
    id: 'pet-001',
    kind: 'newcomer',
    count: 3,
    sourceGate: 'S',
    resolved: false,
  };
  state.petitions.push(pet);
  assert.equal(acceptNewcomerPetition(state, pet), true);

  const se04 = state.plots.find(p => p.id === 'SE-04');
  assert.ok(se04);
  se04.status = 'built';
  se04.building = 'house-04';
  se04.project = null;
  se04.wasteland = null;
  state.buildings['house-04'] = { kind: 'house' };

  summarizeDay(state, () => {});

  const newcomerPromise = state.promises.find(p => p.kind === 'newcomer-settle');
  assert.ok(newcomerPromise);
  assert.equal(newcomerPromise.resolved, true);
  assert.equal(newcomerPromise.outcome, 'success');
  assert.equal(state.stats.fame, 30);

  assert.equal(state.chapterStage, 'weaving');
  assert.equal(state.weaverRequestQueued, true);
  const templePermit = state.petitions.find(p => p.kind === 'temple-permit' && !p.resolved);
  assert.equal(templePermit, undefined, '垂直切片阶段应先等织户/小法会，寺线协商不再抢早期节奏');
});

test('开局闭环：接新民 → 兑现 → 木料反哺 → 清旧宅废墟', () => {
  resetState();
  state.plots = INITIAL_PLOTS.map(p => ({
    ...p,
    origin: { ...p.origin },
    size: { ...p.size },
    cells: p.cells.map(c => ({ ...c })),
    doorCell: { ...p.doorCell },
    mergeableWith: [...p.mergeableWith],
    wasteland: p.wasteland ? { ...p.wasteland } : null,
  }));
  state.buildings = {
    'house-01': { kind: 'house' },
    'house-02': { kind: 'house' },
    'house-03': { kind: 'house' },
    ciDengTemple: { kind: 'temple' },
  };
  state.stats.money = 50;
  state.stats.wood = 2;
  state.stats.cloth = 0;
  state.stats.fame = 25;

  const pet = {
    id: 'pet-001',
    kind: 'newcomer',
    count: 3,
    sourceGate: 'S',
    resolved: false,
  };
  state.petitions.push(pet);
  assert.equal(acceptNewcomerPetition(state, pet), true);
  assert.equal(state.promises.length, 1);

  const ruin = state.plots.find(p => p.id === 'SE-05');
  assert.ok(ruin);
  assert.equal(ruin.status, 'wasteland');
  assert.equal(ruin.wasteland.type, 'oldRuin');
  assert.equal(canStartDirectUnlock(state, ruin).ok, false, '兑现前木料不足，不应能开 SE-05');

  const se04 = state.plots.find(p => p.id === 'SE-04');
  assert.ok(se04);
  se04.status = 'built';
  se04.building = 'house-04';
  se04.project = null;
  se04.wasteland = null;
  state.buildings['house-04'] = { kind: 'house' };
  state.stats.cloth = 4;

  tickPromises(state, () => {}, null, () => {});
  assert.equal(state.promises[0].resolved, true);
  assert.equal(state.promises[0].outcome, 'success');
  assert.equal(state.stats.fame, 30, '兑现后声望应刚好达到寺线 tier1 门槛');
  assert.equal(state.stats.wood, 6, '兑现后木料应被反哺到刚好够开旧宅废墟');

  const check = canStartDirectUnlock(state, ruin);
  assert.ok(check.ok, `应可开垦：${check.reason || ''}`);
  assert.equal(startDirectUnlock(state, ruin), true);
  assert.equal(ruin.wasteland.workDaysLeft, 5);

  for (let i = 0; i < 5; i++) tickWastelandWork(state);
  assert.equal(ruin.status, 'empty');
  assert.equal(ruin.wasteland, null);
  assert.equal(state.totalUnlocked, 1);
});
