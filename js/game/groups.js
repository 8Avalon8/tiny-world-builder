// src/world/groups.js
// 轻量「人群 / 户群」系统。
// 目标不是模拟每个居民的人生，而是让请愿与承诺留下可见、可记忆的社会单位。
// 请愿出现 → 生成 group；承诺兑现/失败 → group 改变状态；agent 层再按 group 状态生成小人。

const DEFAULT_MEMORY_LIMIT = 5;

const GROUP_NAME_POOL = {
  newcomer: ['王氏织户', '李氏新民', '赵家佃户', '陈氏布户'],
  weaverFamily: ['王氏织户', '沈氏织户', '卢家织户'],
  pilgrim: ['西门香客'],
  merchant: ['东门行商'],
  noble: ['北门管事'],
};

export function ensureGroupState(state) {
  if (!Array.isArray(state.groups)) state.groups = [];
  if (!state.nextGroupId) state.nextGroupId = 1;
  if (!state.relations) {
    state.relations = {
      residents: { label: '本坊老居民', trust: 0, memories: [] },
      temple:    { label: '慈灯寺', trust: 0, memories: [] },
      vendors:   { label: '行商摊贩', trust: 0, memories: [] },
      noble:     { label: '达官势力', trust: 0, memories: [] },
      office:    { label: '官府', trust: 0, memories: [] },
    };
  }
}

export function newGroupId(state) {
  ensureGroupState(state);
  return `grp-${String(state.nextGroupId++).padStart(3, '0')}`;
}

function pickName(kind, index) {
  const pool = GROUP_NAME_POOL[kind] || GROUP_NAME_POOL.newcomer;
  return pool[index % pool.length];
}

export function createGroup(state, def = {}) {
  ensureGroupState(state);
  const id = def.id || newGroupId(state);
  const index = state.groups.length;
  const group = {
    id,
    name: def.name || pickName(def.kind || 'newcomer', index),
    kind: def.kind || 'newcomer',
    status: def.status || 'waiting-outside', // waiting-outside / promised / settled / vagrant / departed
    sourceGate: def.sourceGate || 'S',
    createdDay: state.day || 1,
    petitionId: def.petitionId || null,
    promiseId: def.promiseId || null,
    homePlotId: def.homePlotId || null,
    workPlotId: def.workPlotId || null,
    relation: def.relation || 0,
    needs: [...(def.needs || [])],
    memories: [...(def.memories || [])],
    agentIds: [],
    lastAgentSpawnAt: 0,
  };
  state.groups.push(group);
  return group;
}

export function getGroup(state, id) {
  ensureGroupState(state);
  return state.groups.find(g => g.id === id) || null;
}

export function getGroupByPetition(state, petitionId) {
  ensureGroupState(state);
  return state.groups.find(g => g.petitionId === petitionId) || null;
}

export function getGroupByPromise(state, promiseId) {
  ensureGroupState(state);
  return state.groups.find(g => g.promiseId === promiseId) || null;
}

export function attachGroupToPetition(state, pet, def = {}) {
  ensureGroupState(state);
  if (!pet) return null;
  if (pet.groupId) return getGroup(state, pet.groupId);
  const group = createGroup(state, {
    kind: def.kind || (pet.kind === 'newcomer' ? 'weaverFamily' : pet.kind),
    name: def.name,
    sourceGate: pet.sourceGate,
    petitionId: pet.id,
    needs: def.needs || [],
    memories: def.memories || [],
  });
  pet.groupId = group.id;
  return group;
}

export function attachGroupToPromise(state, promise, groupId) {
  if (!promise || !groupId) return null;
  const group = getGroup(state, groupId);
  if (!group) return null;
  promise.groupId = groupId;
  group.promiseId = promise.id;
  return group;
}

export function rememberGroup(group, text) {
  if (!group || !text) return;
  group.memories = group.memories || [];
  group.memories.unshift(text);
  group.memories = group.memories.slice(0, DEFAULT_MEMORY_LIMIT);
}

