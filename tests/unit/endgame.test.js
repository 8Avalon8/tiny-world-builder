// test/endgame.test.js
// slice-10: 7 日硬终点与重开入口状态。

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeState } from './_helpers.js';
import { evaluateEndgame, resetEndgameState } from '../../js/game/endgame.js';

test('evaluateEndgame: 7 日内小法会 grand 且达官接待兑现后胜利', () => {
  const s = makeFakeState({
    day: 6,
    mainGoal: { templeFestivalGrand: true, nobleStewardHosted: true },
    endgame: { status: 'playing', reason: null, endedOnDay: 0, title: '', text: '' },
  });

  const result = evaluateEndgame(s);

  assert.equal(result.status, 'won');
  assert.equal(s.running, false);
  assert.equal(s.endgame.reason, 'first-chapter-clear');
  assert.equal(s.endgame.endedOnDay, 6);
});

test('evaluateEndgame: 第 7 日结束仍未接待达官则标记延期但继续游玩', () => {
  const s = makeFakeState({
    day: 7,
    mainGoal: { templeFestivalGrand: true, nobleStewardHosted: false },
    endgame: { status: 'playing', reason: null, endedOnDay: 0, title: '', text: '' },
  });

  const result = evaluateEndgame(s);

  assert.equal(result.status, 'playing');
  assert.equal(s.running, true);
  assert.equal(s.chapterSoftMissed, true);
  assert.equal(s.endgame.reason, 'deadline-soft-missed');
  assert.match(s.endgame.text, /达官线|达官管事/);
});

test('resetEndgameState: 重置终局和首章目标', () => {
  const s = makeFakeState({
    running: false,
    mainGoal: { templeFestivalGrand: true, nobleStewardHosted: true },
    endgame: { status: 'lost', reason: 'deadline-missed', endedOnDay: 7, title: '旧标题', text: '旧文本' },
  });

  resetEndgameState(s);

  assert.equal(s.running, true);
  assert.deepEqual(s.mainGoal, { templeFestivalGrand: false, nobleStewardHosted: false });
  assert.deepEqual(s.endgame, { status: 'playing', reason: null, endedOnDay: 0, title: '', text: '' });
});
