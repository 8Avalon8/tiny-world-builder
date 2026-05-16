// js/game/_agent-stubs.js — agent-layer hooks that the demo's
// petitions/promises/events.js import from ../agents/permanent.js and
// ../agents/signals.js. PR-5 will replace these with real implementations
// once the agent lifecycle is ported. Until then the game logic still
// compiles and the unit tests run; runtime side-effects (force-spawn a
// permanent agent on plot completion, emit a crowd signal on stampede)
// are simply elided.

export function spawnPermanentForPlot(/* plot */) {}
export function onPlotDamaged(/* state, plotId */) {}
export function onPlotRepaired(/* state, plotId */) {}
export function emitSignal(/* state, kind, payload */) {}
