// Biblioteca: almacenamiento, importación, variantes, historial, colecciones, bancos y copias de seguridad.
// Separa tres capas: archivo original (bytes intactos), metadatos del usuario y variantes editadas.
import { splitMessages, parseMessage, detectBank, buildReplaceCurrent, readName, encodeName, sniffHead, FOREIGN } from './sysex.js';
import { fingerprints, sha256, groupDuplicates, quickHash } from './compare.js';
import { readZip, writeZip } from './zip.js';
import { classify, suggestRules, taxonomy, subLabelOf, nameWords, fxTags, TAG_PALETTE } from './classify.js';
import { analyze, hasFeature, integrityCheck } from './patch.js';
import { auditMacros } from './macros.js';
import { buildFamilies, vectorize, pca2, affinity } from './families.js';
import { measuredFeatures } from './acoustic.js';

export const APP_VERSION = '3.10.1';
export const STORES = ['files', 'patches', 'collections', 'banks', 'rules', 'history', 'settings'];
const MAX_SYX = 2 * 1024 * 1024;

export const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const uid = () => globalThis.crypto?.randomUUID?.() || 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
const now = () => new Date().toISOString();

// --- Adaptadores de almacenamiento ---
export class MemoryStore {
  constructor() { this.data = Object.fromEntries(STORES.map((s) => [s, new Map()])); this.kind = 'memory'; }
  async getAll(s) { return [...this.data[s].values()].map((x) => structuredClone(x)); }
  async putMany(s, items) { for (const it of items) this.data[s].set(it.id, structuredClone(it)); }
  async delete(s, ids) { for (const id of ids) this.data[s].delete(id); }
  async clear(s) { this.data[s].clear(); }
}
export class IDBStore {
  constructor(name = 'circuit_tracks_patch_lab') { this.name = name; this.kind = 'indexeddb'; }
  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, 1);
      req.onupgradeneeded = () => { for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: 'id' }); };
      req.onsuccess = () => { this.db = req.result; resolve(this); };
      req.onerror = () => reject(req.error);
    });
  }
  tx(s, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = this.db.transaction(s, mode), st = t.objectStore(s); let out;
      fn(st, (v) => { out = v; });
      t.oncomplete = () => resolve(out); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error || new Error('Transacción abortada'));
    });
  }
  getAll(s) { return this.tx(s, 'readonly', (st, set) => { const r = st.getAll(); r.onsuccess = () => set(r.result); }); }
  putMany(s, items) { return this.tx(s, 'readwrite', (st) => { for (const it of items) st.put(it); }); }
  delete(s, ids) { return this.tx(s, 'readwrite', (st) => { for (const id of ids) st.delete(id); }); }
  clear(s) { return this.tx(s, 'readwrite', (st) => st.clear()); }
}

export const REVIEW = { pending: 'Pendiente', reviewed: 'Revisado', listened: 'Escuchado', keep: 'Conservar', discard: 'Descartar' };

// Agrupa los motivos del informe para que 400 avisos iguales se lean como una línea.
export function groupReport(rep) {
  const norm = (t) => t.replace(/mensaje \d+: /g, '').replace(/ · mensaje \d+/g, '').replace(/\b(byte|bytes|posición|Ubicación|Número de patch|Longitud) \d+/g, '$1 N').replace(/0x[0-9A-F]{2}/gi, '0x··');
  const g = (arr, textOf) => { const m = new Map(); for (const x of arr) for (const t of [].concat(textOf(x))) { const k = norm(t); const e = m.get(k) || { why: k, count: 0, examples: [] }; e.count++; if (e.examples.length < 4) e.examples.push(x.name); m.set(k, e); } return [...m.values()].sort((a, b) => b.count - a.count); };
  const foreign = new Map();
  for (const f of rep.foreign) { const e = foreign.get(f.kind) || { kind: f.kind, why: f.why, files: 0, items: 0, examples: [], names: [] }; e.files++; e.items += f.count; if (e.examples.length < 4) e.examples.push(f.name); if (e.names.length < 400) e.names.push(...f.names.slice(0, 400 - e.names.length)); foreign.set(f.kind, e); }
  return { unknown: g(rep.unknown, (x) => x.why), warnings: g(rep.warnings, (x) => x.items), skipped: g(rep.skipped, (x) => x.why), foreign: [...foreign.values()] };
}
// Metadatos propios de cada versión (el resto es del sonido y se comparte entre el original y sus variantes).
const VERSION_KEYS = new Set(['adopted', 'quickOct']);
function newMeta() { return { category: null, subtype: null, usage: [], descriptors: [], tags: [], fav: false, rating: 0, notes: '', review: 'pending', classStatus: 'proposed', classAt: null }; }

export class Library {
  constructor(store) { this.store = store; this.files = []; this.patches = []; this.collections = []; this.banks = []; this.rules = []; this.history = []; this.settings = {}; this._cache = new Map(); this.listeners = new Set(); }
  async load() {
    for (const s of STORES) { const all = await this.store.getAll(s); if (s === 'settings') this.settings = Object.fromEntries(all.map((x) => [x.id, x.value])); else this[s] = all; }
    this.patches.sort((a, b) => (a.importedAt < b.importedAt ? -1 : 1));
    this.history.sort((a, b) => (a.at < b.at ? -1 : 1));
    if (!this.banks.length) await this.createBank('Pack principal');
    const old = this.trash().filter((h) => Date.now() - Date.parse(h.at) > 30 * 864e5); if (old.length) await this.emptyTrash(old.map((h) => h.id));
    return this;
  }
  emit() { this._fam = null; this._map = null; this._adopt = null; this._chain = null; this._faces = null; this._groups = null; for (const f of this.listeners) f(); }
  // ===== Modelo de cambios =====
  // Original: el archivo importado; nunca cambia. Cualquier edición crea una VARIANTE (copia enlazada).
  // Una variante nace como «borrador»; al ACEPTARLA sustituye a su original en disco y packs
  // (el archivo original de tu disco no se toca nunca). Solo puede haber una aceptada por original.
  adoptedMap() {
    if (this._adopt) return this._adopt;
    const m = new Map(); for (const v of this.patches) if (v.kind === 'variant' && v.meta.adopted) m.set(v.parentId, v.id);
    return (this._adopt = m);
  }
  // Cadena viva: desde cada original (o variante huérfana) se siguen las variantes aceptadas.
  // Una variante marcada como aceptada fuera de esa cadena (rama abandonada) cuenta como borrador.
  liveChain() {
    if (this._chain) return this._chain;
    const m = this.adoptedMap(), set = new Set();
    for (const r of this.patches) if (r.kind !== 'variant' || !r.parentId || !this.byId(r.parentId)) { let q = r, i = 0; while (m.has(q.id) && i++ < 16) { q = this.byId(m.get(q.id)); if (!q) break; set.add(q.id); } }
    return (this._chain = set);
  }
  changeState(p) {
    const m = this.adoptedMap();
    if (p.kind !== 'variant' || !p.parentId || !this.byId(p.parentId)) return m.has(p.id) ? 'superseded' : 'original';
    if (!p.meta.adopted || !this.liveChain().has(p.id)) return 'draft';
    return m.has(p.id) ? 'superseded' : 'adopted';
  }
  // Versión vigente de un patch: sigue la cadena de variantes aceptadas.
  currentVersion(p) { let q = p, i = 0; while (q && this.adoptedMap().has(q.id) && i++ < 16) q = this.byId(this.adoptedMap().get(q.id)); return q || p; }
  replacementOf(p) { const v = this.currentVersion(p); return v && v.id !== p.id ? v : null; }
  // v3.10 · Aceptar una propuesta = sumarla a la versión del sonido. Cada sonido tiene como mucho UNA versión:
  //  · si aún no tiene, la propuesta pasa a ser su versión (colgada directamente del original);
  //  · si ya tiene, los cambios de la propuesta (lo que cambia respecto a aquello de lo que salió) se escriben en esa
  //    versión y la propuesta desaparece: nada de cadenas ni ramas.
  // on = false: la versión vuelve a ser una propuesta pendiente (el sonido suena otra vez como el original).
  async adoptVariants(ids, on = true) {
    const vs = ids.map((id) => this.byId(id)).filter((v) => v && v.kind === 'variant' && this.isVersion(v));
    if (!vs.length) return null;
    if (!on) return this.updateMeta(vs.map((v) => v.id), { adopted: false }, `${vs.length} versión(es) vuelven a propuesta: suena el original`, { op: 'adopt' });
    let last = null;
    for (const v0 of vs) {
      const v = this.byId(v0.id); if (!v) continue;
      const root = this.rootOf(v), cv = this.currentVersion(root);
      if (cv.id === v.id) continue;
      if (cv.id === root.id) {
        // el sonido no tiene versión: esta pasa a serlo, como «original + lo que proponía»
        const want = new Uint8Array(root.payload); for (const [o, x] of this.proposalDiff(v)) want[o] = x;
        if (v.parentId !== root.id || !this.sameSound(want, v.payload)) { v.payload = want; v.fp = fingerprints(want); v.name = readName(want).name || v.name; v.parentId = root.id; v.diff = null; await this.store.putMany('patches', [v]); this._adopt = null; this._chain = null; this._idx = null; }
        last = await this.updateMeta([v.id], { adopted: true }, `Versión de «${root.name}»: ${v.originText || 'cambios'}`, { op: 'adopt' });
      } else {
        const edits = this.proposalDiff(v).filter(([o, val]) => cv.payload[o] !== val);
        if (edits.length) await this.editVariantBytes(cv.id, edits, `Propuesta aplicada: ${v.originText || 'cambios'}`);
        await this.noteOp(cv, v.originText || 'cambios');
        if (v.meta.quickOct) await this.updateMeta([cv.id], { quickOct: (cv.meta.quickOct || 0) + v.meta.quickOct }, 'Octava a mano');
        await this.deletePatches([v.id], true);
        last = true;
      }
    }
    return last;
  }
  byId(id) {
    const ix = this._idx;
    if (!ix || ix.arr !== this.patches || ix.len !== this.patches.length) this._idx = { arr: this.patches, len: this.patches.length, map: new Map(this.patches.map((p) => [p.id, p])) };
    return this._idx.map.get(id);
  }

