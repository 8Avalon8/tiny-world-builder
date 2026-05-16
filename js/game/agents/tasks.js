// src/agents/tasks.js
// PR1: 任务表 + pickTask 选择器。
// PR1 只放 4 个最小任务，PR2/PR3 增量加。runTask + sequence 执行器在 Task 1.8。

import { getPhase } from '../time.js';
import { needWeight } from './needs.js';
import { state } from '../state.js';

// PR1 之内不依赖 well 真实位置，给一个 fallback。
// PR2 切 Resident 时再校准。
function wellCell() {
  return { x: 7, y: 6 };
}

function homeDoorCell(a, state) {
  if (!a.homePlotId) return null;
  const p = state.plots.find(pp => pp.id === a.homePlotId);
  if (!p) return null;
  return { x: p.doorCell.x, y: p.doorCell.y };
}

function templePlot(s) {
  return s.plots.find(p => p.status === 'built' && s.buildings[p.building]?.kind === 'temple');
}

function otherHouseDoor(a, s) {
  const others = s.plots.filter(p =>
    p.status === 'built' && s.buildings[p.building]?.kind === 'house' && p.id !== a.homePlotId
  );
  if (others.length === 0) return null;
  const o = others[Math.floor(Math.random() * others.length)];
  return { x: o.doorCell.x, y: o.doorCell.y };
}

