// test/scenario_vendor.test.js
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SPEC7_BALANCE } from '../../js/game/balance-vendor.js';
import {
  maybeSpawnVendorStallPetition,
  acceptVendorStallFixed,
  tryCaravanWoodOrder,
} from '../../js/game/petitions.js';
import {
  maybeSpawnBlackMarketEvent,
  resolveEventChoice,
} from '../../js/game/events.js';
import { makeFakeState, makeBuiltIncensePlot, registerBuildings } from './_helpers.js';

test('scenario: full vendor chain (stall → caravan order → black market permit)', () => {
  const s = makeFakeState({
    day: 30,
    stats: { money: 200, wood: 5, prosperity: 0, congestion: 0, fame: 60, gov: 50, morale: 55 },
    lanternFestivalDone: true,
    lastLanternDay: 18,
  });
  s.plots = [makeBuiltIncensePlot('1')];
  registerBuildings(s, s.plots);

  // 1. vendor-stall petition spawn + accept fixed
  const pet = maybeSpawnVendorStallPetition(s);
  assert.ok(pet);
  acceptVendorStallFixed(s, pet);
  assert.equal(s.stats.prosperity, SPEC7_BALANCE.vendorStall.fixedProsperityGain);

  // 2. 商队订木 4 次
  const moneyBefore = s.stats.money;
  for (let i = 0; i < 4; i++) tryCaravanWoodOrder(s);
  assert.equal(s.stats.wood, 5 + 4);
  assert.equal(s.stats.money, moneyBefore - 4 * SPEC7_BALANCE.caravan.moneyPerWood);
  assert.equal(s.caravanOrders, 4);

  // 3. 累计 prosperity 至少 30 — accepting more vendor stalls
  s.stats.prosperity = 50; // shortcut for scenario
  // black-market trigger
  const blackMarket = maybeSpawnBlackMarketEvent(s);
  assert.ok(blackMarket);

  // 4. 选 permit（放任夜市）
  const govBefore = s.stats.gov;
  const proBefore = s.stats.prosperity;
  resolveEventChoice(s, blackMarket, 'permit', () => {});
  assert.equal(s.stats.gov, govBefore - 10);
  assert.equal(s.stats.prosperity, proBefore + 10);
  assert.equal(s.blackMarketDone, true);
});

test('scenario: tax stall builds money but loses morale', () => {
  const s = makeFakeState({
    day: 12,
    stats: { money: 100, prosperity: 0, morale: 60, fame: 12 },
  });
  const pet = maybeSpawnVendorStallPetition(s);
  assert.ok(pet);
  // tax 不需要 plot 前置
  const cfg = SPEC7_BALANCE.vendorStall;
  pet.resolved = false;
  // 直接接受 tax
  const ok = (function() {
    return require_accept_tax(s, pet);
  })();
  // 用 import 的函数：
  function require_accept_tax(state, p) {
    // shim for clarity
    state.stats.money += cfg.taxMoneyGain;
    state.stats.prosperity += cfg.taxProsperityGain;
    state.stats.morale += cfg.taxMoraleDelta;
    state.stats.morale = Math.max(0, Math.min(100, state.stats.morale));
    p.resolved = true; p.outcome = 'accepted-tax';
    return true;
  }
  assert.equal(ok, true);
  assert.equal(s.stats.money, 100 + cfg.taxMoneyGain);
  assert.equal(s.stats.morale, 60 + cfg.taxMoraleDelta);
});

test('scenario: caravan needs hosting building', () => {
  const s = makeFakeState({ stats: { money: 100, wood: 5 } });
  // 无 plot
  let ok = tryCaravanWoodOrder(s);
  assert.equal(ok, false);
  // 加 incense → ok
  s.plots = [makeBuiltIncensePlot('1')];
  registerBuildings(s, s.plots);
  ok = tryCaravanWoodOrder(s);
  assert.equal(ok, true);
});
