// src/world/events.js
// Spec #4：反应式事件（火灾/踩踏/巡查）spawn + 选择应用 + 过期。
// 与 petitions.js 平行：纯逻辑模块，所有函数接 state 参数（不读 singleton），
// 不 import UI/render；数值常量全部走 SPEC4_BALANCE。
//
// 注：spec 文档原写 stampede 仅在 Dusk 触发，但 summarizeDay 在子时换日时跑——
// 那时 phase 不是 Dusk。本实现把 phase 限制 drop 掉，改为「任何时间，每日子时
// 检查」，由 main 循环在 summarizeDay 调用。

import { SPEC4_BALANCE } from './balance-events.js';
import { SPEC5_BALANCE } from './balance-temple.js';
import { SPEC6_BALANCE } from './balance-noble.js';
import { SPEC7_BALANCE } from './balance-vendor.js';
import { addStance } from './balance-stance.js';
import { emitSignal } from './_agent-stubs.js';
import { onPlotDamaged } from './_agent-stubs.js';

function fireSignalFor(kind, plot, opts = {}) {
  if (!plot || !plot.doorCell) return;
  emitSignal({
    kind,
    cell: { x: plot.doorCell.x, y: plot.doorCell.y },
    radius: opts.radius || 5,
    durationSec: opts.durationSec || 6,
    attractRoles: opts.attractRoles || ['*'],
    resolveRoles: opts.resolveRoles || [],
  });
}

function newEventId(state) {
  return `evt-${String(state.nextEventId++).padStart(3, '0')}`;
}

