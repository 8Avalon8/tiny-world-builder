// test/wasteland_permit.test.js
// 承诺型解锁：unlockTier 行为 + permit promises 的 onSettle 副作用。

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createPromise, settlePromiseTier, tickPromises } from '../../js/game/promises.js';
import { PROMISE_BALANCE } from '../../js/game/balance-promises.js';
import {
  maybeSpawnTemplePermitPetition,
  acceptTemplePermitPetition,
  rejectTemplePermitPetition,
  maybeSpawnGovPermitPetition,
  acceptGovPermitPetition,
  rejectGovPermitPetition,
  expireStalePetitions,
} from '../../js/game/petitions.js';
import { unlockTier } from '../../js/game/wasteland.js';

function makeState(over = {}) {
  return {
    day: over.day || 1,
    nextPromiseId: 1,
    promises: [],
    totalUnlocked: 0,
    stats: {
      cloth: 30,
      money: 120,
      morale: 70,
      fame: 25,
      fireRisk: 0,
      ...(over.stats || {}),
    },
    flags: {
      templeNegotiatedTier: 0,
      govPermittedTier: 0,
      templeNegotiateCooldown: [0, 0, 0, 0],
      govPermitCooldown: [0, 0, 0, 0],
      ...(over.flags || {}),
    },
    plots: over.plots || [
      { id: 'NW-02', status: 'wasteland',
        wasteland: { type: 'templeDispute', unlockMode: 'permission', tier: 1, workDaysLeft: null } },
      { id: 'NW-06', status: 'wasteland',
        wasteland: { type: 'templeDispute', unlockMode: 'permission', tier: 1, workDaysLeft: null } },
      { id: 'NW-03', status: 'wasteland',
        wasteland: { type: 'templeDispute', unlockMode: 'permission', tier: 2, workDaysLeft: null } },
      { id: 'NE-01', status: 'wasteland',
        wasteland: { type: 'govSealed', unlockMode: 'permission', tier: 1, workDaysLeft: null } },
      { id: 'NE-02', status: 'wasteland',
        wasteland: { type: 'govSealed', unlockMode: 'permission', tier: 1, workDaysLeft: null } },
    ],
  };
}

function makePermitPromise(state, key) {
  const cfg = PROMISE_BALANCE[key];
  assert.ok(cfg, `${key} 应存在`);
  return createPromise(state, {
    kind: key,
    sourceId: `${key}-pet`,
    sourceGate: 'N',
    deadlineDays: cfg.deadlineDays,
    spatial: cfg.spatial,
    resources: cfg.resources,
    constraints: cfg.constraints,
    outcomes: cfg.outcomes,
  });
}

function makePetState(over = {}) {
  return {
    day: over.day || 5,
    totalUnlocked: 0,
    nextPetitionId: 1,
    nextPromiseId: 1,
    petitions: [],
    promises: [],
    stats: {
      fame: 30,
      gov: 30,
      money: 100,
      cloth: 20,
      morale: 70,
      fireRisk: 0,
      congestion: 0,
      guards: 2,
      population: 8,
      ...(over.stats || {}),
    },
    skilledResidents: 0,
    flags: {
      templeNegotiatedTier: 0,
      govPermittedTier: 0,
      templeNegotiateCooldown: [0, 0, 0, 0],
      govPermitCooldown: [0, 0, 0, 0],
      ...(over.flags || {}),
    },
    guardAssignments: {},
    plots: over.plots || [
      { id: 'NW-02', status: 'wasteland',
        wasteland: { type: 'templeDispute', unlockMode: 'permission', tier: 1, workDaysLeft: null } },
      { id: 'NE-01', status: 'wasteland',
        wasteland: { type: 'govSealed', unlockMode: 'permission', tier: 1, workDaysLeft: null } },
    ],
  };
}

test('6 条 permit promise 配置都存在且三档都有 onSettle', () => {
  const keys = [
    'templePermitT1', 'templePermitT2', 'templePermitT3',
    'govPermitT1', 'govPermitT2', 'govPermitT3',
  ];
  for (const key of keys) {
    const cfg = PROMISE_BALANCE[key];
    assert.ok(cfg, `${key} 缺失`);
    assert.equal(typeof cfg.outcomes.grand.onSettle, 'function');
    assert.equal(typeof cfg.outcomes.basic.onSettle, 'function');
    assert.equal(typeof cfg.outcomes.cold.onSettle, 'function');
  }
});

