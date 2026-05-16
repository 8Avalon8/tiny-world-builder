// test/spatial-query.test.js
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { queryRadius } from '../../js/game/agents/spatial-query.js';

test('queryRadius returns agents within radius', () => {
  const agents = [
    { id: 1, x: 5, y: 5 },
    { id: 2, x: 5.5, y: 5.5 },
    { id: 3, x: 10, y: 10 },
  ];
  const hit = queryRadius(agents, 5, 5, 1.0);
  const ids = hit.map(a => a.id);
  assert.deepEqual(ids.sort(), [1, 2]);
});

test('queryRadius excludes agents past radius', () => {
  const agents = [{ id: 1, x: 0, y: 0 }];
  assert.equal(queryRadius(agents, 0, 0, 0).length, 1); // 0 距离 ≤ 0
  assert.equal(queryRadius(agents, 0, 0, 100).length, 1);
  assert.equal(queryRadius(agents, 50, 0, 1).length, 0);
});

test('queryRadius handles empty array', () => {
  assert.deepEqual(queryRadius([], 0, 0, 5), []);
});
