// v2.8 · Carpetas y subcarpetas: taxonomía editable, subcarpeta propuesta por ajustes y orden en disco.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, taxonomy, subLabelOf, paramSubtypes, paramDescriptors, SUBTYPES } from '../src/core/classify.js';
import { analyze } from '../src/core/patch.js';
import { diskPlan } from '../src/core/organize.js';
import { Library, MemoryStore } from '../src/core/library.js';
import { initPayload, syx } from './fixtures.js';

const sub = (name, set, folder = '') => classify({ payload: initPayload(name, set), fileName: name + '.syx', folderPath: folder });
// Ajustes de referencia (offsets oficiales). Seno, grave, filtro cerrado: un sub de manual.
const SUB = { 32: 0, 35: 62, 36: 0, 64: 30, 70: 0, 72: 110, 73: 30 };
const ROLL = { 32: 0, 35: 62, 36: 2, 64: 40, 66: 30, 68: 100, 70: 0, 71: 30, 72: 0, 73: 10 };
const GROOVY = { 32: 0, 35: 63, 36: 2, 64: 70, 66: 30, 68: 100, 70: 0, 71: 30, 72: 0, 73: 10, 33: 30 };
const REESE = { 32: 0, 35: 62, 36: 2, 45: 2, 55: 127, 43: 58, 52: 70, 70: 0, 72: 120, 73: 30 };
const DRONE = { 32: 0, 35: 62, 36: 2, 70: 70, 72: 120, 73: 100, 64: 60 };

test('Taxonomía: subcarpetas de la herramienta y del usuario, con etiquetas estables', () => {
  const t = taxonomy();
  assert.ok(t.bass.length >= 10 && t.bass[0].id === 'sub' && t.bass.some((x) => x.label === 'Groovy') && t.bass.some((x) => x.label === 'Drones'));
  assert.equal(subLabelOf(t, 'bass', 'sub'), 'Subs');
  const u = taxonomy({ bass: [{ id: 'sub', label: 'Sub graves' }, { id: 'u-techno', label: 'Techno' }] });
  assert.deepEqual(u.bass.map((x) => x.label), ['Sub graves', 'Techno']);
  assert.equal(subLabelOf(u, 'bass', 'acid'), SUBTYPES.bass.acid, 'una subcarpeta quitada sigue teniendo nombre para fichas antiguas');
});

test('Subcarpeta deducida de los ajustes cuando el nombre no dice nada', () => {
  const cases = [['Bass 1', SUB, 'sub'], ['Bass 2', ROLL, 'rolling'], ['Bass 3', GROOVY, 'groovy'], ['Bass 4', REESE, 'reese'], ['Bass 5', DRONE, 'drone']];
  for (const [name, set, want] of cases) {
    const c = sub(name, set);
    assert.equal(c.category, 'bass', name);
    assert.equal(c.subtype, want, `${name}: ${c.subtype} (${JSON.stringify(c.subBasis)})`);
    assert.equal(c.subBasis.from, 'params');
    assert.ok(c.subBasis.why.length > 0);
  }
});

test('El nombre manda sobre los ajustes en la subcarpeta', () => {
  const c = sub('Groovy Bass', SUB);
  assert.equal(c.subtype, 'groovy'); assert.equal(c.subBasis.from, 'text');
  assert.equal(sub('Hoover', { 32: 2, 40: 60, 100: 60 }).subtype, 'rave');
  assert.equal(sub('Acid Lead', {}).subtype, 'acid');
});

test('Carácter por ajustes: separado del declarado en el nombre', () => {
  const c = sub('Bass 9', { ...SUB, 100: 80 });
  const d = c.descriptors.find((x) => x.label === 'Distorted');
  assert.ok(d && !d.declared && d.source === 'Ajustes');
  assert.ok(sub('Dark Bass', SUB).descriptors.find((x) => x.label === 'Dark').declared);
  assert.ok(paramDescriptors(analyze(initPayload('x', { 64: 20 }))).some((x) => x.label === 'Dark'));
  assert.deepEqual(paramSubtypes('other', analyze(initPayload('x'))), []);
});

test('Biblioteca: crear, renombrar, ordenar y quitar subcarpetas; etiquetas en bloque; disco con tus nombres', async () => {
  const lib = await new Library(new MemoryStore()).load();
  await lib.importInputs([['Bass 1', SUB], ['Bass 2', ROLL], ['Pad X', { 32: 2, 70: 80, 73: 100, 64: 20 }]].map(([n, set]) => ({ name: n + '.syx', path: 'Lib', bytes: syx(initPayload(n, set)) })));
  const [a, b] = lib.patches;
  const id = await lib.addSubfolder('bass', 'Groovys');
  assert.ok(id.startsWith('u-') && lib.tax.bass.at(-1).label === 'Groovys');
  assert.equal(await lib.addSubfolder('bass', 'groovys'), id, 'sin duplicados por mayúsculas');
  await lib.setSubfolder([a.id], 'bass', id);
  assert.equal(a.meta.category, 'bass'); assert.equal(a.meta.subtype, id);
  await lib.renameSubfolder('bass', id, 'Groovy techno');
  await lib.moveSubfolder('bass', id, -1);
  assert.equal(lib.tax.bass.at(-2).id, id);
  let plan = diskPlan(lib, lib.patches);
  assert.deepEqual(plan.entries.find((e) => e.id === a.id).dir, ['Bass', 'Groovy techno']);
  assert.deepEqual(plan.entries.find((e) => e.id === b.id).dir, ['Bass', 'Rolling'], 'la propuesta también ordena');
  await lib.addTags([a.id, b.id], ['Techno', 'Live']);
  await lib.addTags([b.id], ['Live'], true);
  assert.deepEqual(a.meta.tags, ['Techno', 'Live']); assert.deepEqual(b.meta.tags, ['Techno']);
  assert.deepEqual(lib.allTags()[0], ['Techno', 2]);
  assert.equal(await lib.removeSubfolder('bass', id), 1);
  assert.equal(a.meta.subtype, null); assert.ok(!lib.tax.bass.some((x) => x.id === id));
  plan = diskPlan(lib, lib.patches);
  assert.deepEqual(plan.entries.find((e) => e.id === a.id).dir, ['Bass']);
  await lib.resetTax('bass'); assert.equal(lib.tax.bass.length, Object.keys(SUBTYPES.bass).length);
  // persistencia
  const lib2 = await new Library(lib.store).load();
  assert.deepEqual(lib2.byId(a.id).meta.tags, ['Techno', 'Live']);
});

