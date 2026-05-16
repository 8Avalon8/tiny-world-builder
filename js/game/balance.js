// src/world/balance.js
// Spec #3 全部可调数值。修改这里 = 修改全局平衡。
// 测试用例 import 同一份常量做断言（避免硬编码漂移）。

export const SPEC3_BALANCE = {
  newcomer: {
    intervalDays: 3,
    partySize: 3,
    expireDays: 3,
    expireMoraleDelta: -2,
    rejectMoraleDelta: -1,
    sourceGate: 'S',
  },
  accept: {
    moneyPerPerson: 5,
    clothPerPersonForGift: 1,
    giftMoraleBonus: 5,
    giftWorkerOutputBonus: 0.5,
  },
  house: {
    capacity: 4,
    overflowCrowdingDelta: 2,
    overflowMoraleDelta: -1,
    homelessCrowdingDelta: 5,
    homelessMoraleDelta: -2,
  },
  weaver: {
    maxWorkers: 2,
    clothPerWorkerPerDay: 1,
  },
  sideEffects: {
    crowdingThresholdForMoraleDecay: 50,
    crowdingDecayMoralePerDay: -1,
    fireRiskPerWorkshop: 3,
    fireRiskPatrolReduction: 10,
  },
};
