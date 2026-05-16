// test/wasteland_spatial_regression.test.js
// 新地块布局下，既有承诺谓词的可解性回归。

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { INITIAL_PLOTS, STARTER_PLOT_IDS } from '../../js/game/plots.js';
import { PROMISE_BALANCE } from '../../js/game/balance-promises.js';
import { findMatchingPlots } from '../../js/game/spatial.js';

function makeStateFromInit() {
  const plots = INITIAL_PLOTS.map(p => ({
    ...p,
    origin: { ...p.origin },
    size: { ...p.size },
    cells: p.cells.map(c => ({ ...c })),
    doorCell: { ...p.doorCell },
    wasteland: p.wasteland ? { ...p.wasteland } : null,
    mergeableWith: [...p.mergeableWith],
  }));
  return {
    plots,
    buildings: {
      'house-01': { kind: 'house' },
      'house-02': { kind: 'house' },
      'house-03': { kind: 'house' },
      ciDengTemple: { kind: 'temple' },
    },
    center: { x: 7, y: 7, w: 2, h: 2, type: 'well' },
  };
}

function availableIds(state, spec) {
  return findMatchingPlots(state, spec, 'available').map(p => p.id).sort();
}

test('开局 starter empty 锁死为四象限各一块', () => {
  assert.deepEqual([...STARTER_PLOT_IDS].sort(), ['NE-08', 'NW-08', 'SE-04', 'SW-05']);
});

test('slice-1 新民承诺第一条仍只有 SE-04 可解', () => {
  const s = makeStateFromInit();
  const spec = PROMISE_BALANCE.newcomerSettle.spatial[0];
  assert.deepEqual(availableIds(s, spec), ['SE-04']);
});

test('slice-1 新民承诺第二条在开局也只剩 SE-04', () => {
  const s = makeStateFromInit();
  const spec = PROMISE_BALANCE.newcomerSettle.spatial[1];
  assert.deepEqual(availableIds(s, spec), ['SE-04']);
});

test('slice-2 织棚承诺在新布局下仍可解', () => {
  const s = makeStateFromInit();
  const spec = PROMISE_BALANCE.weaverShop.spatial[0];
  assert.deepEqual(availableIds(s, spec), ['SE-04', 'SW-05']);
});

test('NW 与 NE 开局各只剩一块 starter empty，slice-3 空间扩张自然延后', () => {
  const s = makeStateFromInit();
  assert.deepEqual(availableIds(s, { build: 'incense', count: 1, in: 'NW' }), ['NW-08']);
  assert.deepEqual(availableIds(s, { build: 'mansion', count: 1, in: 'NE' }), ['NE-08']);
});
