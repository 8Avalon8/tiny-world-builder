// test/crossover_events.test.js
// slice-12: 多线交叉事件。

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeState } from './_helpers.js';
import {
  maybeSpawnLanternDonationEvent,
  maybeSpawnVendorNobleClashEvent,
  maybeSpawnTempleMediationEvent,
  resolveEventChoice,
} from '../../js/game/events.js';

test('maybeSpawnLanternDonationEvent: 达官 + 上元 + 香火路线触发捐灯', () => {
  const s = makeFakeState({
    day: 18,
    nobleAccepted: true,
    lanternFestivalDone: true,
    lanternDonationDone: false,
    stance: { faith: 55, power: 35, trade: 0, civil: 0 },
  });

  const evt = maybeSpawnLanternDonationEvent(s);

  assert.equal(evt.kind, 'lantern-donation');
  assert.equal(evt.choices.length, 3);
  assert.equal(s.events[0], evt);
});

test('maybeSpawnVendorNobleClashEvent: 商贸与权贵高时触发冲突', () => {
  const s = makeFakeState({
    day: 22,
    nobleAccepted: true,
    stats: { prosperity: 50, gov: 45 },
    stance: { trade: 55, power: 45, faith: 0, civil: 0 },
  });

  const evt = maybeSpawnVendorNobleClashEvent(s);

  assert.equal(evt.kind, 'vendor-noble-clash');
  assert.match(evt.title, /商贩/);
});

test('resolveEventChoice: 调解冲突后可触发寺庙调停后续事件', () => {
  const s = makeFakeState({
    day: 23,
    templeRefurbished: true,
    nobleAccepted: true,
    vendorNobleClashDone: false,
    templeMediationDone: false,
    stats: { morale: 55, fame: 40, gov: 45, prosperity: 50 },
    stance: { trade: 55, power: 45, faith: 35, civil: 0 },
  });
  const clash = maybeSpawnVendorNobleClashEvent(s);

  assert.equal(resolveEventChoice(s, clash, 'mediate', null), true);
  const mediation = maybeSpawnTempleMediationEvent(s);

  assert.equal(mediation.kind, 'temple-mediation');
  assert.equal(s.vendorNobleClashDone, true);
});
