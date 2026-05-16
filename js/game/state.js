// src/state.js
// 全局可变状态单例。所有模块共享同一对象引用。

import { applyDifficultyOnReset, normalizeDifficulty } from './difficulty.js';

export const state = {
  // 视口/绘制
  w: 0, h: 0, dpr: 1,
  tileW: 72, tileH: 36,
  originX: 0, originY: 0,

  // 时间/运行控制
  running: true,
  speed: 1,
  day: 1,
  minute: 5 * 60 + 30,
  lastPhase: 'Morning',
  gatePolicy: 'balanced',
  gateOpen: true,
  difficulty: 'standard',
  mainGoal: { templeFestivalGrand: false, nobleStewardHosted: false },
  chapterStage: 'opening', // opening → settlement → weaving → festival → noble → free
  chapterSoftMissed: false,
  groups: [],
  nextGroupId: 1,
  relations: null,
  localEffects: { byPlot: {}, warnings: [] },
  localEffectMemory: {},
  endgame: {
    status: 'playing',
    reason: null,
    endedOnDay: 0,
    title: '',
    text: '',
  },

  // 资源数值
  stats: {
    money: 120, labor: 6, wood: 12, cloth: 0, guards: 2,
    population: 8, morale: 55, order: 52, fame: 25, gov: 42,
    prosperity: 0, fireRisk: 0, congestion: 0,
  },

  // 坊丁分配
  guardAssignments: { patrol: 1 },

  // HUD 渐进解锁
  hudUnlocked: {
    money: true, labor: true, plots: true, morale: true, wood: true,
    cloth: false, guards: false,
    order: false, fame: false, gov: false,
    prosperity: false, fireRisk: false, congestion: false,
  },

  // 世界结构（启动时填入）
  grid: { w: 16, h: 16 },
  quadrants: null,    // 由 main.js 在启动时调用 loadQuadrants() 写入
  plots: [],          // 由 loadInitialPlots() 写入
  buildings: {},      // BUILDINGS_BY_ID 字典（由 loadInitialBuildings 写入）
  gates: null,        // 由 loadGates() 写入
  center: { x: 7, y: 7, w: 2, h: 2, type: 'well' },
  walkmap: null,      // 由 buildWalkmap() 写入

  // 旧字段（保留以兼容尚未改造的模块；后续 spec 会清理）
  visitorsToday: 0,
  agents: [],
  clickables: [],
  logs: [],
  scheduled: {},
  dailyIncomeTimer: 0,
  spawnTimer: 0,
  hoverPlotId: null,

  // 2026-04-26：人流密度配置。preset ∈ low/medium/high/stress。
  // 由 main.js 在 init 时填充默认；debug 面板可改。
  crowd: { preset: 'medium' },

  // 名士刷新状态：{ nextSpawnAt, recentIds }，由 ensureCelebState 懒初始化；
  // resetState 时置 null 强制下次重新建。
  celebrities: null,

  // Spec #2：在建项目相关
  focusPlotId: null,             // 台账点条目高亮的 plot
  focusPlotUntil: 0,             // 高亮过期时刻（performance.now()）
  buildingCounters: { house: 3, guardpos: 0, weaver: 0, incense: 0, inn: 0 },

  // Spec #3：人口链
  petitions: [],
  nextPetitionId: 1,
  lastNewcomerDay: 0,
  skilledResidents: 0,    // 织户人数（吃 giftWorkerOutputBonus）
  workersAssigned: 0,     // 当前在织棚的工人总数

  // slice-1：承诺机制
  promises: [],
  nextPromiseId: 1,
  highlightedPromiseId: null,  // UI：地图高亮某承诺时所有可用空地

  // slice-2：织棚承诺触发
  lastNewcomerSettleDay: 0,
  weaverRequestQueued: false,

  // slice-3：寺庙法会
  lastTempleFestivalSettleDay: 0,
  lanternProgress: 0,             // 大成功 +1，到阈值触发上元节（slice 后续）
  nobleStewardEligible: false,    // 法会大成功后解锁达官管事 spawn（slice-4 用）

  // slice-9：地块解锁
  totalUnlocked: 0,
  flags: {
    templeNegotiatedTier: 0,
    govPermittedTier: 0,
    templeNegotiateCooldown: [0, 0, 0, 0],
    govPermitCooldown: [0, 0, 0, 0],
  },

  // Spec #4：事件
  events: [],
  nextEventId: 1,
  lastFireDay: 0,
  lastStampedeDay: 0,
  lastInspectionDay: 0,

  // Spec #5：寺庙线
  templeRefurbished: false,
  lastPilgrimDay: 0,
  lastRitualDay: 0,
  lanternFestivalDone: false,
  lastLanternDay: 0,
  passiveMoneyBonus: 0,

  // Spec #6：达官线
  nobleAccepted: false,
  lastStewardDay: 0,
  mansionBuiltOnDay: 0,
  vendorRestrictionDone: false,
  scandalDone: false,
  scandalSealUntilDay: 0,        // slice-6: 丑闻封条持续到该日
  // slice-6: 上元节灯笼装饰持续到该日(由 lanternFestival host 成功设置)
  lanternDecorUntilDay: 0,
  // slice-7: 达官线多阶段。Spawned 标志一次性,保留以防 promise/petition trim 后误重发
  nobleAcceptedOnDay: 0,
  nobleMansionUrgentSpawned: false,
  // slice-8: 坊势成长(4 路线积分 0-100)
  stance: { civil: 0, faith: 0, trade: 0, power: 0 },
  // Spec #7：商贩线
  lastVendorStallDay: 0,
  blackMarketDone: false,
  caravanOrders: 0,
  // slice-12: 多线交叉事件
  lanternDonationDone: false,
  vendorNobleClashDone: false,
  vendorNobleClashOutcome: null,
  templeMediationDone: false,
};

