// test/vendor.test.js
// Spec #7 单测：vendor-stall petition / 商队订木 / black-market event。
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SPEC7_BALANCE } from '../../js/game/balance-vendor.js';
import {
  maybeSpawnVendorStallPetition,
  acceptVendorStallFixed,
  acceptVendorStallTax,
  rejectVendorStallPetition,
  tryCaravanWoodOrder,
  expireStalePetitions,
} from '../../js/game/petitions.js';
import {
  maybeSpawnBlackMarketEvent,
  resolveEventChoice,
  expireStaleEvents,
} from '../../js/game/events.js';
import { makeFakeState, makeBuiltIncensePlot, makeBuiltInnPlot, registerBuildings } from './_helpers.js';

// ---------- vendor-stall petition ----------

test('vendor-stall: skipped when fame < threshold', () => {
  const s = makeFakeState({ day: 10, stats: { fame: 5 } });
  const pet = maybeSpawnVendorStallPetition(s);
  assert.equal(pet, null);
});

test('vendor-stall: triggers when fame >= 10 + intervalDays passed', () => {
  const s = makeFakeState({ day: 10, lastVendorStallDay: 0, stats: { fame: 15 } });
  const pet = maybeSpawnVendorStallPetition(s);
  assert.ok(pet);
  assert.equal(pet.kind, 'vendor-stall');
  assert.equal(pet.sourceGate, 'E');
  assert.equal(s.lastVendorStallDay, 10);
});

test('vendor-stall: skipped within intervalDays', () => {
  const s = makeFakeState({ day: 10, lastVendorStallDay: 6, stats: { fame: 15 } });
  const pet = maybeSpawnVendorStallPetition(s);
  assert.equal(pet, null);
});

test('acceptVendorStallFixed: prosperity/congestion/fame deltas + unlock', () => {
  const s = makeFakeState({ stats: { prosperity: 0, congestion: 0, fame: 12 } });
  const pet = { id: 'p1', kind: 'vendor-stall', resolved: false };
  const ok = acceptVendorStallFixed(s, pet);
  assert.equal(ok, true);
  assert.equal(s.stats.prosperity, SPEC7_BALANCE.vendorStall.fixedProsperityGain);
  assert.equal(s.stats.congestion, SPEC7_BALANCE.vendorStall.fixedCongestionDelta);
  assert.equal(s.stats.fame, 12 + SPEC7_BALANCE.vendorStall.fixedFameGain);
  assert.equal(s.hudUnlocked.prosperity, true);
  assert.equal(pet.outcome, 'accepted-fixed');
});

test('acceptVendorStallTax: money up + prosperity + morale -2', () => {
  const s = makeFakeState({ stats: { money: 100, prosperity: 0, morale: 50 } });
  const pet = { id: 'p1', kind: 'vendor-stall', resolved: false };
  const ok = acceptVendorStallTax(s, pet);
  assert.equal(ok, true);
  assert.equal(s.stats.money, 100 + SPEC7_BALANCE.vendorStall.taxMoneyGain);
  assert.equal(s.stats.prosperity, SPEC7_BALANCE.vendorStall.taxProsperityGain);
  assert.equal(s.stats.morale, 50 + SPEC7_BALANCE.vendorStall.taxMoraleDelta);
  assert.equal(pet.outcome, 'accepted-tax');
});

test('rejectVendorStallPetition: gov +2', () => {
  const s = makeFakeState({ stats: { gov: 30 } });
  const pet = { id: 'p1', kind: 'vendor-stall', resolved: false };
  const ok = rejectVendorStallPetition(s, pet);
  assert.equal(ok, true);
  assert.equal(s.stats.gov, 30 + SPEC7_BALANCE.vendorStall.rejectGovDelta);
  assert.equal(pet.outcome, 'rejected');
});

test('expireStalePetitions: vendor-stall expire morale -1', () => {
  const s = makeFakeState({ day: 20, stats: { morale: 50 } });
  s.petitions = [{ id: 'p1', kind: 'vendor-stall', sourceGate: 'E', expiresOnDay: 18, resolved: false }];
  expireStalePetitions(s, () => {});
  assert.equal(s.petitions[0].resolved, true);
  assert.equal(s.petitions[0].outcome, 'expired');
  assert.equal(s.stats.morale, 50 + SPEC7_BALANCE.vendorStall.expireMoraleDelta);
});

// ---------- caravan wood order ----------

test('tryCaravanWoodOrder: fails when no incense/inn', () => {
  const s = makeFakeState({ stats: { money: 100, wood: 5 } });
  const ok = tryCaravanWoodOrder(s);
  assert.equal(ok, false);
  assert.equal(s.stats.wood, 5);
});

