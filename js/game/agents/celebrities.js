// src/agents/celebrities.js
// 名人 NPC 花名册 + 入坊调度。
// 设计目的：在不影响现有玩法数值的前提下，让坊里偶尔出现一位有名有姓、
// 有专属配色与配饰的角色，丰富视觉与世界感。
//
// 数据驱动：CELEBRITIES 列表里加一行就能多一位名士；不需要改 routines/render
// 的分支（render 走 a.celebrity.accessory，routines 走 a.celebrity.scheduleKinds）。
//
// 玩法影响：暂时无（不发请愿、不改 stat），仅有入坊/离坊日志和 toast。

import { state } from '../state.js';
import { Agent } from './agent.js';

// 名士台账。weight 控制相对出现频率；scheduleKinds 是 routines.buildSchedule
// 翻译成 cell 的关键词序列。
export const CELEBRITIES = [
  // ===== 唐朝历史人物 =====
  {
    id: 'libai',
    name: '李白',
    title: '诗仙',
    era: '历史',
    color: '#7e3f8a',           // 紫袍
    accentColor: '#e9d27f',
    accessory: 'gourd',          // 酒葫芦
    bubble: '诗',
    gate: 'W',
    scheduleKinds: ['inn', 'inn', 'well', 'temple'],
    lingerScale: 1.6,
    greeting: '诗仙李白携酒入坊，挥毫处又是一篇新诗。',
    farewell: '李白醉吟而去：「明朝散发弄扁舟」。',
    weight: 3,
  },
  {
    id: 'dufu',
    name: '杜甫',
    title: '诗圣',
    era: '历史',
    color: '#5d6f80',
    accentColor: '#c8b88a',
    accessory: 'scroll',
    bubble: '墨',
    gate: 'S',
    scheduleKinds: ['temple', 'well', 'house'],
    lingerScale: 1.3,
    greeting: '杜甫立于坊门，望街轻叹：「朱门酒肉，慈灯何幸。」',
    farewell: '杜甫拱手作别，携卷赴远。',
    weight: 2,
  },
  {
    id: 'xuanzang',
    name: '玄奘',
    title: '三藏法师',
    era: '历史',
    color: '#c08c3a',           // 黄袍
    accentColor: '#e9d39a',
    accessory: 'sutra',          // 经卷
    bubble: '经',
    gate: 'W',
    scheduleKinds: ['temple', 'temple', 'well'],
    lingerScale: 1.8,
    greeting: '三藏法师玄奘途经慈灯坊，先入寺礼佛。',
    farewell: '玄奘合十辞别：「随缘了此一行。」',
    weight: 2,
  },
  {
    id: 'gongsun',
    name: '公孙大娘',
    title: '剑舞名家',
    era: '历史',
    color: '#9b332f',
    accentColor: '#d8a637',
    accessory: 'sword',
    bubble: '舞',
    gate: 'E',
    scheduleKinds: ['well', 'temple', 'inn'],
    lingerScale: 1.4,
    greeting: '公孙大娘飒然入坊，井边一舞，惊动四邻。',
    farewell: '公孙大娘收剑入鞘，扬尘而去。',
    weight: 2,
  },

  // ===== 长安十二时辰 =====
  {
    id: 'zhangxiaojing',
    name: '张小敬',
    title: '不良帅',
    era: '十二时辰',
    color: '#3a2f24',
    accentColor: '#a08367',
    accessory: 'blade',          // 横刀
    bubble: '查',
    gate: 'S',
    scheduleKinds: ['guardpos', 'inn', 'gate'],
    lingerScale: 0.8,
    greeting: '不良帅张小敬大步入坊，目光直扫向暗角。',
    farewell: '张小敬留下一句「平安便好」，转身离坊。',
    weight: 3,
  },
  {
    id: 'libi',
    name: '李必',
    title: '靖安司丞',
    era: '十二时辰',
    color: '#4f6b78',
    accentColor: '#d3c69b',
    accessory: 'tag',            // 玉佩
    bubble: '靖',
    gate: 'N',
    scheduleKinds: ['mansion', 'guardpos', 'temple'],
    lingerScale: 1.2,
    greeting: '靖安司丞李必持玉简至，神色从容。',
    farewell: '李必无声而退，仿佛从未来过。',
    weight: 2,
  },
  {
    id: 'tanqi',
    name: '檀棋',
    title: '靖安司婢',
    era: '十二时辰',
    color: '#6c8aa3',
    accentColor: '#d6a99c',
    accessory: 'lantern',
    bubble: '探',
    gate: 'N',
    scheduleKinds: ['mansion', 'well', 'inn'],
    lingerScale: 1.0,
    greeting: '檀棋提灯入坊，似在替人打探消息。',
    farewell: '檀棋灯火没入夜色。',
    weight: 1,
  },

  // ===== 唐朝诡事录 =====
  {
    id: 'suwuming',
    name: '苏无名',
    title: '大理寺评事',
    era: '诡事录',
    color: '#52646e',
    accentColor: '#b69462',
    accessory: 'scroll',
    bubble: '案',
    gate: 'S',
    scheduleKinds: ['guardpos', 'temple', 'well'],
    lingerScale: 1.3,
    greeting: '大理寺评事苏无名循案而来，眉间凝着一缕疑色。',
    farewell: '苏无名记下一笔，悄然离坊。',
    weight: 2,
  },
  {
    id: 'lulingfeng',
    name: '卢凌风',
    title: '卢家郎将',
    era: '诡事录',
    color: '#8a3030',
    accentColor: '#d4a44a',
    accessory: 'blade',
    bubble: '戎',
    gate: 'N',
    scheduleKinds: ['guardpos', 'gate', 'inn'],
    lingerScale: 0.9,
    greeting: '卢家郎将卢凌风按剑入坊，铠甲铿然作声。',
    farewell: '卢凌风一抱拳：「叨扰了。」纵马离坊。',
    weight: 2,
  },
  {
    id: 'feijishi',
    name: '费鸡师',
    title: '卜算游方',
    era: '诡事录',
    color: '#7a6748',
    accentColor: '#c2a657',
    accessory: 'fan',
    bubble: '卜',
    gate: 'W',
    scheduleKinds: ['temple', 'well', 'inn'],
    lingerScale: 1.5,
    greeting: '费鸡师摇扇而入：「这慈灯坊气数尚旺。」',
    farewell: '费鸡师飘然而去，扇影未散。',
    weight: 1,
  },
];

