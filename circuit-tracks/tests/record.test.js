import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CircuitSession } from '../src/core/midi.js';
import { generatePattern, generateDrums, patternEvents, fitSteps, toggleDrum, patternToMidi, readMidiNotes, DRUM_NOTES, DRUM_STYLES, DESTS, GM_DRUM_NOTES, SCALES, outOfScale, circuitSwing, varyPattern } from '../src/core/patterns.js';

const fakeOut = () => { const sent = []; return { sent, send: (b, at) => sent.push({ b: Array.from(b), at }), clear() {} }; };

test('Grabar en el Circuit: Stop, posición 0, Start, 6 pulsos por paso, notas en el canal del destino y Stop al final', () => {
  const out = fakeOut(); let now = 1000; const s = new CircuitSession(out, null, () => now);
  const pat = generatePattern({ style: 'arp', seed: 4, steps: 32, tempo: 120 });
  const { events, ccs } = patternEvents(pat, { channel: DESTS.synth2.ch });
  const r = s.recordPattern(events, { tempo: 120, steps: 32, ccs });
  const m = out.sent, st = (x) => m.filter((e) => e.b[0] === x);
  assert.equal(st(0xFA).length, 1, 'un Start'); assert.equal(st(0xF8).length, 32 * 6, '24 ppqn = 6 pulsos por semicorchea');
  assert.deepEqual(m.find((e) => e.b[0] === 0xF2).b, [0xF2, 0, 0], 'Song Position = 0');
  const start = st(0xFA)[0].at, stops = st(0xFC);
  assert.ok(stops.at(-1).at - start === 32 * 125, 'Stop justo al terminar 32 pasos a 120 BPM (125 ms por paso)');
  const ons = m.filter((e) => (e.b[0] & 0xF0) === 0x90);
  assert.equal(ons.length, events.length); assert.ok(ons.every((e) => (e.b[0] & 0x0F) === 1), 'canal de Synth 2');
  assert.ok(ons.every((e) => e.at > start && e.at < r.end), 'todas las notas dentro del patrón');
  for (const e of ons) { const step = (e.at - start - 2) / 125; assert.ok(Math.abs(step - Math.round(step)) < 1e-6, 'cada nota cae en su paso'); }
  const offs = m.filter((e) => (e.b[0] & 0xF0) === 0x80); assert.ok(offs.every((e) => e.at < r.end), 'ninguna nota queda colgada tras el Stop');
  assert.ok(st(0xF8).every((e) => e.at >= start && e.at < r.end));
});
test('Grabar batería: canal 10, notas 60/62/64/65 por Drum 1–4 y solo los carriles elegidos', () => {
  const out = fakeOut(); const s = new CircuitSession(out, null, () => 0);
  const d = generateDrums({ style: 'house', seed: 2 });
  const { events } = patternEvents(d, { lanes: [true, false, true, true] });
  s.recordPattern(events, { tempo: 124, steps: 16 });
  const ons = out.sent.filter((e) => (e.b[0] & 0xF0) === 0x90);
  assert.ok(ons.length > 0 && ons.every((e) => e.b[0] === 0x99), 'canal 10');
  assert.ok(ons.every((e) => DRUM_NOTES.includes(e.b[1])) && !ons.some((e) => e.b[1] === 62), 'sin Drum 2');
});
test('Batería: estilos con carácter, variación por semilla y edición', () => {
  const h = generateDrums({ style: 'house', seed: 1, fill: false });
  assert.deepEqual(h.notes.filter((e) => e.lane === 0).map((e) => e.t), [0, 4, 8, 12], 'bombo a negras');
  assert.ok([4, 12].every((t) => h.notes.some((e) => e.lane === 1 && e.t === t)), 'palmas en 2 y 4');
  const ht = generateDrums({ style: 'halftime', seed: 5 }); assert.ok(ht.notes.some((e) => e.lane === 1 && e.t === 8));
  for (const st of Object.keys(DRUM_STYLES)) { const sig = new Set(); for (let s = 1; s <= 10; s++) sig.add(JSON.stringify(generateDrums({ style: st, seed: s }).notes.map((e) => [e.t, e.lane]))); assert.ok(sig.size >= 4, st); }
  const d32 = generateDrums({ style: 'techno', steps: 32, seed: 3 }); assert.ok(d32.notes.some((e) => e.t >= 16) && d32.notes.every((e) => e.t < 32));
  let p = toggleDrum(h, 3, 1); assert.ok(p.notes.some((e) => e.lane === 3 && e.t === 1));
  p = toggleDrum(p, 3, 1, { ghost: true }); assert.equal(p.notes.find((e) => e.lane === 3 && e.t === 1).v, 50);
  p = toggleDrum(p, 3, 1); assert.ok(!p.notes.some((e) => e.lane === 3 && e.t === 1));
});
test('16 o 32 pasos: recortar o repetir; MIDI de batería con notas del Circuit o GM', () => {
  const a = generatePattern({ style: 'acid', seed: 2, steps: 16 });
  const a32 = fitSteps(a, 32); assert.equal(a32.steps, 32); assert.equal(a32.notes.length, a.notes.length * 2);
  const a64 = generatePattern({ style: 'acid', seed: 2, steps: 64 }); assert.ok(fitSteps(a64, 32).notes.every((e) => e.t < 32 && e.t + e.d <= 32));
  const d = generateDrums({ style: 'electro', seed: 1 });
  assert.deepEqual([...new Set(readMidiNotes(patternToMidi(d, { channel: 9 })).notes.map((e) => e.n))].sort(), [...new Set(d.notes.map((e) => DRUM_NOTES[e.lane]))].sort());
  assert.ok(readMidiNotes(patternToMidi(d, { channel: 9, drumNotes: GM_DRUM_NOTES })).notes.every((e) => GM_DRUM_NOTES.includes(e.n)));
});