  // ===== v3.10 · Un sonido, una versión =====
  // Sonido = un original (o una copia independiente) con, como mucho, una versión editada que lo sustituye.
  // Las demás variantes que cuelgan de él son propuestas pendientes (octava, macros, plantillas en borrador…).
  // En la biblioteca, en Escucha y en los recuentos solo aparece cada sonido una vez, con su versión vigente.
  isVersion(p) { return !!p && p.kind === 'variant' && !!p.parentId && !!this.byId(p.parentId); }
  rootOf(p) { let q = p, i = 0; while (q && this.isVersion(q) && i++ < 32) q = this.byId(q.parentId); return q || p; }
  // Lo que se ve en las listas: la versión vigente de cada sonido.
  faces() {
    if (!this._faces) this._faces = this.patches.filter((p) => !this.isVersion(p)).map((p) => this.currentVersion(p));
    return this._faces;
  }
  // root.id → ids del sonido (original y todas sus variantes). Los metadatos (carpeta, etiquetas, valoración…) son del sonido.
  groups() {
    if (!this._groups) { const g = new Map(); for (const p of this.patches) { const r = this.rootOf(p).id; (g.get(r) || g.set(r, []).get(r)).push(p.id); } this._groups = g; }
    return this._groups;
  }
  groupIds(id) { const p = this.byId(id); if (!p) return [id]; return this.groups().get(this.rootOf(p).id) || [id]; }
  proposalsOf(p) { const root = this.rootOf(p), ids = this.groups().get(root.id) || []; return ids.map((id) => this.byId(id)).filter((v) => v && v.id !== root.id && this.changeState(v) === 'draft'); }
  // Cambios que propone una variante: lo que cambia respecto a aquello de lo que salió (o lo guardado al reordenar).
  proposalDiff(v) {
    if (v.diff) return v.diff.map(([o, x]) => [+o, x]);
    const base = this.byId(v.parentId) || this.rootOf(v), out = [];
    for (let i = 0; i < 340; i++) if (base.payload[i] !== v.payload[i]) out.push([i, v.payload[i]]);
    return out;
  }
  async noteOp(v, text) {
    if (!v || !text) return;
    // la misma clase de cambio con otro valor sustituye a la anterior («Octava −1» → «Octava −2»)
    const kind = (t) => String(t).replace(/[−+\-]?\d+([.,]\d+)?/g, '#').trim();
    const ops = (v.ops || (v.originText ? [v.originText] : [])).filter((x) => kind(x) !== kind(text));
    v.ops = [...ops, text].slice(-8); v.originText = v.ops.join(' · '); await this.store.putMany('patches', [v]);
  }
  // Editar un sonido: los cambios van a su versión; si aún no tiene, se crea (ya aceptada). El original no se toca.
  async editSound(p, payload, op, text) {
    const root = this.rootOf(p), cv = this.currentVersion(root);
    if (cv.kind === 'variant') {
      const edits = []; for (let i = 0; i < 340; i++) if (cv.payload[i] !== payload[i]) edits.push([i, payload[i]]);
      if (edits.length) await this.editVariantBytes(cv.id, edits, text);
      await this.noteOp(cv, text);
      if (cv.id !== root.id && this.sameSound(cv.payload, root.payload)) { await this.deletePatches([cv.id], true); await this.log('meta', [root.id], null, null, `«${root.name}» vuelve a ser el original`); this.emit(); return root; }
      return cv;
    }
    if (this.sameSound(cv.payload, payload)) return cv;
    return this.createVariant(root.id, payload, op, text, '', { adopted: true });
  }
  sameSound(a, b) { for (let i = 0; i < 340; i++) if (a[i] !== b[i]) return false; return true; }
  // Volver al original: la versión va a la papelera (se puede recuperar o deshacer con Ctrl Z).
  async revertToOriginal(p) {
    const root = this.rootOf(p), chain = []; let q = root, i = 0;
    while (this.adoptedMap().has(q.id) && i++ < 16) { q = this.byId(this.adoptedMap().get(q.id)); if (!q) break; chain.push(q.id); }
    if (!chain.length) return root;
    await this.deletePatches(chain); return root;
  }
  // Duplicar: un sonido nuevo e independiente (otra fila, sus propias carpetas y su propio nombre).
  async duplicateSound(p, suffix = ' 2') {
    const src = this.currentVersion(this.rootOf(p)), pl = new Uint8Array(src.payload);
    const nm = (readName(pl).name || src.name || 'Patch').slice(0, 16 - suffix.length) + suffix; pl.set(encodeName(nm), 0);
    const c = await this.createVariant(src.id, pl, 'copy', `Copia de «${src.name}»`, '');
    c.parentId = null; c.copyOf = this.rootOf(p).id; c.rootId = c.id; c.meta.adopted = false; delete c.meta.quickOct;
    await this.store.putMany('patches', [c]); this.emit(); return c;
  }

  // ---------- Ordenar lo que dejó el modelo anterior (cadenas, ramas, borradores repetidos) ----------
  // Plan sin tocar nada: por sonido, qué versión queda, qué sobra y qué propuestas siguen pendientes.
  versionsPlan() {
    const out = { sounds: [], collapse: 0, drop: [], keep: [], meta: 0 };
    for (const [rid, ids] of this.groups()) {
      if (ids.length < 2) continue;
      const root = this.byId(rid), cv = this.currentVersion(root), chain = [];
      let q = root, i = 0; while (this.adoptedMap().has(q.id) && i++ < 16) { q = this.byId(this.adoptedMap().get(q.id)); if (!q) break; chain.push(q.id); }
      const s = { root: rid, keep: cv.id !== rid ? cv.id : null, dropChain: chain.slice(0, -1), drop: [], keep2: [], metaFix: false };
      for (const id of ids) {
        if (id === rid || chain.includes(id)) continue;
        const v = this.byId(id), d = this.proposalDiff(v), target = cv.payload;
        const nothing = !d.length || d.every(([o, x]) => target[o] === x) || this.sameSound(v.payload, root.payload) || this.sameSound(v.payload, cv.payload);
        if (nothing) s.drop.push(id); else s.keep2.push(id);
      }
      const metas = ids.map((id) => this.byId(id).meta), key = (m) => JSON.stringify([m.category, m.subtype, [...(m.tags || [])].sort(), m.rating || 0, !!m.fav, m.notes || '', m.patternId || null]);
      s.metaFix = new Set(metas.map(key)).size > 1;
      if (s.dropChain.length || s.drop.length || s.metaFix || (s.keep && this.byId(s.keep).parentId !== rid)) {
        out.sounds.push(s); out.collapse += s.dropChain.length ? 1 : 0; out.drop.push(...s.dropChain, ...s.drop); out.keep.push(...s.keep2); out.meta += s.metaFix ? 1 : 0;
      }
    }
    return out;
  }
  // Aplica el plan: una versión por sonido (con lo que sonaba), fuera lo repetido, metadatos unificados.
  // dropProposals: también descarta las propuestas que sí cambian algo. Se deshace entero (historial · op 'versions').
  async tidyVersions(plan = this.versionsPlan(), { dropProposals = false } = {}) {
    if (!plan.sounds.length) return { sounds: 0, dropped: 0 };
    const touchedIds = new Set(plan.sounds.flatMap((s) => this.groups().get(s.root) || []));
    const snap = { patches: [...touchedIds].map((id) => structuredClone(this.byId(id))), banks: structuredClone(this.banks), collections: structuredClone(this.collections) };
    const drop = new Set(), ups = new Map();
    for (const s of plan.sounds) {
      const root = this.byId(s.root), group = (this.groups().get(s.root) || []).map((id) => this.byId(id));
      // metadatos del sonido: la clasificación más reciente, todas las etiquetas, la mejor valoración
      const ms = group.map((p) => p.meta), cls = ms.filter((m) => m.category).sort((a, b) => String(b.classAt || '').localeCompare(String(a.classAt || '')))[0] || root.meta;
      const merged = { category: cls.category ?? null, subtype: cls.subtype ?? null, classStatus: cls.classStatus, classAt: cls.classAt, tags: [...new Set(ms.flatMap((m) => m.tags || []))], rating: Math.max(0, ...ms.map((m) => m.rating || 0)), fav: ms.some((m) => m.fav), notes: [...new Set(ms.map((m) => (m.notes || '').trim()).filter(Boolean))].join('\n'), patternId: root.meta.patternId || ms.find((m) => m.patternId)?.patternId || null };
      for (const p of group) { Object.assign(p.meta, structuredClone(merged)); ups.set(p.id, p); }
      if (s.keep) { const k = this.byId(s.keep); if (k.parentId !== root.id) { k.parentId = root.id; k.diff = null; } k.meta.adopted = true; const ops = s.dropChain.map((id) => this.byId(id)?.originText).filter(Boolean); if (ops.length) { k.ops = [...new Set([...ops, ...(k.ops || [k.originText].filter(Boolean))])].slice(-8); k.originText = k.ops.join(' · '); } ups.set(k.id, k); }
      for (const id of [...s.dropChain, ...s.drop, ...(dropProposals ? s.keep2 : [])]) drop.add(id);
      if (!dropProposals) for (const id of s.keep2) { const v = this.byId(id); if (!v.diff) v.diff = this.proposalDiff(v); v.meta.adopted = false; ups.set(v.id, v); }
      if (!dropProposals) for (const id of s.keep2) { const v = this.byId(id); v.parentId = root.id; }
    }
    // packs y colecciones que apuntaban a lo que sobra: pasan al sonido (al exportar va su versión vigente)
    const to = new Map(); for (const s of plan.sounds) for (const id of this.groups().get(s.root) || []) if (drop.has(id)) to.set(id, s.root);
    for (const b of this.banks) b.slots = b.slots.map((x) => (x && to.has(x) ? (b.slots.includes(to.get(x)) ? null : to.get(x)) : x));
    for (const c of this.collections) if (c.ids) c.ids = [...new Set(c.ids.map((x) => to.get(x) || x))];
    this.patches = this.patches.filter((p) => !drop.has(p.id));
    await this.store.delete('patches', [...drop]); await this.store.putMany('patches', [...ups.values()].filter((p) => !drop.has(p.id)));
    await this.store.putMany('banks', this.banks); await this.store.putMany('collections', this.collections);
    await this.log('versions', [...touchedIds], snap, null, `Versiones ordenadas: ${plan.sounds.length} sonido(s), ${drop.size} variante(s) sobrante(s) fuera`, true);
    this.emit();
    return { sounds: plan.sounds.length, dropped: drop.size };
  }
  fileOf(p) { return this.files.find((f) => f.id === p.fileId); }