test('tryCaravanWoodOrder: success with incense built', () => {
  const s = makeFakeState({ stats: { money: 100, wood: 5 } });
  s.plots = [makeBuiltIncensePlot('1')];
  registerBuildings(s, s.plots);
  const ok = tryCaravanWoodOrder(s);
  assert.equal(ok, true);
  assert.equal(s.stats.money, 100 - SPEC7_BALANCE.caravan.moneyPerWood);
  assert.equal(s.stats.wood, 6);
  assert.equal(s.caravanOrders, 1);
});

test('tryCaravanWoodOrder: success with inn built', () => {
  const s = makeFakeState({ stats: { money: 100, wood: 5 } });
  s.plots = [makeBuiltInnPlot('1')];
  registerBuildings(s, s.plots);
  const ok = tryCaravanWoodOrder(s);
  assert.equal(ok, true);
  assert.equal(s.stats.wood, 6);
});

test('tryCaravanWoodOrder: fails when not enough money', () => {
  const s = makeFakeState({ stats: { money: 2, wood: 5 } });
  s.plots = [makeBuiltIncensePlot('1')];
  registerBuildings(s, s.plots);
  const ok = tryCaravanWoodOrder(s);
  assert.equal(ok, false);
  assert.equal(s.stats.money, 2);
  assert.equal(s.stats.wood, 5);
});

// ---------- black-market event ----------

test('maybeSpawnBlackMarketEvent: gated by lanternFestivalDone', () => {
  const s = makeFakeState({ day: 50, stats: { prosperity: 50, fame: 60 }, lanternFestivalDone: false, lastLanternDay: 30 });
  const evt = maybeSpawnBlackMarketEvent(s);
  assert.equal(evt, null);
});

test('maybeSpawnBlackMarketEvent: gated by prosperity', () => {
  const s = makeFakeState({ day: 50, stats: { prosperity: 10, fame: 60 }, lanternFestivalDone: true, lastLanternDay: 30 });
  const evt = maybeSpawnBlackMarketEvent(s);
  assert.equal(evt, null);
});

test('maybeSpawnBlackMarketEvent: gated by fame', () => {
  const s = makeFakeState({ day: 50, stats: { prosperity: 50, fame: 30 }, lanternFestivalDone: true, lastLanternDay: 30 });
  const evt = maybeSpawnBlackMarketEvent(s);
  assert.equal(evt, null);
});

test('maybeSpawnBlackMarketEvent: gated by daysAfterLantern', () => {
  const s = makeFakeState({ day: 33, stats: { prosperity: 50, fame: 60 }, lanternFestivalDone: true, lastLanternDay: 30 });
  const evt = maybeSpawnBlackMarketEvent(s);
  assert.equal(evt, null);
});

test('maybeSpawnBlackMarketEvent: triggers when all conditions met', () => {
  const s = makeFakeState({ day: 45, stats: { prosperity: 50, fame: 60 }, lanternFestivalDone: true, lastLanternDay: 30 });
  const evt = maybeSpawnBlackMarketEvent(s);
  assert.ok(evt);
  assert.equal(evt.kind, 'black-market');
  assert.equal(evt.choices.length, 4);
});

test('maybeSpawnBlackMarketEvent: skipped when blackMarketDone', () => {
  const s = makeFakeState({ day: 45, stats: { prosperity: 50, fame: 60 }, lanternFestivalDone: true, lastLanternDay: 30, blackMarketDone: true });
  const evt = maybeSpawnBlackMarketEvent(s);
  assert.equal(evt, null);
});

test('resolveEventChoice black-market suppress: gov +10, prosperity -15', () => {
  const s = makeFakeState({ stats: { gov: 40, prosperity: 50, fame: 60, money: 100 } });
  const evt = { id: 'evt-1', kind: 'black-market', choices: [
    { id: 'suppress', effects: { gov: 10, prosperity: -15, fame: -3 } },
  ], resolved: false };
  s.events.push(evt);
  resolveEventChoice(s, evt, 'suppress', () => {});
  assert.equal(s.stats.gov, 50);
  assert.equal(s.stats.prosperity, 35);
  assert.equal(s.stats.fame, 57);
  assert.equal(s.blackMarketDone, true);
});

test('expireStaleEvents black-market: gov -8 fame -5 done=true', () => {
  const s = makeFakeState({ day: 50, stats: { gov: 40, fame: 60 } });
  s.events.push({ id: 'evt-1', kind: 'black-market', expiresOnDay: 48, resolved: false });
  expireStaleEvents(s, () => {});
  assert.equal(s.events[0].resolved, true);
  assert.equal(s.events[0].outcome, 'expired');
  assert.equal(s.stats.gov, 40 + SPEC7_BALANCE.blackMarket.expireGovDelta);
  assert.equal(s.stats.fame, 60 + SPEC7_BALANCE.blackMarket.expireFameDelta);
  assert.equal(s.blackMarketDone, true);
});
