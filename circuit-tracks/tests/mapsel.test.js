import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zScoreMap, nearestByZ, rectIds } from '../src/core/mapsel.js';

test('Mapa: parecido con parámetros normalizados, varias referencias y selección por zona', () => {
  // el parámetro 2 tiene una escala 100 veces mayor: sin normalizar dominaría
  const e = [['a', [0, 0, 0]], ['a2', [0.05, 0.1, 5]], ['b', [1, 1, 0]], ['b2', [0.95, 0.9, 5]], ['c', [0.5, 0.5, 100]]];
  const z = zScoreMap(e.map(([id, v]) => [id, Float32Array.from(v)]));
  assert.equal(z.size, 5);
  for (let i = 0; i < 3; i++) { const col = [...z.values()].map((v) => v[i]); assert.ok(Math.abs(col.reduce((s, x) => s + x, 0)) < 1e-9, 'media 0'); }
  assert.equal(nearestByZ(z, new Set(['a']), 1)[0].id, 'a2', 'lo más parecido a «a» es «a2»');
  const two = nearestByZ(z, new Set(['a', 'b']), 2).map((x) => x.id).sort();
  assert.deepEqual(two, ['a2', 'b2'], 'con dos referencias, los parecidos a cada una');
  assert.ok(!nearestByZ(z, new Set(['a']), 9).some((x) => x.id === 'a'), 'sin la referencia');
  assert.deepEqual(nearestByZ(z, new Set(['a']), 9, (id) => id === 'a2').map((x) => x.id).includes('a2'), false, 'y saltando los que se pidan');
  assert.deepEqual(nearestByZ(z, new Set(['zz']), 3), []);
  const pts = [{ id: 'p', X: 10, Y: 10 }, { id: 'q', X: 50, Y: 80 }, { id: 'r', X: 30, Y: 40 }];
  assert.deepEqual(rectIds(pts, 60, 50, 0, 0).sort(), ['p', 'r'], 'rectángulo en cualquier dirección');
});
