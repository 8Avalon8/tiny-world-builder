// test/noble_steward.test.js
// slice-4 端到端：法会 grand → 达官管事 spawn → 应允 → 承诺 → 三档结算
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  maybeSpawnTempleFestivalRequest, acceptTempleFestivalRequest,
  maybeSpawnNobleStewardPetition, acceptNobleStewardPetition,
} from '../../js/game/petitions.js';
import {
  createPromise, checkPromiseProgress, tickPromises,
  settlePromiseTier,
} from '../../js/game/promises.js';
import { PROMISE_BALANCE } from '../../js/game/balance-promises.js';
import { makeFakeState, makeBuiltInnPlot, registerBuildings } from './_helpers.js';

function nobleSPromiseDef() {
  const cfg = PROMISE_BALANCE.nobleSteward;
  return {
    kind: 'noble-steward-host',
    sourceGate: 'N',
    deadlineDays: cfg.deadlineDays,
    spatial: cfg.spatial,
    resources: cfg.resources,
    constraints: cfg.constraints,
    outcomes: cfg.outcomes,
  };
}

// 制造一块 NE 区 2×2 空地
function ne2x2Empty(id, ox, oy) {
  return {
    id, quadrant: 'NE',
    origin: { x: ox, y: oy }, size: { w: 2, h: 2 },
    cells: [{ x: ox, y: oy }, { x: ox + 1, y: oy }, { x: ox, y: oy + 1 }, { x: ox + 1, y: oy + 1 }],
    status: 'empty', building: null, project: null,
    mergedInto: null, mergeableWith: [],
    doorCell: { x: ox, y: oy - 1 },
  };
}

// ---- 触发链 ----

test('触发链：法会 grand → nobleStewardEligible → spawn 达官请愿', () => {
  const s = makeFakeState({
    templeRefurbished: true, day: 5,
    stats: { cloth: 10, money: 20, fireRisk: 30, guards: 2, fame: 18, morale: 50 },
    guardAssignments: { patrol: 1 },
  });
  s.plots = [makeBuiltInnPlot('1')];
  registerBuildings(s, s.plots);
  // 法会请愿 + accept + 全满足 → grand
  const tfPet = maybeSpawnTempleFestivalRequest(s);
  acceptTempleFestivalRequest(s, tfPet);
  s.day = 6;
  tickPromises(s, () => {}, null, () => {});
  assert.equal(s.nobleStewardEligible, true);
  // spawn 达官请愿
  const noPet = maybeSpawnNobleStewardPetition(s);
  assert.ok(noPet);
  assert.equal(noPet.kind, 'noble-steward');
});

// ---- 承诺进度 ----

test('checkPromiseProgress: slice-9 开局 NE 没有 2×2 empty，达官空间条件不满足', async () => {
  const m = await import('../../js/game/plots.js');
  const s = makeFakeState({
    stats: { money: 50, cloth: 10, fame: 30, guards: 2, morale: 60 },
    guardAssignments: { patrol: 1 },
  });
  s.plots = m.INITIAL_PLOTS;
  s.buildings = {
    'house-01': { id: 'house-01', kind: 'house', name: 'house' },
    'house-02': { id: 'house-02', kind: 'house', name: 'house' },
    'house-03': { id: 'house-03', kind: 'house', name: 'house' },
    'ciDengTemple': { id: 'ciDengTemple', kind: 'temple', name: 'temple' },
  };
  const p = createPromise(s, nobleSPromiseDef());
  const prog = checkPromiseProgress(s, p);
  // slice-9 开局 NE 仅 NE-08 是 starter empty，NE-01..04 都变成了 wasteland
  assert.equal(prog.spatial[0].satisfied, 0);
  assert.equal(prog.spatialOK, false);
  assert.equal(prog.resourcesOK, true);
  assert.equal(prog.constraintsOK, true);
  assert.equal(prog.complete, false);
});

test('checkPromiseProgress: 资源不够 → resourcesOK=false', () => {
  const s = makeFakeState({
    stats: { money: 5, cloth: 0, fame: 30, guards: 2, morale: 60 },
    guardAssignments: { patrol: 1 },
  });
  s.plots = [ne2x2Empty('NE-test', 11, 0)];
  const p = createPromise(s, nobleSPromiseDef());
  const prog = checkPromiseProgress(s, p);
  assert.equal(prog.resourcesOK, false);
});

test('checkPromiseProgress: 民心 < 50 → constraints miss', () => {
  const s = makeFakeState({
    stats: { money: 50, cloth: 10, fame: 30, guards: 2, morale: 30 },  // morale 低
    guardAssignments: { patrol: 1 },
  });
  s.plots = [ne2x2Empty('NE-test', 11, 0)];
  const p = createPromise(s, nobleSPromiseDef());
  const prog = checkPromiseProgress(s, p);
  assert.equal(prog.constraintsOK, false);
  const moraleC = prog.constraints.find(c => c.key === 'moraleMin');
  assert.equal(moraleC.ok, false);
});

