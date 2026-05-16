// src/world/petitions.js
// 外部请求队列管理。Spec #3 仅 'newcomer' kind；后续 spec 扩 'noble-arrival' 等。
// 所有函数接 state 参数（不读 singleton），便于单测。

import { SPEC3_BALANCE } from './balance.js';
import { SPEC5_BALANCE } from './balance-temple.js';
import { SPEC6_BALANCE } from './balance-noble.js';
import { SPEC7_BALANCE } from './balance-vendor.js';
import { PROMISE_BALANCE } from './balance-promises.js';
import { TEMPLE_THRESHOLDS, GOV_THRESHOLDS, PERMIT_FAIL_COOLDOWN_DAYS } from './balance-wasteland.js';
import { RISK_BALANCE } from './balance-risk.js';
import { PETITION_BALANCE } from './balance-petitions.js';
import { countHostingBuildings } from './citizens.js';
import { createPromise } from './promises.js';
import { addStance } from './balance-stance.js';
import { clamp } from './utils.js';
import {
  attachGroupToPetition,
  attachGroupToPromise,
  markPetitionAccepted,
  markPetitionRejected,
  markPetitionExpired,
} from './groups.js';

function newPetitionId(state) {
  return `pet-${String(state.nextPetitionId++).padStart(3, '0')}`;
}

export function maybeSpawnNewcomerPetition(state) {
  // 垂直切片阶段：开局只放第一批「王氏织户」，避免官府/寺产/商贩过早抢戏。
  if (state.chapterStage && state.chapterStage !== 'opening') return null;
  if ((state.groups || []).some(g => g.kind === 'weaverFamily')) return null;
  if (state.day - (state.lastNewcomerDay || 0) < SPEC3_BALANCE.newcomer.intervalDays && (state.groups || []).length > 0) return null;
  const id = newPetitionId(state);
  const pet = {
    id,
    kind: 'newcomer',
    count: SPEC3_BALANCE.newcomer.partySize,
    sourceGate: SPEC3_BALANCE.newcomer.sourceGate,
    bornAtDay: state.day,
    expiresOnDay: state.day + SPEC3_BALANCE.newcomer.expireDays,
    resolved: false,
    outcome: null,
  };
  attachGroupToPetition(state, pet, {
    kind: 'weaverFamily',
    name: state.groups && state.groups.length === 0 ? '王氏织户' : undefined,
    needs: ['临井民宅'],
    memories: ['南门外求居，愿以织作换一处安身。'],
  });
  state.petitions.push(pet);
  state.lastNewcomerDay = state.day;
  return pet;
}

// kind → expire 副作用映射。balance 配置无法表达的(如 sourceGate 模板、需要联动其他
// state 字段)走 customExpire,其它统一查 PETITION_BALANCE.
const EXPIRE_HANDLERS = {
  'pilgrim': (state, pet, addLog) => {
    const delta = SPEC5_BALANCE.pilgrim.expireMoraleDelta;
    state.stats.morale = clamp(state.stats.morale + delta, 0, 100);
    if (addLog) addLog(`${pet.sourceGate}门外的香客散去，民心 ${delta}。`);
  },
  'noble-steward': (state, pet, addLog) => {
    const delta = SPEC6_BALANCE.steward.expireGovDelta;
    state.stats.gov += delta;
    state.nobleStewardEligible = false;  // slice-4: 过期 → 须再办法会
    if (addLog) addLog(`${pet.sourceGate}门外的达官管事愤然离去，官府关系 ${delta}。`);
  },
  'vendor-stall': (state, pet, addLog) => {
    const delta = SPEC7_BALANCE.vendorStall.expireMoraleDelta;
    state.stats.morale = clamp(state.stats.morale + delta, 0, 100);
    if (addLog) addLog(`${pet.sourceGate}门外的商贩散去，民心 ${delta}。`);
  },
  'temple-permit': (state, pet, addLog) => {
    applyExpireFromBalance(state, PETITION_BALANCE.templePermit.expire, addLog);
    state.flags.templeNegotiateCooldown[pet.tier] = state.day + PERMIT_FAIL_COOLDOWN_DAYS;
  },
  'gov-permit': (state, pet, addLog) => {
    applyExpireFromBalance(state, PETITION_BALANCE.govPermit.expire, addLog);
    state.flags.govPermitCooldown[pet.tier] = state.day + PERMIT_FAIL_COOLDOWN_DAYS;
  },
  'newcomer': (state, pet, addLog) => {
    state.stats.morale += SPEC3_BALANCE.newcomer.expireMoraleDelta;
    if (addLog) addLog(`${pet.sourceGate}门外的流民散去，民心 ${SPEC3_BALANCE.newcomer.expireMoraleDelta}。`);
  },
};

