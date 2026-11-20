import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labMutate, labCross, labMorph, labChanges, labCloseness, labSanitize, LAB_BLOCKS } from '../src/core/lab.js';
import { PARAMS } from '../src/core/params.js';
import { initPayload } from './fixtures.js';
import { readName } from '../src/core/sysex.js';

const off = (key) => PARAMS.find((p) => p.key === key).off;
// Un bajo: sierra, filtro LP 24 medio cerrado con envolvente, una macro y una ruta de matriz
function bass() {
  const b = initPayload('Dark Bass');
  b[off('osc1.wave')] = 2; b[off('filter.freq')] = 40; b[off('filter.res')] = 70; b[off('filter.env2')] = 96; b[off('env1.d')] = 60; b[off('env1.s')] = 40;
  b[124] = 6; b[125] = 0; b[126] = 90; b[127] = 13;           // LFO 1 + → (destino 13) con profundidad +26
  b[204] = 30; b[205] = 20; b[206] = 0; b[207] = 127; b[208] = 100; // macro 1
  return b;
}
function pad() {
  const b = initPayload('Warm Pad');
  b[off('osc1.wave')] = 13; b[off('osc2.wave')] = 2; b[off('mix.osc2')] = 110; b[off('filter.freq')] = 90; b[off('env1.a')] = 80; b[off('env1.r')] = 100; b[off('lfo1.rate')] = 30;
  b[124] = 6; b[125] = 0; b[126] = 40; b[127] = 13;           // la misma ruta que el bajo, con otra profundidad
  b[128] = 9; b[129] = 0; b[130] = 100; b[131] = 20;          // y una ruta que el bajo no tiene
  b[204] = 90;
  return b;
}
const valid = (b) => b.length === 340 && b.every((x) => x <= 127) && PARAMS.every((p) => b[p.off] >= p.min && b[p.off] <= p.max);

test('Laboratorio · mutar: cambia lo elegido, nunca el nombre, la afinación ni las macros; la intensidad se nota', () => {
  const a = bass();
  for (let seed = 1; seed <= 30; seed++) {
    const m = labMutate(a, { amount: 'medium', groups: ['filter', 'env'], seed });
    assert.ok(valid(m), 'dentro de rango');
    assert.equal(readName(m).name, 'Dark Bass');
    assert.deepEqual([...m.subarray(204)], [...a.subarray(204)], 'macros intactas');
    assert.deepEqual([...m.subarray(124, 204)], [...a.subarray(124, 204)], 'la matriz no se muta');
    for (const k of ['osc1.wave', 'osc1.semi', 'osc2.semi', 'lfo1.rate', 'voice.octave']) assert.equal(m[off(k)], a[off(k)], k + ' no se toca');
  }
  const dist = (amount) => { let s = 0; for (let seed = 1; seed <= 20; seed++) s += 1 - labCloseness(a, labMutate(a, { amount, groups: ['osc', 'filter', 'env', 'mod', 'fx'], seed })); return s / 20; };
  const [s, m, w] = [dist('subtle'), dist('medium'), dist('wild')];
  assert.ok(s > 0 && s < m && m < w, `sutil ${s.toFixed(3)} < media ${m.toFixed(3)} < salvaje ${w.toFixed(3)}`);
  assert.deepEqual([...labMutate(a, { seed: 5 })], [...labMutate(a, { seed: 5 })], 'misma semilla, mismo resultado');
  assert.notDeepEqual([...labMutate(a, { seed: 5 })], [...labMutate(a, { seed: 6 })]);
  const ch = labChanges(a, labMutate(a, { amount: 'wild', groups: ['filter'], seed: 2 }));
  assert.ok(ch.length && ch.every((c) => c.group === 'filter'), 'describe lo que cambia');
});

