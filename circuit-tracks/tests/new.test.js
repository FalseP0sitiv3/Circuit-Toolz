// Pruebas de los módulos nuevos. Equipo y audio SIMULADOS: no validan hardware real.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CircuitSession, PHRASES, phraseFor } from '../src/core/midi.js';
import { analyzeRecording, measuredFeatures, estimatePitch } from '../src/core/acoustic.js';
import { buildFamilies, pca2, vectorize } from '../src/core/families.js';
import { classify } from '../src/core/classify.js';
import { fingerprints } from '../src/core/compare.js';
import { buildReplaceCurrent, parseMessage } from '../src/core/sysex.js';
import { Library, MemoryStore } from '../src/core/library.js';
import { approxSeconds } from '../src/core/params.js';
import { initPayload, syx, setMacro, presets } from './fixtures.js';

// Circuit Tracks simulado: responde a Program Change + Dump Request con un Replace Current Patch.
function fakeDevice(bank) {
  const sent = []; let current = [initPayload('RAM 1'), initPayload('RAM 2')], listener;
  const input = { addEventListener: (_, f) => { listener = f; }, removeEventListener() {} };
  const output = {
    name: 'Circuit Tracks MIDI', send(data, at) {
      sent.push({ data: Array.from(data), at });
      const d = Array.from(data);
      if ((d[0] & 0xF0) === 0xC0) current[d[0] & 0x0F] = bank[d[1]];
      if (d[0] === 0xF0 && d[6] === 0x00) current[d[7]] = Uint8Array.from(d.slice(9, 349));
      if (d[0] === 0xF0 && d[6] === 0x40) setTimeout(() => listener({ data: buildReplaceCurrent(current[d[7]], d[7]) }), 2);
    }, clear() {}
  };
  return { input, output, sent };
}

test('MIDI · envío de patch a RAM, espaciado SysEx ≥ 20 ms y frases', () => {
  let t = 1000; const dev = fakeDevice([]); const s = new CircuitSession(dev.output, dev.input, () => t);
  const a = s.sendPatch(initPayload('A'), 0), b = s.sendPatch(initPayload('B'), 1);
  assert.ok(b - a >= 20, 'separación entre SysEx');
  assert.equal(dev.sent[0].data.length, 350); assert.equal(dev.sent[1].data[7], 1);
  const r = s.playPhrase(PHRASES.bass, 0, { tempo: 120, start: 2000 });
  const notes = dev.sent.filter((x) => (x.data[0] & 0xF0) === 0x90);
  assert.equal(notes.length, PHRASES.bass.notes.length); assert.equal(notes[0].data[0], 0x90); assert.equal(notes[0].data[1], 36);
  assert.ok(r.end > r.start);
  const sw = s.macroSweep(1, 4, { start: 5000, restore: 33 });
  const ccs = dev.sent.filter((x) => x.data[0] === 0xB1 && x.data[1] === 84);
  assert.ok(ccs.length > 40); assert.equal(ccs.at(-1).data[2], 33, 'restaura la posición guardada'); assert.ok(Math.max(...ccs.map((c) => c.data[2])) === 127);
  assert.equal(phraseFor('bass', 'acid'), 'acid'); assert.equal(phraseFor('pad'), 'pad'); assert.equal(phraseFor(null), 'test');
});

test('MIDI · lectura de patches guardados (PGM → dump) con equipo simulado', async () => {
  const bank = Array.from({ length: 64 }, (_, i) => initPayload('Stored ' + i));
  const dev = fakeDevice(bank); const s = new CircuitSession(dev.output, dev.input);
  const got = await s.readStored([0, 5, 63], 0);
  assert.deepEqual(got.map((g) => g.n), [0, 5, 63]);
  assert.equal(new TextDecoder().decode(got[1].payload.slice(0, 8)), 'Stored 5');
  const cur = await s.requestCurrent(1); assert.equal(cur.length, 340);
  // Sin respuesta → error claro
  const mute = new CircuitSession({ send() {}, clear() {} }, { addEventListener() {} });
  await assert.rejects(mute.requestCurrent(0, 50), /Sin respuesta/);
});

