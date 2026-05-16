// test/promises.test.js
// slice-1 承诺机制端到端：创建 → 进度检查 → 自动结算成功 / 过期失败。

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  createPromise, checkPromiseProgress, tickPromises,
  settlePromiseSuccess, settlePromiseFailure, activePromises,
  plotsForPromiseHighlight,
} from '../../js/game/promises.js';
import { SLICE1_BALANCE } from '../../js/game/balance-promises.js';
import { acceptNewcomerPetition } from '../../js/game/petitions.js';
import { tryAutoHire } from '../../js/game/citizens.js';
import { makeFakeState, makeBuiltHousePlot, registerBuildings } from './_helpers.js';

// 一座 SE 临井空地（cell (9,9)）
function emptyHousePlot(id, x, y, q = 'SE') {
  return {
    id, quadrant: q,
    origin: { x, y }, size: { w: 1, h: 1 },
    cells: [{ x, y }],
    status: 'empty',
    building: null, project: null, mergedInto: null, mergeableWith: [],
    doorCell: { x, y: y + 1 },
  };
}

function newcomerPromiseDef() {
  const cfg = SLICE1_BALANCE.newcomerSettle;
  return {
    kind: 'newcomer-settle',
    sourceId: 'pet-001', sourceGate: 'S',
    deadlineDays: cfg.deadlineDays,
    spatial: cfg.spatial,
    resources: cfg.resources,
    success: cfg.success,
    failure: cfg.failure,
  };
}

test('createPromise: 设置 id/bornAtDay/deadline 并 push 入队', () => {
  const s = makeFakeState({ day: 5 });
  const p = createPromise(s, newcomerPromiseDef());
  assert.equal(p.id, 'prm-001');
  assert.equal(s.nextPromiseId, 2);
  assert.equal(p.bornAtDay, 5);
  assert.equal(p.deadline, 5 + SLICE1_BALANCE.newcomerSettle.deadlineDays);
  assert.equal(p.resolved, false);
  assert.equal(s.promises.length, 1);
});

test('checkPromiseProgress: 开局空状态 → 空间未满足，资源已满足', () => {
  const s = makeFakeState({ stats: { cloth: 0 } });
  const p = createPromise(s, newcomerPromiseDef());
  const prog = checkPromiseProgress(s, p);
  assert.equal(prog.spatialOK, false);
  assert.equal(prog.resourcesOK, true);
  assert.equal(prog.complete, false);
  assert.equal(prog.spatial.length, 2);
  assert.equal(prog.spatial[0].satisfied, 0);
  assert.equal(prog.spatial[0].need, 1);
  assert.equal(prog.resources.length, 0);
});

test('checkPromiseProgress: 1 SE 临井房 + 1 SE 任意房 → complete=true', () => {
  const s = makeFakeState({ stats: { cloth: 4 } });
  // 临井房 SE-04 风格：(9,9) 距井 2
  const close = makeBuiltHousePlot('close');
  close.origin = { x: 9, y: 9 };
  close.cells = [{ x: 9, y: 9 }];
  // 任意 SE 房 (10,10) 距井 4
  const far = makeBuiltHousePlot('far');
  s.plots = [close, far];
  registerBuildings(s, s.plots);
  const p = createPromise(s, newcomerPromiseDef());
  const prog = checkPromiseProgress(s, p);
  assert.equal(prog.spatialOK, true);
  assert.equal(prog.resourcesOK, true);
  assert.equal(prog.complete, true);
});

test('checkPromiseProgress: 仅 SE 临井 1 座 → spatial 第二项不满足', () => {
  const s = makeFakeState({ stats: { cloth: 4 } });
  const close = makeBuiltHousePlot('close');
  close.origin = { x: 9, y: 9 };
  close.cells = [{ x: 9, y: 9 }];
  s.plots = [close];
  registerBuildings(s, s.plots);
  const p = createPromise(s, newcomerPromiseDef());
  const prog = checkPromiseProgress(s, p);
  assert.equal(prog.spatial[0].satisfied, 1);  // 临井项 OK
  assert.equal(prog.spatial[1].satisfied, 1);  // 任意项也算这座（既临井也是 SE 任意）
  // 等等：spatial[1] count=1, satisfied=1 → spatialOK 实际是 true!
  // 这说明同一座房同时满足两条 spec。所以这个 setup 实际是 complete=true。
  assert.equal(prog.complete, true);
});

test('settlePromiseSuccess: 不再扣 cloth，加 wood/pop/morale/skilled、解锁 HUD、标 resolved', () => {
  const s = makeFakeState({ stats: { cloth: 6, wood: 10, population: 8, morale: 50 }, skilledResidents: 0 });
  const p = createPromise(s, newcomerPromiseDef());
  const logs = [];
  settlePromiseSuccess(s, p, msg => logs.push(msg));
  assert.equal(s.stats.cloth, 6);
  assert.equal(s.stats.wood, 10 + 4);
  assert.equal(s.stats.population, 8 + 8);
  assert.equal(s.stats.morale, 50 + 5);
  assert.equal(s.skilledResidents, 3);
  assert.equal(s.hudUnlocked.cloth, true);
  assert.equal(p.resolved, true);
  assert.equal(p.outcome, 'success');
  assert.match(logs[0], /木料 \+4/);
});

test('settlePromiseFailure: 扣 morale + 加 congestion + 调用 spawnVagrantsFn', () => {
  const s = makeFakeState({ stats: { morale: 50, congestion: 0 } });
  const p = createPromise(s, newcomerPromiseDef());
  let vagrantCall = null;
  settlePromiseFailure(s, p, () => {}, (st, gate, n) => { vagrantCall = { gate, n }; });
  assert.equal(s.stats.morale, 50 - 8);
  assert.equal(s.stats.congestion, 6);
  assert.deepEqual(vagrantCall, { gate: 'S', n: 3 });
  assert.equal(p.resolved, true);
  assert.equal(p.outcome, 'failed-expired');
});

