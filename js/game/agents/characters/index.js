// src/agents/characters/index.js
// PR5: character 注册表 + spawnCharacter 工厂。

import { Agent } from '../agent.js';
import { demoNpc } from './demoNpc.js';

export const CHARACTERS = {
  demoNpc,
};

// 给所有 demo 主角准备一份 sequence 任务，挂在 tasks.js 不方便（避免循环）；
// 这里直接由 character 自带 script 数据。
const SCRIPTS = {
  demoNpc_walkthrough: {
    kind: 'sequence',
    interruptible: false,
    steps: [
      { task: 'GoToCell', args: { cell: { x: 7, y: 7 } }, bubble: '...' },
      { task: 'Linger',   args: { sec: 3 } },
      { task: 'LeaveByGate', args: { gate: 'W' } },
    ],
  },
};

export function spawnCharacter(id, state) {
  const bp = CHARACTERS[id];
  if (!bp) return null;
  // 唯一性
  if (bp.unique) {
    const exists = state.agents.find(a => a.characterId === id);
    if (exists) return exists;
  }
  const opts = bp.spawn(state);
  const a = new Agent(opts.type || 'Resident', null, {
    name: bp.displayName,
    x: opts.x, y: opts.y,
    lifecycle: 'permanent',
    role: bp.role,
    interruptibility: bp.interruptibility ?? 0,
    banner: bp.appearance?.banner,
    needs: null,
    task: { current: null, stack: [], cooldowns: {} },
    interactable: !!opts.interactable,
  });
  a.characterId = id;
  a.ignoresPhaseFlush = !!bp.ignoresPhaseFlush;
  a.ignoresCurfew = !!bp.ignoresCurfew;

  // 把 script 注入为 sequence 当前任务
  const script = SCRIPTS[bp.script];
  if (script) {
    a.task.current = {
      id: bp.script,
      kind: 'sequence',
      stage: 'Performing',
      steps: script.steps.map(s => ({ ...s })),
      stepIndex: 0,
    };
  }
  state.agents.push(a);
  return a;
}
