// src/agents/needs.js
// PR1: needs 框架（spec §5.4）。每模拟分钟更新，不挂 60Hz。

// 每模拟分钟需求增长率（0..1 / minute）
const NEEDS_RATE = {
  Resident:    { thirst: 0.002, fatigue: 0.001, devotion: 0.0005 },
  Monk:        { thirst: 0.001, fatigue: 0.001, devotion: 0.0008 },
  Guard:       { thirst: 0.002, fatigue: 0.0015 },                // 无 devotion
  Stallkeeper: { thirst: 0.002, fatigue: 0.002 },                // 守摊累
  StoryAgent:  null,                                              // 主角不接需求
};

export function initNeedsForRole(role) {
  if (!role) return null;
  const tpl = NEEDS_RATE[role];
  if (tpl === null) return null;
  if (!tpl) return null;
  const out = {};
  for (const k of Object.keys(tpl)) out[k] = 0;
  return out;
}

// 在每模拟分钟前进时调用，dm = 推进的分钟数（小数允许）。
export function updateNeeds(a, dm) {
  if (!a.needs || !a.role) return;
  const tpl = NEEDS_RATE[a.role];
  if (!tpl) return;
  for (const k of Object.keys(tpl)) {
    if (a.needs[k] == null) continue;
    a.needs[k] = Math.min(1.0, a.needs[k] + tpl[k] * dm);
  }
}

// Sleep 醒来时调用：thirst/devotion 归零，fatigue 设到一个低值（不计算睡眠时长）。
export function resetNeedsAfterSleep(a) {
  if (!a.needs) return;
  if (a.needs.thirst != null)   a.needs.thirst = 0;
  if (a.needs.devotion != null) a.needs.devotion = 0;
  if (a.needs.fatigue != null)  a.needs.fatigue = 0.1;
}

// 把一个 0..1 需求值映射到 task weight 倍率（spec §5.4 阈值表）
export function needWeight(v) {
  if (v < 0.4) return 1.0 + v * 0.5;        // 1.0 .. 1.2
  if (v < 0.7) return 1.2 + (v - 0.4) * 4;  // 1.2 .. 2.4
  if (v < 0.95) return 2.4 + (v - 0.7) * 12; // 2.4 .. 5.4
  return 6.0;
}
