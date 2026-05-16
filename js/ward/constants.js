// ward/constants.js — pure-data constants for the Chang'an ward sim.
//
// IMPORTANT: BUILDING_CATALOG entries that reference factory functions
// (`makeFang*`) stay in tiny-world-builder.html for now — the factories
// are deeply tied to Three.js Group creation and can't move until
// engine/cell-objects.js + ward/buildings.js are extracted. Instead, the
// metadata-only catalog descriptors live here (everything except `factory`)
// so the data shape is portable; the inline runtime still owns the live
// catalog with factory wired in.
//
// AGENT_COLORS, BALANCE, WARD_BRAIN are pure constants and ship intact.

export const BUILDING_CATALOG_ORDER = [
  'centralWell', 'residence', 'loomShed', 'incenseShop',
  'fangAdmin', 'inn', 'nobleManor', 'ciDengTemple', 'fangGate',
];

// Catalog metadata WITHOUT the `factory` function — that field is bound
// in main.js at assembly time when ward/buildings.js exports the factory
// map. Until PR-2 Step 19 the inline runtime owns the merged catalog.
export const BUILDING_CATALOG_META = {
  centralWell: {
    name: '中央水井', size: [1, 1],
    cost: { money: 20, wood: 4, labor: 1 },
    daysToBuild: 1,
    output: { fireRisk: -1, morale: 1 },
    spawns: [],
  },
  residence: {
    name: '民居', size: [1, 1],
    cost: { money: 12, wood: 6, labor: 1 },
    daysToBuild: 1,
    output: { labor: 1 },
    spawns: [{ role: 'resident', count: 2 }],
  },
  loomShed: {
    name: '织棚', size: [2, 1],
    cost: { money: 30, wood: 10, labor: 2 },
    daysToBuild: 1,
    output: { cloth: 3, fireRisk: 0.5 },
    spawns: [{ role: 'resident', count: 1 }],
  },
  incenseShop: {
    name: '香铺', size: [1, 1],
    cost: { money: 28, wood: 6, labor: 1 },
    daysToBuild: 1,
    output: { money: 2, fireRisk: 0.8 },
    spawns: [{ role: 'resident', count: 1 }],
  },
  fangAdmin: {
    name: '坊正所', size: [1, 2],
    cost: { money: 60, wood: 12, labor: 2 },
    daysToBuild: 2,
    output: { gov: 2, order: 2 },
    spawns: [{ role: 'guard', count: 2 }],
  },
  inn: {
    name: '客舍', size: [2, 2],
    cost: { money: 70, wood: 18, labor: 3 },
    daysToBuild: 2,
    output: { money: 5, congestion: 0.4 },
    spawns: [{ role: 'resident', count: 1 }],
    visitorMagnet: true,
  },
  nobleManor: {
    name: '达官府邸', size: [2, 2],
    cost: { money: 150, wood: 30, labor: 4 },
    daysToBuild: 3,
    output: { gov: 3, fame: 4 },
    spawns: [{ role: 'noble', count: 1 }],
  },
  ciDengTemple: {
    name: '慈灯寺', size: [2, 2],
    cost: { money: 80, wood: 30, labor: 6 },
    daysToBuild: 3,
    output: { fame: 1 },
    spawns: [{ role: 'monk', count: 1 }],
    visitorMagnet: true,
  },
  fangGate: {
    name: '坊门', size: [1, 1],
    cost: { money: 40, wood: 8, labor: 2 },
    daysToBuild: 1,
    output: { order: 1 },
    writeKind: 'fangGate',
  },
};

export const AGENT_COLORS = {
  resident: 0xa86c40,
  pilgrim:  0xb5a062,
  monk:     0xa05a2a,
  guard:    0x2a4d6a,
  merchant: 0x6a4a8a,
  thief:    0x3a2620,
  noble:    0x8a3a6a,
};

export const BALANCE = {
  daily: { rent: -8, taxIn: 6, fireDecay: -0.5, congestionDecay: -0.4 },
  agents: { spawnRatePerInn: 0.4, monkPerTemple: 1, guardPerAdmin: 1, max: 30 },
  eventTriggers: {
    fire:   { fireRiskAtLeast: 4, baseChance: 0.15 },
    crowd:  { congestionAtLeast: 5, baseChance: 0.12 },
    bandit: { orderAtMost: 30, baseChance: 0.10 },
    noble:  { fameAtLeast: 30, baseChance: 0.08 },
  },
  fame: { recognition: 50, prestige: 100, capital: 200 },
  events: { ttlDays: 2 },
  petitions: { perDayMin: 1, perDayMax: 3, ttlDays: 3, fameMultiplier: 0.02 },
  promises: { fallbackDays: 2 },
};

export const WARD_BRAIN = {
  reassignEveryMinutes: 4,
  nightHomeRadius: 2,
  visitorChancePerInnPerDay: 0.5,
  visitorChancePerTemplePerDay: 0.8,
  visitorStayMinDays: 1,
};
