// src/agents/agent.js
// Agent 类与默认配色。行为决策表已拆出至 routines.js。
// Spec #1 之后：寻路改用 walkmap.js，agent 主要靠 (x,y) 浮点坐标驱动。
// 旧的 nodeId / setTarget / update（走 NODES）链路已在 dead-code 清理中移除。

import { rand } from '../utils.js';

export const COLORS = {
  Resident: '#5f7f8f',
  Pilgrim:  '#b58a43',
  Monk:     '#b36b35',
  Guard:    '#41546f',
  Vendor:   '#927d3f',
  Noble:    '#9b332f',
  Servant:  '#6a4e42',
  Thief:    '#131417',
  Merchant: '#7861a7',
  Builder:  '#7d553a',
  Vagrant:  '#5e5247',  // 流民：暗灰褐，与 Resident 形成对比
  Newcomer: '#8f775f',
  Weaver:   '#7f6c9b',
  Celebrity:'#9d6b5b',  // 名士：默认袍色，实际由 celebrity.color 覆盖
};

let nextAgentId = 1;
export function resetAgentIds() { nextAgentId = 1; }

export class Agent {
  constructor(type, nodeId, opts = {}) {
    this.id = nextAgentId++;
    this.type = type;
    this.name = opts.name || type;
    this.color = opts.color || COLORS[type] || '#607080';
    this.nodeId = nodeId;
    if (typeof opts.x === 'number' && typeof opts.y === 'number') {
      // Spec #1+ 路径：直接给浮点格坐标，不查 NODES。
      this.x = opts.x;
      this.y = opts.y;
    } else {
      // Spec #1+ 所有调用方都会传 opts.x / opts.y。这里防御性兜底，
      // 走到这条分支说明上游忘了传，直接抛错好过悄悄塞 NaN。
      throw new Error('Agent constructor requires opts.x and opts.y');
    }
    this.targetNodeId = nodeId;
    this.path = [];
    this.speed = opts.speed || rand(0.52, 0.78);
    this.state = opts.state || 'Idle';
    this.action = opts.action || '';
    this.timer = rand(1, 4);
    this.home = opts.home || nodeId;
    this.controlled = !!opts.controlled;
    this.interactable = !!opts.interactable;
    this.hidden = !!opts.hidden;
    this.visible = opts.visible !== false;
    this.group = opts.group || 1;
    this.icon = opts.icon || '';
    this.arrivalCallback = opts.arrivalCallback || null;
    this.routeIndex = 0;
    this.route = opts.route || null;
    this.sleeping = false;

    // === FSM spec 2026-04-26 字段 ===
    // lifecycle 默认 null，由 inferLifecycle 推断；显式设置时优先
    this.lifecycle = opts.lifecycle || null;
    this.role = opts.role || null;
    // permanent 用：
    this.homePlotId = opts.homePlotId || null;
    this.workPlotId = opts.workPlotId || null;
    this.workDisabled = false;
    this.needs = opts.needs || null;       // {thirst, fatigue, devotion} | null
    this.task = opts.task || null;         // {current, stack, cooldowns} | null
    this.interruptibility = opts.interruptibility != null ? opts.interruptibility : 0.6;
    this.renderHidden = false;
    this.banner = opts.banner || null;
    this.speakText = null;
    this.sleepStartDay = null;
    // transient 围观字段：
    this.watching = null;
    this.watchResume = null;
  }
}

// PR1: 给未显式 lifecycle 的旧 agent 推断 lifecycle，确保不冻结现有行为。
// 调用方应在 tickAgent 顶层 dispatch 前调用。
export function inferLifecycle(a) {
  if (a.lifecycle) return a.lifecycle;
  if (a.type === 'Builder' || a.type === 'Vagrant') {
    a.lifecycle = 'special';
  } else {
    a.lifecycle = 'transient';
  }
  return a.lifecycle;
}