function pickFirePlot(state) {
  const candidates = state.plots.filter(p => {
    if (p.status !== 'built') return false;
    const b = state.buildings[p.building];
    return b && (b.kind === 'weaver' || b.kind === 'incense');
  });
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function pickCrowdedPlot(state) {
  const houses = state.plots.filter(p => {
    if (p.status !== 'built') return false;
    const b = state.buildings[p.building];
    return b && b.kind === 'house';
  });
  if (!houses.length) return null;
  return houses[Math.floor(Math.random() * houses.length)];
}

export function maybeSpawnFireEvent(state) {
  if (state.day - (state.lastFireDay || 0) < SPEC4_BALANCE.fire.intervalDays) return null;
  if ((state.stats.fireRisk || 0) < SPEC4_BALANCE.fire.fireRiskThreshold) return null;
  const plot = pickFirePlot(state);
  if (!plot) return null;
  const evt = {
    id: newEventId(state),
    kind: 'fire',
    title: `${plot.id} 失火！`,
    text: `工坊冒烟，火势若不控制将烧毁地块。`,
    choices: [
      { id: 'fight', label: '调坊丁扑救', cost: { labor: 2 }, guardCost: 1, effects: { morale: 2 } },
      { id: 'buy',   label: '购置救火桶', cost: { money: 15 }, effects: { prosperity: -3 } },
      { id: 'wait',  label: '冒险等雨', effects: {}, gambleResolve: true },
    ],
    bornAtDay: state.day,
    expiresOnDay: state.day + SPEC4_BALANCE.fire.expireDays,
    resolved: false,
    outcome: null,
    plotId: plot.id,
  };
  state.events.push(evt);
  fireSignalFor('fire', plot, { radius: 5, durationSec: 6, attractRoles: ['*'], resolveRoles: ['Guard'] });
  state.lastFireDay = state.day;
  return evt;
}

export function maybeSpawnStampedeEvent(state) {
  if (state.day - (state.lastStampedeDay || 0) < SPEC4_BALANCE.stampede.intervalDays) return null;
  if ((state.stats.congestion || 0) < SPEC4_BALANCE.stampede.congestionThreshold) return null;
  const plot = pickCrowdedPlot(state);
  if (!plot) return null;
  const evt = {
    id: newEventId(state),
    kind: 'stampede',
    title: `${plot.id} 一带踩踏`,
    text: `黄昏人流拥挤，眼看要出事。`,
    choices: [
      { id: 'patrol', label: '调坊丁清街', cost: { labor: 2 }, guardCost: 1, effects: { morale: 1 } },
      { id: 'close',  label: '提前关闭部分坊门', effects: { gov: -3, morale: -1 } },
      { id: 'ignore', label: '放任不管', effects: { morale: -5, fame: -3 } },
    ],
    bornAtDay: state.day,
    expiresOnDay: state.day + SPEC4_BALANCE.stampede.expireDays,
    resolved: false,
    outcome: null,
    plotId: plot.id,
  };
  state.events.push(evt);
  fireSignalFor('spectacle', plot, { radius: 6, durationSec: 5, attractRoles: ['*'] });
  state.lastStampedeDay = state.day;
  return evt;
}

export function maybeSpawnInspectionEvent(state) {
  if (state.day - (state.lastInspectionDay || 0) < SPEC4_BALANCE.inspection.intervalDays) return null;
  const evt = {
    id: newEventId(state),
    kind: 'inspection',
    title: '官府巡查',
    text: '县衙差吏来坊查看治安与规制。',
    choices: [
      { id: 'feast',  label: '设宴款待',   cost: { money: 20, cloth: 3 }, effects: { gov: 10, fame: 3 } },
      { id: 'formal', label: '严正应对', effects: { gov: 3 } },
      { id: 'delay',  label: '故意拖延', effects: { gov: -5, morale: 2 } },
    ],
    bornAtDay: state.day,
    expiresOnDay: state.day + SPEC4_BALANCE.inspection.expireDays,
    resolved: false,
    outcome: null,
  };
  state.events.push(evt);
  state.lastInspectionDay = state.day;
  return evt;
}

// ---------- Spec #5：寺庙线 ritual / lantern-festival ----------

export function maybeSpawnRitualEvent(state) {
  if (!state.templeRefurbished) return null;
  const cfg = SPEC5_BALANCE.ritual;
  if ((state.stats.fame || 0) < cfg.fameThreshold) return null;
  if (state.day - (state.lastRitualDay || 0) < cfg.intervalDays) return null;
  if (state.lanternFestivalDone) return null;
  // 不与未结案的大法会共存
  if (state.events.some(e => e.kind === 'lantern-festival' && !e.resolved)) return null;
  const evt = {
    id: newEventId(state),
    kind: 'ritual',
    title: '慈灯寺法会',
    text: '寺中拟办法会，宜定规模。',
    choices: [
      {
        id: 'grand',
        label: '大办（10 布帛 + 20 钱粮）',
        cost: { cloth: cfg.grandClothCost, money: cfg.grandMoneyCost },
        effects: { fame: cfg.grandFameGain, prosperity: cfg.grandProsperityGain },
      },
      {
        id: 'normal',
        label: '常规（3 布帛 + 8 钱粮）',
        cost: { cloth: cfg.normalClothCost, money: cfg.normalMoneyCost },
        effects: { fame: cfg.normalFameGain, prosperity: cfg.normalProsperityGain },
      },
      {
        id: 'skip',
        label: '从简（声望 -2）',
        effects: { fame: cfg.skipFameDelta },
      },
    ],
    bornAtDay: state.day,
    expiresOnDay: state.day + cfg.expireDays,
    resolved: false,
    outcome: null,
  };
  state.events.push(evt);
  state.lastRitualDay = state.day;
  return evt;
}

export function maybeSpawnLanternFestivalEvent(state) {
  if (!state.templeRefurbished) return null;
  if (state.lanternFestivalDone) return null;
  const cfg = SPEC5_BALANCE.lanternFestival;
  if ((state.stats.fame || 0) < cfg.fameThreshold) return null;
  if (state.events.some(e => e.kind === 'lantern-festival' && !e.resolved)) return null;
  const evt = {
    id: newEventId(state),
    kind: 'lantern-festival',
    title: '上元大法会',
    text: '上元将至，慈灯寺欲承办大法会，万民瞩目。',
    choices: [
      {
        id: 'host',
        label: `承办（${cfg.clothCost} 布帛 + ${cfg.moneyCost} 钱粮 + ${cfg.guardCost} 坊丁）`,
        cost: { cloth: cfg.clothCost, money: cfg.moneyCost },
        guardCost: cfg.guardCost,
        effects: { fame: cfg.successFameGain },
      },
      {
        id: 'cancel',
        label: '婉拒（声望 -5）',
        effects: { fame: -5 },
      },
    ],
    bornAtDay: state.day,
    expiresOnDay: state.day + cfg.expireDays,
    resolved: false,
    outcome: null,
  };
  state.events.push(evt);
  state.lastLanternDay = state.day;
  return evt;
}

// ---------- Spec #6：达官线 vendor-restriction / scandal ----------

export function maybeSpawnVendorRestrictionEvent(state) {
  const cfg = SPEC6_BALANCE.vendorRestriction;
  if (!(state.mansionBuiltOnDay > 0)) return null;
  if (state.day - state.mansionBuiltOnDay < cfg.daysAfterMansion) return null;
  if (state.vendorRestrictionDone) return null;
  if (state.events.some(e => e.kind === 'vendor-restriction' && !e.resolved)) return null;
  const evt = {
    id: newEventId(state),
    kind: 'vendor-restriction',
    title: '达官府请清街',
    text: '府邸落成后管事来报，请坊正驱逐门前小贩，免扰贵人清静。',
    choices: [
      { id: 'accept', label: '允请清街', effects: { gov: 5, prosperity: -5, morale: -3 } },
      { id: 'reject', label: '婉拒所请', effects: { gov: -8, morale: 2 } },
    ],
    bornAtDay: state.day,
    expiresOnDay: state.day + cfg.expireDays,
    resolved: false,
    outcome: null,
  };
  state.events.push(evt);
  return evt;
}

export function maybeSpawnScandalEvent(state) {
  const cfg = SPEC6_BALANCE.scandal;
  if (!(state.mansionBuiltOnDay > 0)) return null;
  if (state.day - state.mansionBuiltOnDay < cfg.daysAfterMansion) return null;
  if (state.scandalDone) return null;
  if (state.events.some(e => e.kind === 'scandal' && !e.resolved)) return null;
  const evt = {
    id: newEventId(state),
    kind: 'scandal',
    title: '府中起风波',
    text: '达官府中爆出丑闻，京中言官多有议论，坊正何以自处？',
    choices: [
      { id: 'protect',   label: '力保达官（gov -15, fame +10）',   effects: { gov: -15, fame: 10 } },
      { id: 'surrender', label: '据实禀报（gov +10, fame -10）',   effects: { gov: 10, fame: -10 } },
      { id: 'sneak',     label: '私下放走（fame -5, morale +5）',  effects: { fame: -5, morale: 5 } },
      { id: 'sacrifice', label: '舍卒保帅（gov +20, morale -15）', effects: { gov: 20, morale: -15 } },
    ],
    bornAtDay: state.day,
    expiresOnDay: state.day + cfg.expireDays,
    resolved: false,
    outcome: null,
  };
  state.events.push(evt);
  return evt;
}

export function expireStaleEvents(state, addLog) {
  for (const evt of state.events) {
    if (evt.resolved) continue;
    if (state.day < evt.expiresOnDay) continue;
    evt.resolved = true;
    evt.outcome = 'expired';
    if (evt.kind === 'fire') {
      // slice-6: 受损不直接清空,改 status='damaged'。building 字段保留,
      // citizens.applyDailyTick 会跳过其产能。需要修复承诺才能恢复。
      if (SPEC4_BALANCE.fire.expireDestroyPlot && evt.plotId) {
        const plot = state.plots.find(p => p.id === evt.plotId);
        if (plot) {
          plot.status = 'damaged';
          plot.damagedOnDay = state.day;
          onPlotDamaged(plot);
          fireSignalFor('fire', plot, { radius: 5, durationSec: 8, attractRoles: ['*'], resolveRoles: ['Guard'] });
        }
      }
      state.stats.morale += SPEC4_BALANCE.fire.expireMoraleDelta;
      if (addLog) addLog(`${evt.plotId} 失火受损，待修复。民心 ${SPEC4_BALANCE.fire.expireMoraleDelta}。`, true);
    } else if (evt.kind === 'stampede') {
      state.stats.morale += SPEC4_BALANCE.stampede.expireMoraleDelta;
      state.stats.fame += SPEC4_BALANCE.stampede.expireFameDelta;
      if (addLog) addLog(`${evt.plotId} 踩踏伤人，民心 ${SPEC4_BALANCE.stampede.expireMoraleDelta}、声望 ${SPEC4_BALANCE.stampede.expireFameDelta}。`, true);
    } else if (evt.kind === 'inspection') {
      state.stats.gov += SPEC4_BALANCE.inspection.expireGovDelta;
      if (addLog) addLog(`官府差吏怠慢离去，官府关系 ${SPEC4_BALANCE.inspection.expireGovDelta}。`, true);
    } else if (evt.kind === 'ritual') {
      const delta = SPEC5_BALANCE.ritual.skipFameDelta;
      state.stats.fame += delta;
      if (addLog) addLog(`法会无人主持，声望 ${delta}。`, true);
    } else if (evt.kind === 'lantern-festival') {
      const delta = SPEC5_BALANCE.lanternFestival.expireFameDelta;
      state.stats.fame += delta;
      if (addLog) addLog(`上元大法会未承办，声望 ${delta}。`, true);
    } else if (evt.kind === 'vendor-restriction') {
      const delta = SPEC6_BALANCE.vendorRestriction.expireMoraleDelta;
      state.stats.morale += delta;
      state.stats.morale = Math.max(0, Math.min(100, state.stats.morale));
      state.vendorRestrictionDone = true;
      if (addLog) addLog(`达官清街之请无人理会，民心 ${delta}。`, true);
    } else if (evt.kind === 'scandal') {
      const govDelta = SPEC6_BALANCE.scandal.expireGovDelta;
      const fameDelta = SPEC6_BALANCE.scandal.expireFameDelta;
      state.stats.gov += govDelta;
      state.stats.fame += fameDelta;
      state.scandalDone = true;
      if (addLog) addLog(`府中风波拖延无果，官府关系 ${govDelta}、声望 ${fameDelta}。`, true);
    } else if (evt.kind === 'black-market') {
      const govDelta = SPEC7_BALANCE.blackMarket.expireGovDelta;
      const fameDelta = SPEC7_BALANCE.blackMarket.expireFameDelta;
      state.stats.gov += govDelta;
      state.stats.fame += fameDelta;
      state.blackMarketDone = true;
      if (addLog) addLog(`坊内私市无人过问，官府关系 ${govDelta}、声望 ${fameDelta}。`, true);
    } else if (evt.kind === 'lantern-donation') {
      state.stats.gov -= 3;
      state.lanternDonationDone = true;
      if (addLog) addLog('达官捐灯之议搁置，官府关系 -3。', true);
    } else if (evt.kind === 'vendor-noble-clash') {
      state.stats.morale -= 4;
      state.stats.prosperity = Math.max(0, (state.stats.prosperity || 0) - 5);
      state.vendorNobleClashDone = true;
      state.vendorNobleClashOutcome = 'expired';
      if (addLog) addLog('商贩与贵人冲突无人调停，民心 -4，繁荣 -5。', true);
    } else if (evt.kind === 'temple-mediation') {
      state.stats.fame -= 2;
      state.templeMediationDone = true;
      if (addLog) addLog('慈灯寺调停错过时机，声望 -2。', true);
    }
  }
  // 已 resolved 超 10 条裁剪
  const resolved = state.events.filter(e => e.resolved);
  if (resolved.length > 10) {
    const keep = new Set(resolved.slice(-10));
    state.events = state.events.filter(e => !e.resolved || keep.has(e));
  }
}

export function checkEventResources(state, choice) {
  const lacking = [];
  if (choice.cost) {
    for (const k of Object.keys(choice.cost)) {
      const have = state.stats[k] || 0;
      if (have < choice.cost[k]) lacking.push({ key: k, lack: choice.cost[k] - have });
    }
  }
  if (choice.guardCost) {
    const used = Object.values(state.guardAssignments || {}).reduce((a, b) => a + b, 0);
    const free = (state.stats.guards || 0) - used;
    if (free < choice.guardCost) lacking.push({ key: 'guards', lack: choice.guardCost - free });
  }
  return lacking;
}

export function resolveEventChoice(state, evt, choiceId, addLog) {
  if (evt.resolved) return false;
  const choice = evt.choices.find(c => c.id === choiceId);
  if (!choice) return false;
  if (checkEventResources(state, choice).length > 0) return false;
  // 扣 cost
  if (choice.cost) {
    for (const k of Object.keys(choice.cost)) {
      state.stats[k] = (state.stats[k] || 0) - choice.cost[k];
    }
  }
  // 应用 effects
  for (const k of Object.keys(choice.effects || {})) {
    state.stats[k] = (state.stats[k] || 0) + choice.effects[k];
  }
  state.stats.morale = Math.max(0, Math.min(100, state.stats.morale));
  // gambleResolve（火灾「等雨」）
  if (choice.gambleResolve) {
    const success = Math.random() < 0.5;
    if (!success) {
      if (evt.kind === 'fire' && evt.plotId) {
        const plot = state.plots.find(p => p.id === evt.plotId);
        if (plot) {
          plot.status = 'damaged';
          plot.damagedOnDay = state.day;
          onPlotDamaged(plot);
          fireSignalFor('fire', plot, { radius: 5, durationSec: 6, attractRoles: ['*'], resolveRoles: ['Guard'] });
        }
      }
      state.stats.morale += SPEC4_BALANCE.fire.expireMoraleDelta;
      state.stats.morale = Math.max(0, Math.min(100, state.stats.morale));
      evt.outcome = `${choiceId}-failed`;
      if (addLog) addLog(`${evt.plotId} 等雨失败，受损待修。`, true);
    } else {
      evt.outcome = `${choiceId}-success`;
      if (addLog) addLog(`${evt.plotId} 等雨成功，火自灭。`, true);
    }
  } else {
    evt.outcome = choiceId;
  }
  // fire 'fight'：玩家选救火 → 围观信号
  if (evt.kind === 'fire' && choiceId === 'fight') {
    const fp = state.plots.find(p => p.id === evt.plotId);
    if (fp) fireSignalFor('spectacle', fp, { radius: 4, durationSec: 4, attractRoles: ['*'] });
  }
  evt.resolved = true;
  // Spec #5：上元大法会成功 → 解锁永久 +5 钱粮/day
  if (evt.kind === 'lantern-festival' && choice.id === 'host' && !String(evt.outcome).endsWith('-failed')) {
    state.lanternFestivalDone = true;
    state.passiveMoneyBonus = (state.passiveMoneyBonus || 0) + SPEC5_BALANCE.lanternFestival.successPassiveMoneyBonus;
    // slice-6: 灯笼装饰留 7 日
    state.lanternDecorUntilDay = state.day + 7;
    addStance(state, 'lantern-host');  // slice-8
  }
  // Spec #6：达官线 done 标志位
  if (evt.kind === 'vendor-restriction') state.vendorRestrictionDone = true;
  if (evt.kind === 'scandal') {
    state.scandalDone = true;
    // slice-6: 丑闻 protect 或 sneak → 府邸贴封条 5 日
    if (choice.id === 'protect' || choice.id === 'sneak') {
      state.scandalSealUntilDay = state.day + 5;
    }
    // slice-8: 丑闻打分
    if (choice.id === 'protect') addStance(state, 'scandal-protect');
    else if (choice.id === 'sacrifice') addStance(state, 'scandal-sacrifice');
  }
  // slice-8: 黑市 permit → 商贸 + 权贵双向
  if (evt.kind === 'black-market' && choice.id === 'permit') {
    addStance(state, 'black-market-permit');
  }
  // Spec #7：私市 done 标志位
  if (evt.kind === 'black-market') state.blackMarketDone = true;
  // slice-12：多线交叉事件 done 标志位 + 坊势
  if (evt.kind === 'lantern-donation') {
    state.lanternDonationDone = true;
    if (choice.id === 'accept') addStance(state, 'lantern-donation-accept');
    if (choice.id === 'share') addStance(state, 'lantern-donation-share');
  }
  if (evt.kind === 'vendor-noble-clash') {
    state.vendorNobleClashDone = true;
    state.vendorNobleClashOutcome = choice.id;
    if (choice.id === 'mediate') addStance(state, 'vendor-clash-mediation');
    if (choice.id === 'side-noble') addStance(state, 'vendor-clash-noble');
    if (choice.id === 'side-vendor') addStance(state, 'vendor-clash-vendor');
  }
  if (evt.kind === 'temple-mediation') {
    state.templeMediationDone = true;
    if (choice.id === 'host') addStance(state, 'temple-mediation-grand');
  }
  return true;
}

// ---------- Spec #7：商贩线 black-market 终极 event ----------

export function maybeSpawnBlackMarketEvent(state) {
  const cfg = SPEC7_BALANCE.blackMarket;
  if (state.blackMarketDone) return null;
  if (state.events.some(e => e.kind === 'black-market' && !e.resolved)) return null;
  if ((state.stats.prosperity || 0) < cfg.prosperityThreshold) return null;
  if ((state.stats.fame || 0) < cfg.fameRequirement) return null;
  if (!state.lanternFestivalDone) return null;
  if (state.day - (state.lastLanternDay || 0) < cfg.daysAfterLantern) return null;
  const evt = {
    id: newEventId(state),
    kind: 'black-market',
    title: '坊内私市渐成',
    text: '夜禁后东街仍有摊贩交易。压制？打点？或顺势而为？',
    choices: [
      { id: 'suppress', label: '严令压制（gov +10, prosperity -15, fame -3）',
        effects: { gov: 10, prosperity: -15, fame: -3 } },
      { id: 'bribe',    label: '打点官府（钱粮 -30, gov +5, prosperity +5）',
        cost: { money: 30 }, effects: { gov: 5, prosperity: 5 } },
      { id: 'relocate', label: '迁至指定街段（congestion -5, gov +3）',
        effects: { congestion: -5, gov: 3 } },
      { id: 'permit',   label: '放任灰色夜市（gov -10, prosperity +10, money +20）',
        effects: { gov: -10, prosperity: 10, money: 20 } },
    ],
    bornAtDay: state.day,
    expiresOnDay: state.day + cfg.expireDays,
    resolved: false,
    outcome: null,
  };
  state.events.push(evt);
  return evt;
}

// ---------- slice-12：多线交叉事件 ----------

export function maybeSpawnLanternDonationEvent(state) {
  if (state.lanternDonationDone) return null;
  if (state.events.some(e => e.kind === 'lantern-donation' && !e.resolved)) return null;
  if (!state.nobleAccepted) return null;
  if (!state.lanternFestivalDone) return null;
  if ((state.stance?.faith || 0) < 50) return null;
  if ((state.stance?.power || 0) < 20) return null;
  const evt = {
    id: newEventId(state),
    kind: 'lantern-donation',
    title: '达官愿捐千灯',
    text: '达官闻慈灯寺上元盛会，愿以府中名义捐灯。寺方想扬名，坊民怕排场太过。',
    choices: [
      { id: 'accept', label: '以府名立灯', effects: { fame: 8, gov: 5, morale: -2 } },
      { id: 'share', label: '官民共署灯榜', effects: { fame: 5, morale: 4, gov: 2 } },
      { id: 'decline', label: '婉拒厚礼', effects: { gov: -5, morale: 2 } },
    ],
    bornAtDay: state.day,
    expiresOnDay: state.day + 3,
    resolved: false,
    outcome: null,
  };
  state.events.push(evt);
  return evt;
}

export function maybeSpawnVendorNobleClashEvent(state) {
  if (state.vendorNobleClashDone) return null;
  if (state.events.some(e => e.kind === 'vendor-noble-clash' && !e.resolved)) return null;
  if (!state.nobleAccepted) return null;
  if ((state.stance?.trade || 0) < 50) return null;
  if ((state.stance?.power || 0) < 40) return null;
  if ((state.stats.prosperity || 0) < 35) return null;
  const evt = {
    id: newEventId(state),
    kind: 'vendor-noble-clash',
    title: '商贩冲撞贵人车马',
    text: '东街生意正旺，摊贩占道，达官车马被堵在坊内。',
    choices: [
      { id: 'mediate', label: '坊正出面调解', cost: { money: 8 }, effects: { morale: 3, gov: 2 } },
      { id: 'side-noble', label: '偏护达官清街', effects: { gov: 8, prosperity: -10, morale: -4 } },
      { id: 'side-vendor', label: '护住商贩营生', effects: { prosperity: 8, gov: -8, morale: 2 } },
    ],
    bornAtDay: state.day,
    expiresOnDay: state.day + 2,
    resolved: false,
    outcome: null,
  };
  state.events.push(evt);
  return evt;
}

export function maybeSpawnTempleMediationEvent(state) {
  if (state.templeMediationDone) return null;
  if (state.events.some(e => e.kind === 'temple-mediation' && !e.resolved)) return null;
  if (!state.templeRefurbished) return null;
  if (!state.nobleAccepted) return null;
  if (state.vendorNobleClashOutcome !== 'mediate') return null;
  if ((state.stance?.faith || 0) < 30) return null;
  const evt = {
    id: newEventId(state),
    kind: 'temple-mediation',
    title: '慈灯寺设斋调停',
    text: '寺中住持愿设一席清斋，让达官、商贩与坊民同坐，把冲突化开。',
    choices: [
      { id: 'host', label: '设斋调停', cost: { money: 12, cloth: 2 }, effects: { fame: 6, morale: 5, gov: 2, prosperity: 3 } },
      { id: 'simple', label: '从简说和', effects: { fame: 2, morale: 2 } },
      { id: 'skip', label: '不再追办', effects: { morale: -2 } },
    ],
    bornAtDay: state.day,
    expiresOnDay: state.day + 3,
    resolved: false,
    outcome: null,
  };
  state.events.push(evt);
  return evt;
}
