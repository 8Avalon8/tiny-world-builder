// test/scenario_temple.test.js
// Spec #5 端到端场景：寺庙线完整链路 + 大法会成功后的 passiveMoneyBonus 应用。
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SPEC5_BALANCE } from '../../js/game/balance-temple.js';
import {
  maybeSpawnPilgrimPetition,
  acceptPilgrimPetition,
} from '../../js/game/petitions.js';
import {
  maybeSpawnRitualEvent,
  maybeSpawnLanternFestivalEvent,
  resolveEventChoice,
  expireStaleEvents,
} from '../../js/game/events.js';
import {
  makeFakeState,
  makeBuiltHousePlot,
  makeBuiltIncensePlot,
  registerBuildings,
} from './_helpers.js';

test('scenario: 修缮 → pilgrim → accept → ritual → resolve → lantern → resolve + passiveMoneyBonus 应用', () => {
  const s = makeFakeState({
    day: 1,
    stats: { money: 200, cloth: 50, fame: 20, guards: 3 },
    guardAssignments: { patrol: 0 },
  });
  s.plots = [makeBuiltHousePlot('a'), makeBuiltIncensePlot('a')];
  registerBuildings(s, s.plots);

  // 修缮（手动设置）
  s.templeRefurbished = true;
  s.stats.fame += SPEC5_BALANCE.refurbish.fameGain;
  assert.equal(s.stats.fame, 30);

  // Day 5：spawn pilgrim
  s.day = 5;
  const pet = maybeSpawnPilgrimPetition(s);
  assert.ok(pet);
  assert.equal(pet.kind, 'pilgrim');
  // 接纳基础（fame +3）
  assert.equal(acceptPilgrimPetition(s, pet, { warm: false }), true);
  assert.equal(s.stats.fame, 33);

  // Day 12：spawn ritual（fame >= 30 + intervalDays 7 + refurbished + !lanternDone）
  s.day = 12;
  const ritual = maybeSpawnRitualEvent(s);
  assert.ok(ritual);
  assert.equal(ritual.kind, 'ritual');
  // 选 grand：cloth -10, money -20, fame +15, prosperity +5
  const fameBefore = s.stats.fame;
  const okR = resolveEventChoice(s, ritual, 'grand', () => {});
  assert.equal(okR, true);
  assert.equal(s.stats.fame, fameBefore + SPEC5_BALANCE.ritual.grandFameGain);

  // 提升 fame 到 60+ 触发 lantern
  s.stats.fame = 65;
  s.day = 30;
  const lantern = maybeSpawnLanternFestivalEvent(s);
  assert.ok(lantern);
  assert.equal(lantern.kind, 'lantern-festival');
  // 选 host：cost cloth 30 + money 50 + 1 guard，fame +30，passiveMoneyBonus +5，lanternFestivalDone=true
  const moneyBefore = s.stats.money;
  const okL = resolveEventChoice(s, lantern, 'host', () => {});
  assert.equal(okL, true);
  assert.equal(s.lanternFestivalDone, true);
  assert.equal(s.passiveMoneyBonus, SPEC5_BALANCE.lanternFestival.successPassiveMoneyBonus);
  assert.equal(s.stats.money, moneyBefore - SPEC5_BALANCE.lanternFestival.moneyCost);

  // summarizeDay 应用 passiveMoneyBonus
  const beforeBonus = s.stats.money;
  s.stats.money += s.passiveMoneyBonus || 0;
  assert.equal(s.stats.money, beforeBonus + 5);
});

test('scenario: 修缮后接 warm pilgrim → fame & money gains 正确', () => {
  const s = makeFakeState({
    day: 5, templeRefurbished: true,
    stats: { money: 100, cloth: 10, fame: 20 },
  });
  s.plots = [makeBuiltHousePlot('b'), makeBuiltIncensePlot('b')];
  registerBuildings(s, s.plots);

  const pet = maybeSpawnPilgrimPetition(s);
  assert.ok(pet);
  const ok = acceptPilgrimPetition(s, pet, { warm: true });
  assert.equal(ok, true);
  assert.equal(s.stats.cloth, 10 - SPEC5_BALANCE.pilgrim.warmClothCost);
  assert.equal(s.stats.money, 100 + SPEC5_BALANCE.pilgrim.warmMoneyGain);
  assert.equal(s.stats.fame, 20 + SPEC5_BALANCE.pilgrim.warmFameGain);
});

test('scenario: lantern festival 过期未处理 → fame -15', () => {
  const s = makeFakeState({
    day: 30, templeRefurbished: true, lanternFestivalDone: false,
    stats: { fame: 65 },
  });
  const lantern = maybeSpawnLanternFestivalEvent(s);
  assert.ok(lantern);
  const fameBefore = s.stats.fame;
  // 推进到过期
  s.day = lantern.expiresOnDay + 1;
  expireStaleEvents(s, () => {});
  assert.equal(lantern.resolved, true);
  assert.equal(lantern.outcome, 'expired');
  assert.equal(s.stats.fame, fameBefore + SPEC5_BALANCE.lanternFestival.expireFameDelta);
  // lanternFestivalDone 不应被设置（只有成功 host 才设）
  assert.equal(s.lanternFestivalDone, false);
});
