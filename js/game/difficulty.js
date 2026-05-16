// src/world/difficulty.js
// slice-13: 三档难度与一局数值校准集中配置。

export const DIFFICULTY_MODES = {
  relaxed: {
    key: 'relaxed',
    label: '宽松',
    deadlineDay: 9,
    startStats: { money: 150, labor: 8, wood: 18, morale: 62, fame: 30, gov: 46 },
    dailyGains: { money: 7, wood: 2 },
  },
  standard: {
    key: 'standard',
    label: '标准',
    deadlineDay: 7,
    startStats: { money: 120, labor: 6, wood: 12, morale: 55, fame: 25, gov: 42 },
    dailyGains: { money: 5, wood: 1 },
  },
  strict: {
    key: 'strict',
    label: '严苛',
    deadlineDay: 6,
    startStats: { money: 100, labor: 5, wood: 9, morale: 50, fame: 22, gov: 38 },
    dailyGains: { money: 4, wood: 1 },
  },
};

export function normalizeDifficulty(value) {
  return DIFFICULTY_MODES[value] ? value : 'standard';
}

export function getDifficultyConfig(state) {
  return DIFFICULTY_MODES[normalizeDifficulty(state?.difficulty)] || DIFFICULTY_MODES.standard;
}

export function applyDifficultyOnReset(state) {
  const key = normalizeDifficulty(state.difficulty);
  const cfg = DIFFICULTY_MODES[key];
  state.difficulty = key;
  for (const [stat, value] of Object.entries(cfg.startStats)) {
    state.stats[stat] = value;
  }
  return cfg;
}

export function getChapterDeadline(state) {
  return getDifficultyConfig(state).deadlineDay;
}

export function getDailyGains(state) {
  return { ...getDifficultyConfig(state).dailyGains };
}
