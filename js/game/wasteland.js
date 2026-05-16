// src/world/wasteland.js
// slice-9 地块解锁：直接型成本/工期、批量解锁。
// 所有函数接 state 参数（不读 singleton），便于单测。

import { UNLOCK_BASE, unlockCostMultiplier, MAX_CONCURRENT_DIRECT, TYPE_LABEL } from './balance-wasteland.js';

const PERMISSION_FLAG_KEY = {
  templeDispute: 'templeNegotiatedTier',
  govSealed: 'govPermittedTier',
};

function ensurePermitFlags(state) {
  if (!state.flags || typeof state.flags !== 'object') state.flags = {};
  if (typeof state.flags.templeNegotiatedTier !== 'number') state.flags.templeNegotiatedTier = 0;
  if (typeof state.flags.govPermittedTier !== 'number') state.flags.govPermittedTier = 0;
  if (!Array.isArray(state.flags.templeNegotiateCooldown)) state.flags.templeNegotiateCooldown = [0, 0, 0, 0];
  if (!Array.isArray(state.flags.govPermitCooldown)) state.flags.govPermitCooldown = [0, 0, 0, 0];
}

// 计算当前一块直接型荒地的开垦成本
export function unlockCost(state, type) {
  const base = UNLOCK_BASE[type];
  if (!base) throw new Error(`[wasteland] 未知直接型 type ${type}`);
  const m = unlockCostMultiplier(state.totalUnlocked || 0);
  return {
    labor: Math.ceil(base.labor * m),
    wood: Math.ceil(base.wood * m),
    money: Math.ceil(base.money * m),
    workDays: Math.ceil(base.workDays * m),
  };
}

// 当前正在施工的直接型工程数（workDaysLeft > 0）
export function countActiveDirect(state) {
  return (state.plots || []).filter(p =>
    p.status === 'wasteland' &&
    p.wasteland &&
    p.wasteland.unlockMode === 'direct' &&
    p.wasteland.workDaysLeft != null &&
    p.wasteland.workDaysLeft > 0
  ).length;
}

function canStartDirectUnlockWithCost(state, plot, cost) {
  if (!plot || plot.status !== 'wasteland' || plot.wasteland?.unlockMode !== 'direct') {
    return { ok: false, reason: '此地块不可直接开垦' };
  }
  if (plot.wasteland.workDaysLeft != null) {
    return { ok: false, reason: '此地块已在施工', cost };
  }
  if (countActiveDirect(state) >= MAX_CONCURRENT_DIRECT) {
    return { ok: false, reason: `同时开工已达 ${MAX_CONCURRENT_DIRECT} 项上限`, cost };
  }
  if (state.stats.labor < cost.labor) return { ok: false, reason: `缺人力 ${cost.labor - state.stats.labor}`, cost };
  if (state.stats.wood < cost.wood) return { ok: false, reason: `缺木料 ${cost.wood - state.stats.wood}`, cost };
  if (state.stats.money < cost.money) return { ok: false, reason: `缺钱粮 ${cost.money - state.stats.money}`, cost };
  return { ok: true, cost };
}

// 是否可发起直接型开垦（资源够 + 并发未满）
// 返回 { ok, reason, cost }
export function canStartDirectUnlock(state, plot) {
  const cost = unlockCost(state, plot.wasteland.type);
  return canStartDirectUnlockWithCost(state, plot, cost);
}

// 发起开垦：扣资源 + 设 workDaysLeft
export function startDirectUnlock(state, plot, lockedCost = null) {
  const check = lockedCost
    ? canStartDirectUnlockWithCost(state, plot, lockedCost)
    : canStartDirectUnlock(state, plot);
  if (!check.ok) return false;
  state.stats.labor -= check.cost.labor;
  state.stats.wood -= check.cost.wood;
  state.stats.money -= check.cost.money;
  plot.wasteland.workDaysLeft = check.cost.workDays;
  return true;
}

// 每日 tick：所有施工中的 -1；归 0 转 empty 并 totalUnlocked +1
export function tickWastelandWork(state, addLog = null) {
  for (const p of state.plots || []) {
    if (p.status !== 'wasteland') continue;
    if (!p.wasteland || p.wasteland.workDaysLeft == null) continue;
    p.wasteland.workDaysLeft -= 1;
    if (p.wasteland.workDaysLeft <= 0) {
      const label = TYPE_LABEL[p.wasteland.type] || '荒地';
      p.status = 'empty';
      p.wasteland = null;
      state.totalUnlocked = (state.totalUnlocked || 0) + 1;
      if (addLog) addLog(`${p.id} ${label}清整完毕，可建造。`, true);
    }
  }
}

// 承诺型批量解锁：grand 全 tier；basic 半 tier（向上取整）。
// 只解锁 tier ≤ N 的同类型 wasteland 中尚未 empty 的部分。
// 推进 flag 的逻辑：grand 必推进；basic 只在恰好把 tier 内全开完时推进。
export function unlockTier(state, type, tier, mode, addLog = null) {
  ensurePermitFlags(state);
  const flagKey = PERMISSION_FLAG_KEY[type];
  if (!flagKey) {
    throw new Error(`[wasteland] 未知 permission type ${type}`);
  }
  if (mode !== 'full' && mode !== 'half') {
    throw new Error(`[wasteland] 未知 unlock mode ${mode}`);
  }
  const candidates = (state.plots || []).filter(p =>
    p.status === 'wasteland' &&
    p.wasteland?.type === type &&
    p.wasteland.tier <= tier
  );
  if (candidates.length === 0) {
    if (addLog) addLog(`${TYPE_LABEL[type]} tier ${tier} 已无地块可解。`);
    state.flags[flagKey] = Math.max(state.flags[flagKey] || 0, tier);
    return { count: 0, total: 0 };
  }
  const count = mode === 'full' ? candidates.length : Math.ceil(candidates.length / 2);
  const opened = candidates.slice(0, count);
  for (const p of opened) {
    p.status = 'empty';
    p.wasteland = null;
  }
  if (mode === 'full' || count >= candidates.length) {
    state.flags[flagKey] = Math.max(state.flags[flagKey] || 0, tier);
  }
  if (addLog) {
    addLog(`${TYPE_LABEL[type]} tier ${tier} 已解禁 ${count}/${candidates.length} 块。`, true);
  }
  return { count, total: candidates.length };
}
