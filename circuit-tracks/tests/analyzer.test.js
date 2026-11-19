// Pruebas del análisis, constructor de packs y captura MIDI (datos SIMULADOS).
import test from 'node:test';
import assert from 'node:assert/strict';
import { compatibility, auditChecks, mood, brightnessEstimate, kmeans, libraryAnalysis } from '../src/core/analysis.js';
import { buildPack } from '../src/core/packbuilder.js';
import { CircuitSession, eventsToPhrase } from '../src/core/midi.js';
import { Library, MemoryStore } from '../src/core/library.js';
import { initPayload, syx, setMacro, presets } from './fixtures.js';

async function libWith(list) {
  const lib = await new Library(new MemoryStore()).load();
  await lib.importInputs(list.map(([name, payload, product]) => ({ name: name + '.syx', path: 'Test', bytes: syx(payload, product) })));
  return lib;
}

test('Compatibilidad: nativo, legado, convertido y duplicado', async () => {
  const a = initPayload('Rolling Bass'), b = new Uint8Array(a); b.set([66, 66, 66], 0); // mismo sintetizador, otro nombre
  const lib = await libWith([['Rolling Bass', a], ['Copy', b], ['Old Lead', initPayload('Old Lead', { 33: 20 }), 0x60]]);
  const [pa, pb, pc] = lib.patches;
  assert.equal(compatibility(pa, lib).status, 'native');
  assert.equal(compatibility(pb, lib).status, 'duplicate');
  assert.equal(compatibility(pc, lib).status, 'legacy');
  const v = await lib.createVariant(pc.id, setMacro(new Uint8Array(pc.payload), 0, 0, 20), 'x', 'test');
  assert.equal(compatibility(v, lib).status, 'converted');
  const ch = compatibility(pa, lib).checks; assert.ok(ch.every((c) => c.level === 'ok'), JSON.stringify(ch));
});

test('Comprobaciones «N de M», carácter con origen y brillo estimado', async () => {
  const lib = await libWith([['Dark Pad', initPayload('Dark Pad', { 32: 2, 70: 80, 73: 100 })], ['X', initPayload('X', { 64: 20 })]]);
  const p = lib.patches[0];
  const a = auditChecks(p, lib, 'techno'); assert.equal(a.total, 7); assert.ok(a.passed < a.total);
  await lib.acceptClassification([p.id]); await lib.updateMeta([p.id], { review: 'listened' });
  assert.ok(auditChecks(p, lib, 'techno').passed > a.passed);
  assert.deepEqual(mood(lib.patches[1], lib), { label: 'Closed', source: 'params' });
  assert.equal(mood(p, lib).source, 'user'); // tras aceptar, el descriptor «Dark» pasa a la ficha
  assert.ok(brightnessEstimate(initPayload('a', { 64: 20 })) < brightnessEstimate(initPayload('b', { 64: 127, 57: 80 })));
});

test('k-means separa grupos evidentes', () => {
  const rows = [...Array.from({ length: 10 }, (_, i) => [0 + i * 0.01, 0]), ...Array.from({ length: 10 }, (_, i) => [5 + i * 0.01, 5])];
  const { assign } = kmeans(rows, 2);
  assert.equal(new Set(assign.slice(0, 10)).size, 1); assert.equal(new Set(assign.slice(10)).size, 1); assert.notEqual(assign[0], assign[10]);
});

test('Franja de análisis de la biblioteca', async () => {
  const lib = await libWith([['Bass 1', presets.monoBass()], ['Pad 1', presets.padPoly()], ['Pluck 1', presets.pluck()], ['Acid 1', presets.acid()], ['Bass 1 copy', (() => { const x = presets.monoBass(); x[0] = 67; return x; })()]]);
  const a = libraryAnalysis(lib);
  assert.equal(a.N, 5); assert.equal(a.dup, 1); assert.equal(a.tracks, 5); assert.equal(a.envBins.reduce((x, y) => x + y), 5); assert.equal(a.briBins.reduce((x, y) => x + y), 5);
  assert.equal(a.mono + a.poly, 5); assert.ok(a.clusters.length >= 2); assert.equal(a.clusters.reduce((s, c) => s + c.size, 0), 5);
});

