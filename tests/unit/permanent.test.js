// test/permanent.test.js
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { state } from '../../js/game/state.js';
import { buildWalkmap } from '../../js/game/walkmap.js';

// 简化：不引入完整渲染初始化，直接构造最小 state
function setupTestState() {
  state.minute = 19 * 60 + 30; // Night
  state.day = 1;
  state.plots = [{
    id: 'house-test', status: 'built', building: 'house-01',
    doorCell: { x: 4, y: 7 },
    cells: [{ x: 4, y: 6 }],
    quadrant: 'NW',
  }];
  state.buildings = { 'house-01': { id: 'house-01', kind: 'house' } };
  state.gates = { N: { cell: { x: 7, y: 0 } } }; // 占位
  state.gateOpen = false;
  state.agents = [];
  // 初始化 walkmap，否则 setTargetCell → findPath 会崩溃
  buildWalkmap();
}

test('Sleep task wakes on next day Morning', async (t) => {
  setupTestState();
  const { spawnPermanentForPlot, tickPermanent } = await import('../../js/game/agents/permanent.js');
  spawnPermanentForPlot(state.plots[0]);
  const r = state.agents.find(a => a.role === 'Resident');
  assert.ok(r, 'Resident should be spawned');
  // 强制让他进入 Sleep
  r.task.current = { id: 'Sleep', kind: 'atomic', stage: 'Performing', timer: 999 };
  r.sleepStartDay = state.day;
  r.renderHidden = true;
  // 模拟跨日：minute 跳到次日 Morning
  state.day = 2;
  state.minute = 6 * 60;
  tickPermanent(r, 0.016);
  // 醒来后断言：不再 hidden，sleepStartDay 已清，且 current 不再是 Sleep
  // （current 可能立刻被 pickTask 选成新任务，所以不能断言 == null）
  assert.equal(r.renderHidden, false, 'should wake up on day change + Morning');
  assert.equal(r.sleepStartDay, null, 'sleepStartDay should be cleared');
  if (r.task.current) {
    assert.notEqual(r.task.current.id, 'Sleep', 'should not still be Sleep');
  }
});

test('damaged plot disables work-class tasks for permanent residents', async (t) => {
  setupTestState();
  const { spawnPermanentForPlot, onPlotDamaged, onPlotRepaired } = await import('../../js/game/agents/permanent.js');
  spawnPermanentForPlot(state.plots[0]);
  const r = state.agents.find(a => a.role === 'Resident');
  assert.equal(r.workDisabled, false);
  onPlotDamaged(state.plots[0]);
  assert.equal(r.workDisabled, true);
  onPlotRepaired(state.plots[0]);
  assert.equal(r.workDisabled, false);
});
