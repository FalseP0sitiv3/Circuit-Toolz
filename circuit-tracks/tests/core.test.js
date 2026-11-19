// Pruebas del núcleo con fixtures SINTÉTICOS (no validan hardware).
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitMessages, parseMessage, detectBank, buildReplaceCurrent, buildDumpRequest, readName } from '../src/core/sysex.js';
import { decodePatch, integrityCheck, analyze, hasFeature } from '../src/core/patch.js';
import { classify, tokenize, matchText, baseName, calibration } from '../src/core/classify.js';
import { relation, diffParams, similarity, fingerprints } from '../src/core/compare.js';
import { auditMacros, swapKnobs, reorderToProfile, fillEmptyFromProfile, PROFILES, profileFit } from '../src/core/macros.js';
import { readZip, writeZip, safeZipPath, crc32 } from '../src/core/zip.js';
import { Library, MemoryStore, b64 } from '../src/core/library.js';
import { initPayload, syx, bank, setMacro, presets } from './fixtures.js';

const enc = (s) => new TextEncoder().encode(s);

test('1 · SysEx: mensaje individual válido y cabeceras', () => {
  const pl = initPayload('Test Bass');
  const m = syx(pl);
  assert.equal(m.length, 350);
  const { messages, anomalies } = splitMessages(m);
  assert.equal(messages.length, 1); assert.equal(anomalies.length, 0);
  const r = parseMessage(messages[0].bytes);
  assert.equal(r.kind, 'patch'); assert.equal(r.product, 0x64); assert.equal(r.command, 0); assert.deepEqual(r.problems, []);
  assert.equal(readName(r.payload).name, 'Test Bass');
});

test('5 · Mensajes inválidos: truncado, longitud, byte de 8 bits, producto, ruido', () => {
  const m = syx(initPayload());
  const trunc = m.slice(0, 200);
  assert.ok(splitMessages(trunc).anomalies.some((a) => a.code === 'truncated'));
  const short = Uint8Array.from([...m.slice(0, 100), 0xF7]);
  assert.ok(parseMessage(short).problems.some((p) => /Longitud/.test(p)));
  const bad = new Uint8Array(m); bad[3] = 0x30; assert.ok(parseMessage(bad).problems.length);
  const prod = new Uint8Array(m); prod[5] = 0x61; assert.match(parseMessage(prod).problems[0], /Producto/);
  const loc = new Uint8Array(m); loc[7] = 5; assert.ok(parseMessage(loc).problems.some((p) => /Ubicación/.test(p)));
  const withStatus = new Uint8Array(m); withStatus[100] = 0x90;
  assert.ok(splitMessages(withStatus).anomalies.some((a) => a.code === 'status-in-sysex'));
  const noisy = Uint8Array.from([1, 2, 3, ...m, 0xF8]);
  assert.ok(splitMessages(noisy).anomalies.some((a) => a.code === 'stray-bytes'));
  assert.equal(parseMessage(buildDumpRequest(1)).kind, 'dump-request');
  // Reloj MIDI dentro del SysEx: se elimina sin romper el mensaje.
  const rt = Uint8Array.from([...m.slice(0, 50), 0xF8, ...m.slice(50)]);
  const s = splitMessages(rt); assert.equal(s.messages[0].bytes.length, 350);
});

test('Varios mensajes y banco documentado de 64', () => {
  const pls = Array.from({ length: 64 }, (_, i) => initPayload('P' + i));
  const b = bank(pls);
  const { messages } = splitMessages(b);
  const parsed = messages.map((x) => parseMessage(x.bytes));
  assert.equal(parsed.length, 64); assert.ok(detectBank(parsed));
  assert.equal(parsed[10].location, 10);
});

