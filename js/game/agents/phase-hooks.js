// src/agents/phase-hooks.js
// PR2: phase 切换时给常驻 agent 触发钩子。
// LateNight 时强制 GoHome（Sleep 由 pickTask 在到达后选）。
// 其他相位清 IdleWander 让位给更合适的任务。

import { state } from '../state.js';
import { getTask } from './tasks.js';
import { setTargetCell } from './movement.js';

// 显式构造 GoHome 任务对象，绕过 pickTask 不确定性
function forceGoHome(a) {
  const t = getTask('GoHome');
  if (!t || !t.precheck(a, state)) return;
  const target = t.target(a, state);
  if (!target) return;
  a.task.current = { id: 'GoHome', kind: 'atomic', stage: 'Approaching', target, timer: 0 };
  a.scheduleIcon = t.bubbleIcon || '归';
  setTargetCell(a, target);
}

function onAgentPhaseChange(a, oldPhase, newPhase) {
  if (!a.task) a.task = { current: null, stack: [], cooldowns: {} };
  if (newPhase === 'LateNight') {
    if (a.role === 'Guard') return;
    if (a.ignoresCurfew) return;
    if (a.task.current?.id === 'Sleep') return;
    if (a.task.current?.id === 'GoHome') return;
    forceGoHome(a);
    return;
  }
  // 其他相位：清掉 IdleWander 让位给更合适的任务
  if (a.task.current?.id === 'IdleWander') {
    a.task.current = null;
    a.scheduleIcon = '';
  }
}

export function broadcastPhaseChange(oldPhase, newPhase) {
  if (!state.agents) return;
  for (const a of state.agents) {
    if (a.lifecycle !== 'permanent') continue;
    onAgentPhaseChange(a, oldPhase, newPhase);
  }
}
