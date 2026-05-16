// src/world/balance-petitions.js
// 各 kind 请愿的过期/冷却天数 + 过期惩罚集中点。
// 与 PROMISE_BALANCE 平行:每个 kind 一个条目;调平衡时只改这里。

export const PETITION_BALANCE = {
  weaverRequest: {
    expireDays: 2,
    expire: { stat: 'morale', delta: -2, log: '织户等不到回音，自行散去，民心 -2。' },
  },
  templeFestivalRequest: {
    expireDays: 2,
    cooldownDays: 5,
    expire: { stat: 'fame', delta: -2, log: '寺住持空候多日，黯然回寺，声望 -2。' },
  },
  templePermit: {
    expireDays: 3,
    expire: { stat: 'fame', delta: -2, log: '寺住持空候多日，黯然回寺，声望 -2。' },
  },
  govPermit: {
    expireDays: 3,
    expire: { stat: 'gov', delta: -2, log: '官府使节怏怏离去，官府关系 -2。' },
  },
  fireDrillRequest: {
    expireDays: 2,
    expire: { stat: 'morale', delta: -1, log: '防御请愿无人理会，民心 -1。' },
  },
  nightPatrolRequest: {
    expireDays: 2,
    expire: { stat: 'morale', delta: -1, log: '防御请愿无人理会，民心 -1。' },
  },
  repairRequest: {
    expireDays: 3,
    expire: { stat: 'morale', delta: -2, log: '修复请愿无人理会，焦土留痕，民心 -2。' },
  },
  nobleMansionUrgent: {
    expireDays: 2,
    delayDays: 3,
  },
};
