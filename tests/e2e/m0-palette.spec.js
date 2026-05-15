// M0: Tang dynasty palette. Verifies new M.* materials are present in the
// source. Pre-PR-2 the inline `const M = { ... }` literal lives in
// tiny-world-builder.html (single file). Post-PR-2 materials live in
// js/engine/materials.js. We probe both so the spec survives the transition.
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const HTML_PATH = path.join(ROOT, 'tiny-world-builder.html');
const MATERIALS_MODULE = path.join(ROOT, 'js', 'engine', 'materials.js');

function loadPaletteSource() {
  if (fs.existsSync(MATERIALS_MODULE)) {
    return fs.readFileSync(MATERIALS_MODULE, 'utf8');
  }
  return fs.readFileSync(HTML_PATH, 'utf8');
}

test('M0 palette: Tang materials are declared', async () => {
  const src = loadPaletteSource();
  const expected = [
    'tangTile:', 'tangTileDk:', 'mudBrick:', 'mudBrickDk:',
    'redLacquer:', 'redLacquerDk:', 'lanternRed:', 'flagYellow:',
    'stoneStep:', 'paperWindow:', 'tangCloth:', 'skinTang:', 'monkRobe:',
  ];
  for (const key of expected) {
    expect(src, `Material ${key} missing from palette source`).toContain(key);
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