test('Constructor de packs: páginas por categoría, una por familia, descartes', async () => {
  const items = [];
  for (let i = 0; i < 40; i++) items.push(['Bass ' + i, initPayload('Bass ' + i, { 32: 0, 35: 62, 64: i * 3 })]);
  for (let i = 0; i < 5; i++) items.push(['Pad ' + i, initPayload('Pad ' + i, { 32: 2, 70: 80, 73: 100, 64: 100 - i })]);
  items.push(['Lead A', initPayload('Lead A', { 33: 20 })], ['Lead A v2', initPayload('Lead A v2', { 33: 20, 204: 50 })], ['Zzz', initPayload('Zzz', { 64: 77 })]);
  const lib = await libWith(items);
  const lead2 = lib.patches.find((p) => p.name === 'Lead A v2'); await lib.updateMeta([lead2.id], { rating: 5 });
  const discard = lib.patches.find((p) => p.name === 'Pad 0'); await lib.updateMeta([discard.id], { review: 'discard' });
  const r = buildPack(lib.patches, lib);
  assert.equal(r.pages[0].placed, 32); assert.equal(r.excluded.overflow, 8, 'bajos que no caben en la página');
  assert.ok(r.slots.slice(32, 64).includes(lead2.id), 'familia Lead A → la mejor valorada');
  assert.ok(!r.slots.includes(lib.patches.find((p) => p.name === 'Lead A').id));
  assert.equal(r.pages[2].placed, 4); assert.ok(!r.slots.includes(discard.id));
  assert.ok(r.excluded.uncategorized >= 1); assert.equal(r.blocks.length, 4);
  const b = await lib.createBank('t'); b.slots = r.slots; b.blocks = r.blocks; assert.equal(lib.bankIssues(b).blockMismatch.length, 0, 'páginas multi-categoría sin falsos avisos');
  const filled = buildPack(lib.patches, lib, { fillGaps: true }); assert.ok(filled.placed > r.placed);
});

test('MIDI: canales configurables, tempo por reloj, macros del equipo y captura de frase', () => {
  let t = 0; const sent = []; const s = new CircuitSession({ send: (d) => sent.push(Array.from(d)), clear() {} }, null, () => t, [4, 9]);
  s.note(1, 60, 100, 0, 100); assert.equal(sent[0][0], 0x99, 'Synth 2 en canal 10');
  for (let i = 0; i < 49; i++) { t = i * (60000 / 128 / 24); s.onMessage([0xF8], t); }
  assert.equal(s.clockTempo(), 128);
  s.onMessage([0xB4, 84, 99]); assert.equal(s.macroPos[0][4], 99);
  s.startCapture(); const step = 60000 / 120 / 4;
  [[0, 36], [2, 36], [4, 39], [6, 43]].forEach(([k, n]) => { s.onMessage([0x94, n, 100], k * step); s.onMessage([0x84, n, 0], k * step + step * 0.9); });
  const ph = s.stopCapture(120);
  assert.deepEqual(ph.notes.map((x) => [x.t, x.n, x.d]), [[0, 36, 1], [2, 36, 1], [4, 39, 1], [6, 43, 1]]);
  assert.equal(eventsToPhrase([], 120), null);
});

import { classify } from '../src/core/classify.js';
test('Nombre interno y archivo con sufijo de versión no cuentan como dos fuentes', () => {
  const c = classify({ payload: initPayload('Acid Line'), fileName: 'Acid Line v2.syx' });
  assert.equal(c.certainty, 'textual'); assert.ok(c.evidence.some((e) => /= Nombre de archivo/.test(e.source)));
});
