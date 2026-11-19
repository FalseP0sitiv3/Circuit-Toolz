// ui/app_data.js — estado, biblioteca, importación, análisis y exportaciones
import { parseAudio, encodeWav16, quantize16 } from '../core/wav.js';
import { render, overview, DEFAULT_RECIPE, toMono } from '../core/dsp.js';
import { analyze } from '../core/analyze.js';
import { classify, learnFrom, nameInfo, CATS } from '../core/classify.js';
import { zipEntries, zipRead, zipWrite } from '../core/zip.js';
import { autoTrimOf, emptyPack, componentsFiles, sdPlan, projectUsage, shortName, safeName, SLOTS, budget, sampleSeconds, MAX_TOTAL_S, PROJECT_SIZE } from '../core/pack.js';
import { Library, sha256hex, walkDir, fileFromRoot, ensurePermission, AUDIO_EXT, PACK_EXT, isJunk } from '../core/library.js';
import { RhythmMidi } from '../core/midi.js';

const APP_VERSION = '2.2.0';
const MAX_FILE = 200 * 1024 * 1024;

const S = {
  lib: null, samples: [], byId: {}, roots: new Map(), packs: [], pack: null,
  view: 'library', sel: null, multi: new Set(), anchor: null,
  f: { q: '', cat: 'all', cert: 'all', flag: 'all', sort: 'folder', tag: '', sub: '', words: [], kind: '' }, libMode: 'list', dock: false, trash: [], excluded: {}, ver: 0,
  listen: { src: 'doubt', cat: 'all', order: 'folder', auto: true, queue: [], i: 0, stats: { d: 0, a: 0, c: 0 } },
  set: { bpm: 128, sep: '__', targetDb: -0.5, thresholdDb: -60, play: 'rhythm', track: 0, channels: [1, 2, 3, 4, 5, 6, 7, 8], loopMax: 8, minCert: 'onehint', layout: 'instrument' },
  learned: {}, learnVer: 1, lastBackup: 0, changes: 0, pending: {},
  midi: new RhythmMidi(), midiOn: false, midiErr: null,
  busy: null, packSel: null, packQ: '', packCat: 'role', history: [], tune: 0, slices: 0,
  renCache: new Map(), decCache: new Map(),
};

// ---------- utilidades ----------
const catInfo = (id) => CATS.find((c) => c.id === id);
const CAT_LABEL = { kick: 'Kick', snare: 'Snare', clap: 'Clap', hat: 'Closed hat', ohat: 'Open hat', cymbal: 'Cymbal', tom: 'Tom', perc: 'Perc', bass: 'Bass', synth: 'Synth', atmos: 'Atmos', fx: 'FX', vox: 'Vox', dloop: 'Drum loop', mloop: 'Melodic loop' };
const catLabel = (id) => (id ? CAT_LABEL[id] || id : t('Sin categoría'));
const catVar = (id) => `var(--c-${id || 'none'})`;
const CERT_LABEL = () => ({ user: t('Decidido por ti'), confirmed: t('Confirmado'), onehint: t('Una pista'), sound: t('Por el sonido'), doubt: t('Dudoso'), none: t('Sin pistas') });
const BASIS_LABEL = () => ({
  user: t('Decidido por ti'), name: t('Por nombre'), folder: t('Por carpeta'), namefolder: t('Por nombre + carpeta'),
  namesound: t('Nombre + sonido'), foldersound: t('Carpeta + sonido'), namefoldersound: t('Nombre, carpeta y sonido'),
  sound: t('Por el sonido'), weak: t('Pistas débiles'), none: t('Sin pistas'),
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const yieldUI = () => new Promise((r) => setTimeout(r, 0));
const fmtDur = (s) => (s == null ? '—' : s < 10 ? nf(s, 2) + ' s' : nf(s, 1) + ' s');
const folderOf = (p) => String(p || '').split('/').slice(0, -1).join('/');

function toast(msg, kind = 'ok', ms = 4200) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.innerHTML = msg;
  const box = document.getElementById('toast');
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), ms);
}

