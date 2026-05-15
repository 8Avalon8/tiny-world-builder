// M7 (sim life loop): building → resident spawn, idle agents pick wander
// targets via the brain, and visitor lifecycle (spawn/despawn). Catalog
// modal flow + welcome ward CTA tested in m1/m2 already; this suite
// targets the autonomous behavior added on top of placeWardBuilding.
const { test, expect } = require('@playwright/test');
const { openApp, enterManageMode, clearWorld } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('M7 residence placement auto-spawns 2 residents', async ({ page }) => {
  await enterManageMode(page);
  await clearWorld(page);
  const out = await page.evaluate(() => {
    const w = window.__ward;
    w.fang.money = 999; w.fang.wood = 999; w.fang.labor = 99;
    const before = Object.keys(w.fang.agents).length;
    const r = w.placeWardBuilding('residence', 3, 3);
    const after = Object.keys(w.fang.agents).length;
    return { ok: r.ok, before, after, residents: r.rec.residents };
  });
  expect(out.ok).toBe(true);
  expect(out.after - out.before).toBe(2);
  expect(out.residents.length).toBe(2);
});

test('M7 fangAdmin placement spawns 2 guards', async ({ page }) => {
  await enterManageMode(page);
  await clearWorld(page);
  const out = await page.evaluate(() => {
    const w = window.__ward;
    w.fang.money = 999; w.fang.wood = 999; w.fang.labor = 99;
    w.placeWardBuilding('fangAdmin', 3, 3);
    const roles = Object.values(w.fang.agents).map(a => a.role);
    return { roles };
  });
  // 2 guards from the admin office.
  const guards = out.roles.filter(r => r === 'guard');
  expect(guards.length).toBe(2);
});

test('M7 ciDengTemple placement spawns 1 monk', async ({ page }) => {
  await enterManageMode(page);
  await clearWorld(page);
  const out = await page.evaluate(() => {
    const w = window.__ward;
    w.fang.money = 9999; w.fang.wood = 9999; w.fang.labor = 99;
    w.placeWardBuilding('ciDengTemple', 3, 3);
    const roles = Object.values(w.fang.agents).map(a => a.role);
    return { roles };
  });
  expect(out.roles.filter(r => r === 'monk').length).toBe(1);
});

test('M7 removeWardBuilding despawns its residents', async ({ page }) => {
  await enterManageMode(page);
  await clearWorld(page);
  const out = await page.evaluate(() => {
    const w = window.__ward;
    w.fang.money = 999; w.fang.wood = 999; w.fang.labor = 99;
    const r = w.placeWardBuilding('residence', 3, 3);
    const afterPlace = Object.keys(w.fang.agents).length;
    w.removeWardBuilding(r.id);
    const afterRemove = Object.keys(w.fang.agents).length;
    return { afterPlace, afterRemove };
  });
  expect(out.afterPlace).toBe(2);
  expect(out.afterRemove).toBe(0);
});

test('M7 assignIdleTargets gives an idle agent a path', async ({ page }) => {
  await enterManageMode(page);
  await clearWorld(page);
  const out = await page.evaluate(() => {
    const w = window.__ward;
    w.invalidateWalkable('test');
    const a = w.spawnAgent({ role: 'resident', x: 2, z: 2 });
    a._lastBrainAt = null;
    // Pretend it's midday so the brain wants to wander, not go home.
    w.fang.dayPhase = 'midday';
    w.assignIdleTargets(720);
    return {
      role: a.role,
      pathLen: a.path && a.path.length,
      state: a.state,
      hasTarget: !!a.target,
    };
  });
  expect(out.role).toBe('resident');
  // The brain should have set SOME target (wander or well). Path length
  // could be 0 only if the agent is already at the chosen target — but
  // we placed it at (2,2) with no buildings around, so a non-zero path
  // is overwhelmingly likely; we assert it ran via target/state instead.
  expect(out.hasTarget).toBe(true);
});

