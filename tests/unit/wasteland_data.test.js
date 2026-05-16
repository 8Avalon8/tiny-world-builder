// test/wasteland_data.test.js
// 开局 39 块地的状态分布 + wasteland 类型 + tier 分配，精确锁死。

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { state, resetState } from '../../js/game/state.js';
import { INITIAL_PLOTS, STARTER_PLOT_IDS, WASTELAND_INIT, validatePlots } from '../../js/game/plots.js';

function withMutatedLayout(run) {
  const starterSnapshot = [...STARTER_PLOT_IDS];
  const wastelandSnapshot = WASTELAND_INIT.map(([id, type, tier]) => [id, type, tier]);
  const plotSnapshot = INITIAL_PLOTS.map(p => ({
    status: p.status,
    wasteland: p.wasteland ? { ...p.wasteland } : null,
  }));

  try {
    run();
  } finally {
    STARTER_PLOT_IDS.splice(0, STARTER_PLOT_IDS.length, ...starterSnapshot);
    WASTELAND_INIT.splice(0, WASTELAND_INIT.length, ...wastelandSnapshot);
    INITIAL_PLOTS.forEach((p, i) => {
      p.status = plotSnapshot[i].status;
      p.wasteland = plotSnapshot[i].wasteland;
    });
  }
}

test('总数 39，分布 4 built + 4 starter empty + 31 wasteland', () => {
  assert.equal(INITIAL_PLOTS.length, 39);
  const built = INITIAL_PLOTS.filter(p => p.status === 'built');
  const empty = INITIAL_PLOTS.filter(p => p.status === 'empty');
  const wasteland = INITIAL_PLOTS.filter(p => p.status === 'wasteland');
  assert.equal(built.length, 4);
  assert.equal(empty.length, 4);
  assert.equal(wasteland.length, 31);
});

test('starter empty = 每象限 1 块', () => {
  assert.deepEqual([...STARTER_PLOT_IDS].sort(), ['NE-08', 'NW-08', 'SE-04', 'SW-05']);
  for (const id of STARTER_PLOT_IDS) {
    const p = INITIAL_PLOTS.find(pl => pl.id === id);
    assert.equal(p.status, 'empty', `${id} 应为 empty`);
    assert.equal(p.wasteland, null, `${id} 不应有 wasteland 字段`);
  }
});

test('NW 6 块 templeDispute，按 tier 分布 2/2/2', () => {
  const nw = INITIAL_PLOTS.filter(p => p.status === 'wasteland' && p.wasteland.type === 'templeDispute');
  assert.equal(nw.length, 6);
  const t1 = nw.filter(p => p.wasteland.tier === 1).map(p => p.id).sort();
  const t2 = nw.filter(p => p.wasteland.tier === 2).map(p => p.id).sort();
  const t3 = nw.filter(p => p.wasteland.tier === 3).map(p => p.id).sort();
  assert.deepEqual(t1, ['NW-02', 'NW-06']);
  assert.deepEqual(t2, ['NW-03', 'NW-05']);
  assert.deepEqual(t3, ['NW-04', 'NW-07']);
});

test('NE 7 块 govSealed，按 tier 分布 3/2/2', () => {
  const ne = INITIAL_PLOTS.filter(p => p.status === 'wasteland' && p.wasteland.type === 'govSealed');
  assert.equal(ne.length, 7);
  const t1 = ne.filter(p => p.wasteland.tier === 1).map(p => p.id).sort();
  const t2 = ne.filter(p => p.wasteland.tier === 2).map(p => p.id).sort();
  const t3 = ne.filter(p => p.wasteland.tier === 3).map(p => p.id).sort();
  assert.deepEqual(t1, ['NE-05', 'NE-06', 'NE-07']);
  assert.deepEqual(t2, ['NE-01', 'NE-02']);
  assert.deepEqual(t3, ['NE-03', 'NE-04']);
});

