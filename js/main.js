// ES module entry — PR-2 wiring stub.
//
// During PR-2 the legacy inline <script> in tiny-world-builder.html still owns
// the runtime. main.js exists to land the module loader, prove vendor classic
// UMD (window.THREE) is available, and host module exports each PR-2 step
// adds. The inline block keeps running unchanged until the final cutover
// step (PR-2 Step 19) replaces it.

import { safeDisposeGeometry, createDisposeGroup } from './engine/disposal.js';
import { createMaterials } from './engine/materials.js';
import {
  BUILDING_CATALOG_ORDER, BUILDING_CATALOG_META,
  AGENT_COLORS, BALANCE, WARD_BRAIN,
} from './ward/constants.js';
import {
  plotToWorld, worldToPlot, initSubstrateState, isBridgeReady,
  SUBSTRATE_GRID, ADAPTER_VERSION,
} from './ward/sim-adapter.js';

if (!window.THREE) {
  console.error('[twb] vendor THREE missing — vendor/three/three.r128.min.js must load before js/main.js');
}

window.__twb = window.__twb || { engine: {}, ward: {}, game: {}, ui: {} };
window.__twb.engine.disposal = { safeDisposeGeometry, createDisposeGroup };
window.__twb.engine.createMaterials = createMaterials;
window.__twb.ward.constants = {
  BUILDING_CATALOG_ORDER, BUILDING_CATALOG_META,
  AGENT_COLORS, BALANCE, WARD_BRAIN,
};
window.__twb.ward.adapter = {
  version: ADAPTER_VERSION,
  SUBSTRATE_GRID,
  plotToWorld, worldToPlot, initSubstrateState, isBridgeReady,
  // The simBridge flag stays off until the inline runtime knows how to
  // consume substrate state. Toggle from devtools to experiment:
  //   window.__twb.ward.adapter.enableSimBridge = true
  enableSimBridge: false,
};
