// test/scenario_noble.test.js
// Spec #6 端到端场景：达官线完整流程模拟。
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SPEC6_BALANCE } from '../../js/game/balance-noble.js';
import {
  maybeSpawnNobleStewardPetition,
  acceptNobleStewardPetition,
  rejectNobleStewardPetition,
} from '../../js/game/petitions.js';
import {
  maybeSpawnVendorRestrictionEvent,
  maybeSpawnScandalEvent,
  resolveEventChoice,
  expireStaleEvents,
} from '../../js/game/events.js';
import { makeFakeState } from './_helpers.js';

test('scenario: noble accept → mansion built → vendor-restriction at +5 → scandal at +15', () => {
  const s = makeFakeState({
    day: 20,
    stats: { money: 200, cloth: 20, wood: 30, labor: 10, fame: 25, gov: 50, morale: 55, prosperity: 0 },
    nobleStewardEligible: true,  // slice-4: 假设法会 grand 已设
  });

  // Step 1：noble petition
  const pet = maybeSpawnNobleStewardPetition(s);
  assert.ok(pet, 'noble petition should spawn');
  assert.equal(pet.kind, 'noble-steward');

  // Step 2：accept（slice-4 现在创建承诺，不立即 nobleAccepted）
  const ok = acceptNobleStewardPetition(s, pet);
  assert.equal(ok, true);
  // 直接置 nobleAccepted 模拟承诺成功结算（绕过空间约束以聚焦下游事件链测试）
  s.nobleAccepted = true;

  // Step 3：mansion 建成（手动设标记，模拟 completeProject）
  s.mansionBuiltOnDay = s.day;

  // Step 4：5 天内 vendor-restriction 不触发
  const before5 = maybeSpawnVendorRestrictionEvent(s);
  assert.equal(before5, null);

  // Step 5：跳到 day + 5
  s.day += 5;
  const vendor = maybeSpawnVendorRestrictionEvent(s);
  assert.ok(vendor, 'vendor-restriction should spawn at +5 days');
  assert.equal(vendor.kind, 'vendor-restriction');

  // Step 6：选「accept」清街 → gov+5 prosperity-5 morale-3
  const govBefore = s.stats.gov;
  const proBefore = s.stats.prosperity;
  const morBefore = s.stats.morale;
  const r = resolveEventChoice(s, vendor, 'accept', () => {});
  assert.equal(r, true);
  assert.equal(s.vendorRestrictionDone, true);
  assert.equal(s.stats.gov, govBefore + 5);
  assert.equal(s.stats.prosperity, proBefore - 5);
  assert.equal(s.stats.morale, morBefore - 3);

  // Step 7：跳到 day + 15（mansion +15）
  s.day = s.mansionBuiltOnDay + 15;
  const scandal = maybeSpawnScandalEvent(s);
  assert.ok(scandal, 'scandal should spawn at +15 days');
  assert.equal(scandal.kind, 'scandal');
  assert.equal(scandal.choices.length, 4);

  // Step 8：选「保护达官」→ gov-15, fame+10
  const govB = s.stats.gov;
  const fameB = s.stats.fame;
  resolveEventChoice(s, scandal, 'protect', () => {});
  assert.equal(s.scandalDone, true);
  assert.equal(s.stats.gov, govB - 15);
  assert.equal(s.stats.fame, fameB + 10);
});

test('scenario: reject noble → gov/fame loss + 重置 eligible（须再办法会）', () => {
  const s = makeFakeState({
    day: 20,
    stats: { fame: 25, gov: 50, morale: 55 },
    nobleStewardEligible: true,
  });
  const pet = maybeSpawnNobleStewardPetition(s);
  assert.ok(pet);

  const govBefore = s.stats.gov;
  const fameBefore = s.stats.fame;
  rejectNobleStewardPetition(s, pet);
  assert.equal(s.stats.gov, govBefore + SPEC6_BALANCE.steward.rejectGovDelta);
  assert.equal(s.stats.fame, fameBefore + SPEC6_BALANCE.steward.rejectFameDelta);
  assert.equal(s.nobleAccepted, false);
  assert.equal(s.nobleStewardEligible, false, '拒绝后须重置 eligible');

  // slice-4: 拒绝后 eligible=false，不再 spawn——必须再办法会 grand
  s.day += 5;
  const pet2 = maybeSpawnNobleStewardPetition(s);
  assert.equal(pet2, null, '拒绝后无法再 spawn，须办法会 grand');

  // 模拟法会 grand 重新设 eligible
  s.nobleStewardEligible = true;
  const pet3 = maybeSpawnNobleStewardPetition(s);
  assert.ok(pet3, '法会 grand 后可再 spawn');
});

test('scenario: scandal expires → gov -10, fame -5, scandalDone set', () => {
  const s = makeFakeState({
    day: 100,
    stats: { fame: 30, gov: 40, morale: 55, money: 100 },
    nobleAccepted: true,
    mansionBuiltOnDay: 80,
  });

  const scandal = maybeSpawnScandalEvent(s);
  assert.ok(scandal);

  // 跳到过期日
  s.day = scandal.expiresOnDay + 1;
  const govBefore = s.stats.gov;
  const fameBefore = s.stats.fame;
  expireStaleEvents(s, () => {});
  assert.equal(scandal.resolved, true);
  assert.equal(scandal.outcome, 'expired');
  assert.equal(s.stats.gov, govBefore - 10);
  assert.equal(s.stats.fame, fameBefore - 5);
  assert.equal(s.scandalDone, true);
});
