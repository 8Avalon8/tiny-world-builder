// test/scenario_noble_chain.test.js
// slice-7 端到端: 达官 4 阶段链(管事勘宅 → 圈地催办 → 清街 → 风波)
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  acceptNobleStewardPetition,
  maybeSpawnNobleMansionUrgent, acceptNobleMansionUrgent, rejectNobleMansionUrgent,
} from '../../js/game/petitions.js';
import { tickPromises } from '../../js/game/promises.js';
import { maybeSpawnVendorRestrictionEvent, maybeSpawnScandalEvent, resolveEventChoice } from '../../js/game/events.js';
import { makeFakeState, makeBuiltMansionPlot, registerBuildings } from './_helpers.js';

// 把 noble-steward-host 跑到 grand,设置 nobleAccepted + nobleAcceptedOnDay
function runNobleAccept(s, ne2x2Plot) {
  const pet = {
    id: 'pet-noble', kind: 'noble-steward', count: 1, sourceGate: 'N',
    expiresOnDay: s.day + 5, resolved: false,
  };
  s.petitions.push(pet);
  s.nobleStewardEligible = true;
  acceptNobleStewardPetition(s, pet);
  s.plots.push(ne2x2Plot);
  tickPromises(s, () => {}, null, () => {});
}

test('e2e: noble grand → 3 日后催办 spawn → 接 → 已建 mansion → grand fame +8', () => {
  const s = makeFakeState({
    day: 5,
    stats: { fame: 30, money: 50, cloth: 10, morale: 60, guards: 2 },
    guardAssignments: { patrol: 1 },
    nobleStewardEligible: true,
  });
  // 准备一块 NE 2x2 空地供 noble-steward-host spatial reservable 满足
  const emptyPlot = {
    id: 'NE-empty', quadrant: 'NE',
    origin: { x: 11, y: 4 }, size: { w: 2, h: 2 },
    cells: [{ x: 11, y: 4 }, { x: 12, y: 4 }, { x: 11, y: 5 }, { x: 12, y: 5 }],
    status: 'empty', building: null, project: null,
  };
  runNobleAccept(s, emptyPlot);
  assert.equal(s.nobleAccepted, true);
  assert.equal(s.nobleAcceptedOnDay, 5);

  // 3 日内催办不应 spawn
  s.day = 7;
  assert.equal(maybeSpawnNobleMansionUrgent(s), null);

  // 第 8 日 spawn
  s.day = 8;
  const urgentPet = maybeSpawnNobleMansionUrgent(s);
  assert.ok(urgentPet);

  // 模拟玩家迅速建 mansion(把 emptyPlot 替换为 built mansion)
  const idx = s.plots.findIndex(p => p.id === 'NE-empty');
  s.plots[idx] = makeBuiltMansionPlot('1');
  registerBuildings(s, [s.plots[idx]]);

  acceptNobleMansionUrgent(s, urgentPet);
  tickPromises(s, () => {}, null, () => {});
  const pr = s.promises.find(p => p.kind === 'noble-mansion-urgent');
  assert.equal(pr.outcome, 'grand');
  assert.equal(s.stats.fame, 30 + 5 + 8);  // noble grand +5,stage-2 grand +8
});

test('e2e: 拒绝 stage-2 → 整线终止', () => {
  const s = makeFakeState({
    day: 8,
    nobleAccepted: true, nobleAcceptedOnDay: 5,
    stats: { fame: 30, gov: 50 },
  });
  const pet = maybeSpawnNobleMansionUrgent(s);
  assert.ok(pet);
  rejectNobleMansionUrgent(s, pet);
  assert.equal(s.nobleAccepted, false);
  assert.equal(s.nobleStewardEligible, false);

  // 拒后 vendor-restriction 不会 spawn(mansionBuiltOnDay=0)
  const v = maybeSpawnVendorRestrictionEvent(s);
  assert.equal(v, null);
});

test('e2e: 完整 4 阶段链 → ledger 进度全 done', () => {
  const s = makeFakeState({
    day: 100,
    nobleAccepted: true,
    nobleAcceptedOnDay: 80,
    mansionBuiltOnDay: 90,
    stats: { fame: 30, gov: 50, money: 100, morale: 50, prosperity: 0 },
  });

  // stage-3 vendor-restriction
  const v = maybeSpawnVendorRestrictionEvent(s);
  assert.ok(v);
  resolveEventChoice(s, v, 'accept', () => {});
  assert.equal(s.vendorRestrictionDone, true);

  // stage-4 scandal (mansionBuiltOnDay+15 = 105)
  s.day = 110;
  const sc = maybeSpawnScandalEvent(s);
  assert.ok(sc);
  resolveEventChoice(s, sc, 'protect', () => {});
  assert.equal(s.scandalDone, true);

  // 4 阶段 done 状态
  assert.ok(s.nobleAccepted);
  assert.ok(s.mansionBuiltOnDay > 0);
  assert.ok(s.vendorRestrictionDone);
  assert.ok(s.scandalDone);
});
