// test/spatial.test.js
// slice-1 空间谓词单测：覆盖 in / within / adjacentTo / notAdjacentTo
// 以及 plotMatchesPredicates / findMatchingPlots / countSatisfied。

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  isInQuadrant, isWithin, isAdjacentTo, isNotAdjacentTo,
  plotMatchesPredicates, findMatchingPlots, countSatisfied,
  WELL_CELLS,
} from '../../js/game/spatial.js';
import { makeFakeState, makeBuiltHousePlot, makeBuiltIncensePlot, registerBuildings } from './_helpers.js';

// 制造一个空 SE 地块（cell 在 (x,y)）
function emptyPlot(id, x, y, q = 'SE') {
  return {
    id, quadrant: q,
    origin: { x, y }, size: { w: 1, h: 1 },
    cells: [{ x, y }],
    status: 'empty',
    building: null, project: null,
    mergedInto: null, mergeableWith: [],
    doorCell: { x, y: y + 1 },
  };
}

function emptyRectPlot(id, ox, oy, w, h, q = 'SE') {
  const cells = [];
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) {
      cells.push({ x: ox + dx, y: oy + dy });
    }
  }
  return {
    id, quadrant: q,
    origin: { x: ox, y: oy }, size: { w, h },
    cells,
    status: 'empty',
    building: null, project: null,
    mergedInto: null, mergeableWith: [],
    doorCell: { x: ox, y: oy + h },
  };
}

test('WELL_CELLS 占据中心 2×2 = (7,7)/(8,7)/(7,8)/(8,8)', () => {
  assert.equal(WELL_CELLS.length, 4);
  const set = new Set(WELL_CELLS.map(c => `${c.x},${c.y}`));
  assert.ok(set.has('7,7') && set.has('8,7') && set.has('7,8') && set.has('8,8'));
});

test('isInQuadrant: SE 地块在 SE 象限', () => {
  const p = emptyPlot('SE-04', 9, 9, 'SE');
  assert.equal(isInQuadrant(p, 'SE'), true);
  assert.equal(isInQuadrant(p, 'NW'), false);
});

test('isWithin: SE-04 (9,9) 距井曼哈顿 2 → within well 2 = true', () => {
  const s = makeFakeState();
  const p = emptyPlot('SE-04', 9, 9);
  assert.equal(isWithin(s, p, 'well', 2), true);
  assert.equal(isWithin(s, p, 'well', 1), false);
});

test('isWithin: SE-01 (10,10) 距井 4 → within well 2 = false, within well 4 = true', () => {
  const s = makeFakeState();
  const p = emptyPlot('SE-01', 10, 10);
  assert.equal(isWithin(s, p, 'well', 2), false);
  assert.equal(isWithin(s, p, 'well', 4), true);
});

test('isWithin: 锚点不存在（无该 kind 已建建筑）→ false', () => {
  const s = makeFakeState();
  const p = emptyPlot('SE-04', 9, 9);
  assert.equal(isWithin(s, p, 'incense', 5), false);
});

test('isAdjacentTo: 与已建香铺曼哈顿距离 ≤1 = true', () => {
  const s = makeFakeState();
  const incense = makeBuiltIncensePlot('1'); // cells (4,11)~(5,12) SW
  s.plots = [incense];
  registerBuildings(s, s.plots);
  const adj = emptyPlot('test-adj', 6, 11, 'SW'); // 与 (5,11) 距离 1
  const far = emptyPlot('test-far', 0, 0, 'NW'); // 远
  assert.equal(isAdjacentTo(s, adj, 'incense'), true);
  assert.equal(isAdjacentTo(s, far, 'incense'), false);
});

test('isNotAdjacentTo: 锚点不存在 → true（"远离"约束自动满足）', () => {
  const s = makeFakeState();
  const p = emptyPlot('test', 5, 5, 'NW');
  assert.equal(isNotAdjacentTo(s, p, 'incense'), true);
});

test('isNotAdjacentTo: 与已建香铺距离 ≥2 → true', () => {
  const s = makeFakeState();
  s.plots = [makeBuiltIncensePlot('1')]; // (4,11)~(5,12)
  registerBuildings(s, s.plots);
  const far = emptyPlot('far', 0, 0, 'NW');
  const near = emptyPlot('near', 6, 11, 'SW'); // 距离 1
  assert.equal(isNotAdjacentTo(s, far, 'incense'), true);
  assert.equal(isNotAdjacentTo(s, near, 'incense'), false);
});

