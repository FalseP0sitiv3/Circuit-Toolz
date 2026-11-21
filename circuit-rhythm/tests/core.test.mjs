// npm test — pruebas del núcleo con señales sintéticas (sin hardware)
import * as S from './synth.mjs';
import { parseAudio, encodeWav16, encodeWavGeneric, quantize16, sniffAudio } from '../src/core/wav.js';
import { resample, render, stereoInfo, toMono, peakOf, db, autoTrimPoints, fft, channelDelay, monoBands } from '../src/core/dsp.js';
import { analyze, bpmFromDuration, noteName } from '../src/core/analyze.js';
import { classify, nameInfo, tokenize, learnFrom } from '../src/core/classify.js';
import { zipWrite, zipEntries, zipRead, crc32 } from '../src/core/zip.js';
import { fitToBeats, beatMatch, componentsFiles, sdPlan, sdFileName, projectUsage, autoBuild, emptyPack, budget, sampleSeconds, PROJECT_SIZE, safeName, LAYOUTS } from '../src/core/pack.js';

import { generate, vary, recordEvents, toMidi, noteFor, euclid, STYLES, DEFAULT_KIT } from '../src/core/patterns.js';
import { pca, nearYourFavourites, zVectors, nearestIds, measuredChar, inRect, MEASURED_CHARS, kmeansGroups, groupCount } from '../src/core/map.js';
import { organizePlan, manifestCSV } from '../src/core/organize.js';
import { songFamily, arrange, timeline, scenePlan, songEvents, writeProject, readProject, roadmap, mixEvents, STRATEGY_IDS, RANGES, timerPattern } from '../src/core/song.js';
import { taxonomy, addSubfolder, renameSubfolder, moveSubfolder, removeSubfolder, resetTax, proposeSub, detectTags, wordIndex, wordsOf, neighbourGuess, vecDist, SUBTYPES, contentSubFor, defaultSubLabel } from '../src/core/taxonomy.js';
import { readFileSync } from 'node:fs';
import { zoneOf, sliceBounds, slicesOriginal, slicesRhythm, originalFormat, encodeOriginal, encodeRhythm, sliceName } from '../src/core/slices.js';
import { repetition, applyKeep, parseSel, selText, validKeep, keepIsIdentity, REPEAT_HIGH } from '../src/core/shorten.js';
import { rawSeconds, kindOf, autoKindOf, isLoopSample, autoTrimOf } from '../src/core/pack.js';
import { tunePlan, shiftToPc, shiftToSemitone, effectiveMidi, pitchLabel, tuneRatio } from '../src/core/tune.js';
import { loudnessMax, kCoefficients, matchGroup } from '../src/core/loud.js';
import { hitOnsets, findHits, describeHits, groupHits, hitAudio, hitBaseName } from '../src/core/hits.js';
let pass = 0, fail = 0;
const results = [];
async function test(name, fn) {
  try { await fn(); pass++; results.push('  ✓ ' + name); }
  catch (e) { fail++; results.push('  ✗ ' + name + '\n      ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n      ') : e)); }
}
const ok = (c, m) => { if (!c) throw new Error(m || 'falló'); };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, `${m || ''} ${a} ≉ ${b} (±${tol})`);

