// src/world/citizens.js
// 自动雇工 + 每日产出 + 副作用计算。所有函数接 state 参数。

import { SPEC3_BALANCE } from './balance.js';

export function isKind(state, plot, kind) {
  if (plot.status !== 'built') return false;
  const b = state.buildings[plot.building];
  return b && b.kind === kind;
}

// 「住宿/接待」类建筑：客舍 + 香铺。pilgrim 接纳 / 商队订木 / 香客面板都需要这个判定。
export function countHostingBuildings(state) {
  return state.plots.filter(p => isKind(state, p, 'inn') || isKind(state, p, 'incense')).length;
}

export function getHousingCapacity(state) {
  const houseCount = state.plots.filter(p => isKind(state, p, 'house')).length;
  return houseCount * SPEC3_BALANCE.house.capacity;
}

// 有屋可居的人口：超容部分算流民，不计入劳力来源。
export function getHousedPopulation(state) {
  return Math.min(state.stats.population, getHousingCapacity(state));
}

// 每日人力上限：基础 6，超过基础则按 housedPop / 2 折算，封顶 12。
export function dailyLaborCap(state) {
  return Math.min(12, Math.max(6, Math.floor(getHousedPopulation(state) / 2)));
}

export function tryAutoHire(state) {
  const weavers = state.plots.filter(p => isKind(state, p, 'weaver'));
  const totalSlots = weavers.length * SPEC3_BALANCE.weaver.maxWorkers;
  const before = state.workersAssigned;
  state.workersAssigned = Math.min(totalSlots, state.stats.population);
  return state.workersAssigned - before;
}

export function applyDailyTick(state, addLog) {
  // 1. 织棚产出（skilled 优先消化 workersAssigned 名额）
  const skilled = Math.min(state.skilledResidents, state.workersAssigned);
  const unskilled = state.workersAssigned - skilled;
  const dailyCloth =
    skilled * SPEC3_BALANCE.weaver.clothPerWorkerPerDay * (1 + SPEC3_BALANCE.accept.giftWorkerOutputBonus) +
    unskilled * SPEC3_BALANCE.weaver.clothPerWorkerPerDay;
  if (dailyCloth > 0) {
    state.stats.cloth += dailyCloth;
    if (addLog) addLog(`织棚日产 ${dailyCloth.toFixed(1)} 布帛。`);
  }

  // 2. 拥挤计算（每日重算）
  const houseCount = state.plots.filter(p => isKind(state, p, 'house')).length;
  const housingCapacity = houseCount * SPEC3_BALANCE.house.capacity;
  const overflow = Math.max(0, state.stats.population - housingCapacity);
  state.stats.congestion = overflow * SPEC3_BALANCE.house.overflowCrowdingDelta;
  if (overflow > 0) {
    state.stats.morale += overflow * SPEC3_BALANCE.house.overflowMoraleDelta;
    if (addLog) addLog(`坊内超员 ${overflow} 人，民心受损。`);
  }

  // 3. 火险（每日重算，不累积）
  const workshops = state.plots.filter(p => isKind(state, p, 'weaver') || isKind(state, p, 'incense')).length;
  state.stats.fireRisk = Math.max(0,
    workshops * SPEC3_BALANCE.sideEffects.fireRiskPerWorkshop -
    SPEC3_BALANCE.sideEffects.fireRiskPatrolReduction
  );

  // 4. 拥挤民心衰减
  if (state.stats.congestion >= SPEC3_BALANCE.sideEffects.crowdingThresholdForMoraleDecay) {
    state.stats.morale += SPEC3_BALANCE.sideEffects.crowdingDecayMoralePerDay;
  }

  // 5. 民心夹紧
  state.stats.morale = Math.max(0, Math.min(100, state.stats.morale));

  // 6. HUD 解锁联动
  if (state.stats.fireRisk > 0) state.hudUnlocked.fireRisk = true;
  if (state.stats.congestion > 0) state.hudUnlocked.congestion = true;
}