// Señales sintéticas
const SR = 44100;
function render(sec, fn) { const x = new Float32Array(Math.floor(sec * SR)); for (let i = 0; i < x.length; i++) x[i] = fn(i / SR); return x; }
const saw = (f, t) => 2 * ((t * f) % 1) - 1;

test('Acústica · pitch, percusivo grave, pad lento y ruido', () => {
  const sine = render(0.5, (t) => 0.5 * Math.sin(2 * Math.PI * 110 * t));
  assert.ok(Math.abs(estimatePitch(sine, SR, 0.1).hz - 110) < 1.5);
  // Bajo percusivo a 55 Hz (A1), decay rápido, con 40 ms de latencia simulada
  const bass = render(2.5, (t) => t < 0.04 ? 0 : 0.8 * Math.exp(-(t - 0.04) * 9) * Math.sin(2 * Math.PI * 55 * t));
  const d1 = analyzeRecording(bass, SR, { noteOn: 0, noteOff: 1.5, playedNote: 33 });
  const f1 = measuredFeatures(d1).map((f) => f.id);
  assert.ok(Math.abs(d1.f0 - 55) < 2, 'f0 ' + d1.f0); assert.ok(d1.latencyMs > 30 && d1.latencyMs < 50);
  assert.ok(f1.includes('m-percussive') && f1.includes('m-low') && f1.includes('m-dark'), f1.join());
  // Pad: sierra a 220 Hz, ataque 400 ms, release 1,2 s
  const pad = render(3.5, (t) => { const env = t < 0.4 ? t / 0.4 : t < 1.5 ? 1 : Math.max(0, 1 - (t - 1.5) / 1.2); return 0.4 * env * (saw(220, t) + 0.5 * saw(221.3, t)); });
  const d2 = analyzeRecording(pad, SR, { noteOn: 0, noteOff: 1.5, playedNote: 57 });
  const f2 = measuredFeatures(d2).map((f) => f.id);
  assert.ok(f2.includes('m-slow-attack') && f2.includes('m-long-release') && f2.includes('m-bright'), f2.join() + ' ' + JSON.stringify({ a: d2.attackMs, r: d2.releaseMs }));
  // Ruido
  let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const noise = render(1.5, (t) => (t < 1 ? 0.3 : 0) * rnd());
  assert.ok(measuredFeatures(analyzeRecording(noise, SR, { noteOff: 1 })).some((f) => f.id === 'm-noisy'));
  // Silencio
  assert.equal(measuredFeatures(analyzeRecording(new Float32Array(SR), SR, {}))[0].id, 'm-silent');
});

test('Clasificación · la medición corrobora o contradice el nombre', () => {
  const bass = render(2.5, (t) => 0.8 * Math.exp(-t * 9) * Math.sin(2 * Math.PI * 55 * t));
  const desc = analyzeRecording(bass, SR, { noteOff: 1.5, playedNote: 33 });
  const c = classify({ payload: initPayload('Deep Bass'), acoustic: { desc } });
  assert.equal(c.category, 'bass'); assert.equal(c.certainty, 'corroborated');
  assert.ok(c.evidence.some((e) => e.source === 'Medición acústica'));
  const only = classify({ payload: initPayload('Untitled'), acoustic: { desc } });
  assert.equal(only.category, 'bass');
  const dark = classify({ payload: initPayload('Bright Lead'), acoustic: { desc } });
  assert.equal(dark.certainty, 'ambiguous', 'nombre y medición en conflicto'); assert.deepEqual(dark.candidates.sort(), ['bass', 'lead']);
  assert.ok(dark.contradictions.some((x) => x.kind === 'measured' && /Bright/.test(x.text)), JSON.stringify(dark.contradictions));
});