function aiff16(ch, rate) {
  const n = ch[0].length, nc = ch.length, dataLen = n * nc * 2;
  const buf = new ArrayBuffer(12 + 26 + 16 + dataLen); const dv = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < 4; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'FORM'); dv.setUint32(4, buf.byteLength - 8); w(8, 'AIFF');
  w(12, 'COMM'); dv.setUint32(16, 18); dv.setUint16(20, nc); dv.setUint32(22, n); dv.setUint16(26, 16);
  // 80-bit extended
  const e = Math.floor(Math.log2(rate)); dv.setUint16(28, 16383 + e); const m = rate / Math.pow(2, e); dv.setUint32(30, Math.floor(m * 2 ** 31)); dv.setUint32(34, 0);
  w(38, 'SSND'); dv.setUint32(42, 8 + dataLen); dv.setUint32(46, 0); dv.setUint32(50, 0);
  let p = 54; for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { dv.setInt16(p, Math.round(ch[c][i] * 32767)); p += 2; }
  return new Uint8Array(buf);
}
function zeroCrossFreq(x, sr) { let z = 0; for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 && x[i] >= 0) z++; return (z * sr) / x.length; }
function bandLevelDb(x, sr, f) {
  const N = 8192, re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = (x[i + 1000] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
  fft(re, im); const k = Math.round(f * N / sr); let m = 0; for (let j = k - 3; j <= k + 3; j++) m = Math.max(m, Math.hypot(re[j], im[j]));
  let mx = 0; for (let j = 1; j < N / 2; j++) mx = Math.max(mx, Math.hypot(re[j], im[j])); return db(m / mx);
}

await test('WAV 16/24/float y estéreo se leen igual', () => {
  const x = S.sine(440, 0.1, 44100, 0.5);
  for (const [bits, fl] of [[16, false], [24, false], [32, true]]) {
    const d = parseAudio(encodeWavGeneric([x, x.map((v) => -v)], 44100, bits, fl));
    ok(d.sampleRate === 44100 && d.channels.length === 2 && d.channels[0].length === x.length, 'cabecera ' + bits);
    near(d.channels[0][100], x[100], 2e-4, 'valor ' + bits); near(d.channels[1][100], -x[100], 2e-4);
  }
});
await test('AIFF big-endian 16 bit', () => {
  const x = S.sine(220, 0.05, 48000, 0.4);
  const d = parseAudio(aiff16([x], 48000));
  ok(d.sampleRate === 48000 && d.container === 'aiff'); near(d.channels[0][50], x[50], 1e-4);
  ok(sniffAudio(aiff16([x], 48000).subarray(0, 16)) === 'aiff');
});
await test('WAV de salida: 48 kHz · mono · 16 bit, solo fmt + data', () => {
  const w = encodeWav16(quantize16(S.sine(100, 0.01, 48000)), 48000);
  const d = parseAudio(w);
  ok(d.sampleRate === 48000 && d.channels.length === 1 && d.bits === 16 && w.length === 44 + 480 * 2);
});
await test('remuestreo 44,1 → 48 kHz conserva la frecuencia y la duración', () => {
  const x = S.sine(1000, 1, 44100, 0.5);
  const y = resample(x, 44100, 48000);
  ok(y.length === 48000, 'largo ' + y.length);
  near(zeroCrossFreq(y, 48000), 1000, 3, 'frecuencia');
  near(peakOf(y.subarray(1000, 47000)), 0.5, 0.01, 'nivel');
});
await test('remuestreo 96 → 48 kHz filtra lo que no cabe (30 kHz < −60 dB)', () => {
  const sr = 96000, x = new Float32Array(sr);
  for (let i = 0; i < sr; i++) x[i] = 0.5 * Math.sin(2 * Math.PI * 1000 * i / sr) + 0.5 * Math.sin(2 * Math.PI * 30000 * i / sr);
  const y = resample(x, sr, 48000);
  ok(bandLevelDb(y, 48000, 18000) < -60, 'alias a 18 kHz: ' + bandLevelDb(y, 48000, 18000).toFixed(1));
});
await test('mono: contrafase detectada, la suma no se usa', () => {
  const x = S.sine(200, 0.2, 48000, 0.5);
  const st = stereoInfo([x, x.map((v) => -v)]);
  ok(st.corr < -0.99 && st.lossDb > 30, 'correlación');
  ok(toMono([x, x.map((v) => -v)], 'auto').used !== 'sum');
  ok(toMono([x, x.slice()], 'auto').used === 'left', 'canales idénticos');
});
await test('preparación: quita silencio, normaliza a −0,5 dBFS, cola con fundido', () => {
  const k = S.kick(44100, 0.5, 0.3);
  const r = render({ sampleRate: 44100, channels: [k] }, {});
  near(r.report.trimStart, 0.3, 0.003, 'recorte inicial');
  near(db(peakOf(r.data)), -0.5, 0.05, 'pico');
  ok(r.rate === 48000 && Math.abs(r.data[r.data.length - 1]) < 1e-3, 'final a cero');
});
await test('preparación: límite de 30 s', () => {
  const x = new Float32Array(44100 * 35).fill(0.1);
  const r = render({ sampleRate: 44100, channels: [x] }, { autoTrim: false });
  ok(r.data.length === 30 * 48000 && r.report.capped);
});
await test('análisis + clasificación por el sonido (12 sonidos sintéticos)', () => {
  const sigs = { kick: S.kick(), hat: S.hat(), ohat: S.hat(S.SR, 0.6, 7), snare: S.snare(), clap: S.clap(), bass: S.saw(55, 0.6), synth: S.saw(440, 0.5), atmos: S.pad(), cymbal: S.cymbal(), fx: S.riser(), dloop: S.drumLoop(128, 2), sub: S.sine(45, 0.8) };
  const exp = { sub: 'bass' };
  for (const [k, x] of Object.entries(sigs)) {
    const a = analyze({ sampleRate: S.SR, channels: [x], bits: 16 });
    const c = classify({ name: 'sample 01.wav', path: 'x/sample 01.wav', analysis: a });
    ok(c.cat === (exp[k] || k), `${k} → ${c.cat}`);
    ok(c.cert === 'sound', `${k}: ${c.cert}`);
  }
});
await test('análisis: tono de un bajo y tempo de un loop', () => {
  const a = analyze({ sampleRate: S.SR, channels: [S.saw(55, 0.6)], bits: 16 });
  ok(a.note === 'A0', 'nota ' + a.note); // 55 Hz = La1 en notación ISO = A0 en Ableton (C3 = 60)
  const l = analyze({ sampleRate: S.SR, channels: [S.drumLoop(124, 2)], bits: 16 });
  near(l.loopBpm, 124, 0.5, 'bpm'); ok(l.loopBeats === 8);
  ok(noteName(60) === 'C3');
});
await test('nombre + sonido = Confirmado; nombre que contradice el sonido = Dudoso', () => {
  const a = analyze({ sampleRate: S.SR, channels: [S.kick()], bits: 16 });
  const c1 = classify({ name: 'BD Dark 03.wav', path: 'Kicks/BD Dark 03.wav', analysis: a });
  ok(c1.cat === 'kick' && c1.cert === 'confirmed' && c1.basis === 'namefoldersound', JSON.stringify(c1));
  const h = analyze({ sampleRate: S.SR, channels: [S.hat()], bits: 16 });
  const c2 = classify({ name: 'Kick 01.wav', path: 'x/Kick 01.wav', analysis: h });
  ok(c2.cert === 'doubt' && c2.conflict.heard === 'hat');
  const c3 = classify({ name: 'Kick 01.wav', path: 'x/Kick 01.wav', analysis: h, user: { cat: 'hat' } });
  ok(c3.cert === 'user' && c3.cat === 'hat');
});
await test('léxico: compuestos y tipos de hat', () => {
  const cat = (n) => classify({ name: n, path: n }).cat;
  ok(cat('bass drum 3') === 'kick'); ok(cat('Hi Hat Open 02') === 'ohat'); ok(cat('HiHat-Closed-01') === 'hat');
  ok(cat('Reese Bass C#2') === 'bass'); ok(cat('perc loop 124') === 'dloop'); ok(cat('Acid Bass Loop 130bpm') === 'mloop');
  ok(cat('Clap_Verb') === 'clap'); ok(cat('Open Chord Stab') === 'synth', 'open sin hat');
  ok(JSON.stringify(nameInfo('Loop_128bpm_Am.wav')) === '{"bpm":128,"key":"Am"}');
  ok(nameInfo('Pad C#min').key === 'C#m'); ok(!nameInfo('Kick A.wav').key, 'una letra sola no es tonalidad');
  ok(tokenize('KickDrum808Hard').join(' ') === 'kickdrum 808 hard');
});
await test('reglas aprendidas: tu carpeta "Tops" pasa a contar', () => {
  const learned = {};
  for (let i = 0; i < 3; i++) learnFrom(learned, { name: `zz ${i}.wav`, path: `Samples/Rumbles/zz ${i}.wav` }, 'atmos');
  const c = classify({ name: 'qq.wav', path: 'Samples/Rumbles/qq.wav' }, learned);
  ok(c.cat === 'atmos' && c.basis === 'folder', JSON.stringify(c.reasons));
});
await test('Beat Match: 2 compases a 128 BPM = 32 pasos sin cambio de tono', () => {
  const b = beatMatch(3.75, 128); ok(b.steps === 32 && Math.abs(b.semis) < 1e-9);
  const c = beatMatch(4, 128); ok(c.steps === 32); near(c.semis, 1.117, 0.01, '4 s a 128');
  ok(beatMatch(0.1, 128).steps === null, 'demasiado corto');
  ok(bpmFromDuration(3.75, 127).bpm === 128);
});
await test('ZIP: ida y vuelta con deflate y CRC', async () => {
  const big = new Uint8Array(5000).map((_, i) => i % 7);
  const z = await zipWrite([{ name: 'a/', data: null }, { name: 'a/b.txt', data: 'hola ñ' }, { name: 'a/c.bin', data: big }]);
  const zz = zipEntries(z); ok(zz.entries.length === 3);
  const c = zz.entries.find((e) => e.name === 'a/c.bin'); ok(c.method === 8 && c.csize < 5000);
  const back = await zipRead(zz, c); ok(back.length === 5000 && crc32(back) === crc32(big));
  ok(new TextDecoder().decode(await zipRead(zz, zz.entries[1])) === 'hola ñ');
});
await test('pack de Components: 64 proyectos INIT, 128 entradas, 16 Grid FX, index.json al final', async () => {
  const p = emptyPack('Dark Techno 01'); p.slots[0] = 'a'; p.names[0] = 'Kick Ñandú'; p.slots[127] = 'b'; p.names[127] = 'Loop';
  const wav = encodeWav16(new Int16Array(10));
  const { files, index } = componentsFiles(p, { 0: wav, 127: wav });
  ok(index.product === 'circuit-rhythm' && index.version === '2.0' && index.projects.length === 64 && index.samples.length === 128 && index.gridEffects.length === 16);
  ok(index.samples[0].name === 'Kick Nandu' && index.samples[1].name === '' && index.samples[127].url === 'samples/sample_127.wav');
  ok(index.projects[0].name === 'User Session');
  const proj = files.find((f) => f.name === 'projects/project_5.ncs').data;
  ok(proj.length === PROJECT_SIZE && String.fromCharCode(...proj.subarray(0, 4)) === 'INIT' && proj[16] === 32 && proj[48] === 0);
  ok(files[files.length - 1].name === 'index.json');
  ok(files.filter((f) => f.name.startsWith('samples/sample_')).length === 2);
  const z = await zipWrite(files); const e = zipEntries(z).entries; ok(e.length === files.length);
});
await test('tarjeta SD: Rhythm/<n>/PCM/NN__Nombre.wav, meta y Sessions vacías', () => {
  ok(sdFileName(0, 'Kick') === '00__Kick.wav' && sdFileName(9, 'a') === '09__a.wav' && sdFileName(127, 'Brk 1') === '127__Brk 1.wav');
  ok(sdFileName(3, 'x', '_') === '03_x.wav');
  const p = emptyPack('X'); p.slots[2] = 'a'; p.names[2] = 'Snare: 1/2';
  const plan = sdPlan(p, { 2: new Uint8Array(4) }, { packNumber: 4 });
  ok(plan.files.map((f) => f.name).join('|') === 'Rhythm/4/meta/|Rhythm/4/Sessions/|Rhythm/4/PCM/|Rhythm/4/PCM/02__Snare 1 2.wav');
  ok(safeName('a'.repeat(50)).length === 32);
});
await test('proyectos: lectura de samples usados (formato comunitario)', () => {
  const d = new Uint8Array(PROJECT_SIZE); d.set([82, 85, 83, 69]); // RUSE
  for (let i = 0; i < 32; i++) d[0x10 + i] = 32; d.set([77, 105, 120], 0x10); d[0x34] = 126;
  for (let t = 0; t < 8; t++) d[0x28ce4 + 8 + t] = t * 2;
  const o = 0x2e4 + 3 * 2600 + 5 * 8; d[o] = 72; d[o + 5] = 99;
  const o2 = 0x2e4 + 4 * 2600; d[o2] = 0; d[o2 + 5] = 77; // paso vacío: no cuenta
  const u = projectUsage(d);
  ok(u.name === 'Mix' && u.tempo === 126 && u.slots.includes(99) && u.slots.includes(14) && !u.slots.includes(77));
  ok(projectUsage(new Uint8Array(PROJECT_SIZE)) === null);
});
await test('constructor automático: respeta papeles, presupuesto y duplicados', () => {
  const mk = (id, cat, dur, extra = {}) => ({ id, sha: extra.sha || id, cls: { cat, cert: 'confirmed' }, rating: extra.rating || 0, analysis: { dur, activeDur: dur, leadMs: 0, bands: { sub: 0, low: Math.random(), lowmid: 0, mid: 0, high: Math.random(), air: 0 }, centroid: 100 + Math.random() * 9000, flatness: Math.random() }, recipe: {} });
  const S2 = [];
  for (let i = 0; i < 30; i++) S2.push(mk('k' + i, 'kick', 0.4, { rating: i % 5 }));
  for (let i = 0; i < 10; i++) S2.push(mk('h' + i, 'hat', 0.1));
  for (let i = 0; i < 20; i++) S2.push(mk('l' + i, 'dloop', 7.5));
  S2.push(mk('dup', 'kick', 0.4, { sha: 'k0' }));
  const { slots, report } = autoBuild(S2, { layout: 'instrument', budget: 60 });
  const byId = Object.fromEntries(S2.map((s) => [s.id, s]));
  ok(slots.slice(0, 16).every((id) => id && byId[id].cls.cat === 'kick'), 'página 1 = kicks');
  ok(!slots.includes('dup'), 'duplicado por huella');
  ok(slots.slice(32, 40).filter(Boolean).every((id) => byId[id].cls.cat === 'hat'));
  const b = budget({ slots }, byId); ok(b.total <= 60 && report.emptyBudget > 0, 'presupuesto ' + b.total);
  ok(byId[slots[0]].rating === 4, 'mejor valorado primero');
  ok(LAYOUTS.novation.length === 128 && LAYOUTS.novation[0].id === 'kick' && LAYOUTS.novation[124].id === 'dloop');
});
await test('segundos ocupados según la receta', () => {
  const s = { analysis: { dur: 2, activeDur: 1.5, leadMs: 100 }, recipe: {} };
  near(sampleSeconds(s), 1.5, 1e-6);
  near(sampleSeconds({ ...s, recipe: { autoTrim: false } }), 2, 1e-6);
  near(sampleSeconds({ ...s, recipe: { trimStart: 0.5, trimEnd: 1.0 } }), 0.5, 1e-6);
  near(sampleSeconds({ analysis: { dur: 40, activeDur: 40 }, recipe: {} }), 30, 1e-6);
});

await test('loops: sin recorte automático (el silencio final es parte del compás)', () => {
  const s = { analysis: { dur: 3.75, activeDur: 3.69, leadMs: 0 }, recipe: {}, cls: { cat: 'dloop' } };
  near(sampleSeconds(s), 3.75, 1e-9);
  near(sampleSeconds({ ...s, recipe: { autoTrim: true } }), 3.69, 1e-9, 'si lo pides, se recorta');
  near(sampleSeconds({ ...s, cls: { cat: 'kick' } }), 3.69, 1e-9);
  ok(Math.abs(beatMatch(sampleSeconds(s), 128).semis) < 1e-9);
});

await test('patrones: 9 estilos, deterministas, variados por semilla y con el bombo como pide cada estilo', () => {
  for (const st of STYLES) {
    const a = generate({ style: st, seed: 3 }), b = generate({ style: st, seed: 3 });
    ok(JSON.stringify(a) === JSON.stringify(b), st + ' determinista');
    ok(a.lanes.length === 8 && a.lanes.every((l) => l.steps.length === 16), st + ' 8 carriles de 16');
    const uniq = new Set([...Array(12).keys()].map((k) => JSON.stringify(generate({ style: st, seed: k + 1 }).lanes.map((l) => l.steps.map((x) => (x ? 1 : 0))))));
    ok(uniq.size >= 4, `${st}: ${uniq.size} variantes de 12 semillas`);
  }
  const t = generate({ style: 'techno', seed: 1 });
  ok([0, 4, 8, 12].every((i) => t.lanes[0].steps[i]), 'techno: bombo a negras');
  ok(generate({ style: 'techno', seed: 1, steps: 32 }).lanes.every((l) => l.steps.length === 32));
  ok(euclid(3, 8).filter(Boolean).length === 3 && euclid(5, 16, 2).filter(Boolean).length === 5);
  const v = vary(t, 9); ok(JSON.stringify(v.lanes[0]) === JSON.stringify(t.lanes[0]), 'Variar conserva el bombo');
});
await test('carril melódico: el tono medido del sample transpone la nota', () => {
  ok(noteFor(0, 45, 45) === 60, 'sample ya en A1: nota 60');
  ok(noteFor(0, 45, 57) === 48, 'sample en A2: una octava abajo');
  ok(noteFor(3, 45, 40) === 68, 'C2 desde un sample en E1');
  ok(noteFor(0, 45, null) === 60, 'sin tono medido: altura original');
  ok(noteFor(0, 45, 0) <= 96 && noteFor(0, 45, 127) >= 24, 'dentro del teclado');
});
await test('grabación por reloj: kit por CC 8, Stop, SPP, Start, 24 PPQN, notas por canal y Stop final', () => {
  const p = generate({ style: 'techno', seed: 1 });
  const ev = recordEvents(p, { bpm: 120, kit: DEFAULT_KIT, tracks: new Set([0, 1]) });
  const b = ev.map((e) => e.bytes);
  ok(b[0][0] === 0xb0 && b[0][1] === 8 && b[0][2] === 0 && b[1][0] === 0xb1 && b[1][2] === 16, 'CC 8 de cada pista antes de empezar');
  ok(!b.some((x) => x[0] === 0xb2), 'solo las pistas elegidas');
  const iStop = b.findIndex((x) => x[0] === 0xfc), iStart = b.findIndex((x) => x[0] === 0xfa);
  ok(iStop < iStart && b[iStop + 1][0] === 0xf2, 'Stop y SPP 0 antes de Start');
  ok(b.filter((x) => x[0] === 0xf8).length === 16 * 6, '6 relojes por paso');
  ok(b[b.length - 1][0] === 0xfc, 'Stop al final');
  const k0 = ev.find((e) => e.bytes[0] === 0x90), st = ev.find((e) => e.bytes[0] === 0xfa);
  near(k0.t - st.t, 2, 0.01, 'nota 2 ms después de su reloj');
  const k4 = ev.filter((e) => e.bytes[0] === 0x90)[1];
  ok(k4.bytes[1] === 60, 'batería: nota 60');
  const lastOn = Math.max(...ev.filter((e) => (e.bytes[0] & 0xf0) === 0x80).map((e) => e.t));
  ok(lastOn < ev[ev.length - 1].t, 'todas las notas soltadas antes del Stop');
  const mel = recordEvents(p, { bpm: 120, tracks: new Set([5]), sampleMidi: [, , , , , 57] });
  ok(mel.filter((e) => e.bytes[0] === 0x95).every((e) => e.bytes[1] <= 60), 'bajo transpuesto por su tono');
});
await test('.mid: cabecera, tempo y notas; modo Drum Rack en el canal 10', () => {
  const p = generate({ style: 'techno', seed: 1 });
  const m = toMidi(p, { bpm: 125 });
  ok(String.fromCharCode(...m.subarray(0, 4)) === 'MThd' && String.fromCharCode(...m.subarray(14, 18)) === 'MTrk');
  const d = toMidi(p, { mode: 'drumrack' }); ok(d.some((x, i) => x === 0x99 && d[i + 1] === 36), 'kick en 36, canal 10');
});
await test('mapa: PCA y parecidos a tus favoritos', () => {
  const mk = (id, low, hi, dur) => ({ id, analysis: { bands: { sub: low / 2, low: low / 2, lowmid: 0.1, mid: 0.1, high: hi / 2, air: hi / 2 }, activeDur: dur, centroid: 200 + hi * 9000, flatness: hi * 0.5, attackMs: 2, f0conf: low, envDepthDb: 20 } });
  const it = [mk('k1', 0.9, 0, 0.4), mk('k2', 0.85, 0.02, 0.45), mk('h1', 0, 0.9, 0.1), mk('h2', 0.02, 0.85, 0.12), mk('p', 0.3, 0.3, 3)];
  const { points } = pca(it); ok(points.length === 5);
  const P = Object.fromEntries(points.map((p) => [p.id, p]));
  ok(Math.hypot(P.k1.x - P.k2.x, P.k1.y - P.k2.y) < Math.hypot(P.k1.x - P.h1.x, P.k1.y - P.h1.y), 'kicks juntos, lejos de los hats');
  const nf2 = nearYourFavourites(it, new Set(['k1']), new Set());
  ok(nf2[0].id === 'k2', 'el kick parecido sale primero');
});
await test('ordenar en disco: carpetas por categoría, sin colisiones, descartados fuera, por revisar aparte', () => {
  const S2 = [
    { id: 'a', name: 'Kick.wav', path: 'x/Kick.wav', ext: 'wav', cat: 'kick', cert: 'confirmed' },
    { id: 'b', name: 'Kick.wav', path: 'y/Kick.wav', ext: 'wav', cat: 'kick', cert: 'onehint' },
    { id: 'c', name: 'Hat.aif', path: 'z/Hat.aif', ext: 'aif', cat: 'hat', cert: 'user' },
    { id: 'd', name: 'Raro.wav', path: 'z/Raro.wav', ext: 'wav', cat: null, cert: 'none' },
    { id: 'e', name: 'Malo.wav', path: 'z/Malo.wav', ext: 'wav', cat: 'fx', cert: 'user', discard: true },
  ];
  const p = organizePlan(S2);
  const dest = p.items.map((i) => i.dest);
  ok(dest.includes('01 Kicks/Kick.wav') && dest.includes('01 Kicks/Kick (2).wav'), dest.join('|'));
  ok(dest.includes('04 Closed-Hats/Hat.aif') && dest.includes('_Por revisar/Raro.wav'));
  ok(!dest.some((d) => d.includes('Malo')) && p.skipped.discard === 1);
  ok(organizePlan(S2, { converted: true }).items.find((i) => i.id === 'c').dest.endsWith('Hat.wav'));
  ok(manifestCSV(p, 'R').split('\n')[1].startsWith('"x/Kick.wav","R/01 Kicks/Kick.wav"'));
});
await test('loops: ajustar al compás deja el Beat Match en 0 semitonos', () => {
  const f = fitToBeats(3.693, 128); ok(f.beats === 8); near(f.sec, 3.75, 1e-9);
  const x = new Float32Array(Math.round(3.693 * 44100)).fill(0.1);
  const r = render({ sampleRate: 44100, channels: [x] }, { autoTrim: false, fitSec: f.sec });
  ok(r.data.length === 3.75 * 48000 && r.report.padded);
  ok(Math.abs(beatMatch(sampleSeconds({ analysis: { dur: 3.693, activeDur: 3.69 }, recipe: { fitSec: f.sec } }), 128).semis) < 1e-9);
});

await test('canción: 8 patrones por pista con su papel; bloquear una pista la conserva', () => {
  const f = songFamily({ style: 'techno', seed: 4, steps: 32, flip: { 4: [48, 49, 50] } });
  ok(f.tracks.length === 8 && f.tracks.every((tr) => tr.length === 8 && tr.every((p) => p.length === 32)));
  ok(f.tracks.every((tr) => tr[7].every((x) => !x)), 'slot 8 = silencio');
  ok(f.tracks[0][6].slice(28).every((x) => !x), 'build: sin bombo en el último tiempo');
  ok(f.tracks[1][6].filter(Boolean).length >= 24, 'build: redoble de palmas');
  ok(f.tracks[5][0].some(Boolean) && f.tracks[5][0].filter(Boolean).length < f.tracks[5][1].filter(Boolean).length, 'patrón 1 del bajo: las notas largas del break');
  const perc = f.tracks[4][1].filter(Boolean).map((x) => x.sl);
  ok(perc.length < 2 || new Set(perc).size > 1, 'sample flip en la percusión');
  const g = songFamily({ style: 'techno', seed: 99, steps: 32, locked: new Set([5]), prev: f.tracks });
  ok(JSON.stringify(g.tracks[5]) === JSON.stringify(f.tracks[5]) && JSON.stringify(g.tracks[0]) !== JSON.stringify(f.tracks[0]), 'bajo bloqueado, el resto cambia');
});
await test('estrategias: plan de escenas fiel al hardware (≤16 escenas, cadenas enteras, sin recortes)', () => {
  for (const steps of [16, 32]) {
    const f = songFamily({ seed: 2, steps });
    for (const id of STRATEGY_IDS) for (const r of [0, 1, 2]) {
      const secs = arrange(id, 1, { reshuffle: r }); const tl = timeline(f, secs);
      ok(tl.scenes.length <= 16, `${id}: ${tl.scenes.length} escenas`);
      ok(!tl.cut.length, id + ': no se pierde ninguna sección');
      for (const sc of tl.scenes) for (const tr of sc.tracks) if (tr.key !== 'off') {
        const pass = (tr.slots.length * steps) / 16;
        ok(sc.bars % pass === 0, `${id}/${sc.id}: escena de ${sc.bars} y cadena de ${pass}`);
      }
      ok(tl.bars >= 64, id + ' dura al menos 64 compases');
      if (r === 0) ok(!tl.changed.length, `${id}/${steps}: la estructura base cabe tal cual (${JSON.stringify(tl.changed)})`);
    }
  }
  const a = arrange('dj', 1, { reshuffle: 0 }), b = arrange('dj', 1, { reshuffle: 3 });
  ok(a.length === b.length, 'otra estructura conserva las secciones');
  const pk = timeline(songFamily({ seed: 1, steps: 32 }), arrange('peak', 1));
  ok(pk.sections.find((x) => x.index === 4).bars === 4, 'el build corto de Peak time sigue siendo de 4 compases');
  ok(timerPattern(1)[0] === 15 && timerPattern(4).join() === '31,5' && timerPattern(8).join() === '31,7', 'patrón reloj de 1, 4 y 8 compases');
  const many = scenePlan(Array.from({ length: 20 }, (_, i) => ({ id: 's' + i, bars: 8, mix: 'gggggggg', energy: 0.5 })), { steps: 32 });
  ok(many.scenes.length === 16 && many.cut.length === 4, 'más de 16 escenas: se avisa de lo que no cabe');
});
await test('canción: mezcla en JS rápida, monofónica por pista y con stems que suman la mezcla', () => {
  const fam = songFamily({ style: 'techno', seed: 3, steps: 32 });
  const tl = timeline(fam, arrange('peak', 3));
  const ev = songEvents(fam, tl);
  const click = new Float32Array(48000).fill(0.5);
  const kit = [0, 16, 32, 40, 48, 64, 80, 96];
  const stepSec = 60 / 128 / 4, len = Math.ceil((tl.bars * 16 * stepSec + 1) * 48000);
  const t0 = Date.now();
  const mix = mixEvents(ev, () => click, { kit, stepSec, len });
  ok(Date.now() - t0 < 4000, 'mezcla en menos de 4 s: ' + (Date.now() - t0));
  const k = mixEvents(ev, () => click, { kit, stepSec, len, onlyTrack: 0 });
  const pk = k.reduce((m, x) => Math.max(m, x), 0);
  ok(pk <= 0.75 * 0.5 + 1e-6, 'una sola voz por pista (sin sumar golpes solapados)');
  let sum = 0, diff = 0;
  const stems = [...Array(8).keys()].map((tr) => mixEvents(ev, () => click, { kit, stepSec, len, onlyTrack: tr }));
  for (let i = 0; i < len; i += 97) { const s2 = stems.reduce((a, x) => a + x[i], 0); diff = Math.max(diff, Math.abs(s2 - mix[i])); sum += Math.abs(mix[i]); }
  ok(diff < 1e-5 && sum > 0, 'los stems suman la mezcla');
});
await test('canción: eventos, hoja de ruta y proyecto .ncs leído de vuelta', () => {
  const f = songFamily({ seed: 5, steps: 32, root: 33 });
  const tl = timeline(f, arrange('peak', 5));
  const ev = songEvents(f, tl);
  ok(ev.length > 500 && ev.every((e) => e.step < tl.bars * 16), 'eventos dentro de la canción');
  ok(!songEvents(f, tl, { onlyTrack: 0 }).some((e) => e.t !== 0), 'eventos de una sola pista');
  const rm = roadmap(f, tl, {}, 128); ok(rm[0].scene === 1 && rm.length === tl.scenes.length && rm.some((x) => x.same), 'hoja de ruta por escena, con copias');
  const tpl = new Uint8Array(readFileSync(new URL('../third_party/circuitgm/RhythmEmpty.ncs', import.meta.url)));
  const kit = [0, 16, 32, 40, 48, 64, 80, 96];
  const d = writeProject(tpl, f, tl, { name: 'Peak 1', tempo: 132, kit, sampleMidi: [, , , , , 45] });
  ok(d.length === 169092 && String.fromCharCode(...d.subarray(0, 4)) === 'RUSE');
  const r = readProject(d);
  ok(r.name === 'Peak 1' && r.tempo === 132 && r.chain[0] === 0 && r.chain[1] === tl.scenes.length - 1);
  ok(JSON.stringify(r.defaults) === JSON.stringify(kit), 'sample por defecto de cada pista');
  tl.scenes.forEach((s, i) => s.tracks.forEach((tr, t) => { ok(JSON.stringify(r.scenes[i][t]) === JSON.stringify([tr.from, tr.to]), `escena ${i + 1} pista ${t + 1}`); }));
  // simulación del hardware: cada escena dura su cadena más larga (con el reloj) y suena una vez
  ok(JSON.stringify(r.sceneBars) === JSON.stringify(tl.scenes.map((x) => x.bars)), `duración real de cada escena ${r.sceneBars} = plan`);
  const hw = []; let at = 0;
  r.scenes.forEach((sc, i) => { const len = r.sceneBars[i] * 16; sc.forEach(([a, b], t) => { const seq = []; for (let k = a; k <= b; k++) seq.push(r.pat(t, k)); const cl = seq.reduce((x, p) => x + p.length, 0);
    for (let k = 0; k < len; k++) { let o = k % cl, p = 0; while (o >= seq[p].length) o -= seq[p++].length; const st = seq[p][o]; if (st && (t === 7 ? b !== 7 : true)) hw.push(`${at + k}:${t}:${st.v}`); } }); at += len; });
  const mine = ev.map((e) => `${e.step}:${e.t}:${e.v}`);
  ok(hw.length === mine.length && hw.sort().join() === mine.sort().join(), `lo que tocará la Rhythm = la escucha (${hw.length} / ${mine.length})`);
  const k0 = r.pat(0, 1); ok(k0.length === 32 && k0[0].note === 60 && k0[0].p === 7);
  const bass = r.pat(5, 1).filter(Boolean); ok(bass.length && bass.every((x) => x.note >= 48 && x.note <= 72), 'bajo transpuesto por su tono medido');
  const u = projectUsage(d); ok(u && u.slots.includes(16) && u.slots.includes(96), 'uso de samples legible');
  const T0 = 0x2e4 + 64 * 2600; let diff = 0;
  for (let i = T0; i < tpl.length; i++) if (d[i] !== tpl[i]) diff++;
  ok(diff <= 24, `cola de la plantilla casi intacta (${diff} bytes: samples y Tune)`);
});

await test('carpetas: subcarpetas editables y propuestas del nombre y del sonido', () => {
  ok(Object.keys(SUBTYPES).length === 15 && taxonomy(null, 'bass').some((x) => x.id === 'sub'), 'subcarpetas de fábrica para las 15 categorías');
  let r = addSubfolder(null, 'bass', 'Groovys'); ok(r.id === 'groovys' && taxonomy(r.tax, 'bass').length === 6);
  let tx = renameSubfolder(r.tax, 'bass', 'groovys', 'Groovy'); ok(taxonomy(tx, 'bass').at(-1).label === 'Groovy');
  tx = moveSubfolder(tx, 'bass', 'groovys', -1); ok(taxonomy(tx, 'bass')[4].id === 'groovys', 'subir');
  tx = removeSubfolder(tx, 'bass', 'acid'); ok(!taxonomy(tx, 'bass').some((x) => x.id === 'acid'));
  ok(taxonomy(resetTax(tx, 'bass'), 'bass').length === 5, 'volver a las de fábrica');
  ok(addSubfolder(tx, 'bass', 'groovy').id === 'groovys', 'el mismo nombre no duplica');
  const A = (o) => ({ bands: { sub: 0.2, low: 0.3, lowmid: 0.2, mid: 0.2, high: 0.05, air: 0.05 }, activeDur: 0.4, centroid: 800, flatness: 0.05, f0conf: 0.2, attackMs: 3, sustainDb: -20, t40: 300, ...o });
  ok(proposeSub({ name: 'Kick 808 long.wav', path: 'a/Kick 808 long.wav', analysis: A() }, 'kick').id === 'b808', 'el nombre manda');
  ok(proposeSub({ name: 'k1.wav', path: 'k1.wav', analysis: A({ t40: 900, activeDur: 0.9, f0conf: 0.8 }) }, 'kick').id === 'b808', 'cola larga con tono → 808');
  ok(proposeSub({ name: 'k2.wav', path: 'k2.wav', analysis: A({ activeDur: 0.15, t40: 120 }) }, 'kick').id === 'short', 'muy corto → secos');
  ok(proposeSub({ name: 'b.wav', path: 'b.wav', analysis: A({ flatness: 0.2 }) }, 'bass').id === 'reese', 'bajo sucio → reese');
  const own = addSubfolder(null, 'perc', 'Congas').tax; ok(proposeSub({ name: 'Conga hit.wav', path: 'Conga hit.wav', analysis: A() }, 'perc', own).id === 'tonal', 'palabra de fábrica antes que la tuya');
  ok(proposeSub({ name: 'Congas low.wav', path: 'Congas low.wav', analysis: A() }, 'perc', own).id === 'congas', 'una subcarpeta tuya por su nombre');
  ok(proposeSub({ name: 'x.wav', path: 'x.wav' }, null) === null, 'sin categoría no propone');
  const pl = organizePlan([{ id: 'a', name: 'k.wav', path: 'x/k.wav', ext: 'wav', cat: 'kick', cert: 'user', sub: 'Con pegada' }, { id: 'b', name: 'k2.wav', path: 'x/k2.wav', ext: 'wav', cat: 'kick', cert: 'user' }]);
  ok(pl.items[0].dest === '01 Kicks/Con pegada/k.wav' && pl.items[1].dest === '01 Kicks/k2.wav', 'ordenar en disco con subcarpetas: ' + pl.items.map((x) => x.dest));
  ok(organizePlan([{ id: 'a', name: 'k.wav', path: 'x/k.wav', ext: 'wav', cat: 'kick', cert: 'user', sub: 'Con pegada' }], { subs: false }).items[0].dest === '01 Kicks/k.wav', 'o sin ellas');
});
await test('etiquetas: efectos del nombre y de lo medido; palabras del nombre', () => {
  const tg = detectTags({ name: 'Snare dark verb dly.wav', path: 'Snare dark verb dly.wav', analysis: { bands: { sub: 0, low: 0.1, lowmid: 0.2, mid: 0.3, high: 0.3, air: 0.1 }, centroid: 3000, attackMs: 2, t40: 900, activeDur: 1, sustainDb: -20, flatness: 0.3 } }, 'snare').map((x) => x.tag + ':' + x.src);
  ok(tg.includes('Reverb:name') && tg.includes('Delay:name') && tg.includes('Oscuro:name'), 'del nombre: ' + tg);
  const t2 = detectTags({ name: 's1.wav', path: 's1.wav', analysis: { bands: { sub: 0, low: 0.1, lowmid: 0.2, mid: 0.3, high: 0.3, air: 0.1 }, centroid: 3000, attackMs: 200, t40: 900, activeDur: 1, sustainDb: -20, flatness: 0.3 } }, 'snare').map((x) => x.tag);
  ok(t2.includes('Reverb') && t2.includes('Reverse'), 'de lo medido: cola larga y ataque lento');
  ok([...wordsOf({ name: 'Dark_Rumble_Kick_128bpm 01.wav' })].join() === 'dark,rumble,kick', 'palabras sin números ni ruido');
  const wi = wordIndex([{ name: 'dark kick' }, { name: 'dark hat' }, { name: 'bright hat' }]);
  ok(wi.length === 2 && wi.some(([w, n]) => w === 'dark' && n === 2), 'palabras repetidas, no las de todos ni las únicas');
});
await test('por parecido: los vecinos decididos votan la categoría (y la subcarpeta)', () => {
  const L = [];
  for (let i = 0; i < 6; i++) L.push({ id: 'k' + i, cat: 'kick', sub: 'punch', v: [0 + i * 0.01, 0] }, { id: 'h' + i, cat: 'hat', v: [5 + i * 0.01, 5] });
  const g = neighbourGuess({ id: 'x', v: [0.2, 0.1] }, L, { k: 7, dist: vecDist });
  ok(g.cat === 'kick' && g.conf > 0.9 && g.n === 6 && g.sub === 'punch', JSON.stringify(g));
  ok(neighbourGuess({ id: 'x', v: [1, 1] }, L.slice(0, 2), { dist: vecDist }) === null, 'sin referencias suficientes no adivina');
});

// ---------- acortar loops (v1.6) ----------
const LSR = 44100, LBEAT = 60 / 128;
function lrng(seed) { let s = seed; return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; }; }
const LK = S.kick(LSR, 0.4), LH = S.hat(LSR, 0.08), LS = S.snare(LSR, 0.3);
function lplace(x, smp, t, g = 1) { const o = Math.round(t * LSR); for (let i = 0; i < smp.length && o + i < x.length; i++) if (o + i >= 0) x[o + i] += smp[i] * g; }
function lloop(bars, fn) { const x = new Float32Array(Math.round(bars * 4 * LBEAT * LSR)); for (let b = 0; b < bars; b++) fn(x, b * 4 * LBEAT, b); return x; }
const lbasic = (x, t0) => { for (let q = 0; q < 4; q++) { lplace(x, LK, t0 + q * LBEAT); lplace(x, LH, t0 + (q + 0.5) * LBEAT, 0.6); } lplace(x, LS, t0 + LBEAT, 0.7); lplace(x, LS, t0 + 3 * LBEAT, 0.7); };
const opt = (res, kind, n, sel) => res.options.find((o) => o.kind === kind && o.keep.n === n && o.keep.sel.join() === sel.join());
await test('acortar: texto de slices ↔ lista (rangos, orden y repetición)', () => {
  ok(JSON.stringify(parseSel('1-4, 7 8', 8)) === '[0,1,2,3,6,7]', 'rangos');
  ok(JSON.stringify(parseSel('4-1', 4)) === '[3,2,1,0]', 'al revés');
  ok(parseSel('9', 8) === null && parseSel('a', 8) === null && parseSel('', 8) === null, 'inválidos');
  ok(selText([0, 1, 2, 3, 6, 7]) === '1-4, 7-8' && selText([3]) === '4', selText([0, 1, 2, 3, 6, 7]));
  ok(validKeep({ n: 4, sel: [0, 3] }) && !validKeep({ n: 4, sel: [4] }) && !validKeep({ n: 1, sel: [0] }), 'validación');
  ok(keepIsIdentity({ n: 4, sel: [0, 1, 2, 3] }) && !keepIsIdentity({ n: 4, sel: [0, 1] }), 'identidad');
});
await test('acortar: detecta lo que se repite y lo que no', () => {
  const r = lrng(5);
  const exact = repetition(lloop(4, lbasic), LSR, { beats: 16 });
  ok(exact.best && exact.best.keep.n === 4 && exact.best.keep.sel.join() === '0' && exact.best.identical, 'idéntico → 1 compás de 4: ' + JSON.stringify(exact.best));
  const human = repetition(lloop(4, (x, t0) => { for (let q = 0; q < 4; q++) { lplace(x, LK, t0 + q * LBEAT + (r() - 0.5) * 0.006, 0.85 + r() * 0.3); lplace(x, LH, t0 + (q + 0.5) * LBEAT + (r() - 0.5) * 0.008, 0.4 + r() * 0.4); } lplace(x, LS, t0 + LBEAT, 0.6 + r() * 0.2); lplace(x, LS, t0 + 3 * LBEAT, 0.6 + r() * 0.2); }), LSR, { beats: 16 });
  ok(human.best && human.best.sim >= REPEAT_HIGH && !human.best.identical, 'tocado a mano: se repite, no idéntico ' + JSON.stringify(human.best));
  const fill = repetition(lloop(4, (x, t0, b) => { lbasic(x, t0); if (b === 3) for (let s = 0; s < 8; s++) lplace(x, LS, t0 + 2 * LBEAT + (s * LBEAT) / 4, 0.5); }), LSR, { beats: 16 });
  ok(opt(fill, 'fill', 4, [0, 3]) && fill.best.kind === 'fill', 'con remate: compás 1 + compás 4 ' + JSON.stringify(fill.options.map((o) => [o.kind, o.keep, o.sim])));
  const half = opt(fill, 'repeat', 2, [0]); ok(!half || half.sim < REPEAT_HIGH, 'las mitades no se repiten (el remate cambia)');
  ok(!fill.options.some((o) => o.keep.n === 8), 'nunca partes de menos de un compás');
  const rand = repetition(lloop(4, (x, t0) => { for (let s = 0; s < 16; s++) { if (r() < 0.3) lplace(x, LK, t0 + (s * LBEAT) / 4); if (r() < 0.4) lplace(x, LH, t0 + (s * LBEAT) / 4, 0.5); if (r() < 0.2) lplace(x, LS, t0 + (s * LBEAT) / 4, 0.5); } }), LSR, { beats: 16 });
  ok(!rand.best && !rand.options.length, 'sin repetición → sin propuestas');
  const bass = repetition(lloop(4, (x, t0, b) => { lbasic(x, t0); for (let s = 0; s < 8; s++) lplace(x, S.saw(b % 2 ? 73.4 * (s % 3 ? 1 : 1.5) : 55 * (s % 2 ? 1.5 : 1), (LBEAT / 2) * 0.9, LSR), t0 + (s * LBEAT) / 2, 0.4); }), LSR, { beats: 16 });
  ok(bass.best && bass.best.keep.n === 2 && bass.best.keep.sel.join() === '0', 'bajo de 2 compases: la mitad, no un cuarto ' + JSON.stringify(bass.best));
  const q = opt(bass, 'repeat', 4, [0]); ok(!q || q.sim < REPEAT_HIGH, 'el cuarto no se repite');
});
await test('acortar: la receta da la duración exacta, sin clics en las uniones ni al repetir', () => {
  const x = lloop(4, lbasic), dec = { sampleRate: LSR, channels: [x] };
  const full = render(dec, { autoTrim: false, normalize: 'none' }).data;
  const half = render(dec, { autoTrim: false, normalize: 'none', keep: { n: 2, sel: [0] } });
  near(half.data.length, Math.round(full.length / 2), 1, 'longitud');
  ok(half.report.kept && half.report.kept.savedSec > 3.7, 'ahorro ' + half.report.kept.savedSec);
  let mx = 0; for (let i = 0; i < half.data.length - 200; i++) mx = Math.max(mx, Math.abs(half.data[i] - full[i]));
  ok(mx < 1e-6, 'la mitad es exactamente la primera mitad ' + mx);
  // bucle: el salto del final al principio no es mayor que los saltos normales de la onda
  const jump = (y) => { let m = 0; for (let i = 1; i < y.length; i++) m = Math.max(m, Math.abs(y[i] - y[i - 1])); return m; };
  const seam = Math.abs(half.data[0] - half.data[half.data.length - 1]);
  ok(seam <= jump(full) + 1e-6, `unión del bucle ${seam} ≤ ${jump(full)}`);
  // unión entre slices no contiguas con una onda continua: sin escalón
  const sr = 48000, sw = new Float32Array(sr * 2); for (let i = 0; i < sw.length; i++) sw[i] = 0.8 * Math.sin((2 * Math.PI * 97.3 * i) / sr);
  const y = applyKeep(sw, { n: 4, sel: [0, 2] }, sr), j = Math.round(sw.length / 4);
  ok(y.length === sw.length / 2, 'longitud 2/4');
  let step = 0; for (let i = j - 3; i < j + 3; i++) step = Math.max(step, Math.abs(y[i + 1] - y[i]));
  ok(step < 0.03, 'unión sin escalón ' + step);
  // reordenar y repetir slices
  ok(applyKeep(sw, { n: 4, sel: [3, 0, 0] }, sr).length === Math.round(sw.length * 3 / 4), 'reordenar / repetir');
});
await test('acortar: duración en el pack y aviso de 30 s con la receta', () => {
  const s = { analysis: { dur: 40, activeDur: 40 }, recipe: { autoTrim: false, keep: { n: 2, sel: [0] } }, cls: { cat: 'dloop' } };
  near(sampleSeconds(s), 20, 1e-9, 'mitad');
  near(rawSeconds({ ...s, recipe: { autoTrim: false } }), 40, 1e-9, 'sin acortar');
  const s2 = { analysis: { dur: 7.5, activeDur: 7.4 }, recipe: { autoTrim: false, fitSec: 7.5, keep: { n: 4, sel: [0, 3] } }, cls: { cat: 'dloop' } };
  near(sampleSeconds(s2), 3.75, 1e-9, 'sobre la duración ajustada al compás');
  const p = emptyPack('t'); p.slots[0] = 'a'; p.slots[1] = 'b';
  const b = budget(p, { a: s, b: { ...s, recipe: { autoTrim: false } } });
  ok(b.over30.length === 1 && b.over30[0] === 1, 'solo avisa el que sigue pasando de 30 s ' + JSON.stringify(b.over30));
  near(b.total, 20 + 30, 1e-9, 'total');
});


