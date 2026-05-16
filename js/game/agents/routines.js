// src/agents/routines.js
// Spec #1+ 行为驱动：tickAgent 用 walkmap.findPath 做 BFS 寻路。
//
// 2026-04-26 重构：从「单次随机选目标 → 走完就再随机」改为
//   1) spawn 时按 type 写一份固定 schedule（建筑门 → 井 → 出门）
//   2) 走到下一个 waypoint → linger（夹带轻微 wander）→ 走下一个
//   3) schedule 走完 → 离坊从 fromGate 离开
// 这样上百名 agent 同屏时行为不再像「布朗运动」，而像有目的地的人流。

import { state } from '../state.js';
import { setTargetCell, advancePath, lingerStep, snapWalkable } from './movement.js';
import { inferLifecycle } from './agent.js';
import { tickPermanent } from './permanent.js';
import { onCelebrityLeave } from './celebrities.js';

// 速度按 type 微分，让画面看上去像不同身份的人。单位：cell / 秒
// ARRIVE_EPSILON 和 BFS stagger 预算已移至 movement.js，此处不再定义。
const SPEED_BY_TYPE = {
  Resident: 1.4,
  Pilgrim:  1.6,
  Monk:     1.2,
  Guard:    1.3,
  Vendor:   1.4,
  Noble:    1.0,   // 牛车走得慢
  Servant:  1.6,
  Thief:    1.8,
  Merchant: 1.5,
  Builder:  0.0,   // 不寻路，只在工地附近 wander
  Vagrant:  0.9,
  Newcomer: 0.95,
  Weaver:   1.35,
  Commoner: 1.6,
  Celebrity:1.1,   // 名士不疾不徐
};

// 在 waypoint 上停留多久（秒）。区间随机一次。
const LINGER_BY_TYPE = {
  Pilgrim: [3.0, 6.0],
  Monk:    [4.0, 7.0],
  Merchant:[2.5, 5.0],
  Noble:   [3.5, 6.5],
  Vendor:  [3.0, 5.5],
  Resident:[1.5, 3.5],
  Commoner:[1.0, 2.5],
  Vagrant: [2.5, 5.0],
  Newcomer:[4.0, 7.0],
  Weaver:  [2.0, 4.0],
  Guard:   [0.6, 1.4],
  Servant: [1.5, 3.0],
  Thief:   [0.4, 1.0],
  Celebrity:[4.0, 7.5],   // 名士基线 linger，再被 celebrity.lingerScale 缩放
};

function gateCell(gateKey) {
  if (!state.gates || !state.gates[gateKey]) return null;
  const g = state.gates[gateKey];
  return { x: g.cell.x, y: g.cell.y };
}

function templeDoorCell() {
  const tp = state.plots.find(p => p.status === 'built' && p.building === 'ciDengTemple');
  if (!tp) return null;
  return { x: tp.doorCell.x, y: tp.doorCell.y };
}

function builtDoorCellsByKind(kind) {
  const out = [];
  for (const p of state.plots) {
    if (p.status !== 'built') continue;
    const b = state.buildings[p.building];
    if (!b || b.kind !== kind) continue;
    out.push({ x: p.doorCell.x, y: p.doorCell.y });
  }
  return out;
}