test('plotMatchesPredicates: 组合 in + within well 2', () => {
  const s = makeFakeState();
  const seClose = emptyPlot('SE-04', 9, 9, 'SE');
  const seFar   = emptyPlot('SE-01', 10, 10, 'SE');
  const swClose = emptyPlot('SW-05', 6, 9, 'SW');
  const spec = { build: 'house', in: 'SE', within: { well: 2 } };
  assert.equal(plotMatchesPredicates(s, seClose, spec), true);
  assert.equal(plotMatchesPredicates(s, seFar, spec), false);    // in SE 但不临井
  assert.equal(plotMatchesPredicates(s, swClose, spec), false);  // 临井但不在 SE
});

test('findMatchingPlots: 默认返回符合谓词的 empty 地块', () => {
  const s = makeFakeState();
  s.plots = [
    emptyPlot('SE-04', 9, 9),                  // 符合：empty + 临井
    emptyPlot('SE-01', 10, 10),                // 不符合：empty 但不临井
    {
      ...emptyPlot('SE-06', 9, 15),
      status: 'wasteland',
      wasteland: { type: 'oldRuin', unlockMode: 'direct', tier: null, workDaysLeft: null },
    },  // 不符合：wasteland
    makeBuiltHousePlot('1'),                   // 不符合：built
  ];
  registerBuildings(s, s.plots);
  const spec = { build: 'house', in: 'SE', within: { well: 2 } };
  const valid = findMatchingPlots(s, spec, 'available');
  assert.equal(valid.length, 1);
  assert.equal(valid[0].id, 'SE-04');
});

test('findMatchingPlots(satisfied): 已建符合的同 kind 建筑', () => {
  const s = makeFakeState();
  // 在 SE 区放 1 座已建房（cell (10,10)），不临井
  const builtFar = makeBuiltHousePlot('far');
  // 在 SE 区放 1 座已建房（cell (9,9)），临井
  const builtClose = { ...makeBuiltHousePlot('close'),
    origin: { x: 9, y: 9 }, cells: [{ x: 9, y: 9 }] };
  s.plots = [builtFar, builtClose];
  registerBuildings(s, s.plots);
  const spec = { build: 'house', in: 'SE', within: { well: 2 } };
  const sat = findMatchingPlots(s, spec, 'satisfied');
  assert.equal(sat.length, 1);
  assert.equal(sat[0].id, builtClose.id);
});

test('countSatisfied: 计数已建匹配建筑', () => {
  const s = makeFakeState();
  s.plots = [
    makeBuiltHousePlot('1'),  // SE (10,10) 不临井
    makeBuiltHousePlot('2'),  // SE (10,10) 不临井（同位置但 id 不同）
  ];
  // 强制错开避免同 cell 校验
  s.plots[1].origin = { x: 14, y: 9 };
  s.plots[1].cells = [{ x: 14, y: 9 }];
  registerBuildings(s, s.plots);
  // spec: 在 SE 区 + 距井 ≤4
  const spec = { build: 'house', in: 'SE', within: { well: 4 } };
  assert.equal(countSatisfied(s, spec), 1);  // 只有 (10,10) 距井=4
});

// slice-2 词表扩展：inAny + notAdjacentTo 数组
test('inAny: 多象限或语义', () => {
  const seP = emptyPlot('SE-04', 9, 9, 'SE');
  const swP = emptyPlot('SW-08', 4, 9, 'SW');
  const nwP = emptyPlot('NW-01', 1, 1, 'NW');
  const s = makeFakeState();
  const spec = { build: 'weaver', inAny: ['SE', 'SW'] };
  assert.equal(plotMatchesPredicates(s, seP, spec), true);
  assert.equal(plotMatchesPredicates(s, swP, spec), true);
  assert.equal(plotMatchesPredicates(s, nwP, spec), false);
});

test('notAdjacentTo 数组：多锚点全部需远离', () => {
  const s = makeFakeState();
  const incense = makeBuiltIncensePlot('1');
  const house = makeBuiltHousePlot('1');
  s.plots = [incense, house];
  registerBuildings(s, s.plots);
  // (6,11) 距 incense (5,11) = 1 → notAdjacentTo incense fails
  const adjIncense = emptyPlot('test1', 6, 11, 'SW');
  // (10,10) 距 house (10,10) = 0（重叠）→ notAdjacentTo house fails
  const onHouse = emptyPlot('test2', 10, 10, 'SE');
  // 远离两者
  const safe = emptyPlot('test3', 0, 0, 'NW');
  const spec = { build: 'weaver', notAdjacentTo: ['incense', 'house'] };
  assert.equal(plotMatchesPredicates(s, adjIncense, spec), false);
  assert.equal(plotMatchesPredicates(s, onHouse, spec), false);
  assert.equal(plotMatchesPredicates(s, safe, spec), true);
});

