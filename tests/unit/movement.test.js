import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { setTargetCell, advancePath, lingerStep, ARRIVE_EPSILON, resetPathBudgetForTest } from '../../js/game/agents/movement.js';
import { state } from '../../js/game/state.js';
import { buildWalkmap } from '../../js/game/walkmap.js';

function resetSimWorld() {
  state.plots = [];
  state.buildings = {};
  state.walkmap = null;
  buildWalkmap();
}

test('setTargetCell sets target to null when cell is null', () => {
  resetPathBudgetForTest();
  const a = { x: 5, y: 5 };
  const result = setTargetCell(a, null);
  assert.equal(result, false);
  assert.equal(a.target, null);
  assert.equal(a.path, null);
});

test('setTargetCell with valid walkmap snaps and computes path or queues pendingPath', () => {
  resetSimWorld();
  resetPathBudgetForTest();
  // 街道格 (7,8) 一定可走（十字街）
  const a = { x: 7.5, y: 7.5 };
  const ok = setTargetCell(a, { x: 7, y: 6 });
  // ok=true → BFS 已算路径；ok=false → 预算耗尽，pendingPath=true
  if (ok) {
    assert.ok(Array.isArray(a.path));
    assert.equal(a.target.x, 7);
    assert.equal(a.target.y, 6);
  } else {
    assert.equal(a.pendingPath, true);
  }
});

test('ARRIVE_EPSILON is a small positive number', () => {
  assert.equal(typeof ARRIVE_EPSILON, 'number');
  assert.ok(ARRIVE_EPSILON > 0 && ARRIVE_EPSILON < 0.1);
});

test('advancePath moves agent toward path[0] center by speed*dt', () => {
  // 起点 (5.0, 4.5)，目标 {x:6, y:4}，中心 (6.5, 4.5)，纯横向移动 dy=0
  const a = { x: 5.0, y: 4.5, path: [{ x: 6, y: 4 }] };
  advancePath(a, 0.5, 1.4); // dt=0.5s, speed=1.4 cell/s → step=0.7
  assert.ok(a.x > 5.0 && a.x < 6.5, `x should move toward 6.5, got ${a.x}`);
  assert.equal(a.y, 4.5);
});

test('advancePath consumes waypoint when within ARRIVE_EPSILON', () => {
  const a = { x: 5.99, y: 5.5, path: [{ x: 5, y: 5 }] };
  advancePath(a, 0.001, 1.4); // 几乎不走
  // 距离 (5.5,5.5) 到 a (5.99,5.5) = 0.49，> EPSILON，不消费
  // 改用更近的位置
  const b = { x: 5.51, y: 5.5, path: [{ x: 5, y: 5 }] };
  advancePath(b, 0.001, 1.4);
  // (5.5,5.5) 到 b (5.51,5.5) = 0.01 < EPSILON → consume
  assert.equal(b.path.length, 0);
  assert.equal(b.x, 5.5);
});

test('lingerStep wanders within 0.4 cell of anchor', () => {
  const a = { x: 5.0, y: 5.0, lingerAnchorX: 5.0, lingerAnchorY: 5.0, lingerLeft: 2.0 };
  for (let i = 0; i < 100; i++) lingerStep(a, 0.1);
  const dx = a.x - 5.0, dy = a.y - 5.0;
  assert.ok(Math.hypot(dx, dy) <= 0.4 + 1e-6, `should stay within 0.4, got ${Math.hypot(dx, dy)}`);
  assert.ok(a.lingerLeft < 2.0, 'lingerLeft should decrease');
});
