// src/world/balance-events.js
// Spec #4 数值常量集中。所有事件相关阈值、间隔、过期效果都在这里。
// events.js 不得硬编码任何数字；UI/render 也走这个模块。

// slice-5: fireRiskThreshold / congestionThreshold 不再是"爆发"阈值,而是
// "burst" 阈值——已上提。warn / danger 见 balance-risk.js。
export const SPEC4_BALANCE = {
  fire: {
    fireRiskThreshold: 60,
    intervalDays: 4,
    expireDays: 1,
    expireMoraleDelta: -10,
    expireDestroyPlot: true,
  },
  stampede: {
    congestionThreshold: 40,
    intervalDays: 5,
    expireDays: 1,
    expireMoraleDelta: -8,
    expireFameDelta: -3,
  },
  inspection: {
    intervalDays: 7,
    expireDays: 2,
    expireGovDelta: -5,
  },
};