test('4 · Decodificación de parámetros en offsets oficiales', () => {
  const pl = initPayload('X', { 32: 0, 36: 13, 63: 3, 64: 55, 66: 77, 91: 0b100011 });
  pl.set([6, 0, 100, 12], 124); // LFO1+ → filtro, profundidad +36
  const d = decodePatch(pl);
  assert.equal(d.v['voice.poly'], 0); assert.equal(d.v['osc1.wave'], 13); assert.equal(d.v['filter.type'], 3);
  assert.equal(d.v['filter.freq'], 55); assert.equal(d.v['filter.res'], 77);
  assert.equal(d.matrix[0].active, true); assert.equal(d.matrix[0].destName, 'Filter frequency');
  assert.equal(d.lfoFlags[0].oneShot, true); assert.equal(d.lfoFlags[0].keySync, true); assert.equal(d.lfoFlags[0].fade, 2);
  assert.deepEqual(integrityCheck(pl).filter((x) => x.level !== 'info'), []);
  const out = initPayload('X', { 63: 9, 34: 10 });
  assert.equal(integrityCheck(out).filter((x) => x.level === 'warn').length, 2);
});

test('Análisis técnico: percusivo, pad, registro', () => {
  assert.ok(hasFeature(analyze(presets.pluck()), 'percussive'));
  const pad = analyze(presets.padPoly()); assert.ok(hasFeature(pad, 'slow-attack') && hasFeature(pad, 'long-release') && hasFeature(pad, 'poly'));
  assert.ok(hasFeature(analyze(presets.monoBass()), 'low-register'));
});

test('8 · Clasificación de nombres: compuestos y falsos positivos', () => {
  assert.deepEqual(tokenize('AcidBass_03v2'), ['acid', 'bass', 'v']);
  const c1 = classify({ payload: initPayload('ACID BASS 07') });
  assert.equal(c1.category, 'bass'); assert.equal(c1.subtype, 'acid');
  const c2 = classify({ payload: initPayload('Synth Brass') }); assert.equal(c2.category, 'brass');
  assert.equal(classify({ payload: initPayload('Bassoon Solo') }).scores.bass, undefined);
  assert.equal(matchText('Subtle Padding').hits.filter((h) => h.cat).length, 0);
  const amb = classify({ payload: initPayload('Lead Bass') });
  assert.equal(amb.certainty, 'ambiguous'); assert.equal(amb.category, null);
  const sub = classify({ payload: initPayload('Sub', { 35: 62 }), fileName: 'SubBass 01.syx' });
  assert.equal(sub.category, 'bass'); assert.equal(sub.subtype, 'sub');
  // «Dark» se registra como descriptor declarado, no como prueba acústica.
  const dk = classify({ payload: initPayload('Dark Pad', { 32: 2, 70: 80, 73: 100, 64: 120 }) });
  assert.equal(dk.category, 'pad'); assert.ok(dk.descriptors.some((d) => d.label === 'Dark' && d.declared));
  assert.ok(dk.contradictions.some((c) => /Dark/.test(c.text)));
  // Arp como uso, no como timbre, cuando hay familia tímbrica.
  const arp = classify({ payload: initPayload('Pluck Arp') }); assert.equal(arp.category, 'pluck'); assert.ok(arp.usage.includes('arp'));
  assert.equal(baseName('Rolling Bass v2.syx'), baseName('Rolling Bass.syx'));
});

test('9 · Contradicciones y fuentes corroboradas', () => {
  const c = classify({ payload: initPayload('Big Pad', { 70: 0, 71: 30, 72: 0, 73: 10 }), fileName: 'Big Pad.syx', folderPath: 'Pads' });
  assert.equal(c.category, 'pad');
  assert.ok(c.contradictions.some((x) => /percusiva/.test(x.text)));
  assert.equal(c.certainty, 'textual'); // «Una fuente»: degradada por contradicción
  const ok = classify({ payload: presets.padPoly(), fileName: 'warm pad.syx', folderPath: 'Pads' });
  assert.equal(ok.category, 'pad'); assert.equal(ok.certainty, 'corroborated');
  const tech = classify({ payload: presets.padPoly() });
  assert.equal(tech.category, 'pad'); assert.equal(tech.certainty, 'technical');
  const none = classify({ payload: initPayload('Zzz') }); assert.equal(none.certainty, 'none');
});

