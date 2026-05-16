// test/signals.test.js
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { state, resetState } from '../../js/game/state.js';
import { buildWalkmap } from '../../js/game/walkmap.js';
import { emitSignal, tickSignals, getActiveSignalsForTest, clearAllSignalsForTest } from '../../js/game/agents/signals.js';
import { tickPermanent } from '../../js/game/agents/permanent.js';

function setup() {
  resetState({ difficulty: 'normal' });
  state.agents = [];
  state.gates = { N: { cell: { x: 7, y: 0 } }, S: { cell: {x: 7, y: 15}}, E: {cell:{x:15,y:7}}, W: {cell:{x:0,y:7}} };
  state.plots = []; // walkmap 内部需要 plots 字段，给空数组
  buildWalkmap();
  clearAllSignalsForTest();
}

test('emitSignal adds an active signal', () => {
  setup();
  emitSignal({ kind: 'fire', cell: { x: 5, y: 5 }, radius: 4, durationSec: 6 });
  const sigs = getActiveSignalsForTest();
  assert.equal(sigs.length, 1);
  assert.equal(sigs[0].kind, 'fire');
});

test('tickSignals attaches WatchSpectacle to permanent in radius', () => {
  setup();
  const a = {
    id: 1, x: 5, y: 5,
    lifecycle: 'permanent', role: 'Resident',
    interruptibility: 1.0, // 强制命中
    task: { current: { id: 'IdleWander', kind: 'atomic', stage: 'Performing', target: null, timer: 1 }, stack: [], cooldowns: {} },
  };
  state.agents.push(a);
  emitSignal({ kind: 'fire', cell: { x: 5, y: 5 }, radius: 4, durationSec: 6, attractRoles: ['*'] });
  tickSignals(0.2);
  // 命中后栈非空，current 应是 WatchSpectacle
  assert.equal(a.task.stack.length, 1);
  assert.equal(a.task.current.id, 'WatchSpectacle');
});

test('tickSignals snapshots transient state via watchResume', () => {
  setup();
  const a = {
    id: 2, x: 5, y: 5,
    lifecycle: 'transient', interruptibility: 1.0,
    target: { x: 8, y: 8 }, path: [{ x: 6, y: 5 }],
    scheduleIndex: 1, scheduleIcon: '香',
    pendingPath: false, lingering: false, lingerLeft: 0,
    lingerAnchorX: null, lingerAnchorY: null,
    leaving: false,
  };
  state.agents.push(a);
  emitSignal({ kind: 'fire', cell: { x: 5, y: 5 }, radius: 4, durationSec: 6, attractRoles: ['*'] });
  tickSignals(0.2);
  assert.ok(a.watching, 'watching should be set');
  assert.ok(a.watchResume, 'snapshot should exist');
  assert.equal(a.watchResume.scheduleIndex, 1);
  assert.equal(a.watchResume.scheduleIcon, '香');
});

test('Guard receives RespondIncident via resolveRoles, not stack push', () => {
  setup();
  const g = {
    id: 3, x: 5, y: 5,
    lifecycle: 'permanent', role: 'Guard',
    interruptibility: 0,
    task: { current: { id: 'Patrol', kind: 'atomic', stage: 'Performing', timer: 1 }, stack: [], cooldowns: {} },
  };
  state.agents.push(g);
  emitSignal({ kind: 'fire', cell: { x: 5, y: 5 }, radius: 4, durationSec: 6, resolveRoles: ['Guard'] });
  tickSignals(0.2);
  assert.equal(g.task.stack.length, 0, 'Guard should not push to stack');
  assert.equal(g.task.current.id, 'RespondIncident', 'Guard should switch task');
});

test('permanent WatchSpectacle enters Performing and restores stacked task', () => {
  setup();
  const original = { id: 'IdleWander', kind: 'atomic', stage: 'Performing', target: null, timer: 1 };
  const a = {
    id: 4, x: 5, y: 5,
    lifecycle: 'permanent', role: 'Resident',
    interruptibility: 1.0,
    task: { current: original, stack: [], cooldowns: {} },
  };
  state.agents.push(a);
  emitSignal({ kind: 'fire', cell: { x: 5, y: 5 }, radius: 4, durationSec: 6, attractRoles: ['*'] });
  tickSignals(0.2);
  assert.equal(a.task.current.id, 'WatchSpectacle');

  assert.doesNotThrow(() => tickPermanent(a, 0.016));
  assert.equal(a.task.current.id, 'WatchSpectacle');
  assert.equal(a.task.current.stage, 'Performing');

  a.lingerLeft = 0.001;
  tickPermanent(a, 0.1);
  assert.equal(a.task.current.id, 'IdleWander');
  assert.equal(a.task.stack.length, 0);
});
