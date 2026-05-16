// test/scenario.test.js
// 端到端场景测试：模拟玩家行为序列，断言 N 天后的 state。
// 注：slice-1 把 acceptNewcomerPetition 改造成承诺机制后，这些场景测的是
// 「人口已就绪」之后的下游链路（织棚产出、拥挤副作用），不再走 accept 流程。
// 承诺机制本身的端到端测试见 promises.test.js。
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { tryAutoHire, applyDailyTick } from '../../js/game/citizens.js';
import { makeFakeState, makeBuiltHousePlot, makeBuiltWeaverPlot, registerBuildings } from './_helpers.js';

test('scenario: 1 weaver + pop 11 (基础) + 5 days → cloth = 10', () => {
  const s = makeFakeState({ stats: { money: 200, cloth: 0, population: 11 } });
  s.plots = [
    makeBuiltWeaverPlot('1'),
    makeBuiltHousePlot('1'), makeBuiltHousePlot('2'), makeBuiltHousePlot('3'),
  ];
  registerBuildings(s, s.plots);
  tryAutoHire(s);
  for (let i = 0; i < 5; i++) {
    s.day++;
    applyDailyTick(s, () => {});
  }
  // 5 天 × 2 worker × 1 cloth/day = 10 cloth
  assert.equal(s.stats.cloth, 10);
  assert.equal(s.stats.population, 11);
});

test('scenario: 1 weaver + pop 11 (3 熟练) + 5 days → cloth = 17', () => {
  const s = makeFakeState({ stats: { money: 200, cloth: 2, population: 11, morale: 55 }, skilledResidents: 3 });
  s.plots = [
    makeBuiltWeaverPlot('1'),
    makeBuiltHousePlot('1'), makeBuiltHousePlot('2'), makeBuiltHousePlot('3'),
  ];
  registerBuildings(s, s.plots);
  tryAutoHire(s);
  for (let i = 0; i < 5; i++) {
    s.day++;
    applyDailyTick(s, () => {});
  }
  // 5 天 × 2 skilled × 1.5 = 15 cloth + 初始 2 = 17
  assert.equal(s.stats.cloth, 17);
});

test('scenario: 3 houses + pop 14 (overflow 2) + 1 day → congestion = 4, morale -2', () => {
  const s = makeFakeState({ stats: { money: 200, population: 14, morale: 55 } });
  s.plots = [makeBuiltHousePlot('1'), makeBuiltHousePlot('2'), makeBuiltHousePlot('3')];
  registerBuildings(s, s.plots);
  s.day++;
  applyDailyTick(s, () => {});
  assert.equal(s.stats.congestion, 4); // overflow 2 × 2
  assert.equal(s.stats.morale, 55 - 2); // -1 × overflow
});
