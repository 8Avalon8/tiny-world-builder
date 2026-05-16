// test/noble.test.js
// Spec #6 单测：达官线 noble-steward petition / mansion catalog / vendor-restriction / scandal。
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SPEC6_BALANCE } from '../../js/game/balance-noble.js';
import { BUILDING_CATALOG } from '../../js/game/buildings.js';
import {
  maybeSpawnNobleStewardPetition,
  acceptNobleStewardPetition,
  rejectNobleStewardPetition,
  expireStalePetitions,
} from '../../js/game/petitions.js';
import {
  maybeSpawnVendorRestrictionEvent,
  maybeSpawnScandalEvent,
  resolveEventChoice,
  expireStaleEvents,
} from '../../js/game/events.js';
import { makeFakeState } from './_helpers.js';

// ---------- maybeSpawnNobleStewardPetition ----------

// slice-4 改造：spawn 改用 nobleStewardEligible（templeFestival grand 设置）。
// accept 不再立即 nobleAccepted=true，而是创建 noble-steward-host 承诺。
// 拒绝/过期 → 重置 nobleStewardEligible，须再办法会 grand。

test('maybeSpawnNobleStewardPetition: 不 eligible → 不 spawn（fame 高也不 spawn）', () => {
  const s = makeFakeState({ day: 20, stats: { fame: 50 }, nobleStewardEligible: false });
  const pet = maybeSpawnNobleStewardPetition(s);
  assert.equal(pet, null);
});

test('maybeSpawnNobleStewardPetition: eligible → spawn', () => {
  const s = makeFakeState({ day: 12, nobleStewardEligible: true });
  const pet = maybeSpawnNobleStewardPetition(s);
  assert.ok(pet);
  assert.equal(pet.kind, 'noble-steward');
  assert.equal(pet.sourceGate, SPEC6_BALANCE.steward.sourceGate);
  assert.equal(pet.expiresOnDay, 12 + SPEC6_BALANCE.steward.expireDays);
});

test('maybeSpawnNobleStewardPetition: 已有未结 petition → 不重复', () => {
  const s = makeFakeState({ day: 12, nobleStewardEligible: true });
  s.petitions.push({ id: 'p1', kind: 'noble-steward', resolved: false, expiresOnDay: 99 });
  const pet = maybeSpawnNobleStewardPetition(s);
  assert.equal(pet, null);
});

test('maybeSpawnNobleStewardPetition: 已有未结 host 承诺 → 不重复', () => {
  const s = makeFakeState({ day: 12, nobleStewardEligible: true });
  s.promises.push({ id: 'pr1', kind: 'noble-steward-host', resolved: false });
  const pet = maybeSpawnNobleStewardPetition(s);
  assert.equal(pet, null);
});

test('maybeSpawnNobleStewardPetition: nobleAccepted=true → 不再 spawn', () => {
  const s = makeFakeState({ day: 30, nobleAccepted: true, nobleStewardEligible: true });
  const pet = maybeSpawnNobleStewardPetition(s);
  assert.equal(pet, null);
});

// ---------- accept / reject noble-steward ----------

test('acceptNobleStewardPetition: 创建 noble-steward-host 承诺，不立即 nobleAccepted=true', () => {
  const s = makeFakeState();
  const pet = { id: 'pet-001', kind: 'noble-steward', count: 1, sourceGate: 'N', resolved: false };
  s.petitions.push(pet);
  const ok = acceptNobleStewardPetition(s, pet);
  assert.equal(ok, true);
  assert.equal(pet.resolved, true);
  assert.equal(pet.outcome, 'accepted');
  assert.equal(s.nobleAccepted, false);  // 关键：未立刻 unlock
  assert.equal(s.promises.length, 1);
  assert.equal(s.promises[0].kind, 'noble-steward-host');
});

test('rejectNobleStewardPetition: gov/fame 扣 + 重置 nobleStewardEligible', () => {
  const s = makeFakeState({ stats: { gov: 50, fame: 30 }, nobleStewardEligible: true });
  const pet = { id: 'pet-001', kind: 'noble-steward', count: 1, sourceGate: 'N', resolved: false };
  const ok = rejectNobleStewardPetition(s, pet);
  assert.equal(ok, true);
  assert.equal(pet.outcome, 'rejected');
  assert.equal(s.stats.gov, 50 + SPEC6_BALANCE.steward.rejectGovDelta);
  assert.equal(s.stats.fame, 30 + SPEC6_BALANCE.steward.rejectFameDelta);
  assert.equal(s.nobleStewardEligible, false);
});

