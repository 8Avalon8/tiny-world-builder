// src/world/promises.js
// 「承诺」机制：接纳请愿不再立即结算，而是生成一条带期限的承诺。
// 玩家在期限内满足空间约束 + 资源条件 → 自动结算成功；过期未满足 → 结算失败。

import { findMatchingPlots, countSatisfied } from './spatial.js';
import { countHostingBuildings } from './citizens.js';
import { addStance, STANCE_PROMISE_RULE } from './balance-stance.js';
import { clamp } from './utils.js';
import { onPlotRepaired } from './_agent-stubs.js';
import { markPromiseOutcome, rememberRelation } from './groups.js';

// slice-3：约束类型可读取的派生量。承诺模板里的 constraints 字段用
// `<metric>Max` / `<metric>Min` 表达上下限，这里把 metric 解析到取值器。
const CONSTRAINT_GETTERS = {
  fireRisk:        (s) => s.stats.fireRisk || 0,
  congestion:      (s) => s.stats.congestion || 0,
  morale:          (s) => s.stats.morale || 0,
  fame:            (s) => s.stats.fame || 0,
  freeGuards:      (s) => (s.stats.guards || 0) -
                          Object.values(s.guardAssignments || {}).reduce((a, b) => a + b, 0),
  hostingCapacity: (s) => countHostingBuildings(s),
};

// 评估单条 constraint。返回 { metric, op, threshold, current, ok }
export function evaluateConstraint(state, key, threshold) {
  let metric, op;
  if (key.endsWith('Max')) { metric = key.slice(0, -3); op = 'max'; }
  else if (key.endsWith('Min')) { metric = key.slice(0, -3); op = 'min'; }
  else { metric = key; op = 'min'; }  // 默认 min
  const getter = CONSTRAINT_GETTERS[metric];
  const current = getter ? getter(state) : 0;
  const ok = op === 'max' ? current <= threshold : current >= threshold;
  return { metric, op, threshold, current, ok };
}

export function newPromiseId(state) {
  return `prm-${String(state.nextPromiseId++).padStart(3, '0')}`;
}

// 创建承诺。def 字段：
//   kind, sourceId, sourceGate, deadlineDays
//   spatial: [...]               — 空间需求
//   resources: { cloth: 4 }      — 资源 ≥ 阈值
//   constraints: { fireRiskMax: 60, hostingCapacityMin: 1 }  — 状态约束（slice-3+）
//   success / failure            — 二档结算（slice-1/2）
//   outcomes: { grand, basic, cold }  — 三档结算（slice-3+，与 success/failure 互斥）
export function createPromise(state, def) {
  const promise = {
    id: newPromiseId(state),
    kind: def.kind,
    sourceId: def.sourceId || null,
    sourceGate: def.sourceGate || null,
    groupId: def.groupId || null,
    bornAtDay: state.day,
    deadline: state.day + def.deadlineDays,
    spatial: def.spatial || [],
    resources: def.resources || {},
    constraints: def.constraints || {},
    // 三档与二档互斥：传 outcomes 走分档；传 success/failure 走旧路径
    outcomes: def.outcomes || null,
    success: def.success || null,
    failure: def.failure || null,
    resolved: false,
    outcome: null,                          // 'success'|'failed-expired'|'grand'|'basic'|'cold'
  };
  state.promises.push(promise);
  return promise;
}

// 计算承诺的当前进度，用于 UI 显示与条件判断。
//   spatial: [{ spec, satisfied, need }]
//   resources: [{ key, have, need }]
//   constraints: [{ key, ...evaluateConstraint }] (slice-3+)
//   *OK / complete: bool
export function checkPromiseProgress(state, promise) {
  const spatial = promise.spatial.map(spec => ({
    spec,
    satisfied: countSatisfied(state, spec),
    need: spec.count,
  }));
  const resources = Object.entries(promise.resources).map(([key, need]) => ({
    key,
    have: state.stats[key] ?? 0,
    need,
  }));
  const constraints = Object.entries(promise.constraints || {}).map(([key, threshold]) => ({
    key,
    ...evaluateConstraint(state, key, threshold),
  }));
  const spatialOK = spatial.every(s => s.satisfied >= s.need);
  const resourcesOK = resources.every(r => r.have >= r.need);
  const constraintsOK = constraints.every(c => c.ok);
  return {
    spatial, resources, constraints,
    spatialOK, resourcesOK, constraintsOK,
    complete: spatialOK && resourcesOK && constraintsOK,
  };
}

