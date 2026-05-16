// M8: substrate availability — PR-3~PR-6 game/* modules ported from the
// chang_an_fang_demo can be loaded inside the browser, expose their public
// API surface, and don't crash when imported alongside the inline runtime.
//
// This is a contract test: it doesn't drive the simulation (that's still
// inline-owned), just verifies the substrate modules are discoverable and
// their entry points are callable. Wiring substrate → inline simTick lands
// in a later adapter PR.
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('M8 substrate: js/game/plots.js loads and exposes INITIAL_PLOTS (39)', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const mod = await import('/js/game/plots.js');
    return {
      plotsLen: mod.INITIAL_PLOTS.length,
      quadrants: Object.keys(mod.QUADRANTS).sort(),
      starters: mod.STARTER_PLOT_IDS.length,
      wasteland: mod.WASTELAND_INIT.length,
    };
  });
  expect(result.plotsLen).toBe(39);
  expect(result.quadrants).toEqual(['NE', 'NW', 'SE', 'SW']);
  expect(result.starters).toBe(4);
  expect(result.wasteland).toBe(31);
});

test('M8 substrate: spatial DSL is callable from browser', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const sp = await import('/js/game/spatial.js');
    return {
      wellCount: sp.WELL_CELLS.length,
      inSE: sp.isInQuadrant({ quadrant: 'SE' }, 'SE'),
      inNW: sp.isInQuadrant({ quadrant: 'SE' }, 'NW'),
    };
  });
  expect(out.wellCount).toBe(4);
  expect(out.inSE).toBe(true);
  expect(out.inNW).toBe(false);
});

test('M8 substrate: petitions/promises/events expose canonical entry points', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const p = await import('/js/game/petitions.js');
    const pr = await import('/js/game/promises.js');
    const ev = await import('/js/game/events.js');
    return {
      hasSpawners: typeof p.runPetitionSpawners === 'function',
      hasCreatePromise: typeof pr.createPromise === 'function',
      hasResolveEvent: typeof ev.resolveEventChoice === 'function',
    };
  });
  expect(out.hasSpawners).toBe(true);
  expect(out.hasCreatePromise).toBe(true);
  expect(out.hasResolveEvent).toBe(true);
});

test('M8 substrate: agents lifecycle modules load + Agent class is constructible', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const { Agent, resetAgentIds } = await import('/js/game/agents/agent.js');
    resetAgentIds();
    // Demo signature: Agent(type, nodeId, opts) — opts.x/opts.y required.
    const a = new Agent('resident', null, { x: 5, y: 5 });
    return { id: a.id, type: a.type, x: a.x, y: a.y };
  });
  expect(out.type).toBe('resident');
  expect(out.x).toBe(5);
  expect(out.y).toBe(5);
});

test('M8 inline runtime hands off via window.__twb', async ({ page }) => {
  const out = await page.evaluate(() => {
    const t = window.__twb;
    return {
      engineRuntimeKeys: Object.keys(t.engine.runtime).slice(0, 6).sort(),
      wardRuntimeHasFang: typeof t.ward.runtime.fang === 'object',
      wardRuntimeHasSimTick: typeof t.ward.runtime.simTick === 'function',
      wardConstantsKeys: Object.keys(t.ward.constants).sort(),
    };
  });
  expect(out.wardRuntimeHasFang).toBe(true);
  expect(out.wardRuntimeHasSimTick).toBe(true);
  expect(out.wardConstantsKeys).toContain('BUILDING_CATALOG_ORDER');
  expect(out.wardConstantsKeys).toContain('BALANCE');
});