// ---------- v1.7 ----------
await test('decidir la categoría conserva lo leído en nombre, carpeta y sonido, y la propuesta de la herramienta', () => {
  const smp = { name: 'TRW_C_Moog_Bass_13.wav', path: 'MY_SAMPLES/LOOPS/SYNTHS/TRW_C_Moog_Bass_13.wav', user: {} };
  const auto = classify(smp);
  ok(auto.reasons.length > 0 && auto.textLoop, JSON.stringify(auto));
  smp.user.cat = 'synth';
  const mine = classify(smp);
  ok(mine.cat === 'synth' && mine.cert === 'user', 'manda lo tuyo');
  ok(mine.reasons.length === auto.reasons.length, 'las explicaciones no se pierden');
  ok(mine.auto && mine.auto.cat === auto.cat, 'queda lo que proponía la herramienta');
  ok(mine.textLoop === auto.textLoop, 'y la pista de loop');
});
await test('loop / one-shot: independiente de la categoría; lo tuyo manda; los loops no se recortan', () => {
  const mk = (name, path, user = {}) => { const s = { name, path, user }; s._cls = classify(s); return s; };
  const bassLoop = mk('Moog Bass 13.wav', 'LOOPS/SYNTHS/Moog Bass 13.wav');
  ok(kindOf(bassLoop) === 'loop' && isLoopSample(bassLoop), 'la carpeta «loops» lo hace loop aunque sea Bass');
  ok(autoTrimOf(bassLoop) === false, 'y como loop no se recorta');
  const kick = mk('Kick 01.wav', 'Drums/Kick 01.wav');
  ok(kindOf(kick) === 'oneshot', 'un kick suelto es one-shot');
  ok(kindOf(mk('Bass loop.wav', 'One Shots/Bass loop.wav')) === 'loop', '«loop» en el nombre gana a la carpeta one shots');
  ok(kindOf(mk('Pad.wav', 'Loops/One Shots/Pad.wav')) === 'oneshot', '«one shots» en la carpeta más cercana');
  const synth = mk('Lead.wav', 'Synths/Lead.wav', { cat: 'synth', kind: 'loop' });
  ok(kindOf(synth) === 'loop' && autoKindOf(synth) === 'oneshot', 'marcarlo a mano manda sobre lo automático');
  bassLoop.user.kind = 'oneshot';
  ok(kindOf(bassLoop) === 'oneshot' && autoTrimOf(bassLoop) === true, 'y al revés');
  const hit = mk('Kick Short.wav', 'Loops/Kick Short.wav'); hit.analysis = { activeDur: 0.3 };
  ok(kindOf(hit) === 'oneshot', 'un golpe de 0,3 s en una carpeta «Loops» sigue siendo one-shot');
  const dl = mk('Break 174.wav', 'x/Break 174.wav', { cat: 'dloop' });
  ok(kindOf(dl) === 'loop', 'drum loop es loop');
});
await test('ordenar en disco: loops y one-shots por separado, etiquetas en el nombre y todo en el manifiesto', () => {
  const L = [
    { id: 'a', name: 'Moog Bass 13.wav', path: 'x/Moog Bass 13.wav', ext: 'wav', cat: 'bass', cert: 'user', sub: 'Subs', kind: 'loop', tags: ['Oscuro', 'Analógico'], rating: 4, fav: true },
    { id: 'b', name: 'Sub 1.wav', path: 'x/Sub 1.wav', ext: 'wav', cat: 'bass', cert: 'user', sub: 'Subs', kind: 'oneshot', tags: [] },
    { id: 'c', name: 'Break.wav', path: 'x/Break.wav', ext: 'wav', cat: 'dloop', cert: 'user', kind: 'loop' },
  ];
  const d = (p) => Object.fromEntries(p.items.map((i) => [i.id, i.dest]));
  const p1 = d(organizePlan(L, { kinds: true }));
  ok(p1.a === '09 Bass/Loops/Subs/Moog Bass 13.wav' && p1.b === '09 Bass/One-shots/Subs/Sub 1.wav', JSON.stringify(p1));
  ok(p1.c === '14 Drum Loops/Break.wav', 'las categorías de loops no repiten carpeta');
  const p2 = d(organizePlan(L, { kinds: false }));
  ok(p2.a === '09 Bass/Subs/Moog Bass 13.wav', 'sin separar, como antes');
  const p3 = d(organizePlan(L, { kinds: true, tagsInName: true, kindDir: { loop: 'Loops', oneshot: 'One-shots' } }));
  ok(p3.a.endsWith('/Moog Bass 13 [Oscuro, Analogico].wav') && p3.b.endsWith('/Sub 1.wav'), p3.a);
  const csv = manifestCSV(organizePlan(L, { kinds: true }), 'R').split('\n');
  ok(csv[0] === 'source,destination,category,subfolder,type,tags,rating,favourite', csv[0]);
  ok(csv.some((l) => l.includes('"bass","Subs","loop","Oscuro; Analógico",4,yes')), csv.join('\n'));
});