test('Escalas del Circuit: las 16 de Scale View (pads 17–32) y aviso de notas fuera de escala', () => {
  const ks = Object.values(SCALES); assert.equal(ks.length, 16); assert.deepEqual(ks.map((x) => x.pad), Array.from({ length: 16 }, (_, i) => 17 + i));
  assert.equal(SCALES.minor.ct, 'Natural Minor'); assert.equal(SCALES.chromatic.iv.length, 12); assert.deepEqual(SCALES.blues.iv, [0, 3, 5, 6, 7, 10]);
  for (const k of Object.keys(SCALES)) { const p = generatePattern({ style: 'arp', scale: k, root: 3, seed: 5 }); assert.equal(outOfScale(p).length, 0, 'el generador respeta ' + k); }
  const p = generatePattern({ style: 'acid', seed: 2 }); const q = { ...p, notes: [...p.notes, { t: 1, n: 61, d: 1, v: 100 }] };
  assert.equal(outOfScale(q).length, 1, 'Do# fuera de Do menor');
});
test('Swing del Circuit: 50 = recto, rango 20–80', () => {
  assert.equal(circuitSwing(0), 50); assert.equal(circuitSwing(0.5), 75); assert.equal(circuitSwing(1), 80);
});
test('Variaciones: cambian algo, conservan el carácter y la escala', () => {
  const p = generatePattern({ style: 'rolling', seed: 9 }); const v = varyPattern(p, { seed: 1 });
  assert.notDeepEqual(v.notes, p.notes); assert.equal(outOfScale(v).length, 0); assert.ok(v.notes.every((e) => e.t >= 0 && e.t < p.steps));
  assert.ok(Math.abs(v.notes.length - p.notes.length) <= Math.ceil(p.notes.length * 0.5));
  const d = generateDrums({ style: 'techno', seed: 3 }), dv = varyPattern(d, { seed: 2 });
  assert.deepEqual(dv.notes.filter((e) => e.lane === 0 && e.t < 12).map((e) => e.t), d.notes.filter((e) => e.lane === 0 && e.t < 12).map((e) => e.t), 'el bombo se mantiene');
  assert.notDeepEqual(dv.notes, d.notes);
});
test('Grabar: gate limitado a 16 pasos (lo máximo que guarda el Circuit)', () => {
  const out = fakeOut(); const s = new CircuitSession(out, null, () => 0);
  s.recordPattern([{ t: 0, n: 48, d: 30, v: 100, ch: 0 }], { tempo: 120, steps: 32 });
  const on = out.sent.find((e) => e.b[0] === 0x90), off = out.sent.find((e) => e.b[0] === 0x80);
  assert.ok(off.at - on.at <= 16 * 125);
});