function clsOf(s) {
  const key = S.learnVer + '|' + (s.user && s.user.cat) + '|' + (s.analysis ? s.analysis.v : 0);
  if (!s._cls || s._clsKey !== key) { s._cls = classify(s, S.learned); s._clsKey = key; }
  return s._cls;
}
function invalidateAll() { S.learnVer++; S.ver++; }

function clean(s) { const o = { ...s }; delete o._cls; delete o._clsKey; return o; }
async function saveSample(s) { s.updated = Date.now(); S.changes++; S.ver++; await S.lib.put('samples', clean(s)); }
async function saveSamples(list) { for (const s of list) s.updated = Date.now(); S.changes += list.length; S.ver++; await S.lib.putMany('samples', list.map(clean)); }
async function savePack(p) { p.updated = Date.now(); S.changes++; await S.lib.put('packs', p); }
async function saveSettings() { await S.lib.kvSet('settings', S.set); }
async function saveLearned() { await S.lib.kvSet('learned', S.learned); }

// ---------- carga ----------
async function loadAll() {
  S.lib = await Library.open();
  const [samples, roots, packs, set, learned, lastBackup, pending, packId, patterns, pat, song, trash, excluded] = await Promise.all([
    S.lib.all('samples'), S.lib.all('roots'), S.lib.all('packs'), S.lib.kvGet('settings'), S.lib.kvGet('learned'),
    S.lib.kvGet('lastBackup'), S.lib.kvGet('pending'), S.lib.kvGet('packId'), S.lib.kvGet('patterns'), S.lib.kvGet('pat'), S.lib.kvGet('song'), S.lib.kvGet('trash'), S.lib.kvGet('excluded'),
  ]);
  S.patterns = patterns || []; S.pat = pat || null; S.song = song || null; S.trash = trash || []; S.excluded = excluded || {};
  S.samples = samples; S.byId = Object.fromEntries(samples.map((s) => [s.id, s]));
  if (set) S.set = { ...S.set, ...set };
  S.learned = learned || {}; S.lastBackup = lastBackup || 0; S.pending = pending || {};
  S.packs = packs.sort((a, b) => a.created - b.created);
  S.pack = S.packs.find((p) => p.id === packId) || S.packs[0] || null;
  for (const r of roots) {
    let perm = 'prompt';
    try { perm = await ensurePermission(r.handle, 'read', false); } catch { perm = 'error'; }
    S.roots.set(r.id, { ...r, perm });
  }
  S.midi.channels = S.set.channels.slice();
}

// ---------- bytes de un sample ----------
async function bytesOf(s) {
  if (s.src && s.src.kind === 'root') {
    const r = S.roots.get(s.src.root);
    if (!r) throw new Error(t('La carpeta enlazada ya no está en la biblioteca'));
    if (r.perm !== 'granted') throw new Error(t('Hay que reconectar la carpeta «{n}»', { n: r.name }));
    try {
      const f = await fileFromRoot(r.handle, s.src.rel);
      return new Uint8Array(await f.arrayBuffer());
    } catch (e) {
      if (!s.missing) { s.missing = true; saveSample(s); }
      throw new Error(t('No encuentro «{p}» en tu disco (¿se movió?)', { p: s.src.rel }));
    }
  }
  const b = await S.lib.get('blobs', s.sha);
  if (!b) throw new Error(t('El audio de este sample no está en el navegador'));
  return new Uint8Array(await b.blob.arrayBuffer());
}
function lru(map, k, v, max) { map.delete(k); map.set(k, v); while (map.size > max) map.delete(map.keys().next().value); }
async function decodedOf(s) {
  if (S.decCache.has(s.id)) { const v = S.decCache.get(s.id); lru(S.decCache, s.id, v, 24); return v; }
  const d = await Player.decodeBytes(await bytesOf(s));
  lru(S.decCache, s.id, d, 24);
  return d;
}
function recipeOf(s) { clsOf(s); return { ...DEFAULT_RECIPE, targetDb: S.set.targetDb, thresholdDb: S.set.thresholdDb, autoTrim: autoTrimOf(s), ...(s.recipe || {}) }; }
async function renderedOf(s) {
  const key = s.id + '|' + JSON.stringify(recipeOf(s));
  if (S.renCache.has(key)) return S.renCache.get(key);
  const r = render(await decodedOf(s), recipeOf(s));
  lru(S.renCache, key, r, 40);
  return r;
}
async function wavOf(s) { const r = await renderedOf(s); return encodeWav16(quantize16(r.data), 48000); }