// 应用一个 outcome 配置（success/failure/grand/basic/cold 都走这条）。
// 副作用键：population / morale / congestion / skilled / fame / money / wood / cloth /
//          hudUnlock / vagrantCount / lanternProgress / triggerNoble / log
function applyOutcome(state, promise, out, addLog, spawnVagrantsFn) {
  if (!out) return;
  // 数值增量
  if (typeof out.population === 'number') state.stats.population += out.population;
  if (typeof out.morale === 'number')     state.stats.morale     += out.morale;
  if (typeof out.congestion === 'number') state.stats.congestion = Math.max(0, (state.stats.congestion || 0) + out.congestion);
  if (typeof out.fireRisk === 'number')   state.stats.fireRisk   = Math.max(0, (state.stats.fireRisk || 0) + out.fireRisk);
  if (typeof out.fame === 'number')       state.stats.fame       = (state.stats.fame || 0) + out.fame;
  if (typeof out.money === 'number')      state.stats.money     += out.money;
  if (typeof out.wood === 'number')       state.stats.wood      += out.wood;
  if (typeof out.cloth === 'number')      state.stats.cloth     += out.cloth;
  if (typeof out.skilled === 'number')    state.skilledResidents = (state.skilledResidents || 0) + out.skilled;
  if (Array.isArray(out.hudUnlock))       for (const k of out.hudUnlock) state.hudUnlocked[k] = true;
  state.stats.morale = clamp(state.stats.morale, 0, 100);
  state.stats.fame   = clamp(state.stats.fame || 0, 0, 100);
  // 流民
  if (typeof out.vagrantCount === 'number' && out.vagrantCount > 0 && spawnVagrantsFn) {
    spawnVagrantsFn(state, promise.sourceGate || 'S', out.vagrantCount);
  }
  if (typeof out.lanternProgress === 'number') {
    state.lanternProgress = (state.lanternProgress || 0) + out.lanternProgress;
  }
  if (out.triggerNoble) state.nobleStewardEligible = true;
  if (out.unlockMansion) {
    state.nobleAccepted = true;
    state.nobleAcceptedOnDay = state.day;  // 用于 stage-2 催办触发计时
    if (!state.mainGoal) state.mainGoal = {};
    state.mainGoal.nobleStewardHosted = true;
    if (state.chapterStage === 'noble') state.chapterStage = 'free';
    rememberRelation(state, 'noble', '达官管事认可慈灯坊，府邸势力开始入坊。', 8);
  }
  if (out.resetNobleEligible) state.nobleStewardEligible = false;
  // slice-7: 阶段-2 失败 → 整线终止
  if (out.resetNobleAccepted) {
    state.nobleAccepted = false;
    state.nobleStewardEligible = false;
  }
  // slice-9：permit promise 结算时批量解锁 / 写冷却
  if (typeof out.onSettle === 'function') {
    out.onSettle(state, addLog);
  }
  // 日志
  if (addLog && out.log) addLog(out.log, true);
}

// 结算成功（旧二档）：扣资源 + 应用 success
export function settlePromiseSuccess(state, promise, addLog) {
  for (const [key, need] of Object.entries(promise.resources)) {
    state.stats[key] = (state.stats[key] ?? 0) - need;
  }
  applyOutcome(state, promise, promise.success, addLog, null);
  promise.resolved = true;
  promise.outcome = 'success';
  markPromiseOutcome(state, promise, 'success');
  // slice-2: 新民安置成功 → 排队下一条织棚承诺
  if (promise.kind === 'newcomer-settle') {
    state.lastNewcomerSettleDay = state.day;
    state.weaverRequestQueued = true;
    if (state.chapterStage === 'settlement') state.chapterStage = 'weaving';
  }
  if (promise.kind === 'weaver-shop') {
    if (state.chapterStage === 'weaving' || state.chapterStage === 'settlement') state.chapterStage = 'festival';
  }
  const ruleKey = STANCE_PROMISE_RULE[`${promise.kind}:success`];
  if (ruleKey) addStance(state, ruleKey);
}

// 结算失败（旧二档）：应用 failure（含流民）
export function settlePromiseFailure(state, promise, addLog, spawnVagrantsFn) {
  applyOutcome(state, promise, promise.failure, addLog, spawnVagrantsFn);
  promise.resolved = true;
  promise.outcome = 'failed-expired';
  markPromiseOutcome(state, promise, 'failed-expired');
}

