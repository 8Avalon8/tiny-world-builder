// test/character.test.js
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { state, resetState } from '../../js/game/state.js';
import { buildWalkmap } from '../../js/game/walkmap.js';
import { CHARACTERS, spawnCharacter } from '../../js/game/agents/characters/index.js';

function setup() {
  resetState({ difficulty: 'normal' });
  state.agents = [];
  state.minute = 600;
  state.day = 1;
  state.gates = { W: { cell: { x: 0, y: 7 } }, N:{cell:{x:7,y:0}}, S:{cell:{x:7,y:15}}, E:{cell:{x:15,y:7}} };
  state.plots = [];
  state.buildings = {};
  buildWalkmap();
}

test('CHARACTERS registry contains demo NPC', () => {
  assert.ok(CHARACTERS.demoNpc);
  assert.equal(CHARACTERS.demoNpc.id, 'demoNpc');
});

test('spawnCharacter creates agent with banner and StoryAgent role', () => {
  setup();
  const a = spawnCharacter('demoNpc', state);
  assert.ok(a, 'should return agent');
  assert.equal(a.lifecycle, 'permanent');
  assert.equal(a.role, 'StoryAgent');
  assert.equal(a.banner, '路人甲');
  assert.equal(a.interruptibility, 0);
  assert.ok(state.agents.includes(a));
});

test('spawnCharacter is idempotent for unique characters', () => {
  setup();
  spawnCharacter('demoNpc', state);
  spawnCharacter('demoNpc', state);
  const count = state.agents.filter(a => a.characterId === 'demoNpc').length;
  assert.equal(count, 1);
});
