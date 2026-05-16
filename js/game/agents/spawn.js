// src/agents/spawn.js
// 初始人口 + 运行期 ambient spawn。Spec #1 后改为：
//   - 居民由「已建成 house」的 doorCell 生成，不走门
//   - 其他类型从 4 个坊门 cell 进入，按 type 偏好选门
//   - 每次入坊 → gate.todayTraffic++，gate.lastVisitor = 中文标签
//
// 2026-04-26：加入「人流密度」配置（state.crowd），把上限从隐式 ~30 提升到可调。
// 高密度下需要 spawnBatch 一次塞多个，避免每秒只放 1 个跟不上节奏。

import { state } from '../state.js';
import { Agent } from './agent.js';
import { spawnPermanentForPlot } from './permanent.js';
import { emitSignal } from './signals.js';

const TYPE_LABEL = {
  Pilgrim: '香客',
  Merchant: '商旅',
  Commoner: '行人',
  Noble: '贵客',
  Resident: '坊民',
  Monk: '僧人',
  Guard: '巡夜人',
  Vendor: '商贩',
  Servant: '仆从',
};

const TYPE_GATE = {
  Pilgrim:  'W',
  Merchant: 'E',
  Commoner: 'S',
  Noble:    'N',
  Servant:  'N',
};

const GATE_KEYS = ['N', 'S', 'E', 'W'];

// 各密度档位下的关键参数。
// ambientCap：transient agent 上限（流动人口）。
// permanentCap：permanent agent 上限（常驻居民）。
// maxAgents getter 供 debug.js 和老测试向下兼容。
export const CROWD_PRESETS = {
  low:    { ambientCap: 50,  permanentCap: 25, get maxAgents() { return this.ambientCap + this.permanentCap; }, spawnIntervalMin: 4.0, spawnIntervalMax: 7.0, perTick: 1 },
  medium: { ambientCap: 120, permanentCap: 40, get maxAgents() { return this.ambientCap + this.permanentCap; }, spawnIntervalMin: 1.6, spawnIntervalMax: 3.2, perTick: 2 },
  high:   { ambientCap: 220, permanentCap: 60, get maxAgents() { return this.ambientCap + this.permanentCap; }, spawnIntervalMin: 0.7, spawnIntervalMax: 1.4, perTick: 3 },
  stress: { ambientCap: 360, permanentCap: 80, get maxAgents() { return this.ambientCap + this.permanentCap; }, spawnIntervalMin: 0.3, spawnIntervalMax: 0.7, perTick: 5 },
};

export function getCrowdConfig() {
  const key = (state.crowd && state.crowd.preset) || 'medium';
  return CROWD_PRESETS[key] || CROWD_PRESETS.medium;
}

function pickGateKey(type) {
  return TYPE_GATE[type] || GATE_KEYS[Math.floor(Math.random() * GATE_KEYS.length)];
}

function spawnAtGate(type) {
  if (!state.gates) return null;
  // 夜禁 + 坊门关闭：不再放任何人进坊
  if (state.gateOpen === false) return null;
  const gateKey = pickGateKey(type);
  const g = state.gates[gateKey];
  if (!g) return null;
  // 在门 cell 中心生成；多 cell 门取主 cell。轻微抖动避免叠成一坨。
  const x = g.cell.x + 0.5 + (Math.random() - 0.5) * 0.4;
  const y = g.cell.y + 0.5 + (Math.random() - 0.5) * 0.4;
  const a = new Agent(type, null, { name: TYPE_LABEL[type] || type, x, y });
  a.lifecycle = 'transient';
  a.fromGate = gateKey;
  a.bornAt = performance.now();
  a.targetReached = 0;
  a.target = null;
  a.visible = true;
  state.agents.push(a);
  g.todayTraffic = (g.todayTraffic || 0) + 1;
  g.lastVisitor = TYPE_LABEL[type] || type;
  if (type === 'Noble') {
    emitSignal({
      kind: 'spectacle',
      cell: { x: g.cell.x, y: g.cell.y },
      radius: 4,
      durationSec: 5,
      attractRoles: ['*'],
    });
  }
  return a;
}

