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
  // v3.10: una propuesta sobre la versión aceptada se SUMA a esa versión (nada de cadenas)
  const pl2 = new Uint8Array(v1.payload); pl2[204] = 99;
  const v2 = await lib.createVariant(v1.id, pl2, 'edit', 'Macros', ''); await lib.adoptVariants([v2.id], true);
  assert.equal(lib.byId(v2.id), undefined, 'la propuesta aplicada desaparece'); assert.equal(lib.currentVersion(o).id, v1.id);
  assert.equal(lib.byId(v1.id).payload[204], 99); assert.equal(lib.byId(v1.id).payload[42], 76, 'conserva lo anterior');
  assert.deepEqual(diskPlan(lib, lib.patches).entries.filter((e) => e.action === 'write').map((e) => e.id), [v1.id]);
  // un pack con el original exporta la versión vigente
  const { readZip } = await import('../src/core/zip.js');
  const bank = await lib.createBank('P'); bank.slots[0] = o.id;
  const ents = (await readZip(lib.bankExport(bank))).entries; const sx = ents.find((e) => (e.path || e.name).endsWith('.syx'));
  assert.deepEqual([...sx.bytes], [...lib.exportSyx(lib.byId(v1.id))], 'el pack lleva la versión aceptada, no el original');
  // una propuesta hecha desde el original también se suma a la versión: sus cambios, no su carga entera
  const pl3 = new Uint8Array(o.payload); pl3[60] = 5;
  const v3 = await lib.createVariant(o.id, pl3, 'edit', 'Otra', ''); await lib.adoptVariants([v3.id], true);
  const cur = lib.byId(v1.id);
  assert.equal(lib.currentVersion(o).id, v1.id); assert.equal(cur.payload[60], 5); assert.equal(cur.payload[42], 76); assert.equal(cur.payload[204], 99);
  assert.equal(lib.patches.length, 2, 'original + una versión');
  assert.deepEqual(diskPlan(lib, lib.patches).entries.filter((e) => e.action === 'write').map((e) => e.id), [v1.id]);
});

test('v3.10 · Un sonido, una versión: editar suma, metadatos del sonido, volver, duplicar y ordenar lo antiguo', async () => {
  const { Library, MemoryStore } = await import('../src/core/library.js');
  const lib = new Library(new MemoryStore()); await lib.load();
  await lib.importInputs([{ name: 'Bass A.syx', path: '', bytes: syx(initPayload('Bass A')) }, { name: 'Pad B.syx', path: '', bytes: syx(initPayload('Pad B')) }]);
  const o = lib.patches.find((p) => p.name === 'Bass A'), pad = lib.patches.find((p) => p.name === 'Pad B');
  // editar: la primera edición crea la versión (ya aceptada), las siguientes se suman en ella
  const a = new Uint8Array(o.payload); a[42] = 52;
  const v = await lib.editSound(o, a, 'register', 'Octava −1');
  assert.equal(lib.changeState(v), 'adopted'); assert.equal(lib.currentVersion(o).id, v.id);
  const b2 = new Uint8Array(v.payload); b2[204] = 40;
  const v2 = await lib.editSound(o, b2, 'edit', 'Macro 1');
  assert.equal(v2.id, v.id, 'misma versión'); assert.equal(lib.patches.length, 3);
  assert.deepEqual(lib.byId(v.id).ops, ['Octava −1', 'Macro 1']);
  // en las listas, un sonido = una fila (su versión vigente)
  assert.deepEqual(lib.faces().map((p) => p.id).sort(), [v.id, pad.id].sort());
  // los metadatos son del sonido: se escriben en el original y en su versión
  await lib.setCategory([v.id], 'bass', 'sub');
  assert.equal(lib.byId(o.id).meta.category, 'bass'); assert.equal(lib.byId(o.id).meta.subtype, 'sub');
  await lib.addTags([o.id], ['Dark']); assert.deepEqual(lib.byId(v.id).meta.tags, ['Dark']);
  assert.equal(lib.byId(v.id).meta.adopted, true, 'la marca de versión es solo de la versión');
  // una propuesta en borrador no ocupa fila y se ve en el sonido
  const pr = await lib.createVariant(v.id, new Uint8Array(v.payload).map((x, i) => (i === 66 ? 33 : x)), 'macro-reorder', 'Macros reordenadas');
  assert.equal(lib.faces().length, 2); assert.deepEqual(lib.proposalsOf(o).map((x) => x.id), [pr.id]);
  // volver a la octava original con otra edición que deja todo como el original: la versión sobra y se quita
  const c = lib.byId(v.id), back = new Uint8Array(o.payload);
  const r = await lib.editSound(c, back, 'register', 'Octava +1');
  assert.equal(r.id, o.id); assert.equal(lib.currentVersion(o).id, o.id);
  assert.equal(lib.byId(pr.id).parentId, o.id, 'la propuesta sigue en el sonido'); assert.deepEqual(lib.proposalDiff(lib.byId(pr.id)), [[66, 33]], 'con los cambios que proponía');
  // aceptar la propuesta cuando no hay versión: pasa a ser la versión
  await lib.adoptVariants([pr.id], true); assert.equal(lib.currentVersion(o).id, pr.id);
  // volver al original: a la papelera, Ctrl Z la devuelve; un pack con la versión pasa a apuntar al sonido
  const bk = await lib.createBank('P'); bk.slots[5] = pr.id; await lib.saveBank(bk);
  await lib.revertToOriginal(o); assert.equal(lib.currentVersion(o).id, o.id);
  assert.equal(lib.banks.find((x) => x.id === bk.id).slots[5], o.id, 'el hueco del pack sigue con el sonido');
  await lib.undo(lib.lastUndoable().id); assert.equal(lib.currentVersion(o).id, pr.id);
  // duplicar: otro sonido, independiente, con su propio nombre y sus propias etiquetas
  const d = await lib.duplicateSound(o);
  assert.equal(d.parentId, null); assert.equal(d.name, 'Bass A 2'); assert.equal(lib.faces().length, 3);
  await lib.addTags([d.id], ['Copia']); assert.ok(!lib.byId(o.id).meta.tags.includes('Copia'));
  assert.equal(lib.changeState(d), 'original');
});