// ---------- análisis ----------
function makeRecord(sha, name, path, size, src) {
  return {
    id: sha, sha, name, path, paths: [path], size, ext: (name.match(/\.(\w+)$/) || [])[1]?.toLowerCase() || '', src,
    added: Date.now(), analysis: null, ov: null, user: {}, recipe: {}, info: nameInfo(name),
  };
}
async function analyzeInto(rec, u8) {
  try {
    const d = await Player.decodeBytes(u8);
    rec.analysis = analyze(d);
    rec.analysis.format = d.container; rec.analysis.meta = d.meta || {};
    rec.ov = overview(toMono(d.channels, 'sum').data, 320);
  } catch (e) {
    rec.analysis = { v: 3, error: String(e.message || e) };
  }
}

// entries: [{name, path, getFile, root?}] (root = id de carpeta enlazada)
async function importEntries(entries, label) {
  const added = [], dup = [], failed = [], packs = []; let excl = 0;
  const busy = startBusy(label, entries.length);
  const batch = [];
  for (let i = 0; i < entries.length; i++) {
    if (busy.cancel) break;
    const e = entries[i];
    busy.step(i, e.path);
    try {
      if (PACK_EXT.test(e.name)) { packs.push(e); continue; }
      const f = await e.getFile();
      if (f.size > MAX_FILE) { failed.push({ path: e.path, why: t('demasiado grande') }); continue; }
      const u8 = new Uint8Array(await f.arrayBuffer());
      const sha = await sha256hex(u8);
      if (S.excluded[sha]) { excl++; continue; }
      const ex = S.byId[sha] || batch.find((b) => b.id === sha);
      if (ex) {
        if (!ex.paths.includes(e.path)) { ex.paths.push(e.path); if (!batch.includes(ex)) batch.push(ex); }
        if (ex.missing && e.root) { ex.src = { kind: 'root', root: e.root, rel: e.rel }; ex.missing = false; ex.path = e.path; if (!batch.includes(ex)) batch.push(ex); }
        dup.push(e.path); continue;
      }
      const rec = makeRecord(sha, e.name, e.path, f.size, e.root ? { kind: 'root', root: e.root, rel: e.rel } : { kind: 'blob' });
      if (!e.root) {
        try { await S.lib.put('blobs', { sha, blob: new Blob([u8]) }); }
        catch (qe) {
          if (/quota/i.test(qe.name + qe.message)) { toast(t('El navegador no tiene más espacio para copiar audio. Usa «Enlazar carpeta» (no copia nada) o borra copias que no uses.'), 'bad', 12000); busy.cancel = true; break; }
          throw qe;
        }
      }
      await analyzeInto(rec, u8);
      if (S.pending[sha]) { const p = S.pending[sha]; rec.user = p.user || {}; rec.recipe = p.recipe || {}; delete S.pending[sha]; }
      batch.push(rec); added.push(rec);
      S.byId[sha] = rec; S.samples.push(rec);
      if (rec.analysis.error) failed.push({ path: e.path, why: rec.analysis.error });
    } catch (err) {
      failed.push({ path: e.path, why: errT(String(err.message || err)) });
    }
    if (batch.length >= 25) { await saveSamples(batch.splice(0)); refreshCounts(); await yieldUI(); }
  }
  if (batch.length) await saveSamples(batch);
  await S.lib.kvSet('pending', S.pending);
  busy.done();
  for (const p of packs) await importComponentsPack(await p.getFile());
  S.ver++;
  return { added, dup, failed, excluded: excl, cancelled: busy.cancel };
}