test('grand 全解 tier1，2 块全转 empty，flag 推进', () => {
  const s = makeState();
  const r = unlockTier(s, 'templeDispute', 1, 'full');
  assert.equal(r.count, 2);
  assert.equal(r.total, 2);
  assert.equal(s.plots[0].status, 'empty');
  assert.equal(s.plots[1].status, 'empty');
  assert.equal(s.plots[2].status, 'wasteland');
  assert.equal(s.flags.templeNegotiatedTier, 1);
});

test('basic 半解 tier1，2 块向上取整只开 1 块', () => {
  const s = makeState();
  const r = unlockTier(s, 'templeDispute', 1, 'half');
  assert.equal(r.count, 1);
  assert.equal(s.plots[0].status, 'empty');
  assert.equal(s.plots[1].status, 'wasteland');
  assert.equal(s.flags.templeNegotiatedTier, 0);
});

test('basic 在 tier 内只剩 1 块时仍会推进 flag', () => {
  const s = makeState({ plots: [makeState().plots[0]] });
  const r = unlockTier(s, 'templeDispute', 1, 'half');
  assert.equal(r.count, 1);
  assert.equal(s.flags.templeNegotiatedTier, 1);
});

test('totalUnlocked 不被 unlockTier 推进', () => {
  const s = makeState();
  unlockTier(s, 'templeDispute', 1, 'full');
  assert.equal(s.totalUnlocked, 0);
});

test('unlockTier 会补齐缺失 flags，不会半路炸掉', () => {
  const s = makeState();
  delete s.flags;
  const r = unlockTier(s, 'templeDispute', 1, 'full');
  assert.equal(r.count, 2);
  assert.equal(s.flags.templeNegotiatedTier, 1);
});

test('unlockTier 非法 type 会抛错，且不污染 flag', () => {
  const s = makeState();
  assert.throws(() => unlockTier(s, 'bogus', 1, 'full'), /未知 permission type|未知 wasteland type|未知 type/);
  assert.equal(s.flags.templeNegotiatedTier, 0);
  assert.equal(s.flags.govPermittedTier, 0);
});

test('unlockTier 非法 mode 会抛错，且不偷偷半解', () => {
  const s = makeState();
  assert.throws(() => unlockTier(s, 'templeDispute', 1, 'typo'), /未知 unlock mode|未知 mode/);
  assert.equal(s.plots[0].status, 'wasteland');
  assert.equal(s.plots[1].status, 'wasteland');
  assert.equal(s.flags.templeNegotiatedTier, 0);
});

test('templePermitT1 grand 结算会全解 tier1，并吃 cloth 与加 fame', () => {
  const s = makeState({ stats: { cloth: 10, fame: 25 } });
  const p = makePermitPromise(s, 'templePermitT1');
  settlePromiseTier(s, p, 'grand', () => {}, null);
  assert.equal(p.resolved, true);
  assert.equal(p.outcome, 'grand');
  assert.equal(s.stats.cloth, 4);
  assert.equal(s.stats.fame, 35);
  assert.equal(s.plots[0].status, 'empty');
  assert.equal(s.plots[1].status, 'empty');
  assert.equal(s.flags.templeNegotiatedTier, 1);
});

test('templePermitT1 cold 结算会写 cooldown，不开地', () => {
  const s = makeState({ day: 7 });
  const p = makePermitPromise(s, 'templePermitT1');
  settlePromiseTier(s, p, 'cold', () => {}, null);
  assert.equal(s.plots[0].status, 'wasteland');
  assert.equal(s.plots[1].status, 'wasteland');
  assert.equal(s.flags.templeNegotiateCooldown[1], 37);
});

test('govPermitT1 basic 结算会半解 tier1 官地，并扣 money', () => {
  const s = makeState({ stats: { money: 80, fame: 25 } });
  const p = makePermitPromise(s, 'govPermitT1');
  settlePromiseTier(s, p, 'basic', () => {}, null);
  assert.equal(s.stats.money, 50);
  assert.equal(s.stats.fame, 27);
  assert.equal(s.plots[3].status, 'empty');
  assert.equal(s.plots[4].status, 'wasteland');
  assert.equal(s.flags.govPermittedTier, 0);
});