const CELEB_BY_ID = Object.fromEntries(CELEBRITIES.map(c => [c.id, c]));

export function getCelebrityData(id) {
  return CELEB_BY_ID[id] || null;
}

export function getActiveCelebrity(state) {
  return state.agents.find(a => a.type === 'Celebrity') || null;
}

// 加权随机挑选下一位名士，避开当前在场以及最近 3 位刚来过的，避免短期重复。
function pickCandidate(recentIds = []) {
  const active = getActiveCelebrity(state);
  const skip = new Set(recentIds);
  if (active && active.celebId) skip.add(active.celebId);

  const pool = CELEBRITIES.filter(c => !skip.has(c.id));
  const list = pool.length > 0 ? pool : CELEBRITIES;

  let total = 0;
  for (const c of list) total += c.weight;
  let r = Math.random() * total;
  for (const c of list) {
    r -= c.weight;
    if (r <= 0) return c;
  }
  return list[list.length - 1];
}

// 时不时来一位：同时最多 1 位；夜禁不入坊；下次刷新间隔 8~18 游戏小时。
const SPAWN_GAP_GAME_MINUTES_MIN = 8 * 60;
const SPAWN_GAP_GAME_MINUTES_MAX = 18 * 60;
const MINUTES_PER_DAY = 24 * 60;   // 与 time.js DAY_END_MINUTE 一致；用本地常量避免循环依赖

// state.minute 每日 05:30 重置回 330，纯日内时钟。跨日间隔（8~18h）必须基于
// 绝对游戏分钟来计算，否则下次 nextSpawn 容易落到当天 19:30 之后的不可达区间，
// 永久禁用名士刷新。
function absMinutes(state) {
  return state.day * MINUTES_PER_DAY + state.minute;
}

function ensureCelebState(state) {
  if (!state.celebrities) {
    state.celebrities = {
      nextSpawnAt: absMinutes(state) + 30,  // 启动后半小时尝试第一次
      recentIds: [],
    };
  }
  return state.celebrities;
}

export function tryAmbientCelebritySpawn(state, addLog, toast) {
  if (!state.gates) return null;
  if (state.gateOpen === false) return null;       // 宵禁不入坊
  if (getActiveCelebrity(state)) return null;      // 同时仅 1 位

  const cs = ensureCelebState(state);
  const now = absMinutes(state);
  if (now < cs.nextSpawnAt) return null;

  const data = pickCandidate(cs.recentIds);
  const a = spawnCelebrity(state, data);
  if (!a) {
    cs.nextSpawnAt = now + 30;                     // spawn 失败则 30 分钟后再试
    return null;
  }

  cs.recentIds = [data.id, ...cs.recentIds].slice(0, 3);
  cs.nextSpawnAt = now
    + SPAWN_GAP_GAME_MINUTES_MIN
    + Math.random() * (SPAWN_GAP_GAME_MINUTES_MAX - SPAWN_GAP_GAME_MINUTES_MIN);

  if (typeof addLog === 'function') addLog(data.greeting, true);
  if (typeof toast === 'function') toast(`${data.title} ${data.name} 入坊`);
  return a;
}

function spawnCelebrity(state, data) {
  const gateKey = data.gate || 'S';
  const g = state.gates[gateKey];
  if (!g) return null;
  const x = g.cell.x + 0.5 + (Math.random() - 0.5) * 0.4;
  const y = g.cell.y + 0.5 + (Math.random() - 0.5) * 0.4;
  const a = new Agent('Celebrity', null, {
    name: data.name,
    color: data.color,
    x, y,
  });
  a.fromGate = gateKey;
  a.bornAt = performance.now();
  a.target = null;
  a.targetReached = 0;
  a.visible = true;
  a.celebId = data.id;
  a.celebrity = data;
  state.agents.push(a);
  g.todayTraffic = (g.todayTraffic || 0) + 1;
  g.lastVisitor = `${data.title} ${data.name}`;
  return a;
}

// 由 routines.tickAgent 在删除 celebrity 时调用，让离场也有日志。
export function onCelebrityLeave(state, a, addLog) {
  if (!a || a.type !== 'Celebrity') return;
  if (typeof addLog === 'function' && a.celebrity && a.celebrity.farewell) {
    addLog(a.celebrity.farewell);
  }
}
