// src/world/buildings.js
// 建筑模板字典。建筑不再持有自己的世界坐标，
// 位置完全由 plot.origin + plot.size 决定（详见 world/plots.js）。
// 渲染层用 plot.building 反查本字典获取 name/kind/color/height。

export const BUILDINGS_BY_ID = {
  ciDengTemple: {
    id: 'ciDengTemple',
    name: '慈灯寺',
    kind: 'temple',
    height: 3.0,
    roofColor: '#a05a3c',
    wallColor: '#d9b88a',
    visual: { roof: 'pagoda', features: ['pagoda-roof', 'incense-smoke'] },
  },
  'house-01': {
    id: 'house-01',
    name: '民宅',
    kind: 'house',
    height: 0.5,
    roofColor: '#7a4f33',
    wallColor: '#cda77b',
    visual: { roof: 'low', features: ['yard'] },
  },
  'house-02': {
    id: 'house-02',
    name: '民宅',
    kind: 'house',
    height: 0.5,
    roofColor: '#7a4f33',
    wallColor: '#cda77b',
    visual: { roof: 'low', features: ['yard'] },
  },
  'house-03': {
    id: 'house-03',
    name: '民宅',
    kind: 'house',
    height: 0.5,
    roofColor: '#7a4f33',
    wallColor: '#cda77b',
    visual: { roof: 'low', features: ['yard'] },
  },
};

// 旧导出 BUILDINGS（数组）已废弃。
// 任何仍在 import { BUILDINGS } from '../world/buildings.js' 的代码都会报错——
// 那是预期中的，会在 pipeline.js 改造任务里修复（改为遍历 state.plots）。

// === Spec #2：可建建筑目录 ===
// BUILDING_CATALOG[type] 是「可建造的建筑模板」。
// onComplete 字段约定：
//   - 数字字段（如 population/guards/fame）→ state.stats[key] += value
//   - unlock: 'X' → state.hudUnlocked[X] = true
// completeProject() 用 catalog.template 拷贝出新建筑实例（id 自增）。

export const BUILDING_CATALOG = {
  house: {
    name: '民宅', category: '民居',
    size: { w: 1, h: 1 },
    cost: { labor: 2, money: 8, wood: 3 },
    buildHours: 6,
    onComplete: { population: +3 },
    template: { kind: 'house', height: 0.5, roofColor: '#7a4f33', wallColor: '#cda77b',
      visual: { roof: 'low', features: ['yard'] } },
  },
  guardpos: {
    name: '坊正所', category: '公署',
    size: { w: 1, h: 1 },
    cost: { labor: 2, money: 12, wood: 3 },
    buildHours: 6,
    onComplete: { guards: +1 },
    template: { kind: 'guardpos', height: 1.2, roofColor: '#5a4030', wallColor: '#b89a72',
      visual: { roof: 'watch', features: ['banner'] } },
  },
  weaver: {
    name: '织棚', category: '工坊',
    size: { w: 1, h: 2 },
    cost: { labor: 3, money: 15, wood: 5 },
    buildHours: 8,
    onComplete: { unlock: 'cloth' },
    template: { kind: 'weaver', height: 0.9, roofColor: '#7a5a3a', wallColor: '#d2b88a',
      visual: { roof: 'shed', features: ['loom'] } },
  },
  incense: {
    name: '香铺', category: '商铺',
    size: { w: 2, h: 2 },
    cost: { labor: 4, money: 25, wood: 6 },
    buildHours: 10,
    onComplete: { unlock: 'prosperity', fame: +5 },
    template: { kind: 'incense', height: 1.4, roofColor: '#9b3f2c', wallColor: '#e0c089',
      visual: { roof: 'shop', features: ['sign', 'lantern'] } },
  },
  inn: {
    name: '客舍', category: '商铺',
    size: { w: 2, h: 2 },
    cost: { labor: 4, money: 30, wood: 8 },
    buildHours: 12,
    onComplete: { unlock: 'congestion', fame: +3 },
    template: { kind: 'inn', height: 1.6, roofColor: '#5e3925', wallColor: '#c8a26f',
      visual: { roof: 'shop', features: ['sign', 'courtyard'] } },
  },
  mansion: {
    name: '达官府邸', category: '权贵',
    size: { w: 2, h: 2 },
    cost: { labor: 8, money: 50, wood: 20, cloth: 5 },
    buildHours: 16,
    onComplete: { fame: +20, gov: +15, morale: -8 },
    template: { kind: 'mansion', height: 2.0, roofColor: '#5a2a14', wallColor: '#a0795a',
      visual: { roof: 'mansion', features: ['courtyard', 'gate'] } },
    requiredQuadrant: 'NE',
    requiresUnlock: 'nobleAccepted',
  },
};
