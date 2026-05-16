// test/difficulty.test.js
// slice-13: 数值校准与难度模式。

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeState } from './_helpers.js';
import {
  applyDifficultyOnReset,
  getChapterDeadline,
  getDailyGains,
  normalizeDifficulty,
} from '../../js/game/difficulty.js';

test('normalizeDifficulty: 未知难度回退 standard', () => {
  assert.equal(normalizeDifficulty('relaxed'), 'relaxed');
  assert.equal(normalizeDifficulty('strict'), 'strict');
  assert.equal(normalizeDifficulty('weird'), 'standard');
});

test('applyDifficultyOnReset: 宽松开局资源更多，严苛资源更紧', () => {
  const relaxed = makeFakeState({ difficulty: 'relaxed' });
  const strict = makeFakeState({ difficulty: 'strict' });

  applyDifficultyOnReset(relaxed);
  applyDifficultyOnReset(strict);

  assert.ok(relaxed.stats.money > strict.stats.money);
  assert.ok(relaxed.stats.wood > strict.stats.wood);
  assert.ok(relaxed.stats.morale > strict.stats.morale);
});

test('getChapterDeadline: 三档首章期限不同', () => {
  assert.equal(getChapterDeadline(makeFakeState({ difficulty: 'relaxed' })), 9);
  assert.equal(getChapterDeadline(makeFakeState({ difficulty: 'standard' })), 7);
  assert.equal(getChapterDeadline(makeFakeState({ difficulty: 'strict' })), 6);
});

test('getDailyGains: 宽松每日补给高于严苛', () => {
  const relaxed = getDailyGains(makeFakeState({ difficulty: 'relaxed' }));
  const strict = getDailyGains(makeFakeState({ difficulty: 'strict' }));

  assert.ok(relaxed.money > strict.money);
  assert.ok(relaxed.wood >= strict.wood);
});
