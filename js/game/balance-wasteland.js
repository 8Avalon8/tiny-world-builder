// src/world/balance-wasteland.js
// slice-9 地块解锁的可调数值。

// 直接型解锁基础成本（multiplier=1 时）
export const UNLOCK_BASE = {
  oldRuin: { labor: 4, wood: 6, money: 0, workDays: 5 },
  lowland: { labor: 5, wood: 0, money: 12, workDays: 6 },
};

// 全坊累计跳档：n 是 state.totalUnlocked
export function unlockCostMultiplier(n) {
  if (n < 3) return 1.0;
  if (n < 7) return 1.5;
  return 2.5;
}

// 同时进行的直接型工程上限
export const MAX_CONCURRENT_DIRECT = 2;

// 承诺型阈值（fame / gov）
export const TEMPLE_THRESHOLDS = [null, 30, 50, 70];  // index 1/2/3
export const GOV_THRESHOLDS    = [null, 30, 50, 70];

// 失败 cooldown 天数
export const PERMIT_FAIL_COOLDOWN_DAYS = 30;

// 类型显示名
export const TYPE_LABEL = {
  oldRuin: '旧宅废墟',
  lowland: '低洼地',
  templeDispute: '寺产争议地',
  govSealed: '官府封存地',
};

// 直接型解锁项目名
export const DIRECT_PROJECT_LABEL = {
  oldRuin: '清理废宅',
  lowland: '修沟排水',
};