// kind → balance-petitions.js 的条目名称(用于直接走 balance.expire)
const KIND_TO_BALANCE_KEY = {
  'weaver-request': 'weaverRequest',
  'temple-festival-request': 'templeFestivalRequest',
  'fire-drill-request': 'fireDrillRequest',
  'night-patrol-request': 'nightPatrolRequest',
  'repair-request': 'repairRequest',
};

function applyExpireFromBalance(state, expire, addLog) {
  if (!expire) return;
  state.stats[expire.stat] = clamp((state.stats[expire.stat] || 0) + expire.delta, 0, 100);
  if (addLog && expire.log) addLog(expire.log);
}

export function expireStalePetitions(state, addLog) {
  for (const pet of state.petitions) {
    if (pet.resolved) continue;
    if (state.day < pet.expiresOnDay) continue;
    pet.resolved = true;
    pet.outcome = 'expired';
    markPetitionExpired(state, pet);
    const customHandler = EXPIRE_HANDLERS[pet.kind];
    if (customHandler) {
      customHandler(state, pet, addLog);
      continue;
    }
    const balanceKey = KIND_TO_BALANCE_KEY[pet.kind];
    if (balanceKey && PETITION_BALANCE[balanceKey]) {
      applyExpireFromBalance(state, PETITION_BALANCE[balanceKey].expire, addLog);
      continue;
    }
    // 兜底:用 newcomer 的过期惩罚(保留旧行为)
    EXPIRE_HANDLERS['newcomer'](state, pet, addLog);
  }
  // 已 resolved 超 10 条裁剪
  const resolved = state.petitions.filter(p => p.resolved);
  if (resolved.length > 10) {
    const keep = new Set(resolved.slice(-10));
    state.petitions = state.petitions.filter(p => !p.resolved || keep.has(p));
  }
}

// slice-1：接纳新民不再立即给奖励，而是创建一条「承诺」。
// 玩家须在 deadlineDays 内满足空间约束（SE 临井 + SE 任意各 1 座房）+ 资源（cloth 4），
// 满足后由 tickPromises 自动结算成功；否则期限到日结算失败（流民 + 民心扣 + 拥堵 +）。
// 接纳本身只扣一笔小额安置费 moneyOnAccept。
export function acceptNewcomerPetition(state, pet) {
  if (pet.resolved) return false;
  const cfg = PROMISE_BALANCE.newcomerSettle;
  if (state.stats.money < cfg.moneyOnAccept) return false;
  state.stats.money -= cfg.moneyOnAccept;
  pet.resolved = true;
  pet.outcome = 'accepted';
  markPetitionAccepted(state, pet);
  const prm = createPromise(state, {
    kind: 'newcomer-settle',
    sourceId: pet.id,
    sourceGate: pet.sourceGate,
    deadlineDays: cfg.deadlineDays,
    spatial: cfg.spatial,
    resources: cfg.resources,
    success: cfg.success,
    failure: cfg.failure,
  });
  if (pet.groupId) attachGroupToPromise(state, prm, pet.groupId);
  if (state.chapterStage === 'opening') state.chapterStage = 'settlement';
  addStance(state, 'newcomer-accept');
  return true;
}

// === slice-2：织棚承诺 petition ===
// 触发：newcomer-settle 承诺成功后 1-2 日内，且当下无活跃 weaver-request。
// 标记 state.weaverRequestQueued 在 promises.js 的 settlePromiseSuccess 里设。

export function maybeSpawnWeaverRequest(state) {
  if (state.chapterStage && !['weaving', 'settlement'].includes(state.chapterStage)) return null;
  if (!state.weaverRequestQueued) return null;
  const lastSettle = state.lastNewcomerSettleDay || 0;
  const daysSince = state.day - lastSettle;
  if (daysSince < 1) return null;            // 至少过一天再提
  if (daysSince > 2) {                        // 错过窗口：清掉队列
    state.weaverRequestQueued = false;
    return null;
  }
  if (hasOpenPetitionOrPromise(state, 'weaver-request')) return null;

  const id = newPetitionId(state);
  const pet = {
    id,
    kind: 'weaver-request',
    count: 1,
    sourceGate: 'S',                         // 名义来源（流民失败时落到 S 门外）
    bornAtDay: state.day,
    expiresOnDay: state.day + PETITION_BALANCE.weaverRequest.expireDays,
    resolved: false,
    outcome: null,
  };
  const group = (state.groups || []).find(g => g.kind === 'weaverFamily' && g.status === 'settled' && !g.workPlotId);
  if (group) {
    pet.groupId = group.id;
    group.petitionId = pet.id;
    group.needs = Array.from(new Set([...(group.needs || []), '织棚']));
  }
  state.petitions.push(pet);
  state.weaverRequestQueued = false;          // 一次性触发
  return pet;
}

