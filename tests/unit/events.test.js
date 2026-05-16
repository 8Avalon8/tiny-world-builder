// test/events.test.js
// Spec #4 单测：spawn 条件 / 资源检查 / choice 应用 / 过期。
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SPEC4_BALANCE } from '../../js/game/balance-events.js';
import {
  maybeSpawnFireEvent,
  maybeSpawnStampedeEvent,
  maybeSpawnInspectionEvent,
  expireStaleEvents,
  checkEventResources,
  resolveEventChoice,
} from '../../js/game/events.js';
import {
  makeFakeState,
  makeBuiltWeaverPlot,
  makeBuiltIncensePlot,
  makeBuiltHousePlot,
  registerBuildings,
} from './_helpers.js';

// ---------- maybeSpawnFireEvent ----------

test('maybeSpawnFireEvent skips when below fireRiskThreshold', () => {
  const s = makeFakeState({ day: 10, lastFireDay: 0, stats: { fireRisk: 10 } });
  s.plots = [makeBuiltWeaverPlot('1')];
  registerBuildings(s, s.plots);
  const evt = maybeSpawnFireEvent(s);
  assert.equal(evt, null);
  assert.equal(s.events.length, 0);
});

test('maybeSpawnFireEvent skips when within intervalDays cooldown', () => {
  const s = makeFakeState({ day: 3, lastFireDay: 1, stats: { fireRisk: 50 } });
  // intervalDays = 4, 3 - 1 = 2 < 4 → skip
  s.plots = [makeBuiltWeaverPlot('1')];
  registerBuildings(s, s.plots);
  const evt = maybeSpawnFireEvent(s);
  assert.equal(evt, null);
});

test('maybeSpawnFireEvent spawns when threshold + cooldown elapsed', () => {
  const s = makeFakeState({ day: 5, lastFireDay: 0, stats: { fireRisk: 60 } });
  s.plots = [makeBuiltWeaverPlot('1')];
  registerBuildings(s, s.plots);
  const evt = maybeSpawnFireEvent(s);
  assert.ok(evt);
  assert.equal(evt.kind, 'fire');
  assert.equal(evt.bornAtDay, 5);
  assert.equal(evt.expiresOnDay, 5 + SPEC4_BALANCE.fire.expireDays);
  assert.equal(evt.resolved, false);
  assert.equal(s.lastFireDay, 5);
  assert.equal(s.events.length, 1);
  assert.ok(evt.plotId);
  assert.equal(evt.choices.length, 3);
});

test('maybeSpawnFireEvent skips when no weaver/incense plot exists', () => {
  const s = makeFakeState({ day: 5, lastFireDay: 0, stats: { fireRisk: 60 } });
  s.plots = [makeBuiltHousePlot('1')];  // only houses, no weaver/incense
  registerBuildings(s, s.plots);
  const evt = maybeSpawnFireEvent(s);
  assert.equal(evt, null);
  assert.equal(s.events.length, 0);
});

test('maybeSpawnFireEvent picks incense plot too', () => {
  const s = makeFakeState({ day: 5, lastFireDay: 0, stats: { fireRisk: 60 } });
  s.plots = [makeBuiltIncensePlot('1')];
  registerBuildings(s, s.plots);
  const evt = maybeSpawnFireEvent(s);
  assert.ok(evt);
  assert.equal(evt.plotId, s.plots[0].id);
});

// ---------- maybeSpawnStampedeEvent ----------

test('maybeSpawnStampedeEvent skips when below congestionThreshold', () => {
  const s = makeFakeState({ day: 10, lastStampedeDay: 0, stats: { congestion: 10 } });
  s.plots = [makeBuiltHousePlot('1')];
  registerBuildings(s, s.plots);
  const evt = maybeSpawnStampedeEvent(s);
  assert.equal(evt, null);
});

test('maybeSpawnStampedeEvent spawns when threshold + cooldown elapsed', () => {
  const s = makeFakeState({ day: 6, lastStampedeDay: 0, stats: { congestion: 40 } });
  s.plots = [makeBuiltHousePlot('1')];
  registerBuildings(s, s.plots);
  const evt = maybeSpawnStampedeEvent(s);
  assert.ok(evt);
  assert.equal(evt.kind, 'stampede');
  assert.equal(s.lastStampedeDay, 6);
  assert.equal(evt.expiresOnDay, 6 + SPEC4_BALANCE.stampede.expireDays);
});

// ---------- maybeSpawnInspectionEvent ----------

