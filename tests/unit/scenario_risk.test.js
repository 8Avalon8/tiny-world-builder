// test/scenario_risk.test.js
// slice-5 端到端:火险/拥堵到 danger 阈值 → 自动 spawn 防御请愿 → 接 → 完成 → 风险压回去
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  maybeSpawnFireDrillRequest, acceptFireDrillRequest,
  maybeSpawnNightPatrolRequest, acceptNightPatrolRequest,
} from '../../js/game/petitions.js';
import { tickPromises } from '../../js/game/promises.js';
import { maybeSpawnFireEvent, maybeSpawnStampedeEvent } from '../../js/game/events.js';
import { RISK_BALANCE } from '../../js/game/balance-risk.js';
import { SPEC4_BALANCE } from '../../js/game/balance-events.js';
import { makeFakeState, makeBuiltWeaverPlot, makeBuiltHousePlot, registerBuildings } from './_helpers.js';

test('e2e: 火险升至 danger → 防御 spawn → 接 + 完成 → 火险压回 warn 以下,burst 不触发', () => {
  const s = makeFakeState({
    day: 5, lastFireDay: 0,
    stats: { fireRisk: RISK_BALANCE.fire.danger, money: 50, wood: 10, morale: 50, guards: 2 },
    guardAssignments: { patrol: 1 },
  });
  s.plots = [makeBuiltWeaverPlot('1')];
  registerBuildings(s, s.plots);

  // 此时火险=danger=50,低于 burst=60,fire 事件不触发
  const fireEvtBefore = maybeSpawnFireEvent(s);
  assert.equal(fireEvtBefore, null, '火险 < burst 时 fire 事件不该触发');

  // 防御请愿应 spawn
  const pet = maybeSpawnFireDrillRequest(s);
  assert.ok(pet, '火险 ≥ danger 时应 spawn 消防演练请愿');

  // 接 + 全满足
  acceptFireDrillRequest(s, pet);
  tickPromises(s, () => {}, null, () => {});
  const pr = s.promises.find(p => p.kind === 'fire-drill');
  assert.equal(pr.outcome, 'grand');

  // 火险压回 25 (50 - 25),已退回 warn 以下
  assert.equal(s.stats.fireRisk, 25);
  assert.ok(s.stats.fireRisk < RISK_BALANCE.fire.warn,
    `演练后火险 ${s.stats.fireRisk} 应 < warn ${RISK_BALANCE.fire.warn}`);
});

test('e2e: 玩家放任 → 火险持续累积到 burst → fire 事件触发', () => {
  const s = makeFakeState({
    day: 5, lastFireDay: 0,
    stats: { fireRisk: RISK_BALANCE.fire.burst, money: 50, wood: 10, guards: 2 },
  });
  s.plots = [makeBuiltWeaverPlot('1')];
  registerBuildings(s, s.plots);

  // 火险已到 burst,fire 事件该触发
  const evt = maybeSpawnFireEvent(s);
  assert.ok(evt);
  assert.equal(evt.kind, 'fire');
});

test('e2e: warn..danger 之间 → 不 spawn 防御请愿(还没到 danger)', () => {
  const warnVal = RISK_BALANCE.fire.warn;
  const dangerVal = RISK_BALANCE.fire.danger;
  // 取中间值,确保 ≥ warn 但 < danger
  const mid = Math.floor((warnVal + dangerVal) / 2);
  const s = makeFakeState({ stats: { fireRisk: mid } });
  const pet = maybeSpawnFireDrillRequest(s);
  assert.equal(pet, null, `火险 ${mid} 在 warn..danger 之间不该 spawn 防御请愿`);
});

test('e2e: 拥堵到 danger → 巡夜 spawn → 接 + 完成 → 拥堵压回安全', () => {
  const s = makeFakeState({
    day: 5,
    stats: { congestion: RISK_BALANCE.stampede.danger + 5, money: 50, morale: 50, guards: 3 },
    guardAssignments: { patrol: 1 },
  });
  s.plots = [makeBuiltHousePlot('1')];
  registerBuildings(s, s.plots);

  const pet = maybeSpawnNightPatrolRequest(s);
  assert.ok(pet);
  acceptNightPatrolRequest(s, pet);
  tickPromises(s, () => {}, null, () => {});
  assert.equal(s.promises[0].outcome, 'grand');
  // 35 - 20 = 15 < danger=30
  assert.ok(s.stats.congestion < RISK_BALANCE.stampede.danger);
});

test('e2e: 防御请愿不重复 spawn(已有未结请愿则跳过)', () => {
  const s = makeFakeState({ stats: { fireRisk: 60 } });
  const pet1 = maybeSpawnFireDrillRequest(s);
  assert.ok(pet1);
  const pet2 = maybeSpawnFireDrillRequest(s);
  assert.equal(pet2, null);
});