export function acceptWeaverRequest(state, pet) {
  if (pet.resolved) return false;
  const cfg = PROMISE_BALANCE.weaverShop;
  if (state.stats.money < cfg.moneyOnAccept) return false;
  state.stats.money -= cfg.moneyOnAccept;
  pet.resolved = true;
  pet.outcome = 'accepted';
  markPetitionAccepted(state, pet);
  const prm = createPromise(state, {
    kind: 'weaver-shop',
    sourceId: pet.id,
    sourceGate: pet.sourceGate,
    deadlineDays: cfg.deadlineDays,
    spatial: cfg.spatial,
    resources: cfg.resources,
    success: cfg.success,
    failure: cfg.failure,
  });
  if (pet.groupId) attachGroupToPromise(state, prm, pet.groupId);
  if (state.chapterStage === 'settlement') state.chapterStage = 'weaving';
  return true;
}

// === slice-3：寺庙小法会筹备 petition ===
// 触发：寺庙修缮后 + 距离上次法会结算 ≥5 日 + 无活跃 temple-festival promise/petition。
// 由 main.js 每日 tick 调用 maybeSpawnTempleFestivalRequest。

export function maybeSpawnTempleFestivalRequest(state) {
  if (state.chapterStage) {
    if (!['festival', 'noble', 'free'].includes(state.chapterStage)) return null;
  } else if (!state.templeRefurbished) return null;
  // 冷却：上次结算后 5 日内不再发新场（首场 lastTempleFestivalSettleDay=0，跳过）
  if (state.lastTempleFestivalSettleDay > 0 &&
      state.day - state.lastTempleFestivalSettleDay < PETITION_BALANCE.templeFestivalRequest.cooldownDays) return null;
  if (hasOpenPetitionOrPromise(state, 'temple-festival-request', 'temple-festival')) return null;

  const id = newPetitionId(state);
  const pet = {
    id,
    kind: 'temple-festival-request',
    count: 1,
    sourceGate: 'W',                // 寺住持来自西门方向（NW 寺庙）
    bornAtDay: state.day,
    expiresOnDay: state.day + PETITION_BALANCE.templeFestivalRequest.expireDays,
    resolved: false,
    outcome: null,
  };
  state.petitions.push(pet);
  return pet;
}

export function acceptTempleFestivalRequest(state, pet) {
  if (pet.resolved) return false;
  const cfg = PROMISE_BALANCE.templeFestival;
  if (state.stats.money < cfg.moneyOnAccept) return false;
  state.stats.money -= cfg.moneyOnAccept;
  pet.resolved = true;
  pet.outcome = 'accepted';
  createPromise(state, {
    kind: 'temple-festival',
    sourceId: pet.id,
    sourceGate: pet.sourceGate,
    deadlineDays: cfg.deadlineDays,
    spatial: cfg.spatial,
    resources: cfg.resources,
    constraints: cfg.constraints,
    outcomes: cfg.outcomes,
  });
  return true;
}

// 拒绝：寺庙感到冷落 → 声望 -2
export function rejectTempleFestivalRequest(state, pet) {
  if (pet.resolved) return false;
  pet.resolved = true;
  pet.outcome = 'rejected';
  state.stats.fame = (state.stats.fame || 0) - 2;
  return true;
}

// 拒绝：扣民心 + 在 S 门外生成 1 个流民（与失败结算的 vagrantCount 一致，即时反馈）
export function rejectWeaverRequest(state, pet, spawnVagrantsFn = null) {
  if (pet.resolved) return false;
  const cfg = PROMISE_BALANCE.weaverShop.failure;
  pet.resolved = true;
  pet.outcome = 'rejected';
  markPetitionRejected(state, pet);
  state.stats.morale += cfg.morale;
  state.stats.morale = clamp(state.stats.morale, 0, 100);
  if (cfg.vagrantCount && spawnVagrantsFn) {
    spawnVagrantsFn(state, pet.sourceGate || 'S', cfg.vagrantCount);
  }
  return true;
}