test('maybeSpawnInspectionEvent skips when within cooldown', () => {
  const s = makeFakeState({ day: 5, lastInspectionDay: 1 });
  // intervalDays = 7, 5 - 1 = 4 < 7
  const evt = maybeSpawnInspectionEvent(s);
  assert.equal(evt, null);
});

test('maybeSpawnInspectionEvent spawns when cooldown elapsed (no threshold)', () => {
  const s = makeFakeState({ day: 8, lastInspectionDay: 1 });
  // 8 - 1 = 7 >= 7
  const evt = maybeSpawnInspectionEvent(s);
  assert.ok(evt);
  assert.equal(evt.kind, 'inspection');
  assert.equal(evt.plotId, undefined);  // inspection has no plot
  assert.equal(s.lastInspectionDay, 8);
  assert.equal(evt.expiresOnDay, 8 + SPEC4_BALANCE.inspection.expireDays);
});

// ---------- expireStaleEvents ----------

test('expireStaleEvents fire: destroys plot and -10 morale', () => {
  const s = makeFakeState({ day: 10 });
  s.plots = [makeBuiltWeaverPlot('1')];
  registerBuildings(s, s.plots);
  const plot = s.plots[0];
  s.events = [{
    id: 'evt-001', kind: 'fire',
    bornAtDay: 8, expiresOnDay: 9,
    resolved: false, outcome: null, plotId: plot.id,
    choices: [],
  }];
  const beforeMorale = s.stats.morale;
  expireStaleEvents(s, () => {});
  assert.equal(s.events[0].resolved, true);
  assert.equal(s.events[0].outcome, 'expired');
  // slice-6: 受损不清空,改 status='damaged' + 保留 building 字段供修复用
  assert.equal(plot.status, 'damaged');
  assert.ok(plot.building);
  assert.equal(s.stats.morale, beforeMorale + SPEC4_BALANCE.fire.expireMoraleDelta);
});

test('expireStaleEvents stampede: -8 morale, -3 fame', () => {
  const s = makeFakeState({ day: 10 });
  s.events = [{
    id: 'evt-001', kind: 'stampede',
    bornAtDay: 8, expiresOnDay: 9,
    resolved: false, outcome: null, plotId: 'house-x',
    choices: [],
  }];
  const beforeMorale = s.stats.morale;
  const beforeFame = s.stats.fame;
  expireStaleEvents(s, () => {});
  assert.equal(s.events[0].resolved, true);
  assert.equal(s.stats.morale, beforeMorale + SPEC4_BALANCE.stampede.expireMoraleDelta);
  assert.equal(s.stats.fame, beforeFame + SPEC4_BALANCE.stampede.expireFameDelta);
});

test('expireStaleEvents inspection: -5 gov', () => {
  const s = makeFakeState({ day: 10 });
  s.events = [{
    id: 'evt-001', kind: 'inspection',
    bornAtDay: 7, expiresOnDay: 9,
    resolved: false, outcome: null,
    choices: [],
  }];
  const beforeGov = s.stats.gov;
  expireStaleEvents(s, () => {});
  assert.equal(s.events[0].resolved, true);
  assert.equal(s.stats.gov, beforeGov + SPEC4_BALANCE.inspection.expireGovDelta);
});

test('expireStaleEvents does not touch unexpired or already-resolved', () => {
  const s = makeFakeState({ day: 5 });
  s.events = [
    { id: 'a', kind: 'fire', expiresOnDay: 100, resolved: false, plotId: null },
    { id: 'b', kind: 'fire', expiresOnDay: 1, resolved: true, outcome: 'fight', plotId: null },
  ];
  const beforeMorale = s.stats.morale;
  expireStaleEvents(s, () => {});
  assert.equal(s.events[0].resolved, false);
  assert.equal(s.events[1].outcome, 'fight');  // unchanged
  assert.equal(s.stats.morale, beforeMorale);
});

// ---------- checkEventResources ----------

test('checkEventResources returns [] when resources sufficient', () => {
  const s = makeFakeState({ stats: { money: 100, labor: 5, guards: 2 } });
  s.guardAssignments = { patrol: 0 };
  const choice = { cost: { money: 20, labor: 2 }, guardCost: 1 };
  const lacking = checkEventResources(s, choice);
  assert.deepEqual(lacking, []);
});

test('checkEventResources reports lacking entries', () => {
  const s = makeFakeState({ stats: { money: 5, labor: 1, guards: 1 } });
  s.guardAssignments = { patrol: 1 };  // 1 used → 0 free
  const choice = { cost: { money: 20, labor: 2 }, guardCost: 1 };
  const lacking = checkEventResources(s, choice);
  // 3 lacks: money lack 15, labor lack 1, guards lack 1
  assert.equal(lacking.length, 3);
  const byKey = Object.fromEntries(lacking.map(l => [l.key, l.lack]));
  assert.equal(byKey.money, 15);
  assert.equal(byKey.labor, 1);
  assert.equal(byKey.guards, 1);
});