// ---------- v1.8: exportar en slices y con las propiedades del original ----------
await test('slices en formato original: mismos canales, frecuencia y bits; sin tocar, idéntico byte a byte', () => {
  const sr = 44100, n = sr * 2, L = new Float32Array(n), R = new Float32Array(n);
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  for (let i = 0; i < n; i++) { L[i] = Math.round(rnd() * 20000) / 32768; R[i] = Math.round(rnd() * 20000) / 32768; }
  const wav = encodeOriginal({ channels: [L, R], sampleRate: sr }, { bits: 16, float: false });
  const d = parseAudio(wav);
  ok(d.bits === 16 && d.channels.length === 2 && d.sampleRate === sr);
  const fmt = originalFormat(d);
  ok(fmt.bits === 16 && !fmt.float, JSON.stringify(fmt));
  const whole = slicesOriginal(d, { autoTrim: false }, 1);
  const again = encodeOriginal(whole[0], fmt);
  ok(again.length === wav.length && again.every((b, i) => b === wav[i]), 'entero y sin recorte: el mismo archivo');
  const parts = slicesOriginal(d, { autoTrim: false }, 4);
  ok(parts.length === 4 && parts.every((p) => p.channels.length === 2 && p.sampleRate === sr), 'cuatro partes estéreo a 44,1 kHz');
  ok(parts.reduce((a, p) => a + p.channels[0].length, 0) === n, 'las partes suman el todo');
  const fade = Math.round(0.002 * sr), p2 = parts[1].channels[1], off = parts[0].channels[0].length;
  let same = true; for (let i = fade; i < p2.length - fade; i++) if (p2[i] !== R[off + i]) { same = false; break; }
  ok(same, 'fuera de los fundidos de 2 ms, las muestras no cambian');
  ok(Math.abs(p2[0]) <= Math.abs(R[off]) + 1e-9 && p2[0] === 0, 'y el corte empieza con fundido');
  const d24 = parseAudio(encodeOriginal({ channels: [L], sampleRate: 96000 }, { bits: 24, float: false }));
  ok(originalFormat(d24).bits === 24 && slicesOriginal(d24, { autoTrim: false }, 2)[0].sampleRate === 96000, '24 bit a 96 kHz se quedan así');
  ok(originalFormat({ bits: 0, format: 'mp3' }).bits === 24 && originalFormat({ bits: 32, format: 'float' }).float, 'comprimidos a 24 bit; coma flotante se queda en float');
});
await test('slices en formato Rhythm: 48 kHz mono, mismo nivel que el sample entero y tope de 30 s', () => {
  const sr = 44100, x = new Float32Array(sr * 4);
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * 110 * i) / sr) * (i % 11025 < 4000 ? 1 : 0.3);
  const d = { sampleRate: sr, channels: [x, x] };
  const rec = { autoTrim: false, normalize: 'peak', targetDb: -0.5 };
  const full = render(d, rec, 48000).data, parts = slicesRhythm(d, rec, 8);
  ok(parts.length === 8 && parts.every((p) => p.sampleRate === 48000 && p.channels.length === 1), 'ocho partes mono a 48 kHz');
  ok(parts.reduce((a, p) => a + p.channels[0].length, 0) === full.length, 'suman lo mismo que el sample preparado');
  const f = Math.round(0.002 * 48000), q = parts[3].channels[0], o = sliceBounds(full.length, 8)[3][0];
  let maxd = 0; for (let i = f; i < q.length - f; i++) maxd = Math.max(maxd, Math.abs(q[i] - full[o + i]));
  ok(maxd < 1e-6, 'con el mismo nivel que el entero (normalizado una sola vez) ' + maxd);
  const w = encodeRhythm(parts[0]), back = parseAudio(w);
  ok(back.sampleRate === 48000 && back.bits === 16 && back.channels.length === 1);
  const long = { sampleRate: 8000, channels: [new Float32Array(8000 * 70).fill(0.1)] };
  const lp = slicesRhythm(long, { autoTrim: false }, 2);
  ok(lp.every((p) => p.capped && p.channels[0].length === 30 * 48000), 'cada parte de más de 30 s se recorta a 30 s');
});
await test('slices: la zona es la de la rejilla de la Rhythm (recorte y ajuste al compás) y los nombres numerados', () => {
  const sr = 48000, x = new Float32Array(sr * 3); x.fill(0.2, sr * 0.5, sr * 2.5);
  const d = { sampleRate: sr, channels: [x] };
  const z = zoneOf(d, { autoTrim: false, trimStart: 0.5, trimEnd: 2.5 });
  ok(z.s === sr * 0.5 && z.len === sr * 2, JSON.stringify(z));
  const zf = zoneOf(d, { autoTrim: false, trimStart: 0.5, trimEnd: 2.5, fitSec: 2.25 });
  ok(zf.len === sr * 2.25, 'el ajuste al compás alarga la zona');
  const pf = slicesOriginal(d, { autoTrim: false, trimStart: 0.5, trimEnd: 2.5, fitSec: 2.25 }, 3);
  ok(pf.reduce((a, p) => a + p.channels[0].length, 0) === sr * 2.25, 'y las partes la cubren entera (con silencio al final)');
  ok(sliceName('Loop', 0, 8) === 'Loop 01' && sliceName('Loop', 11, 16) === 'Loop 12' && sliceName('Kick', 0, 1) === 'Kick');
});


