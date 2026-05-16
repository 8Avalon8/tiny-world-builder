// src/utils.js
// 纯函数工具，无任何依赖，无 DOM 访问。

export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const rand = (min, max) => min + Math.random() * (max - min);
export const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a, b, t) => a + (b - a) * t;

export function weightedChoice(items) {
  let sum = 0;
  for (const [, w] of items) sum += w;
  let r = Math.random() * sum;
  for (const [value, w] of items) {
    r -= w;
    if (r <= 0) return value;
  }
  return items[items.length - 1][0];
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
  ));
}

export function formatStatDelta(effects) {
  const labelMap = { money: '钱粮', support: '民心', order: '秩序', fame: '声望', gov: '官府', pop: '人口' };
  return Object.entries(effects || {})
    .map(([k, v]) => `${labelMap[k] || k}${v >= 0 ? '+' : ''}${v}`)
    .join('，');
}
