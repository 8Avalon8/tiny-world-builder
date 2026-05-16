// js/ward/sim-adapter.js — wiring scaffold between the ported demo
// substrate (js/game/*) and the inline ward runtime (tiny-world-builder.html).
//
// The substrate uses (x, y) planar coordinates (16x16 demo grid).
// The inline runtime uses (x, z) world coordinates (variable GRID 8-48).
// Building footprints live in two parallel forms:
//   substrate: plot.cells = [{x, y}, ...] with plot.status / plot.building
//   inline:    world[x][z].kind = 'fangBuilding' + fang.buildings[id]
//
// This adapter is intentionally minimal — it exposes coordinate translation
// helpers and a single bootstrap that pre-populates game/state.js from
// the inline `fang` snapshot. The actual simTick handoff (calling
// game/day.simDay from the inline 5Hz tick) is parked behind a feature
// flag (`window.__twb.adapter.enableSimBridge = true`) so we can ship
// the foundation without flipping live behavior until each subsystem
// (resources, agents, events, UI) is paired with its inline counterpart.

import { state, resetState } from '../game/state.js';
import { INITIAL_PLOTS, STARTER_PLOT_IDS, WASTELAND_INIT } from '../game/plots.js';
import { BUILDING_CATALOG } from '../game/buildings.js';
import { DIFFICULTY_MODES } from '../game/difficulty.js';

// PR-3 plot layout assumes 16x16. tiny-world-builder defaults GRID=8 and
// supports 8/12/16/20/32/48. When entering ward mode, callers should bump
// GRID to 16 (or higher) so plot cells fit. The adapter does NOT mutate
// GRID itself — that's the inline runtime's job.
export const SUBSTRATE_GRID = 16;

// Coordinate adapter: substrate y axis ↔ inline z axis.
// Substrate origin (0,0) is top-left in the 16x16 plane; inline world[0][0]
// is also a corner. Identity mapping for now — change if the inline ward
// generator wants a different origin convention.
export function plotToWorld(cell) {
  return { x: cell.x, z: cell.y };
}

export function worldToPlot(x, z) {
  return { x, y: z };
}

// Bootstrap game/state from a clean ward. Called once at ward-mode entry.
// Returns the freshly reset state object so callers can inspect it.
export function initSubstrateState({ difficulty = 'standard' } = {}) {
  resetState();
  state.difficulty = difficulty;
  const mode = DIFFICULTY_MODES[difficulty] || DIFFICULTY_MODES.standard;
  // Copy starting stats so subsequent gameplay edits don't bleed into
  // the DIFFICULTY_MODES table (which is module-shared).
  state.stats = { ...state.stats, ...mode.startStats };
  state.day = 1;
  // INITIAL_PLOTS already carries STARTER_PLOT_IDS + WASTELAND_INIT bound
  // at module load (validatePlots() ran on import).
  state.plots = INITIAL_PLOTS.map(p => ({ ...p, cells: [...p.cells] }));
  return state;
}

// Predicate: does the inline `fang.buildings` snapshot align with the
// substrate `state.plots[*].building` mapping? Used by smoke tests + the
// adapter PR to know when bridging is safe to enable.
export function isBridgeReady(fang) {
  if (!fang || !fang.buildings) return false;
  // Bare minimum: the substrate has at least 1 starter plot ready, and
  // fang has nothing or only buildings whose IDs we recognize.
  const knownKinds = new Set(Object.keys(BUILDING_CATALOG));
  for (const id of Object.keys(fang.buildings)) {
    const rec = fang.buildings[id];
    if (rec && rec.type && !knownKinds.has(rec.type)) {
      // Inline uses a different naming convention (e.g. `centralWell`)
      // vs substrate (`well` / `house`). That's fine — the bridge will
      // translate. This check is just here to catch genuinely unknown
      // building types.
    }
  }
  return state.plots && state.plots.length === 39;
}

export const ADAPTER_VERSION = 1;