test('tickPromises：templePermitT1 满足条件时走 grand 真路径', () => {
  const s = makeState({ stats: { cloth: 10, morale: 70, fame: 25 } });
  const p = makePermitPromise(s, 'templePermitT1');
  tickPromises(s, () => {}, null, null);
  assert.equal(p.resolved, true);
  assert.equal(p.outcome, 'grand');
  assert.equal(s.stats.cloth, 4);
  assert.equal(s.stats.fame, 35);
  assert.equal(s.flags.templeNegotiatedTier, 1);
});

test('tickPromises：资源够但约束差，期满走 basic 真路径', () => {
  const s = makeState({ stats: { cloth: 10, morale: 40, fame: 25 } });
  const p = makePermitPromise(s, 'templePermitT1');
  s.day = p.deadline;
  tickPromises(s, () => {}, null, null);
  assert.equal(p.resolved, true);
  assert.equal(p.outcome, 'basic');
  assert.equal(s.stats.cloth, 4);
  assert.equal(s.stats.fame, 30);
  assert.equal(s.plots[0].status, 'empty');
  assert.equal(s.plots[1].status, 'wasteland');
  assert.equal(s.flags.templeNegotiatedTier, 0);
});

test('tickPromises：资源不够，期满走 cold 真路径', () => {
  const s = makeState({ day: 7, stats: { cloth: 0, morale: 70, fame: 25 } });
  const p = makePermitPromise(s, 'templePermitT1');
  s.day = p.deadline;
  tickPromises(s, () => {}, null, null);
  assert.equal(p.resolved, true);
  assert.equal(p.outcome, 'cold');
  assert.equal(s.stats.cloth, 0);
  assert.equal(s.stats.fame, 20);
  assert.equal(s.flags.templeNegotiateCooldown[1], p.deadline + 30);
  assert.equal(s.plots[0].status, 'wasteland');
  assert.equal(s.plots[1].status, 'wasteland');
});

test('temple permit：fame 30 才会触发 tier1', () => {
  const s = makePetState();
  s.stats.fame = 29;
  assert.equal(maybeSpawnTemplePermitPetition(s), null);
  s.stats.fame = 30;
  const pet = maybeSpawnTemplePermitPetition(s);
  assert.ok(pet);
  assert.equal(pet.kind, 'temple-permit');
  assert.equal(pet.tier, 1);
});

test('temple permit：cooldown 内不再 spawn', () => {
  const s = makePetState();
  s.flags.templeNegotiateCooldown[1] = 100;
  s.stats.fame = 50;
  assert.equal(maybeSpawnTemplePermitPetition(s), null);
});

test('temple permit：已完成 tier1 后直接试 tier2', () => {
  const s = makePetState();
  s.flags.templeNegotiatedTier = 1;
  s.stats.fame = 50;
  const pet = maybeSpawnTemplePermitPetition(s);
  assert.ok(pet);
  assert.equal(pet.tier, 2);
});

test('temple permit：已有未结同类 petition 时跳过', () => {
  const s = makePetState();
  s.petitions.push({ kind: 'temple-permit', resolved: false });
  assert.equal(maybeSpawnTemplePermitPetition(s), null);
});

test('temple permit：已有未结同类承诺时跳过', () => {
  const s = makePetState();
  s.promises.push({ kind: 'temple-permit', resolved: false });
  assert.equal(maybeSpawnTemplePermitPetition(s), null);
});

test('accept temple permit 会创建对应 tier 的承诺', () => {
  const s = makePetState();
  const pet = maybeSpawnTemplePermitPetition(s);
  const ok = acceptTemplePermitPetition(s, pet);
  assert.equal(ok, true);
  assert.equal(s.promises.length, 1);
  assert.equal(s.promises[0].kind, 'temple-permit');
  assert.equal(s.promises[0].resources.cloth, 6);
});

test('reject temple permit 会写 cooldown 且 fame -3', () => {
  const s = makePetState();
  const pet = maybeSpawnTemplePermitPetition(s);
  const fameBefore = s.stats.fame;
  const ok = rejectTemplePermitPetition(s, pet);
  assert.equal(ok, true);
  assert.equal(s.flags.templeNegotiateCooldown[1], s.day + 30);
  assert.equal(s.stats.fame, fameBefore - 3);
});

test('temple permit：spawn 会写 3 天过期窗口', () => {
  const s = makePetState({ day: 5 });
  const pet = maybeSpawnTemplePermitPetition(s);
  assert.ok(pet);
  assert.equal(pet.expiresOnDay, 8);
});