test('Familias, mapa y escala de tiempo inferida', () => {
  const a = initPayload('Rolling Bass'), b = setMacro(new Uint8Array(a), 0, 0, 20), c = new Uint8Array(a); c[64] = 60;
  const d = initPayload('Other Pad', { 32: 2, 70: 90, 73: 110, 36: 20, 64: 100, 66: 80 });
  const items = [['1', a, 'Moloch Bass'], ['2', b, 'Moloch Bass v2'], ['3', c, 'Moloch Bass 3'], ['4', d, 'Other Pad']].map(([id, payload, name]) => ({ id, payload, name, fileName: name + '.syx', fp: fingerprints(payload), importedAt: id }));
  const fams = buildFamilies(items);
  assert.equal(fams.length, 1); assert.equal(fams[0].members.length, 3);
  assert.equal(fams[0].members.find((m) => m.id === '2').rel.level, 'macro');
  const xy = pca2(items.map((x) => vectorize(x.payload)));
  const dist = (i, j) => Math.hypot(xy[i][0] - xy[j][0], xy[i][1] - xy[j][1]);
  assert.ok(dist(0, 2) < dist(0, 3), 'la variante queda más cerca que el pad');
  assert.ok(Math.abs(approxSeconds(85) - 1) < 0.1 && Math.abs(approxSeconds(127) - 10) < 0.6);
});

test('Biblioteca · medición persistente, afinidad y familias', async () => {
  const store = new MemoryStore(), lib = await new Library(store).load();
  await lib.importInputs(['Moloch Bass', 'Moloch Bass v2', 'Pad X', 'Pluck Y'].map((n, i) => ({ name: n + '.syx', path: '', bytes: syx(initPayload(n, i === 1 ? { 64: 100 } : i === 2 ? { 32: 2, 70: 90, 73: 110 } : i === 3 ? { 70: 0, 72: 0, 71: 30 } : {})) })));
  const bassA = lib.patches[0];
  await lib.updateMeta([bassA.id], { fav: true });
  const rank = lib.affinityRanking(); assert.equal(rank[0].id, lib.patches[1].id, 'la variante de mi favorito es la más afín');
  const sig = render(2, (t) => 0.8 * Math.exp(-t * 9) * Math.sin(2 * Math.PI * 55 * t));
  await lib.setAcoustic(bassA.id, analyzeRecording(sig, SR, { noteOff: 1.5, playedNote: 33 }), { note: 33 });
  const again = await new Library(store).load();
  assert.ok(again.byId(bassA.id).acoustic.features.some((f) => f.id === 'm-low'));
  assert.equal(again.info(again.byId(bassA.id)).cls.certainty, 'corroborated');
  assert.ok(again.matches(again.byId(bassA.id), { features: ['m-low'] }));
  assert.equal(again.families().list.length, 1);
});

test('Papelera · eliminar se deshace con su sitio en el pack y la colección; vaciar es definitivo', async () => {
  const store = new MemoryStore(), lib = await new Library(store).load();
  await lib.importInputs(['A bass', 'B pad', 'C lead'].map((n) => ({ name: n + '.syx', path: '', bytes: syx(initPayload(n)) })));
  const [a, b] = lib.patches, bank = lib.banks[0];
  bank.slots[5] = a.id; const col = await lib.saveCollection({ name: 'Mis', kind: 'manual', ids: [a.id, b.id] });
  await lib.deletePatches([a.id]);
  assert.equal(lib.byId(a.id), undefined); assert.equal(bank.slots[5], null); assert.ok(!col.ids.includes(a.id));
  assert.equal(lib.trashCount(), 1);
  const again = await new Library(store).load(); assert.equal(again.trashCount(), 1, 'la papelera se guarda');
  await lib.undo(lib.lastUndoable().id);
  assert.ok(lib.byId(a.id)); assert.equal(bank.slots[5], a.id, 'vuelve a su slot'); assert.ok(col.ids.includes(a.id), 'y a su colección');
  assert.equal(lib.trashCount(), 0);
  await lib.deletePatches([a.id, b.id]); assert.equal(lib.trashCount(), 2);
  assert.equal(await lib.emptyTrash(), 1); assert.equal(lib.trashCount(), 0);
  await assert.rejects(() => lib.undo(lib.history.filter((h) => h.op === 'delete').at(-1).id));
  const bk = JSON.stringify(lib.history.map((h) => h.op === 'delete' && h.before ? { ...h, before: null } : h)); assert.ok(!bk.includes('"payload"'), 'nada de audio en la copia');
});