export function rejectNewcomerPetition(state, pet) {
  if (pet.resolved) return false;
  pet.resolved = true;
  pet.outcome = 'rejected';
  markPetitionRejected(state, pet);
  state.stats.morale += SPEC3_BALANCE.newcomer.rejectMoraleDelta;
  state.stats.morale = clamp(state.stats.morale, 0, 100);
  addStance(state, 'newcomer-reject');
  return true;
}

// ---------- Spec #5：寺庙线 pilgrim petition ----------

export function maybeSpawnPilgrimPetition(state) {
  if (state.chapterStage && !['noble', 'free'].includes(state.chapterStage)) return null;
  if (!state.templeRefurbished) return null;
  const cfg = SPEC5_BALANCE.pilgrim;
  if (state.day - (state.lastPilgrimDay || 0) < cfg.intervalDays) return null;
  const id = newPetitionId(state);
  const pet = {
    id,
    kind: 'pilgrim',
    count: cfg.partySize,
    sourceGate: cfg.sourceGate,
    bornAtDay: state.day,
    expiresOnDay: state.day + cfg.expireDays,
    resolved: false,
    outcome: null,
  };
  state.petitions.push(pet);
  state.lastPilgrimDay = state.day;
  return pet;
}

export function acceptPilgrimPetition(state, pet, options = { warm: false }) {
  if (pet.resolved) return false;
  const cfg = SPEC5_BALANCE.pilgrim;
  if (options.warm && state.stats.cloth < cfg.warmClothCost) return false;
  // 检查住宿条件
  const houseCount = state.plots.filter(p => state.buildings[p.building]?.kind === 'house' && p.status === 'built').length;
  const hostCount = countHostingBuildings(state);
  if (houseCount < cfg.minHouses || hostCount < cfg.minHostingBuildings) return false;
  if (options.warm) state.stats.cloth -= cfg.warmClothCost;
  state.stats.money += options.warm ? cfg.warmMoneyGain : cfg.basicMoneyGain;
  state.stats.fame  += options.warm ? cfg.warmFameGain  : cfg.basicFameGain;
  pet.resolved = true;
  pet.outcome = options.warm ? 'accepted-warm' : 'accepted';
  addStance(state, options.warm ? 'pilgrim-warm' : 'pilgrim-basic');
  return true;
}

export function rejectPilgrimPetition(state, pet) {
  if (pet.resolved) return false;
  const cfg = SPEC5_BALANCE.pilgrim;
  pet.resolved = true;
  pet.outcome = 'rejected';
  state.stats.morale += cfg.rejectMoraleDelta;
  state.stats.morale = clamp(state.stats.morale, 0, 100);
  addStance(state, 'pilgrim-reject');
  return true;
}

// ---------- Spec #6 / slice-4：达官线 noble-steward petition ----------
// slice-4 改造：spawn 改用 nobleStewardEligible 闸口（由 templeFestival grand 设置）。
// accept 不再立即 nobleAccepted=true，而是创建 noble-steward-host 承诺。
// 失败/拒绝/过期 → 重置 nobleStewardEligible，必须再办一次法会 grand 才能再来。

export function maybeSpawnNobleStewardPetition(state) {
  if (state.chapterStage && state.chapterStage !== 'noble') return null;
  if (state.nobleAccepted) return null;
  if (!state.nobleStewardEligible) return null;
  if (hasOpenPetitionOrPromise(state, 'noble-steward', 'noble-steward-host')) return null;

  const cfg = SPEC6_BALANCE.steward;
  const id = newPetitionId(state);
  const pet = {
    id,
    kind: 'noble-steward',
    count: 1,
    sourceGate: cfg.sourceGate,
    bornAtDay: state.day,
    expiresOnDay: state.day + cfg.expireDays,
    resolved: false,
    outcome: null,
  };
  state.petitions.push(pet);
  state.lastStewardDay = state.day;
  return pet;
}

export function acceptNobleStewardPetition(state, pet) {
  if (pet.resolved) return false;
  const cfg = PROMISE_BALANCE.nobleSteward;
  if (state.stats.money < cfg.moneyOnAccept) return false;
  state.stats.money -= cfg.moneyOnAccept;
  pet.resolved = true;
  pet.outcome = 'accepted';
  createPromise(state, {
    kind: 'noble-steward-host',
    sourceId: pet.id,
    sourceGate: pet.sourceGate,
    deadlineDays: cfg.deadlineDays,
    spatial: cfg.spatial,
    resources: cfg.resources,
    constraints: cfg.constraints,
    outcomes: cfg.outcomes,
  });
  return true;
}

