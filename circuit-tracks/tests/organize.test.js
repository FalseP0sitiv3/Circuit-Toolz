// Pruebas de anatomía, organización y plantillas (fixtures SINTÉTICOS).
import test from 'node:test';
import assert from 'node:assert/strict';
import { anatomy, macroTargetBlock } from '../src/core/anatomy.js';
import { architecture, architectureGroups, register, registerReport, transposeOctaves, diskPlan, planManifest } from '../src/core/organize.js';
import { extractTemplate, applyTemplate, profileTemplates, templateSummary } from '../src/core/templates.js';
import { Library, MemoryStore } from '../src/core/library.js';
import { fingerprints } from '../src/core/compare.js';
import { initPayload, syx, setMacro } from './fixtures.js';

test('Anatomía: bloques activos, rutas y receta', () => {
  const p = initPayload('Acid', { 32: 0, 33: 20, 55: 90, 51: 52, 66: 100, 68: 110, 100: 50 });
  p.set([6, 0, 100, 12], 124); setMacro(p, 4, 0, 20);
  const a = anatomy(p);
  assert.ok(a.blocks.osc2.on && a.blocks.dist.on && !a.blocks.noise.on && a.blocks.lfo1.on);
  assert.ok(a.routes.some((r) => r.via === 'matrix' && r.from === 'lfo1' && r.to === 'filter'));
  assert.ok(a.routes.some((r) => r.via === 'macro' && r.from === 'm5' && r.to === 'filter'));
  assert.ok(a.routes.some((r) => r.via === 'fixed' && r.from === 'env2'));
  const txt = a.recipe.map((x) => x.t).join(' ');
  assert.match(txt, /Monofónico, portamento 20/); assert.match(txt, /−1 oct|-1 oct/); assert.match(txt, /lo abre \+46/); assert.match(txt, /LFO 1 \+ \(sine/i);
  assert.equal(macroTargetBlock(20), 'filter'); assert.equal(macroTargetBlock(25), 'env1'); assert.equal(macroTargetBlock(55), 'matrix');
});

test('Arquitectura: mismo synth con otros ajustes', () => {
  const a = initPayload('A', { 64: 30, 70: 0 }), b = initPayload('B', { 64: 90, 70: 40, 66: 50 }), c = initPayload('C', { 63: 4 }), dup = initPayload('D', { 64: 30, 70: 0 });
  assert.equal(architecture(a).key, architecture(b).key); assert.notEqual(architecture(a).key, architecture(c).key);
  const mk = (id, pl) => ({ id, payload: pl, fp: fingerprints(pl) });
  const g = architectureGroups([mk('a', a), mk('b', b), mk('c', c), mk('d', dup)]);
  assert.equal(g.length, 1); assert.deepEqual(g[0].ids.sort(), ['a', 'b', 'd']); assert.equal(g[0].distinct, 2);
  assert.ok(g[0].varying.some((v) => v.off === 64 && v.min === 30 && v.max === 90));
  // Dos copias idénticas no forman «grupo de ajustes»
  assert.equal(architectureGroups([mk('a', a), mk('d', dup)]).length, 0);
});

test('Registro: detecta bajos fuera de la octava habitual y transpone', () => {
  const mk = (id, set) => ({ id, payload: initPayload(id, set), fp: null });
  const list = [mk('b1', { 35: 63 }), mk('b2', { 35: 63 }), mk('b3', { 42: 52 }), mk('b4', { 35: 64 }), mk('p1', { 35: 66 })];
  const rep = registerReport(list, (p) => (p.id.startsWith('b') ? 'bass' : 'pad'), 'bass');
  assert.equal(rep.mode, -12); assert.equal(rep.items.length, 4);
  assert.deepEqual(rep.off.map((x) => x.id), ['b4']); assert.equal(rep.off[0].octDelta, -1);
  assert.equal(register(list[2].payload).effective, -12);
  const t = transposeOctaves(list[3].payload, -1, 'osc');
  assert.equal(register(t.payload).effective, -12); assert.equal(t.payload[42], 52); assert.equal(t.payload[51], 52);
  const k = transposeOctaves(list[3].payload, -1, 'keyboard'); assert.equal(k.payload[35], 63);
  assert.ok(transposeOctaves(initPayload('x', { 35: 58 }), -1, 'keyboard').problems.length);
});

test('Plantillas: extraer, aplicar sin pisar posiciones, solo vacías y avisos', () => {
  const src = initPayload('src'); setMacro(src, 0, 0, 20); setMacro(src, 1, 0, 52); src[204] = 99;
  const tpl = extractTemplate(src, 'Mi plantilla');
  assert.equal(tpl.knobs.length, 8); assert.equal(templateSummary(tpl)[0].label, 'Filtro frecuencia');
  const dst = initPayload('dst'); setMacro(dst, 1, 0, 26); dst[204] = 10;
  const r = applyTemplate(dst, tpl);
  assert.equal(r.payload[205], 20); assert.equal(r.payload[204], 10, 'conserva la posición'); assert.equal(r.payload[205 + 17], 52);
  assert.ok(r.warnings.some((w) => /matriz 3/.test(w)), r.warnings.join());
  const e = applyTemplate(dst, tpl, { mode: 'empty' });
  assert.equal(e.payload[205 + 17], 26, 'M2 tenía efecto: no se toca'); assert.equal(e.payload[205], 20);
  assert.equal(profileTemplates().length, 24);
});

test('Plan de disco: carpetas por categoría, duplicados aparte, sin colisiones', async () => {
  const lib = await new Library(new MemoryStore()).load();
  const a = initPayload('Moloch Bass', { 35: 62 }), b = new Uint8Array(a); b.set([77, 77], 0);
  await lib.importInputs([['Moloch Bass', a], ['MMoloch copy', b], ['Glass Pad', initPayload('Glass Pad', { 32: 2, 70: 80, 73: 100 })], ['Glass Pad 2', initPayload('Glass Pad', { 32: 2, 70: 80, 73: 100, 64: 90 })]].map(([n, p]) => ({ name: n + '.syx', path: 'Descargas/Varios', bytes: syx(p) })));
  const plan = diskPlan(lib, lib.patches);
  const w = plan.entries.filter((e) => e.action === 'write');
  assert.ok(w.some((e) => e.dir[0] === '_Duplicados'));
  assert.ok(w.some((e) => e.dir[0] === 'Bass'));
  const paths = w.map((e) => [...e.dir, e.file].join('/'));
  assert.equal(new Set(paths.map((x) => x.toLowerCase())).size, paths.length);
  const skip = diskPlan(lib, lib.patches, { duplicates: 'skip', layout: 'architecture' });
  assert.equal(skip.skipped, 1); assert.match(planManifest(skip, lib), /skip/);
  const head = planManifest(skip, lib).replace(/^\uFEFF/, '').split('\r\n')[0];
  assert.equal(head, '"accion";"origen";"destino";"categoria";"subcarpeta";"nombre";"etiquetas";"valoracion";"favorito";"motivo"', 'el manifiesto lleva subcarpeta, etiquetas, valoración y favorito');
});

import { CircuitSession } from '../src/core/midi.js';
import { buildReplaceCurrent } from '../src/core/sysex.js';
test('Revisión: deshacer ediciones de variantes (agrupadas) y lectura que restaura y aborta', async () => {
  const lib = await new Library(new MemoryStore()).load();
  await lib.importInputs([{ name: 'a.syx', path: '', bytes: syx(initPayload('Orig')) }]);
  const v = await lib.createVariant(lib.patches[0].id, lib.patches[0].payload, 'copy', 'copia');
  await lib.editVariantBytes(v.id, [[64, 10]]); await lib.editVariantBytes(v.id, [[64, 20], [66, 99]]);
  const edits = lib.history.filter((h) => h.op === 'edit'); assert.equal(edits.length, 1, 'cambios seguidos agrupados');
  await lib.undo(edits[0].id); assert.equal(lib.byId(v.id).payload[64], 127); assert.equal(lib.byId(v.id).payload[66], 0);
  // Lectura: guarda y restaura el patch activo
  const sent = []; let listener; const ram = [initPayload('ActivoAntes'), initPayload('x')];
  const input = { addEventListener: (_, f) => { listener = f; } };
  const out = { send(d) { const a = Array.from(d); sent.push(a); if (a[0] === 0xF0 && a[6] === 0x40) setTimeout(() => listener({ data: buildReplaceCurrent(ram[0], 0) }), 1); if ((a[0] & 0xF0) === 0xC0) ram[0] = initPayload('Stored ' + a[1]); }, clear() {} };
  const s = new CircuitSession(out, input);
  const r = await s.readStored([0, 1], 0);
  assert.ok(r.restored); const last = sent.at(-1); assert.equal(last[6], 0); assert.equal(String.fromCharCode(...last.slice(9, 20)), 'ActivoAntes');
  const mute = new CircuitSession({ send() {}, clear() {} }, { addEventListener() {} });
  mute.requestCurrent = () => Promise.reject(new Error('x'));
  const r2 = await mute.readStored([0, 1, 2, 3, 4, 5], 0); assert.ok(r2.aborted); assert.ok(r2.length <= 4);
});

test('Clasificación: una octava abajo no basta para «Bass»; el uso declarado manda', async () => {
  const { classify } = await import('../src/core/classify.js');
  const oneDown = initPayload('Dinky', { 35: 63 });
  const c1 = classify({ payload: oneDown, fileName: 'Dinky.syx', folderPath: 'Nueva carpeta' });
  assert.equal(c1.category, null); assert.equal(c1.hint?.cat, 'bass');
  const arp = classify({ payload: initPayload('12.5% ARP P', { 35: 63 }), fileName: '12.5% ARP P.syx', folderPath: 'ARP' });
  assert.equal(arp.category, 'arp');
  const deep = classify({ payload: initPayload('Gaston', { 35: 62 }), fileName: 'Gaston.syx', folderPath: '' });
  assert.equal(deep.category, 'bass'); assert.equal(deep.certainty, 'technical');
  const reece = classify({ payload: initPayload('Darkside Reece'), fileName: 'Darkside Reece.syx', folderPath: '' });
  assert.equal(reece.category, 'bass'); assert.equal(reece.subtype, 'reese');
});

test('Modelo de cambios: borrador, aceptada, sustituido y plan de disco', async () => {
  const { Library, MemoryStore } = await import('../src/core/library.js');
  const { diskPlan } = await import('../src/core/organize.js');
  const lib = new Library(new MemoryStore()); await lib.load();
  await lib.importInputs([{ name: 'Bass A.syx', path: 'Bajos', bytes: syx(initPayload('Bass A', { 35: 62 })) }]);
  const o = lib.patches[0];
  const pl = new Uint8Array(o.payload); pl[42] = 76;
  const v1 = await lib.createVariant(o.id, pl, 'register', 'Altura +12', '');
  assert.equal(lib.changeState(v1), 'draft'); assert.equal(lib.changeState(o), 'original');
  let plan = diskPlan(lib, lib.patches);
  assert.deepEqual(plan.entries.filter((e) => e.action === 'write').map((e) => e.id), [o.id], 'el borrador no se exporta');
  await lib.adoptVariants([v1.id], true);
  assert.equal(lib.changeState(o), 'superseded'); assert.equal(lib.changeState(v1), 'adopted');
  plan = diskPlan(lib, lib.patches);
  const w = plan.entries.filter((e) => e.action === 'write');
  assert.equal(w.length, 1); assert.equal(w[0].id, v1.id); assert.equal(w[0].file, 'Bass - Bass A.syx'); assert.equal(w[0].replaces, o.id);
  // corrección sobre la versión aceptada: la cadena sigue
  const v2 = await lib.createVariant(v1.id, v1.payload, 'edit', 'Macros', ''); await lib.adoptVariants([v2.id], true);
  assert.equal(lib.changeState(v1), 'superseded'); assert.equal(lib.currentVersion(o).id, v2.id);
  assert.deepEqual(diskPlan(lib, lib.patches).entries.filter((e) => e.action === 'write').map((e) => e.id), [v2.id]);
  // un pack con el original exporta la versión vigente
  const { readZip } = await import('../src/core/zip.js');
  const bank = await lib.createBank('P'); bank.slots[0] = o.id;
  const ents = (await readZip(lib.bankExport(bank))).entries; const sx = ents.find((e) => (e.path || e.name).endsWith('.syx'));
  assert.deepEqual([...sx.bytes], [...lib.exportSyx(v2)], 'el pack lleva la versión aceptada, no el original');
  // solo una aceptada por original
  const v3 = await lib.createVariant(o.id, o.payload, 'edit', 'Otra', ''); await lib.adoptVariants([v3.id], true);
  assert.equal(lib.byId(v1.id).meta.adopted, false); assert.equal(lib.changeState(v1), 'draft'); assert.equal(lib.changeState(v2), 'draft', 'rama abandonada'); assert.equal(lib.currentVersion(o).id, v3.id);
  assert.deepEqual(diskPlan(lib, lib.patches).entries.filter((e) => e.action === 'write').map((e) => e.id), [v3.id]);
});

test('Biblioteca nueva: borra patches y conserva lo elegido', async () => {
  const { Library, MemoryStore } = await import('../src/core/library.js');
  const lib = new Library(new MemoryStore()); await lib.load();
  await lib.importInputs([{ name: 'Bass A.syx', path: 'Bajos', bytes: syx(initPayload('Bass A')) }, { name: 'Pad B.syx', path: 'Pads', bytes: syx(initPayload('Pad B')) }]);
  await lib.createVariant(lib.patches[0].id, lib.patches[0].payload, 'edit', 'x', '');
  await lib.setSetting('templates', [{ id: 't1' }]); await lib.setSetting('patterns', [{ id: 'p1' }]);
  await lib.saveCollection({ name: 'Mis bajos', kind: 'manual', ids: [lib.patches[0].id] }); await lib.saveCollection({ name: 'Filtro', kind: 'smart', query: { category: 'bass' } });
  const before = await lib.resetLibrary({ templates: true, patterns: false, rules: true, device: true });
  assert.equal(before.patches, 3);
  assert.equal(lib.patches.length, 0); assert.equal(lib.files.length, 0); assert.equal(lib.history.length, 0);
  assert.deepEqual(lib.collections.map((c) => c.name), ['Filtro']);
  assert.deepEqual(lib.settings.templates, [{ id: 't1' }]); assert.equal(lib.settings.patterns, undefined);
  // persiste: al recargar desde el mismo almacén sigue vacía
  const lib2 = new Library(lib.store); await lib2.load();
  assert.equal(lib2.patches.length, 0); assert.deepEqual(lib2.settings.templates, [{ id: 't1' }]);
  // y se puede volver a importar
  await lib2.importInputs([{ name: 'Bass A.syx', path: 'Bajos', bytes: syx(initPayload('Bass A')) }]);
  assert.equal(lib2.patches.length, 1);
});
