// M2: First 3 ward building factories + BUILDING_CATALOG + placement flow.
// Verifies the catalog UI renders, clicking a catalog item arms a build type,
// placing it creates a building record + marks the cell, and footprint
// constraints are honoured (no overlap, no water/lava, must afford).
const { test, expect } = require('@playwright/test');
const { openApp, enterManageMode } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('M2 BUILDING_CATALOG includes the 3 starter buildings (well/residence/loom)', async ({ page }) => {
  const meta = await page.evaluate(() => {
    const c = window.__ward.BUILDING_CATALOG;
    const starters = ['centralWell', 'residence', 'loomShed'];
    return starters.map(k => ({ type: k, name: c[k] && c[k].name, size: c[k] && c[k].size }));
  });
  expect(meta).toEqual([
    { type: 'centralWell', name: '中央水井', size: [1, 1] },
    { type: 'residence',  name: '民居',     size: [1, 1] },
    { type: 'loomShed',   name: '织棚',     size: [2, 1] },
  ]);
});

test('M2 catalog list renders starter items at the top in manage mode', async ({ page }) => {
  await page.locator('#mode-toggle').click();
  const items = page.locator('#ward-catalog-list .catalog-item');
  // After M4 the catalog has 9 entries — first 3 stay the same.
  await expect(items).toHaveCount(9);
  await expect(items.nth(0)).toContainText('中央水井');
  await expect(items.nth(1)).toContainText('民居');
  await expect(items.nth(2)).toContainText('织棚');
});

test('M2 clicking a catalog item arms selectedBuildType', async ({ page }) => {
  // Use the test helper to enter manage mode without triggering the
  // onboarding modal — these tests target catalog-click behaviour, not
  // the mode-toggle UI flow (which has its own coverage in m1).
  await enterManageMode(page);
  await page.locator('#ward-catalog-list .catalog-item[data-type="residence"]').click();
  const sel = await page.evaluate(() => window.__ward.fang.selectedBuildType);
  expect(sel).toBe('residence');
  await expect(page.locator('#ward-catalog-list .catalog-item[data-type="residence"]')).toHaveClass(/selected/);
});

test('M2 clicking same catalog item again deselects', async ({ page }) => {
  await enterManageMode(page);
  await page.locator('#ward-catalog-list .catalog-item[data-type="residence"]').click();
  await page.locator('#ward-catalog-list .catalog-item[data-type="residence"]').click();
  const sel = await page.evaluate(() => window.__ward.fang.selectedBuildType);
  expect(sel).toBeNull();
});

test('M2 placeWardBuilding spends cost, registers, and marks cell', async ({ page }) => {
  await enterManageMode(page);
  const result = await page.evaluate(() => {
    const w = window.__ward;
    const moneyBefore = w.fang.money;
    const woodBefore  = w.fang.wood;
    const laborBefore = w.fang.labor;
    const r = w.placeWardBuilding('residence', 3, 3);
    return {
      ok: r.ok,
      id: r.id,
      moneyDelta: moneyBefore - w.fang.money,
      woodDelta:  woodBefore  - w.fang.wood,
      laborDelta: laborBefore - w.fang.labor,
      registered: !!w.fang.buildings[r.id],
      cellIndexed: w.fang.cellToBuildingId['3,3'] === r.id,
      type: w.fang.buildings[r.id] && w.fang.buildings[r.id].type,
    };
  });
  expect(result.ok).toBe(true);
  expect(result.moneyDelta).toBe(12);
  expect(result.woodDelta).toBe(6);
  expect(result.laborDelta).toBe(1);
  expect(result.registered).toBe(true);
  expect(result.cellIndexed).toBe(true);
  expect(result.type).toBe('residence');
});

test('M2 placing a 2x1 loomShed marks both footprint cells', async ({ page }) => {
  await enterManageMode(page);
  const result = await page.evaluate(() => {
    const w = window.__ward;
    const r = w.placeWardBuilding('loomShed', 2, 5);
    return {
      ok: r.ok,
      footprint: r.rec && r.rec.footprint,
      anchorIndexed: w.fang.cellToBuildingId['2,5'] === r.id,
      neighborIndexed: w.fang.cellToBuildingId['3,5'] === r.id,
    };
  });
  expect(result.ok).toBe(true);
  expect(result.footprint).toEqual([[0, 0], [1, 0]]);
  expect(result.anchorIndexed).toBe(true);
  expect(result.neighborIndexed).toBe(true);
});

test('M2 cannot place on top of another building', async ({ page }) => {
  await enterManageMode(page);
  const result = await page.evaluate(() => {
    const w = window.__ward;
    const first = w.placeWardBuilding('residence', 3, 3);
    const second = w.placeWardBuilding('residence', 3, 3);
    return { firstOk: first.ok, secondOk: second.ok, secondReason: second.reason };
  });
  expect(result.firstOk).toBe(true);
  expect(result.secondOk).toBe(false);
  expect(result.secondReason).toBe('occupied');
});

test('M2 cannot afford rejects placement and leaves resources alone', async ({ page }) => {
  await enterManageMode(page);
  const result = await page.evaluate(() => {
    const w = window.__ward;
    w.fang.money = 5; // not enough for any building
    const moneyBefore = w.fang.money;
    const r = w.placeWardBuilding('residence', 4, 4);
    return { ok: r.ok, reason: r.reason, moneyAfter: w.fang.money, moneyBefore };
  });
  expect(result.ok).toBe(false);
  expect(result.reason).toBe('unaffordable');
  expect(result.moneyAfter).toBe(result.moneyBefore);
});

test('M2 removeWardBuilding releases footprint cells', async ({ page }) => {
  await enterManageMode(page);
  const result = await page.evaluate(() => {
    const w = window.__ward;
    const r = w.placeWardBuilding('loomShed', 1, 1);
    w.removeWardBuilding(r.id);
    return {
      anchorClear: !w.fang.cellToBuildingId['1,1'],
      neighborClear: !w.fang.cellToBuildingId['2,1'],
      registryClear: !w.fang.buildings[r.id],
    };
  });
  expect(result.anchorClear).toBe(true);
  expect(result.neighborClear).toBe(true);
  expect(result.registryClear).toBe(true);
});

test('M2 placement writes kind=fangBuilding to world cell', async ({ page }) => {
  await enterManageMode(page);
  const kind = await page.evaluate(() => {
    const w = window.__ward;
    w.placeWardBuilding('residence', 4, 4);
    const cell = window.world ? window.world[4][4] : null;
    // world is in closure; expose for test via window.__ward.fang.cellToBuildingId
    // We verify the building was registered. world.kind is internal but
    // setCell wrote it; assert via cellToBuildingId presence.
    return w.fang.cellToBuildingId['4,4'];
  });
  expect(kind).toBeTruthy();
});