export function spawnInitialAgents() {
  // PR2: 已建成 plot → 调 spawnPermanentForPlot（按 PERMANENT_BY_KIND 表）
  // 替代旧的「Resident-only」路径。house 在 PR2 上线，其他 kind PR3 扩表。
  for (const p of state.plots) {
    if (p.status === 'built') spawnPermanentForPlot(p);
  }
  // 西门进 1 个 Pilgrim（保留旧 ambient 行为）
  spawnAtGate('Pilgrim');
}

// 抽取的入坊类型分布。早晚各异：白天香客/商旅多，傍晚行人/贵客回家少。
function pickAmbientType() {
  // 简单的时段权重表
  const minute = state.minute || 600;
  const hour = Math.floor(minute / 60);
  let weights;
  if (hour >= 6 && hour < 11) {
    // 上午：香客 + 商旅 高峰
    weights = { Pilgrim: 4, Merchant: 3, Commoner: 2, Noble: 1, Vendor: 2, Servant: 1 };
  } else if (hour >= 11 && hour < 15) {
    // 中午：行人 + 商旅 高峰
    weights = { Pilgrim: 2, Merchant: 4, Commoner: 4, Noble: 2, Vendor: 3, Servant: 1 };
  } else if (hour >= 15 && hour < 18) {
    // 下午：贵客 + 商旅
    weights = { Pilgrim: 2, Merchant: 3, Commoner: 3, Noble: 3, Vendor: 2, Servant: 2 };
  } else {
    // 早 / 晚：少量
    weights = { Pilgrim: 1, Merchant: 1, Commoner: 2, Noble: 1, Vendor: 1, Servant: 0 };
  }
  let total = 0;
  for (const k of Object.keys(weights)) total += weights[k];
  let r = Math.random() * total;
  for (const k of Object.keys(weights)) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return 'Commoner';
}

// 单次 ambient spawn：默认放 1 个，但可以配置 perTick 一次放多个。
// PR2: 只对 transient 计数熔断，permanent / special 不占 ambient 上限。
export function spawnAmbientAgents() {
  if (!state.gates) return;
  const cfg = getCrowdConfig();
  let transientCount = 0;
  for (const a of state.agents) if (a.lifecycle === 'transient') transientCount++;
  if (transientCount >= cfg.ambientCap) return;
  const room = cfg.ambientCap - transientCount;
  const n = Math.min(cfg.perTick, room);
  for (let i = 0; i < n; i++) {
    spawnAtGate(pickAmbientType());
  }
}

// 调试用：一次塞 N 个 Commoner 进来做压力测试。
export function spawnStressBurst(n = 50) {
  if (!state.gates) return 0;
  let made = 0;
  const types = ['Commoner', 'Pilgrim', 'Merchant', 'Vendor', 'Noble', 'Servant'];
  for (let i = 0; i < n; i++) {
    const t = types[Math.floor(Math.random() * types.length)];
    if (spawnAtGate(t)) made++;
  }
  return made;
}

// === Spec #2：Builder spawn ===
// 项目开工时调用：在 plot.doorCell 周围生成 1-2 个 Builder agent。

// === slice-1：流民 spawn ===
// 承诺失败时调用：在指定门 cell 周围生成 N 个 Vagrant agent。

const VAGRANT_LINGER_DAYS = 3;

export function spawnVagrants(state, gateKey, n) {
  if (!state.gates) return;
  const g = state.gates[gateKey];
  if (!g) return;
  for (let i = 0; i < n; i++) {
    const x = g.cell.x + 0.5 + (Math.random() - 0.5) * 0.8;
    const y = g.cell.y + 0.5 + (Math.random() - 0.5) * 0.8;
    const a = new Agent('Vagrant', null, { name: '流民', x, y });
    a.lifecycle = 'special';
    a.fromGate = gateKey;
    a.bornAt = performance.now();
    a.bornDay = state.day;
    a.lingerUntilDay = state.day + VAGRANT_LINGER_DAYS;
    a.targetReached = 0;
    a.target = null;
    a.visible = true;
    state.agents.push(a);
  }
}

