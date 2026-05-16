// src/world/walkmap.js
// 16×16 可走性表 + isWalkable / nearestWalkable 查询。
// 启动时由 main.js 调用 buildWalkmap(state) 一次。
// 后续 spec 增删 plot 时也要重新调用。

import { state } from './state.js';
import { GATE_CELLS } from './gates.js';

const W = 16;
const H = 16;

// walkmap 版本号：每次 buildWalkmap 自增，用于失效路径缓存。
let walkmapVersion = 0;
export function getWalkmapVersion() { return walkmapVersion; }

// 路径缓存：key = `${fromX},${fromY}->${toX},${toY}|${walkmapVersion}`
// 命中时返回 cell 序列的浅克隆（path 会被 agent 消费 shift()）。
const PATH_CACHE = new Map();
const PATH_CACHE_LIMIT = 256;

function inBounds(x, y) {
  return x >= 0 && x < W && y >= 0 && y < H;
}

function isStreetCell(x, y) {
  // 十字街：x∈[7,8] 任意 y，或 y∈[7,8] 任意 x
  return (x === 7 || x === 8) || (y === 7 || y === 8);
}

function isPlotInteriorCell(x, y) {
  // 检查 (x,y) 是否落在某个 plot 的 cells 内
  for (const p of state.plots) {
    if (p.status === 'mergedInto') continue;
    for (const c of p.cells) {
      if (c.x === x && c.y === y) return true;
    }
  }
  return false;
}

export function buildWalkmap() {
  const map = Array.from({ length: W }, () => new Array(H).fill(false));
  const gateSet = new Set(GATE_CELLS.map(g => `${g.x},${g.y}`));

  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      // 门 cell 可走
      if (gateSet.has(`${x},${y}`)) { map[x][y] = true; continue; }
      // 十字街可走（井所在 2×2 也属于十字街中心，行人可绕井而过）
      if (isStreetCell(x, y)) { map[x][y] = true; continue; }
      // 象限内：plot 内部不可走，其余（小巷）可走
      if (isPlotInteriorCell(x, y)) { map[x][y] = false; continue; }
      map[x][y] = true;
    }
  }

  // 所有 doorCell 强制可走（防御：若 plot 数据正确则本来就可走）
  for (const p of state.plots) {
    if (p.status === 'mergedInto') continue;
    const d = p.doorCell;
    if (inBounds(d.x, d.y)) map[d.x][d.y] = true;
  }

  state.walkmap = map;
  walkmapVersion += 1;
  PATH_CACHE.clear();
  return map;
}

export function isWalkable(x, y) {
  if (!inBounds(x, y)) return false;
  if (!state.walkmap) return false;
  return state.walkmap[x][y];
}

// BFS 找最近可走格（用于把浮点 agent 吸附到合法格）
export function nearestWalkable(x, y) {
  const sx = Math.round(x);
  const sy = Math.round(y);
  if (isWalkable(sx, sy)) return { x: sx, y: sy };
  const seen = new Set([`${sx},${sy}`]);
  const queue = [{ x: sx, y: sy }];
  while (queue.length) {
    const cur = queue.shift();
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      const k = `${nx},${ny}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (!inBounds(nx, ny)) continue;
      if (isWalkable(nx, ny)) return { x: nx, y: ny };
      queue.push({ x: nx, y: ny });
    }
  }
  return { x: sx, y: sy }; // fallback：原位
}

// 给定起点和终点（都是格坐标），返回下一步要走的相邻可走格
// 贪心：选 4 邻里 walkable 且 (|nx-tx|+|ny-ty|) 最小的一个
// 注：会震荡。优先用 findPath；本函数仅作 fallback。
export function nextStepToward(fromX, fromY, toX, toY) {
  let best = null;
  let bestDist = Infinity;
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const nx = fromX + dx, ny = fromY + dy;
    if (!isWalkable(nx, ny)) continue;
    const d = Math.abs(nx - toX) + Math.abs(ny - toY);
    if (d < bestDist) { bestDist = d; best = { x: nx, y: ny }; }
  }
  return best;
}

// BFS 真路径：返回从 from 到 to（含终点，不含起点）的 cell 序列；不可达返回 null。
// 16×16 网格 BFS 单次 < 1ms，每个 agent 选目标时调一次即可。
//
// 优化点：
// 1) 队列改为 head 指针推进，避免 256 节点上的 Array.shift() O(n)；
// 2) 路径按 (from,to,walkmapVersion) 缓存，热门路径（井←→坊门）只算一次；
// 3) 命中缓存时返回深拷贝，避免被 agent 的 shift() 破坏共享数组。
export function findPath(fromX, fromY, toX, toY) {
  if (!isWalkable(toX, toY)) {
    const w = nearestWalkable(toX, toY);
    toX = w.x; toY = w.y;
  }
  if (fromX === toX && fromY === toY) return [];

  const cacheKey = `${fromX},${fromY}->${toX},${toY}|${walkmapVersion}`;
  const hit = PATH_CACHE.get(cacheKey);
  if (hit) return hit.map(c => ({ x: c.x, y: c.y }));

  // cameFrom 用扁平数组（idx = x*H+y），比 Map 快得多。
  const cameFrom = new Int16Array(W * H).fill(-1);
  const SELF = -2;  // 起点哨兵
  cameFrom[fromX * H + fromY] = SELF;
  const queue = new Int16Array(W * H * 2);
  let qHead = 0;
  let qTail = 0;
  queue[qTail++] = fromX;
  queue[qTail++] = fromY;
  let found = false;
  const NEIGHBORS = [1, 0, -1, 0, 0, 1, 0, -1];
  while (qHead < qTail) {
    const cx = queue[qHead++];
    const cy = queue[qHead++];
    if (cx === toX && cy === toY) { found = true; break; }
    for (let i = 0; i < 8; i += 2) {
      const nx = cx + NEIGHBORS[i];
      const ny = cy + NEIGHBORS[i + 1];
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const idx = nx * H + ny;
      if (cameFrom[idx] !== -1) continue;
      if (!state.walkmap[nx][ny]) continue;
      // 编码 parent 方向：0=+x,1=-x,2=+y,3=-y（方便回溯，不用存坐标）
      let dir;
      if (NEIGHBORS[i] === 1) dir = 1;        // 来自左 (-x)
      else if (NEIGHBORS[i] === -1) dir = 0;  // 来自右 (+x)
      else if (NEIGHBORS[i + 1] === 1) dir = 3; // 来自上 (-y)
      else dir = 2;                            // 来自下 (+y)
      cameFrom[idx] = dir;
      queue[qTail++] = nx;
      queue[qTail++] = ny;
    }
  }
  if (!found) return null;
  // 回溯
  const path = [];
  let cx = toX, cy = toY;
  while (!(cx === fromX && cy === fromY)) {
    path.push({ x: cx, y: cy });
    const dir = cameFrom[cx * H + cy];
    if (dir === 0) cx += 1;
    else if (dir === 1) cx -= 1;
    else if (dir === 2) cy += 1;
    else if (dir === 3) cy -= 1;
    else break;
  }
  path.reverse();

  if (PATH_CACHE.size >= PATH_CACHE_LIMIT) {
    // 简单 LRU：超出时清空；16×16 上选 ~50 条热门路径就够。
    PATH_CACHE.clear();
  }
  PATH_CACHE.set(cacheKey, path.map(c => ({ x: c.x, y: c.y })));
  return path;
}