export const TASKS = [
  {
    id: 'IdleWander',
    label: '闲逛',
    bubbleIcon: '',
    roles: ['Resident', 'Monk', 'Guard', 'Stallkeeper', 'StoryAgent'],
    phases: ['*'],
    precheck: () => true,
    weight: () => 0.5,        // 兜底，比有意义任务低
    target: (a) => ({
      x: Math.round(a.x + (Math.random() - 0.5) * 4),
      y: Math.round(a.y + (Math.random() - 0.5) * 4),
    }),
    lingerSec: () => 1.5 + Math.random() * 1.5,
    onComplete: () => {},
    speak: () => '',
    interruptible: true,
    cooldownSec: 0,
  },
  {
    id: 'GoToWell',
    label: '汲水',
    bubbleIcon: '汲',
    roles: ['Resident', 'Stallkeeper', 'Servant'],
    phases: ['Morning', 'Noon', 'Dusk'],
    // 只有口渴超过阈值才主动去取水，避免无意义往返
    precheck: (a, s) => (a.needs?.thirst ?? 0) > 0.3 && s.gateOpen !== false,
    weight: (a) => 1 + (a.needs?.thirst != null ? needWeight(a.needs.thirst) : 1),
    target: () => wellCell(),
    lingerSec: () => 3 + Math.random() * 2,
    onComplete: (a) => { if (a.needs && a.needs.thirst != null) a.needs.thirst = 0; },
    speak: () => '',
    interruptible: true,
    cooldownSec: 30,
  },
  {
    id: 'GoHome',
    label: '归家',
    bubbleIcon: '归',
    roles: ['Resident', 'Monk', 'Guard', 'Stallkeeper'],
    phases: ['Dusk', 'Night', 'LateNight'],
    precheck: (a, s) => homeDoorCell(a, s) != null,
    weight: () => 2.0,
    target: (a, s) => homeDoorCell(a, s),
    lingerSec: () => 0.2,
    onComplete: () => {},
    speak: () => '',
    interruptible: true,
    cooldownSec: 0,
  },
  {
    id: 'Sleep',
    label: '安寝',
    bubbleIcon: '',
    roles: ['Resident', 'Monk', 'Guard', 'Stallkeeper'],
    phases: ['Night', 'LateNight'],
    precheck: (a, s) => homeDoorCell(a, s) != null,
    weight: () => 3.0,
    target: (a, s) => homeDoorCell(a, s),
    lingerSec: () => 999, // 由 sleepStartDay 跨日醒来终止
    onComplete: () => {},
    speak: () => '',
    interruptible: false,
    cooldownSec: 0,
  },

  // === PR3: 工作类任务 ===
  {
    id: 'ChantSutra', label: '诵经', bubbleIcon: '经',
    roles: ['Monk'], phases: ['Noon', 'Night'],
    workClass: true,
    precheck: (a, s) => !a.workDisabled && templePlot(s) != null,
    weight: () => 2.5,
    target: (a, s) => {
      const tp = templePlot(s);
      return tp ? { x: tp.doorCell.x, y: tp.doorCell.y } : null;
    },
    lingerSec: () => 6 + Math.random() * 4,
    onComplete: () => {},
    speak: () => '',
    interruptible: true,
    cooldownSec: 60,
  },
  {
    id: 'BegAlms', label: '化缘', bubbleIcon: '化',
    roles: ['Monk'], phases: ['Noon'],
    workClass: false,
    precheck: () => true,
    weight: () => 1.0,
    target: (a, s) => {
      const tp = templePlot(s);
      return tp ? { x: tp.doorCell.x, y: tp.doorCell.y + 1 } : null;
    },
    lingerSec: () => 4 + Math.random() * 3,
    onComplete: () => {},
    speak: () => '',
    interruptible: true,
    cooldownSec: 90,
  },
  {
    id: 'Patrol', label: '巡街', bubbleIcon: '巡',
    roles: ['Guard'], phases: ['Noon', 'Night', 'LateNight'],
    workClass: true,
    precheck: () => true,
    weight: () => 2.5,
    target: (a, s) => {
      // 沿坊内主街取一个随机点：x∈[2,13], y∈{7,8} 或 y∈[2,13], x∈{7,8}
      if (Math.random() < 0.5) {
        return { x: 2 + Math.floor(Math.random() * 12), y: 7 + Math.floor(Math.random() * 2) };
      }
      return { x: 7 + Math.floor(Math.random() * 2), y: 2 + Math.floor(Math.random() * 12) };
    },
    lingerSec: () => 0.8 + Math.random() * 1.2,
    onComplete: () => {},
    speak: () => '',
    interruptible: true,   // 但 Guard interruptibility=0，不会被吸引
    cooldownSec: 5,
  },
  {
    id: 'TendStall', label: '守摊', bubbleIcon: '摊',
    roles: ['Stallkeeper'], phases: ['Noon', 'Dusk'],
    workClass: true,
    precheck: (a, s) => !a.workDisabled && a.workPlotId != null,
    weight: () => 2.8,
    target: (a, s) => {
      const p = s.plots.find(pp => pp.id === a.workPlotId);
      return p ? { x: p.doorCell.x, y: p.doorCell.y } : null;
    },
    lingerSec: () => 8 + Math.random() * 4,
    onComplete: () => {},
    speak: () => '',
    interruptible: true,
    cooldownSec: 30,
  },
  {
    id: 'VisitTemple', label: '拜香', bubbleIcon: '香',
    roles: ['Resident'], phases: ['Morning', 'Noon'],
    workClass: false,
    precheck: (a, s) => templePlot(s) != null,
    weight: (a) => 1 + (a.needs?.devotion != null ? needWeight(a.needs.devotion) : 0),
    target: (a, s) => {
      const tp = templePlot(s);
      return tp ? { x: tp.doorCell.x, y: tp.doorCell.y } : null;
    },
    lingerSec: () => 4 + Math.random() * 3,
    onComplete: (a) => { if (a.needs && a.needs.devotion != null) a.needs.devotion = 0; },
    speak: () => '',
    interruptible: true,
    cooldownSec: 60,
  },
  {
    id: 'VisitNeighbor', label: '串门', bubbleIcon: '',
    roles: ['Resident'], phases: ['Noon', 'Dusk'],
    workClass: false,
    precheck: (a, s) => otherHouseDoor(a, s) != null,
    weight: () => 1.0,
    target: (a, s) => otherHouseDoor(a, s),
    lingerSec: () => 3 + Math.random() * 3,
    onComplete: () => {},
    speak: () => '',
    interruptible: true,
    cooldownSec: 45,
  },
  // === PR4: 系统任务（不主动选；由 signals.js 直接构造 cur）===
  {
    id: 'WatchSpectacle', label: '围观', bubbleIcon: '观',
    roles: ['*'], phases: ['*'],
    workClass: false,
    precheck: () => false,                 // 不主动选
    weight: () => 0,
    target: (a) => a.task?.current?.target || null,
    lingerSec: (a) => a.task?.current?.timer || 4,
    onComplete: () => {},
    speak: () => '',
    interruptible: false,                  // 围观期间不被新信号打断
    cooldownSec: 0,
  },
  {
    id: 'RespondIncident', label: '处置', bubbleIcon: '巡',
    roles: ['Guard'], phases: ['*'],
    workClass: false,
    precheck: () => false,
    weight: () => 0,
    target: (a) => a.task?.current?.target || null,
    lingerSec: (a) => a.task?.current?.timer || 4,
    onComplete: () => {},
    speak: () => '',
    interruptible: false,
    cooldownSec: 0,
  },

  // === PR5: 剧情原子任务 ===
  {
    id: 'GoToCell', label: '前往', bubbleIcon: '',
    roles: ['StoryAgent'], phases: ['*'],
    precheck: () => true,
    weight: () => 0,             // 不参与主动 pick；剧情 sequence 内部使用
    target: (a, s, args) => args?.cell || null,
    lingerSec: () => 0.3,
    onComplete: () => {},
    speak: () => '',
    interruptible: false,
    cooldownSec: 0,
  },
  {
    id: 'WaitUntil', label: '等候', bubbleIcon: '',
    roles: ['StoryAgent'], phases: ['*'],
    precheck: () => true,
    weight: () => 0,
    target: (a) => ({ x: Math.round(a.x), y: Math.round(a.y) }),
    lingerSec: (a, args) => {
      // 等到 args.minute 或某 condition；在 sequence 执行器里按 args 处理
      return 1;
    },
    onComplete: () => {},
    speak: () => '',
    interruptible: false,
    cooldownSec: 0,
  },
  {
    id: 'Linger', label: '停留', bubbleIcon: '',
    roles: ['StoryAgent'], phases: ['*'],
    precheck: () => true,
    weight: () => 0,
    target: (a) => ({ x: Math.round(a.x), y: Math.round(a.y) }),
    lingerSec: (a, args) => args?.sec || 3,
    onComplete: () => {},
    speak: () => '',
    interruptible: false,
    cooldownSec: 0,
  },
  {
    id: 'LeaveByGate', label: '离场', bubbleIcon: '',
    roles: ['StoryAgent'], phases: ['*'],
    precheck: () => true,
    weight: () => 0,
    target: (a, s, args) => {
      const gk = args?.gate || 'W';
      const g = s.gates[gk];
      return g ? { x: g.cell.x, y: g.cell.y } : null;
    },
    lingerSec: () => 0.3,
    onComplete: (a) => {
      // 走完后从 state.agents 移除
      const idx = state.agents.indexOf(a);
      if (idx >= 0) state.agents.splice(idx, 1);
    },
    speak: () => '',
    interruptible: false,
    cooldownSec: 0,
  },
  {
    id: 'EmitSignal', label: '触动', bubbleIcon: '',
    roles: ['StoryAgent'], phases: ['*'],
    precheck: () => true,
    weight: () => 0,
    target: () => null, // 不需要移动，立刻完成
    lingerSec: () => 0.1,
    onComplete: () => {
      // 由 sequence 执行器在 step.args 里调
    },
    speak: () => '',
    interruptible: false,
    cooldownSec: 0,
  },
];