// slice-3：三档结算入口。outcomeKey ∈ 'grand'|'basic'|'cold'
export function settlePromiseTier(state, promise, outcomeKey, addLog, spawnVagrantsFn) {
  // grand 算"成功"，扣资源；basic 也扣资源（已凑齐）；cold 不扣（没凑齐）
  if (outcomeKey !== 'cold') {
    for (const [key, need] of Object.entries(promise.resources)) {
      state.stats[key] = (state.stats[key] ?? 0) - need;
    }
  }
  const out = promise.outcomes && promise.outcomes[outcomeKey];
  applyOutcome(state, promise, out, addLog, spawnVagrantsFn);
  promise.resolved = true;
  promise.outcome = outcomeKey;
  markPromiseOutcome(state, promise, outcomeKey);
  // slice-3: 法会结算时记最后结算日（用于下一场冷却）
  if (promise.kind === 'temple-festival') {
    state.lastTempleFestivalSettleDay = state.day;
    if (outcomeKey === 'grand') {
      if (!state.mainGoal) state.mainGoal = {};
      state.mainGoal.templeFestivalGrand = true;
      if (state.chapterStage === 'festival') state.chapterStage = 'noble';
      rememberRelation(state, 'temple', '小法会圆满，慈灯寺愿替坊正说话。', 8);
    } else if (outcomeKey === 'basic') {
      rememberRelation(state, 'temple', '小法会平稳举行，但住持觉得筹备仍可更体面。', 3);
    } else if (outcomeKey === 'cold') {
      rememberRelation(state, 'temple', '小法会冷淡，寺方对坊务有些失望。', -5);
    }
  }
  // slice-6: 修复承诺 grand/basic → 受损 plot 回 built;cold 不修复
  if (promise.kind === 'repair-building' && promise.targetPlotId
      && (outcomeKey === 'grand' || outcomeKey === 'basic')) {
    const plot = state.plots.find(p => p.id === promise.targetPlotId);
    if (plot && plot.status === 'damaged') {
      plot.status = 'built';
      plot.damagedOnDay = null;
      // PR4: 火灾 onPlotDamaged 设了 workDisabled，修复后必须解除
      onPlotRepaired(plot);
    }
  }
  const ruleKey = STANCE_PROMISE_RULE[`${promise.kind}:${outcomeKey}`];
  if (ruleKey) addStance(state, ruleKey);
}

// 每日 tick：先扫描完成的承诺自动结算，再扫描过期的承诺判定失败/冷淡。
// hireFn / spawnVagrantsFn 由调用方（main.js）注入，避免循环依赖。
export function tickPromises(state, addLog, hireFn = null, spawnVagrantsFn = null) {
  for (const p of state.promises) {
    if (p.resolved) continue;
    const prog = checkPromiseProgress(state, p);
    if (prog.complete) {
      // 完整满足
      if (p.outcomes) {
        settlePromiseTier(state, p, 'grand', addLog, spawnVagrantsFn);
      } else {
        settlePromiseSuccess(state, p, addLog);
      }
      if (hireFn) hireFn(state);
      continue;
    }
    if (state.day >= p.deadline) {
      // 期满未完整满足
      if (p.outcomes) {
        // 三档：核心需求(无 resources 用 spatial)凑齐 → basic;否则 → cold
        const hasResources = Object.keys(p.resources || {}).length > 0;
        const coreOK = hasResources ? prog.resourcesOK : prog.spatialOK;
        const tier = coreOK ? 'basic' : 'cold';
        settlePromiseTier(state, p, tier, addLog, spawnVagrantsFn);
      } else {
        settlePromiseFailure(state, p, addLog, spawnVagrantsFn);
      }
    }
  }
  // 已 resolved 超 10 条裁剪
  const resolved = state.promises.filter(p => p.resolved);
  if (resolved.length > 10) {
    const keep = new Set(resolved.slice(-10));
    state.promises = state.promises.filter(p => !p.resolved || keep.has(p));
  }
}

// 暴露给 UI：取所有未结算的承诺
export function activePromises(state) {
  return state.promises.filter(p => !p.resolved);
}

// 暴露给 UI：地图高亮某承诺时所有可用空地（合并所有 spatial spec 的可建地块集）
export function plotsForPromiseHighlight(state, promise) {
  const out = new Set();
  for (const spec of promise.spatial) {
    for (const p of findMatchingPlots(state, spec, 'available')) out.add(p.id);
  }
  return out;
}
