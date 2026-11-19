import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePattern, STYLES, SCALES, patternToMidi, readMidiNotes, toggleNote, euclid, macroLane, noteName, swungStep } from '../src/core/patterns.js';

test('Patrones: deterministas por semilla y dentro de la escala', () => {
  for (const style of Object.keys(STYLES)) {
    const a = generatePattern({ style, seed: 7, root: 2, scale: 'phrygian' }), b = generatePattern({ style, seed: 7, root: 2, scale: 'phrygian' });
    assert.deepEqual(a.notes, b.notes, style);
    assert.ok(a.notes.length > 0, style + ' sin notas');
    for (const e of a.notes) {
      assert.ok(e.t >= 0 && e.t < a.steps && e.t + e.d <= a.steps + 1e-9, style + ' fuera de rango');
      assert.ok(SCALES.phrygian.iv.includes((((e.n - 2) % 12) + 12) % 12), `${style}: ${e.n} fuera de Re frigio`);
    }
  }
  assert.notDeepEqual(generatePattern({ style: 'acid', seed: 1 }).notes, generatePattern({ style: 'acid', seed: 2 }).notes);
});
test('Patrones: estilos con su carácter', () => {
  const off = generatePattern({ style: 'offbeat', seed: 3, density: 0 });
  assert.ok(off.notes.every((e) => e.t % 4 === 2), 'contratiempo puro con densidad 0');
  const roll = generatePattern({ style: 'rolling', seed: 3 });
  assert.ok(roll.notes.every((e) => e.t % 4 !== 0), 'el rodante esquiva el bombo');
  const pad = generatePattern({ style: 'pad', seed: 3 });
  assert.ok(pad.notes.filter((e) => e.t === 0).length >= 3, 'pad = acorde');
  const sub = generatePattern({ style: 'sub', seed: 3 });
  assert.ok(sub.notes.every((e) => e.n < 48), 'sub en registro grave');
  for (let sd = 1; sd < 8; sd++) { const dr = generatePattern({ style: 'drone', steps: 32, seed: sd }); assert.ok(Math.max(...dr.notes.map((e) => e.t + e.d)) >= 31, 'el drone cubre el patrón'); }
  assert.deepEqual(euclid(3, 8), [false, false, true, false, false, true, false, true]);
  assert.equal(noteName(60), 'Do3');
  assert.equal(swungStep(1, 0.25), 1.25); assert.equal(swungStep(2, 0.25), 2);
});
test('Patrones: carril de macro y edición manual', () => {
  const lane = macroLane({ knob: 4, shape: 'rise', lo: 10, hi: 110 }, 16);
  assert.equal(lane.length, 16); assert.equal(lane[0].num, 84); assert.equal(lane[0].v, 10); assert.equal(lane[15].v, 110);
  let p = generatePattern({ style: 'drone' });
  p = toggleNote(p, 4, 50); assert.ok(p.notes.some((e) => e.t === 4 && e.n === 50));
  p = toggleNote(p, 4, 50, { accent: true }); assert.equal(p.notes.find((e) => e.t === 4).v, 127);
  p = toggleNote(p, 4, 50); assert.ok(!p.notes.some((e) => e.t === 4 && e.n === 50));
});
test('Patrones: exportación MIDI legible y fiel', () => {
  const p = generatePattern({ style: 'acid', seed: 11, tempo: 130, swing: 0.2, macro: { knob: 0, shape: 'triangle', lo: 0, hi: 127 } });
  const bytes = patternToMidi(p, { channel: 1 });
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'MThd');
  const back = readMidiNotes(bytes);
  assert.equal(back.tempo, 130);
  assert.equal(back.notes.length, p.notes.length);
  assert.deepEqual(back.notes.map((e) => e.n), [...p.notes].sort((a, b) => a.t - b.t || a.n - b.n).map((e) => e.n));
  const q = back.ppq / 4; const odd = p.notes.find((e) => e.t % 2 === 1);
  if (odd) assert.ok(back.notes.some((e) => e.tick === Math.round((odd.t + 0.2) * q)), 'swing aplicado');
  assert.equal(back.cc.length, p.cc.length); assert.ok(back.cc.every((c) => c.num === 80));
});

test('Patrones: cada estilo cambia con la semilla («Otra variación» siempre hace algo)', () => {
  for (const style of Object.keys(STYLES)) {
    const sigs = new Set(); for (let sd = 1; sd <= 12; sd++) sigs.add(JSON.stringify(generatePattern({ style, seed: sd }).notes.map((e) => [e.t, e.n])));
    assert.ok(sigs.size >= (style === 'drone' ? 4 : 8), `${style}: solo ${sigs.size} variantes con 12 semillas`);
  }
});