function startBusy(label, total) {
  const b = { cancel: false, total, i: 0, label };
  S.busy = b;
  b.step = (i, what) => { b.i = i; b.what = what; if (i % 4 === 0) paintBusy(); };
  b.done = () => { if (S.busy === b) S.busy = null; paintBusy(); };
  paintBusy();
  return b;
}

// ---------- carpetas enlazadas ----------
async function linkFolder() {
  if (!window.showDirectoryPicker) { toast(t('Este navegador no permite enlazar carpetas. Usa «Copiar archivos» o abre la herramienta en Chrome/Edge.'), 'warn', 7000); return; }
  let handle;
  try { handle = await window.showDirectoryPicker({ id: 'crsl-root', mode: 'read' }); } catch { return; }
  const same = [...S.roots.values()].find((r) => r.name === handle.name);
  let root;
  if (same && (await same.handle.isSameEntry?.(handle))) { root = same; root.handle = handle; root.perm = 'granted'; }
  else { root = { id: 'r_' + Math.random().toString(36).slice(2, 9), name: handle.name, handle, perm: 'granted', added: Date.now() }; }
  S.roots.set(root.id, root);
  try { await S.lib.put('roots', { id: root.id, name: root.name, handle: root.handle, added: root.added }); }
  catch { toast(t('El navegador no deja recordar esta carpeta: la próxima vez habrá que enlazarla de nuevo.'), 'warn', 7000); }
  await scanRoot(root);
}
async function scanRoot(root) {
  const busy = startBusy(t('Leyendo la carpeta «{n}»', { n: root.name }), 0);
  const files = await walkDir(root.handle, '', [], (n) => { busy.what = t('{n} archivos encontrados', { n }); paintBusy(); });
  busy.done();
  const known = new Set(S.samples.filter((s) => s.src?.root === root.id).map((s) => s.src.rel));
  for (const x of Object.values(S.excluded || {})) if (x.root === root.id && x.rel) known.add(x.rel); // eliminados: ni se leen
  const entries = files.filter((f) => !known.has(f.rel)).map((f) => ({ name: f.handle.name, rel: f.rel, path: root.name + '/' + f.rel, root: root.id, getFile: () => f.handle.getFile() }));
  // los que ya no están
  const present = new Set(files.map((f) => f.rel));
  const gone = S.samples.filter((s) => s.src?.root === root.id && !present.has(s.src.rel) && !s.missing);
  for (const s of gone) s.missing = true;
  if (gone.length) await saveSamples(gone);
  const r = await importEntries(entries, t('Analizando «{n}»', { n: root.name }));
  reportImport(r, { skipped: files.length - entries.length, gone: gone.length });
}
async function reconnectRoots() {
  let n = 0;
  for (const r of S.roots.values()) {
    if (r.perm === 'granted') continue;
    try { r.perm = await ensurePermission(r.handle, 'read', true); if (r.perm === 'granted') n++; } catch { r.perm = 'error'; }
  }
  S.ver++; renderAll();
  if (n) toast(t('Carpetas reconectadas: {n}', { n }));
}

function reportImport(r, extra = {}) {
  const parts = [t('<b>{n}</b> samples nuevos', { n: r.added.length })];
  if (r.dup.length) parts.push(t('{n} copias exactas de otros (no se duplican)', { n: r.dup.length }));
  if (extra.skipped) parts.push(t('{n} ya estaban', { n: extra.skipped }));
  if (extra.gone) parts.push(t('{n} ya no están en la carpeta', { n: extra.gone }));
  if (r.failed.length) parts.push(`<span class="warn">${t('{n} no se pudieron leer', { n: r.failed.length })}</span>`);
  if (r.cancelled) parts.push(t('importación detenida'));
  toast(parts.join(' · ') + (r.added.length ? '<br>' + t('Siguiente paso: 02 Escucha para revisar los dudosos.') : ''), r.failed.length ? 'warn' : 'ok', 8000);
  if (r.failed.length) console.warn('No leídos', r.failed);
  S.lastImportFailed = r.failed;
  renderAll();
}