  // ---------- Análisis con caché ----------
  info(p) {
    const key = p.id + ':' + p.fp.payload + ':' + (p.meta.classStatus || '') + ':' + this.rules.length + ':' + (this.rulesVersion || 0) + ':' + (p.acoustic?.at || '');
    let c = this._cache.get(p.id);
    if (c && c.key === key) return c;
    const an = analyze(p.payload);
    const cls = classify({ payload: p.payload, fileName: p.fileName, folderPath: p.folderPath, bankName: p.bankName, rules: this.rules, acoustic: p.acoustic });
    const ex = this.rules.find((r) => r.enabled && r.type === 'patch' && r.pattern === p.fp.payload);
    if (ex) { cls.category = ex.category; cls.subtype = ex.subtype || null; cls.certainty = 'manual'; cls.evidence.unshift({ cat: ex.category, pts: 0, source: 'Excepción', why: 'Excepción registrada para esta carga exacta' }); }
    c = { key, an, cls, integrity: integrityCheck(p.payload), macros: auditMacros(p.payload) };
    this._cache.set(p.id, c);
    return c;
  }
  effectiveCategory(p) { return p.meta.category || null; }

  // ---------- Importación ----------
  // inputs: [{name, path, bytes}] ; path = carpeta relativa (sin el nombre)
  async importInputs(inputs, onProgress) {
    const report = { files: 0, patches: 0, duplicatesFile: [], duplicatesPatch: [], unknown: [], errors: [], skipped: [], warnings: [], foreign: [], repaired: 0, packs: [] };
    const newFiles = [], newPatches = [], touched = [];
    const fileHashes = new Map(this.files.map((f) => [f.sha256, f]));
    const payloadIdx = new Map(this.patches.filter((p) => p.kind === 'original').map((p) => [p.fp.payload, p]));
    let processed = 0;
    const handleSyx = async (name, path, bytes, zipName, pack) => {
      if (bytes.length > MAX_SYX) { report.skipped.push({ name, why: sniffHead(bytes.subarray(0, 16)) || 'Mayor de 2 MB' }); return; }
      const hash = await sha256(bytes);
      if (fileHashes.has(hash)) { report.duplicatesFile.push({ name: (path ? path + '/' : '') + name, existing: fileHashes.get(hash).name }); return; }
      const { messages, anomalies } = splitMessages(bytes);
      const parsed = messages.map((m) => parseMessage(m.bytes, m.repairs));
      const foreign = parsed.filter((r) => r.kind === 'foreign' && r.foreign !== 'emptySlot');
      const where0 = (path ? path + '/' : '') + name;
      // Archivos que solo contienen material de otros equipos: se explican en bloque y no se guardan.
      if (messages.length && parsed.every((r) => r.kind === 'foreign')) {
        if (foreign.length) report.foreign.push({ name: where0, kind: foreign[0].foreign, why: FOREIGN[foreign[0].foreign], count: foreign.length, names: foreign.map((r) => r.name).filter(Boolean) });
        return;
      }
      const file = { id: uid(), sha256: hash, name, path: path || '', zipName: zipName || '', size: bytes.length, bytes, importedAt: now(), source: pack ? 'pack' : zipName ? 'zip' : 'file', anomalies: anomalies.map((a) => a.text), messageCount: messages.length, isBank: detectBank(parsed), patchIds: [] };
      fileHashes.set(hash, file); newFiles.push(file); report.files++;
      const repairedHere = anomalies.some((a) => a.code === 'bad-location' || a.code === 'missing-f7');
      const otherAnom = anomalies.filter((a) => a.code !== 'bad-location' && a.code !== 'missing-f7');
      if (otherAnom.length) report.warnings.push({ name: where0, items: otherAnom.map((a) => a.text) });
      if (foreign.length) report.foreign.push({ name: where0, kind: foreign[0].foreign, why: FOREIGN[foreign[0].foreign], count: foreign.length, names: foreign.map((r) => r.name).filter(Boolean) });
      if (!messages.length) { report.unknown.push({ name: where0, why: 'Sin mensajes SysEx' }); return; }
      parsed.forEach((r, i) => {
        if (r.kind === 'foreign') return;
        if (r.kind !== 'patch' || !r.payload) { report.unknown.push({ name: where0, why: (r.kind === 'dump-request' ? 'Petición de volcado (no contiene patch)' : r.problems.join('; ')) + (messages.length > 1 ? ` · mensaje ${i + 1}` : '') }); return; }
        if (r.problems.length) report.warnings.push({ name: where0, items: r.problems.map((x) => (messages.length > 1 ? `mensaje ${i + 1}: ` : '') + x) });
        const fp = fingerprints(r.payload);
        const dup = payloadIdx.get(fp.payload);
        const where = where0 + (messages.length > 1 ? ` #${i + 1}` : '');
        if (dup) { (dup.alsoFoundIn ||= []).push(where); if (!touched.includes(dup)) touched.push(dup); report.duplicatesPatch.push({ name: where, existing: dup.name }); return; }
        const p = {
          id: uid(), kind: 'original', fileId: file.id, msgIndex: i, msgOffset: messages[i].offset, payload: r.payload,
          header: { product: r.product, command: r.command, location: r.location, format: r.format }, fp,
          name: readName(r.payload).name || name.replace(/\.[^.]+$/, ''), fileName: name, folderPath: path || '', bankName: pack?.name || (zipName ? zipName.replace(/\.zip$/i, '') : ''),
          bankSlot: pack ? r.location : file.isBank ? r.location : null, importedAt: now(), modifiedAt: now(), parentId: null, alsoFoundIn: [], meta: newMeta()
        };
        if (r.product === 0x60) p.meta.tags.push('Circuit original');
        if (repairedHere) { p.repaired = messages[i].repairs.slice(); report.repaired++; }
        payloadIdx.set(fp.payload, p); newPatches.push(p); file.patchIds.push(p.id); report.patches++;
      });
    };
    for (const inp of inputs) {
      processed++; onProgress?.(processed, inputs.length, inp.name);
      try {
        if (/(^|\/)(__MACOSX|\._)/.test((inp.path ? inp.path + '/' : '') + inp.name)) continue;
        if (inp.headOnly) { const why = sniffHead(inp.bytes, inp.name); if (why) report.foreign.push({ name: (inp.path ? inp.path + '/' : '') + inp.name, kind: 'components', why, count: 1, size: inp.size, names: [] }); else report.skipped.push({ name: inp.name, why: `Demasiado grande (${(inp.size / 1048576).toFixed(1)} MB) para ser un archivo de patches` }); continue; }
        if (/\.circuittrackspack$/i.test(inp.name)) {
          // Pack de Components (ZIP). Solo se leen patches/*.syx e index.json; samples y proyectos se ignoran.
          const z = await readZip(inp.bytes, (p) => /^patches\/[^/]+\.syx$/i.test(p) || p === 'index.json');
          report.errors.push(...z.errors.map((e) => `${inp.name}: ${e}`));
          let idx = null; const ie = z.entries.find((e) => e.path === 'index.json');
          if (ie) try { idx = JSON.parse(new TextDecoder().decode(ie.bytes)); } catch { report.warnings.push({ name: inp.name, items: ['index.json ilegible'] }); }
          const pack = { name: String(idx?.name || inp.name.replace(/\.circuittrackspack$/i, '')).slice(0, 80), product: idx?.product || null };
          const before = report.patches;
          const ents = z.entries.filter((e) => e !== ie).sort((a, b) => (parseInt(a.path.match(/\d+/)) || 0) - (parseInt(b.path.match(/\d+/)) || 0));
          for (const e of ents) await handleSyx(e.path.split('/').pop(), [inp.path, pack.name].filter(Boolean).join('/'), e.bytes, inp.name, pack);
          report.packs.push({ name: inp.name, pack: pack.name, product: pack.product, patches: report.patches - before, entries: ents.length });
        } else if (/\.circuitpack$/i.test(inp.name)) {
          report.foreign.push({ name: (inp.path ? inp.path + '/' : '') + inp.name, kind: 'components', why: 'Pack del Circuit original (.circuitpack): formato propio de Components. Para usar sus patches, ábrelo en Components y exporta cada patch como .syx', count: 1, names: [] });
        } else if (/\.zip$/i.test(inp.name)) {
          const z = await readZip(inp.bytes, (p) => /\.(syx|sysex)$/i.test(p) && !/(^|\/)(__MACOSX|\._)/.test(p));
          report.errors.push(...z.errors.map((e) => `${inp.name}: ${e}`));
          report.skipped.push(...z.skipped.filter((s) => !/no importable/.test(s.why)).map((s) => ({ name: `${inp.name}/${s.path}`, why: s.why })));
          const ignored = z.skipped.filter((s) => /no importable/.test(s.why)).length;
          if (ignored) report.skipped.push({ name: inp.name, why: `${ignored} archivo(s) que no son .syx ignorados` });
          for (const e of z.entries) { const parts = e.path.split('/'); const fname = parts.pop(); await handleSyx(fname, [inp.path, inp.name.replace(/\.zip$/i, ''), ...parts].filter(Boolean).join('/'), e.bytes, inp.name); }
        } else if (/\.(syx|sysex|bin)$/i.test(inp.name)) await handleSyx(inp.name, inp.path, inp.bytes);
        else report.skipped.push({ name: inp.name, why: 'Extensión no admitida' });
      } catch (e) { report.errors.push(`${inp.name}: ${e.message}`); }
    }
    report.groups = groupReport(report);
    // Propuesta de clasificación inicial (no se aplica: queda como «propuesta»).
    this.files.push(...newFiles); this.patches.push(...newPatches);
    await this.store.putMany('files', newFiles);
    await this.store.putMany('patches', [...newPatches, ...touched]);
    if (newPatches.length) await this.log('import', newPatches.map((p) => p.id), null, null, `${newPatches.length} patches importados`);
    this.emit();
    return report;
  }