test('Laboratorio · saneado: nada mudo, ni ataque eterno, ni un filtro cerrado que no estaba cerrado', () => {
  const a = bass(), x = new Uint8Array(a);
  x[off('mix.osc1')] = 0; x[off('mix.osc2')] = 0; x[off('mix.noise')] = 0; x[off('mix.ring')] = 0;
  x[off('env1.a')] = 127; x[off('filter.freq')] = 2; x[off('filter.env2')] = 64;
  labSanitize(x, a);
  assert.ok(x[off('mix.osc1')] >= 40, 'se oye un oscilador');
  assert.ok(x[off('env1.a')] <= 110, 'el ataque deja oír la frase');
  assert.ok(x[off('filter.freq')] >= 18, 'el filtro no queda cerrado');
  for (let seed = 1; seed <= 200; seed++) { const m = labMutate(a, { amount: 'wild', groups: ['osc', 'filter', 'env', 'mod', 'fx'], seed }); assert.ok(Math.max(m[54], m[55], m[56], m[57]) >= 40, 'siempre suena (' + seed + ')'); }
});

test('Laboratorio · cruzar: cada bloque sale entero de un padre, con algo de cada uno, y las macros del primero', () => {
  const a = bass(), b = pad();
  for (let seed = 1; seed <= 40; seed++) {
    const { payload: c, from } = labCross([a, b], { seed, mutate: null });
    assert.ok(valid(c));
    assert.equal(new Set(Object.values(from)).size, 2, 'algo de cada padre');
    const inBlocks = PARAMS.filter((p) => LAB_BLOCKS.includes(p.group));
    const same = inBlocks.filter((p) => c[p.off] === (from[p.group] ? b : a)[p.off]).length;
    assert.ok(same >= inBlocks.length - 2, `cada parámetro viene del padre de su bloque (${same} de ${inBlocks.length})`);
    const msrc = from.matrix ? b : a;
    assert.deepEqual([...c.subarray(124, 204)], [...msrc.subarray(124, 204)], 'la matriz entera de un padre');
    assert.deepEqual([...c.subarray(204)], [...a.subarray(204)], 'macros del primero');
    assert.equal(readName(c).name, 'Dark Bass');
  }
  // filtro de uno, envolventes del otro: comprobado en un caso concreto
  const { payload: c, from } = labCross([a, b], { seed: 3, mutate: null });
  assert.equal(c[off('filter.freq')], (from.filter ? b : a)[off('filter.freq')]);
  assert.equal(c[off('env1.a')], (from.env1 ? b : a)[off('env1.a')]);
  // con varios padres se usan varios
  const many = [a, b, pad(), bass()].map((x, i) => { const y = new Uint8Array(x); y[off('filter.res')] = 10 * i; return y; });
  const used = new Set(); for (let seed = 1; seed <= 10; seed++) Object.values(labCross(many, { seed }).from).forEach((i) => used.add(i));
  assert.equal(used.size, 4, 'los cuatro padres aportan');
});

test('Laboratorio · mezclar: los extremos son A y B, el medio está en medio y lo de tipo cambia a mitad', () => {
  const a = bass(), b = pad();
  assert.deepEqual([...labMorph(a, b, 0)], [...labSanitize(new Uint8Array(a), a)]);
  const m1 = labMorph(a, b, 1);
  for (const p of PARAMS) assert.equal(m1[p.off], b[p.off], p.key + ' en t = 1 es B');
  const h = labMorph(a, b, 0.5), q = labMorph(a, b, 0.25);
  const f = off('filter.freq');
  assert.equal(h[f], Math.round((a[f] + b[f]) / 2), 'frecuencia a medio camino');
  assert.equal(q[off('osc1.wave')], a[off('osc1.wave')], 'la onda es la de A antes de la mitad');
  assert.equal(h[off('osc1.wave')], b[off('osc1.wave')], 'y la de B desde la mitad');
  assert.equal(h[126], Math.round((90 + 40) / 2), 'la profundidad de una ruta común se interpola');
  assert.equal(q[128], a[128], 'una ruta distinta es la de A antes de la mitad');
  assert.equal(h[128], 9, 'y la de B desde la mitad');
  assert.deepEqual([...h.subarray(204)], [...a.subarray(204)], 'las macros son las de A');
});
