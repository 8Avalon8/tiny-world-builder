// test/citizens.test.js
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SPEC3_BALANCE } from '../../js/game/balance.js';
import { tryAutoHire, applyDailyTick, getHousingCapacity, getHousedPopulation, dailyLaborCap } from '../../js/game/citizens.js';
import { makeFakeState, makeBuiltHousePlot, makeBuiltWeaverPlot, makeBuiltIncensePlot, registerBuildings } from './_helpers.js';

test('getHousingCapacity: 3 houses × 4 = 12', () => {
  const s = makeFakeState();
  s.plots = [makeBuiltHousePlot('1'), makeBuiltHousePlot('2'), makeBuiltHousePlot('3')];
  registerBuildings(s, s.plots);
  assert.equal(getHousingCapacity(s), 12);
});

test('getHousedPopulation: caps at capacity', () => {
  const s = makeFakeState({ stats: { population: 20 } });
  s.plots = [makeBuiltHousePlot('1'), makeBuiltHousePlot('2'), makeBuiltHousePlot('3')];
  registerBuildings(s, s.plots);
  assert.equal(getHousedPopulation(s), 12);
});

test('dailyLaborCap: low population stays at base 6', () => {
  const s = makeFakeState({ stats: { population: 8 } });
  s.plots = [makeBuiltHousePlot('1'), makeBuiltHousePlot('2'), makeBuiltHousePlot('3')];
  registerBuildings(s, s.plots);
  assert.equal(dailyLaborCap(s), 6);
});

test('dailyLaborCap: 14 housed pop → 7', () => {
  const s = makeFakeState({ stats: { population: 14 } });
  // need 4 houses (16 cap) so 14 are housed
  s.plots = [makeBuiltHousePlot('1'), makeBuiltHousePlot('2'), makeBuiltHousePlot('3'), makeBuiltHousePlot('4')];
  registerBuildings(s, s.plots);
  assert.equal(dailyLaborCap(s), 7);
});

test('dailyLaborCap: capped at 12', () => {
  const s = makeFakeState({ stats: { population: 100 } });
  // 30 houses → capacity 120, housed = 100, /2 = 50, capped to 12
  s.plots = [];
  for (let i = 0; i < 30; i++) s.plots.push(makeBuiltHousePlot(String(i)));
  registerBuildings(s, s.plots);
  assert.equal(dailyLaborCap(s), 12);
});

test('dailyLaborCap: overflow population does not feed labor', () => {
  // 1 house (cap 4), pop 20 → housed = 4 → cap stays at base 6
  const s = makeFakeState({ stats: { population: 20 } });
  s.plots = [makeBuiltHousePlot('1')];
  registerBuildings(s, s.plots);
  assert.equal(dailyLaborCap(s), 6);
});

test('tryAutoHire: no weavers → workersAssigned = 0', () => {
  const s = makeFakeState();
  s.plots = [makeBuiltHousePlot('1'), makeBuiltHousePlot('2')];
  registerBuildings(s, s.plots);
  tryAutoHire(s);
  assert.equal(s.workersAssigned, 0);
});

test('tryAutoHire: 1 weaver + plenty pop → workersAssigned = maxWorkers', () => {
  const s = makeFakeState({ stats: { population: 20 } });
  s.plots = [makeBuiltWeaverPlot('1')];
  registerBuildings(s, s.plots);
  tryAutoHire(s);
  assert.equal(s.workersAssigned, SPEC3_BALANCE.weaver.maxWorkers);
});

test('tryAutoHire: weavers more than population → workersAssigned = population', () => {
  const s = makeFakeState({ stats: { population: 1 } });
  s.plots = [makeBuiltWeaverPlot('1'), makeBuiltWeaverPlot('2')];
  registerBuildings(s, s.plots);
  tryAutoHire(s);
  assert.equal(s.workersAssigned, 1);
});

test('tryAutoHire: 2 weavers + plenty pop → workersAssigned = 2 × maxWorkers', () => {
  const s = makeFakeState({ stats: { population: 20 } });
  s.plots = [makeBuiltWeaverPlot('1'), makeBuiltWeaverPlot('2')];
  registerBuildings(s, s.plots);
  tryAutoHire(s);
  assert.equal(s.workersAssigned, 2 * SPEC3_BALANCE.weaver.maxWorkers);
});

test('tryAutoHire: returns delta from previous assignment', () => {
  const s = makeFakeState({ stats: { population: 20 }, workersAssigned: 0 });
  s.plots = [makeBuiltWeaverPlot('1')];
  registerBuildings(s, s.plots);
  const delta = tryAutoHire(s);
  assert.equal(delta, 2);
  assert.equal(s.workersAssigned, 2);
});

test('tryAutoHire: returns 0 when no change', () => {
  const s = makeFakeState({ stats: { population: 20 }, workersAssigned: 2 });
  s.plots = [makeBuiltWeaverPlot('1')];
  registerBuildings(s, s.plots);
  const delta = tryAutoHire(s);
  assert.equal(delta, 0);
});