// archivos sueltos / carpeta copiada / arrastrar
async function importFiles(fileList) {
  const entries = [];
  for (const f of fileList) {
    const path = f.webkitRelativePath || f._path || f.name;
    if (isJunk(path)) continue;
    if (!AUDIO_EXT.test(f.name) && !PACK_EXT.test(f.name) && !/\.zip$/i.test(f.name)) continue;
    if (/\.zip$/i.test(f.name)) { await importZipOfSamples(f, entries); continue; }
    entries.push({ name: f.name, path, getFile: async () => f });
  }
  const r = await importEntries(entries, t('Copiando y analizando'));
  reportImport(r);
}
async function importZipOfSamples(file, entries) {
  try {
    const z = zipEntries(new Uint8Array(await file.arrayBuffer()));
    for (const e of z.entries) {
      if (e.dir || isJunk(e.name) || (!AUDIO_EXT.test(e.name) && !PACK_EXT.test(e.name))) continue;
      const nm = e.name.split('/').pop();
      entries.push({ name: nm, path: file.name.replace(/\.zip$/i, '') + '/' + e.name, getFile: async () => new File([await zipRead(z, e)], nm) });
    }
  } catch (err) { toast(t('No se pudo abrir {n}: {e}', { n: esc(file.name), e: esc(errT(err.message)) }), 'bad'); }
}
async function filesFromDrop(dt) {
  const out = [];
  const walk = async (entry, prefix) => {
    if (entry.isFile) {
      const f = await new Promise((res, rej) => entry.file(res, rej));
      f._path = prefix + f.name; out.push(f);
    } else if (entry.isDirectory) {
      const rd = entry.createReader();
      let batch;
      do { batch = await new Promise((res, rej) => rd.readEntries(res, rej)); for (const e of batch) await walk(e, prefix + entry.name + '/'); } while (batch.length);
    }
  };
  const items = [...dt.items].map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (items.length) { for (const e of items) await walk(e, ''); return out; }
  return [...dt.files];
}

