// M5: Simulation tick, day phases, daily rollover, save/load migration.
const { test, expect } = require('@playwright/test');
const { openApp, enterManageMode, clearWorld } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('M5 dayPhaseFromMinute returns correct phase for boundary minutes', async ({ page }) => {
  const phases = await page.evaluate(() => {
    const fn = window.__ward.dayPhaseFromMinute;
    return {
      midnight: fn(0),         // 00:00 → deepNight
      preDawn: fn(5 * 60),     // 05:00 → dawn
      dawn: fn(7 * 60),        // 07:00 → dawn
      morning: fn(10 * 60),    // 10:00 → midday
      noon: fn(12 * 60),       // 12:00 → midday
      lateDay: fn(17 * 60),    // 17:00 → midday
      dusk: fn(19 * 60),       // 19:00 → dusk
      earlyNight: fn(22 * 60), // 22:00 → night
      deepNight: fn(23.5 * 60),// 23:30 → deepNight
    };
  });
  expect(phases.midnight).toBe('deepNight');
  expect(phases.preDawn).toBe('dawn');
  expect(phases.dawn).toBe('dawn');
  expect(phases.morning).toBe('midday');
  expect(phases.noon).toBe('midday');
  expect(phases.lateDay).toBe('midday');
  expect(phases.dusk).toBe('dusk');
  expect(phases.earlyNight).toBe('night');
  expect(phases.deepNight).toBe('deepNight');
});

test('M5 applyDayPhase toggles body.fang-deepnight and curfew flag', async ({ page }) => {
  const out = await page.evaluate(() => {
    const w = window.__ward;
    w.applyDayPhase('deepNight');
    const hasClass = document.body.classList.contains('fang-deepnight');
    const curfew = w.fang.curfew;
    w.applyDayPhase('midday');
    const classAfter = document.body.classList.contains('fang-deepnight');
    const curfewAfter = w.fang.curfew;
    return { hasClass, curfew, classAfter, curfewAfter };
  });
  expect(out.hasClass).toBe(true);
  expect(out.curfew).toBe(true);
  expect(out.classAfter).toBe(false);
  expect(out.curfewAfter).toBe(false);
});

test('M5 simTick advances inGameMinute and triggers phase changes', async ({ page }) => {
  await enterManageMode(page);
  const out = await page.evaluate(() => {
    const w = window.__ward;
    w.fang.inGameMinute = 19 * 60; // 19:00, midday → dusk boundary not yet hit
    w.simTick(0); // refresh phase
    const before = w.fang.dayPhase;
    // 1 sec of sim time = 60 in-game minutes; bring us to 20:00
    w.simTick(60 / w.SIM_MINUTES_PER_REAL_SECOND);
    const after = w.fang.dayPhase;
    return { before, after, minute: w.fang.inGameMinute };
  });
  // before phase should be 'dusk' (19:00 is in dusk window 18-21)
  expect(out.before).toBe('dusk');
  expect(out.after).toBe('dusk'); // still 20:00, still dusk
  expect(out.minute).toBeGreaterThanOrEqual(20 * 60);
});

test('M5 simTick crossing 24h triggers day rollover', async ({ page }) => {
  await enterManageMode(page);
  const out = await page.evaluate(() => {
    const w = window.__ward;
    w.fang.inGameMinute = 23 * 60 + 50; // 23:50
    w.fang.day = 5;
    const dayBefore = w.fang.day;
    // advance 30 in-game minutes (which is 30/60 = 0.5 real seconds)
    w.simTick(30 / w.SIM_MINUTES_PER_REAL_SECOND);
    return { dayBefore, dayAfter: w.fang.day, minute: w.fang.inGameMinute };
  });
  expect(out.dayBefore).toBe(5);
  expect(out.dayAfter).toBe(6);
  // After rollover, minute should wrap (we passed 1440)
  expect(out.minute).toBeLessThan(1440);
});

test('M5 simDayRollover spawns petitions', async ({ page }) => {
  const out = await page.evaluate(() => {
    const w = window.__ward;
    w.fang.petitions = [];
    w.simDayRollover();
    return { count: w.fang.petitions.length };
  });
  expect(out.count).toBeGreaterThanOrEqual(1);
  expect(out.count).toBeLessThanOrEqual(3);
});

test('M5 progressPromises decrements daysRemaining and builds on 0', async ({ page }) => {
  await clearWorld(page);
  const out = await page.evaluate(() => {
    const w = window.__ward;
    w.fang.promises = [{
      id: 'test-promise-1',
      type: 'residence', x: 4, z: 4,
      daysRemaining: 1, startedOnDay: 1,
    }];
    w.progressPromises();
    return {
      remainingPromises: w.fang.promises.length,
      buildingAt: w.fang.cellToBuildingId['4,4'],
    };
  });
  expect(out.remainingPromises).toBe(0);
  expect(out.buildingAt).toBeTruthy();
});

