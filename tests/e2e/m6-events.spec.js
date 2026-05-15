// M6: Event system — templates, rolling, choice resolution, modal UI;
// plus crop-duster gating in manage mode.
const { test, expect } = require('@playwright/test');
const { openApp, enterManageMode } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('M6 EVENT_TEMPLATES exposes 4 event kinds', async ({ page }) => {
  const kinds = await page.evaluate(() => Object.keys(window.__ward.EVENT_TEMPLATES));
  expect(kinds.sort()).toEqual(['bandit', 'crowd', 'fire', 'noble']);
});

test('M6 each template has at least 2 choices', async ({ page }) => {
  const counts = await page.evaluate(() => {
    const t = window.__ward.EVENT_TEMPLATES;
    return Object.entries(t).map(([k, v]) => [k, v.choices.length]);
  });
  for (const [kind, n] of counts) {
    expect(n, `${kind} choices`).toBeGreaterThanOrEqual(2);
  }
});

test('M6 forceEvent injects a populated EventRec into fang.events', async ({ page }) => {
  const out = await page.evaluate(() => {
    const w = window.__ward;
    w.fang.events = [];
    const inst = w.forceEvent('fire');
    return {
      id: inst.id, kind: inst.kind, title: inst.title,
      hasChoices: Array.isArray(inst.choices) && inst.choices.length >= 2,
      inQueue: w.fang.events[0].id === inst.id,
    };
  });
  expect(out.id).toBeTruthy();
  expect(out.kind).toBe('fire');
  expect(out.title).toBeTruthy();
  expect(out.hasChoices).toBe(true);
  expect(out.inQueue).toBe(true);
});

test('M6 applyEventChoice subtracts cost and applies effects', async ({ page }) => {
  const out = await page.evaluate(() => {
    const w = window.__ward;
    w.fang.events = [];
    w.fang.money = 100; w.fang.fireRisk = 5; w.fang.morale = 50;
    const evt = w.forceEvent('fire'); // choices[0] = hire firefighters
    const r = w.applyEventChoice(evt.id, 0);
    return {
      ok: r.ok,
      money: w.fang.money,
      fireRisk: w.fang.fireRisk,
      morale: w.fang.morale,
      eventsLeft: w.fang.events.length,
    };
  });
  expect(out.ok).toBe(true);
  expect(out.money).toBe(80);     // -20
  expect(out.fireRisk).toBe(2);   // -3
  expect(out.morale).toBe(51);    // +1
  expect(out.eventsLeft).toBe(0);
});

test('M6 rollEvents triggers a fire when fireRisk threshold met', async ({ page }) => {
  const out = await page.evaluate(() => {
    const w = window.__ward;
    w.fang.events = [];
    w.fang.fireRisk = 10;
    w.fang.congestion = 0;
    w.fang.order = 100;
    w.fang.fame = 0;
    // Hammer rollEvents multiple times — base chance is 15%, so 50 attempts
    // should statistically yield at least one fire.
    let fires = 0;
    for (let i = 0; i < 200; i++) {
      w.fang.events = [];
      w.rollEvents();
      if (w.fang.events.some(e => e.kind === 'fire')) fires++;
    }
    return { fires };
  });
  // baseChance=0.15 × 200 trials = expected ~30 fires. >5 is very confident.
  expect(out.fires).toBeGreaterThan(5);
});

test('M6 rollEvents does not trigger any event when thresholds are unmet', async ({ page }) => {
  const out = await page.evaluate(() => {
    const w = window.__ward;
    // All thresholds well clear:
    w.fang.fireRisk = 0;
    w.fang.congestion = 0;
    w.fang.order = 100;
    w.fang.fame = 0;
    let any = 0;
    for (let i = 0; i < 50; i++) {
      w.fang.events = [];
      w.rollEvents();
      if (w.fang.events.length) any++;
    }
    return { any };
  });
  expect(out.any).toBe(0);
});

test('M6 event modal renders when an event is pushed', async ({ page }) => {
  await enterManageMode(page);
  await page.evaluate(() => {
    window.__ward.fang.events = [];
    window.__ward.forceEvent('fire');
    window.__ward.renderEventModal('event-forced');
  });
  const modal = page.locator('#ward-event-modal');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('坊内失火');
  // 2 buttons (hire + wait)
  const btns = modal.locator('button.btn');
  await expect(btns).toHaveCount(2);
});

test('M6 clicking modal choice button resolves the event', async ({ page }) => {
  await enterManageMode(page);
  await page.evaluate(() => {
    const w = window.__ward;
    w.fang.events = [];
    w.fang.money = 100;
    w.forceEvent('fire');
    w.renderEventModal('event-forced');
  });
  // Click "雇人灭火" (first choice)
  await page.locator('#ward-event-modal button.btn').first().click();
  const money = await page.evaluate(() => window.__ward.fang.money);
  expect(money).toBe(80);
  await expect(page.locator('#ward-event-modal')).toBeHidden();
});

test('M6 invalid choice returns ok:false', async ({ page }) => {
  const out = await page.evaluate(() => {
    const w = window.__ward;
    w.fang.events = [];
    const inst = w.forceEvent('crowd');
    return {
      bogusEvent: w.applyEventChoice('nope', 0),
      bogusChoice: w.applyEventChoice(inst.id, 99),
    };
  });
  expect(out.bogusEvent.ok).toBe(false);
  expect(out.bogusEvent.reason).toBe('unknown-event');
  expect(out.bogusChoice.ok).toBe(false);
  expect(out.bogusChoice.reason).toBe('unknown-choice');
});

test('M6 setPolicy mutates fang.policy and rejects invalid values', async ({ page }) => {
  const out = await page.evaluate(() => {
    const w = window.__ward;
    return {
      defaultCurfew: w.fang.policy.curfewStrictness,
      ok1: w.setPolicy('curfewStrictness', 'strict'),
      curfewAfter: w.fang.policy.curfewStrictness,
      ok2: w.setPolicy('taxRate', 'invalid-value'),
      taxRateAfter: w.fang.policy.taxRate,
      ok3: w.setPolicy('unknown-key', 'whatever'),
    };
  });
  expect(out.defaultCurfew).toBe('balanced');
  expect(out.ok1).toBe(true);
  expect(out.curfewAfter).toBe('strict');
  expect(out.ok2).toBe(false);
  expect(out.taxRateAfter).toBe('normal');
  expect(out.ok3).toBe(false);
});

test('M6 setPolicy curfewStrictness shifts order vs morale', async ({ page }) => {
  const out = await page.evaluate(() => {
    const w = window.__ward;
    w.fang.order = 50; w.fang.morale = 50;
    w.setPolicy('curfewStrictness', 'strict');
    const after = { order: w.fang.order, morale: w.fang.morale };
    return after;
  });
  expect(out.order).toBe(51);
  expect(out.morale).toBe(49);
});

test('M6 crop-duster is hidden in manage mode', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const w = window.__ward;
    w.setWardMode('manage');
    // Wait a few frames so animate() → updateCropDuster() runs with the
    // manage-mode gate active. Browser frame ≈ 16ms; 250ms is comfy.
    await new Promise(r => setTimeout(r, 250));
    const root = window.__cropDusterRoot;
    return { hasRoot: !!root, visible: !!(root && root.visible) };
  });
  expect(out.hasRoot).toBe(true);
  expect(out.visible).toBe(false);
});