// ---------- v1.9: más repetición dentro de cada parte ----------
await test('canción: el groove repite A y solo varía al final (A A A\' fill); A\' no toca bombo ni bajo', () => {
  for (const steps of [16, 32]) {
    const f = songFamily({ style: 'techno', seed: 11, steps });
    const J = (x) => JSON.stringify(x);
    ok(J(RANGES.groove) === '[1,4]' && J(RANGES.groove2) === '[1,2]', 'cadenas: groove 2–5, solo A 2–3');
    for (let t = 0; t < 8; t++) ok(J(f.tracks[t][1]) === J(f.tracks[t][2]), `patrones 2 y 3 iguales (pista ${t + 1})`);
    for (const t of [0, 5, 6]) ok(J(f.tracks[t][3]) === J(f.tracks[t][1]), `A' no cambia el bombo, el bajo ni el synth (pista ${t + 1})`);
    const diff = [2, 3, 4].some((t) => J(f.tracks[t][3]) !== J(f.tracks[t][1]));
    ok(diff, 'A\' remata en charles o percusión');
    for (let t = 0; t < 8; t++) ok(J(f.tracks[t][3].slice(0, steps - 4)) === J(f.tracks[t][1].slice(0, steps - 4)), `A' solo cambia el último tiempo (pista ${t + 1})`);
  }
});
await test('canción: las escenas del medio de una sección tocan solo A; la última remata con A\' y fill', () => {
  for (const steps of [16, 32]) {
    const f = songFamily({ seed: 3, steps });
    const tl = timeline(f, arrange('peak', 3));
    const drop = tl.scenes.filter((x) => x.id === 'drop');
    ok(drop.length >= 2, `el drop ocupa ${drop.length} escenas (${steps} pasos)`);
    const K = (x) => [x.tracks[0].from, x.tracks[0].to].join('–');
    ok(drop.slice(0, -1).every((x) => K(x) === '1–2') && K(drop[drop.length - 1]) === '1–4', `bombo: ${drop.map(K).join(' · ')}`);
    ok(drop.slice(1, -1).every((x) => x.same === drop[0].n) && drop[drop.length - 1].same == null && drop[drop.length - 1].end, 'las del medio son copias; la última, una escena propia');
    // cuánto se repite: compases del drop en los que el charles toca A tal cual
    const ev = songEvents(f, tl, { onlyTrack: 2 }), A = f.tracks[2][1];
    const first = drop[0].start, total = drop.reduce((a, x) => a + x.bars, 0);
    let same = 0;
    for (let b = 0; b < total; b++) {
      const got = ev.filter((e) => e.step >= (first + b) * 16 && e.step < (first + b + 1) * 16).map((e) => `${e.step % 16}:${e.v}`).join();
      const want = A.slice((b * 16) % steps, (b * 16) % steps + 16).map((x, i) => (x ? `${i}:${x.v}` : '')).filter(Boolean).join();
      if (got === want) same++;
    }
    ok(same / total >= 0.85, `el charles repite A en ${same} de ${total} compases del drop (${steps} pasos)`);
  }
});


