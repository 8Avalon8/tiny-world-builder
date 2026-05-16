// src/agents/permanent.js
// PR1: tickPermanent + 任务执行微 FSM（Approaching → Performing → Done）
// + sequence 任务执行器（PR5 用）。
// PR1 阶段没有 permanent agent；PR2 接入 Resident 时激活。

import { state } from '../state.js';
import { setTargetCell, advancePath, lingerStep } from './movement.js';
import { getTask, pickTask } from './tasks.js';
import { getPhase } from '../time.js';
import { Agent } from './agent.js';
import { initNeedsForRole, resetNeedsAfterSleep } from './needs.js';
import { emitSignal } from './signals.js';

const SPEED_BY_ROLE = {
  Resident: 1.4,
  Monk: 1.2,
  Guard: 1.3,
  Stallkeeper: 1.4,
  StoryAgent: 1.4,
};

// 任务执行的微 FSM
function startTask(a, task) {
  const target = task.target ? task.target(a, state) : null;
  a.task.current = {
    id: task.id,
    kind: task.kind || 'atomic',
    stage: 'Approaching',
    target,
    timer: 0,
    stepIndex: 0, // sequence 用
  };
  if (target) setTargetCell(a, target);
  if (task.bubbleIcon) a.scheduleIcon = task.bubbleIcon;
  if (task.speak) {
    const s = task.speak(a, state);
    if (s) a.speakText = s;
  }
  if (task.id === 'Sleep') {
    a.sleepStartDay = state.day;
  }
}

// 完成当前任务，写 cooldown 并清空。
// PR4: WatchSpectacle / RespondIncident 完成后 pop 栈恢复原任务（如果原任务 precheck 仍 true）。
function completeCurrent(a) {
  if (!a.task.current) return;
  const finishedId = a.task.current.id;
  const t = getTask(finishedId);
  if (t) {
    if (t.onComplete) t.onComplete(a, state);
    if (t.cooldownSec > 0) {
      const untilMin = state.minute + t.cooldownSec / 60;
      a.task.cooldowns[t.id] = untilMin;
    }
  }
  a.task.current = null;
  a.scheduleIcon = '';
  a.speakText = null;

  // PR4: WatchSpectacle / RespondIncident 完成时 pop 栈恢复原任务
  if ((finishedId === 'WatchSpectacle' || finishedId === 'RespondIncident') && a.task.stack.length > 0) {
    const restored = a.task.stack.pop();
    const rt = getTask(restored.id);
    if (rt && (!rt.precheck || rt.precheck(a, state))) {
      a.task.current = restored;
      // 重新 setTarget（路径可能 stale）
      if (restored.target) setTargetCell(a, restored.target);
    }
    // precheck 失败则丢弃，下一帧 pickTask
  }
}

function runAtomic(a, dt) {
  const cur = a.task.current;
  const t = getTask(cur.id);
  if (!t) { completeCurrent(a); return; }

  // pendingPath 补算（movement 已处理，这里看到 path=null && pendingPath 时退一帧）
  if (a.pendingPath) {
    if (cur.target) setTargetCell(a, cur.target);
    return;
  }

  if (cur.stage === 'Approaching') {
    if (!a.path || a.path.length === 0) {
      cur.stage = 'Performing';
      cur.timer = t.lingerSec ? t.lingerSec(a, cur.args) : 1;
      a.lingering = true;
      a.lingerLeft = cur.timer;
      a.lingerAnchorX = a.x;
      a.lingerAnchorY = a.y;
      if (cur.id === 'Sleep') {
        a.renderHidden = true;
        a.lingering = false; // 睡觉不再 wander
      }
      return;
    }
    const speed = SPEED_BY_ROLE[a.role] || 1.4;
    advancePath(a, dt, speed);
    return;
  }

  if (cur.stage === 'Performing') {
    if (cur.id === 'Sleep') return; // 由跨日检查唤醒
    if (lingerStep(a, dt)) {
      a.lingering = false;
      cur.stage = 'Done';
      completeCurrent(a);
    }
  }
}