test('MIDI · envío justo a tiempo: parar o pasar al siguiente corta de verdad (v3.11)', () => {
  let t = 0; const sent = [];
  const out = { send: (d, at) => sent.push({ d: Array.from(d), at: at ?? t }) }; // sin clear(), como Chrome y Edge
  const s = new CircuitSession(out, null, () => t, [0, 1], { jit: true, ahead: 120, timer: null });
  const ons = () => sent.filter((x) => (x.d[0] & 0xF0) === 0x90 && x.d[2] > 0);
  const r = s.playPhrase(PHRASES.bass, 0, { tempo: 120, start: 0 }); // 16 pasos de 125 ms
  assert.ok(r.end > 1500);
  assert.equal(ons().length, 1, 'solo sale lo que toca en la ventana');
  assert.ok(s.busy, 'el resto espera en la cola');
  t = 400; s.pump(); assert.equal(ons().length, 3, 'van saliendo con el reloj: pasos 0, 2 y 3 (hasta 400 + 120 ms)');
  s.stopAll();
  assert.equal(s.busy, false, 'parar vacía la cola');
  t = 3000; s.pump(); assert.equal(ons().length, 3, 'tras parar no sale ninguna nota más');
  assert.equal(s.sounding.size, 0, 'y no queda ninguna encendida');
  const offs = sent.filter((x) => (x.d[0] & 0xF0) === 0x80 || x.d[0] === 0xB0);
  assert.ok(offs.some((x) => x.d[0] === 0xB0 && x.d[1] === 123), 'All Notes Off');
  // la nota apagada al parar nunca sale antes que su note-on (que puede llevar marca de tiempo futura)
  const lastOn = ons().at(-1), off = sent.findLast((x) => x.d[0] === 0x80 && x.d[1] === lastOn.d[1]);
  assert.ok(off.at > lastOn.at);
  // macro: si se para a mitad del barrido, vuelve a su sitio igualmente
  t = 5000; s.macroSweep(1, 2, { start: 5000, restore: 40 }); t = 5600; s.pump(); s.stopAll();
  const m3 = sent.filter((x) => x.d[0] === 0xB1 && x.d[1] === 82);
  assert.equal(m3.at(-1).d[2], 40, 'restaura la posición al parar');
  // A/B: el patch B espera a que acabe A y se cancela al parar; no retrasa el siguiente envío
  t = 8000; const a = s.sendPatch(new Uint8Array(340), 0), b = s.sendPatch(new Uint8Array(340), 0, t + 3000);
  assert.equal(b, t + 3000); assert.equal(sent.filter((x) => x.d[0] === 0xF0).length, 1);
  s.stopAll(); t = 8100; const c = s.sendPatch(new Uint8Array(340), 0);
  assert.ok(c - a >= 20 && c < t + 100, 'el siguiente patch sale al momento'); t = 12000; s.pump();
  assert.equal(sent.filter((x) => x.d[0] === 0xF0).length, 2, 'el patch B cancelado no llega');
  // repetir: la frase vuelve a empezar hasta parar
  t = 20000; const n0 = ons().length, rl = s.playPhrase({ steps: 4, notes: [{ t: 0, n: 0, d: 1 }], base: 48 }, 0, { tempo: 120, start: 20000, loop: true });
  assert.equal(rl.end, Infinity);
  for (t = 20000; t <= 22000; t += 50) s.pump();
  assert.equal(ons().length - n0, 5, 'una vez cada 4 pasos (500 ms) durante 2 s');
  s.stopAll(); for (; t <= 24000; t += 50) s.pump(); assert.equal(ons().length - n0, 5);
  // sin jit: todo sale al momento, como antes
  const s2 = new CircuitSession(out, null, () => t); const k = sent.length; s2.playPhrase(PHRASES.bass, 0, { start: t });
  assert.equal(sent.length - k, PHRASES.bass.notes.length * 2);
});
