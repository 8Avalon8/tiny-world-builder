// src/world/gates.js
// 4 个坊门的初始数据。每个门 cell 同时是十字街的尽头格。

export function buildInitialGates() {
  return {
    N: { id: 'N', cell: { x: 7, y: 0  }, cellSpan: { w: 2, h: 1 }, externalSource: 'official', todayTraffic: 0, lastVisitor: null },
    S: { id: 'S', cell: { x: 7, y: 15 }, cellSpan: { w: 2, h: 1 }, externalSource: 'commoner', todayTraffic: 0, lastVisitor: null },
    E: { id: 'E', cell: { x: 15, y: 7 }, cellSpan: { w: 1, h: 2 }, externalSource: 'market',   todayTraffic: 0, lastVisitor: null },
    W: { id: 'W', cell: { x: 0,  y: 7 }, cellSpan: { w: 1, h: 2 }, externalSource: 'temple',   todayTraffic: 0, lastVisitor: null },
  };
}

export const GATE_CELLS = [
  { gate: 'N', x: 7, y: 0  }, { gate: 'N', x: 8, y: 0  },
  { gate: 'S', x: 7, y: 15 }, { gate: 'S', x: 8, y: 15 },
  { gate: 'E', x: 15, y: 7 }, { gate: 'E', x: 15, y: 8 },
  { gate: 'W', x: 0,  y: 7 }, { gate: 'W', x: 0,  y: 8 },
];

export function gateCellSet() {
  const s = new Set();
  for (const g of GATE_CELLS) s.add(`${g.x},${g.y}`);
  return s;
}