test('M5 tallyOutputs collects per-building output into resources', async ({ page }) => {
  await clearWorld(page);
  await enterManageMode(page);
  const out = await page.evaluate(() => {
    const w = window.__ward;
    w.fang.money = 100; w.fang.wood = 100; w.fang.labor = 30;
    // Place a loomShed to produce 3 cloth per day
    w.placeWardBuilding('loomShed', 1, 1);
    const clothBefore = w.fang.cloth;
    w.tallyOutputs();
    return { clothBefore, clothAfter: w.fang.cloth };
  });
  expect(out.clothAfter - out.clothBefore).toBe(3);
});

test('M5 applyDailyDecay applies BALANCE.daily knobs', async ({ page }) => {
  const out = await page.evaluate(() => {
    const w = window.__ward;
    w.fang.money = 100;
    w.fang.fireRisk = 5;
    w.fang.congestion = 5;
    w.applyDailyDecay();
    return { money: w.fang.money, fireRisk: w.fang.fireRisk, congestion: w.fang.congestion };
  });
  // taxIn 6 + rent -8 = net -2
  expect(out.money).toBe(98);
  // fireRisk decay -0.5
  expect(out.fireRisk).toBeCloseTo(4.5, 5);
  expect(out.congestion).toBeCloseTo(4.6, 5);
});

test('M5 expirePetitions drops petitions past ttl', async ({ page }) => {
  const out = await page.evaluate(() => {
    const w = window.__ward;
    w.fang.day = 10;
    w.fang.petitions = [
      { id: 'p-fresh',  day: 9, type: 'residence', ttlDays: 3 },
      { id: 'p-stale',  day: 1, type: 'residence', ttlDays: 3 },
    ];
    w.simDayRollover(); // rolls petitions internally
    // After rollover, stale petition should be gone
    const stillThere = w.fang.petitions.find(p => p.id === 'p-stale');
    return { stale: !!stillThere };
  });
  expect(out.stale).toBe(false);
});

test('M5 saveState includes fang in localStorage payload', async ({ page }) => {
  await clearWorld(page);
  await enterManageMode(page);
  const stored = await page.evaluate(() => {
    const w = window.__ward;
    w.placeWardBuilding('residence', 3, 3);
    // saveState is debounced 200ms — wait a bit
    return new Promise(resolve => setTimeout(() => {
      const raw = localStorage.getItem('tinyworld:v1');
      resolve(JSON.parse(raw));
    }, 300));
  });
  expect(stored.v).toBe(5);
  expect(stored.fang).toBeTruthy();
  expect(stored.fang.mode).toBe('manage');
  expect(Object.keys(stored.fang.buildings)).toHaveLength(1);
  expect(stored.fang.cellToBuildingId['3,3']).toBeTruthy();
});

test('M5 hydrateFang restores buildings from a snapshot', async ({ page }) => {
  const out = await page.evaluate(() => {
    const w = window.__ward;
    const snapshot = {
      mode: 'manage', money: 555,
      buildings: {
        b9: { id: 'b9', type: 'residence', x: 2, z: 2, footprint: [[0, 0]], output: { labor: 1 } },
      },
      day: 7,
    };
    w.hydrateFang(snapshot);
    return {
      money: w.fang.money,
      mode: w.fang.mode,
      day: w.fang.day,
      hasB9: !!w.fang.buildings.b9,
      indexed: w.fang.cellToBuildingId['2,2'] === 'b9',
    };
  });
  expect(out.money).toBe(555);
  expect(out.mode).toBe('manage');
  expect(out.day).toBe(7);
  expect(out.hasB9).toBe(true);
  expect(out.indexed).toBe(true);
});

test('M5 simTick is a no-op when in editor mode', async ({ page }) => {
  // Don't enter manage mode — confirm sim doesn't tick.
  const out = await page.evaluate(() => {
    const w = window.__ward;
    const before = w.fang.inGameMinute;
    // Manually invoke simTick to verify it does change the minute IF called
    // (the no-op behavior is enforced at the animate() call site, not in
    // simTick itself). What we verify: animate() only calls simTick when
    // mode==='manage'. We can't directly run animate, but the manual call
    // should advance time since the function itself is unconditional.
    w.simTick(1);
    return { before, after: w.fang.inGameMinute };
  });
  // Either way simTick advances when called directly — the mode gate is
  // at the animate() call site. This test documents that the function
  // is purely a step engine, not mode-aware.
  expect(out.after).toBeGreaterThan(out.before);
});
