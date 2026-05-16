// src/world/plots.js
// 4 象限元数据 + 39 预切地块 + 4 初始建筑。
// 网格坐标系：x ∈ [0,15]，y ∈ [0,15]。
// 十字街占 x ∈ [7,8] 全列 + y ∈ [7,8] 全行；中心 2×2 (7,7)/(8,7)/(7,8)/(8,8) 是井。
// 4 象限边界见下方 QUADRANTS。

export const QUADRANTS = {
  NE: { id: 'NE', name: '东北', label: '清静宅地', cellRange: { x: [9, 15], y: [0, 6] } },
  NW: { id: 'NW', name: '西北', label: '寺庙文教', cellRange: { x: [0, 6],  y: [0, 6] } },
  SE: { id: 'SE', name: '东南', label: '民居新户', cellRange: { x: [9, 15], y: [9, 15] } },
  SW: { id: 'SW', name: '西南', label: '商贩外来', cellRange: { x: [0, 6],  y: [9, 15] } },
};

// 工具：根据 origin + size 展开 cells 数组
function expand(origin, w, h) {
  const cells = [];
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) {
      cells.push({ x: origin.x + dx, y: origin.y + dy });
    }
  }
  return cells;
}

function plot(id, quadrant, ox, oy, w, h, doorX, doorY, mergeableWith = [], building = null) {
  return {
    id,
    quadrant,
    origin: { x: ox, y: oy },
    size: { w, h },
    cells: expand({ x: ox, y: oy }, w, h),
    status: building ? 'built' : 'empty',
    mergedInto: null,
    building,
    mergeableWith,
    project: null,
    doorCell: { x: doorX, y: doorY },
    wasteland: null,
  };
}

