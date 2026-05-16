// test/weaver_request.test.js
// slice-2 端到端：织棚承诺触发 + accept/reject + 期满
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  maybeSpawnWeaverRequest, acceptWeaverRequest, rejectWeaverRequest,
  acceptNewcomerPetition, expireStalePetitions,
} from '../../js/game/petitions.js';
import {
  createPromise, settlePromiseSuccess, tickPromises,
} from '../../js/game/promises.js';
import { PROMISE_BALANCE } from '../../js/game/balance-promises.js';
import { tryAutoHire } from '../../js/game/citizens.js';
import { resetAgentIds } from '../../js/game/agents/agent.js';
import { spawnVagrants } from '../../js/game/agents/spawn.js';
import { makeFakeState, makeBuiltHousePlot, registerBuildings } from './_helpers.js';

function fakeGates() {
  return { S: { cell: { x: 8, y: 15 }, todayTraffic: 0 } };
}

function emptyWeaverPlot(id, ox, oy, q = 'SW') {
  // 1×2
  return {
    id, quadrant: q,
    origin: { x: ox, y: oy }, size: { w: 1, h: 2 },
    cells: [{ x: ox, y: oy }, { x: ox, y: oy + 1 }],
    status: 'empty',
    building: null, project: null, mergedInto: null, mergeableWith: [],
    doorCell: { x: ox + 1, y: oy },
  };
}

function newcomerPromiseDef() {
  const cfg = PROMISE_BALANCE.newcomerSettle;
  return {
    kind: 'newcomer-settle',
    sourceId: 'pet-001', sourceGate: 'S',
    deadlineDays: cfg.deadlineDays,
    spatial: cfg.spatial, resources: cfg.resources,
    success: cfg.success, failure: cfg.failure,
  };
}

// ---- spawn 时机 ----

test('maybeSpawnWeaverRequest: queued + day=lastSettle+1 → spawn', () => {
  const s = makeFakeState({ day: 5, lastNewcomerSettleDay: 4, weaverRequestQueued: true });
  const pet = maybeSpawnWeaverRequest(s);
  assert.ok(pet);
  assert.equal(pet.kind, 'weaver-request');
  assert.equal(pet.expiresOnDay, 5 + 2);
  assert.equal(s.weaverRequestQueued, false);  // 一次性消费
  assert.equal(s.petitions.length, 1);
});

test('maybeSpawnWeaverRequest: 不 queued → 不 spawn', () => {
  const s = makeFakeState({ day: 5, lastNewcomerSettleDay: 4, weaverRequestQueued: false });
  const pet = maybeSpawnWeaverRequest(s);
  assert.equal(pet, null);
  assert.equal(s.petitions.length, 0);
});

test('maybeSpawnWeaverRequest: 同日 (lastSettle=day) → 不 spawn（窗口未到）', () => {
  const s = makeFakeState({ day: 4, lastNewcomerSettleDay: 4, weaverRequestQueued: true });
  const pet = maybeSpawnWeaverRequest(s);
  assert.equal(pet, null);
  assert.equal(s.weaverRequestQueued, true);  // 仍排队等下一天
});

test('maybeSpawnWeaverRequest: 错过窗口 (>2 日) → 清队列', () => {
  const s = makeFakeState({ day: 10, lastNewcomerSettleDay: 4, weaverRequestQueued: true });
  const pet = maybeSpawnWeaverRequest(s);
  assert.equal(pet, null);
  assert.equal(s.weaverRequestQueued, false);
});

test('maybeSpawnWeaverRequest: 已有未结 weaver-request → 不重复 spawn', () => {
  const s = makeFakeState({ day: 5, lastNewcomerSettleDay: 4, weaverRequestQueued: true });
  s.petitions.push({ id: 'wr-1', kind: 'weaver-request', resolved: false, expiresOnDay: 99 });
  const pet = maybeSpawnWeaverRequest(s);
  assert.equal(pet, null);
});

// ---- accept / reject ----

test('acceptWeaverRequest: 创建 weaver-shop promise', () => {
  const s = makeFakeState();
  const pet = { id: 'wr-1', kind: 'weaver-request', sourceGate: 'S', resolved: false };
  s.petitions.push(pet);
  const ok = acceptWeaverRequest(s, pet);
  assert.equal(ok, true);
  assert.equal(pet.resolved, true);
  assert.equal(pet.outcome, 'accepted');
  assert.equal(s.promises.length, 1);
  assert.equal(s.promises[0].kind, 'weaver-shop');
  assert.equal(s.promises[0].sourceId, 'wr-1');
});

test('rejectWeaverRequest: 扣民心 + 调 spawnVagrantsFn (1 个 S 门流民)', () => {
  const s = makeFakeState({ stats: { morale: 50 } });
  const pet = { id: 'wr-1', kind: 'weaver-request', sourceGate: 'S', resolved: false };
  let vagrantCall = null;
  const ok = rejectWeaverRequest(s, pet, (st, gate, n) => { vagrantCall = { gate, n }; });
  assert.equal(ok, true);
  assert.equal(pet.outcome, 'rejected');
  assert.equal(s.stats.morale, 50 - 3);
  assert.deepEqual(vagrantCall, { gate: 'S', n: 1 });
});

