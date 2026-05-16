// test/temple.test.js
// Spec #5 单测：寺庙线 pilgrim petition / ritual / lantern-festival。
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SPEC5_BALANCE } from '../../js/game/balance-temple.js';
import {
  maybeSpawnPilgrimPetition,
  acceptPilgrimPetition,
  rejectPilgrimPetition,
  expireStalePetitions,
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
  makeBuiltInnPlot,
  makeBuiltIncensePlot,
  registerBuildings,
} from './_helpers.js';

// ---------- maybeSpawnPilgrimPetition ----------

test('maybeSpawnPilgrimPetition skipped when temple not refurbished', () => {
  const s = makeFakeState({ day: 10, templeRefurbished: false });
  const pet = maybeSpawnPilgrimPetition(s);
  assert.equal(pet, null);
  assert.equal(s.petitions.length, 0);
});

test('maybeSpawnPilgrimPetition triggers when refurbished + intervalDays passed', () => {
  const s = makeFakeState({ day: 10, templeRefurbished: true, lastPilgrimDay: 0 });
  const pet = maybeSpawnPilgrimPetition(s);
  assert.ok(pet);
  assert.equal(pet.kind, 'pilgrim');
  assert.equal(pet.count, SPEC5_BALANCE.pilgrim.partySize);
  assert.equal(pet.sourceGate, 'W');
  assert.equal(s.lastPilgrimDay, 10);
  assert.equal(s.petitions.length, 1);
});

test('maybeSpawnPilgrimPetition skipped within cooldown', () => {
  const s = makeFakeState({ day: 3, templeRefurbished: true, lastPilgrimDay: 1 });
  // intervalDays = 4, 3 - 1 = 2 < 4
  const pet = maybeSpawnPilgrimPetition(s);
  assert.equal(pet, null);
});

// ---------- acceptPilgrimPetition ----------

function makePilgrim(id = 'pet-001') {
  return {
    id, kind: 'pilgrim',
    count: SPEC5_BALANCE.pilgrim.partySize,
    sourceGate: 'W',
    bornAtDay: 1,
    expiresOnDay: 4,
    resolved: false,
    outcome: null,
  };
}

test('acceptPilgrimPetition basic accept fails when no houses', () => {
  const s = makeFakeState();
  s.plots = [makeBuiltIncensePlot('1')];
  registerBuildings(s, s.plots);
  const pet = makePilgrim();
  s.petitions.push(pet);
  const ok = acceptPilgrimPetition(s, pet, { warm: false });
  assert.equal(ok, false);
  assert.equal(pet.resolved, false);
});

test('acceptPilgrimPetition basic accept fails when no inn/incense', () => {
  const s = makeFakeState();
  s.plots = [makeBuiltHousePlot('1')];
  registerBuildings(s, s.plots);
  const pet = makePilgrim();
  s.petitions.push(pet);
  const ok = acceptPilgrimPetition(s, pet, { warm: false });
  assert.equal(ok, false);
  assert.equal(pet.resolved, false);
});

test('acceptPilgrimPetition warm accept fails when not enough cloth', () => {
  const s = makeFakeState({ stats: { cloth: 1 } });
  s.plots = [makeBuiltHousePlot('1'), makeBuiltIncensePlot('1')];
  registerBuildings(s, s.plots);
  const pet = makePilgrim();
  s.petitions.push(pet);
  const ok = acceptPilgrimPetition(s, pet, { warm: true });
  assert.equal(ok, false);
  assert.equal(pet.resolved, false);
  assert.equal(s.stats.cloth, 1);
});

test('acceptPilgrimPetition basic success: money/fame gain', () => {
  const s = makeFakeState({ stats: { money: 100, fame: 20 } });
  s.plots = [makeBuiltHousePlot('1'), makeBuiltIncensePlot('1')];
  registerBuildings(s, s.plots);
  const pet = makePilgrim();
  s.petitions.push(pet);
  const ok = acceptPilgrimPetition(s, pet, { warm: false });
  assert.equal(ok, true);
  assert.equal(pet.resolved, true);
  assert.equal(pet.outcome, 'accepted');
  assert.equal(s.stats.money, 100 + SPEC5_BALANCE.pilgrim.basicMoneyGain);
  assert.equal(s.stats.fame, 20 + SPEC5_BALANCE.pilgrim.basicFameGain);
});

test('acceptPilgrimPetition warm success: cloth deduction + bigger fame', () => {
  const s = makeFakeState({ stats: { money: 100, fame: 20, cloth: 5 } });
  s.plots = [makeBuiltHousePlot('1'), makeBuiltInnPlot('1')];
  registerBuildings(s, s.plots);
  const pet = makePilgrim();
  s.petitions.push(pet);
  const ok = acceptPilgrimPetition(s, pet, { warm: true });
  assert.equal(ok, true);
  assert.equal(pet.outcome, 'accepted-warm');
  assert.equal(s.stats.cloth, 5 - SPEC5_BALANCE.pilgrim.warmClothCost);
  assert.equal(s.stats.money, 100 + SPEC5_BALANCE.pilgrim.warmMoneyGain);
  assert.equal(s.stats.fame, 20 + SPEC5_BALANCE.pilgrim.warmFameGain);
});

test('rejectPilgrimPetition: morale loss', () => {
  const s = makeFakeState({ stats: { morale: 50 } });
  const pet = makePilgrim();
  s.petitions.push(pet);
  const ok = rejectPilgrimPetition(s, pet);
  assert.equal(ok, true);
  assert.equal(pet.outcome, 'rejected');
  assert.equal(s.stats.morale, 50 + SPEC5_BALANCE.pilgrim.rejectMoraleDelta);
});