export const INITIAL_PLOTS = [
  // ===== NW 寺庙文教（x[0,6] y[0,6]）=====
  // 慈灯寺 3×3 在 (1,1)，门朝南到 (2,4)
  plot('NW-01', 'NW', 1, 1, 3, 3, 2, 4, [], 'ciDengTemple'),
  // 3 个 2×2 中地块，互相 mergeable
  plot('NW-02', 'NW', 5, 0, 2, 2, 4, 1, ['NW-03', 'NW-04']),
  plot('NW-03', 'NW', 5, 3, 2, 2, 4, 4, ['NW-02', 'NW-04']),
  plot('NW-04', 'NW', 0, 5, 2, 2, 2, 5, ['NW-02', 'NW-03']),
  // 4 个 1×1 小地块
  plot('NW-05', 'NW', 4, 0, 1, 1, 4, 1),
  plot('NW-06', 'NW', 0, 0, 1, 1, 0, 1),
  plot('NW-07', 'NW', 4, 5, 1, 1, 4, 4),
  plot('NW-08', 'NW', 4, 6, 1, 1, 5, 6),

  // ===== NE 清静宅地（x[9,15] y[0,6]）=====
  // 4 个 2×2 中地块，互相 mergeable
  plot('NE-01', 'NE', 9,  0, 2, 2, 9,  2, ['NE-02', 'NE-03', 'NE-04']),
  plot('NE-02', 'NE', 12, 0, 2, 2, 12, 2, ['NE-01', 'NE-03', 'NE-04']),
  plot('NE-03', 'NE', 9,  4, 2, 2, 9,  3, ['NE-01', 'NE-02', 'NE-04']),
  plot('NE-04', 'NE', 12, 4, 2, 2, 12, 3, ['NE-01', 'NE-02', 'NE-03']),
  // 2 个 1×2 + 2 个 1×1
  plot('NE-05', 'NE', 14, 0, 1, 2, 14, 2),
  plot('NE-06', 'NE', 14, 4, 1, 2, 14, 3),
  plot('NE-07', 'NE', 11, 0, 1, 1, 11, 1),
  plot('NE-08', 'NE', 11, 6, 1, 1, 11, 5),

  // ===== SW 商贩外来（x[0,6] y[9,15]）=====
  // 6 个 1×1
  plot('SW-01', 'SW', 0, 9,  1, 1, 1, 9),
  plot('SW-02', 'SW', 0, 11, 1, 1, 1, 11),
  plot('SW-03', 'SW', 0, 13, 1, 1, 1, 13),
  plot('SW-04', 'SW', 0, 15, 1, 1, 1, 15),
  // SW-05 原 doorCell (5,9) 落在 SW-08 cells 内，改朝南到 (6,10)
  plot('SW-05', 'SW', 6, 9,  1, 1, 6, 10),
  // SW-06 原 doorCell (5,11) 落在 SW-11 cells 内，改朝南到 (6,12)
  plot('SW-06', 'SW', 6, 11, 1, 1, 6, 12),
  // 3 个 1×2
  plot('SW-07', 'SW', 2, 9,  2, 1, 2, 10, ['SW-09']),
  plot('SW-08', 'SW', 4, 9,  2, 1, 4, 10),
  plot('SW-09', 'SW', 2, 14, 2, 1, 2, 13, ['SW-07']),
  // 2 个 2×2
  plot('SW-10', 'SW', 2, 11, 2, 2, 1, 12),
  plot('SW-11', 'SW', 4, 11, 2, 2, 4, 13),

  // ===== SE 民居新户（x[9,15] y[9,15]）=====
  // 8 个 1×1（其中 SE-01/02/03 为开局民宅）
  plot('SE-01', 'SE', 10, 10, 1, 1, 10, 9, [], 'house-01'),
  // SE-02 原 doorCell (12,10) 落在 SE-09 cells 内，改朝南到 (12,12)
  plot('SE-02', 'SE', 12, 11, 1, 1, 12, 12, [], 'house-02'),
  plot('SE-03', 'SE', 10, 13, 1, 1, 10, 14, [], 'house-03'),
  plot('SE-04', 'SE', 9,  9,  1, 1, 9,  10),
  plot('SE-05', 'SE', 14, 9,  1, 1, 14, 10),
  plot('SE-06', 'SE', 9,  15, 1, 1, 9,  14),
  plot('SE-07', 'SE', 14, 13, 1, 1, 13, 13),
  plot('SE-08', 'SE', 14, 15, 1, 1, 14, 14),
  // 4 个 1×2
  plot('SE-09', 'SE', 12, 9,  1, 2, 11, 9),
  plot('SE-10', 'SE', 14, 11, 1, 2, 13, 11),
  plot('SE-11', 'SE', 9,  12, 1, 2, 9,  11),
  plot('SE-12', 'SE', 12, 14, 1, 2, 11, 14),
  // SE-13 已删除（原计划 2×2 与上方 1×2 全部冲突；按计划文档指示保留 SE 12 个地块）
];

// === slice-9（地块解锁）开局荒地分配 ===
// 4 块 starter empty（每象限 1 块），其余 31 块按象限主题划分荒地类型。
export const STARTER_PLOT_IDS = ['NW-08', 'NE-08', 'SW-05', 'SE-04'];

// 6 + 7 + 10 + 8 = 31 块 wasteland
export const WASTELAND_INIT = [
  // NW 寺产争议地（按距慈灯寺 NW-01 远近分 tier，远=tier1）
  ['NW-02', 'templeDispute', 1],
  ['NW-06', 'templeDispute', 1],
  ['NW-03', 'templeDispute', 2],
  ['NW-05', 'templeDispute', 2],
  ['NW-04', 'templeDispute', 3],
  ['NW-07', 'templeDispute', 3],
  // NE 官府封存地（按距坊门远近分 tier，远=tier1）
  ['NE-05', 'govSealed', 1],
  ['NE-06', 'govSealed', 1],
  ['NE-07', 'govSealed', 1],
  ['NE-01', 'govSealed', 2],
  ['NE-02', 'govSealed', 2],
  ['NE-03', 'govSealed', 3],
  ['NE-04', 'govSealed', 3],
  // SW 低洼地（无 tier）
  ['SW-01', 'lowland', null],
  ['SW-02', 'lowland', null],
  ['SW-03', 'lowland', null],
  ['SW-04', 'lowland', null],
  ['SW-06', 'lowland', null],
  ['SW-07', 'lowland', null],
  ['SW-08', 'lowland', null],
  ['SW-09', 'lowland', null],
  ['SW-10', 'lowland', null],
  ['SW-11', 'lowland', null],
  // SE 旧宅废墟（无 tier）
  ['SE-05', 'oldRuin', null],
  ['SE-06', 'oldRuin', null],
  ['SE-07', 'oldRuin', null],
  ['SE-08', 'oldRuin', null],
  ['SE-09', 'oldRuin', null],
  ['SE-10', 'oldRuin', null],
  ['SE-11', 'oldRuin', null],
  ['SE-12', 'oldRuin', null],
];