export function resetState(options = {}) {
  state.running = true;
  state.speed = 1;
  state.day = 1;
  state.minute = 5 * 60 + 30;
  state.lastPhase = 'Morning';
  state.gatePolicy = 'balanced';
  state.gateOpen = true;
  state.difficulty = normalizeDifficulty(options.difficulty || state.difficulty);
  state.mainGoal = { templeFestivalGrand: false, nobleStewardHosted: false };
  state.chapterStage = 'opening';
  state.chapterSoftMissed = false;
  state.groups = [];
  state.nextGroupId = 1;
  state.relations = null;
  state.localEffects = { byPlot: {}, warnings: [] };
  state.localEffectMemory = {};
  state.endgame = {
    status: 'playing',
    reason: null,
    endedOnDay: 0,
    title: '',
    text: '',
  };
  state.stats = {
    money: 120, labor: 6, wood: 12, cloth: 0, guards: 2,
    population: 8, morale: 55, order: 52, fame: 25, gov: 42,
    prosperity: 0, fireRisk: 0, congestion: 0,
  };
  applyDifficultyOnReset(state);
  state.guardAssignments = { patrol: 1 };
  state.hudUnlocked = {
    money: true, labor: true, plots: true, morale: true, wood: true,
    cloth: false, guards: false,
    order: false, fame: false, gov: false,
    prosperity: false, fireRisk: false, congestion: false,
  };
  state.plots = [];
  state.buildings = {};
  state.gates = null;
  state.walkmap = null;
  state.visitorsToday = 0;
  state.agents = [];
  state.clickables = [];
  state.logs = [];
  state.scheduled = {};
  state.dailyIncomeTimer = 0;
  state.spawnTimer = 0;
  state.hoverPlotId = null;
  if (!state.crowd) state.crowd = { preset: 'medium' };
  state.celebrities = null;     // 名士刷新状态（cooldown + recent）—— 由 ensureCelebState 懒初始化
  state.focusPlotId = null;
  state.focusPlotUntil = 0;
  state.buildingCounters = { house: 3, guardpos: 0, weaver: 0, incense: 0, inn: 0 };
  state.petitions = [];
  state.nextPetitionId = 1;
  state.lastNewcomerDay = 0;
  state.skilledResidents = 0;
  state.workersAssigned = 0;
  state.promises = [];
  state.nextPromiseId = 1;
  state.highlightedPromiseId = null;
  state.lastNewcomerSettleDay = 0;
  state.weaverRequestQueued = false;
  state.lastTempleFestivalSettleDay = 0;
  state.lanternProgress = 0;
  state.nobleStewardEligible = false;
  state.totalUnlocked = 0;
  state.flags = {
    templeNegotiatedTier: 0,
    govPermittedTier: 0,
    templeNegotiateCooldown: [0, 0, 0, 0],
    govPermitCooldown: [0, 0, 0, 0],
  };
  state.events = [];
  state.nextEventId = 1;
  state.lastFireDay = 0;
  state.lastStampedeDay = 0;
  state.lastInspectionDay = 0;
  state.templeRefurbished = false;
  state.lastPilgrimDay = 0;
  state.lastRitualDay = 0;
  state.lanternFestivalDone = false;
  state.lastLanternDay = 0;
  state.passiveMoneyBonus = 0;
  state.nobleAccepted = false;
  state.lastStewardDay = 0;
  state.mansionBuiltOnDay = 0;
  state.vendorRestrictionDone = false;
  state.scandalDone = false;
  state.scandalSealUntilDay = 0;
  state.lanternDecorUntilDay = 0;
  state.nobleAcceptedOnDay = 0;
  state.nobleMansionUrgentSpawned = false;
  state.stance = { civil: 0, faith: 0, trade: 0, power: 0 };
  state.lastVendorStallDay = 0;
  state.blackMarketDone = false;
  state.caravanOrders = 0;
  state.lanternDonationDone = false;
  state.vendorNobleClashDone = false;
  state.vendorNobleClashOutcome = null;
  state.templeMediationDone = false;
}
