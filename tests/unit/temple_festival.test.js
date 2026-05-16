// test/temple_festival.test.js
// slice-3 端到端：constraints 评估 + 三档结算 + 寺庙请愿触发链
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  maybeSpawnTempleFestivalRequest,
  acceptTempleFestivalRequest,
  rejectTempleFestivalRequest,
  expireStalePetitions,
} from '../../js/game/petitions.js';
import {
  createPromise, checkPromiseProgress, tickPromises,
  evaluateConstraint, settlePromiseTier,
} from '../../js/game/promises.js';
import { PROMISE_BALANCE } from '../../js/game/balance-promises.js';
import { makeFakeState, makeBuiltInnPlot, registerBuildings } from './_helpers.js';

function templePromiseDef() {
  const cfg = PROMISE_BALANCE.templeFestival;
  return {
    kind: 'temple-festival',
    sourceGate: 'W',
    deadlineDays: cfg.deadlineDays,
    spatial: cfg.spatial,
    resources: cfg.resources,
    constraints: cfg.constraints,
    outcomes: cfg.outcomes,
  };
}

// ---- evaluateConstraint ----

test('evaluateConstraint: fireRiskMax → 当前 ≤ 阈值 → ok', () => {
  const s = makeFakeState({ stats: { fireRisk: 30 } });
  const r = evaluateConstraint(s, 'fireRiskMax', 60);
  assert.equal(r.metric, 'fireRisk');
  assert.equal(r.op, 'max');
  assert.equal(r.current, 30);
  assert.equal(r.ok, true);
});

test('evaluateConstraint: fireRiskMax 超阈值 → miss', () => {
  const s = makeFakeState({ stats: { fireRisk: 80 } });
  const r = evaluateConstraint(s, 'fireRiskMax', 60);
  assert.equal(r.ok, false);
});

test('evaluateConstraint: freeGuardsMin = guards - assignments', () => {
  const s = makeFakeState({ stats: { guards: 3 }, guardAssignments: { patrol: 1, gate: 1 } });
  const r = evaluateConstraint(s, 'freeGuardsMin', 1);
  assert.equal(r.current, 1);
  assert.equal(r.ok, true);
});

test('evaluateConstraint: hostingCapacityMin = 客舍/香铺数', () => {
  const s = makeFakeState();
  s.plots = [makeBuiltInnPlot('1')];
  registerBuildings(s, s.plots);
  const r = evaluateConstraint(s, 'hostingCapacityMin', 1);
  assert.equal(r.current, 1);
  assert.equal(r.ok, true);
});

test('evaluateConstraint: 未知 metric → current=0', () => {
  const s = makeFakeState();
  const r = evaluateConstraint(s, 'banana', 5);
  assert.equal(r.current, 0);
  assert.equal(r.ok, false);
});

// ---- checkPromiseProgress with constraints ----

test('checkPromiseProgress: 资源 + 约束都满足 → complete=true', () => {
  const s = makeFakeState({
    stats: { cloth: 10, money: 20, fireRisk: 30, guards: 2 },
    guardAssignments: { patrol: 1 },
  });
  s.plots = [makeBuiltInnPlot('1')];
  registerBuildings(s, s.plots);
  const p = createPromise(s, templePromiseDef());
  const prog = checkPromiseProgress(s, p);
  assert.equal(prog.resourcesOK, true);
  assert.equal(prog.constraintsOK, true);
  assert.equal(prog.complete, true);
});

test('checkPromiseProgress: 资源齐但火险超阈值 → resourcesOK + 约束 miss', () => {
  const s = makeFakeState({
    stats: { cloth: 10, money: 20, fireRisk: 80, guards: 2 },
  });
  s.plots = [makeBuiltInnPlot('1')];
  registerBuildings(s, s.plots);
  const p = createPromise(s, templePromiseDef());
  const prog = checkPromiseProgress(s, p);
  assert.equal(prog.resourcesOK, true);
  assert.equal(prog.constraintsOK, false);
  assert.equal(prog.complete, false);
  // 找出 fireRiskMax 那条
  const fr = prog.constraints.find(c => c.key === 'fireRiskMax');
  assert.equal(fr.ok, false);
});

