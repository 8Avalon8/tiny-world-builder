// src/world/balance-risk.js
// slice-5 风险预警分层。把火险/拥堵从"瞬时弹事件"改为四层渐进:
//   warn  — 气氛标记 + 台账黄色提示
//   danger — 自动 spawn 防御承诺(消防演练/临时巡夜)请愿
//   burst — 仍未压低 → 触发原 fire/stampede 事件
// burst 阈值提升,在 warn..burst 之间留出 2-3 日的玩家干预窗口。

export const RISK_BALANCE = {
  fire: {
    warn: 30,         // 气氛 + 台账标记
    danger: 50,       // 自动派来"消防演练"请愿
    burst: 60,        // events.js fire 触发(原阈值 30,提升)
  },
  stampede: {
    warn: 20,
    danger: 30,
    burst: 40,        // events.js stampede 触发(原阈值 30,提升)
  },
};