const TASK_BY_ID = new Map(TASKS.map(t => [t.id, t]));

export function getTask(id) {
  return TASK_BY_ID.get(id);
}

// 加权抽样
function weightedPick(cands) {
  const total = cands.reduce((s, c) => s + c.w, 0);
  if (total <= 0) return cands[0]?.t || null;
  let r = Math.random() * total;
  for (const c of cands) {
    r -= c.w;
    if (r <= 0) return c.t;
  }
  return cands[cands.length - 1].t;
}

export function pickTask(a, state) {
  const phase = getPhase(state);
  const minute = state.minute;
  const cands = [];
  for (const t of TASKS) {
    if (t.roles && !t.roles.includes('*') && !t.roles.includes(a.role)) continue;
    if (t.phases && !t.phases.includes('*') && !t.phases.includes(phase)) continue;
    // PR3: damaged 建筑下过滤工作类任务
    if (a.workDisabled && t.workClass) continue;
    if (a.task && a.task.cooldowns && a.task.cooldowns[t.id] != null && minute < a.task.cooldowns[t.id]) continue;
    if (t.precheck && !t.precheck(a, state)) continue;
    const w = t.weight ? t.weight(a, state) : 1;
    if (w > 0) cands.push({ t, w });
  }
  if (cands.length === 0) return getTask('IdleWander');
  return weightedPick(cands);
}
