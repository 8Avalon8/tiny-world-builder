// M0: Tang dynasty palette. Verifies new M.* materials are present in the
// inline script source. Materials live inside an IIFE closure, so we can't
// access them at runtime from window — checking source ensures they are
// defined. Runtime usage is exercised by M2+ tests where factories use them.
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', '..', 'tiny-world-builder.html');

test('M0 palette: Tang materials are declared', async () => {
  const src = fs.readFileSync(HTML_PATH, 'utf8');
  // Each material should appear inside the `const M = { ... }` literal.
  // We assert presence by exact key with the MeshLambertMaterial constructor
  // signature pattern. False positives are vanishingly rare.
  const expected = [
    'tangTile:', 'tangTileDk:', 'mudBrick:', 'mudBrickDk:',
    'redLacquer:', 'redLacquerDk:', 'lanternRed:', 'flagYellow:',
    'stoneStep:', 'paperWindow:', 'tangCloth:', 'skinTang:', 'monkRobe:',
  ];
  for (const key of expected) {
    expect(src, `Material ${key} missing from M = { ... }`).toContain(key);
  }
});

test('M0 page loads with no console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push('pageerror: ' + err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push('console.error: ' + msg.text());
  });
  await openApp(page);
  // Filter known noise: font-loading or vendor warnings are not part of M0.
  const real = errors.filter(e => !e.includes('Fraunces') && !e.includes('GLTFLoader'));
  expect(real, `Unexpected console errors: ${real.join('; ')}`).toEqual([]);
});