function pickRandomBuiltDoor(kind) {
  const arr = builtDoorCellsByKind(kind);
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function wellCell() {
  // 以井北侧街道格作为「井边」，比井中心 (7,7) 更接近真实人流站位。
  return { x: 7, y: 6 };
}

function homeDoorCell(a) {
  if (!a.homePlotId) return null;
  const p = state.plots.find(pp => pp.id === a.homePlotId);
  if (!p) return null;
  return { x: p.doorCell.x, y: p.doorCell.y };
}

function workDoorCell(a) {
  if (!a.workPlotId) return null;
  const p = state.plots.find(pp => pp.id === a.workPlotId);
  if (!p) return null;
  return { x: p.doorCell.x, y: p.doorCell.y };
}

// === schedule 生成 ===
// 给 type 分配一份「门 → 1~3 个 waypoint → 出门」的目标序列。
// 每个 waypoint 带一个图标（用于 bubble 显示，可选）。
export function buildSchedule(a) {
  const items = [];
  switch (a.type) {
    case 'Pilgrim': {
      const td = templeDoorCell();
      if (td) items.push({ cell: td, icon: '香' });
      items.push({ cell: wellCell(), icon: '歇' });
      break;
    }
    case 'Merchant': {
      const inn = pickRandomBuiltDoor('inn');
      if (inn) items.push({ cell: inn, icon: '宿' });
      const w = pickRandomBuiltDoor('weaver');
      if (w) items.push({ cell: w, icon: '货' });
      items.push({ cell: wellCell(), icon: '歇' });
      break;
    }
    case 'Noble': {
      const td = templeDoorCell();
      if (td) items.push({ cell: td, icon: '香' });
      const m = pickRandomBuiltDoor('mansion');
      if (m) items.push({ cell: m, icon: '邸' });
      else items.push({ cell: wellCell(), icon: '观' });
      break;
    }
    case 'Commoner': {
      // 行人随机逛 1-2 个候选点（井 + 已建公共建筑门）
      const pubKinds = ['inn', 'weaver', 'incense', 'guardpos'];
      const all = pubKinds.flatMap(k => builtDoorCellsByKind(k));
      const pool = [wellCell(), ...all];
      shuffle(pool);
      const n = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n && i < pool.length; i++) items.push({ cell: pool[i], icon: '' });
      break;
    }
    case 'Resident': {
      // 坊民：井 → 邻里 → 自家
      items.push({ cell: wellCell(), icon: '汲' });
      const others = state.plots
        .filter(p => p.status === 'built' && state.buildings[p.building]?.kind === 'house' && p.id !== a.homePlotId)
        .map(p => ({ x: p.doorCell.x, y: p.doorCell.y }));
      if (others.length) {
        items.push({ cell: others[Math.floor(Math.random() * others.length)], icon: '' });
      }
      const home = homeDoorCell(a);
      if (home) items.push({ cell: home, icon: '归' });
      break;
    }
    case 'Vendor': {
      items.push({ cell: wellCell(), icon: '摊' });
      const inn = pickRandomBuiltDoor('inn');
      if (inn) items.push({ cell: inn, icon: '摊' });
      break;
    }
    case 'Monk': {
      const td = templeDoorCell();
      if (td) items.push({ cell: td, icon: '经' });
      items.push({ cell: wellCell(), icon: '化' });
      break;
    }
    case 'Servant': {
      const m = pickRandomBuiltDoor('mansion');
      if (m) items.push({ cell: m, icon: '差' });
      items.push({ cell: wellCell(), icon: '汲' });
      break;
    }
    case 'Newcomer': {
      // 等待安置的新民：在源门、井边和南街之间徘徊，不直接离坊。
      const g = gateCell(a.fromGate || 'S');
      if (g) items.push({ cell: g, icon: '候' });
      items.push({ cell: wellCell(), icon: '问' });
      if (g) items.push({ cell: snapWalkable({ x: g.x + 1, y: g.y + 1 }) || g, icon: '居' });
      break;
    }
    case 'Weaver': {
      const home = homeDoorCell(a);
      const work = workDoorCell(a) || pickRandomBuiltDoor('weaver');
      if (home) items.push({ cell: home, icon: '出' });
      if (work) items.push({ cell: work, icon: '织' });
      items.push({ cell: wellCell(), icon: '汲' });
      if (home) items.push({ cell: home, icon: '归' });
      break;
    }
    case 'Celebrity': {
      // 名士走 celebrity.scheduleKinds 关键词序列；缺失目标时自动跳过。
      const celeb = a.celebrity;
      const kinds = (celeb && celeb.scheduleKinds) || ['well'];
      for (const k of kinds) {
        const cell = celebWaypoint(a, k);
        if (cell) items.push({ cell, icon: celeb && celeb.bubble ? celeb.bubble : '' });
      }
      if (items.length === 0) items.push({ cell: wellCell(), icon: celeb && celeb.bubble || '' });
      break;
    }
    case 'Vagrant': {
      // 流民只在源门附近 ±2 内逛，schedule 较短
      const g = gateCell(a.fromGate || 'S');
      if (g) {
        const offsets = [[-2, 0], [2, 0], [0, -2], [0, 2], [1, 1], [-1, 1]];
        for (const [dx, dy] of offsets.slice(0, 3 + Math.floor(Math.random() * 2))) {
          const c = snapWalkable({ x: g.x + dx, y: g.y + dy });
          if (c) items.push({ cell: c, icon: '' });
        }
      }
      break;
    }
    default: {
      items.push({ cell: wellCell(), icon: '' });
    }
  }

  // schedule 走完后总要回到 fromGate 离坊
  return items;
}

