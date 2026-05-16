// test/vagrants.test.js
// slice-1 流民 agent：承诺失败时 spawnVagrants 在源门生成 N 个流民。

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnVagrants } from '../../js/game/agents/spawn.js';
import { resetAgentIds } from '../../js/game/agents/agent.js';
import { makeFakeState } from './_helpers.js';

function fakeGates() {
  return {
    N: { cell: { x: 8, y: 0 }, todayTraffic: 0 },
    S: { cell: { x: 8, y: 15 }, todayTraffic: 0 },
    E: { cell: { x: 15, y: 8 }, todayTraffic: 0 },
    W: { cell: { x: 0, y: 8 }, todayTraffic: 0 },
  };
}

test('spawnVagrants: 在指定门 cell 周围生成 N 个 Vagrant agent', () => {
  resetAgentIds();
  const s = makeFakeState({ day: 5 });
  s.gates = fakeGates();
  s.agents = [];
  spawnVagrants(s, 'S', 3);
  assert.equal(s.agents.length, 3);
  for (const a of s.agents) {
    assert.equal(a.type, 'Vagrant');
    assert.equal(a.fromGate, 'S');
    assert.equal(a.bornDay, 5);
    assert.equal(a.lingerUntilDay, 5 + 3);
    // 生成在门 cell 附近 ±0.4
    assert.ok(Math.abs(a.x - (8 + 0.5)) <= 0.5);
    assert.ok(Math.abs(a.y - (15 + 0.5)) <= 0.5);
  }
});

test('spawnVagrants: gates 缺失或目标门不存在 → 不抛错', () => {
  resetAgentIds();
  const s = makeFakeState({ day: 1 });
  s.gates = null;
  s.agents = [];
  spawnVagrants(s, 'S', 3);  // 不抛
  assert.equal(s.agents.length, 0);
  s.gates = {};
  spawnVagrants(s, 'X', 3);  // 不抛
  assert.equal(s.agents.length, 0);
});

test('spawnVagrants: 不污染 gate.todayTraffic（流民不算正式访客）', () => {
  resetAgentIds();
  const s = makeFakeState({ day: 1 });
  s.gates = fakeGates();
  s.agents = [];
  spawnVagrants(s, 'S', 3);
  assert.equal(s.gates.S.todayTraffic, 0);
});