// ---- tickPromises 三档结算 ----

test('tickPromises: 全满足 → settle grand → fame +15 + nobleStewardEligible', () => {
  const s = makeFakeState({
    stats: { cloth: 10, money: 20, fireRisk: 30, guards: 2, fame: 18 },
    guardAssignments: { patrol: 1 },
  });
  s.plots = [makeBuiltInnPlot('1')];
  registerBuildings(s, s.plots);
  createPromise(s, templePromiseDef());
  tickPromises(s, () => {}, null, () => {});
  const p = s.promises[0];
  assert.equal(p.outcome, 'grand');
  assert.equal(p.resolved, true);
  assert.equal(s.stats.fame, 18 + 15);
  assert.equal(s.stats.cloth, 10 - 8);   // 资源已扣
  assert.equal(s.stats.money, 20 - 10 + 30);  // 扣 cloth/money 后加奖励
  assert.equal(s.lanternProgress, 1);
  assert.equal(s.nobleStewardEligible, true);
  assert.equal(s.lastTempleFestivalSettleDay, s.day);
});

test('tickPromises: 资源齐 + 约束差 + 期满 → basic', () => {
  const s = makeFakeState({
    stats: { cloth: 10, money: 20, fireRisk: 80, guards: 2, fame: 18 },
    day: 1,
  });
  // 没有客舍 → hostingCapacity = 0 → 约束 miss
  createPromise(s, templePromiseDef());
  // 推进到 deadline
  s.day = 1 + PROMISE_BALANCE.templeFestival.deadlineDays;
  tickPromises(s, () => {}, null, () => {});
  const p = s.promises[0];
  assert.equal(p.outcome, 'basic');
  assert.equal(s.stats.fame, 18 + 5);
  assert.equal(s.stats.cloth, 10 - 8);   // 资源仍扣（已凑齐）
  assert.equal(s.stats.money, 20 - 10 + 10);
});

test('tickPromises: 资源未齐 + 期满 → cold（资源不扣）', () => {
  const s = makeFakeState({
    stats: { cloth: 0, money: 5, fireRisk: 30, guards: 2, fame: 18, morale: 50 },
    day: 1,
  });
  createPromise(s, templePromiseDef());
  s.day = 1 + PROMISE_BALANCE.templeFestival.deadlineDays;
  tickPromises(s, () => {}, null, () => {});
  const p = s.promises[0];
  assert.equal(p.outcome, 'cold');
  assert.equal(s.stats.fame, 18 - 3);
  assert.equal(s.stats.morale, 50 - 5);
  assert.equal(s.stats.cloth, 0);   // 不扣
  assert.equal(s.stats.money, 5);   // 不扣
  assert.equal(s.lanternProgress, 0);
  assert.equal(s.nobleStewardEligible, false);
});

test('settlePromiseTier(grand) 直接调用：扣资源 + 应用 grand outcome', () => {
  const s = makeFakeState({ stats: { cloth: 10, money: 20, fame: 18 } });
  const p = createPromise(s, templePromiseDef());
  settlePromiseTier(s, p, 'grand', () => {}, () => {});
  assert.equal(p.outcome, 'grand');
  assert.equal(s.stats.cloth, 2);
  assert.equal(s.stats.fame, 33);
});

// ---- 寺庙请愿触发 ----

test('maybeSpawnTempleFestivalRequest: 未修缮 → 不 spawn', () => {
  const s = makeFakeState({ templeRefurbished: false });
  const pet = maybeSpawnTempleFestivalRequest(s);
  assert.equal(pet, null);
});

test('maybeSpawnTempleFestivalRequest: 已修缮 + 首场 → spawn', () => {
  const s = makeFakeState({ templeRefurbished: true, day: 5 });
  const pet = maybeSpawnTempleFestivalRequest(s);
  assert.ok(pet);
  assert.equal(pet.kind, 'temple-festival-request');
  assert.equal(pet.sourceGate, 'W');
  assert.equal(pet.expiresOnDay, 5 + 2);
});

