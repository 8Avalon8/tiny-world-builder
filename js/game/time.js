// src/time.js
export const DAY_START_MINUTE = 5 * 60 + 30;
export const DAY_END_MINUTE = 24 * 60;
export const GAME_DAY_REAL_SECONDS = 3 * 60;
export const GAME_MINUTES_PER_REAL_SECOND = (DAY_END_MINUTE - DAY_START_MINUTE) / GAME_DAY_REAL_SECONDS;

export const PHASE_LABEL = {
  Morning: '清晨', Noon: '日中', Dusk: '暮鼓将近', Night: '夜晚', LateNight: '深夜',
};

export function getPhase(state) {
  const m = state.minute;
  if (m >= 5 * 60 + 30 && m < 10 * 60 + 30) return 'Morning';
  if (m >= 10 * 60 + 30 && m < 15 * 60 + 30) return 'Noon';
  if (m >= 15 * 60 + 30 && m < 19 * 60 + 30) return 'Dusk';
  if (m >= 19 * 60 + 30 && m < 23 * 60) return 'Night';
  return 'LateNight';
}

export function getGateStatus(state) {
  const phase = getPhase(state);
  if (phase === 'Night' || phase === 'LateNight') return 'closed';
  if (phase === 'Dusk') return 'half';
  return 'open';
}

export function minuteToText(minute) {
  const h = Math.floor(minute / 60) % 24;
  const m = Math.floor(minute % 60);
  const names = ['子', '丑', '丑', '寅', '寅', '卯', '卯', '辰', '辰', '巳', '巳', '午', '午', '未', '未', '申', '申', '酉', '酉', '戌', '戌', '亥', '亥', '子'];
  const mark = m < 15 ? '初' : m < 30 ? '一刻' : m < 45 ? '二刻' : '三刻';
  return `${names[h]}时${mark}`;
}
