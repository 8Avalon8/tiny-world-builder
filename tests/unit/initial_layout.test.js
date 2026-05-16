// test/initial_layout.test.js
// 用真实 INITIAL_PLOTS 数据验证 slice-1 / 2 / 3 的承诺空间约束
// 在开局可玩布局上能否找到至少一个可解地块。
// 这是用户怀疑「临井检查没生效」时的回归测试入口。
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { INITIAL_PLOTS } from '../../js/game/plots.js';
import { PROMISE_BALANCE } from '../../js/game/balance-promises.js';
import { createPromise, plotsForPromiseHighlight, checkPromiseProgress } from '../../js/game/promises.js';
import { findMatchingPlots, isWithin, WELL_CELLS } from '../../js/game/spatial.js';
import { makeFakeState } from './_helpers.js';

// 复刻 main.js init() 的真实开局 state 的相关字段
function realStartState() {
  const s = makeFakeState({ stats: { population: 8 } });
  // INITIAL_PLOTS 是引用，但我们不会修改它。读 status / cells 即可。
  s.plots = INITIAL_PLOTS;
  // 真实开局已建：house-01/02/03 + ciDengTemple
  s.buildings = {
    'house-01':    { id: 'house-01',    kind: 'house',  name: 'house' },
    'house-02':    { id: 'house-02',    kind: 'house',  name: 'house' },
    'house-03':    { id: 'house-03',    kind: 'house',  name: 'house' },
    'ciDengTemple':{ id: 'ciDengTemple',kind: 'temple', name: '慈灯寺' },
  };
  return s;
}

// ---- 直接核对 SE 区每块地到井的曼哈顿距离 ----

test('诊断：SE 区所有地块到井最近 cell 的曼哈顿距离', () => {
  const s = realStartState();
  const seAll = s.plots.filter(p => p.quadrant === 'SE');
  console.log('\n=== SE 区到井距离表 ===');
  for (const p of seAll) {
    const cellsStr = p.cells.map(c => `(${c.x},${c.y})`).join(',');
    let minDist = Infinity;
    for (const c of p.cells) {
      for (const w of WELL_CELLS) {
        const d = Math.abs(c.x - w.x) + Math.abs(c.y - w.y);
        if (d < minDist) minDist = d;
      }
    }
    console.log(`  ${p.id} (${p.status}) cells=${cellsStr} → 距井 ${minDist}`);
  }
});

// ---- 验证 SE-04 满足「临井 ≤ 2」 ----

test('SE-04 (9,9) 是空地，且距井曼哈顿 = 2，within well 2 = true', () => {
  const s = realStartState();
  const se04 = s.plots.find(p => p.id === 'SE-04');
  assert.ok(se04, 'SE-04 必须存在');
  assert.equal(se04.status, 'empty', `SE-04 状态应为 empty，实际：${se04.status}`);
  assert.equal(se04.quadrant, 'SE');
  assert.deepEqual(se04.cells, [{ x: 9, y: 9 }]);
  assert.equal(isWithin(s, se04, 'well', 2), true,
    'SE-04 到井曼哈顿 = |9-8|+|9-8| = 2，应满足 within well 2');
  assert.equal(isWithin(s, se04, 'well', 1), false);
});

// ---- newcomerSettle 承诺：在真实开局上必须有可建地块 ----

test('newcomerSettle 承诺：开局 plotsForPromiseHighlight 至少包含 SE-04', () => {
  const s = realStartState();
  const cfg = PROMISE_BALANCE.newcomerSettle;
  const promise = createPromise(s, {
    kind: 'newcomer-settle', sourceGate: 'S',
    deadlineDays: cfg.deadlineDays,
    spatial: cfg.spatial, resources: cfg.resources,
    success: cfg.success, failure: cfg.failure,
  });

  const highlight = plotsForPromiseHighlight(s, promise);
  console.log('newcomerSettle 高亮地块：', [...highlight].sort());

  assert.ok(highlight.has('SE-04'),
    `应包含临井空地 SE-04，实际高亮：${[...highlight].sort().join(',')}`);
});

test('newcomerSettle 承诺：spec[0] (临井) 在开局可建地块只有 SE-04', () => {
  const s = realStartState();
  const cfg = PROMISE_BALANCE.newcomerSettle;
  const wellSpec = cfg.spatial[0];  // { build:'house', count:1, in:'SE', within:{well:2} }
  const valid = findMatchingPlots(s, wellSpec, 'available');
  console.log('临井 spec 可建地块：', valid.map(p => p.id).sort());
  // 唯一解：SE-04
  assert.deepEqual(valid.map(p => p.id).sort(), ['SE-04'],
    '开局唯一满足「SE 临井(≤2) + empty」的地块应为 SE-04');
});

test('newcomerSettle 承诺：spec[1] (SE 任意) 在开局可建地块只剩 SE-04', () => {
  const s = realStartState();
  const cfg = PROMISE_BALANCE.newcomerSettle;
  const anySpec = cfg.spatial[1];  // { build:'house', count:1, in:'SE' }
  const valid = findMatchingPlots(s, anySpec, 'available');
  console.log('SE 任意 spec 可建地块：', valid.map(p => p.id).sort());
  // slice-9 开局 SE 只有 1 块 starter empty：SE-04
  assert.deepEqual(valid.map(p => p.id).sort(),
    ['SE-04']);
});

// ---- 进度计算：开局承诺刚创建时的状态 ----

test('newcomerSettle 承诺：刚创建时 spatial 进度（SE 任意已被现存房满足）', () => {
  const s = realStartState();
  const cfg = PROMISE_BALANCE.newcomerSettle;
  const promise = createPromise(s, {
    kind: 'newcomer-settle', sourceGate: 'S',
    deadlineDays: cfg.deadlineDays,
    spatial: cfg.spatial, resources: cfg.resources,
    success: cfg.success, failure: cfg.failure,
  });
  const prog = checkPromiseProgress(s, promise);
  console.log('开局承诺进度：', JSON.stringify(prog.spatial, null, 2));

  // spec[0] (临井) → 0/1：开局没有任何已建房在 SE 临井（house-01/02/03 都距井 ≥4）
  assert.equal(prog.spatial[0].satisfied, 0, 'spec[0] (临井) 已建数应为 0');
  assert.equal(prog.spatial[0].need, 1);
  // spec[1] (SE 任意) → 3/1：house-01/02/03 都在 SE，已满足
  assert.equal(prog.spatial[1].satisfied, 3, 'spec[1] (SE 任意) 应被现存 3 座房满足');
  assert.equal(prog.spatial[1].need, 1);

  assert.equal(prog.spatialOK, false);  // spec[0] 没满足
  // 垂直切片改造：新民第一承诺只要安家，不再预先索要布帛。
  assert.equal(prog.resourcesOK, true);
});