// ---- 三档结算 ----

test('tickPromises: 全满足 → grand → fame +5 + nobleAccepted=true', () => {
  const s = makeFakeState({
    stats: { money: 50, cloth: 10, fame: 30, guards: 2, morale: 60 },
    guardAssignments: { patrol: 1 },
  });
  s.plots = [ne2x2Empty('NE-test', 11, 0)];
  createPromise(s, nobleSPromiseDef());
  tickPromises(s, () => {}, null, () => {});
  const p = s.promises[0];
  assert.equal(p.outcome, 'grand');
  assert.equal(s.nobleAccepted, true);
  assert.equal(s.stats.fame, 30 + 5);
  assert.equal(s.stats.money, 50 - 20);
  assert.equal(s.stats.cloth, 10 - 5);
});

test('tickPromises: 资源齐 + 约束差（民心 30）+ 期满 → basic → 仍 unlock mansion', () => {
  const s = makeFakeState({
    stats: { money: 50, cloth: 10, fame: 30, guards: 2, morale: 30 },
    guardAssignments: { patrol: 1 },
    day: 1,
  });
  s.plots = [ne2x2Empty('NE-test', 11, 0)];
  createPromise(s, nobleSPromiseDef());
  s.day = 1 + PROMISE_BALANCE.nobleSteward.deadlineDays;
  tickPromises(s, () => {}, null, () => {});
  const p = s.promises[0];
  assert.equal(p.outcome, 'basic');
  assert.equal(s.nobleAccepted, true);
  assert.equal(s.stats.fame, 30 - 2);
});

test('tickPromises: 资源未齐 + 期满 → cold → 重置 eligible，nobleAccepted 仍 false', () => {
  const s = makeFakeState({
    stats: { money: 5, cloth: 0, fame: 30, guards: 2, morale: 60 },
    guardAssignments: { patrol: 1 },
    nobleStewardEligible: true,
    day: 1,
  });
  s.plots = [ne2x2Empty('NE-test', 11, 0)];
  createPromise(s, nobleSPromiseDef());
  s.day = 1 + PROMISE_BALANCE.nobleSteward.deadlineDays;
  tickPromises(s, () => {}, null, () => {});
  const p = s.promises[0];
  assert.equal(p.outcome, 'cold');
  assert.equal(s.nobleAccepted, false);
  assert.equal(s.nobleStewardEligible, false);
  assert.equal(s.stats.fame, 30 - 5);
  // cold 不扣资源
  assert.equal(s.stats.money, 5);
  assert.equal(s.stats.cloth, 0);
});

// ---- e2e 主链：法会 grand → 达官 grand ----

test('e2e: 法会 grand → 次日达官 spawn → accept → 4 日内全满足 → grand → mansion 解锁', () => {
  const s = makeFakeState({
    templeRefurbished: true, day: 5,
    // cloth 15 = 法会扣 8 后剩 7 ≥ 达官 5；money 60 = 法会扣 10 + 给 30 后剩 80
    stats: { cloth: 15, money: 60, fireRisk: 30, guards: 2, fame: 18, morale: 60 },
    guardAssignments: { patrol: 1 },
  });
  s.plots = [makeBuiltInnPlot('1'), ne2x2Empty('NE-test', 11, 0)];
  registerBuildings(s, s.plots);

  // Step 1: 法会请愿
  const tfPet = maybeSpawnTempleFestivalRequest(s);
  assert.ok(tfPet);
  acceptTempleFestivalRequest(s, tfPet);

  // Step 2: 次日法会 grand 自动结算
  s.day = 6;
  tickPromises(s, () => {}, null, () => {});
  const tfPromise = s.promises.find(p => p.kind === 'temple-festival');
  assert.equal(tfPromise.outcome, 'grand');
  assert.equal(s.nobleStewardEligible, true);

  // Step 3: 达官请愿 spawn
  const noPet = maybeSpawnNobleStewardPetition(s);
  assert.ok(noPet);
  acceptNobleStewardPetition(s, noPet);
  const noPromise = s.promises.find(p => p.kind === 'noble-steward-host');
  assert.ok(noPromise);

  // Step 4: 次日达官承诺自动 grand 结算（资源 / 约束 / 空间都满足）
  s.day = 7;
  tickPromises(s, () => {}, null, () => {});
  assert.equal(noPromise.outcome, 'grand');
  assert.equal(s.nobleAccepted, true, 'mansion 解锁');
  // fame: 18 + 15 (法会 grand) + 5 (达官 grand) = 38
  assert.equal(s.stats.fame, 38);
});

// ---- 不重复 spawn ----

test('maybeSpawnNobleStewardPetition: 已有未结 host 承诺 → 不再 spawn 新 petition', () => {
  const s = makeFakeState({ nobleStewardEligible: true });
  s.promises.push({ id: 'pr-1', kind: 'noble-steward-host', resolved: false });
  const pet = maybeSpawnNobleStewardPetition(s);
  assert.equal(pet, null);
});