// ---------- v2.0: seleccionar en el mapa ----------
await test('mapa: los más parecidos con rasgos normalizados, carácter medido y selección por zona', () => {
  const A = (o) => ({ bands: { sub: 0.1, low: 0.1, lowmid: 0.2, mid: 0.3, high: 0.2, air: 0.1 }, activeDur: 0.4, centroid: 2000, flatness: 0.1, attackMs: 3, f0conf: 0.2, envDepthDb: 25, ...o });
  const items = [
    { id: 'k1', analysis: A({ bands: { sub: 0.5, low: 0.3, lowmid: 0.1, mid: 0.05, high: 0.03, air: 0.02 }, centroid: 300 }) },
    { id: 'k2', analysis: A({ bands: { sub: 0.48, low: 0.32, lowmid: 0.1, mid: 0.05, high: 0.03, air: 0.02 }, centroid: 320 }) },
    { id: 'h1', analysis: A({ bands: { sub: 0, low: 0, lowmid: 0.05, mid: 0.15, high: 0.4, air: 0.4 }, centroid: 9000, flatness: 0.6, activeDur: 0.08 }) },
    { id: 'h2', analysis: A({ bands: { sub: 0, low: 0, lowmid: 0.05, mid: 0.15, high: 0.42, air: 0.38 }, centroid: 8800, flatness: 0.55, activeDur: 0.09 }) },
    { id: 'p1', analysis: A({ activeDur: 4, attackMs: 300, centroid: 700, f0conf: 0.9, envDepthDb: 3 }) },
  ];
  const z = zVectors(items);
  ok(z.size === 5 && [...z.values()].every((v) => v.length === 10));
  const nk = nearestIds(z, new Set(['k1']), 2);
  ok(nk[0].id === 'k2', 'lo más parecido a un bombo es el otro bombo: ' + nk.map((x) => x.id));
  const nh = nearestIds(z, new Set(['h1', 'k1']), 4);
  ok(nh.slice(0, 2).map((x) => x.id).sort().join() === 'h2,k2' && !nh.some((x) => x.id === 'h1'), 'varias referencias, sin repetirlas');
  ok(measuredChar(items[0].analysis).includes('Oscuro') && measuredChar(items[0].analysis).includes('Grave') && measuredChar(items[0].analysis).includes('Con pegada'));
  ok(['Brillante', 'Ruidoso', 'Corto'].every((c) => measuredChar(items[2].analysis).includes(c)));
  ok(['Largo', 'Tonal', 'Suave'].every((c) => measuredChar(items[4].analysis).includes(c)) && measuredChar(null).length === 0);
  ok(measuredChar(items[2].analysis).every((c) => MEASURED_CHARS.includes(c)));
  ok(inRect([{ id: 'a', x: 1, y: 1 }, { id: 'b', x: -1, y: 2 }, { id: 'c', x: 0.5, y: -0.2 }], 2, 1.5, 0, -1).sort().join() === 'a,c', 'rectángulo en cualquier dirección');
});


