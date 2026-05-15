#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'tiny-world-builder.html'), 'utf8');

function fail(message) {
  console.error('smoke failed:', message);
  process.exit(1);
}
function requireIncludes(text, label) {
  if (!html.includes(text)) fail('missing ' + label + ': ' + text);
}
function requireNotIncludes(text, label) {
  if (html.includes(text)) fail('unexpected ' + label + ': ' + text);
}

// Ward-first contract: editor-era symbols (applyTool/doClear/togglePerspective/
// makeCloud/openTinyModal/customDepthMaterial) are scheduled for removal in PR-1
// and are intentionally NOT required here. The pre-PR-2 source-of-truth still
// lives in tiny-world-builder.html; PR-2 flips this scanner to js/main.js.
requireIncludes('function setCell(', 'state mutation entry point');
requireIncludes('function renderCellObject(', 'object renderer');
requireIncludes('function placeWardBuilding(', 'ward building placement');
requireIncludes('function generateWardLayout(', 'ward layout generator');
requireIncludes('function spawnAgent(', 'agent spawn entry point');
requireIncludes('function simTick(', 'ward simulation tick');
requireIncludes('vendor/three/three.r128.min.js', 'self-hosted Three.js');
requireIncludes('vendor/three/GLTFLoader.r128.js', 'self-hosted GLTFLoader');

const netlifyToml = fs.readFileSync(path.join(root, 'netlify.toml'), 'utf8');
if (!netlifyToml.includes('publish = "dist"') || !netlifyToml.includes('command = "./publish.sh"')) {
  fail('netlify.toml does not point Netlify at publish.sh/dist');
}

requireNotIncludes('cdnjs.cloudflare.com/ajax/libs/three.js', 'Three.js CDN');
requireNotIncludes('cdn.jsdelivr.net/npm/three', 'GLTFLoader CDN');
requireNotIncludes('postTarget', 'post-processing render target');
requireNotIncludes('postMaterial', 'post-processing shader material');
requireNotIncludes('postProcessingEnabled', 'post-processing mode flag');
requireNotIncludes('render-smoothing', 'dead post smoothing control');
requireNotIncludes('<script type="module" src="cluso/cluso-embed.js"></script>', 'production-visible Cluso script tag');
requireNotIncludes('<link rel="stylesheet" href="cluso/cluso-embed.css">', 'production-visible Cluso stylesheet tag');

for (const asset of [
  'vendor/three/three.r128.min.js',
  'vendor/three/GLTFLoader.r128.js',
]) {
  if (!fs.existsSync(path.join(root, asset))) fail('missing local asset ' + asset);
}

console.log('smoke ok');