// 给 sequence step 用的纯函数版 runAtomic：操作 step._inst 而非 a.task.current。
// 不读 a.task.current、不调 completeCurrent。
// 返回 { done: boolean }。
function runAtomicStep(a, step, dt) {
  const inst = step._inst;
  const t = getTask(inst.id);
  if (!t) return { done: true };

  if (a.pendingPath) {
    if (inst.target) setTargetCell(a, inst.target);
    return { done: false };
  }

  if (inst.stage === 'Approaching') {
    if (!a.path || a.path.length === 0) {
      inst.stage = 'Performing';
      inst.timer = t.lingerSec ? t.lingerSec(a, step.args) : 1;
      a.lingering = true;
      a.lingerLeft = inst.timer;
      a.lingerAnchorX = a.x;
      a.lingerAnchorY = a.y;
      return { done: false };
    }
    const speed = SPEED_BY_ROLE[a.role] || 1.4;
    advancePath(a, dt, speed);
    return { done: false };
  }

  if (inst.stage === 'Performing') {
    if (lingerStep(a, dt)) {
      a.lingering = false;
      // step 自身的 onComplete（来自任务表）
      if (t.onComplete) t.onComplete(a, state, step.args);
      return { done: true };
    }
  }
  return { done: false };
}

function instantiateAtomicForStep(a, step) {
  const t = getTask(step.task);
  if (!t) return null;
  const target = t.target ? t.target(a, state, step.args) : null;
  return {
    id: t.id,
    kind: 'atomic',
    stage: 'Approaching',
    target,
    timer: 0,
    args: step.args,
  };
}

// PR5: sequence 执行器，逐 step 推进，每 step 用 runAtomicStep 执行。
function runSequence(a, dt) {
  const cur = a.task.current;
  if (!cur.steps || cur.stepIndex >= cur.steps.length) {
    if (cur.onComplete) cur.onComplete(a, state);
    completeCurrent(a);
    return;
  }

  const step = cur.steps[cur.stepIndex];

  // 第一次进入这个 step：实例化（特殊 step 立即推进）
  if (!step._inst) {
    // EmitSignal：立即发后推进，不进入原子执行
    if (step.task === 'EmitSignal') {
      emitSignal({
        kind: step.args?.kind || 'spectacle',
        cell: { x: a.x, y: a.y },
        radius: step.args?.radius || 4,
        durationSec: step.args?.durationSec || 5,
      });
      cur.stepIndex++;
      return;
    }
    // WaitUntil：检查条件，未到时就停（不增 stepIndex）
    if (step.task === 'WaitUntil') {
      if (step.args?.minute != null && state.minute < step.args.minute) return;
      cur.stepIndex++;
      return;
    }
    step._inst = instantiateAtomicForStep(a, step);
    if (!step._inst) { cur.stepIndex++; return; }
    if (step._inst.target) setTargetCell(a, step._inst.target);
    if (step.bubble) a.scheduleIcon = step.bubble;
  }

  const result = runAtomicStep(a, step, dt);
  if (result.done) {
    cur.stepIndex++;
    step._inst = null;
    a.scheduleIcon = '';
    // 如果是最后一个 step，下一帧 runSequence 顶部的 completeCurrent 收尾
  }
}

export function tickPermanent(a, dt) {
  // 防御：permanent 必须有 task 容器
  if (!a.task) a.task = { current: null, stack: [], cooldowns: {} };

  // PR2: Sleep 跨日醒来检查
  if (a.task.current && a.task.current.id === 'Sleep') {
    if (a.sleepStartDay != null && state.day > a.sleepStartDay && getPhase(state) === 'Morning') {
      a.renderHidden = false;
      resetNeedsAfterSleep(a);
      a.sleepStartDay = null;
      a.lingering = false;
      a.task.current = null;
      a.scheduleIcon = '';
    }
  }

  // 没任务 → 选一个
  if (!a.task.current) {
    const picked = pickTask(a, state);
    if (picked) startTask(a, picked);
    if (!a.task.current) return;
  }

  if (a.task.current.kind === 'sequence') return runSequence(a, dt);
  return runAtomic(a, dt);
}