// ---------- resolveEventChoice ----------

test('resolveEventChoice deducts cost, applies effects, marks resolved', () => {
  const s = makeFakeState({ stats: { money: 50, gov: 40, fame: 18, cloth: 5 } });
  const evt = {
    id: 'e1', kind: 'inspection', resolved: false, outcome: null,
    choices: [{ id: 'feast', cost: { money: 20, cloth: 3 }, effects: { gov: 10, fame: 3 } }],
  };
  s.events.push(evt);
  const ok = resolveEventChoice(s, evt, 'feast', () => {});
  assert.equal(ok, true);
  assert.equal(s.stats.money, 30);
  assert.equal(s.stats.cloth, 2);
  assert.equal(s.stats.gov, 50);
  assert.equal(s.stats.fame, 21);
  assert.equal(evt.resolved, true);
  assert.equal(evt.outcome, 'feast');
});

test('resolveEventChoice fails (no state mutation) when resources lack', () => {
  const s = makeFakeState({ stats: { money: 5 } });
  const evt = {
    id: 'e1', kind: 'inspection', resolved: false, outcome: null,
    choices: [{ id: 'feast', cost: { money: 20 }, effects: { gov: 10 } }],
  };
  s.events.push(evt);
  const beforeMoney = s.stats.money;
  const beforeGov = s.stats.gov;
  const ok = resolveEventChoice(s, evt, 'feast', () => {});
  assert.equal(ok, false);
  assert.equal(s.stats.money, beforeMoney);
  assert.equal(s.stats.gov, beforeGov);
  assert.equal(evt.resolved, false);
});

test('resolveEventChoice cannot resolve already-resolved event', () => {
  const s = makeFakeState();
  const evt = {
    id: 'e1', kind: 'inspection', resolved: true, outcome: 'feast',
    choices: [{ id: 'feast', effects: { gov: 10 } }],
  };
  const ok = resolveEventChoice(s, evt, 'feast', () => {});
  assert.equal(ok, false);
});

test('resolveEventChoice gambleResolve success: plot survives, outcome=success', () => {
  const s = makeFakeState({ day: 5 });
  s.plots = [makeBuiltWeaverPlot('1')];
  registerBuildings(s, s.plots);
  const plot = s.plots[0];
  const evt = {
    id: 'e1', kind: 'fire', resolved: false, outcome: null, plotId: plot.id,
    choices: [{ id: 'wait', effects: {}, gambleResolve: true }],
  };
  s.events.push(evt);
  const origRandom = Math.random;
  Math.random = () => 0.3;  // < 0.5 → success
  try {
    const ok = resolveEventChoice(s, evt, 'wait', () => {});
    assert.equal(ok, true);
    assert.equal(plot.status, 'built');
    assert.equal(evt.outcome, 'wait-success');
    assert.equal(evt.resolved, true);
  } finally {
    Math.random = origRandom;
  }
});

test('resolveEventChoice gambleResolve failure: plot destroyed, morale -10', () => {
  const s = makeFakeState({ day: 5, stats: { morale: 60 } });
  s.plots = [makeBuiltWeaverPlot('2')];
  registerBuildings(s, s.plots);
  const plot = s.plots[0];
  const evt = {
    id: 'e1', kind: 'fire', resolved: false, outcome: null, plotId: plot.id,
    choices: [{ id: 'wait', effects: {}, gambleResolve: true }],
  };
  s.events.push(evt);
  const origRandom = Math.random;
  Math.random = () => 0.7;  // >= 0.5 → failure
  try {
    const ok = resolveEventChoice(s, evt, 'wait', () => {});
    assert.equal(ok, true);
    assert.equal(plot.status, 'damaged');
    assert.ok(plot.building);
    assert.equal(s.stats.morale, 60 + SPEC4_BALANCE.fire.expireMoraleDelta);
    assert.equal(evt.outcome, 'wait-failed');
    assert.equal(evt.resolved, true);
  } finally {
    Math.random = origRandom;
  }
});

test('resolveEventChoice unknown choiceId returns false', () => {
  const s = makeFakeState();
  const evt = {
    id: 'e1', kind: 'inspection', resolved: false, outcome: null,
    choices: [{ id: 'feast', effects: { gov: 1 } }],
  };
  const ok = resolveEventChoice(s, evt, 'nonexistent', () => {});
  assert.equal(ok, false);
  assert.equal(evt.resolved, false);
});