test('tickPromises: 满足条件 → 自动结算成功 + 调用 hireFn，并发放 wood +4', () => {
  const s = makeFakeState({ stats: { cloth: 4, wood: 10, population: 8 } });
  const close = makeBuiltHousePlot('close');
  close.origin = { x: 9, y: 9 }; close.cells = [{ x: 9, y: 9 }];
  const far = makeBuiltHousePlot('far');
  s.plots = [close, far];
  registerBuildings(s, s.plots);
  createPromise(s, newcomerPromiseDef());
  let hired = false;
  const logs = [];
  tickPromises(s, msg => logs.push(msg), () => { hired = true; }, () => {});
  assert.equal(s.promises[0].resolved, true);
  assert.equal(s.promises[0].outcome, 'success');
  assert.equal(s.stats.wood, 10 + 4);
  assert.equal(s.stats.population, 8 + 8);
  assert.equal(hired, true);
  assert.match(logs[0], /木料 \+4/);
});

test('tickPromises: 未满足 + 未过期 → 不动', () => {
  const s = makeFakeState({ stats: { cloth: 0 }, day: 1 });
  createPromise(s, newcomerPromiseDef());
  tickPromises(s, () => {}, () => {}, () => {});
  assert.equal(s.promises[0].resolved, false);
});

test('tickPromises: 过期未满足 → 失败结算 + spawnVagrantsFn 被调', () => {
  const s = makeFakeState({ stats: { cloth: 0 }, day: 1 });
  createPromise(s, newcomerPromiseDef());
  let vagrantCall = null;
  s.day = 1 + SLICE1_BALANCE.newcomerSettle.deadlineDays;  // 到期
  tickPromises(s, () => {}, null, (st, gate, n) => { vagrantCall = { gate, n }; });
  assert.equal(s.promises[0].resolved, true);
  assert.equal(s.promises[0].outcome, 'failed-expired');
  assert.deepEqual(vagrantCall, { gate: 'S', n: 3 });
});

test('activePromises: 只返回未结算', () => {
  const s = makeFakeState();
  const a = createPromise(s, newcomerPromiseDef());
  const b = createPromise(s, newcomerPromiseDef());
  a.resolved = true; a.outcome = 'success';
  assert.equal(activePromises(s).length, 1);
  assert.equal(activePromises(s)[0], b);
});

test('plotsForPromiseHighlight: 返回所有可建空地的 id 集', () => {
  const s = makeFakeState();
  s.plots = [
    emptyHousePlot('SE-04-test', 9, 9),    // SE 临井 ✓
    emptyHousePlot('SE-06-test', 9, 15),   // SE 不临井但 spec 第二条只要 SE
    emptyHousePlot('SW-01-test', 0, 9, 'SW'),  // 不在 SE
  ];
  registerBuildings(s, s.plots);
  const p = createPromise(s, newcomerPromiseDef());
  const hi = plotsForPromiseHighlight(s, p);
  assert.equal(hi.size, 2);
  assert.ok(hi.has('SE-04-test'));
  assert.ok(hi.has('SE-06-test'));
  assert.ok(!hi.has('SW-01-test'));
});

// 端到端：accept → tickPromises (未满足) → 建临井房 → tickPromises 自动成功
test('e2e: accept → 玩家 3 日内建临井房 → 承诺自动结算成功', () => {
  const s = makeFakeState({ stats: { money: 50, cloth: 0, population: 8, morale: 50 } });
  const pet = { id: 'pet-001', kind: 'newcomer', count: 3, sourceGate: 'S', resolved: false, expiresOnDay: 100 };
  s.petitions.push(pet);

  // Day 1: 玩家接纳
  const ok = acceptNewcomerPetition(s, pet);
  assert.equal(ok, true);
  assert.equal(s.promises.length, 1);
  assert.equal(s.stats.population, 8);  // 关键：尚未变化

  // Day 2: 玩家建了一座临井房；第一条承诺只考验安家，不再要求布帛。
  const close = makeBuiltHousePlot('close');
  close.origin = { x: 9, y: 9 }; close.cells = [{ x: 9, y: 9 }];
  s.plots = [close];
  registerBuildings(s, s.plots);
  s.day = 2;
  tickPromises(s, () => {}, tryAutoHire, () => {});
  // 自动结算成功
  assert.equal(s.promises[0].resolved, true);
  assert.equal(s.promises[0].outcome, 'success');
  assert.equal(s.stats.population, 8 + 8);
  assert.equal(s.stats.cloth, 0);  // 未曾要求布帛，仍为 0
  assert.equal(s.skilledResidents, 3);
});

// 端到端：accept → 3 日不动 → 自动失败
test('e2e: accept → 不行动 → 期满失败', () => {
  const s = makeFakeState({ stats: { money: 50, morale: 50, congestion: 0 }, day: 1 });
  const pet = { id: 'pet-001', kind: 'newcomer', count: 3, sourceGate: 'S', resolved: false, expiresOnDay: 100 };
  s.petitions.push(pet);

  acceptNewcomerPetition(s, pet);
  // 推进到 deadline
  s.day = 1 + SLICE1_BALANCE.newcomerSettle.deadlineDays;
  let vagrantCount = 0;
  tickPromises(s, () => {}, null, (st, gate, n) => { vagrantCount += n; });
  assert.equal(s.promises[0].outcome, 'failed-expired');
  assert.equal(s.stats.morale, 50 - 8);
  assert.equal(s.stats.congestion, 6);
  assert.equal(vagrantCount, 3);
});