// === Spawn 表（spec §4）===
// 注意：role/type 显式分离。常驻摊主 type='Vendor'（沿用渲染），role='Stallkeeper'。
// PR3: 完整表 — temple/guardpos/weaver/incense/inn 均上线常驻。
// mansion 不刷常驻仆从（Servant 仍走 transient）。
const PERMANENT_BY_KIND = {
  house:    [{ type: 'Resident', role: 'Resident',    count: 1 }],
  temple:   [{ type: 'Monk',     role: 'Monk',        count: 3 }],
  guardpos: [{ type: 'Guard',    role: 'Guard',       count: 1 }],
  weaver:   [{ type: 'Vendor',   role: 'Stallkeeper', count: 1 }],
  incense:  [{ type: 'Vendor',   role: 'Stallkeeper', count: 1 }],
  inn:      [{ type: 'Vendor',   role: 'Stallkeeper', count: 1 }],
};

const ROLE_TYPE_LABELS = {
  Resident: '坊民', Monk: '僧人', Guard: '巡夜人', Stallkeeper: '店家',
};

function defaultInterruptibility(role) {
  return ({ Resident: 0.8, Monk: 0.3, Guard: 0, Stallkeeper: 0.2 })[role] ?? 0.5;
}

// 幂等：补到 count 为止（不是只在 0 时建）。修复 review P0-2。
export function spawnPermanentForPlot(plot) {
  if (!plot || !plot.doorCell || !plot.building) return;
  const b = state.buildings[plot.building];
  if (!b) return;
  const recipe = PERMANENT_BY_KIND[b.kind];
  if (!recipe) return;
  for (const slot of recipe) {
    const existing = state.agents.filter(a =>
      a.lifecycle === 'permanent' && a.homePlotId === plot.id && a.role === slot.role
    ).length;
    const need = slot.count - existing;
    for (let i = 0; i < need; i++) {
      const a = new Agent(slot.type, null, {
        name: ROLE_TYPE_LABELS[slot.role] || slot.role,
        x: plot.doorCell.x + 0.5 + (Math.random() - 0.5) * 0.4,
        y: plot.doorCell.y + 0.5 + (Math.random() - 0.5) * 0.4,
        homePlotId: plot.id,
        workPlotId: plot.id,
        lifecycle: 'permanent',
        role: slot.role,
        needs: initNeedsForRole(slot.role),
        task: { current: null, stack: [], cooldowns: {} },
        interruptibility: defaultInterruptibility(slot.role),
      });
      state.agents.push(a);
    }
  }
}

// 拆除 plot 时清理；目前没有"真正拆除"，留 hook 备用。
export function despawnPermanentForPlot(plot) {
  if (!plot) return;
  state.agents = state.agents.filter(a => !(a.lifecycle === 'permanent' && a.homePlotId === plot.id));
}

// damaged 时调：标记 workDisabled，agent 仍存活但工作类任务被淘汰。
export function onPlotDamaged(plot) {
  for (const a of state.agents) {
    if (a.lifecycle === 'permanent' && a.homePlotId === plot.id) {
      a.workDisabled = true;
      // 如果当前正在执行工作类任务，强制切回 IdleWander
      if (a.task && a.task.current) {
        const t = getTask(a.task.current.id);
        if (t && t.workClass) {
          a.task.current = null;
          a.scheduleIcon = '';
        }
      }
    }
  }
}

export function onPlotRepaired(plot) {
  for (const a of state.agents) {
    if (a.lifecycle === 'permanent' && a.homePlotId === plot.id) {
      a.workDisabled = false;
    }
  }
}

// 启动幂等兜底：把所有现有 built plot 的常驻补齐。
export function syncPermanentPopulation() {
  for (const p of state.plots) {
    if (p.status === 'built') spawnPermanentForPlot(p);
  }
}

// 测试 / PR3 扩表用
export function _registerPermanentRecipe(kind, slots) {
  PERMANENT_BY_KIND[kind] = slots;
}