test('v3.0 · Efectos detectados: delay y reverb por el nombre, chorus/phaser/distorsión/EQ por el patch', async () => {
  const { fxTags, nameWords } = await import('../src/core/classify.js');
  const t = (name, set = {}) => fxTags([name], analyze(initPayload(name, set))).map((x) => x.t).sort();
  assert.deepEqual(t('Dub Chord Dly'), ['Delay']);
  assert.deepEqual(t('Big Verb Pad'), ['Reverb']);
  assert.deepEqual(t('Plain', { 102: 80, 118: 1 }), ['Chorus']);
  assert.deepEqual(t('Plain', { 102: 80, 118: 0 }), ['Phaser']);
  assert.deepEqual(t('Plain', { 100: 90 }), ['Distortion']);
  assert.deepEqual(t('Plain', { 106: 110 }), ['EQ']);
  assert.deepEqual(t('Plain'), []);
  assert.deepEqual(nameWords('Dark_AcidBass 03', 'dark acid bass v2.syx').sort(), ['acid', 'bass', 'dark']);
});

test('v3.0 · Filtro por palabras del nombre y por etiquetas', async () => {
  const lib = await new Library(new MemoryStore()).load();
  await lib.importInputs([['Dark Acid 1', {}], ['Dark Pad', { 32: 2 }], ['Bright Lead', {}]].map(([n, set]) => ({ name: n + '.syx', path: 'Lib', bytes: syx(initPayload(n, set)) })));
  assert.deepEqual(lib.wordIndex().slice(0, 1), [['dark', 2]]);
  assert.equal(lib.patches.filter((p) => lib.matches(p, { words: ['dark'] })).length, 2);
  assert.equal(lib.patches.filter((p) => lib.matches(p, { words: ['dark', 'pad'] })).length, 1);
  await lib.addTags([lib.patches[2].id], ['Reverb']);
  assert.equal(lib.patches.filter((p) => lib.matches(p, { tags: ['Reverb'] })).length, 1);
  assert.equal(lib.tagPalette[0].name, 'Efectos');
});

test('v3.1 · Parecido con lo ya clasificado y reanálisis de la biblioteca', async () => {
  const lib = await new Library(new MemoryStore()).load();
  const BASS = (i) => ({ 32: 0, 35: 62, 36: 0, 64: 28 + i, 70: 0, 72: 110, 73: 30 + i });
  const PAD = (i) => ({ 32: 2, 36: 2, 45: 2, 55: 100, 70: 80 + i, 72: 120, 73: 100 + i, 102: 60 });
  const list = [];
  for (let i = 0; i < 6; i++) list.push(['Xa' + i, BASS(i)], ['Yb' + i, PAD(i)]);
  list.push(['Mystery One', BASS(3)], ['Mystery Two', PAD(4)], ['Dly Thing', PAD(2)]);
  await lib.importInputs(list.map(([n, set]) => ({ name: n + '.syx', path: 'Lib', bytes: syx(initPayload(n, set)) })));
  const by = (n) => lib.patches.find((p) => p.name === n);
  for (let i = 0; i < 6; i++) { await lib.setCategory([by('Xa' + i).id], 'bass', 'sub'); await lib.setCategory([by('Yb' + i).id], 'pad', 'warm'); }
  const g = lib.neighbourGuess(by('Mystery One'));
  assert.equal(g.cat, 'bass'); assert.equal(g.sub, 'sub'); assert.ok(g.share >= 0.8 && g.n >= 5);
  assert.equal(lib.neighbourGuess(by('Mystery Two')).cat, 'pad');
  const r = await lib.reanalyze();
  const nn = r.nn.map((x) => [lib.byId(x.id).name, x.to]).sort();
  assert.deepEqual(nn.filter(([n]) => n.startsWith('Mystery')), [['Mystery One', 'bass'], ['Mystery Two', 'pad']]);
  assert.ok(r.tags.some((x) => lib.byId(x.id).name === 'Dly Thing' && x.fx.includes('Delay')));
  const done = await lib.applyReanalysis(r, { nn: true, sub: true, fx: true });
  assert.ok(done.length >= 2);
  assert.equal(by('Mystery One').meta.category, 'bass'); assert.equal(by('Mystery One').meta.subtype, 'sub');
  assert.ok(by('Dly Thing').meta.tags.includes('Delay'));
  const r2 = await lib.reanalyze(); assert.equal(r2.nn.filter((x) => lib.byId(x.id).name.startsWith('Mystery')).length, 0, 'tras aplicar no se repite');
});