test('Reglas aprendidas y calibración', () => {
  const rules = [{ id: 'r1', enabled: true, type: 'token', pattern: 'growl', category: 'bass' }];
  const c = classify({ payload: initPayload('Growl Monster'), rules });
  assert.equal(c.category, 'bass'); assert.ok(c.evidence.some((e) => e.source === 'Regla aprendida'));
  const cal = calibration([{ predicted: { category: 'bass', certainty: 'textual' }, action: 'accept' }, { predicted: { category: 'pad', certainty: 'textual' }, action: 'correct', final: 'drone' }]);
  assert.deepEqual(cal.textual, { total: 2, accepted: 1, corrected: 1, rejected: 0 });
});

test('6/7 · Duplicados y variantes de macros', () => {
  const a = initPayload('Name A'), b = initPayload('Name B');
  assert.equal(relation(a, new Uint8Array(a)).level, 'payload');
  assert.equal(relation(a, b).level, 'synth');
  const m = setMacro(new Uint8Array(a), 0, 0, 20); assert.equal(relation(a, m).level, 'macro');
  const pos = new Uint8Array(a); pos[204] = 90; assert.equal(relation(a, pos).level, 'macro-position');
  const pv = new Uint8Array(a); pv[64] = 10; pv[66] = 90; const r = relation(a, pv); assert.equal(r.level, 'param'); assert.equal(r.count, 2);
  const d = diffParams(a, pv); assert.equal(d.length, 2); assert.match(d[0].hint, /cerrado/);
  assert.ok(similarity(a, pv) > similarity(a, presets.acid()));
  assert.notEqual(fingerprints(a).payload, fingerprints(b).payload); assert.equal(fingerprints(a).synth, fingerprints(b).synth);
});

test('Macros: auditoría, compartidos, inactivas, reordenación sin pérdida', () => {
  const pl = initPayload('M');
  setMacro(pl, 0, 0, 20); setMacro(pl, 1, 0, 20); setMacro(pl, 2, 0, 26, 64); setMacro(pl, 3, 0, 75); // 75 fuera de rango
  const a = auditMacros(pl);
  assert.equal(a.knobs[0].activeCount, 1); assert.equal(a.knobs[2].activeCount, 0);
  assert.ok(a.shared.some((s) => s.dest === 20 && s.knobs.length === 2));
  assert.equal(a.integrity.length, 1);
  const sw = swapKnobs(pl, 0, 4); assert.equal(sw[205 + 17 * 4], 20); assert.equal(pl[205 + 17 * 4], 0, 'el original no cambia');
  const src = initPayload('R'); setMacro(src, 0, 0, 21); setMacro(src, 0, 1, 33); setMacro(src, 7, 0, 20);
  const re = reorderToProfile(src, 'techno');
  assert.equal(re.payload[205 + 17 * 4], 20, 'cutoff a M5'); assert.equal(re.payload[205 + 17 * 5], 21, 'resonancia a M6');
  assert.equal(re.payload[209 + 17 * 5], 33, 'la segunda ruta viaja con su macro');
  const routes = (x) => Array.from({ length: 8 }, (_, k) => [...x.slice(204 + 17 * k, 221 + 17 * k)].join()).sort().join('|');
  assert.equal(routes(re.payload), routes(src), 'misma colección de bloques');
  const fill = fillEmptyFromProfile(src, 'techno');
  assert.equal(fill.payload[205], 21, 'macro activa intacta'); assert.equal(fill.filled.length, 4, 'no duplica destinos ya usados');
  assert.equal(Object.keys(PROFILES).length, 24);
  assert.equal(profileFit(re.payload, 'techno')[4].status, 'match');
});