export function rejectNobleStewardPetition(state, pet) {
  if (pet.resolved) return false;
  const cfg = SPEC6_BALANCE.steward;
  pet.resolved = true;
  pet.outcome = 'rejected';
  state.stats.gov += cfg.rejectGovDelta;
  state.stats.fame += cfg.rejectFameDelta;
  state.nobleStewardEligible = false;  // slice-4: 拒绝 → 须再办法会
  addStance(state, 'noble-reject');
  return true;
}

// ---------- Spec #7：商贩线 vendor-stall petition ----------

export function maybeSpawnVendorStallPetition(state) {
  if (state.chapterStage && state.chapterStage !== 'free') return null;
  const cfg = SPEC7_BALANCE.vendorStall;
  if (state.day - (state.lastVendorStallDay || 0) < cfg.intervalDays) return null;
  if ((state.stats.fame || 0) < cfg.fameThreshold) return null;
  const id = newPetitionId(state);
  const pet = {
    id, kind: 'vendor-stall',
    count: 1,
    sourceGate: cfg.sourceGate,
    bornAtDay: state.day,
    expiresOnDay: state.day + cfg.expireDays,
    resolved: false, outcome: null,
  };
  state.petitions.push(pet);
  state.lastVendorStallDay = state.day;
  return pet;
}

export function acceptVendorStallFixed(state, pet) {
  if (pet.resolved) return false;
  const cfg = SPEC7_BALANCE.vendorStall;
  pet.resolved = true;
  pet.outcome = 'accepted-fixed';
  state.stats.prosperity = (state.stats.prosperity || 0) + cfg.fixedProsperityGain;
  state.stats.congestion = (state.stats.congestion || 0) + cfg.fixedCongestionDelta;
  state.stats.fame = (state.stats.fame || 0) + cfg.fixedFameGain;
  state.hudUnlocked.prosperity = true;
  addStance(state, 'vendor-stall-fixed');
  return true;
}

export function acceptVendorStallTax(state, pet) {
  if (pet.resolved) return false;
  const cfg = SPEC7_BALANCE.vendorStall;
  pet.resolved = true;
  pet.outcome = 'accepted-tax';
  state.stats.money += cfg.taxMoneyGain;
  state.stats.prosperity = (state.stats.prosperity || 0) + cfg.taxProsperityGain;
  state.stats.morale += cfg.taxMoraleDelta;
  state.stats.morale = clamp(state.stats.morale, 0, 100);
  state.hudUnlocked.prosperity = true;
  addStance(state, 'vendor-stall-tax');
  return true;
}

export function rejectVendorStallPetition(state, pet) {
  if (pet.resolved) return false;
  const cfg = SPEC7_BALANCE.vendorStall;
  pet.resolved = true;
  pet.outcome = 'rejected';
  state.stats.gov += cfg.rejectGovDelta;
  return true;
}

// ---------- slice-9：寺庙协商 / 官府批文 permit petitions ----------

function maybeSpawnPermitPetitionGeneric(state, opts) {
  if (state.promises.some(p => p.kind === opts.petitionKind && !p.resolved)) return null;
  if (state.petitions.some(p => p.kind === opts.petitionKind && !p.resolved)) return null;
  const tier = (state.flags[opts.flagKey] || 0) + 1;
  if (tier > 3) return null;
  if ((state.flags[opts.cooldownKey]?.[tier] || 0) > state.day) return null;
  if ((state.stats[opts.statKey] || 0) < opts.thresholds[tier]) return null;
  const pet = {
    id: newPetitionId(state),
    kind: opts.petitionKind,
    tier,
    count: 1,
    sourceGate: opts.sourceGate,
    bornAtDay: state.day,
    expiresOnDay: state.day + (opts.petitionKind === 'temple-permit' ? PETITION_BALANCE.templePermit.expireDays : PETITION_BALANCE.govPermit.expireDays),
    resolved: false,
    outcome: null,
  };
  state.petitions.push(pet);
  return pet;
}

export function maybeSpawnTemplePermitPetition(state) {
  if (state.chapterStage && state.chapterStage !== 'free') return null;
  return maybeSpawnPermitPetitionGeneric(state, {
    petitionKind: 'temple-permit',
    statKey: 'fame',
    thresholds: TEMPLE_THRESHOLDS,
    cooldownKey: 'templeNegotiateCooldown',
    flagKey: 'templeNegotiatedTier',
    sourceGate: 'W',
  });
}

