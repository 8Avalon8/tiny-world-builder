// test/risk_petitions.test.js
// slice-5: 防御承诺(消防演练 / 临时巡夜) spawn / accept / 三档结算
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  maybeSpawnFireDrillRequest, acceptFireDrillRequest, rejectFireDrillRequest,
  maybeSpawnNightPatrolRequest, acceptNightPatrolRequest, rejectNightPatrolRequest,
  expireStalePetitions,
} from '../../js/game/petitions.js';
import { tickPromises, checkPromiseProgress } from '../../js/game/promises.js';
import { RISK_BALANCE } from '../../js/game/balance-risk.js';
import { makeFakeState } from './_helpers.js';

// ---- spawn 触发条件 ----

test('maybeSpawnFireDrillRequest: 火险 < danger → 不 spawn', () => {
  const s = makeFakeState({ stats: { fireRisk: RISK_BALANCE.fire.danger - 1 } });
  const pet = maybeSpawnFireDrillRequest(s);
  assert.equal(pet, null);
});

test('maybeSpawnFireDrillRequest: 火险 ≥ danger → spawn', () => {
  const s = makeFakeState({ stats: { fireRisk: RISK_BALANCE.fire.danger } });
  const pet = maybeSpawnFireDrillRequest(s);
  assert.ok(pet);
  assert.equal(pet.kind, 'fire-drill-request');
});

test('maybeSpawnFireDrillRequest: 已有未结请愿 → 不重复 spawn', () => {
  const s = makeFakeState({ stats: { fireRisk: 60 } });
  s.petitions.push({ id: 'p1', kind: 'fire-drill-request', resolved: false });
  const pet = maybeSpawnFireDrillRequest(s);
  assert.equal(pet, null);
});

test('maybeSpawnFireDrillRequest: 已有未结防御承诺 → 不重复 spawn', () => {
  const s = makeFakeState({ stats: { fireRisk: 60 } });
  s.promises.push({ id: 'pr1', kind: 'fire-drill', resolved: false });
  const pet = maybeSpawnFireDrillRequest(s);
  assert.equal(pet, null);
});

test('maybeSpawnNightPatrolRequest: 拥堵 ≥ danger → spawn', () => {
  const s = makeFakeState({ stats: { congestion: RISK_BALANCE.stampede.danger } });
  const pet = maybeSpawnNightPatrolRequest(s);
  assert.ok(pet);
  assert.equal(pet.kind, 'night-patrol-request');
});

// ---- accept → promise + 三档结算 ----

test('acceptFireDrillRequest → 创建 fire-drill 承诺', () => {
  const s = makeFakeState({ stats: { fireRisk: 60 } });
  const pet = maybeSpawnFireDrillRequest(s);
  acceptFireDrillRequest(s, pet);
  assert.equal(pet.resolved, true);
  const pr = s.promises.find(p => p.kind === 'fire-drill');
  assert.ok(pr);
  assert.equal(pr.constraints.freeGuardsMin, 1);
});

test('tickPromises: 火险演练全满足 → grand → fireRisk -25 + 民心 +2', () => {
  const s = makeFakeState({
    stats: { fireRisk: 60, money: 50, wood: 10, morale: 50, guards: 2 },
    guardAssignments: { patrol: 1 },  // free = 1, ≥ 1
  });
  const pet = maybeSpawnFireDrillRequest(s);
  acceptFireDrillRequest(s, pet);
  tickPromises(s, () => {}, null, () => {});
  const p = s.promises[0];
  assert.equal(p.outcome, 'grand');
  assert.equal(s.stats.fireRisk, 60 - 25);  // 35
  assert.equal(s.stats.morale, 50 + 2);
  assert.equal(s.stats.wood, 10 - 2);
  assert.equal(s.stats.money, 50 - 5);
});

test('tickPromises: 资源齐 + 巡夜不足 + 期满 → basic → 仍扣资源,fireRisk -10', () => {
  const s = makeFakeState({
    stats: { fireRisk: 60, money: 50, wood: 10, guards: 1 },
    guardAssignments: { patrol: 1 },  // free = 0, < 1
    day: 1,
  });
  const pet = maybeSpawnFireDrillRequest(s);
  acceptFireDrillRequest(s, pet);
  s.day = 1 + 3;  // 过期
  tickPromises(s, () => {}, null, () => {});
  const p = s.promises[0];
  assert.equal(p.outcome, 'basic');
  assert.equal(s.stats.fireRisk, 60 - 10);  // 50
  assert.equal(s.stats.wood, 10 - 2);  // basic 也扣资源
});

test('tickPromises: 资源不齐 + 期满 → cold → 民心 -2,不扣资源', () => {
  const s = makeFakeState({
    stats: { fireRisk: 60, money: 2, wood: 1, morale: 50, guards: 1 },
    guardAssignments: { patrol: 1 },
    day: 1,
  });
  const pet = maybeSpawnFireDrillRequest(s);
  acceptFireDrillRequest(s, pet);
  s.day = 1 + 3;
  tickPromises(s, () => {}, null, () => {});
  const p = s.promises[0];
  assert.equal(p.outcome, 'cold');
  assert.equal(s.stats.morale, 50 - 2);
  assert.equal(s.stats.wood, 1);
  assert.equal(s.stats.money, 2);
  assert.equal(s.stats.fireRisk, 60);  // cold 不扣火险
});

test('rejectFireDrillRequest → 民心 -1', () => {
  const s = makeFakeState({ stats: { fireRisk: 60, morale: 50 } });
  const pet = maybeSpawnFireDrillRequest(s);
  rejectFireDrillRequest(s, pet);
  assert.equal(pet.outcome, 'rejected');
  assert.equal(s.stats.morale, 49);
});

test('expireStalePetitions: fire-drill 请愿过期 → 民心 -1', () => {
  const s = makeFakeState({ stats: { fireRisk: 60, morale: 50 }, day: 1 });
  const pet = maybeSpawnFireDrillRequest(s);
  s.day = pet.expiresOnDay;
  expireStalePetitions(s, () => {});
  assert.equal(pet.resolved, true);
  assert.equal(pet.outcome, 'expired');
  assert.equal(s.stats.morale, 49);
});

// ---- 拥堵巡夜 ----

test('tickPromises: 巡夜全满足 → grand → 拥堵 -20', () => {
  const s = makeFakeState({
    stats: { congestion: 35, money: 50, morale: 50, guards: 3 },
    guardAssignments: { patrol: 1 },  // free = 2, ≥ 2
  });
  const pet = maybeSpawnNightPatrolRequest(s);
  acceptNightPatrolRequest(s, pet);
  tickPromises(s, () => {}, null, () => {});
  const p = s.promises[0];
  assert.equal(p.outcome, 'grand');
  assert.equal(s.stats.congestion, 35 - 20);  // 15
  assert.equal(s.stats.morale, 52);
});