test('maybeSpawnTempleFestivalRequest: 冷却期内 → 不 spawn', () => {
  const s = makeFakeState({ templeRefurbished: true, day: 8, lastTempleFestivalSettleDay: 5 });
  const pet = maybeSpawnTempleFestivalRequest(s);
  assert.equal(pet, null);  // 8-5=3 < 5
});

test('maybeSpawnTempleFestivalRequest: 冷却结束 → spawn', () => {
  const s = makeFakeState({ templeRefurbished: true, day: 11, lastTempleFestivalSettleDay: 5 });
  const pet = maybeSpawnTempleFestivalRequest(s);
  assert.ok(pet);
});

test('maybeSpawnTempleFestivalRequest: 已有未结请愿 → 不重复', () => {
  const s = makeFakeState({ templeRefurbished: true, day: 5 });
  s.petitions.push({ id: 'tf-1', kind: 'temple-festival-request', resolved: false, expiresOnDay: 99 });
  const pet = maybeSpawnTempleFestivalRequest(s);
  assert.equal(pet, null);
});

test('maybeSpawnTempleFestivalRequest: 已有未结承诺 → 不重复', () => {
  const s = makeFakeState({ templeRefurbished: true, day: 5 });
  createPromise(s, templePromiseDef());
  const pet = maybeSpawnTempleFestivalRequest(s);
  assert.equal(pet, null);
});

// ---- accept / reject / expire ----

test('acceptTempleFestivalRequest: 创建 temple-festival promise', () => {
  const s = makeFakeState({ templeRefurbished: true });
  const pet = { id: 'tf-1', kind: 'temple-festival-request', sourceGate: 'W', resolved: false };
  s.petitions.push(pet);
  const ok = acceptTempleFestivalRequest(s, pet);
  assert.equal(ok, true);
  assert.equal(pet.outcome, 'accepted');
  assert.equal(s.promises.length, 1);
  assert.equal(s.promises[0].kind, 'temple-festival');
  assert.ok(s.promises[0].outcomes);  // 三档结算 schema
});

test('rejectTempleFestivalRequest: 声望 -2', () => {
  const s = makeFakeState({ stats: { fame: 18 } });
  const pet = { id: 'tf-1', kind: 'temple-festival-request', resolved: false };
  rejectTempleFestivalRequest(s, pet);
  assert.equal(s.stats.fame, 16);
  assert.equal(pet.outcome, 'rejected');
});

test('expireStalePetitions: temple-festival-request 过期 → 声望 -2', () => {
  const s = makeFakeState({ day: 10, stats: { fame: 18 } });
  s.petitions.push({ id: 'tf-1', kind: 'temple-festival-request', sourceGate: 'W',
    expiresOnDay: 8, resolved: false });
  expireStalePetitions(s, () => {});
  assert.equal(s.petitions[0].resolved, true);
  assert.equal(s.petitions[0].outcome, 'expired');
  assert.equal(s.stats.fame, 16);
});

// ---- e2e ----

test('e2e: 寺修缮 → spawn 请愿 → accept → 5 日内全满足 → grand', () => {
  const s = makeFakeState({
    templeRefurbished: true,
    stats: { money: 50, cloth: 10, fame: 18, fireRisk: 30, guards: 2, morale: 50 },
    guardAssignments: { patrol: 1 },
    day: 5,
  });
  s.plots = [makeBuiltInnPlot('1')];
  registerBuildings(s, s.plots);

  const pet = maybeSpawnTempleFestivalRequest(s);
  assert.ok(pet);
  acceptTempleFestivalRequest(s, pet);

  // Day 6: 条件全满足 → 自动结算 grand
  s.day = 6;
  tickPromises(s, () => {}, null, () => {});
  const p = s.promises[0];
  assert.equal(p.outcome, 'grand');
  assert.equal(s.stats.fame, 18 + 15);
  assert.equal(s.lanternProgress, 1);
  assert.equal(s.nobleStewardEligible, true);
  assert.equal(s.lastTempleFestivalSettleDay, 6);
});