test('applyDailyTick: 2 unskilled workers → cloth += 2 (1×2)', () => {
  const s = makeFakeState({ workersAssigned: 2, skilledResidents: 0 });
  s.plots = [makeBuiltWeaverPlot('1'), makeBuiltHousePlot('1'), makeBuiltHousePlot('2'), makeBuiltHousePlot('3')];
  registerBuildings(s, s.plots);
  applyDailyTick(s, () => {});
  assert.equal(s.stats.cloth, 2);  // 2 × 1
});

test('applyDailyTick: 2 skilled workers → cloth += 3 (2×1.5)', () => {
  const s = makeFakeState({ workersAssigned: 2, skilledResidents: 2 });
  s.plots = [makeBuiltWeaverPlot('1'), makeBuiltHousePlot('1'), makeBuiltHousePlot('2'), makeBuiltHousePlot('3')];
  registerBuildings(s, s.plots);
  applyDailyTick(s, () => {});
  assert.equal(s.stats.cloth, 3);  // 2 × 1.5
});

test('applyDailyTick: mixed skilled/unskilled', () => {
  const s = makeFakeState({ workersAssigned: 4, skilledResidents: 2 });
  s.plots = [makeBuiltWeaverPlot('1'), makeBuiltWeaverPlot('2'),
             makeBuiltHousePlot('1'), makeBuiltHousePlot('2'), makeBuiltHousePlot('3')];
  registerBuildings(s, s.plots);
  applyDailyTick(s, () => {});
  // 2 skilled × 1.5 + 2 unskilled × 1 = 3 + 2 = 5
  assert.equal(s.stats.cloth, 5);
});

test('applyDailyTick: housing overflow → congestion + morale -1/overflow', () => {
  const s = makeFakeState({ stats: { population: 13, morale: 55 } });
  s.plots = [makeBuiltHousePlot('1'), makeBuiltHousePlot('2'), makeBuiltHousePlot('3')];
  registerBuildings(s, s.plots);
  applyDailyTick(s, () => {});
  // capacity = 3 × 4 = 12, overflow = 1
  assert.equal(s.stats.congestion, 1 * SPEC3_BALANCE.house.overflowCrowdingDelta);
  assert.equal(s.stats.morale, 55 + 1 * SPEC3_BALANCE.house.overflowMoraleDelta);
});

test('applyDailyTick: no overflow → congestion = 0', () => {
  const s = makeFakeState({ stats: { population: 8 } });
  s.plots = [makeBuiltHousePlot('1'), makeBuiltHousePlot('2'), makeBuiltHousePlot('3')];
  registerBuildings(s, s.plots);
  applyDailyTick(s, () => {});
  assert.equal(s.stats.congestion, 0);
});

test('applyDailyTick: fire risk = workshops × 3 - 10 patrol', () => {
  const s = makeFakeState();
  s.plots = [makeBuiltWeaverPlot('1'), makeBuiltWeaverPlot('2'), makeBuiltIncensePlot('1'), makeBuiltIncensePlot('2'), makeBuiltHousePlot('1')];
  registerBuildings(s, s.plots);
  applyDailyTick(s, () => {});
  // 4 workshops × 3 - 10 = 2
  assert.equal(s.stats.fireRisk, 2);
});

test('applyDailyTick: fire risk floored at 0', () => {
  const s = makeFakeState();
  s.plots = [makeBuiltWeaverPlot('1'), makeBuiltHousePlot('1')];
  registerBuildings(s, s.plots);
  applyDailyTick(s, () => {});
  // 1 workshop × 3 - 10 = -7 → 0
  assert.equal(s.stats.fireRisk, 0);
});

test('applyDailyTick: HUD unlock fireRisk on first > 0', () => {
  const s = makeFakeState();
  s.plots = [makeBuiltWeaverPlot('1'), makeBuiltWeaverPlot('2'), makeBuiltIncensePlot('1'), makeBuiltIncensePlot('2'), makeBuiltHousePlot('1')];
  registerBuildings(s, s.plots);
  assert.equal(s.hudUnlocked.fireRisk, false);
  applyDailyTick(s, () => {});
  assert.equal(s.hudUnlocked.fireRisk, true);
});

test('applyDailyTick: HUD unlock congestion on first > 0', () => {
  const s = makeFakeState({ stats: { population: 13 } });
  s.plots = [makeBuiltHousePlot('1'), makeBuiltHousePlot('2'), makeBuiltHousePlot('3')];
  registerBuildings(s, s.plots);
  assert.equal(s.hudUnlocked.congestion, false);
  applyDailyTick(s, () => {});
  assert.equal(s.hudUnlocked.congestion, true);
});

test('applyDailyTick: morale clamped to [0, 100]', () => {
  const s = makeFakeState({ stats: { population: 200, morale: 5 } });
  s.plots = [makeBuiltHousePlot('1')];
  registerBuildings(s, s.plots);
  applyDailyTick(s, () => {});
  assert.ok(s.stats.morale >= 0);
});
