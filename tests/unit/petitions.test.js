// test/petitions.test.js
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SPEC3_BALANCE } from '../../js/game/balance.js';
import {
  maybeSpawnNewcomerPetition,
  expireStalePetitions,
  acceptNewcomerPetition,
  rejectNewcomerPetition,
} from '../../js/game/petitions.js';
import { makeFakeState } from './_helpers.js';

test('maybeSpawnNewcomerPetition 第一批王氏织户无视冷却，已有户群后才受间隔限制', () => {
  const first = makeFakeState({ day: 3, lastNewcomerDay: 1 });
  const pet = maybeSpawnNewcomerPetition(first);
  assert.ok(pet);
  assert.equal(pet.kind, 'newcomer');
  assert.equal(first.groups[0].name, '王氏织户');

  const second = makeFakeState({
    day: 3, lastNewcomerDay: 1,
    groups: [{ id: 'grp-old', kind: 'weaverFamily', status: 'waiting-outside' }],
  });
  const skipped = maybeSpawnNewcomerPetition(second);
  assert.equal(skipped, null);
  assert.equal(second.petitions.length, 0);
});

test('maybeSpawnNewcomerPetition spawns when intervalDays elapsed', () => {
  const s = makeFakeState({ day: 4, lastNewcomerDay: 1 });
  const pet = maybeSpawnNewcomerPetition(s);
  assert.ok(pet);
  assert.equal(pet.kind, 'newcomer');
  assert.equal(pet.count, SPEC3_BALANCE.newcomer.partySize);
  assert.equal(pet.sourceGate, SPEC3_BALANCE.newcomer.sourceGate);
  assert.equal(pet.bornAtDay, 4);
  assert.equal(pet.expiresOnDay, 4 + SPEC3_BALANCE.newcomer.expireDays);
  assert.equal(pet.resolved, false);
  assert.equal(s.lastNewcomerDay, 4);
  assert.equal(s.petitions.length, 1);
});

test('maybeSpawnNewcomerPetition increments nextPetitionId', () => {
  const s = makeFakeState({ day: 4, lastNewcomerDay: 1, nextPetitionId: 5 });
  const pet = maybeSpawnNewcomerPetition(s);
  assert.equal(pet.id, 'pet-005');
  assert.equal(s.nextPetitionId, 6);
});

test('expireStalePetitions marks expired and deducts morale', () => {
  const s = makeFakeState({ day: 10 });
  s.petitions = [{ id: 'p1', kind: 'newcomer', count: 3, sourceGate: 'S', expiresOnDay: 8, resolved: false }];
  const beforeMorale = s.stats.morale;
  expireStalePetitions(s, () => {});
  assert.equal(s.petitions[0].resolved, true);
  assert.equal(s.petitions[0].outcome, 'expired');
  assert.equal(s.stats.morale, beforeMorale + SPEC3_BALANCE.newcomer.expireMoraleDelta);
});

test('expireStalePetitions does not touch unexpired', () => {
  const s = makeFakeState({ day: 5 });
  s.petitions = [{ id: 'p1', kind: 'newcomer', count: 3, sourceGate: 'S', expiresOnDay: 10, resolved: false }];
  expireStalePetitions(s, () => {});
  assert.equal(s.petitions[0].resolved, false);
});

test('expireStalePetitions trims resolved when > 10', () => {
  const s = makeFakeState({ day: 100 });
  s.petitions = [];
  for (let i = 0; i < 15; i++) {
    s.petitions.push({ id: `p${i}`, kind: 'newcomer', count: 3, sourceGate: 'S', expiresOnDay: 50, resolved: true, outcome: 'accepted' });
  }
  expireStalePetitions(s, () => {});
  assert.equal(s.petitions.length, 10);
});

// slice-1 改造：acceptNewcomerPetition 不再立即结算，而是创建一条「承诺」。
// 立即副作用只剩：扣安置费 moneyOnAccept、petition.resolved=true、push promise。

import { SLICE1_BALANCE } from '../../js/game/balance-promises.js';

test('acceptNewcomerPetition: 扣安置费 + 创建承诺，不变更人口', () => {
  const s = makeFakeState();
  s.promises = [];
  s.nextPromiseId = 1;
  const cfg = SLICE1_BALANCE.newcomerSettle;
  const beforePop = s.stats.population;
  const beforeMoney = s.stats.money;
  const beforeWood = s.stats.wood;
  const pet = { id: 'pet-001', kind: 'newcomer', count: 3, sourceGate: 'S', resolved: false };
  s.petitions.push(pet);
  const ok = acceptNewcomerPetition(s, pet);
  assert.equal(ok, true);
  assert.equal(s.stats.money, beforeMoney - cfg.moneyOnAccept);
  assert.equal(s.stats.population, beforePop);  // 关键：人口不变
  assert.equal(s.stats.wood, beforeWood);       // 关键：木料奖励不应提前到接纳时
  assert.equal(pet.resolved, true);
  assert.equal(pet.outcome, 'accepted');
  assert.equal(s.promises.length, 1);
  assert.equal(s.promises[0].kind, 'newcomer-settle');
  assert.equal(s.promises[0].sourceId, 'pet-001');
  assert.equal(s.promises[0].deadline, s.day + cfg.deadlineDays);
});

test('acceptNewcomerPetition: 钱粮不足 → 不创建承诺', () => {
  const s = makeFakeState({ stats: { money: 2 } });
  s.promises = [];
  const pet = { id: 'pet-002', kind: 'newcomer', count: 3, sourceGate: 'S', resolved: false };
  const ok = acceptNewcomerPetition(s, pet);
  assert.equal(ok, false);
  assert.equal(s.stats.money, 2);
  assert.equal(pet.resolved, false);
  assert.equal(s.promises.length, 0);
});

test('rejectNewcomerPetition deducts morale', () => {
  const s = makeFakeState();
  const pet = { id: 'p1', kind: 'newcomer', count: 3, sourceGate: 'S', resolved: false };
  const beforeMorale = s.stats.morale;
  const ok = rejectNewcomerPetition(s, pet);
  assert.equal(ok, true);
  assert.equal(s.stats.morale, beforeMorale + SPEC3_BALANCE.newcomer.rejectMoraleDelta);
  assert.equal(pet.outcome, 'rejected');
});

test('cannot accept already resolved petition', () => {
  const s = makeFakeState();
  s.promises = [];
  const pet = { id: 'p1', kind: 'newcomer', count: 3, sourceGate: 'S', resolved: true, outcome: 'expired' };
  const ok = acceptNewcomerPetition(s, pet);
  assert.equal(ok, false);
  assert.equal(s.promises.length, 0);
});