export function spawnBuildersFor(plot) {
  if (!plot || !plot.doorCell) return;
  const count = (plot.size.w * plot.size.h) >= 4 ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const a = new Agent('Builder', null, {
      name: '工匠',
      x: plot.doorCell.x + 0.5 + (Math.random() - 0.5) * 0.6,
      y: plot.doorCell.y + 0.5 + (Math.random() - 0.5) * 0.6,
    });
    a.constructionPlotId = plot.id;
    a.builderHomeX = plot.doorCell.x + 0.5;
    a.builderHomeY = plot.doorCell.y + 0.5;
    a.builderTurnAt = performance.now() + 500;
    a.bornAt = performance.now();
    a.visible = true;
    state.agents.push(a);
  }
}

// === 人群同步：让承诺对象在地图上留下可见小人 ===
function liveGroupAgents(group) {
  const ids = new Set(group.agentIds || []);
  return state.agents.filter(a => ids.has(a.id));
}

function spawnGroupAgent(group, type, x, y, opts = {}) {
  const a = new Agent(type, null, {
    name: opts.name || group.name || TYPE_LABEL[type] || type,
    x, y,
    state: opts.state || 'Idle',
  });
  a.groupId = group.id;
  a.persistentGroup = !!opts.persistent;
  a.fromGate = group.sourceGate || 'S';
  a.homePlotId = opts.homePlotId || group.homePlotId || null;
  a.workPlotId = opts.workPlotId || group.workPlotId || null;
  a.bornAt = performance.now();
  a.targetReached = 0;
  a.target = null;
  a.visible = true;
  state.agents.push(a);
  group.agentIds = Array.from(new Set([...(group.agentIds || []), a.id]));
  return a;
}

function plotDoor(plotId) {
  const p = state.plots.find(pl => pl.id === plotId);
  return p ? { x: p.doorCell.x + 0.5, y: p.doorCell.y + 0.5 } : null;
}

export function syncGroupAgents() {
  if (!Array.isArray(state.groups) || !state.gates) return;
  const now = performance.now();
  for (const group of state.groups) {
    if (group.status === 'departed') continue;
    const live = liveGroupAgents(group).filter(a => state.agents.includes(a));
    group.agentIds = live.map(a => a.id);
    if (now - (group.lastAgentSpawnAt || 0) < 900) continue;

    if (group.status === 'waiting-outside' || group.status === 'promised') {
      const desired = 3;
      const g = state.gates[group.sourceGate || 'S'];
      if (!g) continue;
      while (group.agentIds.length < desired) {
        spawnGroupAgent(group, 'Newcomer', g.cell.x + 0.5 + (Math.random() - 0.5) * 0.9, g.cell.y + 0.5 + (Math.random() - 0.5) * 0.9, { persistent: true });
        group.lastAgentSpawnAt = now;
      }
    } else if (group.status === 'settled') {
      const desired = group.workPlotId ? 2 : 1;
      const home = plotDoor(group.homePlotId);
      if (!home) continue;
      while (group.agentIds.length < desired) {
        spawnGroupAgent(group, group.workPlotId ? 'Weaver' : 'Resident', home.x + (Math.random() - 0.5) * 0.4, home.y + (Math.random() - 0.5) * 0.4, {
          persistent: true,
          homePlotId: group.homePlotId,
          workPlotId: group.workPlotId,
        });
        group.lastAgentSpawnAt = now;
      }
    } else if (group.status === 'vagrant') {
      const g = state.gates[group.sourceGate || 'S'];
      if (!g) continue;
      while (group.agentIds.length < 2) {
        spawnGroupAgent(group, 'Vagrant', g.cell.x + 0.5 + (Math.random() - 0.5) * 0.8, g.cell.y + 0.5 + (Math.random() - 0.5) * 0.8, { persistent: true });
        group.lastAgentSpawnAt = now;
      }
    }
  }
}