test('v3.10 · Ordenar versiones antiguas: cadenas, ramas y borradores repetidos', async () => {
  const { Library, MemoryStore } = await import('../src/core/library.js');
  const lib = new Library(new MemoryStore()); await lib.load();
  await lib.importInputs([{ name: 'Old.syx', path: '', bytes: syx(initPayload('Old')) }]);
  const o = lib.patches[0], put = (p, i, x) => { const q = new Uint8Array(p.payload); q[i] = x; return q; };
  // lo que dejaba el modelo anterior: cadena aceptada o → v1 → v2, una rama abandonada, un borrador igual al original
  const v1 = await lib.createVariant(o.id, put(o, 42, 52), 'register', 'Octava −1'); v1.meta.adopted = true;
  const v2 = await lib.createVariant(v1.id, put(v1, 204, 50), 'edit', 'Macros'); v2.meta.adopted = true;
  const br = await lib.createVariant(o.id, put(o, 60, 9), 'template', 'Plantilla');
  const same = await lib.createVariant(o.id, o.payload, 'copy', 'Copia editable');
  v2.meta.tags = ['Dark']; v2.meta.rating = 4; lib.emit();
  const bank = await lib.createBank('P'); bank.slots[3] = v1.id; await lib.saveBank(bank);
  assert.equal(lib.currentVersion(o).id, v2.id);
  const plan = lib.versionsPlan();
  assert.equal(plan.sounds.length, 1); assert.deepEqual(plan.drop.sort(), [v1.id, same.id].sort()); assert.deepEqual(plan.keep, [br.id]);
  const before = lib.exportSyx(lib.currentVersion(o));
  const res = await lib.tidyVersions(plan);
  assert.equal(res.dropped, 2);
  const cv = lib.currentVersion(o);
  assert.equal(cv.id, v2.id); assert.equal(cv.parentId, o.id, 'cuelga del original'); assert.deepEqual([...lib.exportSyx(cv)], [...before], 'suena igual que antes');
  assert.match(cv.originText, /Octava −1/); assert.match(cv.originText, /Macros/);
  assert.deepEqual(lib.byId(o.id).meta.tags, ['Dark'], 'metadatos unificados'); assert.equal(lib.byId(o.id).meta.rating, 4);
  assert.equal(lib.byId(br.id).parentId, o.id); assert.equal(lib.changeState(lib.byId(br.id)), 'draft', 'la rama queda como propuesta');
  assert.equal(lib.banks.find((b) => b.id === bank.id).slots[3], o.id, 'el pack apunta al sonido');
  assert.equal(lib.versionsPlan().sounds.length, 0, 'ya está en orden');
  // aceptar la rama: sus cambios se suman a la versión
  await lib.adoptVariants([br.id], true); assert.equal(lib.currentVersion(o).payload[60], 9); assert.equal(lib.currentVersion(o).payload[204], 50);
  // deshacer el orden lo devuelve todo
  const h = lib.history.find((x) => x.op === 'versions'); await lib.undo(h.id);
  assert.ok(lib.byId(v1.id) && lib.byId(same.id)); assert.equal(lib.banks.find((b) => b.id === bank.id).slots[3], v1.id);
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

test('v3.11 · Dónde suena cada sonido, lo habitual de su grupo y dónde se toca la frase', async () => {
  const { soundOffset, offsetNorms, normFor, placePhrase, planScope } = await import('../src/core/organize.js');
  // parámetros: octava de teclado × 12 + semitonos del oscilador que manda
  assert.equal(soundOffset({ payload: initPayload('A') }).semis, 0);
  assert.equal(soundOffset({ payload: initPayload('B', { 35: 63 }) }).semis, -12);
  assert.equal(soundOffset({ payload: initPayload('B', { 35: 63 }) }, undefined, { ignoreKbd: true }).semis, 0, 'si la octava de teclado no cuenta');
  // medición: manda si es de ese sonido (110 Hz tocando Do2 = MIDI 48 → La1 = 45 → −3 st)
  const pl = initPayload('M'), rec = { payload: pl, fp: fingerprints(pl), acoustic: { desc: { f0: 110, pitchClarity: 0.9 }, protocol: { note: 48, fp: fingerprints(pl).synth } } };
  assert.deepEqual([soundOffset(rec).semis, soundOffset(rec).source], [-3, 'medido']);
  const other = initPayload('M', { 42: 52 }); // otro sonido con la medición del primero
  assert.equal(soundOffset({ ...rec, payload: other, fp: fingerprints(other) }).source, 'parámetros', 'medición de otro sonido: no cuenta');
  assert.equal(soundOffset(rec, other).source, 'parámetros', 'otra carga (una propuesta, el B de un A/B): por parámetros');
  // lo habitual: moda por categoría y subcarpeta; el objetivo de «Octava y tono» manda
  const it = [...Array(5)].map(() => ({ cat: 'bass', sub: 'sub', semis: -12 })).concat([{ cat: 'bass', sub: 'acid', semis: 0 }, { cat: 'bass', sub: 'acid', semis: 0 }, { cat: 'lead', semis: 0 }]);
  const nm = offsetNorms(it);
  assert.deepEqual([normFor(nm, 'bass', 'sub').norm, normFor(nm, 'bass', 'sub').source], [-12, 'coleccion']);
  assert.equal(normFor(nm, 'bass', 'acid').norm, -12, 'con pocos en la subcarpeta, lo de la categoría');
  assert.equal(normFor(nm, 'lead').source, 'pocos', 'con menos de 3, sin referencia');
  assert.deepEqual(normFor(offsetNorms(it, { targets: { bass: { target: '-24' } } }), 'bass', 'sub'), { norm: -24, n: 7, source: 'objetivo', key: 'bass' });
  assert.equal(normFor(offsetNorms(it, { targets: { bass: { target: 'skip' } } }), 'bass', 'sub').source, 'coleccion', '«No corregir» no es un objetivo');
  // colocar la frase: solo octavas enteras
  assert.deepEqual(placePhrase(36, -24, -12, 'fit'), { played: 48, comp: 12, dev: -1, mode: 'fit' });
  assert.deepEqual(placePhrase(36, -24, -12, 'circuit'), { played: 36, comp: 0, dev: -1, mode: 'circuit' });
  assert.equal(placePhrase(36, -7, 0).dev, -1, '7 semitonos o más ya es otra octava');
  assert.equal(placePhrase(36, -5, 0).dev, 0, 'una cuarta no lo es');
  assert.equal(placePhrase(36, 24, 0).comp, -24);
  assert.equal(placePhrase(36, 12, null).dev, 0, 'sin referencia no se mueve');
  // ordenar en disco: también la selección
  const lib = new Library(new MemoryStore()); await lib.load();
  await lib.importInputs(['A', 'B', 'C'].map((n) => ({ name: n + '.syx', path: '', bytes: syx(initPayload(n, { 64: n.charCodeAt(0) })) })));
  assert.equal(planScope(lib, [], 'sel', [lib.patches[1]]).length, 1);
  assert.equal(planScope(lib, [], 'sel', []).length, 3, 'sin selección, toda la biblioteca');
});

test('v3.11 · Una medición vale para el sonido medido, no para su versión editada', async () => {
  const { soundOffset } = await import('../src/core/organize.js');
  const lib = new Library(new MemoryStore()); await lib.load();
  await lib.importInputs([{ name: 'Bass.syx', path: '', bytes: syx(initPayload('Bass')) }]);
  const o = lib.patches[0];
  await lib.setAcoustic(o.id, { f0: 65.41, pitchClarity: 0.95 }, { note: 48 }); // medición de antes (sin huella): Do1 tocando Do2
  assert.deepEqual([soundOffset(lib.byId(o.id)).semis, soundOffset(lib.byId(o.id)).source], [-12, 'medido']);
  const pl = new Uint8Array(o.payload); pl[42] = 76; // +12 en el oscilador
  const v = await lib.editSound(o, pl, 'register', 'Octava +1');
  assert.equal(soundOffset(v).source, 'parámetros', 'la versión hereda la medición, pero es de otro sonido');
  assert.equal(lib.byId(v.id).acoustic.protocol.fp, o.fp.synth, 'queda marcada con el sonido medido');
  await lib.renameVariant(v.id, 'Bass Up');
  const pl2 = new Uint8Array(lib.byId(v.id).payload); pl2[43] = 70;
  await lib.editVariantBytes(v.id, [[43, 70]]);
  assert.equal(soundOffset(lib.byId(v.id)).source, 'parámetros');
  await lib.setAcoustic(v.id, { f0: 130.81, pitchClarity: 0.95 }, { note: 48, fp: lib.byId(v.id).fp.synth });
  assert.equal(soundOffset(lib.byId(v.id)).semis, 0, 'medida de nuevo: vale');
  await lib.renameVariant(v.id, 'Bass Up 2');
  assert.equal(soundOffset(lib.byId(v.id)).source, 'medido', 'renombrar no cambia el sonido');
});