// ---------- packs de Components ----------
async function importComponentsPack(file) {
  try {
    const z = zipEntries(new Uint8Array(await file.arrayBuffer()));
    const ie = z.entries.find((e) => e.name === 'index.json');
    if (!ie) throw new Error(t('falta index.json'));
    const index = JSON.parse(new TextDecoder().decode(await zipRead(z, ie)));
    if (index.product && index.product !== 'circuit-rhythm') throw new Error(t('es un pack de {p}, no de Circuit Rhythm', { p: index.product }));
    const pname = index.name || file.name.replace(PACK_EXT, '');
    const pack = emptyPack(pname, 'free');
    pack.color = index.color || 'orange';
    pack.source = { kind: 'components', file: file.name };
    const busy = startBusy(t('Importando el pack «{n}»', { n: pname }), (index.samples || []).length);
    const batch = [];
    for (let i = 0; i < (index.samples || []).length && i < SLOTS; i++) {
      busy.step(i, index.samples[i].name);
      const ent = z.entries.find((e) => e.name === index.samples[i].url);
      if (!ent || !index.samples[i].name) continue;
      const u8 = await zipRead(z, ent);
      const sha = await sha256hex(u8);
      const nm = index.samples[i].name;
      const path = `Packs/${safeName(pname)}/${String(i + 1).padStart(3, '0')} ${nm}.wav`;
      let rec = S.byId[sha] || preparedTwin(nm, u8);
      if (rec) { if (!rec.paths.includes(path) && rec.id === sha) { rec.paths.push(path); batch.push(rec); } }
      else {
        rec = makeRecord(sha, nm + '.wav', path, u8.length, { kind: 'blob' });
        await S.lib.put('blobs', { sha, blob: new Blob([u8]) });
        await analyzeInto(rec, u8);
        S.byId[sha] = rec; S.samples.push(rec); batch.push(rec);
      }
      pack.slots[i] = rec.id; pack.names[i] = nm;
    }
    // proyectos y Grid FX se conservan para volver a exportar el pack sin perderlos
    const projects = [], usage = {};
    for (let i = 0; i < 64; i++) {
      const pe = z.entries.find((e) => e.name === (index.projects?.[i]?.url || `projects/project_${i}.ncs`));
      if (!pe) continue;
      const d = await zipRead(z, pe);
      if (String.fromCharCode(...d.subarray(0, 4)) === 'INIT') continue;
      projects.push({ i, name: index.projects[i].name, data: d });
      const u = projectUsage(d);
      if (u) for (const sl of u.slots) (usage[sl] ||= []).push(index.projects[i].name || `#${i + 1}`);
    }
    const grid = [];
    for (let i = 0; i < 16; i++) {
      const g = index.gridEffects?.[i]; const ge = g && z.entries.find((e) => e.name === g.url);
      grid.push(ge ? { effectType: g.effectType, data: await zipRead(z, ge) } : null);
    }
    pack.extra = { projects, grid };
    pack.usage = usage;
    pack.origSlots = pack.slots.slice();
    busy.done();
    await saveSamples(batch);
    S.packs.push(pack); S.pack = pack; await savePack(pack); await S.lib.kvSet('packId', pack.id);
    toast(t('Pack «{n}» importado: {s} samples, {p} proyectos con contenido.', { n: esc(pname), s: pack.slots.filter(Boolean).length, p: projects.length }) + (projects.length ? '<br>' + t('Sus proyectos se conservan al exportar a Components.') : ''), 'ok', 8000);
  } catch (err) {
    toast(t('No se pudo importar {n}: {e}', { n: esc(file.name), e: esc(errT(err.message)) }), 'bad', 8000);
  }
}

// ¿Es este WAV del pack la versión preparada (48 kHz mono) de un sample de la biblioteca?
// Mismo nombre corto y misma duración que daría su preparación: así reimportar un pack propio no duplica.
function preparedTwin(name, u8) {
  let d;
  try { d = parseAudio(u8); } catch { return null; }
  if (d.sampleRate !== 48000 || d.channels.length !== 1) return null;
  const dur = d.channels[0].length / 48000;
  const nm = safeName(name).toLowerCase();
  return S.samples.find((s) => shortName(s.name).toLowerCase() === nm && Math.abs(sampleSeconds(s) - dur) < 0.004) || null;
}

