// test/scenario_events.test.js
// Spec #4 端到端场景：spawn → resolve / expire 全流程，断言资源 + plot 状态。
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SPEC4_BALANCE } from '../../js/game/balance-events.js';
import {
  maybeSpawnFireEvent,
  maybeSpawnInspectionEvent,
  expireStaleEvents,
  resolveEventChoice,
} from '../../js/game/events.js';
import {
  makeFakeState,
  makeBuiltWeaverPlot,
  registerBuildings,
} from './_helpers.js';

test('scenario: 火灾爆发 + 调坊丁扑救 → 1 day 后 evt.resolved=true, plot 仍 built', () => {
  const s = makeFakeState({
    day: 5, lastFireDay: 0,
    stats: { fireRisk: 60, labor: 6, guards: 2, morale: 55 },
  });
  s.guardAssignments = { patrol: 0 };  // 2 guards free
  s.plots = [makeBuiltWeaverPlot('alpha')];
  registerBuildings(s, s.plots);
  const plot = s.plots[0];

  const evt = maybeSpawnFireEvent(s);
  assert.ok(evt);
  assert.equal(evt.kind, 'fire');

  // 选 'fight' (cost: labor 2, guardCost 1, effects: morale +2)
  const beforeMorale = s.stats.morale;
  const ok = resolveEventChoice(s, evt, 'fight', () => {});
  assert.equal(ok, true);
  assert.equal(s.stats.labor, 6 - 2);
  assert.equal(s.stats.morale, beforeMorale + 2);
  assert.equal(evt.resolved, true);
  assert.equal(evt.outcome, 'fight');

  // 1 day 过去 → expireStaleEvents 不应改 plot（已 resolved）
  s.day = 6;
  expireStaleEvents(s, () => {});
  assert.equal(plot.status, 'built');
  assert.equal(plot.building, `weaver-test-alpha`);
});

test('scenario: 火灾爆发 + 不处理 1 day → expire → plot.status=damaged, morale -10', () => {
  const s = makeFakeState({
    day: 5, lastFireDay: 0,
    stats: { fireRisk: 60, morale: 55 },
  });
  s.plots = [makeBuiltWeaverPlot('beta')];
  registerBuildings(s, s.plots);
  const plot = s.plots[0];

  const evt = maybeSpawnFireEvent(s);
  assert.ok(evt);
  assert.equal(evt.expiresOnDay, 5 + SPEC4_BALANCE.fire.expireDays);  // = 6

  const beforeMorale = s.stats.morale;
  // 玩家不处理；下一日子时检查
  s.day = 6;
  expireStaleEvents(s, () => {});

  assert.equal(evt.resolved, true);
  assert.equal(evt.outcome, 'expired');
  assert.equal(plot.status, 'damaged');
  assert.ok(plot.building);
  assert.equal(s.stats.morale, beforeMorale + SPEC4_BALANCE.fire.expireMoraleDelta);
});

test('scenario: 巡查 + 设宴款待 → 钱粮 -20, 布帛 -3, gov +10, fame +3', () => {
  const s = makeFakeState({
    day: 8, lastInspectionDay: 1,
    stats: { money: 120, cloth: 5, gov: 42, fame: 18 },
  });

  const evt = maybeSpawnInspectionEvent(s);
  assert.ok(evt);
  assert.equal(evt.kind, 'inspection');

  const ok = resolveEventChoice(s, evt, 'feast', () => {});
  assert.equal(ok, true);
  assert.equal(s.stats.money, 120 - 20);
  assert.equal(s.stats.cloth, 5 - 3);
  assert.equal(s.stats.gov, 42 + 10);
  assert.equal(s.stats.fame, 18 + 3);
  assert.equal(evt.outcome, 'feast');
  assert.equal(evt.resolved, true);
});
