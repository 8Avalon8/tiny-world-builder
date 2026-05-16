// src/agents/signals.js
// PR4: 实时局部信号通道。emitSignal 入；tickSignals 5Hz 扫描；
// 命中按 lifecycle 分两套（permanent: task.stack；transient: watchResume）。
// 与 events.js 解耦：events 是跨天 UI 模型，本通道是实时空间事件。

import { state } from '../state.js';
import { queryRadius } from './spatial-query.js';
import { setTargetCell } from './movement.js';

let _signals = [];
let _nextSignalId = 1;
let _lastTickMs = -Infinity;
const TICK_INTERVAL_MS = 200; // 5Hz

export function emitSignal(opts) {
  const sig = {
    id: opts.id || `sig-${_nextSignalId++}`,
    kind: opts.kind,
    cell: opts.cell,
    radius: opts.radius || 4,
    durationSec: opts.durationSec || 6,
    attractRoles: opts.attractRoles || ['*'],
    resolveRoles: opts.resolveRoles || [],
    bornMs: performance.now(),
  };
  _signals.push(sig);
  return sig;
}

function attachWatchPermanent(a, sig) {
  if (!a.task) a.task = { current: null, stack: [], cooldowns: {} };
  if (a.task.current) a.task.stack.push(a.task.current);
  a.task.current = {
    id: 'WatchSpectacle',
    kind: 'atomic',
    stage: 'Approaching',
    target: { x: sig.cell.x, y: sig.cell.y },
    timer: sig.durationSec,
    signalId: sig.id,
  };
  setTargetCell(a, sig.cell);
}

function attachWatchTransient(a, sig) {
  a.watchResume = {
    target: a.target,
    path: a.path,
    scheduleIndex: a.scheduleIndex,
    scheduleIcon: a.scheduleIcon,
    pendingPath: a.pendingPath,
    lingering: a.lingering,
    lingerLeft: a.lingerLeft,
    lingerAnchorX: a.lingerAnchorX,
    lingerAnchorY: a.lingerAnchorY,
  };
  a.watching = {
    signalId: sig.id,
    untilMs: performance.now() + sig.durationSec * 1000,
    anchor: sig.cell,
  };
  setTargetCell(a, sig.cell);
  a.lingering = false;
}

function makeRespondIncident(a, sig) {
  a.task.current = {
    id: 'RespondIncident',
    kind: 'atomic',
    stage: 'Approaching',
    target: { x: sig.cell.x, y: sig.cell.y },
    timer: sig.durationSec,
    signalId: sig.id,
  };
  setTargetCell(a, sig.cell);
}

function shouldAttract(a, sig) {
  if (sig.attractRoles.includes('*')) return true;
  if (a.role && sig.attractRoles.includes(a.role)) return true;
  return false;
}

function shouldResolve(a, sig) {
  return a.role && sig.resolveRoles.includes(a.role);
}

function tickSignalsCore() {
  const now = performance.now();
  // 清过期信号
  _signals = _signals.filter(s => now - s.bornMs < s.durationSec * 1000);

  if (_signals.length === 0) return;

  for (const sig of _signals) {
    const cands = queryRadius(state.agents, sig.cell.x, sig.cell.y, sig.radius);
    for (const a of cands) {
      // Resolve 通道（Guard 主动响应）
      if (shouldResolve(a, sig)) {
        if (!a.task) a.task = { current: null, stack: [], cooldowns: {} };
        if (a.task.current && a.task.current.id !== 'RespondIncident') {
          makeRespondIncident(a, sig);
        }
        continue;
      }
      if (!shouldAttract(a, sig)) continue;
      // Attract 通道
      if (a.lifecycle === 'permanent') {
        if (!a.task || !a.task.current || a.task.current.id === 'WatchSpectacle') continue;
        // Sleep 不被打断
        const cur = a.task.current;
        if (cur.id === 'Sleep') continue;
        if (Math.random() >= a.interruptibility) continue;
        attachWatchPermanent(a, sig);
      } else if (a.lifecycle === 'transient') {
        if (a.leaving || a.watching) continue;
        if (Math.random() >= a.interruptibility) continue;
        attachWatchTransient(a, sig);
      }
    }
  }
}

// 主循环 5Hz 调用入口；dt 是真实秒。
export function tickSignals(dt) {
  const now = performance.now();
  if (now - _lastTickMs < TICK_INTERVAL_MS) return;
  _lastTickMs = now;
  tickSignalsCore();
}

// 测试用
export function getActiveSignalsForTest() { return _signals.slice(); }
// -Infinity 确保 clear 后下次 tickSignals 立刻执行（不被 5Hz 节流挡）
export function clearAllSignalsForTest() { _signals = []; _lastTickMs = -Infinity; }