test('ZIP: lectura store/deflate, CRC, rutas peligrosas, límites', async () => {
  const files = [{ path: 'Bass/One.syx', bytes: syx(initPayload('One')) }, { path: 'readme.txt', bytes: enc('hola') }];
  const z = writeZip(files);
  const r = await readZip(z, (p) => /\.syx$/.test(p));
  assert.equal(r.entries.length, 1); assert.equal(r.entries[0].path, 'Bass/One.syx');
  assert.equal(safeZipPath('../evil.syx').ok, false); assert.equal(safeZipPath('C:/x.syx').ok, false); assert.equal(safeZipPath('/abs').ok, false);
  const broken = new Uint8Array(z); broken[60] ^= 0xFF; // daña datos de la primera entrada
  const rb = await readZip(broken, () => true);
  assert.ok(rb.skipped.some((s) => /CRC|Cabecera/.test(s.why)) || rb.errors.length);
  assert.ok((await readZip(enc('not a zip'))).errors.length);
  // Deflate real generado con CompressionStream
  const data = syx(initPayload('Deflated'));
  const cs = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const comp = new Uint8Array(await new Response(cs).arrayBuffer());
  const zz = writeZip([{ path: 'd.syx', bytes: comp }]);
  // Convertir la entrada a método 8 con tamaño/CRC reales
  const v = new DataView(zz.buffer); v.setUint16(8, 8, true); v.setUint32(14, crc32(data), true); v.setUint32(22, data.length, true);
  const cd = zz.length - 22 - (46 + 5); const cv = new DataView(zz.buffer, cd); cv.setUint16(10, 8, true); cv.setUint32(16, crc32(data), true); cv.setUint32(24, data.length, true);
  const rd = await readZip(zz, () => true);
  assert.deepEqual(rd.entries[0].bytes, data);
  // Ratio de compresión sospechoso (bomba)
  cv.setUint32(24, comp.length * 1000, true);
  assert.ok((await readZip(zz, () => true)).skipped.some((s) => /Ratio|Demasiado/.test(s.why)));
});

