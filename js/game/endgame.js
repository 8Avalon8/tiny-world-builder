// src/world/endgame.js
// 首章目标现在改成「软章节检验」：达成会给通关式庆祝；错过不会硬停，
// 而是留下 chapterSoftMissed 标记，让玩家继续把坊经营下去。

import { getChapterDeadline } from './difficulty.js';

export const FIRST_CHAPTER_DEADLINE_DAY = 7;

export function resetEndgameState(state) {
  state.running = true;
  state.mainGoal = { templeFestivalGrand: false, nobleStewardHosted: false };
  state.chapterSoftMissed = false;
  state.endgame = {
    status: 'playing',
    reason: null,
    endedOnDay: 0,
    title: '',
    text: '',
  };
}

export function evaluateEndgame(state) {
  ensureEndgameShape(state);
  if (state.endgame.status !== 'playing') return state.endgame;

  if (state.mainGoal.templeFestivalGrand && state.mainGoal.nobleStewardHosted) {
    finish(state, {
      status: 'won',
      reason: 'first-chapter-clear',
      title: '首章达成',
      text: '小法会声名传开，达官管事也已接待妥当。慈灯坊稳稳跨过第一关。',
    });
    return state.endgame;
  }

  if (state.day >= getChapterDeadline(state) && !state.chapterSoftMissed) {
    state.chapterSoftMissed = true;
    state.endgame.reason = 'deadline-soft-missed';
    state.endgame.endedOnDay = state.day;
    state.endgame.title = '首章延期';
    state.endgame.text = '七日已尽，首场小法会与达官线尚未接上。坊务仍可继续，只是第一波起势慢了些。';
    // 不停止游戏：这是经营原型，不把探索惩罚成失败。
    state.running = true;
  }

  return state.endgame;
}

function ensureEndgameShape(state) {
  if (!state.mainGoal) state.mainGoal = { templeFestivalGrand: false, nobleStewardHosted: false };
  if (!state.endgame) {
    state.endgame = {
      status: 'playing',
      reason: null,
      endedOnDay: 0,
      title: '',
      text: '',
    };
  }
}

function finish(state, def) {
  state.endgame.status = def.status;
  state.endgame.reason = def.reason;
  state.endgame.endedOnDay = state.day;
  state.endgame.title = def.title;
  state.endgame.text = def.text;
  state.running = false;
}