export function maybeSpawnGovPermitPetition(state) {
  if (state.chapterStage && state.chapterStage !== 'free') return null;
  return maybeSpawnPermitPetitionGeneric(state, {
    petitionKind: 'gov-permit',
    statKey: 'gov',
    thresholds: GOV_THRESHOLDS,
    cooldownKey: 'govPermitCooldown',
    flagKey: 'govPermittedTier',
    sourceGate: 'N',
  });
}

function acceptPermitPetitionGeneric(state, pet, kindPrefix) {
  if (pet.resolved) return false;
  const expectedKind = kindPrefix === 'temple' ? 'temple-permit' : 'gov-permit';
  if (pet.kind !== expectedKind) return false;
  const cfgKey = kindPrefix === 'temple' ? `templePermitT${pet.tier}` : `govPermitT${pet.tier}`;
  const cfg = PROMISE_BALANCE[cfgKey];
  if (!cfg) return false;
  if (state.stats.money < cfg.moneyOnAccept) return false;
  state.stats.money -= cfg.moneyOnAccept;
  pet.resolved = true;
  pet.outcome = 'accepted';
  createPromise(state, {
    kind: pet.kind,
    sourceId: pet.id,
    sourceGate: pet.sourceGate,
    deadlineDays: cfg.deadlineDays,
    spatial: cfg.spatial,
    resources: cfg.resources,
    constraints: cfg.constraints,
    outcomes: cfg.outcomes,
  });
  return true;
}

export function acceptTemplePermitPetition(state, pet) {
  return acceptPermitPetitionGeneric(state, pet, 'temple');
}

export function acceptGovPermitPetition(state, pet) {
  return acceptPermitPetitionGeneric(state, pet, 'gov');
}

function rejectPermitPetitionGeneric(state, pet, opts) {
  if (pet.resolved) return false;
  if (pet.kind !== opts.petitionKind) return false;
  pet.resolved = true;
  pet.outcome = 'rejected';
  state.stats[opts.statKey] = (state.stats[opts.statKey] || 0) - 3;
  state.flags[opts.cooldownKey][pet.tier] = state.day + PERMIT_FAIL_COOLDOWN_DAYS;
  return true;
}

export function rejectTemplePermitPetition(state, pet) {
  return rejectPermitPetitionGeneric(state, pet, {
    petitionKind: 'temple-permit',
    statKey: 'fame',
    cooldownKey: 'templeNegotiateCooldown',
  });
}

export function rejectGovPermitPetition(state, pet) {
  return rejectPermitPetitionGeneric(state, pet, {
    petitionKind: 'gov-permit',
    statKey: 'gov',
    cooldownKey: 'govPermitCooldown',
  });
}

// ---------- slice-5: 防御承诺 petitions(消防演练 / 临时巡夜) ----------
// 触发：火险 ≥ danger 阈值 时自动 spawn 消防演练；拥堵同理 spawn 临时巡夜。
// 不重复：已有未结请愿 / 未结防御承诺则跳过。

// 当前是否已有同类未结请愿(以及可选的同类未结承诺)
function hasOpenPetitionOrPromise(state, petKind, promiseKind = null) {
  if (state.petitions.some(p => p.kind === petKind && !p.resolved)) return true;
  if (promiseKind && state.promises.some(p => p.kind === promiseKind && !p.resolved)) return true;
  return false;
}

export function maybeSpawnFireDrillRequest(state) {
  if (state.chapterStage && !['festival', 'noble', 'free'].includes(state.chapterStage)) return null;
  if ((state.stats.fireRisk || 0) < RISK_BALANCE.fire.danger) return null;
  if (hasOpenPetitionOrPromise(state, 'fire-drill-request', 'fire-drill')) return null;
  const id = newPetitionId(state);
  const pet = {
    id,
    kind: 'fire-drill-request',
    count: 1,
    sourceGate: 'S',
    bornAtDay: state.day,
    expiresOnDay: state.day + PETITION_BALANCE.fireDrillRequest.expireDays,
    resolved: false,
    outcome: null,
  };
  state.petitions.push(pet);
  return pet;
}

