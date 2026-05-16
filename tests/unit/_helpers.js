// test/_helpers.js
// 单测/场景测共享的 fakeState 工厂。所有 Spec #3 函数接 state 参数，
// 测试只需构造一个最小可用的 state object，无需 mock module。

export function makeFakeState(overrides = {}) {
  const base = {
    day: 1,
    difficulty: 'standard',
    minute: 5 * 60 + 30,
    stats: {
      money: 120, labor: 6, wood: 12, cloth: 0, guards: 2,
      population: 8, morale: 55, order: 52, fame: 25, gov: 42,
      prosperity: 0, fireRisk: 0, congestion: 0,
    },
    hudUnlocked: {
      money: true, labor: true, plots: true, morale: true,
      wood: true, cloth: false, guards: false,
      order: false, fame: false, gov: false,
      prosperity: false, fireRisk: false, congestion: false,
    },
    plots: [],
    buildings: {},
    petitions: [],
    nextPetitionId: 1,
    lastNewcomerDay: 0,
    groups: [],
    nextGroupId: 1,
    relations: null,
    chapterStage: null,
    chapterSoftMissed: false,
    localEffects: { byPlot: {}, warnings: [] },
    localEffectMemory: {},
    skilledResidents: 0,
    workersAssigned: 0,
    // slice-1
    promises: [],
    nextPromiseId: 1,
    // slice-2
    lastNewcomerSettleDay: 0,
    weaverRequestQueued: false,
    // slice-3
    lastTempleFestivalSettleDay: 0,
    lanternProgress: 0,
    nobleStewardEligible: false,
    // slice-9
    totalUnlocked: 0,
    flags: {
      templeNegotiatedTier: 0,
      govPermittedTier: 0,
      templeNegotiateCooldown: [0, 0, 0, 0],
      govPermitCooldown: [0, 0, 0, 0],
    },
    // Spec #4
    events: [],
    nextEventId: 1,
    lastFireDay: 0,
    lastStampedeDay: 0,
    lastInspectionDay: 0,
    guardAssignments: { patrol: 1 },
    // Spec #5
    templeRefurbished: false,
    lastPilgrimDay: 0,
    lastRitualDay: 0,
    lanternFestivalDone: false,
    lastLanternDay: 0,
    passiveMoneyBonus: 0,
    // Spec #6
    nobleAccepted: false,
    lastStewardDay: 0,
    mansionBuiltOnDay: 0,
    vendorRestrictionDone: false,
    scandalDone: false,
    // Spec #7
    lastVendorStallDay: 0,
    blackMarketDone: false,
    caravanOrders: 0,
    stance: { civil: 0, faith: 0, trade: 0, power: 0 },
    // slice-12
    lanternDonationDone: false,
    vendorNobleClashDone: false,
    vendorNobleClashOutcome: null,
    templeMediationDone: false,
  };
  return deepMerge(base, overrides);
}

function deepMerge(target, source) {
  const out = { ...target };
  for (const k of Object.keys(source)) {
    if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k])) {
      out[k] = deepMerge(target[k] || {}, source[k]);
    } else {
      out[k] = source[k];
    }
  }
  return out;
}

let plotCounter = 100;
function newPlotId(prefix) { return `${prefix}-${++plotCounter}`; }

export function makeBuiltHousePlot(idSuffix) {
  const id = idSuffix ? `house-test-${idSuffix}` : newPlotId('house-plot');
  return {
    id,
    quadrant: 'SE',
    origin: { x: 10, y: 10 }, size: { w: 1, h: 1 },
    cells: [{ x: 10, y: 10 }],
    status: 'built',
    mergedInto: null,
    building: id.replace('-plot-', '-'),
    mergeableWith: [],
    project: null,
    doorCell: { x: 10, y: 11 },
  };
}

export function makeBuiltWeaverPlot(idSuffix) {
  const id = idSuffix ? `weaver-test-${idSuffix}` : newPlotId('weaver-plot');
  return {
    id,
    quadrant: 'SE',
    origin: { x: 12, y: 10 }, size: { w: 1, h: 2 },
    cells: [{ x: 12, y: 10 }, { x: 12, y: 11 }],
    status: 'built',
    mergedInto: null,
    building: id.replace('-plot-', '-'),
    mergeableWith: [],
    project: null,
    doorCell: { x: 11, y: 10 },
  };
}

export function makeBuiltInnPlot(idSuffix) {
  const id = idSuffix ? `inn-test-${idSuffix}` : newPlotId('inn-plot');
  return {
    id,
    quadrant: 'NW',
    origin: { x: 4, y: 4 }, size: { w: 2, h: 1 },
    cells: [{ x: 4, y: 4 }, { x: 5, y: 4 }],
    status: 'built',
    mergedInto: null,
    building: id.replace('-plot-', '-'),
    mergeableWith: [],
    project: null,
    doorCell: { x: 4, y: 5 },
  };
}

export function makeBuiltMansionPlot(idSuffix) {
  const id = idSuffix ? `mansion-test-${idSuffix}` : newPlotId('mansion-plot');
  return {
    id,
    quadrant: 'NE',
    origin: { x: 11, y: 4 }, size: { w: 2, h: 2 },
    cells: [{ x: 11, y: 4 }, { x: 12, y: 4 }, { x: 11, y: 5 }, { x: 12, y: 5 }],
    status: 'built',
    mergedInto: null,
    building: id.replace('-plot-', '-'),
    mergeableWith: [],
    project: null,
    doorCell: { x: 11, y: 6 },
  };
}

export function makeBuiltIncensePlot(idSuffix) {
  const id = idSuffix ? `incense-test-${idSuffix}` : newPlotId('incense-plot');
  return {
    id,
    quadrant: 'SW',
    origin: { x: 4, y: 11 }, size: { w: 2, h: 2 },
    cells: [{ x: 4, y: 11 }, { x: 5, y: 11 }, { x: 4, y: 12 }, { x: 5, y: 12 }],
    status: 'built',
    mergedInto: null,
    building: id.replace('-plot-', '-'),
    mergeableWith: [],
    project: null,
    doorCell: { x: 4, y: 13 },
  };
}

// 给 fakeState 注册 plot.building 对应的 BUILDINGS_BY_ID entry，让 citizens.js 的
// state.buildings[plot.building].kind 查询能跑通。
export function registerBuildings(state, plots) {
  for (const p of plots) {
    if (!p.building) continue;
    let kind;
    if (p.building.startsWith('house')) kind = 'house';
    else if (p.building.startsWith('weaver')) kind = 'weaver';
    else if (p.building.startsWith('incense')) kind = 'incense';
    else if (p.building.startsWith('inn')) kind = 'inn';
    else if (p.building.startsWith('guardpos')) kind = 'guardpos';
    else if (p.building.startsWith('mansion')) kind = 'mansion';
    else kind = 'unknown';
    state.buildings[p.building] = { id: p.building, kind, name: kind };
  }
}
