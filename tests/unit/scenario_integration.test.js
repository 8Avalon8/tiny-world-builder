// test/scenario_integration.test.js
// 跨 spec 集成场景：模拟玩家从开局到全 v2 内容跑通。
// 检查多 spec 系统在同一个 state 上协作时不会相互破坏（数值串扰、状态污染等）。
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  acceptNewcomerPetition,
  acceptPilgrimPetition,
  acceptNobleStewardPetition,
  acceptVendorStallFixed,
  tryCaravanWoodOrder,
} from '../../js/game/petitions.js';
import { tryAutoHire, applyDailyTick } from '../../js/game/citizens.js';
import {
  maybeSpawnFireEvent,
  maybeSpawnInspectionEvent,
  maybeSpawnRitualEvent,
  maybeSpawnLanternFestivalEvent,
  maybeSpawnBlackMarketEvent,
  resolveEventChoice,
} from '../../js/game/events.js';
import { makeFakeState, makeBuiltHousePlot, makeBuiltWeaverPlot, makeBuiltIncensePlot, makeBuiltInnPlot, makeBuiltMansionPlot, registerBuildings } from './_helpers.js';

test('integration: full loop survives 50 days without state corruption', () => {
  const s = makeFakeState({
    day: 1,
    stats: { money: 500, labor: 6, wood: 50, cloth: 0, guards: 2,
             population: 8, morale: 55, order: 52, fame: 18, gov: 42,
             prosperity: 0, fireRisk: 0, congestion: 0 },
  });
  // 已建：3 民宅 + 1 织棚 + 1 香铺 + 1 客舍
  s.plots = [
    makeBuiltHousePlot('1'), makeBuiltHousePlot('2'), makeBuiltHousePlot('3'),
    makeBuiltWeaverPlot('1'),
    makeBuiltIncensePlot('1'),
    makeBuiltInnPlot('1'),
  ];
  registerBuildings(s, s.plots);
  s.workersAssigned = 2;

  // 模拟 50 天，每天 applyDailyTick + 各种 spawn check
  for (let i = 0; i < 50; i++) {
    s.day++;
    applyDailyTick(s, () => {});
    // 不实际接受 petition / event，只验证 spawn 不抛异常
    maybeSpawnFireEvent(s);
    maybeSpawnInspectionEvent(s);
  }

  // 50 天后：cloth 应该累积 (50 * 2 = 100)
  assert.equal(s.stats.cloth, 100);
  // morale 应在 [0, 100]
  assert.ok(s.stats.morale >= 0 && s.stats.morale <= 100, `morale ${s.stats.morale} out of range`);
  // fireRisk 应等于 (workshops × 3) - 10 patrol = (1 weaver + 1 incense) × 3 - 10 = -4 → max(0) = 0
  assert.equal(s.stats.fireRisk, 0);
  // congestion 等于超员 × 2，无超员 (8 ≤ 12) → 0
  assert.equal(s.stats.congestion, 0);
});

test('integration: fame chain across temple + noble specs does not double-count', () => {
  const s = makeFakeState({
    stats: { fame: 18, gov: 42, money: 500, cloth: 30 },
    templeRefurbished: true,
  });
  s.plots = [
    makeBuiltHousePlot('1'),
    makeBuiltIncensePlot('1'),
  ];
  registerBuildings(s, s.plots);

  // 接 1 pilgrim warm → fame +6
  const pet1 = { id: 'p1', kind: 'pilgrim', count: 3, sourceGate: 'W',
    expiresOnDay: 99, resolved: false };
  s.petitions.push(pet1);
  acceptPilgrimPetition(s, pet1, { warm: true });
  assert.equal(s.stats.fame, 18 + 6);

  // slice-4: 接 noble → 创建承诺，不直接 unlock。fame 仍然不变。
  s.day = 1; s.lastStewardDay = 0; s.stats.fame = 25;
  s.nobleStewardEligible = true;
  const pet2 = { id: 'p2', kind: 'noble-steward', count: 1, sourceGate: 'N',
    expiresOnDay: 99, resolved: false };
  s.petitions.push(pet2);
  acceptNobleStewardPetition(s, pet2);
  assert.equal(s.stats.fame, 25);  // accept 不改 fame
  // slice-4: 仅创建承诺，nobleAccepted 由承诺结算决定
  assert.equal(s.nobleAccepted, false);
  assert.ok(s.promises.find(p => p.kind === 'noble-steward-host'));
});

test('integration: lantern festival success unlocks both fame burst + passive money', () => {
  const s = makeFakeState({
    stats: { fame: 60, money: 100, cloth: 40, guards: 3, prosperity: 0 },
    guardAssignments: { patrol: 1 },  // free = 2
    templeRefurbished: true,
  });
  // 先 spawn lantern festival
  const evt = maybeSpawnLanternFestivalEvent(s);
  assert.ok(evt, 'lantern festival should spawn');
  // 选 host
  const ok = resolveEventChoice(s, evt, 'host', () => {});
  assert.equal(ok, true);
  assert.equal(s.lanternFestivalDone, true);
  assert.equal(s.passiveMoneyBonus, 5);
  // fame +30
  assert.equal(s.stats.fame, 60 + 30);
});

test('integration: caravan + vendor-stall both raise prosperity without conflict', () => {
  const s = makeFakeState({
    stats: { money: 200, wood: 5, prosperity: 0, fame: 15 },
  });
  s.plots = [makeBuiltIncensePlot('1')];
  registerBuildings(s, s.plots);

  // 商队订木 3 次 → wood +3, money -15
  for (let i = 0; i < 3; i++) tryCaravanWoodOrder(s);
  assert.equal(s.stats.wood, 5 + 3);
  assert.equal(s.stats.money, 200 - 15);

  // vendor-stall fixed → prosperity +8
  const pet = { id: 'p1', kind: 'vendor-stall', sourceGate: 'E',
    expiresOnDay: 99, resolved: false };
  s.petitions.push(pet);
  acceptVendorStallFixed(s, pet);
  assert.equal(s.stats.prosperity, 8);
});

test('integration: morale clamping holds under multi-loss day', () => {
  const s = makeFakeState({
    stats: { population: 30, morale: 5, fame: 60 },
  });
  // 民宅容量 = 3 × 4 = 12, 实际 30 → overflow 18 → morale -18 → 应夹紧 0
  s.plots = [
    makeBuiltHousePlot('1'), makeBuiltHousePlot('2'), makeBuiltHousePlot('3'),
  ];
  registerBuildings(s, s.plots);
  applyDailyTick(s, () => {});
  assert.equal(s.stats.morale, 0);
  assert.ok(s.stats.morale >= 0);
});