export function maybeSpawnNightPatrolRequest(state) {
  if (state.chapterStage && !['festival', 'noble', 'free'].includes(state.chapterStage)) return null;
  if ((state.stats.congestion || 0) < RISK_BALANCE.stampede.danger) return null;
  if (hasOpenPetitionOrPromise(state, 'night-patrol-request', 'night-patrol')) return null;
  const id = newPetitionId(state);
  const pet = {
    id,
    kind: 'night-patrol-request',
    count: 1,
    sourceGate: 'E',
    bornAtDay: state.day,
    expiresOnDay: state.day + PETITION_BALANCE.nightPatrolRequest.expireDays,
    resolved: false,
    outcome: null,
  };
  state.petitions.push(pet);
  return pet;
}

export function acceptFireDrillRequest(state, pet) {
  if (pet.resolved) return false;
  const cfg = PROMISE_BALANCE.fireDrill;
  pet.resolved = true;
  pet.outcome = 'accepted';
  createPromise(state, {
    kind: 'fire-drill',
    sourceId: pet.id,
    sourceGate: pet.sourceGate,
    deadlineDays: cfg.deadlineDays,
    spatial: cfg.spatial,
    resources: cfg.resources,
    constraints: cfg.constraints,
    outcomes: cfg.outcomes,
  });
  return true;
}

export function acceptNightPatrolRequest(state, pet) {
  if (pet.resolved) return false;
  const cfg = PROMISE_BALANCE.nightPatrol;
  pet.resolved = true;
  pet.outcome = 'accepted';
  createPromise(state, {
    kind: 'night-patrol',
    sourceId: pet.id,
    sourceGate: pet.sourceGate,
    deadlineDays: cfg.deadlineDays,
    spatial: cfg.spatial,
    resources: cfg.resources,
    constraints: cfg.constraints,
    outcomes: cfg.outcomes,
  });
  return true;
}

// 拒绝：玩家选择不接 → 仅小损民心,不再立即施压风险
export function rejectFireDrillRequest(state, pet) {
  if (pet.resolved) return false;
  pet.resolved = true;
  pet.outcome = 'rejected';
  state.stats.morale = clamp(state.stats.morale - 1, 0, 100);
  return true;
}

export function rejectNightPatrolRequest(state, pet) {
  if (pet.resolved) return false;
  pet.resolved = true;
  pet.outcome = 'rejected';
  state.stats.morale = clamp(state.stats.morale - 1, 0, 100);
  return true;
}

// ---------- slice-7: 达官线 stage-2 圈地催办 petition ----------
// nobleAccepted=true + mansion 还没建成 + 距 noble 接见 ≥ 3 日 + 无活跃 stage-2。
// 失败 → resetNobleAccepted = true(整线终止)。
export function maybeSpawnNobleMansionUrgent(state) {
  if (state.chapterStage && state.chapterStage !== 'free') return null;
  if (!state.nobleAccepted) return null;
  if (state.mansionBuiltOnDay > 0) return null;
  if (!state.nobleAcceptedOnDay) return null;
  if (state.day - state.nobleAcceptedOnDay < PETITION_BALANCE.nobleMansionUrgent.delayDays) return null;
  if (hasOpenPetitionOrPromise(state, 'noble-mansion-urgent-request', 'noble-mansion-urgent')) return null;
  if (state.nobleMansionUrgentSpawned) return null;

  const id = newPetitionId(state);
  const pet = {
    id,
    kind: 'noble-mansion-urgent-request',
    count: 1,
    sourceGate: 'N',
    bornAtDay: state.day,
    expiresOnDay: state.day + PETITION_BALANCE.nobleMansionUrgent.expireDays,
    resolved: false,
    outcome: null,
  };
  state.petitions.push(pet);
  state.nobleMansionUrgentSpawned = true;
  return pet;
}

export function acceptNobleMansionUrgent(state, pet) {
  if (pet.resolved) return false;
  const cfg = PROMISE_BALANCE.nobleMansionUrgent;
  pet.resolved = true;
  pet.outcome = 'accepted';
  createPromise(state, {
    kind: 'noble-mansion-urgent',
    sourceId: pet.id,
    sourceGate: pet.sourceGate,
    deadlineDays: cfg.deadlineDays,
    spatial: cfg.spatial,
    resources: cfg.resources,
    constraints: cfg.constraints,
    outcomes: cfg.outcomes,
  });
  return true;
}

export function rejectNobleMansionUrgent(state, pet) {
  if (pet.resolved) return false;
  pet.resolved = true;
  pet.outcome = 'rejected';
  state.nobleAccepted = false;
  state.nobleStewardEligible = false;
  state.stats.fame = Math.max(0, (state.stats.fame || 0) - 8);
  state.stats.gov  = (state.stats.gov || 0) - 5;
  return true;
}

