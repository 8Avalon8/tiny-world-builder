// src/agents/spatial-query.js
// PR4: 5Hz signal 扫描时调用，线性 O(N) 距离判定。
// 不持久化、不维护 dirty bucket（spec §7.2 决定）。

export function queryRadius(agents, cx, cy, r) {
  const out = [];
  const r2 = r * r;
  for (const a of agents) {
    const dx = a.x - cx;
    const dy = a.y - cy;
    if (dx * dx + dy * dy <= r2) out.push(a);
  }
  return out;
}