test('expireStalePetitions: noble-steward 过期 → gov -3 + 重置 eligible', () => {
  const s = makeFakeState({ day: 10, stats: { gov: 40 }, nobleStewardEligible: true });
  s.petitions = [{
    id: 'pet-001', kind: 'noble-steward', count: 1, sourceGate: 'N',
    bornAtDay: 5, expiresOnDay: 9, resolved: false, outcome: null,
  }];
  expireStalePetitions(s, () => {});
  assert.equal(s.petitions[0].resolved, true);
  assert.equal(s.petitions[0].outcome, 'expired');
  assert.equal(s.stats.gov, 40 + SPEC6_BALANCE.steward.expireGovDelta);
  assert.equal(s.nobleStewardEligible, false);
});

// ---------- mansion catalog filtering ----------

test('mansion catalog has requiredQuadrant=NE and requiresUnlock=nobleAccepted', () => {
  const m = BUILDING_CATALOG.mansion;
  assert.ok(m);
  assert.equal(m.requiredQuadrant, 'NE');
  assert.equal(m.requiresUnlock, 'nobleAccepted');
  assert.equal(m.size.w, 2);
  assert.equal(m.size.h, 2);
});

test('mansion catalog filtering: hidden when nobleAccepted=false', () => {
  const s = makeFakeState({ nobleAccepted: false });
  // simulate openPlotPanel filter chain on a NE 2x2 plot
  const plot = { quadrant: 'NE', size: { w: 2, h: 2 } };
  const matches = Object.entries(BUILDING_CATALOG)
    .filter(([_, b]) => b.size.w === plot.size.w && b.size.h === plot.size.h)
    .filter(([_, b]) => !b.requiredQuadrant || b.requiredQuadrant === plot.quadrant)
    .filter(([_, b]) => !b.requiresUnlock || s[b.requiresUnlock] === true);
  assert.equal(matches.find(([t]) => t === 'mansion'), undefined);
});

test('mansion catalog filtering: visible when nobleAccepted=true on NE plot', () => {
  const s = makeFakeState({ nobleAccepted: true });
  const plot = { quadrant: 'NE', size: { w: 2, h: 2 } };
  const matches = Object.entries(BUILDING_CATALOG)
    .filter(([_, b]) => b.size.w === plot.size.w && b.size.h === plot.size.h)
    .filter(([_, b]) => !b.requiredQuadrant || b.requiredQuadrant === plot.quadrant)
    .filter(([_, b]) => !b.requiresUnlock || s[b.requiresUnlock] === true);
  assert.ok(matches.find(([t]) => t === 'mansion'));
});

test('mansion catalog filtering: hidden on non-NE plot even if nobleAccepted', () => {
  const s = makeFakeState({ nobleAccepted: true });
  const plot = { quadrant: 'SW', size: { w: 2, h: 2 } };
  const matches = Object.entries(BUILDING_CATALOG)
    .filter(([_, b]) => b.size.w === plot.size.w && b.size.h === plot.size.h)
    .filter(([_, b]) => !b.requiredQuadrant || b.requiredQuadrant === plot.quadrant)
    .filter(([_, b]) => !b.requiresUnlock || s[b.requiresUnlock] === true);
  assert.equal(matches.find(([t]) => t === 'mansion'), undefined);
});

// ---------- vendor-restriction event ----------

test('maybeSpawnVendorRestrictionEvent skipped when mansion not built', () => {
  const s = makeFakeState({ day: 20, mansionBuiltOnDay: 0 });
  const evt = maybeSpawnVendorRestrictionEvent(s);
  assert.equal(evt, null);
});

test('maybeSpawnVendorRestrictionEvent skipped within 5 days after mansion', () => {
  const s = makeFakeState({ day: 13, mansionBuiltOnDay: 10 });
  // 13 - 10 = 3 < 5
  const evt = maybeSpawnVendorRestrictionEvent(s);
  assert.equal(evt, null);
});

test('maybeSpawnVendorRestrictionEvent triggers 5 days after mansion', () => {
  const s = makeFakeState({ day: 15, mansionBuiltOnDay: 10 });
  const evt = maybeSpawnVendorRestrictionEvent(s);
  assert.ok(evt);
  assert.equal(evt.kind, 'vendor-restriction');
  assert.equal(evt.choices.length, 2);
});

test('maybeSpawnVendorRestrictionEvent skipped when already done', () => {
  const s = makeFakeState({ day: 20, mansionBuiltOnDay: 10, vendorRestrictionDone: true });
  const evt = maybeSpawnVendorRestrictionEvent(s);
  assert.equal(evt, null);
});

test('vendor-restriction accept: gov+5, prosperity-5, morale-3 + done flag', () => {
  const s = makeFakeState({
    day: 15, mansionBuiltOnDay: 10,
    stats: { gov: 50, prosperity: 10, morale: 50 },
  });
  const evt = maybeSpawnVendorRestrictionEvent(s);
  assert.ok(evt);
  const ok = resolveEventChoice(s, evt, 'accept', () => {});
  assert.equal(ok, true);
  assert.equal(s.stats.gov, 55);
  assert.equal(s.stats.prosperity, 5);
  assert.equal(s.stats.morale, 47);
  assert.equal(s.vendorRestrictionDone, true);
});

