// M4: All 9 building catalog entries + 6 new factories (incenseShop,
// fangAdmin, inn, nobleManor, ciDengTemple, fangGate).
const { test, expect } = require('@playwright/test');
const { openApp, enterManageMode, clearWorld } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('M4 BUILDING_CATALOG has all 9 building types', async ({ page }) => {
  const types = await page.evaluate(() => {
    return window.__ward.BUILDING_CATALOG_ORDER;
  });
  expect(types.length).toBe(9);
  expect(types).toEqual([
    'centralWell', 'residence', 'loomShed',
    'incenseShop', 'fangAdmin', 'inn', 'nobleManor', 'ciDengTemple', 'fangGate',
  ]);
});

test('M4 each catalog entry has factory + cost + size', async ({ page }) => {
  const meta = await page.evaluate(() => {
    const c = window.__ward.BUILDING_CATALOG;
    return Object.entries(c).map(([k, v]) => ({
      type: k,
      name: v.name,
      sizeOk: Array.isArray(v.size) && v.size.length === 2,
      hasFactory: typeof v.factory === 'function',
      hasCost: !!v.cost,
    }));
  });
  expect(meta.length).toBe(9);
  for (const m of meta) {
    expect(m.sizeOk, `${m.type} size`).toBe(true);
    expect(m.hasFactory, `${m.type} factory`).toBe(true);
    expect(m.hasCost, `${m.type} cost`).toBe(true);
    expect(m.name, `${m.type} name`).toBeTruthy();
  }
});

test('M4 all 9 factories produce Groups with the right userData.kind', async ({ page }) => {
  const results = await page.evaluate(() => {
    const c = window.__ward.BUILDING_CATALOG;
    const out = {};
    for (const [type, spec] of Object.entries(c)) {
      try {
        const g = spec.factory(1);
        out[type] = {
          isGroup: g && g.type === 'Group',
          kind: g && g.userData && g.userData.kind,
          childCount: g && g.children.length,
        };
      } catch (e) {
        out[type] = { error: e.message };
      }
    }
    return out;
  });
  for (const [type, r] of Object.entries(results)) {
    expect(r.error, `${type} should not throw`).toBeUndefined();
    expect(r.isGroup, `${type} is Group`).toBe(true);
    // gate factory returns fangGate; everything else returns fangBuilding
    if (type === 'fangGate') {
      expect(r.kind).toBe('fangGate');
    } else {
      expect(r.kind, `${type} kind`).toBe('fangBuilding');
    }
    expect(r.childCount, `${type} has children`).toBeGreaterThan(0);
  }
});

test('M4 catalog list now shows 9 items in manage mode', async ({ page }) => {
  await page.locator('#mode-toggle').click();
  const items = page.locator('#ward-catalog-list .catalog-item');
  await expect(items).toHaveCount(9);
});

test('M4 placing a 2x2 inn marks all four footprint cells', async ({ page }) => {
  await clearWorld(page);
  await enterManageMode(page);
  const result = await page.evaluate(() => {
    const w = window.__ward;
    w.fang.money = 500; w.fang.wood = 200; w.fang.labor = 30;
    const r = w.placeWardBuilding('inn', 2, 2);
    const cells = ['2,2', '3,2', '2,3', '3,3'].map(k => ({
      key: k,
      indexed: w.fang.cellToBuildingId[k] === r.id,
    }));
    return { ok: r.ok, reason: r.reason, cells };
  });
  expect(result.ok, `placement failed: ${result.reason}`).toBe(true);
  for (const c of result.cells) {
    expect(c.indexed, `cell ${c.key} indexed`).toBe(true);
  }
});

test('M4 placing fangGate writes world.kind=fangGate without a building record', async ({ page }) => {
  await clearWorld(page);
  await enterManageMode(page);
  const result = await page.evaluate(() => {
    const w = window.__ward;
    w.fang.money = 200;
    const buildingsBefore = Object.keys(w.fang.buildings).length;
    const r = w.placeWardBuilding('fangGate', 5, 5);
    const buildingsAfter = Object.keys(w.fang.buildings).length;
    return {
      ok: r.ok,
      virtual: r.rec && r.rec.virtual,
      idNull: r.id === null,
      buildingsCountUnchanged: buildingsAfter === buildingsBefore,
      // The cell index should NOT include this slot since it's a wall-y kind
      noBuildingAtCell: !w.fang.cellToBuildingId['5,5'],
    };
  });
  expect(result.ok).toBe(true);
  expect(result.virtual).toBe(true);
  expect(result.idNull).toBe(true);
  expect(result.buildingsCountUnchanged).toBe(true);
  expect(result.noBuildingAtCell).toBe(true);
});

test('M4 nobleManor is the most expensive building', async ({ page }) => {
  const costs = await page.evaluate(() => {
    const c = window.__ward.BUILDING_CATALOG;
    const result = {};
    for (const [k, v] of Object.entries(c)) result[k] = v.cost.money;
    return result;
  });
  const max = Math.max(...Object.values(costs));
  expect(costs.nobleManor).toBe(max);
});

test('M4 placing 2x2 buildings rejects when footprint partially overlaps', async ({ page }) => {
  await clearWorld(page);
  await enterManageMode(page);
  const result = await page.evaluate(() => {
    const w = window.__ward;
    w.fang.money = 999; w.fang.wood = 999; w.fang.labor = 99;
    const r1 = w.placeWardBuilding('residence', 4, 4);
    // Try to place a 2x2 inn whose anchor is (3,3) — footprint covers (4,4)
    const r2 = w.placeWardBuilding('inn', 3, 3);
    return { r1ok: r1.ok, r2ok: r2.ok, r2reason: r2.reason };
  });
  expect(result.r1ok).toBe(true);
  expect(result.r2ok).toBe(false);
  expect(result.r2reason).toBe('occupied');
});