test('2/3/10/11/12/13/14 · Biblioteca: importación, metadatos, variantes, exportación, copia y restauración', async () => {
  const store = new MemoryStore(); const lib = await new Library(store).load();
  const f1 = syx(initPayload('Acid Line')), f2 = syx(presets.padPoly());
  const z = writeZip([{ path: 'Basses/Acid Line.syx', bytes: f1 }, { path: 'Misc/untitled.syx', bytes: f2 }, { unsafeRawPath: '../evil.syx', bytes: f1 }]);
  const rep = await lib.importInputs([{ name: 'Pack.zip', path: '', bytes: z }, { name: 'Acid Line copy.syx', path: '', bytes: f1 }]);
  assert.equal(rep.patches, 2); assert.equal(rep.duplicatesFile.length, 1); assert.ok(rep.skipped.some((s) => /Ruta rechazada/.test(s.why)));
  const acid = lib.patches.find((p) => p.name === 'Acid Line');
  assert.equal(acid.folderPath, 'Pack/Basses'); assert.equal(acid.bankName, 'Pack');
  // Duplicado de carga en otro archivo con nombre distinto
  const again = new Uint8Array(f1); const rep2 = await lib.importInputs([{ name: 'other.syx', path: 'x', bytes: Uint8Array.from([0, ...again]) }]);
  assert.equal(rep2.duplicatesPatch.length, 1); assert.equal(lib.patches.length, 2);
  // 10 · Aplicar categoría sin tocar SysEx
  const before = b64(acid.payload), fileBefore = b64(lib.fileOf(acid).bytes);
  const propose = lib.info(acid).cls; assert.equal(propose.category, 'bass');
  await lib.acceptClassification([acid.id]);
  assert.equal(acid.meta.category, 'bass'); assert.equal(b64(acid.payload), before); assert.equal(b64(lib.fileOf(acid).bytes), fileBefore);
  const h = lib.history.at(-1); await lib.undo(h.id); assert.equal(acid.meta.category, null);
  // 11 · Edición de macros en copia
  const re = reorderToProfile(setMacro(new Uint8Array(acid.payload), 7, 0, 20), 'techno');
  const v = await lib.createVariant(acid.id, re.payload, 'macro-reorder', 'Reordenado', ' M');
  assert.equal(v.parentId, acid.id); assert.equal(b64(acid.payload), before);
  assert.equal(relation(acid.payload, v.payload).level !== 'payload', true);
  // 12 · Exportar y reimportar sin pérdidas
  const out = lib.exportSyx(v); const back = parseMessage(splitMessages(out).messages[0].bytes);
  assert.deepEqual(back.payload, v.payload);
  // 13/14 · Copia JSON y restauración en una biblioteca vacía
  const json = JSON.parse(JSON.stringify(lib.backupObject()));
  const lib2 = await new Library(new MemoryStore()).load();
  const rr = await lib2.restore(json, 'replace');
  assert.equal(rr.patches, 3); assert.equal(lib2.patches.length, 3);
  assert.deepEqual(lib2.byId(v.id).payload, v.payload); assert.deepEqual(lib2.fileOf(lib2.byId(acid.id)).bytes, lib.fileOf(acid).bytes);
  // CSV con escape de fórmulas
  await lib.updateMeta([acid.id], { notes: '=HYPERLINK("x")' });
  assert.match(lib.csvReport([acid.id]), /"'=HYPERLINK/);
});

test('15 · Persistencia simulada: recargar desde el mismo almacén', async () => {
  const store = new MemoryStore(); const lib = await new Library(store).load();
  await lib.importInputs([{ name: 'a.syx', path: '', bytes: syx(initPayload('Keys One')) }]);
  await lib.updateMeta([lib.patches[0].id], { fav: true, rating: 4 });
  const again = await new Library(store).load();
  assert.equal(again.patches.length, 1); assert.equal(again.patches[0].meta.rating, 4); assert.ok(again.patches[0].payload instanceof Uint8Array);
});

test('Migración desde copia v5', async () => {
  const pl = initPayload('Old Bass');
  const v5 = { format: 'ct-patch-library-v1', version: 2, patches: [{ id: 'a', name: 'Old Bass', category: 'Sub Bass', character: 'Dark', raw: b64(pl), fav: true, rating: 5, listened: true, fileName: 'old.syx' }, { id: 'bad', raw: 'xx' }], packs: [{ name: 'P', slots: ['a'] }] };
  const lib = await new Library(new MemoryStore()).load();
  const rep = await lib.restore(v5);
  assert.ok(rep.migrated); assert.equal(rep.patches, 1); assert.equal(rep.skipped, 1);
  const p = lib.patches[0]; assert.equal(p.meta.category, 'bass'); assert.equal(p.meta.subtype, 'sub'); assert.equal(p.meta.review, 'listened');
  assert.ok(lib.fileOf(p).reconstructed);
  assert.equal(lib.banks.find((b) => /v5/.test(b.name)).slots[0], p.id);
});

test('16 · Colección grande (3000 patches sintéticos)', async () => {
  const lib = await new Library(new MemoryStore()).load();
  const names = ['Bass', 'Lead', 'Pad', 'Pluck', 'Arp', 'FX', 'Stab', 'Drone'];
  const inputs = Array.from({ length: 3000 }, (_, i) => { const p = initPayload(names[i % 8] + ' ' + i, { 64: i % 128, 66: (i * 7) % 128, 70: (i * 3) % 128 }); return { name: `p${i}.syx`, path: names[i % 8], bytes: syx(p) }; });
  const t0 = performance.now(); const rep = await lib.importInputs(inputs); const t1 = performance.now();
  assert.equal(rep.patches, 3000);
  const t2 = performance.now(); const pads = lib.patches.filter((p) => lib.matches(p, { category: 'pad', includeProposals: true })); const t3 = performance.now();
  assert.equal(pads.length, 375);
  const dups = lib.duplicates();
  console.log(`    importación 3000: ${(t1 - t0).toFixed(0)} ms · filtrado+clasificación: ${(t3 - t2).toFixed(0)} ms · grupos núcleo idéntico: ${dups.synth.length}`);
  assert.ok(t3 - t2 < 15000);
});
