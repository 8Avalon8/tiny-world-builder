# CLAUDE.md / AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) and other AI
coding agents when working with code in this repository. `CLAUDE.md` is a
symlink to `AGENTS.md` — keep them in lockstep. Read this before touching
`tiny-world-builder.html`.

## Commands

```bash
npm run dev          # tools/dev-server.js — serves http://localhost:3000/tiny-world-builder
npm test             # check.js (inline JS parse + schema parity) + smoke-static.js
npm run check        # just the static check (schema parity, asset paths)
npm run smoke        # just the smoke contracts
npm run test:unit    # node --test tests/unit (pure-logic suites; PR-3+ populates)
npm run build        # publish.sh — generates dist/ for Vercel/Netlify

# Playwright E2E (Chang'an ward sim regression):
cd tests/e2e
npx playwright install chromium   # one-time
npx playwright test               # all spec files; reuses dev-server if up
npx playwright test m5-agents     # single spec file by stem match
npx playwright test --headed      # watch the browser
TWB_BASE_URL=http://localhost:3001 npx playwright test   # custom port
TWB_NO_WEBSERVER=1 npx playwright test                   # skip auto-spawn dev-server
```

`tools/check.js` does a **JSON semantic-equivalence** compare between
`world.schema.json` and the embedded `WORLD_SCHEMA` block in
`tiny-world-builder.html` (not byte equality — indentation/key order are
free, but enums/required/structure must match). Any time you change schema,
update both.

### Dev-server / module loading notes

- Always open the app over **HTTP** via `npm run dev`, never `file://`. Vendor
  Three.js (`vendor/three/three.r128.min.js`, `vendor/three/GLTFLoader.r128.js`)
  is **classic UMD** — it writes `window.THREE`. The ES module entry
  `js/main.js` reads `window.THREE` from the global. Module scripts default
  to `defer`, so the classic vendor `<script>` tags must come **before** the
  `<script type="module" src="js/main.js">` tag in `tiny-world-builder.html`.
