// test/repair.test.js
// slice-6: 受损建筑 → 修复请愿 spawn → accept → 三档结算 → status 回 built
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  maybeSpawnRepairRequest, acceptRepairRequest, rejectRepairRequest,
  expireStalePetitions,
} from '../../js/game/petitions.js';
import { tickPromises } from '../../js/game/promises.js';
import { expireStaleEvents } from '../../js/game/events.js';
import { isKind } from '../../js/game/citizens.js';
import { makeFakeState, makeBuiltWeaverPlot, registerBuildings } from './_helpers.js';

test('火灾过期 → plot.status=damaged + building 字段保留', () => {
  const s = makeFakeState({ day: 5, stats: { morale: 50 } });
  const plot = makeBuiltWeaverPlot('1');
  s.plots = [plot];
  registerBuildings(s, s.plots);
  s.events.push({
    id: 'e1', kind: 'fire', resolved: false, outcome: null, plotId: plot.id,
    expiresOnDay: 5, choices: [],
  });
  expireStaleEvents(s, () => {});
  assert.equal(plot.status, 'damaged');
  assert.ok(plot.building);
  assert.equal(plot.damagedOnDay, 5);
});

test('isKind 对 damaged plot 返回 false → 受损建筑停摆', () => {
  const s = makeFakeState();
  const plot = makeBuiltWeaverPlot('1');
  s.plots = [plot];
  registerBuildings(s, s.plots);
  assert.equal(isKind(s, plot, 'weaver'), true);
  plot.status = 'damaged';
  assert.equal(isKind(s, plot, 'weaver'), false);
});

test('maybeSpawnRepairRequest: 无 damaged plot → null', () => {
  const s = makeFakeState();
  s.plots = [makeBuiltWeaverPlot('1')];
  registerBuildings(s, s.plots);
  assert.equal(maybeSpawnRepairRequest(s), null);
});

test('maybeSpawnRepairRequest: 有 damaged plot → spawn 绑定 plotId', () => {
  const s = makeFakeState();
  const plot = makeBuiltWeaverPlot('1');
  plot.status = 'damaged';
  s.plots = [plot];
  registerBuildings(s, s.plots);
  const pet = maybeSpawnRepairRequest(s);
  assert.ok(pet);
  assert.equal(pet.kind, 'repair-request');
  assert.equal(pet.targetPlotId, plot.id);
});

test('maybeSpawnRepairRequest: 已有未结请愿 → 同 plot 不重复', () => {
  const s = makeFakeState();
  const plot = makeBuiltWeaverPlot('1');
  plot.status = 'damaged';
  s.plots = [plot];
  registerBuildings(s, s.plots);
  const pet1 = maybeSpawnRepairRequest(s);
  assert.ok(pet1);
  const pet2 = maybeSpawnRepairRequest(s);
  assert.equal(pet2, null);
});

test('acceptRepairRequest → 创建 repair-building 承诺,绑 plotId', () => {
  const s = makeFakeState();
  const plot = makeBuiltWeaverPlot('1');
  plot.status = 'damaged';
  s.plots = [plot];
  const pet = maybeSpawnRepairRequest(s);
  acceptRepairRequest(s, pet);
  const pr = s.promises.find(p => p.kind === 'repair-building');
  assert.ok(pr);
  assert.equal(pr.targetPlotId, plot.id);
});

test('tickPromises: 修复 grand → plot.status=built + 火险 -10 + 民心 +3', () => {
  const s = makeFakeState({ stats: { wood: 10, money: 20, fireRisk: 30, morale: 50 } });
  const plot = makeBuiltWeaverPlot('1');
  plot.status = 'damaged';
  s.plots = [plot];
  const pet = maybeSpawnRepairRequest(s);
  acceptRepairRequest(s, pet);
  tickPromises(s, () => {}, null, () => {});
  const pr = s.promises[0];
  assert.equal(pr.outcome, 'grand');
  assert.equal(plot.status, 'built');
  assert.equal(s.stats.fireRisk, 20);  // 30 - 10
  assert.equal(s.stats.morale, 53);
  assert.equal(s.stats.wood, 6);
  assert.equal(s.stats.money, 12);
});

test('tickPromises: 修复 cold(资源不齐 + 期满) → plot 仍 damaged', () => {
  const s = makeFakeState({ stats: { wood: 1, money: 1, morale: 50 }, day: 1 });
  const plot = makeBuiltWeaverPlot('1');
  plot.status = 'damaged';
  s.plots = [plot];
  const pet = maybeSpawnRepairRequest(s);
  acceptRepairRequest(s, pet);
  s.day = 1 + 4;  // 期满
  tickPromises(s, () => {}, null, () => {});
  const pr = s.promises[0];
  assert.equal(pr.outcome, 'cold');
  assert.equal(plot.status, 'damaged');  // cold 不修复
  assert.equal(s.stats.morale, 45);
});

test('expireStalePetitions: repair-request 过期 → 民心 -2', () => {
  const s = makeFakeState({ stats: { morale: 50 }, day: 1 });
  const plot = makeBuiltWeaverPlot('1');
  plot.status = 'damaged';
  s.plots = [plot];
  const pet = maybeSpawnRepairRequest(s);
  s.day = pet.expiresOnDay;
  expireStalePetitions(s, () => {});
  assert.equal(pet.outcome, 'expired');
  assert.equal(s.stats.morale, 48);
});

test('rejectRepairRequest → 民心 -2', () => {
  const s = makeFakeState({ stats: { morale: 50 } });
  const plot = makeBuiltWeaverPlot('1');
  plot.status = 'damaged';
  s.plots = [plot];
  const pet = maybeSpawnRepairRequest(s);
  rejectRepairRequest(s, pet);
  assert.equal(pet.outcome, 'rejected');
  assert.equal(s.stats.morale, 48);
});