test('notAdjacentTo 字符串形式仍兼容', () => {
  const s = makeFakeState();
  s.plots = [makeBuiltIncensePlot('1')];
  registerBuildings(s, s.plots);
  const safe = emptyPlot('test', 0, 0, 'NW');
  assert.equal(plotMatchesPredicates(s, safe, { build: 'x', notAdjacentTo: 'incense' }), true);
});

test('组合：inAny + notAdjacentTo 数组（slice-2 织棚承诺典型场景）', () => {
  const s = makeFakeState();
  const house = makeBuiltHousePlot('1');
  const incense = makeBuiltIncensePlot('1');
  const seSafe = emptyPlot('SE-safe', 9, 9, 'SE');
  const swSafe = emptyPlot('SW-safe', 0, 9, 'SW');
  const seBlockedByHouse = emptyPlot('SE-blocked-house', 10, 10, 'SE');
  const swBlockedByIncense = emptyPlot('SW-blocked-incense', 6, 11, 'SW');
  const nwWrongQuadrant = emptyPlot('NW-wrong', 0, 0, 'NW');
  s.plots = [house, incense, seSafe, swSafe, seBlockedByHouse, swBlockedByIncense, nwWrongQuadrant];
  registerBuildings(s, s.plots);

  const spec = { build: 'weaver', inAny: ['SE', 'SW'], notAdjacentTo: ['house', 'incense'] };
  const valid = findMatchingPlots(s, spec, 'available');
  const ids = valid.map(p => p.id).sort();
  assert.deepEqual(ids, ['SE-safe', 'SW-safe']);
});

// === slice-4：size 谓词 + reservable 模式 ===

test('size: 严格匹配宽高', () => {
  const s = makeFakeState();
  const p1x1 = emptyPlot('a', 5, 5, 'NE');
  const p2x2 = { ...emptyPlot('b', 11, 4, 'NE'),
    origin: { x: 11, y: 4 }, size: { w: 2, h: 2 },
    cells: [{ x: 11, y: 4 }, { x: 12, y: 4 }, { x: 11, y: 5 }, { x: 12, y: 5 }] };
  const spec = { build: 'mansion', size: { w: 2, h: 2 } };
  assert.equal(plotMatchesPredicates(s, p1x1, spec), false);
  assert.equal(plotMatchesPredicates(s, p2x2, spec), true);
});

test('size: 旋转兼容 1×2 ↔ 2×1', () => {
  const s = makeFakeState();
  const p1x2 = { ...emptyPlot('a', 5, 5, 'SE'),
    size: { w: 1, h: 2 }, cells: [{ x: 5, y: 5 }, { x: 5, y: 6 }] };
  const p2x1 = { ...emptyPlot('b', 5, 5, 'SE'),
    size: { w: 2, h: 1 }, cells: [{ x: 5, y: 5 }, { x: 6, y: 5 }] };
  const spec = { build: 'weaver', size: { w: 1, h: 2 } };
  assert.equal(plotMatchesPredicates(s, p1x2, spec), true);
  assert.equal(plotMatchesPredicates(s, p2x1, spec), true);  // 旋转
});

test("countSatisfied(mode='reservable')：统计可预留空地块（达官承诺典型）", () => {
  const s = makeFakeState();
  s.plots = [
    emptyRectPlot('NE-2x2-a', 9, 0, 2, 2, 'NE'),
    emptyRectPlot('NE-2x2-b', 12, 0, 2, 2, 'NE'),
    emptyPlot('NE-1x1', 11, 4, 'NE'),
    emptyRectPlot('SW-2x2', 0, 9, 2, 2, 'SW'),
    {
      ...emptyRectPlot('NE-wasteland', 9, 4, 2, 2, 'NE'),
      status: 'wasteland',
      wasteland: { type: 'govSealed', unlockMode: 'permission', tier: 2, workDaysLeft: null },
    },
  ];
  // 达官承诺：1 块 NE 区 2×2 空地
  const spec = { build: 'mansion', count: 1, in: 'NE', size: { w: 2, h: 2 }, mode: 'reservable' };
  const n = countSatisfied(s, spec);
  assert.equal(n, 2);
});

test("countSatisfied(默认)：统计已建匹配 kind 地块（不被 reservable 影响）", () => {
  const s = makeFakeState();
  s.plots = [makeBuiltHousePlot('1'), makeBuiltHousePlot('2')];
  s.plots[1].origin = { x: 14, y: 9 };
  s.plots[1].cells = [{ x: 14, y: 9 }];
  registerBuildings(s, s.plots);
  const spec = { build: 'house', count: 1, in: 'SE' };  // 默认模式
  const n = countSatisfied(s, spec);
  assert.equal(n, 2);  // 两座已建房
});

