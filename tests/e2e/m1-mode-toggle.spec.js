// M1: Mode toggle + empty manage UI shell + fang state.
// Verifies clicking #mode-toggle flips body.mode-manage, ward UI panels
// become visible, toolbar editing groups hide, and the fang state object
// exposes default values through window.__ward.
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('M1 mode toggle button is present and labeled', async ({ page }) => {
  const btn = page.locator('#mode-toggle');
  await expect(btn).toBeVisible();
  await expect(page.locator('#mode-toggle-label')).toHaveText('编辑');
});

test('M1 fang state is initialized with defaults', async ({ page }) => {
  const fang = await page.evaluate(() => window.__ward && window.__ward.fang);
  expect(fang).toBeTruthy();
  expect(fang.mode).toBe('editor');
  expect(fang.money).toBe(200);
  expect(fang.labor).toBe(12);
  expect(fang.wood).toBe(80);
  expect(fang.cloth).toBe(40);
  expect(fang.day).toBe(1);
  expect(fang.buildings).toEqual({});
  expect(fang.cellToBuildingId).toEqual({});
  expect(fang.dayPhase).toBe('midday');
});

test('M1 ward UI is hidden in editor mode', async ({ page }) => {
  await expect(page.locator('#ward-hud')).toBeHidden();
  await expect(page.locator('#ward-catalog')).toBeHidden();
});

test('M1 clicking mode toggle switches to manage mode', async ({ page }) => {
  await page.locator('#mode-toggle').click();
  // body class flips
  const bodyClass = await page.evaluate(() => document.body.className);
  expect(bodyClass).toContain('mode-manage');
  // ward HUD becomes visible
  await expect(page.locator('#ward-hud')).toBeVisible();
  await expect(page.locator('#ward-catalog')).toBeVisible();
  // label flips
  await expect(page.locator('#mode-toggle-label')).toHaveText('坊管');
  // fang state mirrors
  const mode = await page.evaluate(() => window.__ward.fang.mode);
  expect(mode).toBe('manage');
});

test('M1 manage mode hides editing toolbar groups', async ({ page }) => {
  await page.locator('#mode-toggle').click();
  // give the toolbar a moment to render
  await page.waitForTimeout(200);
  // these groups should not be visible (display:none via CSS rule)
  for (const group of ['terrain', 'plants', 'build', 'infra', 'farm', 'life']) {
    const sel = `.toolbar .tool-group-btn[data-group="${group}"]`;
    const visible = await page.locator(sel).first().isVisible().catch(() => false);
    expect(visible, `Toolbar group ${group} should be hidden in manage mode`).toBe(false);
  }
});

test('M1 toggling back returns to editor mode and shows toolbar', async ({ page }) => {
  await page.locator('#mode-toggle').click(); // → manage (opens onboarding modal)
  // Dismiss the onboarding modal (empty branch keeps manage mode active but
  // closes the dialog) so the second toggle click can reach #mode-toggle.
  await page.locator('#ward-onboarding-empty').click();
  await page.locator('#mode-toggle').click(); // → editor
  const bodyClass = await page.evaluate(() => document.body.className);
  expect(bodyClass).not.toContain('mode-manage');
  await expect(page.locator('#ward-hud')).toBeHidden();
  await expect(page.locator('#mode-toggle-label')).toHaveText('编辑');
});

test('M1 HUD shows initial fang values', async ({ page }) => {
  await page.locator('#mode-toggle').click();
  await expect(page.locator('#ward-stat-money')).toHaveText('200');
  await expect(page.locator('#ward-stat-labor')).toHaveText('12');
  await expect(page.locator('#ward-stat-wood')).toHaveText('80');
  await expect(page.locator('#ward-stat-cloth')).toHaveText('40');
  await expect(page.locator('#ward-stat-day')).toHaveText('1');
});

test('M1 addBuilding/removeBuilding helpers maintain cellToBuildingId', async ({ page }) => {
  const result = await page.evaluate(() => {
    const w = window.__ward;
    const rec = w.addBuilding({ type: 'residence', x: 3, z: 4, footprint: [[0, 0]] });
    const lookedUp = w.getBuildingAt(3, 4);
    const removed = w.removeBuilding(rec.id);
    const lookedUpAfter = w.getBuildingAt(3, 4);
    return {
      hasId: !!rec.id,
      lookedUpMatch: lookedUp && lookedUp.id === rec.id,
      removed,
      lookedUpAfter: lookedUpAfter === null,
    };
  });
  expect(result.hasId).toBe(true);
  expect(result.lookedUpMatch).toBe(true);
  expect(result.removed).toBe(true);
  expect(result.lookedUpAfter).toBe(true);
});

test('M1 setWardMode is idempotent', async ({ page }) => {
  await page.evaluate(() => {
    window.__ward.setWardMode('manage');
    window.__ward.setWardMode('manage');
    window.__ward.setWardMode('editor');
    window.__ward.setWardMode('invalid');
  });
  const mode = await page.evaluate(() => window.__ward.fang.mode);
  expect(mode).toBe('editor');
});
