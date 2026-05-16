// src/world/balance-promises.js
// 「承诺」机制的可调数值。所有 slice 添加的承诺模板都汇总在这里。
// 命名约定：每个 key 是一类承诺的 kind 配置；slice 注释标明引入时间。

import { PERMIT_FAIL_COOLDOWN_DAYS } from './balance-wasteland.js';
import { unlockTier } from './wasteland.js';

function __unlockTier(state, type, tier, mode, addLog) {
  return unlockTier(state, type, tier, mode, addLog);
}

function __setCooldown(state, key, tier) {
  if (!state.flags || typeof state.flags !== 'object') state.flags = {};
  if (!Array.isArray(state.flags[key])) state.flags[key] = [0, 0, 0, 0];
  state.flags[key][tier] = state.day + PERMIT_FAIL_COOLDOWN_DAYS;
}

export const PROMISE_BALANCE = {
  // === slice-1 ===
  newcomerSettle: {
    deadlineDays: 3,
    moneyOnAccept: 6,  // 接纳即付安置费，不可退；让玩家在「接纳」按钮上有一次小考量
    spatial: [
      // 第一座必须临井（曼哈顿 ≤2，开局只有 SE-04 满足）
      { build: 'house', count: 1, in: 'SE', within: { well: 2 } },
      // 第二座只要在 SE 即可（含已建房）
      { build: 'house', count: 1, in: 'SE' },
    ],
    resources: {},
    success: {
      population: 8,        // 安置 3 户 ≈ 8 人
      wood: 4,              // slice-9：反哺木料供清第一块旧宅废墟
      fame: 5,              // slice-9：首条新民兑现后声望 25 -> 30，接上寺线门槛
      morale: 5,
      skilled: 3,           // 兑现承诺 = 这批人成熟练织户
      hudUnlock: ['cloth'],
      log: '王氏织户安居慈灯坊，并奉上薄礼木料若干。声望 +5，民心 +5，迁入 8 人（含 3 名熟练织户），木料 +4。',
    },
    failure: {
      morale: -8,
      congestion: 6,
      vagrantCount: 3,
      log: '南门三户新民流落街巷，沦为流民。民心 -8，拥堵 +6。',
    },
  },

  // === slice-4 ===
  // 达官管事接待承诺。法会 grand → nobleStewardEligible → 北门 spawn → accept 立约。
  // 承诺重点：备齐接待规格 + 坊风可见 + 留出地块给府邸（reservable）。
  nobleSteward: {
    deadlineDays: 4,
    moneyOnAccept: 0,
    spatial: [
      // 1 块 NE 区 2×2 空地，供未来盖府邸（reservable 模式）
      { build: 'mansion', count: 1, in: 'NE', size: { w: 2, h: 2 }, mode: 'reservable' },
    ],
    resources: { money: 20, cloth: 5 },
    constraints: {
      fameMin: 25,        // 法会 grand 后 fame ≥33，可达
      freeGuardsMin: 1,   // 保达官安全
      moraleMin: 50,      // 坊风纯朴，达官才愿来
    },
    outcomes: {
      grand: {
        fame: 5,
        unlockMansion: true,
        log: '达官管事满意而归，府邸即将奠基。Demo 第一条主线达成！',
      },
      basic: {
        fame: -2,
        unlockMansion: true,  // 基础也算应允——但有微小不满
        log: '达官管事勉强应允，但嫌坊风未尽善。府邸允建，声望微挫。',
      },
      cold: {
        fame: -5,
        resetNobleEligible: true,  // 失败后须再办一次法会 grand
        log: '达官管事失望而去，下次仍须先以法会致意。',
      },
    },
  },

  // === slice-3 ===
  // 寺庙小法会筹备承诺。三档结算：grand（全满足）/ basic（资源齐但约束差）/ cold（资源没齐）
  templeFestival: {
    deadlineDays: 5,
    moneyOnAccept: 0,
    spatial: [],
    resources: { cloth: 8, money: 10 },
    constraints: {
      fireRiskMax: 60,        // 火险 ≤ 60
      hostingCapacityMin: 1,  // 至少 1 个客舍/香铺
      freeGuardsMin: 1,       // 巡夜人空闲 ≥1（防踩踏）
    },
    outcomes: {
      grand: {
        fame: 15, money: 30,
        lanternProgress: 1,    // 上元节进度 +1
        triggerNoble: true,    // slice-4：开启达官管事 spawn 资格
        log: '小法会盛大圆满，香烟袅绕，远客慕名而来！声望 +15，钱粮 +30。',
      },
      basic: {
        fame: 5, money: 10,
        log: '小法会平稳举行，香客称心，但筹备稍欠周到。声望 +5，钱粮 +10。',
      },
      cold: {
        fame: -3, morale: -5,
        log: '小法会冷淡收场，香客失望散去。声望 -3，民心 -5。',
      },
    },
  },

  // === slice-2 ===
  weaverShop: {
    deadlineDays: 4,        // 比新民承诺(3 日)长，因为要建 1×2 + 攒木料
    moneyOnAccept: 0,       // 接纳织户提议不收钱
    spatial: [
      { build: 'weaver', count: 1,
        inAny: ['SE', 'SW'],
        notAdjacentTo: ['house', 'incense'],  // 远离民宅(扰邻) + 远离香铺(火险)
      },
    ],
    resources: { wood: 5 },
    success: {
      skilled: 1,           // 这名织户成为熟练工
      hudUnlock: ['cloth'],
      log: '织户立棚开张，每日布帛产出增加。',
    },
    failure: {
      population: -1,
      morale: -3,
      vagrantCount: 1,      // 在源门(默认 S)外生成 1 个流民
      log: '织户失望离去，沦为流民。',
    },
  },

  // === slice-9 ===
  templePermitT1: {
    deadlineDays: 10,
    moneyOnAccept: 0,
    spatial: [],
    resources: { cloth: 6 },
    constraints: { moraleMin: 50 },
    outcomes: {
      grand: {
        fame: 10,
        log: '住持深感诚意，外圈寺产愿与坊共享！',
        onSettle: (state, addLog) => __unlockTier(state, 'templeDispute', 1, 'full', addLog),
      },
      basic: {
        fame: 5,
        log: '协商勉强达成，仅部分寺产开放。',
        onSettle: (state, addLog) => __unlockTier(state, 'templeDispute', 1, 'half', addLog),
      },
      cold: {
        fame: -5,
        log: '协商不欢而散，寺方暂不开放外圈寺产。',
        onSettle: (state) => __setCooldown(state, 'templeNegotiateCooldown', 1),
      },
    },
  },
  templePermitT2: {
    deadlineDays: 8,
    moneyOnAccept: 0,
    spatial: [],
    resources: { cloth: 12 },
    constraints: { moraleMin: 60 },
    outcomes: {
      grand: {
        fame: 15,
        log: '中圈寺产开放！',
        onSettle: (state, addLog) => __unlockTier(state, 'templeDispute', 2, 'full', addLog),
      },
      basic: {
        fame: 5,
        log: '中圈仅部分开放。',
        onSettle: (state, addLog) => __unlockTier(state, 'templeDispute', 2, 'half', addLog),
      },
      cold: {
        fame: -8,
        log: '中圈协商失败。',
        onSettle: (state) => __setCooldown(state, 'templeNegotiateCooldown', 2),
      },
    },
  },
  templePermitT3: {
    deadlineDays: 6,
    moneyOnAccept: 0,
    spatial: [],
    resources: { cloth: 20 },
    constraints: { moraleMin: 70, fireRiskMax: 60 },
    outcomes: {
      grand: {
        fame: 25,
        log: '紧邻寺产开放，慈灯坊与寺一体！',
        onSettle: (state, addLog) => __unlockTier(state, 'templeDispute', 3, 'full', addLog),
      },
      basic: {
        fame: 8,
        log: '紧邻寺产仅部分开放。',
        onSettle: (state, addLog) => __unlockTier(state, 'templeDispute', 3, 'half', addLog),
      },
      cold: {
        fame: -12,
        log: '紧邻寺产协商彻底失败。',
        onSettle: (state) => __setCooldown(state, 'templeNegotiateCooldown', 3),
      },
    },
  },

  govPermitT1: {
    deadlineDays: 10,
    moneyOnAccept: 0,
    spatial: [],
    resources: { money: 30 },
    constraints: { moraleMin: 50 },
    outcomes: {
      grand: {
        fame: 5,
        log: '官府批文下达，边角官地解禁！',
        onSettle: (state, addLog) => __unlockTier(state, 'govSealed', 1, 'full', addLog),
      },
      basic: {
        fame: 2,
        log: '官府批文部分下达。',
        onSettle: (state, addLog) => __unlockTier(state, 'govSealed', 1, 'half', addLog),
      },
      cold: {
        fame: -3,
        log: '官府不予批文。',
        onSettle: (state) => __setCooldown(state, 'govPermitCooldown', 1),
      },
    },
  },
  govPermitT2: {
    deadlineDays: 8,
    moneyOnAccept: 0,
    spatial: [],
    resources: { money: 60 },
    constraints: { moraleMin: 60 },
    outcomes: {
      grand: {
        fame: 8,
        log: '中带官地解禁！',
        onSettle: (state, addLog) => __unlockTier(state, 'govSealed', 2, 'full', addLog),
      },
      basic: {
        fame: 3,
        log: '中带官地仅部分解禁。',
        onSettle: (state, addLog) => __unlockTier(state, 'govSealed', 2, 'half', addLog),
      },
      cold: {
        fame: -5,
        log: '中带官地批文失败。',
        onSettle: (state) => __setCooldown(state, 'govPermitCooldown', 2),
      },
    },
  },
  govPermitT3: {
    deadlineDays: 6,
    moneyOnAccept: 0,
    spatial: [],
    resources: { money: 100 },
    constraints: { moraleMin: 70 },
    outcomes: {
      grand: {
        fame: 12,
        log: '核心官地解禁，慈灯坊位列正籍！',
        onSettle: (state, addLog) => __unlockTier(state, 'govSealed', 3, 'full', addLog),
      },
      basic: {
        fame: 4,
        log: '核心官地仅部分解禁。',
        onSettle: (state, addLog) => __unlockTier(state, 'govSealed', 3, 'half', addLog),
      },
      cold: {
        fame: -8,
        log: '核心官地批文驳回。',
        onSettle: (state) => __setCooldown(state, 'govPermitCooldown', 3),
      },
    },
  },
};