- PR-2 transition: the inline `<script>` block in `tiny-world-builder.html`
  still owns the live runtime. At the tail of `bootApp()`, the inline closure
  calls `exposeRuntimeToModules()` which mirrors the engine + ward runtime
  onto `window.__twb.{engine,ward}.runtime`. New code written as ES modules
  (PR-3+ game/* and ward/ui-bridge code) reads from `window.__twb` instead of
  reaching into the inline closures. Module-side modules in `js/engine/` and
  `js/ward/` currently hold extracted **portable** slices (disposal, materials,
  constants) that the inline runtime does not yet consume; the full inline
  cutover is deferred to a later cleanup PR.
- Tests (`tools/smoke-static.js`) verify both the inline contract and the
  module entry are present.

### Substrate modules (`js/game/`)

PR-3 through PR-6 ported the pure-logic core of the chang_an_fang_demo into
`js/game/`. These modules are **not yet wired** into the inline ward sim
runtime — they're unit-test green (416 node tests) and browser-loadable
(verified by `tests/e2e/m8-substrate.spec.js`), but the inline `simTick`
keeps using the simpler fang state model.

Module map (every file Apache-style portable, no DOM, no Three.js):

```
js/game/
├── state.js           Game state singleton + resetState()
├── time.js            DAY_START_MINUTE / getPhase / minuteToText
├── walkmap.js         BFS findPath + nearestWalkable
├── gates.js           Gate cells + curfew-aware walkability
├── buildings.js       BUILDINGS_BY_ID + BUILDING_CATALOG (template + onComplete)
├── plots.js           39 INITIAL_PLOTS + 4 QUADRANTS + 31 WASTELAND_INIT
├── spatial.js         8-predicate DSL (in/inAny/within/adjacent/notAdjacent/size/...)
├── projects.js        DEFERRED (depends on inline state/agents/buildings — needs adapter)
├── petitions.js       12 petition kinds + PETITION_SPAWNERS
├── promises.js        3-tier outcomes + spatial gates
├── events.js          11 event templates + resolveEventChoice
├── citizens.js        Housing capacity + weaver auto-hire + daily output
├── wasteland.js       Direct + permission unlock state machines
├── local-effects.js   Smoke/crowd/faith/market/prestige overlay engine
├── difficulty.js      relaxed/standard/strict modes
├── groups.js          Social-unit memory carriers for petitions/promises
├── endgame.js         First-chapter goal evaluator
├── day.js             simDay orchestrator (one-tick-per-game-day)
├── balance{,-events,-noble,-petitions,-promises,-risk,-stance,-temple,-vendor,-wasteland}.js
├── _agent-stubs.js    Noop placeholders for spawnPermanentForPlot / emitSignal
├── utils.js           clamp/rand/choice/dist/lerp
├── agents/
│   ├── agent.js       Agent class + inferLifecycle
│   ├── movement.js    setTargetCell/advancePath/lingerStep
│   ├── needs.js       Thirst/fatigue increments + needWeight
│   ├── tasks.js       Task stack + FSM + interruption + cooldowns
│   ├── signals.js     emitSignal + tickSignals (5Hz throttle)
│   ├── spatial-query.js queryRadius
│   ├── spawn.js       ambient/initial/spawnVagrants/spawnCharacter
│   ├── permanent.js   Permanent lifecycle + onPlotDamaged/Repaired
│   ├── routines.js    transient/permanent/special dispatch
│   ├── celebrities.js Daily roll + group memory carriers
│   ├── phase-hooks.js broadcastPhaseChange
│   └── characters/    index.js + demoNpc.js
```

Unit tests under `tests/unit/*.test.js` cover each module + cross-module
scenarios (7-day full simulation runs). Run `npm run test:unit`. Wiring
(adapter PR) is the next chapter — `js/ward/sim-adapter.js` will bridge
`fang` ↔ `state.stats` + map plot (x, y) ↔ world (x, z).

## Project shape

- Main app: `tiny-world-builder.html`. Inline CSS in `<style>`, inline JS in a
  single `<script>` block at the bottom. Three.js **r128** and GLTFLoader are
  self-hosted under `vendor/three/` and copied to `dist/` by `publish.sh`.
  Vercel (`vercel.json`) and Netlify (`netlify.toml`) both use that same static
  build output.
- No bundler and no npm runtime dependencies. Use `npm test` for static checks,
  `npm run build` for dist generation, then reload the browser.
- If a `tiny-world-builder BACKUP.html` snapshot exists, don't auto-update it.

## Repo-local skills

- Local skills live in `.codex/skills/*/SKILL.md`. Read the relevant skill before
  changing the matching system.
- When a change creates a durable pattern, update the related skill in the
  same turn. If there is no related skill, create a new concise one.
- Current skill routing:
  - `.codex/skills/tinyworld-single-file` — repo workflow and single-file constraints.
  - `.codex/skills/tinyworld-auto-batching` — Auto palette inference/cache behavior.
  - `.codex/skills/tinyworld-opacity-torch` — ghost boards, panning, opacity torch.
  - `.codex/skills/tinyworld-tile-variation` — repeat-click levels and terrain/object variation.
  - `.codex/skills/tinyworld-visual-qa` — browser checks and visual QA.
  - `.codex/skills/tinyworld-render-performance` — renderer, shadows, clouds, and GPU budget.
  - `.codex/skills/tinyworld-lowpoly-world-prompt` — model prompting for coherent low-poly worlds.
  - `.codex/skills/tinyworld-lowpoly-stylized-3d` — low-poly/stylized 3D asset design, imports, materials, scale, and animation.
  - `.codex/skills/tinyworld-integrations` — API, webhook, SSE, MCP, plugin, and automation examples.

## House style

- Vanilla ES6+, no semicolons would be wrong here — **this file uses
  semicolons**, follow the existing style.
- 2-space indent, trailing commas where present, single quotes for strings.
- Section comments are `// -------- name --------` and they matter — keep
  related code grouped under them. If you add a new system, give it its own
  section header.
- Boring obvious code over clever. The app is now feature-rich (~16k LoC), so
  prefer small, well-sectioned changes over clever abstractions.

## Mental model

Two parallel data structures:

```
world[x][z]                  // intent  — { terrain, terrainFloors, kind, floors }
cellMeshes['x,z']            // render — { tile: Group, object: Group|null }
```

Mutate via **`setCell(x, z, opts)`**. It:

1. updates `world[x][z]`,
2. rebuilds the tile mesh if terrain / terrainFloors changed (or `forceTile` is set),
3. rebuilds the object mesh,
4. re-renders adjacency-sensitive neighbors (fences, house clusters).

Never write to `world[x][z]` directly outside of init — go through `setCell`,
or you will desync intent from rendering.

## Adding a new object kind

1. Add a factory: `function makeWidget(...)` returning a `THREE.Group`.
2. Add a tool entry to `TOOLS` (id, label, kind, color, optional
   `terrainOverride`).
3. Handle the `kind` in `renderCellObject` — call your factory, set
   `userData.kind`, push a drop-in animation if appropriate.
4. If the kind needs adjacency awareness, write a `getXxxNeighbors(x, z)`
   helper and re-render neighbors inside `setCell` (mirror the fence/house
   pattern at the bottom of `setCell`).
5. If the kind animates per-frame, add a branch inside the `for (const key in
   cellMeshes)` loop in `animate()` and **respect `obj.userData.landing`** so
   it doesn't fight the drop-in.

## Adding a new terrain

1. Add a material to `M`.
2. Add a tool entry with `terrain: 'name'`.
3. Handle the name inside `makeTile(terrain)` — pick `topMat` and any decals
   (flecks, scuffs, ripples).

## Three.js gotchas in this codebase

- **r128** is pinned. `MeshLambertMaterial`, `ExtrudeGeometry`, and the
  shadow setup all assume r128 semantics. Do not bump the version casually —
  shadows and material color spaces have changed in newer releases.
- Materials in `M.*` are **shared** across many meshes. Don't mutate
  `M.foo.color` in place; clone first.
- `disposeGroup(group)` disposes geometries but **not** materials, because
  materials are shared. Per-particle smoke clones its material and disposes
  on death — follow that pattern if you ever need a unique material per
  instance.
- Cameras: `orthoCam`, `softCam`, and `persCam` exist; `camera` is a reference
  swapped by `togglePerspective()` / `setCameraMode()`. `updateCamera()` writes
  to all camera projections/positions as needed.

## Ward sim (Chang'an fang) life loop

The ward sim layers an autonomous simulation on top of the editor. Two
parallel data tracks, just like the editor's `world` / `cellMeshes`:

```
fang.buildings[id]        // intent  — economy + spec + residents[id...]
fang.agents[id]           // intent  — role + path + state + home/work
agentsGroup.children      // render  — Three.js Group per agent, scene-parented
```

Entry points (all on `window.__ward` for tests):

- **`setWardMode('manage'|'editor')`** flips `fang.mode` + `body.mode-manage`.
  The HUD, catalog, agents group, and ward toast only show in `manage`.
- **`enterWardModeWithOnboarding()`** is what the welcome CTA + mode toggle
  button call. Routes through the onboarding modal when `fang.buildings`
  is empty (3 branches: generate new ward / empty start / cancel).
- **`placeWardBuilding(type, x, z)`** is the single mutation path for
  buildings. It spends cost, calls `addBuilding`, writes `kind=fangBuilding`
  via `setCell`, and finally `spawnBuildingAgents(rec)`.
- **`progressPromises()`** completes delayed builds; same final hook.
- **`removeWardBuilding(id)`** calls `despawnBuildingAgents(rec)` BEFORE
  clearing cells, so the resident ids attached to `rec.residents` don't
  leak agents into the next mode switch.

### Adding a new building

1. Add an entry to `BUILDING_CATALOG` with `name`, `size`, `cost`, `factory`,
   `output`, and **`spawns: [{ role, count }]`**. `[]` is fine for purely
   decorative buildings (well/gate).
2. Add the id to `BUILDING_CATALOG_ORDER`.
3. The factory returns a Three.js Group; tile rendering is shared via
   the `fangBuilding` kind in `renderCellObject`.
4. Existing tests (`m2-build-place`, `m7-sim-life`) cover the spawn /
   cost / footprint contract.

### Adding a new agent role

1. Add a color entry to `AGENT_COLORS`.
2. Tweak `makeAgentMesh` if the role needs a hat/weapon accent.
3. Extend `brainPickTarget(agent, phase)` with the role's daytime + night
   behavior. Default fallback (`resident`) is wander+well+home.
4. Hook visitor lifecycle (`_visitor`, `_heading_out`) only if the role is
   a pilgrim-style transient.

### Sim cadence

Two independent ticks, on purpose:

- **Locomotion — every animate frame.** `animate()` calls
  `agentStep(dt, agent)` for every agent in `fang.agents` while
  `fang.mode === 'manage'`. That keeps mesh motion a smooth tween along
  the path (heading easing + a tiny walk-bob in `agentStep`) instead of
  teleporting on the 200ms gameplay cadence. Do **not** call `agentStep`
  from inside `simTick` — it would advance fx/fz twice and double agent
  speed.
- **Gameplay — `simTick(dt)` at ~5Hz** (accumulated dt clamped via
  `simAccum`). Per game-minute it calls:
  - `assignIdleTargets(currentMinute)` — idle agents get a fresh path via
    `bfsPath`. Throttled per-agent by `WARD_BRAIN.reassignEveryMinutes`.
  - `rollVisitorSpawn(currentMinute)` — probabilistic pilgrim arrival
    proportional to `(innCount + templeCount)`.
  - `reapVisitors()` — pilgrims past `leaveDay` route to the nearest gate
    and despawn on arrival.

Walkable-mask cache lives in `walkableMaskCache`. It is invalidated by
`setCell` on terrain/kind changes AND by `wardListeners` on building add/
remove + curfew toggle + policy + fang-hydrated. **Never** read
`walkableMaskCache` directly — go through `buildWalkable()` or `bfsPath`.

**Visibility-safe accumulator (don't break this).** `simAccum` adds
`Math.min(dt, 0.05)` per animate frame, *not* `(t - lastSimTick)`. When the
tab goes background, naive wall-clock diffing would fast-forward several
game-days on resume. The `visibilitychange` listener also resets
`simAccum = 0`. If you ever rewrite the sim loop, keep both protections.

### Three places that must agree on `kind` / `v`

When you add a new `world.kind` value (or bump schema), update **all
three** or runtime `validateWorld` will reject AI-generated / imported
worlds even when `npm test` is green:

1. `world.schema.json` — `kind` enum + (if bumping) `v` enum + top-level
   `properties` (`additionalProperties: false` is enforced, so any new
   top-level field must be declared, e.g. `fang`).
2. Embedded `WORLD_SCHEMA` in `tiny-world-builder.html` — kept JSON-
   semantically equivalent by `tools/check.js`.
3. Runtime `validateWorld` kind whitelist Set (`okKind`) — the **actual**
   gate for AI / import paths; the schemas are advisory.

### Test API surface

The ward sim deliberately exposes its internals on `window.__ward` for
Playwright. Used heavily in `tests/e2e/*.spec.js`:

```
window.__ward.{setWardMode, placeWardBuilding, removeWardBuilding,
  spawnAgent, despawnAgent, agentStep, bfsPath, buildWalkable,
  invalidateWalkable, agentRoleColor, AGENT_COLORS,
  BUILDING_CATALOG, BUILDING_CATALOG_ORDER,
  fang, agentsGroup, refreshAgentsVisibility,
  simTick, simDayRollover, applyDayPhase, dayPhaseFromMinute,
  forceEvent, applyEventChoice, rollEvents, EVENT_TEMPLATES,
  setPolicy, serializeFang, hydrateFang,
  clearWorldForTest, generateWardLayout, ...}
```

Also `window.__cropDusterRoot` for the manage-mode gating test, and
`window.__enterWardModeWithOnboarding` for the welcome CTA test. Treat
this surface as a contract — tests will break if names move.

## Performance budget

- Home grid starts at `8x8` but settings can expose up to `48x48`. Per-frame
  allocation is fine at small sizes; at larger grids, preserve progressive
  rendering and avoid broad synchronous rebuilds.

## Things to avoid

- Don't pull in npm packages or a bundler. The single-file constraint is the
  point.
- Don't rename `world` / `cellMeshes` / `setCell` — they're the public
  contract of the data layer.
- Don't remove the `userData.landing` checks. They prevent animations from
  fighting the drop-in queue.
- Don't "clean up" comments without asking.
- Don't touch `tiny-world-builder BACKUP.html` if that local snapshot exists.

## Quick checks before declaring done

- [ ] `npm test` passes.
- [ ] Page loads with no console errors.
- [ ] Tool keyboard shortcuts (`1`–`9`, `E`) still work.
- [ ] `R` / `F` raise and lower the hovered terrain; reset button restores the
      preset village; `C` clears to grass with the staggered drop-in.
- [ ] Perspective ⇄ ortho still toggles cleanly.
- [ ] Placing/erasing a fence updates its neighbors' geometry.
- [ ] Clusters of houses still render as L/T/+/square where appropriate.
- [ ] Smoke spawns from house chimneys after they finish landing.
- [ ] Welcome modal shows "进入长安坊" CTA; clicking it opens the ward
      onboarding modal.
- [ ] Entering ward mode with empty `fang.buildings` shows the onboarding
      modal; "生成新坊" creates walls/gates/streets/well and spawns at
      least 3 residents + 1 guard at the gates.
- [ ] In manage mode, idle agents pick new wander targets every few in-game
      minutes; pop stat (人 N/cap) in `#ward-hud` updates as residents
      come and go.
- [ ] Placing a `ciDengTemple` + waiting a few seconds spawns at least one
      pilgrim at a gate (toast shows "香客抵达").
