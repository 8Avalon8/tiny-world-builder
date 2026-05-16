// test/scenario_aftermath.test.js
// slice-6 端到端:大事件留痕 — 火灾→受损→修复;上元节→灯笼装饰;丑闻→封条
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  maybeSpawnRepairRequest, acceptRepairRequest,
} from '../../js/game/petitions.js';
import {
  expireStaleEvents, resolveEventChoice,
  maybeSpawnLanternFestivalEvent, maybeSpawnScandalEvent,
} from '../../js/game/events.js';
import { tickPromises } from '../../js/game/promises.js';
import { isKind } from '../../js/game/citizens.js';
import { makeFakeState, makeBuiltWeaverPlot, registerBuildings } from './_helpers.js';

test('e2e: 火灾受损 → 自动修复请愿 → 接 → 完成 → 建筑回 built + 重新参与产出', () => {
  const s = makeFakeState({
    stats: { wood: 10, money: 20, fireRisk: 30, morale: 50 },
  });
  const plot = makeBuiltWeaverPlot('alpha');
  s.plots = [plot];
  registerBuildings(s, s.plots);

  // 模拟火灾过期
  s.events.push({
    id: 'e1', kind: 'fire', resolved: false, outcome: null, plotId: plot.id,
    expiresOnDay: s.day, choices: [],
  });
  expireStaleEvents(s, () => {});
  assert.equal(plot.status, 'damaged');
  assert.equal(isKind(s, plot, 'weaver'), false);  // 停摆

  // 自动 spawn 修复请愿
  const pet = maybeSpawnRepairRequest(s);
  assert.ok(pet);
  assert.equal(pet.targetPlotId, plot.id);

  // 接 + 完成
  acceptRepairRequest(s, pet);
  tickPromises(s, () => {}, null, () => {});
  assert.equal(plot.status, 'built');
  assert.equal(isKind(s, plot, 'weaver'), true);  // 恢复产出
});

test('e2e: 上元大法会 host 成功 → lanternDecorUntilDay = day + 7', () => {
  const s = makeFakeState({
    day: 30,
    stats: { fame: 60, money: 100, cloth: 40, guards: 3 },
    guardAssignments: { patrol: 1 },
    templeRefurbished: true,
  });
  const evt = maybeSpawnLanternFestivalEvent(s);
  assert.ok(evt);
  resolveEventChoice(s, evt, 'host', () => {});
  assert.equal(s.lanternFestivalDone, true);
  assert.equal(s.lanternDecorUntilDay, 37);
});

test('e2e: 丑闻 protect → 府邸封条 5 日(scandalSealUntilDay = day + 5)', () => {
  const s = makeFakeState({
    day: 100,
    stats: { fame: 30, gov: 50, morale: 50, money: 100 },
    nobleAccepted: true,
    mansionBuiltOnDay: 80,
  });
  const evt = maybeSpawnScandalEvent(s);
  assert.ok(evt);
  resolveEventChoice(s, evt, 'protect', () => {});
  assert.equal(s.scandalDone, true);
  assert.equal(s.scandalSealUntilDay, 105);
});

test('e2e: 丑闻 surrender → 不贴封条', () => {
  const s = makeFakeState({
    day: 100,
    stats: { fame: 30, gov: 50, morale: 50, money: 100 },
    nobleAccepted: true,
    mansionBuiltOnDay: 80,
  });
  const evt = maybeSpawnScandalEvent(s);
  resolveEventChoice(s, evt, 'surrender', () => {});
  assert.ok(!s.scandalSealUntilDay);  // 据实禀报不贴封条(undefined 或 0)
});

test('e2e: 丑闻 sneak → 贴封条', () => {
  const s = makeFakeState({
    day: 100,
    stats: { fame: 30, gov: 50, morale: 50, money: 100 },
    nobleAccepted: true,
    mansionBuiltOnDay: 80,
  });
  const evt = maybeSpawnScandalEvent(s);
  resolveEventChoice(s, evt, 'sneak', () => {});
  assert.equal(s.scandalSealUntilDay, 105);  // 私下放走也贴封条
});
