// src/world/balance-vendor.js
// Spec #7 全部数值。

export const SPEC7_BALANCE = {
  caravan: {
    moneyPerWood: 5,
    minHostingBuildings: 1,
  },
  vendorStall: {
    intervalDays: 6,
    fameThreshold: 10,
    sourceGate: 'E',
    expireDays: 3,
    expireMoraleDelta: -1,
    fixedProsperityGain: 8,
    fixedCongestionDelta: 5,
    fixedFameGain: 2,
    taxMoneyGain: 15,
    taxProsperityGain: 3,
    taxMoraleDelta: -2,
    rejectGovDelta: 2,
  },
  blackMarket: {
    prosperityThreshold: 30,
    daysAfterLantern: 10,
    fameRequirement: 50,
    expireDays: 3,
    expireGovDelta: -8,
    expireFameDelta: -5,
  },
};