await test('mapa: grupos de sonidos parecidos (k-means determinista sobre lo medido)', () => {
  const mk = (id, sub, cen, dur, fl) => ({ id, analysis: { bands: { sub, low: sub / 2, lowmid: 0.1, mid: 0.1, high: (1 - sub) / 2, air: (1 - sub) / 3 }, activeDur: dur, centroid: cen, flatness: fl, attackMs: 2, f0conf: 0.2, envDepthDb: 25 } });
  const items = [];
  for (let i = 0; i < 6; i++) items.push(mk('k' + i, 0.6 + i * 0.01, 250 + i * 10, 0.4, 0.05));
  for (let i = 0; i < 6; i++) items.push(mk('h' + i, 0.02, 9000 + i * 50, 0.08, 0.6));
  for (let i = 0; i < 6; i++) items.push(mk('p' + i, 0.2, 1500 + i * 20, 4, 0.1));
  const z = zVectors(items);
  const a = kmeansGroups(z, 3), b = kmeansGroups(z, 3);
  ok(JSON.stringify(a.groups) === JSON.stringify(b.groups), 'determinista');
  ok(a.k === 3 && a.groups.every((g) => g.ids.length === 6), 'tres grupos de seis: ' + a.groups.map((g) => g.ids.length));
  ok(a.groups.every((g) => new Set(g.ids.map((x) => x[0])).size === 1), 'cada grupo, de un solo tipo: ' + a.groups.map((g) => g.ids.join('')).join(' | '));
  ok(a.of.get('k0') === a.of.get('k5') && a.of.get('k0') !== a.of.get('h0'));
  ok(groupCount(10) === 2 && groupCount(200) === 10 && groupCount(5000) === 12 && kmeansGroups(new Map(), 3).k === 0);
});

// ---------- v2.3: afinar, volumen percibido y golpes ----------
await test('afinar: el camino más corto a la tónica, cents y propuesta por categoría', () => {
  near(shiftToPc(29.3, 5), -0.3, 1e-9, 'F1 +30 ct → F1');
  near(shiftToPc(31, 5), -2, 1e-9, 'G1 → F1 baja 2');
  near(shiftToPc(27, 5), 2, 1e-9, 'D#1 → F1 sube 2');
  near(shiftToPc(35, 5), -6, 1e-9, 'el tritono baja');
  near(shiftToSemitone(45.62), 0.38, 1e-9, 'al semitono');
  const it = [{ id: 'k', cat: 'kick', midi: 31.2 }, { id: 's', cat: 'synth', midi: 62.2 }, { id: 'l', cat: 'bass', midi: 36, loop: true }, { id: 'h', cat: 'hat', midi: null }, { id: 'b', cat: 'bass', midi: 29, tune: 0 }];
  const p = Object.fromEntries(tunePlan(it, { root: 5, mode: 'root' }).map((x) => [x.id, x]));
  ok(p.k.status === 'change' && near(p.k.shift, -2.2, 1e-9) === undefined && p.k.toRoot, 'el bombo, a la tónica');
  ok(p.s.status === 'change' && !p.s.toRoot && Math.abs(p.s.shift + 0.2) < 1e-9, 'el synth solo corrige cents');
  ok(p.l.status === 'loop' && p.h.status === 'nopitch' && p.b.status === 'ok', 'loops y sin tono no se tocan; lo afinado queda «ok»');
  const q = Object.fromEntries(tunePlan(it, { root: 5, mode: 'allroot' }).map((x) => [x.id, x]));
  ok(q.s.toRoot && Math.abs(q.s.shift - 2.8) < 1e-9, 'todo a la tónica: el synth sube a F');
  ok(effectiveMidi({ analysis: { f0conf: 0.9, midi: 31.2 }, recipe: { tune: -2.2 } }) === 29, 'nota efectiva = medida + afinación');
  ok(pitchLabel(29.3).endsWith('+30 ct'), pitchLabel(29.3));
});
await test('afinar: la receta cambia la nota y la duración como un sampler', () => {
  const sr = 44100, x = S.sine(110, 1, sr, 0.6);
  const d = { channels: [x], sampleRate: sr };
  const up = render(d, { tune: 12, autoTrim: false }), dn = render(d, { tune: -3, autoTrim: false });
  near(up.data.length / 48000, 0.5, 0.002, 'una octava arriba dura la mitad');
  near(zeroCrossFreq(up.data, 48000), 220, 2, 'y suena una octava arriba');
  near(dn.data.length / 48000, 1 / tuneRatio(-3), 0.003, 'tres semitonos abajo dura más');
  near(zeroCrossFreq(dn.data, 48000), 110 * tuneRatio(-3), 1.5, 'y suena tres semitonos abajo');
  const smp = { analysis: { dur: 1, activeDur: 1, leadMs: 0 }, recipe: { tune: 12 } };
  near(rawSeconds(smp), 0.5, 1e-9, 'el presupuesto del pack cuenta la duración afinada');
  const fit = render(d, { tune: 12, autoTrim: false, fitSec: 0.8 });
  near(fit.data.length / 48000, 0.4, 0.002, 'el ajuste al compás también se afina');
});
await test('volumen percibido: ponderación K de la norma, LUFS y nivel «loud» con tope de pico', () => {
  const [s1, s2] = kCoefficients(48000);
  near(s1.b[0], 1.53512485958697, 1e-9); near(s1.a[1], -1.69065929318241, 1e-9); near(s1.a[2], 0.73248077421585, 1e-9);
  near(s2.b[1], -2, 1e-6); near(s2.a[1], -1.99004745483398, 1e-9); near(s2.a[2], 0.99007225036621, 1e-9);
  // un seno de 1 kHz a −20 dBFS (amplitud 0,1) da −23 LUFS en un canal (−20 − 3,01 + 0,69 − 0,69 ≈ −23,0)
  const sr = 48000, x = new Float32Array(sr * 2); for (let i = 0; i < x.length; i++) x[i] = 0.1 * Math.sin((2 * Math.PI * 1000 * i) / sr);
  near(loudnessMax(x, sr), -23.0, 0.15, 'seno 1 kHz −20 dBFS');
  ok(loudnessMax(new Float32Array(1000), sr) === -Infinity, 'silencio');
  // un golpe corto suena menos que uno largo con el mismo pico
  const short = new Float32Array(sr * 0.05), long = new Float32Array(sr * 0.4);
  for (let i = 0; i < short.length; i++) short[i] = 0.5 * Math.sin((2 * Math.PI * 200 * i) / sr);
  for (let i = 0; i < long.length; i++) long[i] = 0.5 * Math.sin((2 * Math.PI * 200 * i) / sr);
  ok(loudnessMax(long, sr) - loudnessMax(short, sr) > 8, 'la ventana de 400 ms pesa la duración');
  const d = { channels: [x], sampleRate: sr };
  const r = render(d, { normalize: 'loud', targetLufs: -18, autoTrim: false });
  near(loudnessMax(r.data, 48000), -18, 0.2, 'normalizado a −18 LUFS');
  const r2 = render(d, { normalize: 'loud', targetLufs: 0, autoTrim: false });
  ok(r2.report.loudLimited && Math.abs(db(peakOf(r2.data)) + 0.5) < 0.05, 'si no llega sin saturar, se queda en el pico');
  const m = matchGroup([{ id: 'a', lufs: -8 }, { id: 'b', lufs: -11 }, { id: 'c', lufs: -10 }, { id: 'd', lufs: -25 }]);
  ok(m.target === -11, 'objetivo: el más flojo de los normales ' + m.target);
  const by = Object.fromEntries(m.items.map((x) => [x.id, x]));
  ok(by.a.cut === 3 && by.b.cut === 0 && by.d.low === 14 && by.d.to === -25, 'los fuertes bajan; el raro se avisa');
});
await test('golpes: ataques precisos, cortes limpios, categorías y grupos de un loop', () => {
  const sr = 44100, beat = 60 / 128, x = new Float32Array(Math.round(8 * beat * sr));
  // el bombo decae entero (como en un loop real): su cola suena debajo del charles y de la caja siguientes
  const K = S.kick(sr, 0.9), H = S.hat(sr, 0.08), SN = S.snare(sr, 0.3);
  const put = (smp, t, g = 1) => { const o = Math.round(t * sr); for (let i = 0; i < smp.length && o + i < x.length; i++) x[o + i] += smp[i] * g; };
  const want = [];
  for (let bar = 0; bar < 2; bar++) for (let q = 0; q < 4; q++) {
    const t0 = (bar * 4 + q) * beat;
    if (q % 2 === 0) put(K, t0); else put(SN, t0, 0.8);
    want.push(t0); put(H, t0 + beat / 2, 0.5); want.push(t0 + beat / 2);
  }
  const d = { channels: [x, x.slice()], sampleRate: sr, bits: 24 };
  const hits = findHits(d);
  ok(hits.length === 16, `16 golpes (${hits.length})`);
  for (let i = 0; i < Math.min(16, hits.length); i++) ok(Math.abs(hits[i].t - want[i]) < 0.004, `ataque ${i}: ${hits[i].t.toFixed(4)} ≉ ${want[i].toFixed(4)}`);
  ok(hits.every((h, i) => i === hits.length - 1 || h.b <= hits[i + 1].a), 'sin solaparse');
  const a = hitAudio(d, hits[0]);
  ok(a.channels.length === 2 && a.sampleRate === sr && Math.abs(a.channels[0][0]) < 1e-3, 'todos los canales, empieza en silencio');
  const g = groupHits(describeHits(d, hits));
  const sum = Object.fromEntries(g.map((x) => [x.cat, x.members.length]));
  ok(g.length === 3 && sum.kick === 4 && sum.hat === 8 && (sum.snare === 4 || sum.clap === 4 || sum.perc === 4), 'tres grupos: ' + JSON.stringify(sum));
  ok(g.every((x) => x.rep && x.members.includes(x.rep)), 'cada grupo tiene su golpe elegido');
  ok(hitOnsets(new Float32Array(sr), sr).length === 0, 'el silencio no tiene golpes');
  ok(hitBaseName('Amen_Break_170bpm Loop 02.wav') === 'Amen 02' && hitBaseName('Top Loop 128bpm.wav') === 'Top', hitBaseName('Amen_Break_170bpm Loop 02.wav') + ' · ' + hitBaseName('Top Loop 128bpm.wav'));
});

