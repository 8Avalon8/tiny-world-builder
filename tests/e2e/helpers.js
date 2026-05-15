// Shared helpers for Playwright E2E tests against tiny-world-builder.
// Use openApp(page) instead of page.goto + waitForLoadState — it suppresses
// the welcome dialog so click flows aren't blocked, and waits for the app
// boot to expose window.__ward (the test surface for fang state).
const WELCOME_NOTICE_ID = '2026-05-11-jigsaw';

async function openApp(page, opts = {}) {
  // Suppress welcome dialog and clear any leftover save from a prior test.
  await page.addInitScript(({ noticeId }) => {
    try {
      window.localStorage.setItem('tinyworld:welcome:dismissedId', noticeId);
      window.localStorage.removeItem('tinyworld:v1');
    } catch (_) {}
  }, { noticeId: WELCOME_NOTICE_ID });
  await page.goto(opts.path || '/tiny-world-builder');
  await page.waitForLoadState('networkidle', { timeout: 15_000 });
  // Wait for the boot to expose the ward test surface.
  await page.waitForFunction(() => !!window.__ward, { timeout: 10_000 });
}

// Wipe the default initial scene + any fang state so a test can place
// buildings without colliding with the preset village (which seeds water,
// houses, paths, crops in the 8x8 home grid by default).
async function clearWorld(page) {
  await page.evaluate(() => window.__ward.clearWorldForTest && window.__ward.clearWorldForTest());
}

async function enterManageMode(page) {
  await page.evaluate(() => window.__ward.setWardMode('manage'));
}

async function setFang(page, patch) {
  await page.evaluate((p) => {
    Object.assign(window.__ward.fang, p);
    window.__ward.refreshHud && window.__ward.refreshHud();
  }, patch);
}

module.exports = { openApp, enterManageMode, setFang, clearWorld };
