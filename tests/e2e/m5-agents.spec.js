// M5 (agents portion): spawn/despawn, mesh disposal, BFS pathing,
// agent step lerps along path, visibility binding to manage mode.
const { test, expect } = require('@playwright/test');
const { openApp, enterManageMode, clearWorld } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('M5 spawnAgent registers agent and adds mesh to agentsGroup', async ({ page }) => {
  await enterManageMode(page);
  const out = await page.evaluate(() => {
    const w = window.__ward;
    const a = w.spawnAgent({ role: 'pilgrim', x: 4, z: 4 });
    return {
      hasId: !!a.id,
      role: a.role,
      x: a.x, z: a.z,
      registered: !!w.fang.agents[a.id],
      meshAdded: w.agentsGroup.children.includes(a.mesh),
      hasMaterials: a.mesh.userData.materials && a.mesh.userData.materials.length === 2,
    };
  });
  expect(out.hasId).toBe(true);
  expect(out.role).toBe('pilgrim');
  expect(out.x).toBe(4);
  expect(out.z).toBe(4);
  expect(out.registered).toBe(true);
  expect(out.meshAdded).toBe(true);
  expect(out.hasMaterials).toBe(true);
});

test('M5 different roles get different tints', async ({ page }) => {
  const out = await page.evaluate(() => {
    const w = window.__ward;
    return {
      resident: w.agentRoleColor('resident'),
      monk:     w.agentRoleColor('monk'),
      guard:    w.agentRoleColor('guard'),
      noble:    w.agentRoleColor('noble'),
      unknown:  w.agentRoleColor('xyz'),
    };
  });
  // All four named roles should be distinct
  const known = [out.resident, out.monk, out.guard, out.noble];
  const uniq = new Set(known);
  expect(uniq.size).toBe(4);
  // Unknown falls back to resident
  expect(out.unknown).toBe(out.resident);
});

test('M5 despawnAgent removes the agent and its mesh', async ({ page }) => {
  await enterManageMode(page);
  const out = await page.evaluate(() => {
    const w = window.__ward;
    const a = w.spawnAgent({ role: 'guard', x: 2, z: 2 });
    const meshRefBefore = w.agentsGroup.children.length;
    const removed = w.despawnAgent(a.id);
    const meshRefAfter = w.agentsGroup.children.length;
    return {
      removed,
      stillInFang: !!w.fang.agents[a.id],
      meshDelta: meshRefBefore - meshRefAfter,
    };
  });
  expect(out.removed).toBe(true);
  expect(out.stillInFang).toBe(false);
  expect(out.meshDelta).toBe(1);
});

test('M5 agentsGroup visibility tracks fang.mode', async ({ page }) => {
  const out = await page.evaluate(() => {
    const w = window.__ward;
    const v0 = w.agentsGroup.visible;
    w.setWardMode('manage');
    w.refreshAgentsVisibility();
    const v1 = w.agentsGroup.visible;
    w.setWardMode('editor');
    w.refreshAgentsVisibility();
    const v2 = w.agentsGroup.visible;
    return { v0, v1, v2 };
  });
  expect(out.v0).toBe(false);
  expect(out.v1).toBe(true);
  expect(out.v2).toBe(false);
});

test('M5 buildWalkable marks empty grass cells as walkable', async ({ page }) => {
  await clearWorld(page);
  const out = await page.evaluate(() => {
    const w = window.__ward;
    const mask = w.buildWalkable();
    // After clearWorld, every cell is grass + no kind. All should be walkable.
    let walkable = 0;
    for (let i = 0; i < mask.length; i++) walkable += mask[i];
    return { walkable, total: mask.length };
  });
  // GRID=8 → 64 cells. After clearWorld, every cell is walkable.
  expect(out.walkable).toBe(out.total);
});

test('M5 buildWalkable blocks fangBuilding footprint cells', async ({ page }) => {
  await clearWorld(page);
  const out = await page.evaluate(() => {
    const w = window.__ward;
    w.fang.money = 200; w.fang.wood = 200; w.fang.labor = 20;
    w.placeWardBuilding('residence', 3, 3);
    w.invalidateWalkable('test');
    const mask = w.buildWalkable();
    return { idx33: mask[3 * 8 + 3], idx00: mask[0] };
  });
  expect(out.idx33).toBe(0);
  expect(out.idx00).toBe(1);
});

test('M5 bfsPath returns a route from start to a walkable target', async ({ page }) => {
  await clearWorld(page);
  const path = await page.evaluate(() => {
    const w = window.__ward;
    w.invalidateWalkable('test');
    return w.bfsPath(0, 0, 3, 0);
  });
  // Path from (0,0) to (3,0) on empty grid: 3 east-only steps
  expect(path).toBeTruthy();
  expect(path.length).toBe(3);
  expect(path[path.length - 1]).toEqual([3, 0]);
});

test('M5 bfsPath returns null when no route exists (target blocked + isolated)', async ({ page }) => {
  await clearWorld(page);
  const path = await page.evaluate(() => {
    const w = window.__ward;
    // Surround (4,4) with buildings so it's isolated AND the target itself
    // is also a building, leaving no reachable adjacent.
    w.fang.money = 9999; w.fang.wood = 9999; w.fang.labor = 99;
    w.placeWardBuilding('residence', 4, 4);
    w.placeWardBuilding('residence', 3, 4);
    w.placeWardBuilding('residence', 5, 4);
    w.placeWardBuilding('residence', 4, 3);
    w.placeWardBuilding('residence', 4, 5);
    w.invalidateWalkable('test');
    return w.bfsPath(0, 0, 4, 4);
  });
  expect(path).toBeNull();
});

test('M5 agentStep advances fx/fz along a given path', async ({ page }) => {
  await enterManageMode(page);
  const out = await page.evaluate(async () => {
    const w = window.__ward;
    const a = w.spawnAgent({ role: 'resident', x: 0, z: 0 });
    a.path = [[1, 0], [2, 0]];
    a.pathIdx = 0;
    // 1 sec at 3 cells/sec = 3 cells covered — should reach end and reset
    // path/pathIdx (both wipe to 0 in the agent's idle resting state).
    w.agentStep(1, a);
    return {
      finalX: a.x, finalZ: a.z,
      pathLen: a.path.length, idx: a.pathIdx,
      state: a.state,
      meshX: a.mesh.position.x, meshZ: a.mesh.position.z,
    };
  });
  expect(out.finalX).toBe(2);
  expect(out.finalZ).toBe(0);
  expect(out.pathLen).toBe(0);
  expect(out.idx).toBe(0);
  expect(out.state).toBe('idle');
});

test('M5 hydrateFang restores agents with fresh meshes', async ({ page }) => {
  await enterManageMode(page);
  const out = await page.evaluate(() => {
    const w = window.__ward;
    // Spawn one agent so we can verify hydrate preserves count
    w.spawnAgent({ role: 'pilgrim', x: 1, z: 1 });
    const snap = w.serializeFang();
    // Now wipe everything and hydrate from snap
    w.hydrateFang(snap);
    const ids = Object.keys(w.fang.agents);
    const agent = w.fang.agents[ids[0]];
    return {
      count: ids.length,
      role: agent && agent.role,
      hasMesh: !!(agent && agent.mesh),
      meshInGroup: agent && w.agentsGroup.children.includes(agent.mesh),
    };
  });
  expect(out.count).toBe(1);
  expect(out.role).toBe('pilgrim');
  expect(out.hasMesh).toBe(true);
  expect(out.meshInGroup).toBe(true);
});
