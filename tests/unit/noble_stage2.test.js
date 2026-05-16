// test/noble_stage2.test.js
// slice-7: 达官线 stage-2 圈地催办
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  maybeSpawnNobleMansionUrgent,
  acceptNobleMansionUrgent,
  rejectNobleMansionUrgent,
} from '../../js/game/petitions.js';
import { tickPromises } from '../../js/game/promises.js';
import { findMatchingPlots, countSatisfied } from '../../js/game/spatial.js';
import { makeFakeState, makeBuiltMansionPlot, registerBuildings } from './_helpers.js';

// ---- spawn 触发条件 ----

test('maybeSpawnNobleMansionUrgent: nobleAccepted=false → 不 spawn', () => {
  const s = makeFakeState({ nobleAccepted: false });
  assert.equal(maybeSpawnNobleMansionUrgent(s), null);
});

test('maybeSpawnNobleMansionUrgent: 已建 mansion → 不 spawn', () => {
  const s = makeFakeState({ nobleAccepted: true, nobleAcceptedOnDay: 1, mansionBuiltOnDay: 5, day: 10 });
  assert.equal(maybeSpawnNobleMansionUrgent(s), null);
});

test('maybeSpawnNobleMansionUrgent: nobleAccepted 后不足 3 日 → 不 spawn', () => {
  const s = makeFakeState({ nobleAccepted: true, nobleAcceptedOnDay: 5, day: 7 });
  assert.equal(maybeSpawnNobleMansionUrgent(s), null);
});

test('maybeSpawnNobleMansionUrgent: nobleAccepted + 3 日 + 无 mansion → spawn', () => {
  const s = makeFakeState({ nobleAccepted: true, nobleAcceptedOnDay: 5, day: 8 });
  const pet = maybeSpawnNobleMansionUrgent(s);
  assert.ok(pet);
  assert.equal(pet.kind, 'noble-mansion-urgent-request');
});

test('maybeSpawnNobleMansionUrgent: 已 spawn 过则不再 spawn', () => {
  const s = makeFakeState({ nobleAccepted: true, nobleAcceptedOnDay: 5, day: 8 });
  const pet1 = maybeSpawnNobleMansionUrgent(s);
  assert.ok(pet1);
  const pet2 = maybeSpawnNobleMansionUrgent(s);
  assert.equal(pet2, null);
});

// ---- spatial mode 'building-or-built' ----

test("findMatchingPlots: 'building-or-built' 模式匹配 status='building' + 项目 buildingType=mansion", () => {
  const s = makeFakeState();
  s.plots = [{
    id: 'p1', quadrant: 'NE', status: 'building',
    project: { buildingType: 'mansion' },
    cells: [{ x: 11, y: 4 }], origin: { x: 11, y: 4 }, size: { w: 2, h: 2 },
  }];
  const matched = findMatchingPlots(s, { build: 'mansion', count: 1, in: 'NE' }, 'building-or-built');
  assert.equal(matched.length, 1);
});

test("findMatchingPlots: 'building-or-built' 模式也匹配已建", () => {
  const s = makeFakeState();
  const plot = makeBuiltMansionPlot('1');
  s.plots = [plot];
  registerBuildings(s, s.plots);
  const matched = findMatchingPlots(s, { build: 'mansion', count: 1, in: 'NE' }, 'building-or-built');
  assert.equal(matched.length, 1);
});

test("countSatisfied: spec.mode='building-or-built' 走对应分支", () => {
  const s = makeFakeState();
  const plot = makeBuiltMansionPlot('1');
  s.plots = [plot];
  registerBuildings(s, s.plots);
  const c = countSatisfied(s, { build: 'mansion', count: 1, in: 'NE', mode: 'building-or-built' });
  assert.equal(c, 1);
});

// ---- accept/reject + 三档结算 ----

test('rejectNobleMansionUrgent: 整线终止(nobleAccepted=false) + fame -8 + gov -5', () => {
  const s = makeFakeState({
    nobleAccepted: true, nobleAcceptedOnDay: 5, day: 8,
    stats: { fame: 30, gov: 50 },
  });
  const pet = maybeSpawnNobleMansionUrgent(s);
  rejectNobleMansionUrgent(s, pet);
  assert.equal(pet.outcome, 'rejected');
  assert.equal(s.nobleAccepted, false);
  assert.equal(s.nobleStewardEligible, false);
  assert.equal(s.stats.fame, 22);
  assert.equal(s.stats.gov, 45);
});

test('tickPromises: stage-2 grand(mansion 已建成,fame ≥ 20) → fame +8', () => {
  const s = makeFakeState({
    nobleAccepted: true, nobleAcceptedOnDay: 5, day: 8,
    stats: { fame: 30 },
  });
  const plot = makeBuiltMansionPlot('1');
  s.plots = [plot];
  registerBuildings(s, s.plots);
  const pet = maybeSpawnNobleMansionUrgent(s);
  acceptNobleMansionUrgent(s, pet);
  tickPromises(s, () => {}, null, () => {});
  const pr = s.promises[0];
  assert.equal(pr.outcome, 'grand');
  assert.equal(s.stats.fame, 38);  // 30 + 8
});

test('tickPromises: stage-2 cold(mansion 未建 + 期满) → resetNobleAccepted + fame -10', () => {
  const s = makeFakeState({
    nobleAccepted: true, nobleAcceptedOnDay: 5, day: 8,
    stats: { fame: 30 },
  });
  const pet = maybeSpawnNobleMansionUrgent(s);
  acceptNobleMansionUrgent(s, pet);
  s.day = 8 + 5;  // 期满
  tickPromises(s, () => {}, null, () => {});
  const pr = s.promises[0];
  assert.equal(pr.outcome, 'cold');
  assert.equal(s.nobleAccepted, false);
  assert.equal(s.nobleStewardEligible, false);
  assert.equal(s.stats.fame, 20);  // 30 - 10
});