const PERMISSION_TYPES = new Set(['templeDispute', 'govSealed']);
const DIRECT_TYPES = new Set(['oldRuin', 'lowland']);

for (const [id, type, tier] of WASTELAND_INIT) {
  const p = INITIAL_PLOTS.find(pl => pl.id === id);
  if (!p) throw new Error(`[plots.js] WASTELAND_INIT 引用未知 plotId ${id}`);
  if (p.status === 'built') throw new Error(`[plots.js] ${id} 已建成，不能改 wasteland`);
  if (STARTER_PLOT_IDS.includes(id)) throw new Error(`[plots.js] ${id} 是 starter empty，不能再改 wasteland`);
  p.status = 'wasteland';
  p.wasteland = {
    type,
    unlockMode: PERMISSION_TYPES.has(type) ? 'permission' : 'direct',
    tier,
    workDaysLeft: null,
  };
}

// INITIAL_BUILDINGS：建筑模板（id 必须与 BUILDINGS_BY_ID 对应，且开局已被某 plot.building 引用）
export const INITIAL_BUILDINGS = ['ciDengTemple', 'house-01', 'house-02', 'house-03'];

// 自校验：导入时即刻执行，发现违规直接抛错（fail loudly）
export function validatePlots() {
  const plotsById = new Map(INITIAL_PLOTS.map(p => [p.id, p]));
  const starterSet = new Set();
  const wastelandSet = new Set();

  for (const id of STARTER_PLOT_IDS) {
    if (starterSet.has(id)) {
      throw new Error(`[plots.js] STARTER_PLOT_IDS 存在重复 plotId ${id}`);
    }
    starterSet.add(id);
    if (!plotsById.has(id)) {
      throw new Error(`[plots.js] STARTER_PLOT_IDS 引用未知 plotId ${id}`);
    }
  }

  for (const [id] of WASTELAND_INIT) {
    if (wastelandSet.has(id)) {
      throw new Error(`[plots.js] WASTELAND_INIT 存在重复 plotId ${id}`);
    }
    wastelandSet.add(id);
    if (!plotsById.has(id)) {
      throw new Error(`[plots.js] WASTELAND_INIT 引用未知 plotId ${id}`);
    }
  }

  const occupied = new Map(); // "x,y" → plotId
  for (const p of INITIAL_PLOTS) {
    for (const c of p.cells) {
      const k = `${c.x},${c.y}`;
      if (occupied.has(k)) {
        throw new Error(`[plots.js] cell (${c.x},${c.y}) occupied by both ${occupied.get(k)} and ${p.id}`);
      }
      occupied.set(k, p.id);
      // cells 必须在象限范围内
      const q = QUADRANTS[p.quadrant].cellRange;
      if (c.x < q.x[0] || c.x > q.x[1] || c.y < q.y[0] || c.y > q.y[1]) {
        throw new Error(`[plots.js] ${p.id} cell (${c.x},${c.y}) outside quadrant ${p.quadrant}`);
      }
    }
    // doorCell 不能在 plot.cells 内
    for (const c of p.cells) {
      if (c.x === p.doorCell.x && c.y === p.doorCell.y) {
        throw new Error(`[plots.js] ${p.id} doorCell (${p.doorCell.x},${p.doorCell.y}) overlaps own cells`);
      }
    }
    // doorCell 必须紧邻 plot 的某个 cell（4 邻接）
    const adj = p.cells.some(c => Math.abs(c.x - p.doorCell.x) + Math.abs(c.y - p.doorCell.y) === 1);
    if (!adj) {
      throw new Error(`[plots.js] ${p.id} doorCell (${p.doorCell.x},${p.doorCell.y}) not adjacent to any cell`);
    }
  }
  // doorCell 不能落在任何其他 plot.cells 内
  for (const p of INITIAL_PLOTS) {
    const k = `${p.doorCell.x},${p.doorCell.y}`;
    if (occupied.has(k)) {
      throw new Error(`[plots.js] ${p.id} doorCell (${p.doorCell.x},${p.doorCell.y}) lands inside ${occupied.get(k)} cells`);
    }
  }
  // 已建成 plots 的 building id 必须在 INITIAL_BUILDINGS 列表里
  for (const p of INITIAL_PLOTS) {
    if (p.building && !INITIAL_BUILDINGS.includes(p.building)) {
      throw new Error(`[plots.js] ${p.id} building '${p.building}' not in INITIAL_BUILDINGS`);
    }
  }
  // starter / wasteland 归属校验
  for (const p of INITIAL_PLOTS) {
    const inStarter = starterSet.has(p.id);
    const inWasteland = wastelandSet.has(p.id);
    const isBuiltPlot = p.building != null || p.status === 'built';

    if (isBuiltPlot) {
      if (inStarter) {
        throw new Error(`[plots.js] built plot ${p.id} 不能出现在 starter 集合里`);
      }
      if (inWasteland) {
        throw new Error(`[plots.js] built plot ${p.id} 不能出现在 wasteland 集合里`);
      }
      continue;
    }

    if (inStarter && inWasteland) {
      throw new Error(`[plots.js] 非 built plot ${p.id} 必须且只能属于 starter empty 或 wasteland 之一`);
    }
    if (!inStarter && !inWasteland) {
      if (p.status === 'empty') {
        throw new Error(`[plots.js] 非 starter 的 empty plot ${p.id} 不允许漏网；每个非 built plot 必须且只能属于 starter empty 或 wasteland 之一`);
      }
      throw new Error(`[plots.js] 非 built plot ${p.id} 必须且只能属于 starter empty 或 wasteland 之一`);
    }
    if (inStarter && p.status !== 'empty') {
      throw new Error(`[plots.js] starter empty ${p.id} status 必须是 empty，当前 ${p.status}`);
    }
  }
  // wasteland 字段校验
  for (const p of INITIAL_PLOTS) {
    if (p.status === 'wasteland') {
      if (!p.wasteland) throw new Error(`[plots.js] ${p.id} status=wasteland 但缺 wasteland 字段`);
      const { type, unlockMode, tier } = p.wasteland;
      if (!DIRECT_TYPES.has(type) && !PERMISSION_TYPES.has(type)) {
        throw new Error(`[plots.js] ${p.id} 未知 wasteland.type ${type}`);
      }
      if (PERMISSION_TYPES.has(type) && ![1, 2, 3].includes(tier)) {
        throw new Error(`[plots.js] ${p.id} permission 类型必须有 tier ∈ {1,2,3}，当前 ${tier}`);
      }
      if (DIRECT_TYPES.has(type) && tier !== null) {
        throw new Error(`[plots.js] ${p.id} direct 类型 tier 必须为 null，当前 ${tier}`);
      }
      const expectedMode = PERMISSION_TYPES.has(type) ? 'permission' : 'direct';
      if (unlockMode !== expectedMode) {
        throw new Error(`[plots.js] ${p.id} unlockMode 不匹配 type`);
      }
    } else if (p.wasteland !== null) {
      throw new Error(`[plots.js] ${p.id} status=${p.status} 但有 wasteland 字段`);
    }
  }
  return true;
}

// 启动自检：发现数据冲突立刻抛错
validatePlots();