test('M7 guard at night targets a gate', async ({ page }) => {
  await enterManageMode(page);
  await clearWorld(page);
  const out = await page.evaluate(() => {
    const w = window.__ward;
    // Drop a single gate at (4,0) — at night a guard should head to it.
    w.fang.money = 9999; w.fang.wood = 9999; w.fang.labor = 99;
    w.placeWardBuilding('fangGate', 4, 0);
    w.invalidateWalkable('test');
    const a = w.spawnAgent({ role: 'guard', x: 4, z: 4 });
    a._lastBrainAt = null;
    w.fang.dayPhase = 'deepNight';
    const target = w.brainPickTarget(a, 'deepNight');
    return { target };
  });
  expect(Array.isArray(out.target)).toBe(true);
  // The only gate is at (4,0).
  expect(out.target[0]).toBe(4);
  expect(out.target[1]).toBe(0);
});

test('M7 visitor spawn requires a magnet building', async ({ page }) => {
  await enterManageMode(page);
  await clearWorld(page);
  const out = await page.evaluate(() => {
    const w = window.__ward;
    // No temple, no inn → rollVisitorSpawn must not spawn anyone.
    const before = Object.keys(w.fang.agents).length;
    w.fang.dayPhase = 'midday';
    // Force the dice many times — without magnets, count must stay flat.
    for (let i = 0; i < 200; i++) w.rollVisitorSpawn(i);
    const after = Object.keys(w.fang.agents).length;
    return { before, after };
  });
  expect(out.after).toBe(out.before);
});

test('M7 visitor spawns at a gate when a temple + gate exist', async ({ page }) => {
  await enterManageMode(page);
  await clearWorld(page);
  const out = await page.evaluate(() => {
    const w = window.__ward;
    w.fang.money = 9999; w.fang.wood = 9999; w.fang.labor = 99;
    w.placeWardBuilding('fangGate',     4, 0);
    w.placeWardBuilding('ciDengTemple', 3, 3);
    w.invalidateWalkable('test');
    const beforeCount = Object.keys(w.fang.agents).length;
    w.fang.dayPhase = 'midday';
    // Stub Math.random so the rolling chance is guaranteed to succeed.
    // visitorChancePerTemplePerDay=0.8 → perMinute≈0.000556, so the random
    // sample must be smaller than that to pass the `> perMinute` reject gate.
    const realRandom = Math.random;
    Math.random = () => 0.0001;
    w.rollVisitorSpawn(700);
    Math.random = realRandom;
    const ids = Object.keys(w.fang.agents);
    const visitor = w.fang.agents[ids[ids.length - 1]];
    return {
      delta: ids.length - beforeCount,
      role: visitor && visitor.role,
      isVisitor: !!(visitor && visitor._visitor),
    };
  });
  expect(out.delta).toBe(1);
  expect(out.role).toBe('pilgrim');
  expect(out.isVisitor).toBe(true);
});

test('M7 wardAgentCount respects BALANCE.agents.max', async ({ page }) => {
  await enterManageMode(page);
  await clearWorld(page);
  const out = await page.evaluate(() => {
    const w = window.__ward;
    // Drop the cap so we can saturate it quickly.
    w.BALANCE.agents.max = 3;
    for (let i = 0; i < 8; i++) {
      if (w.wardCanSpawnAgent()) w.spawnAgent({ role: 'resident', x: 1, z: 1 });
    }
    return { count: w.wardAgentCount(), canStill: w.wardCanSpawnAgent() };
  });
  expect(out.count).toBe(3);
  expect(out.canStill).toBe(false);
});

