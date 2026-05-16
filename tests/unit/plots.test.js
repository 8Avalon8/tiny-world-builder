// tests/unit/plots.test.js — verify the 39 + 31 + 4 plot topology
// invariants from the chang_an_fang_demo port.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  QUADRANTS, INITIAL_PLOTS, STARTER_PLOT_IDS, WASTELAND_INIT,
  INITIAL_BUILDINGS, validatePlots,
} from '../../js/game/plots.js';

test('QUADRANTS has 4 quadrants with disjoint cellRange boxes', () => {
  const ids = Object.keys(QUADRANTS).sort();
  assert.deepEqual(ids, ['NE', 'NW', 'SE', 'SW']);
  for (const q of Object.values(QUADRANTS)) {
    assert.ok(q.cellRange.x[0] <= q.cellRange.x[1]);
    assert.ok(q.cellRange.y[0] <= q.cellRange.y[1]);
  }
});

test('INITIAL_PLOTS has exactly 39 plots', () => {
  assert.equal(INITIAL_PLOTS.length, 39);
});

test('every plot belongs to its declared quadrant cellRange', () => {
  for (const p of INITIAL_PLOTS) {
    const q = QUADRANTS[p.quadrant];
    assert.ok(q, `${p.id} has unknown quadrant ${p.quadrant}`);
    for (const c of p.cells) {
      assert.ok(c.x >= q.cellRange.x[0] && c.x <= q.cellRange.x[1],
        `${p.id} cell (${c.x},${c.y}) outside quadrant ${p.quadrant} x range`);
      assert.ok(c.y >= q.cellRange.y[0] && c.y <= q.cellRange.y[1],
        `${p.id} cell (${c.x},${c.y}) outside quadrant ${p.quadrant} y range`);
    }
  }
});

test('STARTER_PLOT_IDS has 4 plots, one per quadrant, all status=empty', () => {
  assert.equal(STARTER_PLOT_IDS.length, 4);
  const byId = new Map(INITIAL_PLOTS.map(p => [p.id, p]));
  const quads = new Set();
  for (const id of STARTER_PLOT_IDS) {
    const p = byId.get(id);
    assert.ok(p, `unknown starter id ${id}`);
    assert.equal(p.status, 'empty', `${id} should be empty`);
    quads.add(p.quadrant);
  }
  assert.equal(quads.size, 4, 'starters span all 4 quadrants');
});

test('WASTELAND_INIT covers 31 plots and matches status=wasteland', () => {
  assert.equal(WASTELAND_INIT.length, 31);
  const wastelandPlots = INITIAL_PLOTS.filter(p => p.status === 'wasteland');
  assert.equal(wastelandPlots.length, 31);
});

test('wasteland unlockMode aligns with type (permission for templeDispute/govSealed, direct for oldRuin/lowland)', () => {
  for (const p of INITIAL_PLOTS) {
    if (p.status !== 'wasteland') continue;
    const expected = ['templeDispute', 'govSealed'].includes(p.wasteland.type)
      ? 'permission' : 'direct';
    assert.equal(p.wasteland.unlockMode, expected,
      `${p.id} type=${p.wasteland.type} expected ${expected}`);
  }
});

test('INITIAL_BUILDINGS lists 4 ids — 1 temple + 3 houses', () => {
  assert.deepEqual(INITIAL_BUILDINGS.sort(),
    ['ciDengTemple', 'house-01', 'house-02', 'house-03']);
  for (const id of INITIAL_BUILDINGS) {
    const p = INITIAL_PLOTS.find(pl => pl.building === id);
    assert.ok(p, `INITIAL_BUILDINGS id ${id} not bound to any plot`);
    assert.equal(p.status, 'built');
  }
});

test('no two plots share a cell', () => {
  const seen = new Map();
  for (const p of INITIAL_PLOTS) {
    for (const c of p.cells) {
      const k = `${c.x},${c.y}`;
      assert.ok(!seen.has(k),
        `cell (${c.x},${c.y}) is in both ${seen.get(k)} and ${p.id}`);
      seen.set(k, p.id);
    }
  }
});

test('validatePlots() returns true (import-time self-check passed)', () => {
  assert.equal(validatePlots(), true);
});