// ---------- slice-6: 受损建筑修复 petition ----------
// 场上存在 damaged plot 且无对应未结修复请愿/承诺时自动 spawn。
// 一条修复请愿绑定一个 plotId,接纳立约,期限内备齐木料+钱粮 → status 回 built。

export function maybeSpawnRepairRequest(state) {
  if (state.chapterStage && state.chapterStage === 'opening') return null;
  const damaged = state.plots.filter(p => p.status === 'damaged');
  if (damaged.length === 0) return null;
  const target = damaged.find(p => {
    const hasPet = state.petitions.some(pt =>
      pt.kind === 'repair-request' && !pt.resolved && pt.targetPlotId === p.id);
    const hasPromise = state.promises.some(pr =>
      pr.kind === 'repair-building' && !pr.resolved && pr.targetPlotId === p.id);
    return !hasPet && !hasPromise;
  });
  if (!target) return null;
  const id = newPetitionId(state);
  const pet = {
    id,
    kind: 'repair-request',
    count: 1,
    sourceGate: 'S',
    targetPlotId: target.id,
    bornAtDay: state.day,
    expiresOnDay: state.day + PETITION_BALANCE.repairRequest.expireDays,
    resolved: false,
    outcome: null,
  };
  state.petitions.push(pet);
  return pet;
}

export function acceptRepairRequest(state, pet) {
  if (pet.resolved) return false;
  const cfg = PROMISE_BALANCE.repairBuilding;
  pet.resolved = true;
  pet.outcome = 'accepted';
  const promise = createPromise(state, {
    kind: 'repair-building',
    sourceId: pet.id,
    sourceGate: pet.sourceGate,
    deadlineDays: cfg.deadlineDays,
    spatial: cfg.spatial,
    resources: cfg.resources,
    constraints: cfg.constraints,
    outcomes: cfg.outcomes,
  });
  promise.targetPlotId = pet.targetPlotId;
  return true;
}

export function rejectRepairRequest(state, pet) {
  if (pet.resolved) return false;
  pet.resolved = true;
  pet.outcome = 'rejected';
  state.stats.morale = clamp(state.stats.morale - 2, 0, 100);
  return true;
}

// ---------- 每日 spawn 注册表 ----------
// day.js 按 phase 顺序调用各组 spawner。新增请愿类型只需把 spawn 函数加到对应 phase 的数组里。
// phase 顺序与 summarizeDay 流程对齐:
//   preTick      - 在 tickPromises/expireStalePetitions 之前(让本日新民先入队)
//   preEvents    - 在 fire/stampede/inspection 之前(让玩家有机会预防)
//   postEvents   - 在 expireStaleEvents 之后(等仪式/事件落幕再 spawn)
//   postFestival - 在 ritual/lantern festival 之后(达官管事链)
//   postScandal  - 在 vendor restriction/scandal 之后(达官 stage-2 + 商贩)
export const PETITION_SPAWNERS = {
  preTick: [maybeSpawnNewcomerPetition],
  preEvents: [
    maybeSpawnWeaverRequest,
    maybeSpawnTempleFestivalRequest,
    maybeSpawnTemplePermitPetition,
    maybeSpawnGovPermitPetition,
    maybeSpawnFireDrillRequest,
    maybeSpawnNightPatrolRequest,
    maybeSpawnRepairRequest,
  ],
  postEvents: [maybeSpawnPilgrimPetition],
  postFestival: [maybeSpawnNobleStewardPetition],
  postScandal: [maybeSpawnNobleMansionUrgent, maybeSpawnVendorStallPetition],
};

export function runPetitionSpawners(state, phase) {
  const list = PETITION_SPAWNERS[phase];
  if (!list) return;
  for (const fn of list) fn(state);
}

// ---------- Spec #7：商队订木（即时按钮，非 petition） ----------

export function tryCaravanWoodOrder(state) {
  const cfg = SPEC7_BALANCE.caravan;
  if (state.stats.money < cfg.moneyPerWood) return false;
  if (countHostingBuildings(state) < cfg.minHostingBuildings) return false;
  state.stats.money -= cfg.moneyPerWood;
  state.stats.wood += 1;
  state.caravanOrders = (state.caravanOrders || 0) + 1;
  addStance(state, 'caravan-order');
  return true;
}