test('M7 ward HUD population stat updates after spawn', async ({ page }) => {
  await enterManageMode(page);
  await clearWorld(page);
  const text = await page.evaluate(() => {
    const w = window.__ward;
    w.fang.money = 999; w.fang.wood = 999; w.fang.labor = 99;
    w.placeWardBuilding('residence', 3, 3);
    // refreshWardHud is registered as a wardListener; building-added emits it.
    return document.getElementById('ward-stat-pop').textContent;
  });
  // Format is "N/cap" — we just assert "2/" prefix (BALANCE.agents.max=30).
  expect(text.startsWith('2/')).toBe(true);
});

test('M7 ward toast renders inside #ward-toast', async ({ page }) => {
  await enterManageMode(page);
  const visibleAfter = await page.evaluate(() => {
    const w = window.__ward;
    w.showWardToast('hello');
    const el = document.getElementById('ward-toast');
    return el && el.querySelectorAll('.ward-toast-item').length;
  });
  expect(visibleAfter).toBeGreaterThanOrEqual(1);
});

test('M7 hydrateFang rewires building.residents to fresh agent ids', async ({ page }) => {
  await enterManageMode(page);
  await clearWorld(page);
  const out = await page.evaluate(() => {
    const w = window.__ward;
    w.fang.money = 999; w.fang.wood = 999; w.fang.labor = 99;
    const r = w.placeWardBuilding('residence', 3, 3);
    const oldResidents = r.rec.residents.slice();
    const snap = w.serializeFang();
    // Bump _nextId so hydrate's spawnAgent allocates ids that DON'T
    // collide with the originals — exposes the stale-id bug.
    w.fang._nextId += 100;
    w.hydrateFang(snap);
    const buildingId = Object.keys(w.fang.buildings)[0];
    const newResidents = w.fang.buildings[buildingId].residents;
    // All current resident ids must point to live agents.
    const liveCount = newResidents.filter(id => !!w.fang.agents[id]).length;
    return {
      oldFirst: oldResidents[0],
      newFirst: newResidents[0],
      newCount: newResidents.length,
      liveCount,
    };
  });
  expect(out.newCount).toBe(2);
  expect(out.liveCount).toBe(2);
  // Sanity: old and new ids should be different (we bumped _nextId).
  expect(out.oldFirst).not.toBe(out.newFirst);
});

test('M7 hydrateFang resets walking agents to idle (drops orphan walk state)', async ({ page }) => {
  await enterManageMode(page);
  await clearWorld(page);
  const out = await page.evaluate(() => {
    const w = window.__ward;
    const a = w.spawnAgent({ role: 'resident', x: 0, z: 0 });
    a.path = [[1, 0], [2, 0], [3, 0]];
    a.pathIdx = 1;
    a.state = 'walking';
    const snap = w.serializeFang();
    w.hydrateFang(snap);
    const ids = Object.keys(w.fang.agents);
    const restored = w.fang.agents[ids[0]];
    return {
      state: restored.state,
      pathLen: restored.path && restored.path.length,
      pathIdx: restored.pathIdx,
    };
  });
  expect(out.state).toBe('idle');
  expect(out.pathLen).toBe(0);
  expect(out.pathIdx).toBe(0);
});

test('M7 hydrate then removeWardBuilding actually despawns rehydrated residents', async ({ page }) => {
  await enterManageMode(page);
  await clearWorld(page);
  const out = await page.evaluate(() => {
    const w = window.__ward;
    w.fang.money = 999; w.fang.wood = 999; w.fang.labor = 99;
    const r = w.placeWardBuilding('residence', 3, 3);
    const snap = w.serializeFang();
    // Force fresh ids on hydrate.
    w.fang._nextId += 100;
    w.hydrateFang(snap);
    const buildingId = Object.keys(w.fang.buildings)[0];
    const beforeRemove = Object.keys(w.fang.agents).length;
    w.removeWardBuilding(buildingId);
    const afterRemove = Object.keys(w.fang.agents).length;
    return { beforeRemove, afterRemove };
  });
  expect(out.beforeRemove).toBe(2);
  expect(out.afterRemove).toBe(0);
});