// ---------- exportaciones ----------
function download(data, name, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
}
function packChecks(p) {
  for (const id of p.slots) if (id && S.byId[id]) clsOf(S.byId[id]);
  const b = budget(p, S.byId);
  const issues = [];
  if (b.over) issues.push({ k: 'bad', m: t('Te pasas del límite: {a} s de {b} s. La Rhythm no avisa y no cargará el pack completo.', { a: nf(b.total), b: MAX_TOTAL_S }) });
  if (b.over30.length) issues.push({ k: 'warn', m: t('{n} samples duran más de 30 s: se recortan a 30 s al exportar.', { n: b.over30.length }) });
  const missing = p.slots.map((id, i) => [id, i]).filter(([id]) => id && !S.byId[id]);
  if (missing.length) issues.push({ k: 'bad', m: t('{n} slots apuntan a samples que ya no están en la biblioteca.', { n: missing.length }) });
  const locked = p.slots.filter((id) => id && S.byId[id]?.src?.kind === 'root' && S.roots.get(S.byId[id].src.root)?.perm !== 'granted');
  if (locked.length) issues.push({ k: 'bad', m: t('{n} samples están en carpetas que hay que reconectar.', { n: locked.length }) });
  if (p.usage && p.origSlots) {
    const moved = Object.keys(p.usage).map(Number).filter((sl) => p.slots[sl] !== p.origSlots[sl]);
    if (moved.length) issues.push({ k: 'warn', m: t('Sus proyectos usan slots que has cambiado ({l}): sonarán con el sample nuevo.', { l: moved.slice(0, 8).map((x) => x + 1).join(', ') + (moved.length > 8 ? '…' : '') }) });
  }
  if (!p.slots.some(Boolean)) issues.push({ k: 'bad', m: t('El pack está vacío.') });
  return { b, issues, blocking: issues.some((i) => i.k === 'bad') };
}
async function renderPackWavs(p) {
  const out = {};
  const ids = p.slots.map((id, i) => [id, i]).filter(([id]) => id && S.byId[id]);
  const busy = startBusy(t('Preparando {n} samples a 48 kHz · mono · 16 bit', { n: ids.length }), ids.length);
  try {
    for (let k = 0; k < ids.length; k++) {
      if (busy.cancel) throw new Error(t('cancelado'));
      const [id, i] = ids[k];
      busy.step(k, S.byId[id].name);
      out[i] = await wavOf(S.byId[id]);
      if (k % 3 === 0) await yieldUI();
    }
  } finally { busy.done(); }
  return out;
}
async function exportComponents(p) {
  const c = packChecks(p);
  if (c.blocking) { showChecks(c, t('No se puede exportar todavía')); return; }
  const wavs = await renderPackWavs(p);
  const projects = p.extra?.projects ? Object.fromEntries(p.extra.projects.map((x) => [x.i, x])) : {};
  for (const [i, sg] of Object.entries(p.songs || {})) projects[i] = sg; // canciones de 06 Canciones
  const { files } = componentsFiles(p, wavs, { projects, gridFx: p.extra?.grid });
  const zip = await zipWrite(files);
  download(zip, safeName(p.name) + '.circuitrhythmpack', 'application/zip');
  toast(t('Pack exportado ({mb} MB). En Components: Packs → abrir desde el ordenador → Send to Circuit Rhythm.', { mb: nf(zip.length / 1048576, 1) }), 'ok', 9000);
}
async function exportSdZip(p, packNumber) {
  const c = packChecks(p);
  if (c.blocking) { showChecks(c, t('No se puede exportar todavía')); return; }
  const wavs = await renderPackWavs(p);
  const plan = sdPlan(p, wavs, { packNumber, sep: S.set.sep });
  download(await zipWrite(plan.files, { compress: false }), `Rhythm_SD_${packNumber}_${safeName(p.name)}.zip`, 'application/zip');
  toast(t('ZIP listo. Descomprímelo en la raíz de la microSD (FAT32): debe quedar {b}.', { b: `<span class="mono">${esc(plan.base)}/PCM</span>` }), 'ok', 9000);
}
async function sdFreeNumbers(dir) {
  let rh = null;
  try { rh = await dir.getDirectoryHandle('Rhythm'); } catch { if (dir.name === 'Rhythm') rh = dir; }
  const used = new Set();
  if (rh) for await (const [name, h] of rh.entries()) if (h.kind === 'directory') { const m = name.match(/^(\d+)/); if (m) used.add(+m[1]); }
  return { rh, used, free: [...Array(31).keys()].filter((n) => !used.has(n)) };
}
async function exportSdFolder(p, packNumber, dir) {
  const c = packChecks(p);
  if (c.blocking) { showChecks(c, t('No se puede exportar todavía')); return; }
  const { used } = await sdFreeNumbers(dir);
  if (used.has(packNumber)) { toast(t('Ya existe un pack en la posición {n} de la tarjeta. No se sobrescribe: elige otra.', { n: packNumber }), 'bad', 8000); return; }
  const wavs = await renderPackWavs(p);
  const plan = sdPlan(p, wavs, { packNumber, sep: S.set.sep });
  let base = dir;
  const parts = plan.base.split('/');
  if (dir.name === 'Rhythm') parts.shift();
  const busy = startBusy(t('Escribiendo en la tarjeta'), plan.files.length);
  try {
    for (let k = 0; k < plan.files.length; k++) {
      const f = plan.files[k];
      busy.step(k, f.name);
      const segs = f.name.split('/').filter(Boolean);
      if (dir.name === 'Rhythm') segs.shift();
      let d = base;
      const isDir = f.name.endsWith('/');
      for (let i = 0; i < segs.length - (isDir ? 0 : 1); i++) d = await d.getDirectoryHandle(segs[i], { create: true });
      if (!isDir) {
        const fh = await d.getFileHandle(segs[segs.length - 1], { create: true });
        const w = await fh.createWritable(); await w.write(f.data); await w.close();
      }
    }
  } finally { busy.done(); }
  toast(t('Pack escrito en la tarjeta: {b}. Expúlsala bien antes de sacarla.', { b: `<span class="mono">${esc(plan.base)}</span>` }), 'ok', 9000);
}
async function exportWavZip(p) {
  const wavs = await renderPackWavs(p);
  const files = [];
  const rows = [['slot', 'sd_file', 'name', 'category', 'seconds', 'source', 'sha256'].join(',')];
  const csv = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  p.slots.forEach((id, i) => {
    if (!id || !wavs[i]) return;
    const s = S.byId[id];
    const fn = `${String(i + 1).padStart(3, '0')} ${safeName(p.names[i])}.wav`;
    files.push({ name: safeName(p.name) + '/' + fn, data: wavs[i] });
    rows.push([i + 1, csv(`${i < 10 ? '0' + i : i}${S.set.sep}${safeName(p.names[i])}.wav`), csv(p.names[i]), clsOf(s).cat || '', nf(sampleSeconds(s), 3).replace(',', '.'), csv(s.path), s.sha].join(','));
  });
  files.push({ name: safeName(p.name) + '/pack.csv', data: rows.join('\n') });
  download(await zipWrite(files, { compress: false }), safeName(p.name) + '_wav.zip', 'application/zip');
}