// 把 celebrity.scheduleKinds 里的关键词翻译成具体 cell；若对应建筑不存在
// 就退化到井，保证名士永远有事可做。
function celebWaypoint(a, kind) {
  switch (kind) {
    case 'inn':      return pickRandomBuiltDoor('inn')     || wellCell();
    case 'temple':   return templeDoorCell()                || wellCell();
    case 'mansion':  return pickRandomBuiltDoor('mansion') || wellCell();
    case 'guardpos': return pickRandomBuiltDoor('guardpos')|| wellCell();
    case 'weaver':   return pickRandomBuiltDoor('weaver')  || wellCell();
    case 'incense':  return pickRandomBuiltDoor('incense') || wellCell();
    case 'house':    return pickRandomBuiltDoor('house')   || wellCell();
    case 'gate':     return gateCell(a.fromGate || 'S')    || wellCell();
    case 'well':
    default:         return wellCell();
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function lingerDuration(a) {
  const r = LINGER_BY_TYPE[a.type] || [1.0, 2.5];
  const base = r[0] + Math.random() * (r[1] - r[0]);
  if (a.type === 'Celebrity' && a.celebrity && a.celebrity.lingerScale) {
    return base * a.celebrity.lingerScale;
  }
  return base;
}

// 进入下一 schedule 项目；schedule 走完则置 leaving。
function advanceSchedule(a) {
  if (!a.schedule || a.scheduleIndex == null) {
    a.schedule = buildSchedule(a);
    a.scheduleIndex = 0;
  }
  if (a.scheduleIndex >= a.schedule.length) {
    if (a.persistentGroup) {
      a.schedule = buildSchedule(a);
      a.scheduleIndex = 0;
      if (!a.schedule.length) return;
    } else {
      a.leaving = true;
      a.scheduleIcon = '';
      setTargetCell(a, gateCell(a.fromGate || 'W'));
      return;
    }
  }
  const item = a.schedule[a.scheduleIndex];
  a.scheduleIndex += 1;
  a.scheduleIcon = item.icon || '';
  setTargetCell(a, item.cell);
}

// linger：委托给 movement.lingerStep，耗尽后推进 schedule。
function tickLinger(a, dt) {
  if (lingerStep(a, dt)) {
    a.lingering = false;
    a.lingerAnchorX = null;
    a.lingerAnchorY = null;
    advanceSchedule(a);
  }
}

// PR1: transient 主体 —— 原 tickAgent 主流程，不含 Builder / Vagrant 离场分支。
// 不导出；外部通过顶层 tickAgent dispatch 进入。
// addLog 透传：名士（Celebrity）离场时触发 farewell 日志。
function tickTransient(a, dt, addLog) {
  if (!a.visible) return;

  // PR4: 围观信号期间—走到 anchor 周围 linger，到时间恢复 snapshot
  if (a.watching) {
    const now = performance.now();
    if (now >= a.watching.untilMs) {
      const r = a.watchResume;
      if (r) {
        a.target = r.target;
        a.path = r.path;
        a.scheduleIndex = r.scheduleIndex;
        a.scheduleIcon = r.scheduleIcon;
        a.pendingPath = r.pendingPath;
        a.lingering = r.lingering;
        a.lingerLeft = r.lingerLeft;
        a.lingerAnchorX = r.lingerAnchorX;
        a.lingerAnchorY = r.lingerAnchorY;
      }
      a.watching = null;
      a.watchResume = null;
    } else {
      const anchor = a.watching.anchor;
      // codex P2: BFS 预算耗尽时 path=null && pendingPath=true，先补算路径再决定 linger，
      // 否则会就地 linger 而永远走不到 anchor。
      if (a.pendingPath) {
        setTargetCell(a, anchor);
        if (a.pendingPath) return; // 仍未拿到预算，等下一帧
      }
      if (!a.path || a.path.length === 0) {
        a.lingerAnchorX = anchor.x + 0.5;
        a.lingerAnchorY = anchor.y + 0.5;
        if (!a.lingering) { a.lingering = true; a.lingerLeft = 999; }
        lingerStep(a, dt);
      } else {
        advancePath(a, dt, 1.4);
      }
      return;
    }
  }

  // 在 waypoint 停留中
  if (a.lingering) {
    tickLinger(a, dt);
    return;
  }

  // 还没分配 schedule（首次）→ 立刻进 schedule
  if (a.target == null && !a.leaving) {
    advanceSchedule(a);
  }
  if (a.target == null) return;

  // 上一次 setTargetCell 因预算耗尽推迟了，这一帧补算
  if (a.pendingPath && a.target) {
    setTargetCell(a, a.target);
    if (a.pendingPath) return; // 仍未拿到预算，等下一帧
  }

  // 路径走完
  if (!a.path || a.path.length === 0) {
    if (a.leaving) {
      const gk = a.fromGate || 'W';
      const g = state.gates ? state.gates[gk] : null;
      if (g) g.lastVisitor = labelOf(a);
      if (a.type === 'Celebrity') onCelebrityLeave(state, a, addLog);
      const idx = state.agents.indexOf(a);
      if (idx >= 0) state.agents.splice(idx, 1);
      return;
    }
    // 到达 waypoint：开始 linger
    a.lingering = true;
    a.lingerLeft = lingerDuration(a);
    a.lingerAnchorX = a.x;
    a.lingerAnchorY = a.y;
    a.target = null;
    return;
  }

  // 走向 path[0] 的中心（委托给 movement.advancePath）
  const speed = SPEED_BY_TYPE[a.type] != null ? SPEED_BY_TYPE[a.type] : 1.4;
  advancePath(a, dt, speed);
}

// PR1: special 路径承载现有 Builder / Vagrant 行为，不能"暂返"。
// 内容直接搬自 routines.js 旧 tickAgent 的 Builder / Vagrant 分支。
function tickSpecialLegacy(a, dt, addLog) {
  // Builder：在工地附近 wander
  if (a.type === 'Builder') {
    const plot = state.plots.find(p => p.id === a.constructionPlotId);
    if (!plot || plot.status !== 'building') {
      const idx = state.agents.indexOf(a);
      if (idx >= 0) state.agents.splice(idx, 1);
      return;
    }
    const now = performance.now();
    if (!a.builderVx || now >= (a.builderTurnAt || 0)) {
      const angle = Math.random() * Math.PI * 2;
      a.builderVx = Math.cos(angle) * 0.4;
      a.builderVy = Math.sin(angle) * 0.4;
      a.builderTurnAt = now + 1500;
    }
    a.x += a.builderVx * dt;
    a.y += a.builderVy * dt;
    const dx = a.x - a.builderHomeX;
    const dy = a.y - a.builderHomeY;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.6) {
      a.x = a.builderHomeX + dx / dist * 0.6;
      a.y = a.builderHomeY + dy / dist * 0.6;
      a.builderTurnAt = 0;
    }
    a.lastMoveAt = now;
    return;
  }

  // Vagrant：到 lingerUntilDay 后离场（其余 wander 走 transient 路径）
  if (a.type === 'Vagrant' && state.day >= (a.lingerUntilDay || 0)) {
    if (!a.leaving) {
      a.leaving = true;
      const gk = a.fromGate || 'S';
      const g = state.gates ? state.gates[gk] : null;
      if (g) setTargetCell(a, { x: g.cell.x, y: g.cell.y });
    }
    // 后续移动走 transient 主体
    return tickTransient(a, dt, addLog);
  }
  // 普通 Vagrant 维持 wander → 走 transient
  return tickTransient(a, dt);
}

// PR1: 顶层 dispatch。lifecycle 优先；未显式则按 inferLifecycle 兜底。
// permanent 路径在 PR1 阶段没有订阅者（spawnInitialAgents 未设 lifecycle='permanent'），
// 所以 tickPermanent 暂时不做任何事；PR2 接入 Resident 时再激活。
export function tickAgent(a, dt, addLog) {
  const lc = inferLifecycle(a);
  switch (lc) {
    case 'permanent': return tickPermanent(a, dt);
    case 'special':   return tickSpecialLegacy(a, dt, addLog);
    case 'transient':
    default:          return tickTransient(a, dt, addLog);
  }
}

function labelOf(a) {
  if (a.type === 'Celebrity' && a.celebrity) return `${a.celebrity.title} ${a.celebrity.name}`;
  const map = {
    Pilgrim: '香客', Merchant: '商旅', Commoner: '行人', Noble: '贵客',
    Resident: '坊民', Monk: '僧人', Guard: '巡夜人', Vendor: '商贩',
    Vagrant: '流民', Newcomer: '新民', Weaver: '织户', Servant: '仆从', Thief: '宵小',
  };
  return map[a.type] || a.type;
}

// 旧 chooseRoutine 仍被 Agent.update（旧路径）引用 —— 留 stub 以免破 import 链。
export function chooseRoutine() { /* deprecated, replaced by tickAgent */ }
