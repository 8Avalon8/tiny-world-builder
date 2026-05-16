// src/world/spatial.js
// 空间谓词求值器：用于「承诺」机制描述地块约束。
// v1 词表（仅 4 个谓词）：in / within / adjacentTo / notAdjacentTo。
// 距离 = 曼哈顿距离（地块的最近 cell 对最近 cell）。

// 中心井占据的 4 格（与 plots.js / center.js 一致）。
export const WELL_CELLS = [
  { x: 7, y: 7 }, { x: 8, y: 7 },
  { x: 7, y: 8 }, { x: 8, y: 8 },
];

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function minDistBetweenCells(cellsA, cellsB) {
  let min = Infinity;
  for (const a of cellsA) {
    for (const b of cellsB) {
      const d = manhattan(a, b);
      if (d < min) min = d;
    }
  }
  return min;
}

// 取「锚点」对应的 cells 集合。锚点可以是 'well' 或建筑 kind 字符串。
// 建筑锚点：所有 status==='built' 且 building.kind === anchor 的 plot 的 cells 全集。
function getAnchorCells(state, anchor) {
  if (anchor === 'well') return WELL_CELLS;
  const out = [];
  for (const p of state.plots) {
    if (p.status !== 'built') continue;
    const b = state.buildings[p.building];
    if (b && b.kind === anchor) out.push(...p.cells);
  }
  return out;
}

export function isInQuadrant(plot, quadrant) {
  return plot.quadrant === quadrant;
}

// 多象限「或」语义：plot.quadrant 在列表里
export function isInAnyQuadrant(plot, quadrants) {
  return Array.isArray(quadrants) && quadrants.includes(plot.quadrant);
}

// plot 与锚点的最近距离 ≤ dist。锚点不存在则返回 false。
export function isWithin(state, plot, anchor, dist) {
  const anchorCells = getAnchorCells(state, anchor);
  if (anchorCells.length === 0) return false;
  return minDistBetweenCells(plot.cells, anchorCells) <= dist;
}

// 与某 kind 已建建筑曼哈顿距离 ≤ 1（即贴邻或重叠/共线）。
export function isAdjacentTo(state, plot, anchor) {
  return isWithin(state, plot, anchor, 1);
}

// 与某 kind 已建建筑曼哈顿距离 ≥ 2（不贴邻）。
// 注意：若该 kind 不存在，返回 true（"远离"约束自动满足）。
export function isNotAdjacentTo(state, plot, anchor) {
  const anchorCells = getAnchorCells(state, anchor);
  if (anchorCells.length === 0) return true;
  return minDistBetweenCells(plot.cells, anchorCells) >= 2;
}

// 评估单条空间需求项。
// spec 字段（全可选）：
//   in: 'SE'                      — 单象限
//   inAny: ['SE','SW']            — 多象限或语义
//   within: { well: 2, house: 3 } — 多锚点距离全部 ≤ N
//   adjacentTo: 'well'            — 与锚点距离 ≤1
//   notAdjacentTo: 'incense'      — 与锚点距离 ≥2
//   notAdjacentTo: ['house','incense']  — 数组形式：每个锚点都需 ≥2
//   size: { w: 2, h: 2 }          — 地块尺寸需相符（含旋转，slice-4+）
// 这里只检查空间谓词部分，count/build/mode 由调用方处理。
export function plotMatchesPredicates(state, plot, spec) {
  if (spec.in && !isInQuadrant(plot, spec.in)) return false;
  if (spec.inAny && !isInAnyQuadrant(plot, spec.inAny)) return false;
  if (spec.size && !sizeFits(spec.size, plot.size)) return false;
  if (spec.within) {
    for (const [anchor, dist] of Object.entries(spec.within)) {
      if (!isWithin(state, plot, anchor, dist)) return false;
    }
  }
  if (spec.adjacentTo && !isAdjacentTo(state, plot, spec.adjacentTo)) return false;
  if (spec.notAdjacentTo) {
    const list = Array.isArray(spec.notAdjacentTo) ? spec.notAdjacentTo : [spec.notAdjacentTo];
    for (const anchor of list) {
      if (!isNotAdjacentTo(state, plot, anchor)) return false;
    }
  }
  return true;
}

// 地块尺寸匹配（允许旋转：1×2 spec 也匹配 2×1 plot）
function sizeFits(specSize, plotSize) {
  return (specSize.w === plotSize.w && specSize.h === plotSize.h) ||
         (specSize.w === plotSize.h && specSize.h === plotSize.w);
}

// 返回所有符合空间约束的「可用」地块（empty 或已建对应 kind）。
// mode: 'available'         → empty 地块（玩家可建）
//       'satisfied'         → status==='built' 且 building.kind===spec.build
//       'any'               → 两者并集
//       'building-or-built' → status==='building' 或 'built' 且对应 kind（slice-7 用）
export function findMatchingPlots(state, spec, mode = 'available') {
  const out = [];
  for (const p of state.plots) {
    if (mode === 'available' && p.status !== 'empty') continue;
    if (mode === 'satisfied') {
      if (p.status !== 'built') continue;
      const b = state.buildings[p.building];
      if (!b || b.kind !== spec.build) continue;
    }
    if (mode === 'any') {
      const isEmpty = p.status === 'empty';
      const isBuiltMatch = p.status === 'built' &&
        state.buildings[p.building]?.kind === spec.build;
      if (!isEmpty && !isBuiltMatch) continue;
    }
    if (mode === 'building-or-built') {
      // slice-7: mansion 项目在建中或已建即满足
      if (p.status === 'building') {
        if (!p.project || p.project.buildingType !== spec.build) continue;
      } else if (p.status === 'built') {
        const b = state.buildings[p.building];
        if (!b || b.kind !== spec.build) continue;
      } else {
        continue;
      }
    }
    if (!plotMatchesPredicates(state, p, spec)) continue;
    out.push(p);
  }
  return out;
}

// 计算某个空间需求项当前的进度。
// 默认（spec.mode 缺省）：统计已建成且 building.kind === spec.build 的地块。
// spec.mode === 'reservable'（slice-4+）：统计「可预留」的空地块（满足 size + 谓词），
//   语义为"留给未来某类建筑"。比如达官承诺要求 NE 区有 1 块 2×2 空地能给府邸。
export function countSatisfied(state, spec) {
  if (spec.mode === 'reservable') {
    return findMatchingPlots(state, spec, 'available').length;
  }
  if (spec.mode === 'building-or-built') {
    return findMatchingPlots(state, spec, 'building-or-built').length;
  }
  return findMatchingPlots(state, spec, 'satisfied').length;
}