test('vendor-restriction reject: gov-8, morale+2 + done flag', () => {
  const s = makeFakeState({
    day: 15, mansionBuiltOnDay: 10,
    stats: { gov: 50, morale: 50 },
  });
  const evt = maybeSpawnVendorRestrictionEvent(s);
  const ok = resolveEventChoice(s, evt, 'reject', () => {});
  assert.equal(ok, true);
  assert.equal(s.stats.gov, 42);
  assert.equal(s.stats.morale, 52);
  assert.equal(s.vendorRestrictionDone, true);
});

test('vendor-restriction expire: morale -2 + done flag', () => {
  const s = makeFakeState({
    day: 15, mansionBuiltOnDay: 10,
    stats: { morale: 50 },
  });
  const evt = maybeSpawnVendorRestrictionEvent(s);
  s.day = evt.expiresOnDay + 1;
  expireStaleEvents(s, () => {});
  assert.equal(evt.resolved, true);
  assert.equal(evt.outcome, 'expired');
  assert.equal(s.stats.morale, 50 + SPEC6_BALANCE.vendorRestriction.expireMoraleDelta);
  assert.equal(s.vendorRestrictionDone, true);
});

// ---------- scandal event ----------

test('maybeSpawnScandalEvent skipped when mansion not built', () => {
  const s = makeFakeState({ day: 30, mansionBuiltOnDay: 0 });
  const evt = maybeSpawnScandalEvent(s);
  assert.equal(evt, null);
});

test('maybeSpawnScandalEvent skipped within 15 days after mansion', () => {
  const s = makeFakeState({ day: 20, mansionBuiltOnDay: 10 });
  const evt = maybeSpawnScandalEvent(s);
  assert.equal(evt, null);
});

test('maybeSpawnScandalEvent triggers 15 days after mansion + 4 choices', () => {
  const s = makeFakeState({ day: 25, mansionBuiltOnDay: 10 });
  const evt = maybeSpawnScandalEvent(s);
  assert.ok(evt);
  assert.equal(evt.kind, 'scandal');
  assert.equal(evt.choices.length, 4);
  const ids = evt.choices.map(c => c.id).sort();
  assert.deepEqual(ids, ['protect', 'sacrifice', 'sneak', 'surrender']);
});

test('scandal protect: gov-15, fame+10', () => {
  const s = makeFakeState({
    day: 25, mansionBuiltOnDay: 10,
    stats: { gov: 50, fame: 30 },
  });
  const evt = maybeSpawnScandalEvent(s);
  resolveEventChoice(s, evt, 'protect', () => {});
  assert.equal(s.stats.gov, 35);
  assert.equal(s.stats.fame, 40);
  assert.equal(s.scandalDone, true);
});

test('scandal surrender: gov+10, fame-10', () => {
  const s = makeFakeState({
    day: 25, mansionBuiltOnDay: 10,
    stats: { gov: 50, fame: 30 },
  });
  const evt = maybeSpawnScandalEvent(s);
  resolveEventChoice(s, evt, 'surrender', () => {});
  assert.equal(s.stats.gov, 60);
  assert.equal(s.stats.fame, 20);
  assert.equal(s.scandalDone, true);
});

test('scandal sneak: fame-5, morale+5', () => {
  const s = makeFakeState({
    day: 25, mansionBuiltOnDay: 10,
    stats: { gov: 50, fame: 30, morale: 50 },
  });
  const evt = maybeSpawnScandalEvent(s);
  resolveEventChoice(s, evt, 'sneak', () => {});
  assert.equal(s.stats.gov, 50);
  assert.equal(s.stats.fame, 25);
  assert.equal(s.stats.morale, 55);
  assert.equal(s.scandalDone, true);
});

test('scandal sacrifice: gov+20, morale-15', () => {
  const s = makeFakeState({
    day: 25, mansionBuiltOnDay: 10,
    stats: { gov: 50, morale: 50 },
  });
  const evt = maybeSpawnScandalEvent(s);
  resolveEventChoice(s, evt, 'sacrifice', () => {});
  assert.equal(s.stats.gov, 70);
  assert.equal(s.stats.morale, 35);
  assert.equal(s.scandalDone, true);
});

test('scandal expire: gov -10, fame -5 + done flag', () => {
  const s = makeFakeState({
    day: 25, mansionBuiltOnDay: 10,
    stats: { gov: 50, fame: 30 },
  });
  const evt = maybeSpawnScandalEvent(s);
  s.day = evt.expiresOnDay + 1;
  expireStaleEvents(s, () => {});
  assert.equal(evt.resolved, true);
  assert.equal(evt.outcome, 'expired');
  assert.equal(s.stats.gov, 50 + SPEC6_BALANCE.scandal.expireGovDelta);
  assert.equal(s.stats.fame, 30 + SPEC6_BALANCE.scandal.expireFameDelta);
  assert.equal(s.scandalDone, true);
});