test('SW 10 块 lowland，无 tier，全直接型', () => {
  const sw = INITIAL_PLOTS.filter(p => p.status === 'wasteland' && p.wasteland.type === 'lowland');
  assert.equal(sw.length, 10);
  for (const p of sw) {
    assert.equal(p.wasteland.tier, null);
    assert.equal(p.wasteland.unlockMode, 'direct');
  }
});

test('SE 8 块 oldRuin，无 tier，全直接型', () => {
  const se = INITIAL_PLOTS.filter(p => p.status === 'wasteland' && p.wasteland.type === 'oldRuin');
  assert.equal(se.length, 8);
  const ids = se.map(p => p.id).sort();
  assert.deepEqual(ids, ['SE-05', 'SE-06', 'SE-07', 'SE-08', 'SE-09', 'SE-10', 'SE-11', 'SE-12']);
});

test('validatePlots 通过', () => {
  assert.doesNotThrow(() => validatePlots());
});

test('validatePlots：STARTER_PLOT_IDS 不能重复', () => {
  withMutatedLayout(() => {
    STARTER_PLOT_IDS.push('NW-08');
    assert.throws(() => validatePlots(), /STARTER_PLOT_IDS.*重复/);
  });
});

test('validatePlots：WASTELAND_INIT plot id 不能重复', () => {
  withMutatedLayout(() => {
    WASTELAND_INIT.push(['NW-02', 'templeDispute', 1]);
    assert.throws(() => validatePlots(), /WASTELAND_INIT.*重复/);
  });
});

test('validatePlots：built plot 不能出现在 starter 集合里', () => {
  withMutatedLayout(() => {
    STARTER_PLOT_IDS.push('SE-01');
    assert.throws(() => validatePlots(), /built.*starter/);
  });
});

test('validatePlots：built plot 不能出现在 wasteland 集合里', () => {
  withMutatedLayout(() => {
    WASTELAND_INIT.push(['SE-01', 'oldRuin', null]);
    assert.throws(() => validatePlots(), /built.*wasteland/);
  });
});

test('validatePlots：每个非 built plot 不能同时属于 starter 和 wasteland', () => {
  withMutatedLayout(() => {
    WASTELAND_INIT.push(['SE-04', 'oldRuin', null]);
    assert.throws(() => validatePlots(), /必须且只能属于 starter empty 或 wasteland 之一/);
  });
});

test('validatePlots：每个非 built plot 不能漏出 starter\/wasteland 分类', () => {
  withMutatedLayout(() => {
    const idx = STARTER_PLOT_IDS.indexOf('SE-04');
    STARTER_PLOT_IDS.splice(idx, 1);
    assert.throws(() => validatePlots(), /必须且只能属于 starter empty 或 wasteland 之一/);
  });
});

test('validatePlots：starter empty 的 plot.status 必须是 empty', () => {
  withMutatedLayout(() => {
    const p = INITIAL_PLOTS.find(pl => pl.id === 'SE-04');
    p.status = 'wasteland';
    p.wasteland = { type: 'oldRuin', unlockMode: 'direct', tier: null, workDaysLeft: null };
    assert.throws(() => validatePlots(), /starter empty.*status.*empty/);
  });
});

test('开局 state.totalUnlocked = 0', () => {
  resetState();
  assert.equal(state.totalUnlocked, 0);
});

test('开局 templeNegotiatedTier / govPermittedTier = 0', () => {
  resetState();
  assert.equal(state.flags.templeNegotiatedTier, 0);
  assert.equal(state.flags.govPermittedTier, 0);
  assert.deepEqual(state.flags.templeNegotiateCooldown, [0, 0, 0, 0]);
  assert.deepEqual(state.flags.govPermitCooldown, [0, 0, 0, 0]);
});

test('开局 fame=25（slice-9 调整）', () => {
  resetState();
  assert.equal(state.stats.fame, 25);
});