  // ---------- Metadatos e historial ----------
  async log(op, ids, before, after, text, undoable = false) {
    const h = { id: uid(), at: now(), op, ids, before, after, text, undoable };
    this.history.push(h); await this.store.putMany('history', [h]); return h;
  }
  // changes: objeto parcial de meta; registra estado previo para poder deshacer.
  async updateMeta(ids, changes, text, extra = {}) {
    // v3.10: carpeta, etiquetas, valoración, notas… son del sonido: se escriben en el original y en todas sus variantes.
    // Los valores calculados (funciones) se calculan con el patch indicado y se copian a los demás de su sonido.
    const src = new Map();
    if (Object.keys(changes).some((k) => !VERSION_KEYS.has(k))) { for (const id of ids) for (const m of this.groupIds(id)) if (!src.has(m)) src.set(m, id); ids = [...src.keys()]; }
    const before = {}, after = {}; const list = ids.map((id) => this.byId(id)).filter(Boolean);
    const vals = new Map(); // id del patch indicado → valores calculados una vez
    for (const p of list) {
      before[p.id] = {}; after[p.id] = {};
      const base = (src.has(p.id) && this.byId(src.get(p.id))) || p;
      if (!vals.has(base.id)) vals.set(base.id, Object.fromEntries(Object.keys(changes).map((k) => [k, typeof changes[k] === 'function' ? changes[k](base) : changes[k]])));
      for (const k of Object.keys(changes)) { before[p.id][k] = structuredClone(p.meta[k]); const val = vals.get(base.id)[k]; p.meta[k] = structuredClone(val); after[p.id][k] = structuredClone(val); }
      p.modifiedAt = now();
    }
    await this.store.putMany('patches', list);
    const h = await this.log(extra.op || 'meta', list.map((p) => p.id), before, after, text || 'Metadatos actualizados', true);
    if (extra.predicted) { h.predicted = extra.predicted; h.action = extra.action; h.final = extra.final; await this.store.putMany('history', [h]); }
    this.emit(); return h;
  }
  async undo(historyId) {
    const h = this.history.find((x) => x.id === historyId);
    if (!h || !h.undoable || h.undone) throw new Error('Esta operación no se puede deshacer');
    if (h.op === 'variant') { await this.deletePatches(h.ids, true); }
    else if (h.op === 'delete') { if (!h.before?.patches) throw new Error('La papelera ya se vació'); await this.restoreDeleted(h); }
    else if (h.op === 'versions') {
      const back = h.before.patches.map((p) => structuredClone(p)), ids = new Set(back.map((p) => p.id));
      this.patches = [...this.patches.filter((p) => !ids.has(p.id)), ...back];
      this.banks = structuredClone(h.before.banks); this.collections = structuredClone(h.before.collections);
      await this.store.putMany('patches', back); await this.store.putMany('banks', this.banks); await this.store.putMany('collections', this.collections);
    }
    else if (h.op === 'edit') {
      const p = this.byId(h.ids[0]); if (!p) throw new Error('La variante ya no existe');
      const pl = new Uint8Array(p.payload); for (const [o, v] of Object.entries(h.before.bytes)) pl[+o] = v;
      if (p.diff) { const d = new Map(p.diff.map(([o, x]) => [+o, x])); for (const o of Object.keys(h.before.bytes)) d.set(+o, pl[+o]); p.diff = [...d].sort((a, b) => a[0] - b[0]); }
      p.payload = pl; p.fp = fingerprints(pl); p.modifiedAt = now(); await this.store.putMany('patches', [p]);
    }
    else {
      const list = h.ids.map((id) => this.byId(id)).filter(Boolean);
      for (const p of list) Object.assign(p.meta, structuredClone(h.before[p.id] || {}));
      await this.store.putMany('patches', list);
    }
    h.undone = true; await this.store.putMany('history', [h]);
    await this.log('revert', h.ids, null, null, 'Deshecho: ' + h.text);
    this.emit();
  }