test('gov permit：gov 30 触发 tier1', () => {
  const s = makePetState();
  const pet = maybeSpawnGovPermitPetition(s);
  assert.ok(pet);
  assert.equal(pet.kind, 'gov-permit');
  assert.equal(pet.tier, 1);
});

test('gov permit：cooldown 内不再 spawn，且不会偷跑 tier2', () => {
  const s = makePetState();
  s.flags.govPermitCooldown[1] = 100;
  s.stats.gov = 50;
  assert.equal(maybeSpawnGovPermitPetition(s), null);
});

test('gov permit：已完成 tier1 后直接试 tier2', () => {
  const s = makePetState();
  s.flags.govPermittedTier = 1;
  s.stats.gov = 50;
  const pet = maybeSpawnGovPermitPetition(s);
  assert.ok(pet);
  assert.equal(pet.tier, 2);
});

test('gov permit：已有未结同类 petition 时跳过', () => {
  const s = makePetState();
  s.petitions.push({ kind: 'gov-permit', resolved: false });
  assert.equal(maybeSpawnGovPermitPetition(s), null);
});

test('accept gov permit 会创建对应 tier 的承诺', () => {
  const s = makePetState();
  const pet = maybeSpawnGovPermitPetition(s);
  const ok = acceptGovPermitPetition(s, pet);
  assert.equal(ok, true);
  assert.equal(s.promises.length, 1);
  assert.equal(s.promises[0].kind, 'gov-permit');
  assert.equal(s.promises[0].resources.money, 30);
});

test('accept temple permit 接到 gov petition 时应拒绝且不污染状态', () => {
  const s = makePetState();
  const pet = maybeSpawnGovPermitPetition(s);
  const snapshot = JSON.stringify({ stats: s.stats, flags: s.flags, promises: s.promises, pet });
  const ok = acceptTemplePermitPetition(s, pet);
  assert.equal(ok, false);
  assert.equal(s.promises.length, 0);
  assert.equal(JSON.stringify({ stats: s.stats, flags: s.flags, promises: s.promises, pet }), snapshot);
});

test('reject gov permit 会写 cooldown 且 gov -3', () => {
  const s = makePetState();
  const pet = maybeSpawnGovPermitPetition(s);
  const govBefore = s.stats.gov;
  const ok = rejectGovPermitPetition(s, pet);
  assert.equal(ok, true);
  assert.equal(s.flags.govPermitCooldown[1], s.day + 30);
  assert.equal(s.stats.gov, govBefore - 3);
});

test('reject temple permit 接到 gov petition 时应拒绝且不污染状态', () => {
  const s = makePetState();
  const pet = maybeSpawnGovPermitPetition(s);
  const snapshot = JSON.stringify({ stats: s.stats, flags: s.flags, petitions: s.petitions });
  const ok = rejectTemplePermitPetition(s, pet);
  assert.equal(ok, false);
  assert.equal(JSON.stringify({ stats: s.stats, flags: s.flags, petitions: s.petitions }), snapshot);
});

test('gov permit：spawn 会写 3 天过期窗口', () => {
  const s = makePetState({ day: 5 });
  const pet = maybeSpawnGovPermitPetition(s);
  assert.ok(pet);
  assert.equal(pet.expiresOnDay, 8);
});

test('permit petition 过期会扣对应声望并写 cooldown', () => {
  const s = makePetState();
  s.petitions.push({
    id: 'pet-001',
    kind: 'temple-permit',
    tier: 1,
    count: 1,
    sourceGate: 'W',
    bornAtDay: 2,
    expiresOnDay: 5,
    resolved: false,
    outcome: null,
  });
  s.petitions.push({
    id: 'pet-002',
    kind: 'gov-permit',
    tier: 1,
    count: 1,
    sourceGate: 'N',
    bornAtDay: 2,
    expiresOnDay: 5,
    resolved: false,
    outcome: null,
  });
  expireStalePetitions(s, null);
  assert.equal(s.petitions[0].resolved, true);
  assert.equal(s.petitions[0].outcome, 'expired');
  assert.equal(s.petitions[1].resolved, true);
  assert.equal(s.petitions[1].outcome, 'expired');
  assert.equal(s.stats.fame, 28);
  assert.equal(s.stats.gov, 28);
  assert.equal(s.flags.templeNegotiateCooldown[1], 35);
  assert.equal(s.flags.govPermitCooldown[1], 35);
});