test('expireStalePetitions: weaver-request 过期 → 民心 -2，无流民', () => {
  const s = makeFakeState({ day: 10, stats: { morale: 50 } });
  s.petitions.push({ id: 'wr-1', kind: 'weaver-request', sourceGate: 'S',
    expiresOnDay: 8, resolved: false });
  expireStalePetitions(s, () => {});
  assert.equal(s.petitions[0].resolved, true);
  assert.equal(s.petitions[0].outcome, 'expired');
  assert.equal(s.stats.morale, 50 - 2);
});

// ---- settlePromiseSuccess (newcomer) → 排队 weaver-request ----

test('settlePromiseSuccess(newcomer-settle): 设 lastNewcomerSettleDay + weaverRequestQueued', () => {
  const s = makeFakeState({ day: 5 });
  const p = createPromise(s, newcomerPromiseDef());
  // 假装条件满足，强行结算
  settlePromiseSuccess(s, p, () => {});
  assert.equal(s.lastNewcomerSettleDay, 5);
  assert.equal(s.weaverRequestQueued, true);
});

test('settlePromiseSuccess(weaver-shop): 不会再触发 weaverRequestQueued', () => {
  const s = makeFakeState({ day: 7, lastNewcomerSettleDay: 5, weaverRequestQueued: false });
  const cfg = PROMISE_BALANCE.weaverShop;
  const p = createPromise(s, {
    kind: 'weaver-shop', sourceGate: 'S',
    deadlineDays: cfg.deadlineDays, spatial: cfg.spatial,
    resources: cfg.resources, success: cfg.success, failure: cfg.failure,
  });
  settlePromiseSuccess(s, p, () => {});
  assert.equal(s.weaverRequestQueued, false);  // 不应被 weaver-shop 触发
});

// ---- 端到端 ----

test('e2e: 新民承诺成功 → 次日 spawn 织户请愿 → 应允建织棚 → 自动结算 → skilled+1', () => {
  resetAgentIds();
  const s = makeFakeState({ stats: { money: 100, cloth: 4, wood: 10, population: 8, morale: 50 } });
  s.gates = fakeGates();
  s.agents = [];

  // Day 1: 接纳新民承诺
  const newPet = { id: 'pet-001', kind: 'newcomer', count: 3, sourceGate: 'S', resolved: false, expiresOnDay: 99 };
  s.petitions.push(newPet);
  acceptNewcomerPetition(s, newPet);

  // 用现存 + 新建房 满足新民承诺
  const close = makeBuiltHousePlot('close');
  close.origin = { x: 9, y: 9 }; close.cells = [{ x: 9, y: 9 }];
  const far = makeBuiltHousePlot('far');
  s.plots = [close, far];
  registerBuildings(s, s.plots);

  // Day 2: 满足条件，承诺自动结算
  s.day = 2;
  tickPromises(s, () => {}, tryAutoHire, spawnVagrants);
  const newcomerPromise = s.promises.find(p => p.kind === 'newcomer-settle');
  assert.equal(newcomerPromise.outcome, 'success');
  assert.equal(s.lastNewcomerSettleDay, 2);
  assert.equal(s.weaverRequestQueued, true);

  // Day 3: 织户请愿 spawn
  s.day = 3;
  const wrPet = maybeSpawnWeaverRequest(s);
  assert.ok(wrPet);
  assert.equal(wrPet.kind, 'weaver-request');

  // Day 3: 玩家应允
  const ok = acceptWeaverRequest(s, wrPet);
  assert.ok(ok);
  const wsPromise = s.promises.find(p => p.kind === 'weaver-shop');
  assert.ok(wsPromise);

  // Day 4: 玩家建好织棚（SW 区，远 house 远 incense）
  const woven = {
    id: 'woven-test', quadrant: 'SW',
    origin: { x: 4, y: 9 }, size: { w: 1, h: 2 },
    cells: [{ x: 4, y: 9 }, { x: 4, y: 10 }],
    status: 'built', project: null, mergedInto: null, mergeableWith: [],
    building: 'weaver-test-1', doorCell: { x: 5, y: 9 },
  };
  s.plots.push(woven);
  s.buildings['weaver-test-1'] = { id: 'weaver-test-1', kind: 'weaver', name: 'weaver' };
  s.day = 4;
  const beforeSkilled = s.skilledResidents;
  tickPromises(s, () => {}, tryAutoHire, spawnVagrants);

  assert.equal(wsPromise.outcome, 'success');
  assert.equal(s.skilledResidents, beforeSkilled + 1);
  assert.equal(s.stats.wood, 10 + 4 - 5);  // 新民成功先反哺木料 +4，再被织棚承诺扣 5
});

test('e2e: 婉拒织户请愿 → S 门外 1 流民', () => {
  resetAgentIds();
  const s = makeFakeState({ stats: { morale: 50 } });
  s.gates = fakeGates();
  s.agents = [];
  const pet = { id: 'wr-1', kind: 'weaver-request', sourceGate: 'S', resolved: false, expiresOnDay: 99 };
  s.petitions.push(pet);
  rejectWeaverRequest(s, pet, spawnVagrants);
  assert.equal(s.agents.length, 1);
  assert.equal(s.agents[0].type, 'Vagrant');
  assert.equal(s.agents[0].fromGate, 'S');
  assert.equal(s.stats.morale, 50 - 3);
});
