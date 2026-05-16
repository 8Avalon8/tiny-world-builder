// src/agents/movement.js
// PR1: 从 routines.js 抽出的共享移动工具。permanent 与 transient 都通过这里调，
// 不复制 BFS 逻辑。

import { state } from '../state.js';
import { findPath, nearestWalkable } from '../walkmap.js';

export const ARRIVE_EPSILON = 0.04;
export const STAGGER_BUDGET_PER_FRAME = 24;

let _pathBudgetUsed = 0;
let _pathBudgetFrame = -1;

function ensureFrameBudget() {
  const bucket = Math.floor(performance.now() / 16);
  if (bucket !== _pathBudgetFrame) {
    _pathBudgetFrame = bucket;
    _pathBudgetUsed = 0;
  }
}

export function snapWalkable(c) {
  if (!c) return null;
  return nearestWalkable(c.x, c.y);
}

// 给 a 设新目标 cell，触发 BFS（受每帧预算限制）。
// 返回 true=已算路径，false=本帧预算耗尽（pendingPath=true，下一帧补算）。
export function setTargetCell(a, cell) {
  if (!cell) { a.target = null; a.path = null; return false; }
  const snapped = snapWalkable(cell);
  if (!snapped) { a.target = null; a.path = null; return false; }
  ensureFrameBudget();
  if (_pathBudgetUsed >= STAGGER_BUDGET_PER_FRAME) {
    a.target = snapped;
    a.path = null;
    a.pendingPath = true;
    return false;
  }
  _pathBudgetUsed++;
  a.target = snapped;
  const fromX = Math.round(a.x);
  const fromY = Math.round(a.y);
  a.path = findPath(fromX, fromY, snapped.x, snapped.y) || [];
  a.pendingPath = false;
  return true;
}

// 走向 path[0] 中心一步。speed: cell/秒。
// 返回 true=本步消耗掉一个 waypoint。
export function advancePath(a, dt, speed) {
  if (!a.path || a.path.length === 0) return false;
  const next = a.path[0];
  const tx = next.x + 0.5;
  const ty = next.y + 0.5;
  const dx = tx - a.x;
  const dy = ty - a.y;
  const dist = Math.hypot(dx, dy);
  if (dist < ARRIVE_EPSILON) {
    a.x = tx;
    a.y = ty;
    a.path.shift();
    return true;
  }
  const step = Math.min(dist, speed * dt);
  a.x += (dx / dist) * step;
  a.y += (dy / dist) * step;
  a.lastMoveAt = performance.now();
  return false;
}

// 在 (lingerAnchorX, lingerAnchorY) 周围 0.4 cell 内做缓动 wander。
// 减 lingerLeft；返回 true=lingerLeft 用尽。
export function lingerStep(a, dt) {
  a.lingerLeft = (a.lingerLeft || 0) - dt;
  if (!a.wanderVx || performance.now() >= (a.wanderTurnAt || 0)) {
    const ang = Math.random() * Math.PI * 2;
    a.wanderVx = Math.cos(ang) * 0.18;
    a.wanderVy = Math.sin(ang) * 0.18;
    a.wanderTurnAt = performance.now() + 800 + Math.random() * 1200;
  }
  const nx = a.x + a.wanderVx * dt;
  const ny = a.y + a.wanderVy * dt;
  const ax = a.lingerAnchorX, ay = a.lingerAnchorY;
  const dx = nx - ax, dy = ny - ay;
  const d = Math.hypot(dx, dy);
  if (d <= 0.4) {
    a.x = nx; a.y = ny;
    if (d > 0.05) a.lastMoveAt = performance.now();
  } else {
    a.x = ax + dx / d * 0.4;
    a.y = ay + dy / d * 0.4;
    a.wanderTurnAt = 0;
  }
  return a.lingerLeft <= 0;
}

// 重置每帧预算（测试用，正常运行不需要）
export function resetPathBudgetForTest() {
  _pathBudgetFrame = -1;
  _pathBudgetUsed = 0;
}
