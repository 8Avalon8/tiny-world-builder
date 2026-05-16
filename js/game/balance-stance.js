// src/world/balance-stance.js
// slice-8 坊势成长。4 条隐性路线积分(0-100),累计玩家选择。
// 阈值 50 解锁路线被动 buff;阈值 80 在后续 slice 触发"成势"事件。
import { clamp } from './utils.js';

export const STANCE_BALANCE = {
  thresholds: { unlockBuff: 50, peak: 80 },
  // 单次行为打分映射。同一行为可能加多条线。
  rules: {
    // 接 / 安置 → 安民
    'newcomer-accept':       { civil: 2 },
    'newcomer-grand':        { civil: 5 },
    'weaver-grand':          { civil: 3, trade: 2 },
    'repair-grand':          { civil: 3 },
    // 寺庙 / 法会 / 香客 → 香火
    'temple-refurbish':      { faith: 8 },
    'pilgrim-warm':          { faith: 4 },
    'pilgrim-basic':         { faith: 2 },
    'temple-festival-grand': { faith: 8, civil: 2 },
    'temple-festival-basic': { faith: 3 },
    'lantern-host':          { faith: 12 },
    // 商贩 / 商队 / 黑市 → 商贸
    'vendor-stall-fixed':    { trade: 4 },
    'vendor-stall-tax':      { trade: 5 },
    'caravan-order':         { trade: 1 },
    'black-market-permit':   { trade: 8, power: -3 },
    'lantern-donation-accept': { faith: 6, power: 4 },
    'lantern-donation-share':  { faith: 4, civil: 3 },
    'vendor-clash-mediation':  { trade: 2, power: 2, civil: 2 },
    'vendor-clash-noble':      { power: 5, trade: -4 },
    'vendor-clash-vendor':     { trade: 5, power: -4 },
    'temple-mediation-grand':  { faith: 5, civil: 3 },
    // 达官 / 府邸 / 风波 → 权贵
    'noble-grand':           { power: 6 },
    'noble-basic':           { power: 3 },
    'mansion-built':         { power: 8 },
    'noble-stage2-grand':    { power: 5 },
    'scandal-protect':       { power: 8, civil: -3 },
    'scandal-sacrifice':     { power: 10, civil: -5 },
    // 拒绝类(轻扣对应路线)
    'noble-reject':          { power: -5 },
    'pilgrim-reject':        { faith: -3 },
    'newcomer-reject':       { civil: -2 },
  },
};

// slice-8: 每条 stance ≥ unlockBuff 阈值时,每日给被动 buff。
// civil → morale +1, faith → fame +1, trade → money +3, power → gov +1。
// 注意:morale 是 0-100,加多了会顶顶不会过载;fame/gov 同理由 events 路径夹紧。
const STANCE_DAILY_BUFF = {
  civil: { stat: 'morale', delta: 1, max: 100 },
  faith: { stat: 'fame',   delta: 1, max: 100 },
  trade: { stat: 'money',  delta: 3, max: 9999 },
  power: { stat: 'gov',    delta: 1, max: 100 },
};

export function applyStanceDailyBuffs(state) {
  if (!state.stance) return [];
  const applied = [];
  const threshold = STANCE_BALANCE.thresholds.unlockBuff;
  for (const [key, buff] of Object.entries(STANCE_DAILY_BUFF)) {
    if ((state.stance[key] || 0) >= threshold) {
      const cur = state.stats[buff.stat] || 0;
      state.stats[buff.stat] = Math.min(buff.max, cur + buff.delta);
      applied.push({ key, stat: buff.stat, delta: buff.delta });
    }
  }
  return applied;
}

// 承诺结算时按 kind + tier 查表打分。新增承诺 kind 时只动这里。
export const STANCE_PROMISE_RULE = {
  'newcomer-settle:success':     'newcomer-grand',
  'weaver-shop:success':         'weaver-grand',
  'temple-festival:grand':       'temple-festival-grand',
  'temple-festival:basic':       'temple-festival-basic',
  'noble-steward-host:grand':    'noble-grand',
  'noble-steward-host:basic':    'noble-basic',
  'noble-mansion-urgent:grand':  'noble-stage2-grand',
  'repair-building:grand':       'repair-grand',
};

// 累计;clamp 到 [0, 100]。负值 rule 会扣分。
export function addStance(state, ruleKey) {
  const delta = STANCE_BALANCE.rules[ruleKey];
  if (!delta) return;
  if (!state.stance) state.stance = { civil: 0, faith: 0, trade: 0, power: 0 };
  for (const k of ['civil', 'faith', 'trade', 'power']) {
    if (typeof delta[k] === 'number') {
      state.stance[k] = clamp(state.stance[k] + delta[k], 0, 100);
    }
  }
}