test('expireStalePetitions: pilgrim expires with morale -1', () => {
  const s = makeFakeState({ day: 10, stats: { morale: 50 } });
  s.petitions = [{
    id: 'pet-001', kind: 'pilgrim', count: 3, sourceGate: 'W',
    bornAtDay: 5, expiresOnDay: 8, resolved: false, outcome: null,
  }];
  expireStalePetitions(s, () => {});
  assert.equal(s.petitions[0].resolved, true);
  assert.equal(s.petitions[0].outcome, 'expired');
  assert.equal(s.stats.morale, 50 + SPEC5_BALANCE.pilgrim.expireMoraleDelta);
});

// ---------- maybeSpawnRitualEvent ----------

test('maybeSpawnRitualEvent skipped when fame < 30', () => {
  const s = makeFakeState({ day: 10, templeRefurbished: true, stats: { fame: 20 } });
  const evt = maybeSpawnRitualEvent(s);
  assert.equal(evt, null);
});

test('maybeSpawnRitualEvent triggered when refurbished + fame>=30 + intervalDays', () => {
  const s = makeFakeState({ day: 10, templeRefurbished: true, lastRitualDay: 0, stats: { fame: 35 } });
  const evt = maybeSpawnRitualEvent(s);
  assert.ok(evt);
  assert.equal(evt.kind, 'ritual');
  assert.equal(evt.choices.length, 3);
  assert.equal(s.lastRitualDay, 10);
});

test('maybeSpawnRitualEvent skipped when lanternFestivalDone', () => {
  const s = makeFakeState({
    day: 10, templeRefurbished: true, lanternFestivalDone: true,
    stats: { fame: 90 },
  });
  const evt = maybeSpawnRitualEvent(s);
  assert.equal(evt, null);
});

test('maybeSpawnRitualEvent skipped when temple not refurbished', () => {
  const s = makeFakeState({ day: 10, templeRefurbished: false, stats: { fame: 35 } });
  const evt = maybeSpawnRitualEvent(s);
  assert.equal(evt, null);
});

// ---------- maybeSpawnLanternFestivalEvent ----------

test('maybeSpawnLanternFestivalEvent triggered when fame>=60 + refurbished + not done', () => {
  const s = makeFakeState({
    day: 30, templeRefurbished: true, lanternFestivalDone: false,
    stats: { fame: 65 },
  });
  const evt = maybeSpawnLanternFestivalEvent(s);
  assert.ok(evt);
  assert.equal(evt.kind, 'lantern-festival');
  assert.equal(evt.choices.length, 2);
});

test('maybeSpawnLanternFestivalEvent skipped if already done', () => {
  const s = makeFakeState({
    day: 30, templeRefurbished: true, lanternFestivalDone: true,
    stats: { fame: 90 },
  });
  const evt = maybeSpawnLanternFestivalEvent(s);
  assert.equal(evt, null);
});

test('maybeSpawnLanternFestivalEvent skipped when fame < 60', () => {
  const s = makeFakeState({
    day: 30, templeRefurbished: true, lanternFestivalDone: false,
    stats: { fame: 50 },
  });
  const evt = maybeSpawnLanternFestivalEvent(s);
  assert.equal(evt, null);
});

// ---------- resolveEventChoice for lantern-festival ----------

test("resolveEventChoice lantern-festival 'host' sets lanternFestivalDone + passiveMoneyBonus", () => {
  const s = makeFakeState({
    stats: { money: 100, cloth: 50, guards: 3, fame: 65 },
    guardAssignments: { patrol: 0 },
  });
  const evt = maybeSpawnLanternFestivalEvent(Object.assign(s, { templeRefurbished: true, day: 30 }));
  assert.ok(evt);
  const ok = resolveEventChoice(s, evt, 'host', () => {});
  assert.equal(ok, true);
  assert.equal(s.lanternFestivalDone, true);
  assert.equal(s.passiveMoneyBonus, SPEC5_BALANCE.lanternFestival.successPassiveMoneyBonus);
  assert.equal(s.stats.fame, 65 + SPEC5_BALANCE.lanternFestival.successFameGain);
  assert.equal(s.stats.money, 100 - SPEC5_BALANCE.lanternFestival.moneyCost);
  assert.equal(s.stats.cloth, 50 - SPEC5_BALANCE.lanternFestival.clothCost);
});

// ---------- expireStaleEvents for ritual + lantern ----------

test('expireStaleEvents ritual: fame loss; lantern: bigger fame loss', () => {
  const s = makeFakeState({ day: 20, stats: { fame: 50 } });
  s.events = [
    { id: 'r1', kind: 'ritual', bornAtDay: 10, expiresOnDay: 12, resolved: false, outcome: null, choices: [] },
    { id: 'l1', kind: 'lantern-festival', bornAtDay: 10, expiresOnDay: 13, resolved: false, outcome: null, choices: [] },
  ];
  expireStaleEvents(s, () => {});
  assert.equal(s.events[0].resolved, true);
  assert.equal(s.events[0].outcome, 'expired');
  assert.equal(s.events[1].resolved, true);
  // ritual: -2, lantern: -15
  assert.equal(
    s.stats.fame,
    50 + SPEC5_BALANCE.ritual.skipFameDelta + SPEC5_BALANCE.lanternFestival.expireFameDelta
  );
});