export function rememberRelation(state, key, text, delta = 0) {
  ensureGroupState(state);
  const rel = state.relations[key];
  if (!rel) return;
  rel.trust = Math.max(-100, Math.min(100, (rel.trust || 0) + delta));
  if (text) {
    rel.memories = rel.memories || [];
    rel.memories.unshift(text);
    rel.memories = rel.memories.slice(0, DEFAULT_MEMORY_LIMIT);
  }
}

export function markPetitionAccepted(state, pet) {
  const group = pet?.groupId ? getGroup(state, pet.groupId) : getGroupByPetition(state, pet?.id);
  if (!group) return null;
  group.status = 'promised';
  rememberGroup(group, '坊正接纳入坊，但安置尚未兑现。');
  return group;
}

export function markPetitionRejected(state, pet) {
  const group = pet?.groupId ? getGroup(state, pet.groupId) : getGroupByPetition(state, pet?.id);
  if (!group) return null;
  group.status = 'departed';
  group.relation -= 8;
  rememberGroup(group, '被拒于坊门外。');
  rememberRelation(state, 'residents', '有人议论坊门过严，新民未得收留。', -1);
  return group;
}

export function markPetitionExpired(state, pet) {
  const group = pet?.groupId ? getGroup(state, pet.groupId) : getGroupByPetition(state, pet?.id);
  if (!group) return null;
  group.status = 'departed';
  group.relation -= 5;
  rememberGroup(group, '久候无果，自行散去。');
  return group;
}

function findFirstBuiltPlotByKind(state, kind, predicate = null) {
  for (const p of state.plots || []) {
    if (p.status !== 'built') continue;
    const b = state.buildings[p.building];
    if (!b || b.kind !== kind) continue;
    if (predicate && !predicate(p)) continue;
    return p;
  }
  return null;
}

export function markPromiseOutcome(state, promise, outcomeKey) {
  if (!promise?.groupId) return null;
  const group = getGroup(state, promise.groupId);
  if (!group) return null;

  if (promise.kind === 'newcomer-settle') {
    if (outcomeKey === 'success' || outcomeKey === 'grand') {
      group.status = 'settled';
      const home = findFirstBuiltPlotByKind(state, 'house', p => p.quadrant === 'SE') || findFirstBuiltPlotByKind(state, 'house');
      if (home) group.homePlotId = home.id;
      group.relation += 20;
      group.needs = ['weaver-plot'];
      rememberGroup(group, `迁入${home ? home.id : '坊内民宅'}，每日到井边汲水。`);
      rememberRelation(state, 'residents', `${group.name}落户，东南民居添了烟火。`, 2);
    } else {
      group.status = 'vagrant';
      group.relation -= 20;
      rememberGroup(group, '安置落空，成了南门外流民。');
      rememberRelation(state, 'residents', `${group.name}安置失期，井边多了怨言。`, -4);
    }
  }

  if (promise.kind === 'weaver-shop') {
    if (outcomeKey === 'success' || outcomeKey === 'grand') {
      const work = findFirstBuiltPlotByKind(state, 'weaver');
      if (work) group.workPlotId = work.id;
      group.relation += 15;
      group.needs = group.needs.filter(n => n !== 'weaver-plot');
      rememberGroup(group, `在${work ? work.id : '坊内'}立起织棚，开始供给布帛。`);
      rememberRelation(state, 'temple', `${group.name}可供布幡，慈灯寺开始筹备法会。`, 3);
    } else {
      group.relation -= 10;
      rememberGroup(group, '织棚未成，织户心灰。');
    }
  }
  return group;
}

export function groupDisplayName(state, id, fallback = '') {
  const g = getGroup(state, id);
  return g ? g.name : fallback;
}

export function activeGroups(state) {
  ensureGroupState(state);
  return state.groups.filter(g => !['departed'].includes(g.status));
}