  // ---------- Clasificación: aceptar / corregir / rechazar ----------
  async acceptClassification(ids) {
    const items = ids.map((id) => this.byId(id)).filter(Boolean).map((p) => ({ p, c: this.info(p).cls })).filter((x) => x.c.category);
    const chg = {}; const preds = {};
    for (const { p, c } of items) { chg[p.id] = c; preds[p.id] = { category: c.category, certainty: c.certainty }; }
    if (!items.length) return null;
    return this.updateMeta(items.map((x) => x.p.id), {
      category: (p) => chg[p.id].category, subtype: (p) => chg[p.id].subtype,
      usage: (p) => [...new Set([...(p.meta.usage || []), ...chg[p.id].usage])],
      descriptors: (p) => [...new Set([...(p.meta.descriptors || []), ...chg[p.id].descriptors.filter((d) => d.declared).map((d) => d.label)])],
      classStatus: 'accepted', classAt: now()
    }, `Clasificación aceptada en ${items.length} patch(es)`, { op: 'classify', predicted: preds, action: 'accept' });
  }
  // ---------- Carpetas y subcarpetas (taxonomía editable) ----------
  get tax() { return taxonomy(this.settings.subfolders || {}); }
  subLabel(cat, sub) { return subLabelOf(this.tax, cat, sub); }
  async saveTax(cat, list) { const all = { ...(this.settings.subfolders || {}) }; all[cat] = list; await this.setSetting('subfolders', all); }
  async addSubfolder(cat, label) {
    const name = String(label || '').trim().slice(0, 40); if (!cat || !name) return null;
    const list = this.tax[cat], hit = list.find((x) => x.label.toLowerCase() === name.toLowerCase()); if (hit) return hit.id;
    const base = name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sub';
    let id = 'u-' + base, k = 2; while (list.some((x) => x.id === id)) id = `u-${base}-${k++}`;
    await this.saveTax(cat, [...list, { id, label: name }]); return id;
  }
  async renameSubfolder(cat, id, label) { const name = String(label || '').trim().slice(0, 40); if (!name) return; await this.saveTax(cat, this.tax[cat].map((x) => (x.id === id ? { ...x, label: name } : x))); }
  async moveSubfolder(cat, id, d) { const list = this.tax[cat], i = list.findIndex((x) => x.id === id), j = i + d; if (i < 0 || j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; await this.saveTax(cat, list); }
  async removeSubfolder(cat, id) {
    const users = this.patches.filter((p) => p.meta.category === cat && p.meta.subtype === id).map((p) => p.id);
    if (users.length) await this.updateMeta(users, { subtype: null }, `Subcarpeta «${this.subLabel(cat, id)}» quitada de ${users.length} patch(es)`);
    await this.saveTax(cat, this.tax[cat].filter((x) => x.id !== id));
    return users.length;
  }
  async resetTax(cat) { const all = { ...(this.settings.subfolders || {}) }; delete all[cat]; await this.setSetting('subfolders', all); }
  // Asigna subcarpeta sin tocar la categoría guardada; si el patch aún no tiene categoría, fija la propuesta (o la indicada).
  async setSubfolder(ids, cat, sub) {
    return this.updateMeta(ids, { category: cat, subtype: sub || null, classStatus: 'manual', classAt: now() }, sub ? `Carpeta: ${cat} / ${this.subLabel(cat, sub)}` : `Carpeta: ${cat}`);
  }
  async addTags(ids, tags, remove = false) {
    const t = tags.map((x) => String(x).trim()).filter(Boolean); if (!t.length) return null;
    return this.updateMeta(ids, { tags: (p) => (remove ? (p.meta.tags || []).filter((x) => !t.includes(x)) : [...new Set([...(p.meta.tags || []), ...t])]) }, remove ? `Etiqueta quitada: ${t.join(', ')}` : `Etiquetas: ${t.join(', ')}`);
  }
  // ---------- Clasificación por parecido (sin audio) ----------
  // Compara los ajustes de un patch con los que ya has clasificado tú y vota entre los más parecidos.
  vecOf(p) { if (!this._vec) this._vec = new Map(); const k = p.fp.payload; let v = this._vec.get(k); if (!v) { v = Float32Array.from(vectorize(p.payload)); this._vec.set(k, v); } return v; }
  nnRefs() {
    const key = this.history.length + '|' + this.patches.length;
    if (this._nn?.key === key) return this._nn;
    const refs = this.patches.filter((p) => p.meta.category && p.meta.category !== 'other' && (p.kind !== 'variant' || this.changeState(p) === 'adopted')).map((p) => ({ id: p.id, root: p.rootId || p.id, cat: p.meta.category, sub: p.meta.subtype || null, v: this.vecOf(p) }));
    return (this._nn = { key, refs });
  }
  neighbourGuess(p, k = 7) {
    const { refs } = this.nnRefs(); if (refs.length < 8) return null;
    const v = this.vecOf(p), root = p.rootId || p.id, best = [];
    for (const r of refs) {
      if (r.id === p.id || r.root === root) continue;
      let d = 0; for (let i = 0; i < v.length; i++) { const x = v[i] - r.v[i]; d += x * x; }
      if (best.length < k || d < best[best.length - 1].d) { best.push({ r, d }); best.sort((a, b) => a.d - b.d); if (best.length > k) best.pop(); }
    }
    if (!best.length) return null;
    const w = {}, n = {}; let tot = 0;
    for (const { r, d } of best) { const x = 1 / (Math.sqrt(d) + 0.25); w[r.cat] = (w[r.cat] || 0) + x; n[r.cat] = (n[r.cat] || 0) + 1; tot += x; }
    const [cat, cw] = Object.entries(w).sort((a, b) => b[1] - a[1])[0];
    const subs = {}; for (const { r } of best) if (r.cat === cat && r.sub) subs[r.sub] = (subs[r.sub] || 0) + 1;
    const sb = Object.entries(subs).sort((a, b) => b[1] - a[1])[0];
    return { cat, share: Math.round((cw / tot) * 100) / 100, n: n[cat], k: best.length, sub: sb && sb[1] >= 2 ? sb[0] : null, ids: best.filter((x) => x.r.cat === cat).map((x) => x.r.id), exact: best[0].d < 1e-6 && best[0].r.cat === cat };
  }
  // Reanálisis de toda la biblioteca: vuelve a clasificar con tus reglas y subcarpetas actuales y prepara cambios para revisar.
  async reanalyze({ nnMin = 0.7, progress } = {}) {
    this._cache.clear(); this._nn = null;
    const RANK = { manual: 5, corroborated: 4, textual: 3, technical: 2, ambiguous: 1, none: 0 };
    const live = this.patches.filter((p) => { const st = this.changeState(p); return st === 'original' || st === 'adopted'; }).filter((p) => p.meta.review !== 'discard');
    const out = { cat: [], nn: [], sub: [], tags: [], conflict: [], none: [], weak: [], total: live.length, at: Date.now() };
    for (let i = 0; i < live.length; i++) {
      const p = live[i], m = p.meta, c = this.info(p).cls;
      if (i % 120 === 0) { progress?.(i, live.length); await new Promise((r) => setTimeout(r, 0)); }
      if (!m.category) {
        if (c.category && RANK[c.certainty] >= 3) out.cat.push({ id: p.id, to: c.category, sub: c.subtype || null, why: c.basis?.join(' + ') || c.certainty, certainty: c.certainty });
        else {
          const g = this.neighbourGuess(p);
          if (g && g.share >= nnMin && g.n >= 3) out.nn.push({ id: p.id, to: g.cat, sub: g.sub, why: `${g.n} de ${g.k} parecidos`, share: g.share, alt: c.category || null });
          else if (c.category || c.candidates) out.weak.push({ id: p.id, to: c.category || c.candidates[0], why: c.certainty, nn: g });
          else out.none.push({ id: p.id, nn: g });
        }
      } else {
        if (!m.subtype && c.category === m.category && c.subtype) out.sub.push({ id: p.id, to: m.category, sub: c.subtype, why: c.subBasis?.from === 'text' ? 'nombre' : 'ajustes' });
        else if (!m.subtype) { const g = this.neighbourGuess(p); if (g && g.cat === m.category && g.sub && g.n >= 4) out.sub.push({ id: p.id, to: m.category, sub: g.sub, why: `${g.n} parecidos` }); }
        if (c.category && c.category !== m.category && RANK[c.certainty] >= 4) out.conflict.push({ id: p.id, from: m.category, to: c.category, why: 'nombre y carpeta' });
        else { const g = this.neighbourGuess(p); if (g && g.cat !== m.category && g.share >= 0.85 && g.n >= 5) out.conflict.push({ id: p.id, from: m.category, to: g.cat, why: `${g.n} de ${g.k} parecidos` }); }
      }
      const have = new Set(m.tags || []);
      const fx = this.fxOf(p).map((x) => x.t).filter((t) => !have.has(t));
      const ch = c.descriptors.filter((d) => !d.declared).map((d) => d.label).filter((t) => !have.has(t));
      const nm = c.descriptors.filter((d) => d.declared).map((d) => d.label).filter((t) => !have.has(t));
      if (fx.length || ch.length || nm.length) out.tags.push({ id: p.id, fx, ch, nm });
    }
    progress?.(live.length, live.length);
    return out;
  }
  async applyReanalysis(rep, opts) {
    const done = [];
    const catItems = [...(opts.cat ? rep.cat : []), ...(opts.nn ? rep.nn : [])];
    if (catItems.length) { const by = new Map(catItems.map((x) => [x.id, x])); await this.updateMeta([...by.keys()], { category: (p) => by.get(p.id).to, subtype: (p) => (opts.sub ? by.get(p.id).sub : null), classStatus: 'accepted', classAt: now() }, `Reanálisis: categoría en ${by.size} patch(es)`); done.push(`${by.size} categorías`); }
    if (opts.sub && rep.sub.length) { const by = new Map(rep.sub.map((x) => [x.id, x])); await this.updateMeta([...by.keys()], { subtype: (p) => by.get(p.id).sub }, `Reanálisis: subcarpeta en ${by.size} patch(es)`); done.push(`${by.size} subcarpetas`); }
    const tagItems = rep.tags.map((x) => ({ id: x.id, t: [...(opts.fx ? x.fx : []), ...(opts.ch ? x.ch : []), ...(opts.nm ? x.nm : [])] })).filter((x) => x.t.length);
    if (tagItems.length) { const by = new Map(tagItems.map((x) => [x.id, x.t])); await this.updateMeta([...by.keys()], { tags: (p) => [...new Set([...(p.meta.tags || []), ...by.get(p.id)])] }, `Reanálisis: etiquetas en ${by.size} patch(es)`); done.push(`etiquetas en ${by.size}`); }
    this._nn = null;
    return done;
  }
  // Palabras del nombre (para filtrar) y efectos detectados (para etiquetar)
  wordsOf(p) { const k = p.name + '|' + p.fileName; if (!this._words) this._words = new Map(); const c = this._words.get(p.id); if (c && c.k === k) return c.w; const w = nameWords(p.name, p.fileName); this._words.set(p.id, { k, w }); return w; }
  wordIndex(list = this.faces()) { const n = new Map(); for (const p of list) for (const w of this.wordsOf(p)) n.set(w, (n.get(w) || 0) + 1); return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); }
  fxOf(p) { return fxTags([p.name, p.fileName], this.info(p).an); }
  get tagPalette() { return Array.isArray(this.settings.tagPalette) ? this.settings.tagPalette : TAG_PALETTE; }
  allTags() { const n = new Map(); for (const p of this.faces()) for (const t of p.meta.tags || []) n.set(t, (n.get(t) || 0) + 1); return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); }

  async setCategory(ids, category, subtype = null) {
    const preds = {}; for (const id of ids) { const p = this.byId(id); if (p) { const c = this.info(p).cls; preds[id] = { category: c.category, certainty: c.certainty }; } }
    const h = await this.updateMeta(ids, { category, subtype, classStatus: 'manual', classAt: now() }, `Categoría fijada a ${category}${subtype ? ' / ' + subtype : ''}`, { op: 'classify', predicted: preds, action: 'correct', final: category });
    const p = this.byId(ids[0]);
    return { history: h, suggestions: p ? suggestRules(this.info(p).cls, category, p) : [] };
  }
  async rejectClassification(ids) {
    const preds = {}; for (const id of ids) { const p = this.byId(id); if (p) { const c = this.info(p).cls; preds[id] = { category: c.category, certainty: c.certainty }; } }
    return this.updateMeta(ids, { classStatus: 'rejected', classAt: now() }, 'Propuesta rechazada', { op: 'classify', predicted: preds, action: 'reject' });
  }
  decisions() {
    const out = [];
    for (const h of this.history) if (h.op === 'classify' && h.predicted && !h.undone) for (const id of h.ids) out.push({ id, predicted: h.predicted[id], action: h.action, final: h.final ?? h.after?.[id]?.category });
    return out;
  }
  async addRule(rule) { const r = { id: uid(), enabled: true, createdAt: now(), ...rule }; this.rules.push(r); await this.store.putMany('rules', [r]); this.rulesVersion = (this.rulesVersion || 0) + 1; await this.log('rule', [], null, r, `Regla añadida: ${r.type} «${r.pattern}» → ${r.category}`); this.emit(); return r; }
  async toggleRule(id, enabled) { const r = this.rules.find((x) => x.id === id); if (!r) return; r.enabled = enabled; await this.store.putMany('rules', [r]); this.rulesVersion = (this.rulesVersion || 0) + 1; this.emit(); }
  async deleteRule(id) { this.rules = this.rules.filter((x) => x.id !== id); await this.store.delete('rules', [id]); this.rulesVersion = (this.rulesVersion || 0) + 1; await this.log('rule', [], null, null, 'Regla eliminada'); this.emit(); }

  // ---------- Variantes (nunca modifican el original) ----------
  // opts.adopted: nace como la versión del sonido (ediciones directas); si no, es una propuesta pendiente.
  async createVariant(parentId, payload, op, description, nameSuffix = '', opts = {}) {
    const parent = this.byId(parentId); if (!parent) throw new Error('Patch de origen no encontrado');
    if (!(payload instanceof Uint8Array) || payload.length !== 340 || payload.some((b) => b > 127)) throw new Error('Carga inválida');
    let pl = new Uint8Array(payload);
    if (nameSuffix) pl.set(encodeName((readName(pl).name + nameSuffix).slice(0, 16)), 0);
    const v = { ...structuredClone({ ...parent, payload: undefined, ops: undefined, diff: undefined, copyOf: undefined }), id: uid(), kind: 'variant', parentId, rootId: parent.rootId || parent.id, fileId: null, payload: pl, fp: fingerprints(pl), name: readName(pl).name || parent.name, importedAt: now(), modifiedAt: now(), variantOp: op, variantNote: description, alsoFoundIn: [] };
    v.meta = { ...structuredClone(parent.meta), adopted: !!opts.adopted }; delete v.meta.quickOct;
    v.origin = op; v.originText = description; v.ops = [description]; v.createdAt = now();
    // una propuesta recuerda qué cambia respecto a aquello de lo que salió (para sumarla después a la versión)
    if (!opts.adopted) { v.diff = []; for (let i = 0; i < 340; i++) if (parent.payload[i] !== pl[i]) v.diff.push([i, pl[i]]); }
    this.patches.push(v); await this.store.putMany('patches', [v]);
    await this.log('variant', [v.id], null, { parentId, op }, `Variante creada: ${description}`, true);
    this.emit(); return v;
  }
  async renameVariant(id, name) {
    const p = this.byId(id); if (!p || p.kind !== 'variant') throw new Error('Solo se renombran variantes (el original queda intacto)');
    const pl = new Uint8Array(p.payload); pl.set(encodeName(name), 0); p.payload = pl; p.fp = fingerprints(pl); p.name = readName(pl).name; p.modifiedAt = now();
    await this.store.putMany('patches', [p]); this.emit();
  }
  async editVariantBytes(id, edits, text = 'Edición de parámetros') {
    const p = this.byId(id); if (!p || p.kind !== 'variant') throw new Error('Solo se editan variantes');
    const pl = new Uint8Array(p.payload), before = {};
    for (const [o, v] of edits) { if (o < 0 || o > 339) throw new Error('Offset inválido'); const nv = Math.max(0, Math.min(127, v | 0)); if (pl[o] !== nv) { before[o] = pl[o]; pl[o] = nv; } }
    if (!Object.keys(before).length) return;
    p.payload = pl; p.fp = fingerprints(pl); p.modifiedAt = now();
    if (p.diff) { const d = new Map(p.diff.map(([o, x]) => [+o, x])); for (const o of Object.keys(before)) d.set(+o, pl[+o]); p.diff = [...d].sort((a, b) => a[0] - b[0]); }
    await this.store.putMany('patches', [p]);
    // Cambios seguidos sobre el mismo patch (p. ej. arrastrar un control) se agrupan en una sola entrada.
    const last = this.history.at(-1);
    if (last && last.op === 'edit' && last.ids[0] === id && !last.undone && Date.now() - Date.parse(last.at) < 4000) {
      for (const [o, v] of Object.entries(before)) if (!(o in last.before.bytes)) last.before.bytes[o] = v;
      last.at = now(); await this.store.putMany('history', [last]);
    } else await this.log('edit', [id], { bytes: before }, null, text, true);
    this.emit();
  }
  // Eliminar = a la papelera: el registro del historial guarda los patches enteros, sus huecos en los packs y sus
  // colecciones, así que se puede deshacer (Ctrl+Z o Papelera) hasta que se vacía la papelera (o pasan 30 días).
  async deletePatches(ids, silent = false) {
    const set = new Set(ids);
    const gone = this.patches.filter((p) => set.has(p.id));
    const snap = { patches: gone.map((p) => structuredClone(p)), slots: [], colls: [], orphans: [] };
    for (const b of this.banks) b.slots.forEach((x, i) => { if (set.has(x)) snap.slots.push([b.id, i, x]); });
    for (const c of this.collections) for (const x of c.ids || []) if (set.has(x)) snap.colls.push([c.id, x]);
    const orphans = this.patches.filter((p) => set.has(p.parentId) && !set.has(p.id));
    snap.orphans = orphans.map((o) => [o.id, o.parentId]);
    // Las variantes sobreviven: si queda un antepasado, siguen colgando de él (siguen siendo del mismo sonido, con
    // los cambios que proponían guardados); si no queda ninguno, pasan a ser sonidos independientes.
    for (const o of orphans) {
      let up = this.byId(o.parentId), i = 0; while (up && set.has(up.id) && i++ < 32) up = up.parentId ? this.byId(up.parentId) : null;
      if (up && !set.has(up.id)) { if (!o.diff) o.diff = this.proposalDiff(o); o.parentId = up.id; } else o.parentId = null;
    }
    // v3.10: un pack o una colección guardan sonidos. Si se quita una versión (o una propuesta) y su sonido sigue, el
    // hueco pasa a apuntar al sonido (al exportar va su versión vigente); si se elimina el sonido entero, queda vacío.
    const keep = new Map(); for (const p of gone) { const r = this.rootOf(p); if (r && !set.has(r.id)) keep.set(p.id, r.id); }
    this.patches = this.patches.filter((p) => !set.has(p.id));
    for (const b of this.banks) b.slots = b.slots.map((s) => (set.has(s) ? (keep.has(s) && !b.slots.includes(keep.get(s)) ? keep.get(s) : null) : s));
    for (const c of this.collections) if (c.ids) c.ids = [...new Set(c.ids.map((x) => (set.has(x) ? keep.get(x) : x)).filter(Boolean))];
    await this.store.delete('patches', ids); await this.store.putMany('patches', orphans); await this.store.putMany('banks', this.banks); await this.store.putMany('collections', this.collections);
    if (!silent) await this.log('delete', ids, snap, null, gone.length === 1 ? `«${gone[0].name}» a la papelera` : `${gone.length} patches a la papelera`, true);
    this.emit();
  }
  // Papelera: eliminaciones que todavía se pueden deshacer
  trash() { return this.history.filter((h) => h.op === 'delete' && h.undoable && !h.undone && h.before?.patches?.length).slice().reverse(); }
  trashCount() { return this.trash().reduce((a, h) => a + h.before.patches.length, 0); }
  async restoreDeleted(h) {
    const have = new Set(this.patches.map((p) => p.id)), back = h.before.patches.filter((p) => !have.has(p.id)).map((p) => structuredClone(p));
    this.patches.push(...back);
    const ids = new Set(back.map((p) => p.id)), touchedB = new Set(), touchedC = new Set(), touchedP = [];
    for (const [bid, i, x] of h.before.slots || []) { const b = this.banks.find((y) => y.id === bid); if (b && ids.has(x) && !b.slots[i]) { b.slots[i] = x; touchedB.add(b); } }
    for (const [cid, x] of h.before.colls || []) { const c = this.collections.find((y) => y.id === cid); if (c && ids.has(x) && !c.ids.includes(x)) { c.ids.push(x); touchedC.add(c); } }
    for (const [oid, pid] of h.before.orphans || []) { const o = this.byId(oid); if (o && o.parentId !== pid && ids.has(pid)) { o.parentId = pid; touchedP.push(o); } }
    await this.store.putMany('patches', [...back, ...touchedP]); await this.store.putMany('banks', [...touchedB]); await this.store.putMany('collections', [...touchedC]);
    return back.length;
  }
  // Vaciar: sin vuelta atrás. Deja en el historial solo el texto.
  async emptyTrash(hids = null) {
    const list = this.trash().filter((h) => !hids || hids.includes(h.id));
    for (const h of list) { h.before = null; h.undoable = false; h.purged = true; h.text += ' · eliminado definitivamente'; }
    await this.store.putMany('history', list); this.emit();
    return list.length;
  }
  lastUndoable() { return [...this.history].reverse().find((h) => h.undoable && !h.undone && h.op !== 'revert'); }


  // ---------- Medición acústica y escucha ----------
  async setAcoustic(id, desc, protocol) {
    const p = this.byId(id); if (!p) return;
    p.acoustic = { at: now(), desc, protocol, features: measuredFeatures(desc) };
    await this.store.putMany('patches', [p]);
    await this.log('measure', [id], null, null, 'Medición acústica: ' + (desc.silent ? 'sin señal' : `f0 ${desc.f0 ? desc.f0.toFixed(0) + ' Hz' : '—'}, ataque ${desc.attackMs?.toFixed(0)} ms`));
    this.emit();
  }
  async clearAcoustic(id) { const p = this.byId(id); if (!p) return; delete p.acoustic; await this.store.putMany('patches', [p]); this.emit(); }
  async logAudition(id, note) { const p = this.byId(id); if (!p) return; p.meta.auditions = (p.meta.auditions || 0) + 1; p.meta.lastAudition = now(); await this.store.putMany('patches', [p]); }

  // ---------- Familias, mapa y afinidad (con caché hasta el siguiente cambio) ----------
  families() {
    if (!this._fam) {
      const fams = buildFamilies(this.faces()); // v3.10: entre sonidos (una versión no es «duplicado» de su original)
      const of = new Map(); for (const f of fams) for (const m of f.members) of.set(m.id, f);
      this._fam = { list: fams, of };
    }
    return this._fam;
  }
  map() {
    if (!this._map) {
      const fs = this.faces(), xy = pca2(fs.map((p) => vectorize(p.payload)));
      this._map = new Map(fs.map((p, i) => [p.id, xy[i]]));
    }
    return this._map;
  }
  referenceSet() { const inBanks = new Set(this.banks.flatMap((b) => b.slots).filter(Boolean).map((id) => this.byId(id) ? this.currentVersion(this.rootOf(this.byId(id))).id : id)); return this.faces().filter((p) => p.meta.fav || (p.meta.rating || 0) >= 4 || inBanks.has(p.id)); }
  affinityRanking(limit = 40) {
    const refs = this.referenceSet(), ids = new Set(refs.map((r) => r.id)), rp = refs.map((r) => r.payload);
    if (!rp.length) return [];
    return this.faces().filter((p) => !ids.has(p.id)).map((p) => ({ id: p.id, s: affinity(p.payload, rp) })).sort((a, b) => b.s - a.s).slice(0, limit);
  }

  // ---------- Exportación organizada a una carpeta del disco (File System Access API) ----------
  async exportToDirectory(dir, list, layout = 'category') {
    const safe = (s) => String(s || '').replace(/[^A-Za-z0-9 _\-]+/g, '_').trim().slice(0, 40) || 'Sin nombre';
    const sub = async (h, name) => h.getDirectoryHandle(safe(name), { create: true });
    let n = 0; const used = new Set();
    for (const p of list) {
      const cat = p.meta.category || 'Sin clasificar';
      let h = dir;
      if (layout === 'category') { h = await sub(h, cat); if (p.meta.subtype) h = await sub(h, this.subLabel(p.meta.category, p.meta.subtype) || p.meta.subtype); }
      if (layout === 'folder') for (const part of (p.folderPath || 'Sin carpeta').split('/')) h = await sub(h, part);
      let fname = safe(p.name) + '.syx', k = 2; const keyOf = (f) => (layout + cat + (p.meta.subtype || '') + p.folderPath + f).toLowerCase();
      while (used.has(keyOf(fname))) fname = `${safe(p.name)} (${k++}).syx`;
      used.add(keyOf(fname));
      const fh = await h.getFileHandle(fname, { create: true }), w = await fh.createWritable();
      await w.write(this.exportSyx(p)); await w.close(); n++;
    }
    return n;
  }

  // ---------- Exportación ----------
  exportSyx(p, location = 0) {
    const pl = new Uint8Array(p.payload);
    return buildReplaceCurrent(pl, location, 0x64);
  }
  originalFileBytes(p) { const f = this.fileOf(p); return f ? f.bytes : null; }
  csvReport(ids) {
    const rows = [['id', 'nombre', 'archivo', 'carpeta', 'tipo', 'categoria_usuario', 'subtipo', 'propuesta', 'certeza', 'puntos', 'contradicciones', 'cat_novation', 'gen_novation', 'voz', 'macros_activas', 'revision', 'favorito', 'puntuacion', 'etiquetas', 'notas', 'huella_carga', 'huella_sintesis']];
    for (const p of (ids ? ids.map((id) => this.byId(id)).filter(Boolean) : this.patches)) {
      const i = this.info(p), c = i.cls;
      rows.push([p.id, p.name, p.fileName, p.folderPath, p.kind, p.meta.category || '', p.meta.subtype || '', c.category || (c.candidates || []).join('|'), c.certainty, c.category ? c.scores[c.category] : '', c.contradictions.map((x) => x.text).join(' | '), p.payload[16], p.payload[17], ['mono', 'mono-ag', 'poly'][p.payload[32]] || p.payload[32], i.macros.knobs.filter((k) => k.activeCount).length, p.meta.review, p.meta.fav ? 1 : 0, p.meta.rating, (p.meta.tags || []).join('|'), p.meta.notes, p.fp.payload, p.fp.synth]);
    }
    return '﻿' + rows.map((r) => r.map((v) => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');
  }

  // ---------- Duplicados ----------
  duplicates() { return groupDuplicates(this.faces().map((p) => ({ id: p.id, payload: p.payload, fp: p.fp }))); }

  // ---------- Colecciones ----------
  async saveCollection(c) { const col = { id: c.id || uid(), name: c.name, kind: c.kind || 'manual', ids: c.ids || [], query: c.query || null }; const i = this.collections.findIndex((x) => x.id === col.id); if (i >= 0) this.collections[i] = col; else this.collections.push(col); await this.store.putMany('collections', [col]); this.emit(); return col; }
  async deleteCollection(id) { this.collections = this.collections.filter((c) => c.id !== id); await this.store.delete('collections', [id]); this.emit(); }
  matches(p, q) {
    if (!q) return true;
    const i = this.info(p), m = p.meta;
    const cat = m.category || (q.includeProposals ? i.cls.category : null);
    if (q.text) { const t = q.text.toLowerCase(); const hay = [p.name, p.fileName, p.folderPath, m.notes, ...(m.tags || []), cat || ''].join(' ').toLowerCase(); if (!t.split(/\s+/).every((w) => hay.includes(w))) return false; }
    if (q.category && cat !== q.category) return false;
    if (q.words?.length) { const w = this.wordsOf(p); if (!q.words.every((x) => w.includes(x))) return false; }
    if (q.tags?.length && !q.tags.every((t) => (m.tags || []).includes(t))) return false;
    if (q.subtype) { const sb = m.category ? m.subtype : i.cls.subtype; if (q.subtype === '__none' ? sb : sb !== q.subtype) return false; }
    if (q.uncategorized && m.category) return false;
    if (q.fav && !m.fav) return false;
    if (q.minRating && (m.rating || 0) < q.minRating) return false;
    if (q.review && m.review !== q.review) return false;
    if (q.kind && p.kind !== q.kind) return false;
    if (q.certainty && i.cls.certainty !== q.certainty) return false;
    if (q.contradictions && !i.cls.contradictions.length) return false;
    if (q.integrity && !i.integrity.some((x) => x.level !== 'info')) return false;
    if (q.inactiveMacros && !i.macros.knobs.some((k) => !k.activeCount)) return false;
    if (q.features) for (const f of q.features) if (f.startsWith('m-') ? !p.acoustic?.features?.some((x) => x.id === f) : !hasFeature(i.an, f)) return false;
    if (q.measured === true && !p.acoustic) return false;
    if (q.measured === false && p.acoustic) return false;
    if (q.ids && !q.ids.includes(p.id)) return false;
    if (q.collection) { const c = this.collections.find((x) => x.id === q.collection); if (c && c.kind === 'manual' && !c.ids.includes(p.id)) return false; if (c && c.kind === 'smart' && !this.matches(p, c.query)) return false; }
    if (q.source && !(p.folderPath + '/' + p.bankName).toLowerCase().includes(q.source.toLowerCase())) return false;
    return true;
  }

  // ---------- Bancos (mapa virtual de 128 posiciones) ----------
  async createBank(name) { const b = { id: uid(), name, slots: new Array(128).fill(null), blocks: [], createdAt: now() }; this.banks.push(b); await this.store.putMany('banks', [b]); this.emit(); return b; }
  async saveBank(b) { await this.store.putMany('banks', [b]); this.emit(); }
  async deleteBank(id) { this.banks = this.banks.filter((b) => b.id !== id); await this.store.delete('banks', [id]); this.emit(); }
  bankIssues(b) {
    const out = { gaps: [], dups: [], blockMismatch: [] }; const seen = new Map();
    b.slots.forEach((id, i) => {
      if (!id) { out.gaps.push(i); return; }
      const p = this.byId(id); if (!p) { out.gaps.push(i); return; }
      const k = p.fp.synth; if (seen.has(k)) out.dups.push([seen.get(k), i]); else seen.set(k, i);
      const blk = b.blocks.find((x) => i >= x.from && i <= x.to);
      if (blk?.category) { const cat = p.meta.category || this.info(p).cls.category; if (cat && !(blk.cats || [blk.category]).includes(cat)) out.blockMismatch.push(i); }
    });
    return out;
  }
  // ZIP con 128 .syx numerados (formato single documentado) + mapa CSV/JSON. NO es un .circuittrackspack.
  bankExport(b) {
    const files = [], map = [['posicion', 'pagina', 'nombre', 'archivo_zip', 'categoria', 'id']];
    const safe = (s) => String(s).replace(/[^A-Za-z0-9 _\-]+/g, '_').trim().slice(0, 40) || 'patch';
    b.slots.forEach((id, i) => {
      const p0 = id && this.byId(id), p = p0 && this.currentVersion(p0); // si el original tiene versión aceptada, va esa
      if (!p) { map.push([i + 1, Math.floor(i / 32) + 1, '', '', '', '']); return; }
      const fn = `${String(i + 1).padStart(3, '0')} - ${safe(p.name)}.syx`;
      files.push({ path: `${safe(b.name)}/${fn}`, bytes: this.exportSyx(p) });
      map.push([i + 1, Math.floor(i / 32) + 1, p.name, fn, p.meta.category || '', p.id]);
    });
    const csv = '﻿' + map.map((r) => r.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    files.push({ path: `${safe(b.name)}/_mapa_posiciones.csv`, bytes: new TextEncoder().encode(csv) });
    files.push({ path: `${safe(b.name)}/LEEME.txt`, bytes: new TextEncoder().encode('Mapa virtual de 128 posiciones generado por Circuit Tracks Patch Library / Editor ' + APP_VERSION + '.\r\nCada .syx es un mensaje "Replace Current Patch" (Synth 1) documentado por Novation.\r\nEste ZIP NO es un Pack nativo (.circuittrackspack). Para montar el Pack, abre Novation Components,\r\narrastra cada .syx a la posición indicada en _mapa_posiciones.csv y guarda/envía el Pack desde Components.\r\n') });
    return writeZip(files);
  }

  // ---------- Copias de seguridad ----------
  backupStatus() {
    const last = this.settings.lastBackup || null, lastChange = this.history.at(-1)?.at || null;
    return { last, pending: !!lastChange && (!last || lastChange > last), days: last ? Math.floor((Date.now() - Date.parse(last)) / 86400000) : null };
  }
  async setSetting(id, value) { this.settings[id] = value; await this.store.putMany('settings', [{ id, value }]); this.emit(); }
  // Empezar una biblioteca nueva: borra patches, archivos, variantes, packs, colecciones manuales e historial.
  // Conserva lo que se pida: plantillas, patrones y frases, reglas aprendidas, ajustes del equipo.
  // Las colecciones inteligentes (filtros guardados) se conservan siempre: no contienen patches.
  async resetLibrary({ templates = true, patterns = true, rules = true, device = true } = {}) {
    const before = { patches: this.patches.length, files: this.files.length, banks: this.banks.length };
    for (const s of ['files', 'patches', 'banks', 'history']) await this.store.clear(s);
    const smart = this.collections.filter((c) => c.kind === 'smart');
    await this.store.clear('collections'); if (smart.length) await this.store.putMany('collections', smart);
    if (!rules) { await this.store.clear('rules'); this.rules = []; }
    const keep = new Set(['seeded', ...(templates ? ['templates'] : []), ...(patterns ? ['patterns', 'phrases', 'patternDraft'] : []), ...(device ? ['device', 'audition', 'kbdMidi'] : [])]);
    await this.store.clear('settings');
    const kept = Object.entries(this.settings).filter(([k]) => keep.has(k));
    if (kept.length) await this.store.putMany('settings', kept.map(([id, value]) => ({ id, value })));
    this.settings = Object.fromEntries(kept);
    this.files = []; this.patches = []; this.banks = []; this.history = []; this.collections = smart; this._cache?.clear?.();
    this.emit();
    return before;
  }
  async markBackup() { this.settings.lastBackup = now(); await this.store.putMany('settings', [{ id: 'lastBackup', value: this.settings.lastBackup }]); }
  backupObject() {
    return {
      format: 'ctpl-backup', version: 6, app: APP_VERSION, exportedAt: now(),
      files: this.files.map((f) => ({ ...f, bytes: b64(f.bytes) })),
      patches: this.patches.map((p) => ({ ...p, payload: b64(p.payload) })),
      collections: this.collections, banks: this.banks, rules: this.rules, history: this.history.map((h) => (h.op === 'delete' && h.before ? { ...h, before: null, undoable: false } : h)),
      settings: { templates: this.settings.templates || [], phrases: this.settings.phrases || {}, patterns: this.settings.patterns || [] }
    };
  }
  async restore(obj, mode = 'merge') {
    const rep = { patches: 0, files: 0, skipped: 0, migrated: false, banks: 0 };
    if (obj?.format === 'ct-patch-library-v1') return this.migrateV5(obj, rep);
    if (obj?.format !== 'ctpl-backup') throw new Error('Formato de copia no reconocido');
    const files = (obj.files || []).map((f) => ({ ...f, bytes: unb64(f.bytes) }));
    const patches = (obj.patches || []).map((p) => { const pl = unb64(p.payload); if (pl.length !== 340) throw new Error('Copia dañada: carga de tamaño incorrecto'); return { ...p, payload: pl, fp: fingerprints(pl), meta: { ...newMeta(), ...(p.meta || {}) } }; });
    if (mode === 'replace') { for (const s of STORES) if (s !== 'settings') await this.store.clear(s); this.files = []; this.patches = []; this.collections = []; this.banks = []; this.rules = []; this.history = []; }
    const fileIds = new Set(this.files.map((f) => f.id)), patchIds = new Set(this.patches.map((p) => p.id));
    const nf = files.filter((f) => !fileIds.has(f.id)), np = patches.filter((p) => !patchIds.has(p.id));
    rep.skipped = patches.length - np.length; rep.files = nf.length; rep.patches = np.length;
    this.files.push(...nf); this.patches.push(...np);
    const mergeById = (key, list) => { const ids = new Set(this[key].map((x) => x.id)); const add = (list || []).filter((x) => !ids.has(x.id)); this[key].push(...add); return add; };
    const nc = mergeById('collections', obj.collections), nb = mergeById('banks', obj.banks), nr = mergeById('rules', obj.rules), nh = mergeById('history', obj.history);
    rep.banks = nb.length;
    if (obj.settings) { const t = [...(this.settings.templates || []), ...(obj.settings.templates || []).filter((x) => !(this.settings.templates || []).some((y) => y.id === x.id))]; const ph = { ...(obj.settings.phrases || {}), ...(this.settings.phrases || {}) }; const pts = [...(this.settings.patterns || []), ...(obj.settings.patterns || []).filter((x) => !(this.settings.patterns || []).some((y) => y.id === x.id))]; this.settings.patterns = pts; await this.store.putMany('settings', [{ id: 'patterns', value: pts }]); this.settings.templates = t; this.settings.phrases = ph; await this.store.putMany('settings', [{ id: 'templates', value: t }, { id: 'phrases', value: ph }]); rep.templates = (obj.settings.templates || []).length; }
    await this.store.putMany('files', nf); await this.store.putMany('patches', np); await this.store.putMany('collections', nc); await this.store.putMany('banks', nb); await this.store.putMany('rules', nr); await this.store.putMany('history', nh);
    if (!this.banks.length) await this.createBank('Pack principal');
    const old = this.trash().filter((h) => Date.now() - Date.parse(h.at) > 30 * 864e5); if (old.length) await this.emptyTrash(old.map((h) => h.id));
    await this.log('restore', np.map((p) => p.id), null, null, `Restauración (${mode}): ${np.length} patches`);
    this.emit(); return rep;
  }
  // Migración desde la copia JSON de la v5.x.
  async migrateV5(obj, rep) {
    rep.migrated = true;
    const CAT = { 'Bass': ['bass'], 'Sub Bass': ['bass', 'sub'], 'Lead': ['lead'], 'Arp / Sequence': ['arp'], 'Pluck': ['pluck'], 'Pad': ['pad'], 'Drone': ['drone'], 'Chord / Keys': ['keys'], 'Texture': ['drone'], 'FX / Transition': ['fx'], 'Percussive': ['perc'], 'Acid': ['bass', 'acid'], 'Atmosphere': ['drone'] };
    const idMap = new Map(); const nf = [], np = [];
    const known = new Map(this.patches.map((p) => [p.fp.payload, p]));
    for (const old of obj.patches || []) {
      if (!old?.raw) { rep.skipped++; continue; }
      let pl; try { pl = unb64(old.raw); } catch { rep.skipped++; continue; }
      if (pl.length !== 340 || pl.some((b) => b > 127)) { rep.skipped++; continue; }
      const fp = fingerprints(pl);
      if (known.has(fp.payload)) { idMap.set(old.id, known.get(fp.payload).id); rep.skipped++; continue; }
      const product = old.originalHeader === 0x60 ? 0x60 : 0x64;
      const msg = buildReplaceCurrent(pl, 0, product);
      const f = { id: uid(), sha256: await sha256(msg), name: old.fileName || (old.name + '.syx'), path: old.folderPath || '', size: msg.length, bytes: msg, importedAt: now(), source: 'migrated-v5', reconstructed: true, anomalies: ['Archivo reconstruido desde la copia v5: los bytes de cabecera originales no se conservaron'], patchIds: [] };
      const [cat, sub] = CAT[old.category] || [null, null];
      const meta = { ...newMeta(), category: cat, subtype: sub || null, descriptors: old.character && old.character !== 'Sin clasificar' ? [old.character] : [], tags: String(old.tags || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean), fav: !!old.fav, rating: Number(old.rating) || 0, notes: [old.notes, old.use && old.use !== 'Sin asignar' ? 'Uso v5: ' + old.use : '', old.key ? 'Tonalidad: ' + old.key : ''].filter(Boolean).join('\n'), review: old.listened ? 'listened' : 'pending', classStatus: cat ? 'manual' : 'proposed' };
      const p = { id: uid(), kind: old.parentId ? 'variant' : 'original', fileId: f.id, msgIndex: 0, payload: pl, header: { product, command: 0, location: 0 }, fp, name: old.name || readName(pl).name, fileName: f.name, folderPath: old.folderPath || '', bankName: '', importedAt: old.created || now(), modifiedAt: now(), parentId: null, v5ParentId: old.parentId || null, alsoFoundIn: [], meta, migratedFrom: 'v5' };
      f.patchIds.push(p.id); idMap.set(old.id, p.id); known.set(fp.payload, p); nf.push(f); np.push(p);
    }
    for (const p of np) if (p.v5ParentId && idMap.has(p.v5ParentId)) p.parentId = idMap.get(p.v5ParentId);
    this.files.push(...nf); this.patches.push(...np);
    await this.store.putMany('files', nf); await this.store.putMany('patches', np);
    for (const old of obj.packs || []) {
      if (!Array.isArray(old?.slots)) continue;
      const b = { id: uid(), name: (old.name || 'Pack') + ' (v5)', slots: Array.from({ length: 128 }, (_, i) => idMap.get(old.slots[i]) || null), blocks: [], createdAt: now() };
      this.banks.push(b); await this.store.putMany('banks', [b]); rep.banks++;
    }
    rep.patches = np.length; rep.files = nf.length;
    await this.log('migrate', np.map((p) => p.id), null, null, `Migración v5: ${np.length} patches`);
    this.emit(); return rep;
  }
}