await test('loops: lo que suena en ellos es su subcarpeta (nombre, carpeta y sonido)', () => {
  const sub = (name, path, a = null) => proposeSub({ name, path, analysis: a }, 'dloop')?.id;
  ok(sub('hatloop 128.wav', 'Loops/hatloop 128.wav') === 'hat', 'hatloop → Hats cerrados');
  ok(sub('loop 07.wav', 'Loops/hh/loop 07.wav') === 'hat', 'carpeta «hh» → Hats cerrados');
  ok(sub('Open Hat Loop 126.wav', 'Loops/Open Hat Loop 126.wav') === 'ohat', 'open hat → Hats abiertos');
  ok(sub('Shaker Loop.wav', 'Loops/Shaker Loop.wav') === 'shaker', 'shaker → Shakers');
  ok(sub('Kick Loop 02.wav', 'Loops/Kick Loop 02.wav') === 'kick', 'kick loop → Kicks');
  ok(sub('Top Loop 128bpm.wav', 'Loops/Top Loop 128bpm.wav') === 'top', 'top loop sigue siendo Tops');
  const hi = { bands: { sub: 0.01, low: 0.02, lowmid: 0.02, mid: 0.05, high: 0.5, air: 0.4 }, centroid: 9000, flatness: 0.2, attackMs: 2, activeDur: 4, t20: 60 };
  ok(sub('loop 3.wav', 'Loops/loop 3.wav', hi) === 'hat', 'por el sonido: solo agudos y cortos → Hats cerrados');
  ok(sub('loop 3.wav', 'Loops/loop 3.wav', { ...hi, t20: 300 }) === 'ohat', 'con cola → Hats abiertos');
  ok(sub('loop 3.wav', 'Loops/loop 3.wav', { ...hi, attackMs: 25, flatness: 0.5 }) === 'shaker', 'ataque suave y ruido → Shakers');
  ok(contentSubFor('dloop', 'hat', 'hh') === 'hat' && contentSubFor('dloop', 'perc', 'shaker') === 'shaker' && contentSubFor('dloop', 'snare') === 'clap', 'pista → subcarpeta del loop');
  ok(contentSubFor('mloop', 'bass') === 'bass' && contentSubFor('dloop', 'bass') === null, 'loop melódico: bajo; un bajo no es contenido de un loop de batería');
  ok(defaultSubLabel('dloop', 'hat') === 'Closed-Hats', 'etiqueta de fábrica');
  const plan = organizePlan([{ id: 'a', name: 'hatloop', path: 'x/hatloop.wav', ext: 'wav', cat: 'dloop', cert: 'user', sub: 'Closed-Hats', kind: 'loop' }]);
  ok(plan.items[0].dest === '14 Drum Loops/Closed-Hats/hatloop.wav', 'Ordenar en disco: ' + plan.items[0].dest);
});

await test('mono reparado: contrafase, retardo entre canales, cancelación parcial y estéreo sin relación', () => {
  const sr = 44100, n = sr * 2; let sd = 7; const rnd = () => ((sd = (sd * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
  const x = new Float32Array(n).map((_, i) => 0.3 * rnd() + 0.3 * Math.sin((2 * Math.PI * 220 * i) / sr));
  const shift = (a, d) => new Float32Array(a.length).map((_, i) => (i - d >= 0 ? a[i - d] : 0));
  const eRef = (L, R) => (L.reduce((a, v) => a + v * v, 0) + R.reduce((a, v) => a + v * v, 0)) / 2;
  const kept = (L, R, y) => 10 * Math.log10(eRef(L, R) / y.reduce((a, v) => a + v * v, 0));
  // canal invertido → se le da la vuelta, sin pérdida
  const inv = toMono([x, x.map((v) => -v)], 'auto', sr);
  ok(inv.used === 'flip' && Math.abs(kept(x, x, inv.data)) < 0.1, 'contrafase: ' + inv.used);
  // R 11 ms por delante → se alinea: la suma tal cual pierde mucho, la alineada casi nada
  const d = Math.round(0.011 * sr), L = shift(x, d);
  ok(channelDelay(L, x, sr).lag === d, 'retardo medido');
  const al = toMono([L, x], 'auto', sr);
  ok(al.used === 'align' && al.fix.lead === 'R' && Math.abs(al.fix.delayMs - 11) < 0.1 && al.fix.lossAfter < 0.1 && al.fix.worstDb > 6, 'retardo: ' + JSON.stringify(al.fix));
  // efecto Haas de 0,8 ms (filtro de peine) → también se alinea
  ok(toMono([x, shift(x, Math.round(0.0008 * sr))], 'auto', sr).used === 'align', 'Haas 0,8 ms');
  // retardo + contrafase
  const ai = toMono([shift(x, 200), x.map((v) => -v)], 'auto', sr);
  ok(ai.used === 'align' && ai.fix.flipped, 'retardo con un canal invertido');
  // cancelación parcial sin retardo (correlación negativa, contenido distinto) → suma alineada por frecuencias
  const y = new Float32Array(n).map(() => 0.3 * rnd());
  const pL = x.map((v, i) => 0.6 * v + 0.9 * y[i]), pR = x.map((v, i) => -0.6 * v + 0.9 * y[i]);
  const sp = toMono([pL, pR], 'auto', sr);
  ok(sp.used === 'spectral' && sp.fix.lossAfter < sp.fix.lossBefore - 3, 'parcial: ' + sp.used + ' ' + JSON.stringify(sp.fix));
  ok(Math.abs(sp.data.length - n) === 0 && sp.data.every(Number.isFinite), 'misma longitud y sin valores raros');
  // dos canales sin relación: no es cancelación, se suman tal cual
  const u1 = new Float32Array(n).map(() => 0.3 * rnd()), u2 = new Float32Array(n).map(() => 0.3 * rnd());
  ok(toMono([u1, u2], 'auto', sr).used === 'sum' && monoBands(u1, u2, sr).worstDb < 6, 'sin relación: suma');
  // una suma normal (correlación alta) no se toca; idénticos → un canal; a mano manda
  const near = x.map((v, i) => v + 0.05 * u1[i]);
  ok(toMono([x, near], 'auto', sr).used === 'sum' && toMono([x, x.slice()], 'auto', sr).used === 'left', 'suma normal e idénticos');
  ok(toMono([L, x], 'sum', sr).used === 'sum' && toMono([L, x], 'right', sr).data === x && toMono([u1, u2], 'repair', sr).used === 'spectral', 'modos a mano');
  // la receta lo usa al pasar a 48 kHz mono: el render del retardo conserva el nivel
  const dec = { sampleRate: sr, channels: [L, x] };
  const rep = render(dec, { normalize: 'none', gainDb: 0, autoTrim: false });
  ok(rep.report.monoUsed === 'align', 'render usa la reparación');
});

console.log(results.join('\n'));
console.log(`\n${pass} correctas, ${fail} con fallo`);
process.exit(fail ? 1 : 0);
