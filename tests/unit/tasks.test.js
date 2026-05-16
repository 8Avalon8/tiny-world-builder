import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { TASKS, getTask, pickTask } from '../../js/game/agents/tasks.js';

test('TASKS table contains 4 minimal tasks for PR1', () => {
  const ids = TASKS.map(t => t.id);
  assert.ok(ids.includes('IdleWander'));
  assert.ok(ids.includes('GoToWell'));
  assert.ok(ids.includes('GoHome'));
  assert.ok(ids.includes('Sleep'));
});

test('getTask returns task by id', () => {
  const t = getTask('IdleWander');
  assert.equal(t.id, 'IdleWander');
});

test('pickTask returns IdleWander when no other tasks match', () => {
  const fakeAgent = {
    role: 'Resident',
    needs: { thirst: 0, fatigue: 0, devotion: 0 },
    task: { current: null, stack: [], cooldowns: {} },
    homePlotId: null, // 无 home → GoHome 应被 precheck 淘汰
  };
  const fakeState = { minute: 600 /* Morning */, day: 1, plots: [], buildings: {} };
  const picked = pickTask(fakeAgent, fakeState);
  assert.ok(picked, 'should always pick something');
  assert.equal(picked.id, 'IdleWander');
});

test('pickTask honors phases filter', () => {
  // GoToWell 不在 LateNight phase → LateNight 时应只剩 IdleWander/Sleep/GoHome
  const a = {
    role: 'Resident',
    needs: { thirst: 0.5, fatigue: 0, devotion: 0 },
    task: { current: null, stack: [], cooldowns: {} },
    homePlotId: null,
  };
  const s = { minute: 23 * 60 + 30, day: 1, plots: [], buildings: {} }; // LateNight
  const picked = pickTask(a, s);
  assert.notEqual(picked.id, 'GoToWell');
});

test('pickTask honors cooldown', () => {
  const a = {
    role: 'Resident',
    needs: { thirst: 0.9, fatigue: 0, devotion: 0 },
    task: { current: null, stack: [], cooldowns: { GoToWell: 9999 } },
    homePlotId: null,
  };
  const s = { minute: 600, day: 1, plots: [], buildings: {} };
  const picked = pickTask(a, s);
  assert.notEqual(picked.id, 'GoToWell');
});

test('TASKS table contains PR3 work-class tasks', () => {
  const ids = TASKS.map(t => t.id);
  for (const id of ['ChantSutra', 'Patrol', 'TendStall', 'BegAlms', 'VisitTemple', 'VisitNeighbor']) {
    assert.ok(ids.includes(id), `should include ${id}`);
  }
});

test('pickTask filters workClass tasks when workDisabled', () => {
  const a = {
    role: 'Stallkeeper', workDisabled: true,
    needs: { thirst: 0, fatigue: 0 },
    task: { current: null, stack: [], cooldowns: {} },
    homePlotId: 'weaver-test', workPlotId: 'weaver-test',
  };
  const s = { minute: 12 * 60, day: 1, gateOpen: true,
    plots: [{ id: 'weaver-test', status: 'damaged', building: 'weaver-01', doorCell: { x: 5, y: 5 } }],
    buildings: { 'weaver-01': { kind: 'weaver' } } };
  // 跑 50 次，TendStall (workClass) 不应被选
  for (let i = 0; i < 50; i++) {
    const picked = pickTask(a, s);
    assert.notEqual(picked.id, 'TendStall', 'workClass task should be filtered when workDisabled');
  }
});

test('Monk picks ChantSutra in Noon when no other strong needs', () => {
  // 依赖随机，跑 50 次至少有一次中
  const a = {
    role: 'Monk',
    needs: { thirst: 0, fatigue: 0, devotion: 0 },
    task: { current: null, stack: [], cooldowns: {} },
    homePlotId: 'temple-01',
    workPlotId: 'temple-01',
  };
  const s = { minute: 12 * 60, day: 1, gateOpen: true,
    plots: [{ id: 'temple-01', status: 'built', building: 'temple-01', doorCell: { x: 7, y: 9 } }],
    buildings: { 'temple-01': { kind: 'temple' } } };
  let hit = false;
  for (let i = 0; i < 50; i++) if (pickTask(a, s).id === 'ChantSutra') { hit = true; break; }
  assert.ok(hit, 'Monk in Noon should sometimes pick ChantSutra');
});