// === slice-5: 防御承诺（消防演练 / 临时巡夜） ===
// 火险/拥堵到 warn 阈值时由 petitions 自动 spawn 请愿。接纳后立约,
// 期限内备齐资源 + 占用 1 名空闲坊丁 → 完成时直接扣对应风险数值。
PROMISE_BALANCE.fireDrill = {
  deadlineDays: 3,
  moneyOnAccept: 0,
  spatial: [],
  resources: { wood: 2, money: 5 },
  constraints: { freeGuardsMin: 1 },
  outcomes: {
    grand: { fireRisk: -25, morale: 2, log: '消防演练井然有序，火险 -25，民心 +2。' },
    basic: { fireRisk: -10, log: '消防演练勉强完成，火险 -10。' },
    cold:  { morale: -2,    log: '消防演练无人组织，只丢面子，民心 -2。' },
  },
};

// === slice-7: 达官线 stage-2 ===
// nobleAccepted=true 但 mansion 迟迟未建 → 管事来催"圈地动工"。
// 接纳即立约:在期限内 NE 区有 mansion plot status='building' 或 'built'
// (玩家须开工)。失败 → nobleAccepted=false 整线终止。
PROMISE_BALANCE.nobleMansionUrgent = {
  deadlineDays: 5,
  moneyOnAccept: 0,
  spatial: [
    // NE 区已经在建/已建成的 mansion(玩家须用 startProject 启动)
    { build: 'mansion', count: 1, in: 'NE', mode: 'building-or-built' },
  ],
  resources: {},
  constraints: { fameMin: 20 },
  outcomes: {
    grand: {
      fame: 8,
      log: '达官闻府邸动工，欣然往观，声望 +8。',
    },
    basic: {
      fame: 2,
      log: '达官见府邸虽就位但稍迟，勉强首肯，声望 +2。',
    },
    cold: {
      fame: -10,
      resetNobleAccepted: true,
      log: '达官失望撤回意向，府邸事告吹，声望 -10。',
    },
  },
};

