// src/world/balance-noble.js
// Spec #6：达官线全部可调数值。修改这里 = 修改本剧情线平衡。
// 测试用例 import 同一份常量做断言（避免硬编码漂移）。

export const SPEC6_BALANCE = {
  steward: {
    intervalDays: 10,
    fameThreshold: 20,
    sourceGate: 'N',
    expireDays: 4,
    rejectGovDelta: -10,
    rejectFameDelta: -3,
    expireGovDelta: -3,
  },
  mansion: {
    cost: { labor: 8, money: 50, wood: 20, cloth: 5 },
    buildHours: 16,
    fameGain: 20,
    govGain: 15,
    moraleDelta: -8,
  },
  vendorRestriction: {
    daysAfterMansion: 5,
    expireDays: 2,
    expireMoraleDelta: -2,
  },
  scandal: {
    daysAfterMansion: 15,
    expireDays: 3,
    expireGovDelta: -10,
    expireFameDelta: -5,
  },
};
