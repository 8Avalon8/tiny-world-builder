// src/world/local-effects.js
// 局部影响场：把「建筑位置」翻译成地图上可见的社会后果。
// 不追求精确模拟，只把玩家能感知的影响压成少量标签：烟火、拥堵、香火、商气、威势、怨气。

const EMPTY = () => ({ smoke: 0, crowd: 0, faith: 0, market: 0, prestige: 0, resentment: 0, fire: 0, quiet: 0, notes: [] });

function distPlots(a, b) {
  let min = Infinity;
  for (const ca of a.cells || []) {
    for (const cb of b.cells || []) {
      const d = Math.abs(ca.x - cb.x) + Math.abs(ca.y - cb.y);
      if (d < min) min = d;
    }
  }
  return min;
}

function add(e, key, amount, note = null) {
  e[key] = (e[key] || 0) + amount;
  if (note && !e.notes.includes(note)) e.notes.push(note);
}

function effectForKind(kind) {
  switch (kind) {
    case 'temple': return { faith: 30, crowd: 12, quiet: 8 };
    case 'house': return { quiet: 10 };
    case 'weaver': return { market: 8, fire: 8, smoke: 10, crowd: 6 };
    case 'incense': return { faith: 10, market: 20, fire: 16, smoke: 18, crowd: 15 };
    case 'inn': return { market: 18, crowd: 22, fire: 6 };
    case 'guardpos': return { quiet: 10 };
    case 'mansion': return { prestige: 35, quiet: 25, crowd: -8 };
    default: return {};
  }
}

export function recomputeLocalEffects(state) {
  const byPlot = {};
  const warnings = [];
  for (const p of state.plots || []) byPlot[p.id] = EMPTY();

  const built = (state.plots || []).filter(p => p.status === 'built');
  for (const source of built) {
    const b = state.buildings[source.building];
    if (!b) continue;
    const base = effectForKind(b.kind);
    for (const target of state.plots || []) {
      const d = distPlots(source, target);
      if (d > 3) continue;
      const strength = d === 0 ? 1 : d === 1 ? 0.65 : d === 2 ? 0.35 : 0.18;
      const e = byPlot[target.id];
      for (const [k, v] of Object.entries(base)) add(e, k, Math.round(v * strength));
    }
  }

  for (const p of built) {
    const b = state.buildings[p.building];
    if (!b) continue;
    const e = byPlot[p.id];
    if (b.kind === 'house') {
      if (e.smoke >= 14) {
        add(e, 'resentment', 12, '烟火扰宅');
        warnings.push({ plotId: p.id, type: 'resentment', label: '民宅烟火扰邻', text: `${p.id} 民宅受烟火扰邻，井边怨言渐起。` });
      }
      if (e.crowd >= 28) {
        add(e, 'resentment', 10, '门前拥挤');
        warnings.push({ plotId: p.id, type: 'congestion', label: '民宅门前拥挤', text: `${p.id} 民宅门前人流拥挤，老居民开始抱怨。` });
      }
    }
    if (b.kind === 'weaver') {
      const nearHouse = built.some(o => o.id !== p.id && state.buildings[o.building]?.kind === 'house' && distPlots(p, o) <= 1);
      if (nearHouse) {
        add(e, 'resentment', 14, '机杼扰邻');
        warnings.push({ plotId: p.id, type: 'weaver-neighbor', label: '织棚扰邻', text: `${p.id} 织棚临近民宅，机杼声惊动邻里。` });
      }
    }
    if (b.kind === 'incense' && e.fire >= 20) {
      warnings.push({ plotId: p.id, type: 'fire', label: '香铺灯油火患', text: `${p.id} 香铺香火旺，灯油堆得太近。` });
    }
    if (b.kind === 'mansion' && e.market >= 12) {
      warnings.push({ plotId: p.id, type: 'mansion-market', label: '府前喧闹', text: `${p.id} 府邸附近商气太重，护院已有不满。` });
    }
  }

  state.localEffects = { byPlot, warnings };
  return state.localEffects;
}

export function localEffectForPlot(state, plotId) {
  if (!state.localEffects || !state.localEffects.byPlot) recomputeLocalEffects(state);
  return state.localEffects?.byPlot?.[plotId] || EMPTY();
}

export function localEffectSummary(state, plotId) {
  const e = localEffectForPlot(state, plotId);
  const parts = [];
  if (e.faith >= 15) parts.push(`香火 ${e.faith}`);
  if (e.market >= 15) parts.push(`商气 ${e.market}`);
  if (e.crowd >= 18) parts.push(`拥堵 ${e.crowd}`);
  if (e.smoke >= 12) parts.push(`烟火 ${e.smoke}`);
  if (e.prestige >= 15) parts.push(`威势 ${e.prestige}`);
  if (e.resentment >= 10) parts.push(`怨气 ${e.resentment}`);
  return parts;
}

export function applyLocalEffectConsequences(state, addLog = null) {
  const effects = recomputeLocalEffects(state);
  if (!state.localEffectMemory) state.localEffectMemory = {};
  let moralePenalty = 0;
  let fireAdd = 0;
  let crowdAdd = 0;

  for (const w of effects.warnings) {
    const key = `${w.type}:${w.plotId}`;
    if (state.localEffectMemory[key] !== state.day) {
      state.localEffectMemory[key] = state.day;
      if (addLog) addLog(w.text);
    }
    if (w.type === 'resentment' || w.type === 'weaver-neighbor' || w.type === 'congestion') moralePenalty += 1;
    if (w.type === 'fire') fireAdd += 4;
    if (w.type === 'congestion') crowdAdd += 2;
  }

  if (moralePenalty > 0) state.stats.morale = Math.max(0, (state.stats.morale || 0) - Math.min(3, moralePenalty));
  if (fireAdd > 0) state.stats.fireRisk = Math.max(state.stats.fireRisk || 0, (state.stats.fireRisk || 0) + fireAdd);
  if (crowdAdd > 0) state.stats.congestion = (state.stats.congestion || 0) + crowdAdd;
  return { moralePenalty, fireAdd, crowdAdd, warnings: effects.warnings.length };
}