// ---------- copia de seguridad ----------
async function backupJSON() {
  const data = {
    app: 'circuit-rhythm-sample-library', v: 1, version: APP_VERSION, date: new Date().toISOString(),
    samples: S.samples.map((s) => ({ id: s.id, name: s.name, path: s.path, paths: s.paths, user: s.user, recipe: s.recipe })).filter((s) => Object.keys(s.user || {}).length || Object.keys(s.recipe || {}).length || true),
    packs: S.packs.map((p) => ({ ...p, extra: undefined, songs: undefined })), learned: S.learned, settings: S.set, pending: S.pending, patterns: S.patterns, pat: S.pat,
  };
  download(JSON.stringify(data), `circuit_rhythm_library_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  S.lastBackup = Date.now(); S.changes = 0; await S.lib.kvSet('lastBackup', S.lastBackup);
  renderHeader();
}
async function restoreJSON(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'circuit-rhythm-sample-library') throw new Error(t('No es una copia de esta herramienta'));
  let matched = 0, pend = 0;
  const upd = [];
  for (const r of data.samples || []) {
    const s = S.byId[r.id];
    if (s) { s.user = r.user || {}; s.recipe = r.recipe || {}; upd.push(s); matched++; }
    else { S.pending[r.id] = { user: r.user, recipe: r.recipe, name: r.name, path: r.path }; pend++; }
  }
  await saveSamples(upd);
  Object.assign(S.pending, data.pending || {});
  await S.lib.kvSet('pending', S.pending);
  for (const p of data.packs || []) { if (!S.packs.find((q) => q.id === p.id)) { S.packs.push(p); await S.lib.put('packs', p); } }
  S.learned = data.learned || S.learned; await saveLearned();
  if (data.patterns) { S.patterns = data.patterns; await S.lib.kvSet('patterns', S.patterns); }
  S.set = { ...S.set, ...(data.settings || {}) }; await saveSettings();
  invalidateAll();
  toast(t('Copia restaurada: {m} fichas aplicadas; {p} quedan pendientes y se aplicarán al reimportar esos archivos.', { m: matched, p: pend }), 'ok', 9000);
}
