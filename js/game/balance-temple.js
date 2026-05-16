// src/world/balance-temple.js
// Spec #5：寺庙线全部可调数值。修改这里 = 修改本剧情线平衡。
// 测试用例 import 同一份常量做断言（避免硬编码漂移）。

export const SPEC5_BALANCE = {
  refurbish: {
    moneyCost: 30,
    woodCost: 10,
    fameGain: 10,
  },
  pilgrim: {
    intervalDays: 4,
    partySize: 3,
    expireDays: 3,
    sourceGate: 'W',
    minHouses: 1,
    minHostingBuildings: 1,  // 客舍 OR 香铺 至少 1 个
    basicMoneyGain: 5,
    basicFameGain: 3,
    warmClothCost: 2,
    warmMoneyGain: 10,
    warmFameGain: 6,
    rejectMoraleDelta: -1,
    expireMoraleDelta: -1,
  },
  ritual: {
    intervalDays: 7,
    fameThreshold: 30,
    expireDays: 2,
    grandClothCost: 10,
    grandMoneyCost: 20,
    grandFameGain: 15,
    grandProsperityGain: 5,
    normalClothCost: 3,
    normalMoneyCost: 8,
    normalFameGain: 6,
    normalProsperityGain: 2,
    skipFameDelta: -2,
  },
  lanternFestival: {
    fameThreshold: 60,
    cooldownDays: 30,
    expireDays: 3,
    clothCost: 30,
    moneyCost: 50,
    guardCost: 1,
    successFameGain: 30,
    successPassiveMoneyBonus: 5,  // 永久日产 +5 钱粮
    expireFameDelta: -15,
  },
};