// === slice-6: 修复承诺 ===
// 火灾爆发后受损建筑 status='damaged'。spawn 修复请愿(自动),接纳立约,
// 期限内备齐木料+钱粮 → 完成时 status 回 'built',火险也压低（修缮带走可燃物）。
PROMISE_BALANCE.repairBuilding = {
  deadlineDays: 4,
  moneyOnAccept: 0,
  spatial: [],
  resources: { wood: 4, money: 8 },
  constraints: {},
  outcomes: {
    grand: {
      fireRisk: -10,
      morale: 3,
      log: '受损建筑修缮如新，民心 +3，火险 -10。',
    },
    basic: {
      morale: 1,
      log: '修缮勉强完工，民心 +1。',
    },
    cold: {
      morale: -5,
      log: '修缮无果，焦土留痕，民心 -5。',
    },
  },
};

PROMISE_BALANCE.nightPatrol = {
  deadlineDays: 2,
  moneyOnAccept: 0,
  spatial: [],
  resources: { money: 8 },
  constraints: { freeGuardsMin: 2 },
  outcomes: {
    grand: { congestion: -20, morale: 2, log: '临时巡夜清街利落，拥堵 -20，民心 +2。' },
    basic: { congestion: -8,             log: '巡夜勉力维持，拥堵 -8。' },
    cold:  { morale: -2,                 log: '巡夜请求被搁置，街上更乱，民心 -2。' },
  },
};

// 兼容别名（旧代码逐步迁移）
export const SLICE1_BALANCE = PROMISE_BALANCE;
