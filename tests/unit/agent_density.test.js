// test/agent_density.test.js
// 2026-04-26 优化：覆盖新引入的密度配置、stress burst、findPath 缓存、
// 以及 spawn 时 maxAgents 的封顶行为。
//
// 这些测试不依赖 DOM/Canvas，纯逻辑层。

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { state } from '../../js/game/state.js';
import { buildWalkmap, findPath, getWalkmapVersion } from '../../js/game/walkmap.js';
import {
  CROWD_PRESETS,
  spawnAmbientAgents,
  spawnStressBurst,
  getCrowdConfig,
} from '../../js/game/agents/spawn.js';
import { resetAgentIds } from '../../js/game/agents/agent.js';

function fakeGates() {
  return {
    N: { cell: { x: 8, y: 0 }, todayTraffic: 0 },
    S: { cell: { x: 8, y: 15 }, todayTraffic: 0 },
    E: { cell: { x: 15, y: 8 }, todayTraffic: 0 },
    W: { cell: { x: 0, y: 8 }, todayTraffic: 0 },
  };
}

function resetSimWorld() {
  resetAgentIds();
  state.day = 1;
  state.minute = 600;        // 上午 10 点，spawn 走「白天」分布
  state.gateOpen = true;
  state.gates = fakeGates();
  state.agents = [];
  state.plots = [];          // 没有建筑：buildSchedule 走 fallback
  state.buildings = {};
  state.walkmap = null;
  state.crowd = { preset: 'medium' };
  buildWalkmap();
}

test('CROWD_PRESETS 按从低到高排序 maxAgents 单调上升', () => {
  const order = ['low', 'medium', 'high', 'stress'];
  for (let i = 1; i < order.length; i++) {
    assert.ok(
      CROWD_PRESETS[order[i]].maxAgents > CROWD_PRESETS[order[i - 1]].maxAgents,
      `${order[i]} 上限应该大于 ${order[i - 1]}`,
    );
  }
});

test('getCrowdConfig 缺省返回 medium', () => {
  const old = state.crowd;
  state.crowd = null;
  assert.equal(getCrowdConfig().maxAgents, CROWD_PRESETS.medium.maxAgents);
  state.crowd = old;
});

test('spawnAmbientAgents：到达 ambientCap 就停手，不会越界', () => {
  resetSimWorld();
  state.crowd = { preset: 'low' };
  // PR2: spawnAmbientAgents 只生 transient，受 ambientCap 熔断（不是 maxAgents）。
  const cap = CROWD_PRESETS.low.ambientCap;
  // 反复 spawn 直到稳态
  for (let i = 0; i < cap * 5; i++) spawnAmbientAgents();
  assert.ok(state.agents.length <= cap, `agents=${state.agents.length} 不应超过 ${cap}`);
  assert.ok(state.agents.length >= cap - CROWD_PRESETS.low.perTick, '应该接近上限');
});

test('spawnStressBurst：能在一帧塞入多个 agent，但仍受 spawnAtGate 的门状态门槛', () => {
  resetSimWorld();
  state.crowd = { preset: 'high' };
  const made = spawnStressBurst(50);
  assert.equal(made, 50);
  assert.equal(state.agents.length, 50);

  // 关门：应该一个也塞不进去
  state.gateOpen = false;
  const made2 = spawnStressBurst(20);
  assert.equal(made2, 0);
  assert.equal(state.agents.length, 50);
});

test('findPath：相同请求第二次命中缓存（返回独立数组，互不影响）', () => {
  resetSimWorld();
  const a = findPath(0, 8, 15, 8);  // W 门 → E 门，沿东西街
  assert.ok(a && a.length > 0);
  const b = findPath(0, 8, 15, 8);
  assert.ok(b && b.length === a.length);
  // 应是两个独立数组（缓存层做了浅拷贝），shift 一个不会影响另一个
  b.shift();
  assert.notEqual(a.length, b.length);
});

test('findPath：buildWalkmap 重建后版本号变化，缓存被失效', () => {
  resetSimWorld();
  const v1 = getWalkmapVersion();
  findPath(0, 8, 15, 8);
  buildWalkmap();
  const v2 = getWalkmapVersion();
  assert.notEqual(v1, v2, 'walkmapVersion 应在 buildWalkmap 后递增');
});
