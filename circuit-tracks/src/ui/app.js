// Circuit Tracks · Patch Library / Editor — interfaz.
// Archivo de interfaz: se empaqueta con el núcleo en un único ámbito (build.mjs).
import { PARAMS, GROUP_LABELS, OSC_WAVES, LFO_WAVES, FILTER_TYPES, MACRO_DESTS, MACRO_GROUP_LABELS, MOD_SOURCES, MOD_DESTS, EVIDENCE, formatValue, approxSeconds, fmtSeconds } from '../core/params.js';
import { CATEGORIES, CAT_LABEL, DESCRIPTORS, CERTAINTY, calibration } from '../core/classify.js';
import { relation, diffParams, groupDiff, nearest, similarity } from '../core/compare.js';
import { PROFILES, profileFit, reorderToProfile, fillEmptyFromProfile, rebuildFromProfile, swapKnobs, setSlot, macroGroupLabel } from '../core/macros.js';
import { writeZip } from '../core/zip.js';
import { Library, IDBStore, MemoryStore, REVIEW, APP_VERSION } from '../core/library.js';
import { CircuitSession, PHRASES, phraseFor, findCircuitPorts } from '../core/midi.js';
import { analyzeRecording, MT } from '../core/acoustic.js';
import { compatibility, COMPAT_LABEL, auditChecks, mood, MOOD_SOURCE, libraryAnalysis } from '../core/analysis.js';
import { buildPack, DEFAULT_LAYOUT } from '../core/packbuilder.js';
import { anatomy } from '../core/anatomy.js';
import { architectureGroups, describeArchitecture, register, registerReport, transposeOctaves, transposeSemitones, pitchInfo, describePitch, fmtSemis, NOTE_NAMES, ARCH_LEVELS, diskPlan, planManifest, planScope } from '../core/organize.js';
import { extractTemplate, applyTemplate, profileTemplates, templateSummary } from '../core/templates.js';

// ---------- plantillas con escapado por defecto ----------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const raw = (s) => new Raw(s);
const val = (v) => v instanceof Raw ? v.s : Array.isArray(v) ? v.map(val).join('') : v === null || v === undefined || v === false ? '' : esc(v);
const html = (str, ...vals) => raw(str.reduce((a, s, i) => a + s + (i < vals.length ? val(vals[i]) : ''), ''));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const svg = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
const IC = {
  aud: svg('<path d="M4 14v-2a8 8 0 0116 0v2"/><rect x="3" y="14" width="4" height="7"/><rect x="17" y="14" width="4" height="7"/>'),
  lib: svg('<path d="M3 6h7l2 2h9v11H3z"/>'), map: svg('<circle cx="6" cy="8" r="2"/><circle cx="16" cy="6" r="2"/><circle cx="12" cy="16" r="2"/><circle cx="19" cy="17" r="2"/><circle cx="5" cy="18" r="1.5"/>'),
  audit: svg('<path d="M2 12h4l2-6 3 12 3-9 2 3h6"/>'), macros: svg('<circle cx="12" cy="13" r="8"/><path d="M12 13l4-5"/>'),
  banks: svg('<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5"/>'), dev: svg('<rect x="3" y="6" width="18" height="12"/><path d="M7 10h2M7 14h2M12 10h5M12 14h5"/>'),
  data: svg('<path d="M12 15V3M7 8l5-5 5 5M4 14v6h16v-6"/>'), tag: svg('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>'), search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
  heart: svg('<path d="M12 20s-8-5-8-11a4 4 0 018-1 4 4 0 018 1c0 6-8 11-8 11z"/>'), dup: svg('<rect x="8" y="8" width="12" height="12"/><path d="M4 16V4h12"/>'),
  play: svg('<path d="M7 4l13 8-13 8z"/>'), stop: svg('<rect x="6" y="6" width="12" height="12"/>'), lockOn: svg('<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V7a4 4 0 018 0v4"/>'), lockOff: svg('<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V7a4 4 0 017.5-2"/>'), grid: svg('<rect x="4" y="4" width="4" height="4"/><rect x="10" y="4" width="4" height="4"/><rect x="16" y="4" width="4" height="4"/><rect x="4" y="10" width="4" height="4"/><rect x="10" y="10" width="4" height="4"/><rect x="16" y="10" width="4" height="4"/><rect x="4" y="16" width="4" height="4"/><rect x="10" y="16" width="4" height="4"/><rect x="16" y="16" width="4" height="4"/>'), grid2: svg('<circle cx="7" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="3"/>'), warnS: svg('<path d="M12 3l10 18H2zM12 10v5M12 18v.5"/>'), stop: svg('<rect x="6" y="6" width="12" height="12"/>'), mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>'),
  imp: svg('<path d="M12 3v12M7 10l5 5 5-5M4 14v6h16v-6"/>'), back: svg('<path d="M15 5l-7 7 7 7"/>'), save: svg('<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5"/>'),
  cloud: svg('<path d="M7 18h11a4 4 0 000-8 6 6 0 00-11-1 4.5 4.5 0 000 9z"/>'), norm: svg('<path d="M20 12a8 8 0 01-14 5M4 12a8 8 0 0114-5M18 3v4h-4M6 21v-4h4"/>'),
  warn: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l10 18H2zM12 10v5M12 18v.5"/></svg>',
  inf: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.5"/></svg>',
  okc: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>'
};
const WAVE_ICON = (w) => {
  const d = w === 0 || w === 14 ? 'M1 8 Q5 0 9 8 T17 8 T25 8 T33 8' : w === 1 ? 'M1 8 L5 2 L13 14 L21 2 L29 14 L33 8' : w === 13 || w === 12 || w === 15 ? 'M1 12 V3 H9 V13 H17 V3 H25 V13 H33' : w <= 11 ? 'M1 13 L9 3 V13 L17 3 V13 L25 3 V13 L33 3' : 'M1 9 L4 3 L7 12 L10 5 L14 13 L18 2 L22 11 L26 4 L30 12 L33 7';
  return `<svg viewBox="0 0 34 16"><path d="${d}"/></svg>`;
};
// Teclas de decisión en Audición.
const CAT_KEYS = { b: 'bass', l: 'lead', p: 'pad', k: 'keys', c: 'chords', u: 'pluck', s: 'stab', a: 'arp', q: 'sequence', x: 'fx', d: 'drone', t: 'transition', r: 'perc', w: 'brass', g: 'strings', e: 'bell' };
const KEY_OF = Object.fromEntries(Object.entries(CAT_KEYS).map(([k, v]) => [v, k.toUpperCase()]));
// Paleta sobria para el mapa (desaturada; el acento naranja queda para la selección).
const MAP_COLORS = { bass: '#c9a27a', lead: '#9fb7d9', pad: '#a7c9a0', keys: '#c6b3d9', chords: '#c6b3d9', pluck: '#d9cf9f', stab: '#d9b0a7', arp: '#8fc4c4', sequence: '#8fc4c4', fx: '#d99fc0', drone: '#b0b8a0', transition: '#d99fc0', perc: '#c0a0a0', brass: '#d9c09f', strings: '#a0b0c9', bell: '#d9d9a0', none: '#5c5f64' };

// ---------- estado ----------
let lib; let storeKind = 'indexeddb';
const blankQ = () => ({ compat: '', macroIssues: false, text: '', category: '', review: '', source: '', fav: false, certainty: '', kind: '', collection: '', contradictions: false, integrity: false, inactiveMacros: false, includeProposals: true, features: [], measured: undefined, uncategorized: false, words: [], tags: [] });
const S = {
  view: 'library', sel: null, multi: new Set(), q: blankQ(), sort: { by: 'name', dir: 1 }, tab: 'synth', envTab: 0, lfoTab: 0, knob: 0, profile: 'techno',
  cmpB: '', bank: null, page: 0, slotSel: -1, bankPick: '', rows: [], rowsKey: '', editParams: false, version: 0, families: true, openFam: new Set(),
  autoSeed: {}, autoCache: null, queue: [], qi: 0, qsrc: 'pending', autoPlay: true, autoNext: true, phrase: 'auto', playing: false,
  dev: { access: null, session: null, outId: '', inId: '', synth: 0, tempo: 124, root: 0, audioId: '', measureNote: 48, stream: null, ctx: null, level: 0, channels: [0, 1], chMidi: [2, 3], chDrum: 9, patchDelay: 80 },
  mapColor: 'category', mapHidden: new Set(), mapHover: null, strip: true, customPhrases: {}, followClock: true, capturing: false, groupBy: 'family', ctab: 'anatomy', block: null, hoverRoute: null, orgTab: 'rean', openGroups: new Set(), regCat: 'bass', regFixMode: 'full', regTune: false, regShow: 'off', archLevel: 'engine-fx', verifying: false, regMethod: 'osc', regTarget: '', plan: { layout: 'category', naming: '{cat} - {name}', duplicates: 'folder', variants: 'family', scope: 'all' }, tplSel: '', tplMode: 'replace', live: false, templates: [], gsearch: ''
};
const toast = (msg, ms = 3200) => { document.querySelectorAll('.toast').forEach((x) => x.remove()); const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), ms); };
// Aviso con un botón (Deshacer): dura más y no se lleva el foco
const toastAct = (msg, label, fn, ms = 8000) => { document.querySelectorAll('.toast').forEach((x) => x.remove()); const t = document.createElement('div'); t.className = 'toast act'; const sp = document.createElement('span'); sp.textContent = msg; const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', () => { t.remove(); fn(); }); t.append(sp, b); document.body.append(t); setTimeout(() => t.remove(), ms); };
const LT = '<'; // la tecla «<» (se escribe aparte para que la traducción no la tome por HTML)
// Atajos (la tecla ? los muestra)
const KEYS_HELP = [
  ['Siempre', [['Ctrl K', 'paleta: ir a, hacer o buscar un patch'], ['Alt ↓ / Alt ↑', 'bajar / subir una octava el patch (Escucha y Biblioteca)'], [`${LT} / Mayús ${LT}`, 'la frase de prueba una octava abajo / arriba (no cambia el patch)'], ['V', 'pegar las etiquetas del portapapeles'], ['Mayús V', 'copiar las etiquetas del patch'], ['.', 'abrir o cerrar «Patch actual»'], ['/', 'buscar'], ['Ctrl Z', 'deshacer lo último (también una eliminación)'], ['?', 'esta ayuda']]],
  ['Escucha', [['Espacio', 'escuchar'], ['Esc', 'parar'], ['← →', 'anterior / siguiente'], ['B L P K C U S A Q X D T R W G E', 'categoría'], ['Intro', 'aceptar la propuesta'], ['1–5', 'valorar'], ['F', 'favorito'], ['M', 'medir'], ['Supr', 'eliminar (a la papelera) y pasar al siguiente'], ['Mayús Supr', 'marcar «Descartar» sin eliminar'], ['Alt 1–9', 'poner o quitar una etiqueta rápida'], ['Mayús 1–8', 'barrer una macro']]],
  ['Biblioteca', [['↑ ↓', 'moverse por la lista'], ['Espacio', 'escuchar'], ['Supr', 'eliminar el patch o la selección (a la papelera)'], ['Alt 1–9', 'etiqueta rápida'], ['G', 'patrón generado: otro'], ['A', 'adjuntar el patrón generado']]],
  ['Organizar · octava', [['Esc', 'volver al plan'], ['1 / 2', 'original / corregido'], ['Intro', 'aceptar'], ['Supr', 'descartar la corrección'], ['K', 'estaba bien'], ['← →', 'anterior / siguiente']]],
];
function showKeys() {
  if (document.querySelector('.modal')) return;
  modal('Atajos de teclado', html`<div class="keyshelp">${KEYS_HELP.map(([g, l]) => html`<div><h4>${g}</h4><dl>${l.map(([k, d]) => html`<dt>${k.split(' ').map((x) => html`<kbd>${x}</kbd>`)}</dt><dd>${d}</dd>`)}</dl></div>`)}</div>`);
}
// Etiquetas rápidas: las 9 primeras de la paleta, con Alt+1…9
const quickTags = () => lib.tagPalette.flatMap((g) => g.tags).slice(0, 9);
function download(name, data, mime = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
const safeFile = (s) => String(s || 'patch').replace(/[^A-Za-z0-9 _\-]+/g, '_').trim().slice(0, 48) || 'patch';
const catName = (id, sub) => { if (!id) return ''; const l = sub && lib.subLabel(id, sub); return l ? `${CAT_LABEL[id] || id} / ${l}` : CAT_LABEL[id] || id; };
// Opciones de carpeta para un desplegable: categoría y sus subcarpetas (valor «cat» o «cat:sub»)
const folderOptions = () => CATEGORIES.map((c) => html`<optgroup label="${c.label}"><option value="${c.id}">${c.label}</option>${lib.tax[c.id].map((x) => html`<option value="${c.id}:${x.id}">${c.label} / ${x.label}</option>`)}</optgroup>`);
const effCat = (p) => p.meta.category || lib.info(p).cls.category || null;

function modal(title, body, buttons = [{ label: 'Cerrar', value: null }]) {
  return new Promise((resolve) => {
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = html`<div role="dialog" aria-modal="true" aria-label="${title}"><h3>${title}</h3><div class="mbody">${body}</div><div class="mfoot">${buttons.map((b, i) => html`<button class="btn ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}" data-i="${i}">${b.label}</button>`)}</div></div>`.s;
    const close = (v) => { m.remove(); resolve(v); };
    m.addEventListener('click', (e) => { if (e.target === m) close(null); const b = e.target.closest('[data-i]'); if (b) { const bt = buttons[+b.dataset.i]; close(typeof bt.value === 'function' ? bt.value(m) : bt.value); } });
    document.body.append(m); m.querySelector('.btn.primary,.btn')?.focus();
  });
}
const confirmBox = (title, text, ok = 'Continuar', danger = false) => modal(title, html`<p>${text}</p>`, [{ label: 'Cancelar', value: false }, { label: ok, value: true, primary: !danger, danger }]);
async function saveSettings() {
  const d = S.dev;
  await lib.store.putMany('settings', [
    { id: 'device', value: { outId: d.outId, inId: d.inId, synth: d.synth, tempo: d.tempo, root: d.root, audioId: d.audioId, measureNote: d.measureNote, channels: d.channels, chMidi: d.chMidi, chDrum: d.chDrum, patchDelay: d.patchDelay, drumKit: d.drumKit } },
    { id: 'audition', value: { autoPlay: S.autoPlay, autoNext: S.autoNext, qsrc: S.qsrc, followClock: S.followClock, strip: S.strip } },
    { id: 'phrases', value: S.customPhrases }, { id: 'templates', value: S.templates }]);
}
const findPattern = (id) => (lib.settings.patterns || []).find((x) => x.id === id);
// Patrón de un patch: el de su sonido (lo comparten el original y su versión).
function patternOf(p) { for (let q = p, i = 0; q && i < 8; q = q.parentId && lib.byId(q.parentId), i++) { const x = q.meta.patternId && findPattern(q.meta.patternId); if (x) return x; } return null; }
// Frases fijas, capturadas o patrones guardados, por clave (el selector de frase de Escucha).
const phraseObj = (k) => (k && k.startsWith?.('pat:') ? (findPattern(k.slice(4)) ? patternToPhrase(findPattern(k.slice(4))) : PHRASES.test) : PHRASES[k] || S.customPhrases[k] || PHRASES.test);
// ---------- Patrón generado para cada sonido (se puede adjuntar si funciona) ----------
// v3.10: es la frase de prueba de toda la herramienta (ver ui/listen_ui.js). Estilo según la subcarpeta o la categoría
// (testStyle); semilla del sonido (su original), así sus versiones suenan con lo mismo; «Otro» la cambia.
function autoStyleFor(p) { const g = phraseGroupOf(p); return testStyle(g.cat, g.sub); }
function autoSeedOf(p) { const r = lib.rootOf(p); let h = 7; for (const ch of String(r.fp?.payload || r.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return (h % 9973) + 1 + (S.autoSeed[r.id] || 0) * 7919; }
function autoPat(p) {
  const r = lib.rootOf(p), style = autoStyleFor(r), g = phraseGroupOf(r), oct = testOctave(style, g.cat, g.sub) + phraseShiftOf(g);
  const key = `${r.id}|${S.autoSeed[r.id] || 0}|${style}|${S.dev.root}|${tempoNow()}|${oct}`;
  if (S.autoCache?.key === key) return S.autoCache.pat;
  const pat = generatePattern({ style, root: S.dev.root || 0, scale: 'minor', steps: 16, tempo: tempoNow(), seed: autoSeedOf(r), octave: oct });
  S.autoCache = { key, pat }; return pat;
}
// Rejilla mínima del patrón (SVG): una barra por nota, altura por tono, opacidad por velocidad
function miniRoll(pt) {
  const N = pt.steps || 16, ns = pt.notes || []; if (!ns.length) return html`<div class="mroll empty">sin notas</div>`;
  const lo = Math.min(...ns.map((x) => x.n)), hi = Math.max(...ns.map((x) => x.n)), span = Math.max(12, hi - lo + 1), H = 44;
  return html`<svg class="mroll" viewBox="0 0 ${N * 10} ${H}" preserveAspectRatio="none" aria-hidden="true">${[...Array(Math.ceil(N / 4)).keys()].map((b) => html`<line x1="${b * 40}" x2="${b * 40}" y1="0" y2="${H}"/>`)}${ns.map((x) => html`<rect x="${x.t * 10 + 0.5}" y="${((hi - x.n) / span) * (H - 4) + 1}" width="${Math.max(2, Math.min(x.d, N - x.t) * 10 - 1)}" height="3" opacity="${(0.45 + (x.v || 100) / 254).toFixed(2)}"/>`)}</svg>`;
}
// Parecido con lo que ya has clasificado: ayuda a decidir sin escuchar
function nnHint(p, compact = false) {
  if (p.meta.category) return '';
  const g = lib.neighbourGuess(p); if (!g || g.share < 0.5) return '';
  return html`<p class="note nnhint" style="margin-top:6px">Se parece a tus <b>${catName(g.cat, g.sub)}</b>: ${g.n} de los ${g.k} más parecidos que ya clasificaste${g.exact ? ' (uno es casi idéntico)' : ''}.${compact ? '' : html` <button class="btn small" data-act="nnUse" data-c="${g.cat}" data-s="${g.sub || ''}">Usar</button>`}</p>`;
}
// Ficha y patch acoplado: la frase de prueba del sonido (la misma que en Escucha).
function inspPattern(p) { return html`<div class="isec">${testBox(p, 'insp')}</div>`; }
async function autoAttach(p) {
  const pt = autoPat(p), name = `${p.name || 'Patch'} · ${STYLES[pt.style]?.label || pt.style}`.slice(0, 60);
  const rec = { ...pt, name, id: 'pat' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), opts: { ...DEFAULTS, style: pt.style, root: pt.root, scale: pt.scale, steps: pt.steps, tempo: pt.tempo, seed: autoSeedOf(p), octave: pt.octave }, savedAt: Date.now(), auto: true };
  await lib.setSetting('patterns', [...(lib.settings.patterns || []), rec]);
  await lib.updateMeta([lib.rootOf(p).id], { patternId: rec.id }, `Patrón «${name}» adjuntado a ${p.name}`);
  return rec;
}
const tempoNow = () => (S.followClock && S.dev.session?.clockTempo()) || S.dev.tempo;
let _la = null;
const LA = () => { if (!_la || _la.v !== S.version + ':' + S.profile) _la = { v: S.version + ':' + S.profile, d: libraryAnalysis(lib, S.profile) }; return _la.d; };
let _cp = null;
const compatOf = (p) => { if (!_cp || _cp.v !== S.version) _cp = { v: S.version, m: new Map() }; let c = _cp.m.get(p.id); if (!c) { c = compatibility(p, lib); _cp.m.set(p.id, c); } return c; };
// ---------- arranque ----------
async function init() {
  let store;
  try { store = await new IDBStore().open(); } catch { store = new MemoryStore(); storeKind = 'memory'; }
  lib = await new Library(store).load();
  lib.listeners.add(() => { S.version++; });
  Object.assign(S.dev, lib.settings.device || {}); Object.assign(S, lib.settings.audition || {}); S.customPhrases = lib.settings.phrases || {}; S.templates = lib.settings.templates || [];
  if (!lib.settings.seeded) {
    for (const s of [
      { name: 'Pendientes de revisión', kind: 'smart', query: { review: 'pending' } },
      { name: 'Bajos mono con envolvente corta', kind: 'smart', query: { category: 'bass', includeProposals: true, features: ['mono', 'short-decay'] } },
      { name: 'Pads con movimiento de LFO', kind: 'smart', query: { category: 'pad', includeProposals: true, features: ['lfo-mod'] } },
      { name: 'Medidos como oscuros', kind: 'smart', query: { features: ['m-dark'] } },
      { name: 'Clasificación contradictoria', kind: 'smart', query: { contradictions: true } }
    ]) await lib.saveCollection(s);
    await store.putMany('settings', [{ id: 'seeded', value: true }]); lib.settings.seeded = true;
  }
  S.bank = lib.banks[0]?.id;
  if (!lib.patches.length || S.view === 'audition' && !S.dev.outId) S.view = 'library';
  buildQueue();
  if (navigator.storage?.persisted) navigator.storage.persisted().then((p) => { S.persisted = p; });
  bindGlobal(); render();
  if (storeKind === 'memory') toast('IndexedDB no disponible: la biblioteca es temporal. Exporta una copia JSON.', 7000);
  if (S.dev.outId && navigator.requestMIDIAccess) connectMidi(true);
}

// ---------- filas de biblioteca ----------
function computeRows() {
  const key = S.version + JSON.stringify(S.q) + JSON.stringify(S.sort) + S.groupBy + [...S.openFam].join() + S.profile;
  if (key === S.rowsKey) return S.rows;
  const q = { ...S.q, features: S.q.features?.length ? S.q.features : undefined };
  let rows = lib.faces().filter((p) => lib.matches(p, q) && (!S.q.compat || compatOf(p).status === S.q.compat) && (!S.q.macroIssues || (() => { const a = lib.info(p).macros; return a.integrity.length || a.shared.length; })()));
  const cmp = { name: (p) => p.name.toLowerCase(), category: (p) => effCat(p) || 'zz', rating: (p) => -(p.meta.rating || 0), imported: (p) => p.importedAt, source: (p) => (p.folderPath || '').toLowerCase() }[S.sort.by] || ((p) => p.name.toLowerCase());
  rows.sort((a, b) => { const x = cmp(a), y = cmp(b); return (x < y ? -1 : x > y ? 1 : 0) * S.sort.dir; });
  let out = [];
  if (S.groupBy === 'family') {
    const { of } = lib.families(), inRows = new Set(rows.map((p) => p.id));
    for (const p of rows) {
      const f = of.get(p.id); if (!f) { out.push({ p }); continue; }
      const visible = f.members.filter((m) => inRows.has(m.id)); if (visible[0].id !== p.id) continue;
      out.push({ p, fam: f, count: visible.length });
      if (S.openFam.has(f.id)) for (const m of visible.slice(1)) out.push({ p: lib.byId(m.id), member: true, rel: m.rel });
    }
  } else if (S.groupBy === 'category' || S.groupBy === 'architecture' || S.groupBy === 'folder') {
    const groups = new Map();
    for (const p of rows) {
      const k = S.groupBy === 'category' ? (effCat(p) ? catName(effCat(p), p.meta.category ? p.meta.subtype : lib.info(p).cls.subtype) : 'Sin categoría') : S.groupBy === 'folder' ? (p.folderPath || 'Sin carpeta') : describeArchitecture(p.payload);
      (groups.get(k) || groups.set(k, []).get(k)).push(p);
    }
    for (const [k, list] of [...groups.entries()].sort((a, b) => S.groupBy === 'architecture' ? b[1].length - a[1].length : a[0].localeCompare(b[0]))) { out.push({ header: true, label: k, count: list.length }); for (const p of list) out.push({ p }); }
  } else out = rows.map((p) => ({ p }));
  S.rows = out; S.rowsAll = rows; S.rowsKey = key; return out;
}
// Todos los patches que cumplen el filtro actual (incluidos los de familias plegadas; sin cabeceras de grupo).
function filteredPatches() { computeRows(); return S.rowsAll || []; }
// ---------- render ----------
const TABS = [['library', 'Biblioteca'], ['audition', 'Escucha'], ['patterns', 'Patrones'], ['songs', 'Canciones'], ['organize', 'Organizar'], ['macros', 'Macros'], ['changes', 'Cambios'], ['analyze', 'Análisis'], ['banks', 'Packs'], ['device', 'Equipo'], ['data', 'Datos']];
function render() {
  // la selección apunta siempre a la versión vigente del sonido (tras editar, aceptar o volver al original)
  if (S.sel) { const f = faceOf(lib.byId(S.sel)); S.sel = f ? f.id : null; }
  if (S.multi.size && [...S.multi].some((id) => faceOf(lib.byId(id))?.id !== id)) S.multi = new Set([...S.multi].map((id) => faceOf(lib.byId(id))?.id).filter(Boolean));
  const app = $('#app'), lib3 = S.view === 'library', d = S.dev.session;
  app.innerHTML = html`
  <header class="top">
    <div class="brand" aria-label="Circuit Tracks · Patch Library"><b class="wm"><span class="wm1">Circuit${raw(__WM__)}</span><span class="wm2">Tracks</span></b><span>Patch Library</span></div>
    <label class="gsearch">${raw(IC.search)}<input id="gsearch" type="search" placeholder="Buscar en la biblioteca: nombre, carpeta, etiqueta…" value="${S.q.text}" aria-label="Buscar"><kbd>/</kbd><button type="button" class="kbtn" data-act="palOpen" title="Acciones (Ctrl K)">Ctrl K</button><button type="button" class="kbtn" data-act="keysHelp" title="Atajos de teclado (?)">?</button></label>
    ${cur() ? html`<button class="curpill ${S.dock && !lib3 ? 'on' : ''}" data-act="dockToggle" title="Patch actual: ábrelo desde cualquier sección (tecla . · Ctrl K para buscar acciones)"><i></i><span>${cur().name}</span></button>` : ''}
    <button class="devpill ${d ? 'on' : ''}" data-act="view" data-v="device" title="Equipo">${raw('<i></i>')}${d ? d.name + (tempoNow() ? ' · ' + tempoNow() + ' BPM' : '') : 'Sin equipo'}</button>
    ${pubLangSwitch('hdr')}
  </header>
  <div class="specline" aria-hidden="true"></div>
  <nav class="tabs-main" aria-label="Secciones">${TABS.map(([id, l], i) => html`<button class="${S.view === id ? 'on' : ''}" data-act="view" data-v="${id}"><small>${String(i + 1).padStart(2, '0')}</small>${l}</button>`)}${(() => { const b = lib.backupStatus(); return lib.patches.length && b.pending && (b.days === null || b.days >= 3) ? html`<button class="count warnbk" data-act="view" data-v="data" title="Tu biblioteca solo vive en este navegador">⚠ ${b.last ? 'Copia: ' + b.days + ' d' : 'Sin copia'}</button>` : ''; })()}${(() => { const n = lib.patches.filter((p) => p.kind === 'variant' && lib.isVersion(p) && lib.changeState(p) === 'draft').length, tidy = versionsPlanNow().sounds.length; return html`${n ? html`<button class="count chgpill" data-act="view" data-v="changes" title="${n} cambio(s) propuesto(s) (octava, macros, plantillas…): escúchalos y aplícalos o descártalos en Cambios">● ${n} ${n === 1 ? 'propuesta' : 'propuestas'}</button>` : ''}${tidy ? html`<button class="count warnbk" data-act="tidyOpen" title="Versiones encadenadas, ramas y copias repetidas de versiones anteriores: ordénalas en un paso (se puede deshacer)">⚠ Ordenar versiones · ${tidy}</button>` : ''}`; })()}<span class="count">${lib.faces().length} patches · ${storeKind === 'indexeddb' ? 'guardado local' : 'memoria temporal'}</span></nav>
  ${lib3 ? html`<main class="main lib ${S.sel && S.mobileOpen ? 'open' : ''}">${renderListPane()}${renderCenter()}${renderInspector()}</main>` : html`<main class="main page ${S.dock && cur() ? 'docked' : ''}" id="full"><div class="page-in">${renderFull()}</div>${S.dock && cur() ? renderDock() : ''}</main>`}
  ${pubFooter()}${pubCompatHTML()}
  <div class="drop" id="drop">Suelta .syx, .zip, carpetas o una copia .json</div>
  <input type="file" id="fileIn" multiple accept=".syx,.sysex,.zip,.json,.bin,.circuittrackspack,.circuitpack" hidden>
  <input type="file" id="dirIn" webkitdirectory multiple hidden>`.s;
  if (lib3) renderRows();
  afterRender();
}
function rerender() { const y = $('#vlist')?.scrollTop, cy = $('.center .pane-b')?.scrollTop, iy = $('.insp .pane-b')?.scrollTop, fy = $('#full')?.scrollTop, ql = $('.ql')?.scrollTop, dy = $('.dock')?.scrollTop, wy = window.scrollY; render(); if ($('.dock') && dy) $('.dock').scrollTop = dy; if (wy) window.scrollTo(0, wy); if ($('#vlist') && y) { $('#vlist').scrollTop = y; renderRows(); } if ($('.center .pane-b') && cy) $('.center .pane-b').scrollTop = cy; if ($('.insp .pane-b') && iy) $('.insp .pane-b').scrollTop = iy; if ($('#full') && fy) $('#full').scrollTop = fy; if ($('.ql') && ql) $('.ql').scrollTop = ql; }
function renderNav() {
  const items = [['audition', 'Escucha', IC.aud], ['library', 'Library', IC.lib], ['analyze', 'Analyze', IC.search], ['audit', 'Audit', IC.audit], ['macros', 'Macros', IC.macros], ['banks', 'Packs', IC.banks], ['device', 'Equipo', IC.dev], ['data', 'Datos', IC.data]];
  return html`<nav class="panel nav" aria-label="Secciones">${items.map(([id, label, ic]) => html`<button class="${S.view === id ? 'on' : ''}" data-act="view" data-v="${id}">${raw(ic)}<span>${label}</span></button>`)}
    <div class="sect">Colecciones</div>
    ${lib.collections.map((c) => html`<button class="col ${S.q.collection === c.id && S.view === 'library' ? 'on' : ''}" data-act="collection" data-id="${c.id}">${c.kind === 'smart' ? '◇ ' : '▪ '}${c.name}<small>${c.kind === 'manual' ? c.ids.length : ''}</small></button>`)}
    <button class="col" data-act="newCollection">+ Guardar filtro actual</button>
    <div class="foot">Circuit Tracks<br>Patch Library<br>/ Analyzer</div><div class="navbc" aria-hidden="true"></div></nav>`;
}
function renderActions() {
  const p = S.sel && lib.byId(S.sel), any = !!(p || S.multi.size);
  return html`<div class="bc" aria-hidden="true"></div>
   <button class="btn" data-act="normalizeModal" ${any ? '' : 'disabled'} title="Proponer macros ordenadas según un perfil (quedan como propuesta en cada sonido)">${raw(IC.norm)}Normalizar macros</button>
   <button class="btn" data-act="autoTagModal" ${lib.patches.length ? '' : 'disabled'} title="Aceptar propuestas en bloque">${raw(IC.tag)}Auto tag</button>
   <button class="btn" data-act="detectDups" ${lib.patches.length ? '' : 'disabled'}>${raw(IC.dup)}Duplicados</button>
   <button class="btn" data-act="buildPackModal" ${lib.patches.length ? '' : 'disabled'}>${raw(IC.banks)}Construir pack</button>
   <button class="btn" data-act="exportSyx" ${p ? '' : 'disabled'}>${raw(IC.data)}Export SYX</button>
   <button class="btn" data-act="backup">${raw(IC.cloud)}Backup JSON</button>`;
}
// ---------- biblioteca: lista ----------
function kpis() {
  const F = lib.faces(), la = LA(), issues = F.filter((p) => { const a = lib.info(p).macros; return a.integrity.length || a.shared.length; }).length, untagged = F.filter((p) => !p.meta.category).length;
  const legacy = F.filter((p) => compatOf(p).status === 'legacy').length;
  const k = (label, n, ic, act, extra = '') => html`<button class="kpi ${extra}" data-act="kpi" data-k="${act}"><span>${label}</span><b>${raw(ic)}${n}</b><i></i></button>`;
  return html`<div class="kpis"><div class="kpititle hf">Analysis<br>summary</div>
    ${k('Total patches', la.N, IC.banks, 'all', S.q.compat || S.q.macroIssues || S.q.uncategorized ? '' : 'on')}${k('Tracks nativos', la.tracks, IC.grid, 'native', S.q.compat === 'native' ? 'on' : '')}${k('Circuit original', legacy, IC.grid2, 'legacy', S.q.compat === 'legacy' ? 'on' : '')}
    ${k('Duplicados', la.dup, IC.dup, 'duplicate', S.q.compat === 'duplicate' ? 'on' : '')}${k('Macros con incidencias', issues, IC.warnS, 'macro', S.q.macroIssues ? 'on' : '')}${k('Sin categoría', untagged, IC.tag, 'untagged', S.q.uncategorized ? 'on' : '')}</div>`;
}
function renderListPane() {
  const q = S.q, rows = computeRows(), n = rows.filter((r) => !r.header).length, selCount = S.multi.size;
  const filtersOn = q.words?.length || q.tags?.length || q.collection || q.features?.length || q.uncategorized || q.ids || q.compat || q.macroIssues || q.category || q.review || q.fav || q.contradictions;
  return html`<section class="pane list"><div class="pane-h" style="flex-direction:column;align-items:stretch;gap:8px">
      <div class="row2"><select class="sel" data-q="category" aria-label="Tipo"><option value="">Todos los tipos</option>${CATEGORIES.filter((c) => c.id !== 'other').map((c) => html`<option value="${c.id}" ${q.category === c.id ? 'selected' : ''}>${c.label}</option>`)}</select>${q.category ? html`<select class="sel" data-q="subtype" aria-label="Subcarpeta"><option value="">Todas las subcarpetas</option>${lib.tax[q.category].map((x) => html`<option value="${x.id}" ${q.subtype === x.id ? 'selected' : ''}>${x.label}</option>`)}<option value="__none" ${q.subtype === '__none' ? 'selected' : ''}>Sin subcarpeta</option></select>` : ''}
        <select class="sel" data-act="groupBy" aria-label="Agrupar"><option value="family" ${S.groupBy === 'family' ? 'selected' : ''}>Agrupar: familias</option><option value="category" ${S.groupBy === 'category' ? 'selected' : ''}>Agrupar: categoría / subcarpeta</option><option value="architecture" ${S.groupBy === 'architecture' ? 'selected' : ''}>Agrupar: arquitectura</option><option value="folder" ${S.groupBy === 'folder' ? 'selected' : ''}>Agrupar: carpeta</option><option value="none" ${S.groupBy === 'none' ? 'selected' : ''}>Sin agrupar</option></select></div>
      <div class="lfilters"><button class="chip ${q.fav ? 'on' : ''}" data-act="toggleFav">★ Favoritos</button><button class="chip ${q.review === 'pending' ? 'on' : ''}" data-act="qset" data-k="review" data-v="pending">Pendientes</button><button class="chip ${q.uncategorized ? 'on' : ''}" data-act="toggleQ" data-k="uncategorized">Sin categoría</button><button class="chip ${q.contradictions ? 'on' : ''}" data-act="toggleQ" data-k="contradictions">Contradicciones</button><button class="chip ${q.compat === 'duplicate' ? 'on' : ''}" data-act="qset" data-k="compat" data-v="duplicate">Duplicados</button><button class="chip ${S.selMode ? 'on' : ''}" data-act="toggleSelMode" title="Tocar para seleccionar varios">☑ Seleccionar</button>
        <select class="sel" data-act="collectionSel" aria-label="Colección" style="height:25px;border-radius:13px;font-size:12px"><option value="">Colecciones…</option>${lib.collections.map((c) => html`<option value="${c.id}" ${q.collection === c.id ? 'selected' : ''}>${c.kind === 'smart' ? '◇ ' : '▪ '}${c.name}</option>`)}<option value="__save">+ Guardar filtro actual</option></select>
        <button class="chip ${S.showWords || q.words?.length || q.tags?.length ? 'on' : ''}" data-act="toggleWords" title="Filtrar por palabras del nombre y por etiquetas">Palabras y etiquetas${q.words?.length || q.tags?.length ? ' · ' + ((q.words?.length || 0) + (q.tags?.length || 0)) : ''}</button>
        ${filtersOn ? html`<button class="chip" data-act="clearFilters">Quitar filtros ✕</button>` : ''}</div>
      ${S.showWords || q.words?.length || q.tags?.length ? wordsBar() : ''}
      <div class="row2"><button class="btn small accent" data-act="import">${raw(IC.imp)}Importar</button><button class="btn small" data-act="importDir">Carpeta</button><span class="sp"></span><select class="sel" data-act="sortSel" style="height:27px;font-size:12px" aria-label="Ordenar">${[['name', 'Nombre'], ['category', 'Tipo'], ['rating', 'Valoración'], ['imported', 'Importación'], ['source', 'Carpeta']].map(([k, l]) => html`<option value="${k}" ${S.sort.by === k ? 'selected' : ''}>↕ ${l}</option>`)}</select></div></div>
    <div class="vlist" id="vlist" tabindex="0" aria-label="Lista de patches">${lib.patches.length ? html`<div class="vinner" id="vinner" style="height:${rows.length * 46}px"></div>` : html`<div class="empty welcome"><h3>Tu biblioteca de patches está vacía</h3>
      <ol class="steps"><li><b>Importa tus patches</b> — archivos .syx, un .zip, una carpeta entera o una copia .json (también la de la v5). O arrástralos aquí.</li><li><b>Escucha y decide</b> — cada patch suena en el Circuit Tracks (solo en la RAM) y una tecla lo clasifica.</li><li><b>Ordénalos y monta packs</b> — carpetas y subcarpetas tuyas, packs de 128 y canciones enteras.</li></ol>
      <p class="note">Nada sale de tu ordenador: no hay cuentas ni servidores.</p>
      <div class="row2" style="justify-content:center"><button class="btn primary" data-act="import">${raw(IC.imp)}Importar archivos</button><button class="btn" data-act="importDir">Carpeta</button></div></div>`}</div>
    <div class="lfoot"><span>${n} de ${lib.faces().length}${selCount ? ` · <b>${selCount}</b> seleccionados` : ''}</span>${selCount ? html`<div class="row2"><button class="btn small" data-act="queueSel">Escuchar</button><button class="btn small" data-act="bulkAccept">Aceptar propuestas</button><select class="sel" data-act="bulkCat" style="height:27px;font-size:12px"><option value="">Carpeta…</option>${folderOptions()}</select><button class="btn small" data-act="bulkTags">Etiquetas…</button><button class="btn small" data-act="bulkAutoAttach" title="Adjunta a cada uno su patrón generado">Patrones</button><select class="sel" data-act="bulkOct" style="height:27px;font-size:12px" aria-label="Transponer"><option value="">Octava…</option>${[-24, -12, 12, 24].map((n) => html`<option value="${n}">${n > 0 ? '+' : '−'}${Math.abs(n) / 12} oct</option>`)}</select><select class="sel" data-act="bulkCollection" style="height:27px;font-size:12px"><option value="">Colección…</option>${lib.collections.filter((c) => c.kind === 'manual').map((c) => html`<option value="${c.id}">${c.name}</option>`)}<option value="__new">+ Nueva</option></select><button class="btn small" data-act="bulkZip">ZIP</button><button class="btn small danger" data-act="bulkDelete">Eliminar</button><button class="btn small" data-act="clearSel">✕</button></div>` : html`<span>${S.selMode ? 'Toca para seleccionar' : 'Mayús+clic o «Seleccionar» para varios'}</span>`}</div></section>`;
}
// Palabras sacadas de los nombres y tus etiquetas, como filtros de un clic (se combinan: todas deben cumplirse)
function wordsBar() {
  const q = S.q, base = lib.faces();
  const idx = lib.wordIndex(base).filter(([w, n]) => n >= 2 || (q.words || []).includes(w)), lim = S.wordsAll ? 160 : 36, tags = lib.allTags();
  const known = (w) => matchText(w).hits.length > 0;
  return html`<div class="wordsbar"><div class="wb-row"><span class="mlabel">Palabras del nombre</span><span class="wb-chips">${idx.slice(0, lim).map(([w, n]) => html`<button class="wq ${(q.words || []).includes(w) ? 'on' : ''} ${known(w) ? 'k' : ''}" data-act="qWord" data-w="${w}" title="${known(w) ? 'La herramienta ya la usa para proponer categoría o subcarpeta' : 'Palabra de tus nombres'}">${w}<small>${n}</small></button>`)}${idx.length > lim || S.wordsAll ? html`<button class="lk" data-act="wordsMore">${S.wordsAll ? 'menos' : `+${idx.length - lim} más`}</button>` : ''}</span></div>
    ${tags.length ? html`<div class="wb-row"><span class="mlabel">Etiquetas</span><span class="wb-chips">${tags.slice(0, 60).map(([t, n]) => html`<button class="wq tg ${(q.tags || []).includes(t) ? 'on' : ''}" data-act="qTag" data-t="${t}">${t}<small>${n}</small></button>`)}</span></div>` : ''}
    ${q.words?.length ? html`<div class="wb-row"><span class="note">${filteredPatches().length} con «${q.words.join(' + ')}» en el nombre:</span><button class="btn small" data-act="wordToTag">Etiquetarlos</button><button class="btn small" data-act="wordsToFolder">Seleccionarlos</button></div>` : ''}</div>`;
}
function sparkBars(vals, ids, act, grad = false) {
  const max = Math.max(1, ...vals);
  return html`<div class="spark">${vals.map((v, i) => html`<span data-act="${act}" data-i="${i}" title="${v}" style="height:${Math.max(4, (v / max) * 100)}%" class="${grad ? 'g' : ''}"></span>`)}</div>`;
}
function analysisStrip() {
  const la = LA(), pct = (x) => (x * 100).toFixed(1).replace('.', ',') + ' %';
  const envMax = Math.max(1, ...la.envBins), pts = la.envBins.map((v, i) => `${i * 25},${40 - (v / envMax) * 36}`).join(' ');
  return html`<div class="strip"><div class="striptitle hf">Library<br>analysis<small>${la.N} patches</small></div>
    <button class="sc" data-act="kpi" data-k="duplicate"><b>Duplicados</b><strong>${la.dup}</strong><small>(${pct(la.dupPct)})</small><div class="bar acc"><i style="width:${la.dupPct * 100}%"></i></div></button>
    <button class="sc" data-act="kpi" data-k="native"><b>Origen</b><strong>${la.tracks} / ${la.legacy}</strong><small>Tracks / Circuit</small></button>
    <div class="sc"><b>Clusters de parámetros</b>${sparkBars(la.clusters.map((c) => c.size), null, 'stripCluster', true)}<small>${la.clusters.length} grupos · pulsa una barra</small></div>
    <div class="sc"><b>Duración amp env</b><svg viewBox="0 0 100 42" preserveAspectRatio="none" class="envspark" data-act="noop"><defs><linearGradient id="sgl" x1="0" x2="1"><stop offset="0" stop-color="#ff7a1a"/><stop offset="1" stop-color="#ff2e86"/></linearGradient></defs><polygon points="0,40 ${pts} 100,40" fill="rgba(255,46,134,.16)"/><polyline points="0,40 ${pts} 100,40" fill="none" stroke="url(#sgl)" stroke-width="1.4"/></svg><div class="binbtns">${la.envLabels.map((l, i) => html`<button data-act="stripEnv" data-i="${i}" title="${la.envBins[i]} patches">${l}</button>`)}</div></div>
    <div class="sc"><b>Brillo estimado</b>${sparkBars(la.briBins, null, 'stripBri', true)}<small>${la.measuredBri ? la.measuredBri + ' medidos, resto por parámetros' : 'por parámetros (estimación)'}</small></div>
    <button class="sc" data-act="kpi" data-k="mono"><b>Voz</b><div class="vbars"><span>Mono</span><div class="bar"><i style="width:${la.N ? la.mono / la.N * 100 : 0}%"></i></div><span>Poly</span><div class="bar"><i style="width:${la.N ? la.poly / la.N * 100 : 0}%"></i></div></div><small>${la.mono} / ${la.poly}</small></button>
    <button class="sc" data-act="view" data-v="macros"><b>Coherencia macros</b><strong>${Math.round(la.consistentPct * 100)} %</strong><small>≥ 6/8 con «${PROFILES[S.profile].title}»</small><div class="bar acc"><i style="width:${la.consistentPct * 100}%"></i></div></button></div>`;
}
const COMPAT_IC = () => ({ native: IC.grid, legacy: IC.grid2, converted: IC.norm, duplicate: IC.dup });
function macroMap(p) {
  const kn = lib.info(p).macros.knobs, fit = profileFit(p.payload, S.profile);
  return html`<span class="mmap" title="Macros con efecto (naranja = coincide con tu perfil)">${kn.map((k, i) => html`<i class="${k.activeCount ? 'a' : ''} ${fit[i].status === 'match' ? 'm' : ''} ${k.slots.some((s) => s.dest > 70) ? 'x' : ''}"></i>`)}</span>`;
}
function renderRows() {
  const vl = $('#vlist'), inner = $('#vinner'); if (!vl || !inner) return;
  const rows = S.rows, top = vl.scrollTop, h = vl.clientHeight || 600;
  const a = Math.max(0, Math.floor(top / 46) - 6), b = Math.min(rows.length, Math.ceil((top + h) / 46) + 6);
  let out = '';
  for (let i = a; i < b; i++) {
    const r = rows[i];
    if (r.header) { out += html`<div class="grp" style="top:${i * 46}px"><b>${r.label}</b>${r.count}</div>`.s; continue; }
    const { p, fam, count, member, rel } = r, inf = lib.info(p), c = inf.cls, m = p.meta, cp = compatOf(p);
    const user = m.category, cat = user || c.category;
    out += html`<div class="row ${S.sel === p.id ? 'picked' : ''} ${member ? 'member' : ''} ${S.multi.has(p.id) ? 'multi' : ''}" style="top:${i * 46}px" data-act="pick" data-id="${p.id}" role="row">
      <button class="star ${m.fav ? 'on' : ''}" data-act="fav" data-id="${p.id}" aria-label="Favorito">${S.multi.has(p.id) ? '☑' : '★'}</button>
      <div class="nm"><b title="${p.name}">${p.name}${fam && count > 1 ? html`<span class="fam" data-act="openFam" data-id="${fam.id}" title="Familia: duplicados y variantes">${S.openFam.has(fam.id) ? '−' : '+'}${count - 1}</span>` : ''}${chgBadge(p)}</b><small>${member && rel ? rel.label : html`${whyTag(c, user)}<span class="where">${p.folderPath || p.fileName}</span>`}</small></div>
      <div class="rt">${cat ? html`<span class="badge ${user ? '' : 'prop'}">${catName(cat, user ? m.subtype : c.subtype)}</span>` : c.candidates ? html`<span class="badge prop">${c.candidates.map((x) => CAT_LABEL[x]).join('/')}</span>` : html`<span class="badge prop">—</span>`}<span class="row2" style="gap:6px"><span class="cmpg ${cp.status}">${cp.status === 'native' ? '✓ ' : ''}${COMPAT_LABEL[cp.status]}</span>${p.acoustic ? html`<span class="cmpg" style="color:var(--ok)">medido</span>` : ''}${macroMap(p)}</span></div></div>`.s;
  }
  inner.innerHTML = out;
}
// ---------- ficha ----------
function renderDetail() {
  const p = S.sel && lib.byId(S.sel);
  if (!p) return html`<div class="empty" style="margin:auto"><h3>Ningún patch seleccionado</h3><p>Selecciona un patch para ver su identidad, síntesis, macros, compatibilidad, etiquetas y auditoría.</p></div>`;
  const inf = lib.info(p), m = p.meta, c = inf.cls, cat = m.category || c.category, md = mood(p, lib);
  const tabs = [['identity', 'Identidad'], ['synth', 'Síntesis'], ['macros', 'Macros'], ['compat', 'Compat.'], ['tags', 'Etiquetas'], ['audit', 'Audit'], ['compare', 'Comparar']];
  if (!tabs.some(([k]) => k === S.tab)) S.tab = 'identity';
  return html`<div class="dhead"><div>
      <button class="btn small mobile-back" data-act="closeDetail">${raw(IC.back)}Lista</button>
      <div class="lbl">PATCH ${lib.changeState(p) === 'adopted' ? '· EDITADO' : p.copyOf ? '· COPIA' : ''}</div><h2>${p.name || '(sin nombre)'}</h2>
      <div class="chips">${cat ? html`<span class="badge ${m.category ? '' : 'prop'}">${catName(cat, m.category ? m.subtype : c.subtype)}</span>` : ''}${md ? html`<span class="badge ${md.source === 'measured' || md.source === 'user' ? '' : 'prop'}" title="${MOOD_SOURCE[md.source]}">${md.label}</span>` : ''}<span class="badge">${COMPAT_LABEL[compatOf(p).status]}</span><span class="badge">${['Mono', 'Mono AG', 'Poly'][p.payload[32]] || '?'}</span></div></div>
    <div><div class="dacts"><span class="stars" role="group" aria-label="Puntuación">${[1, 2, 3, 4, 5].map((n) => html`<span class="${n <= (m.rating || 0) ? 'on' : ''}" data-act="rate" data-n="${n}">★</span>`)}</span>
      <button class="iconbtn ${m.fav ? 'on' : ''}" data-act="fav" data-id="${p.id}" aria-label="Favorito">${raw(IC.heart)}</button><button class="iconbtn" data-act="listenSel" title="Escuchar en el equipo (Espacio)" aria-label="Escuchar">${raw(IC.play)}</button></div></div></div>
    <div class="tabs t7" role="tablist">${tabs.map(([k, l]) => html`<button role="tab" class="${S.tab === k ? 'on' : ''}" data-act="tab" data-t="${k}">${l}</button>`)}</div>
    <div class="dbody">${{ identity: tabIdentity, synth: tabSynth, macros: tabMacros, compat: tabCompat, tags: tabClass, audit: tabAudit, compare: tabCompare }[S.tab](p, inf)}</div>`;
}
const pbar = (label, v, min = 0, max = 127, opts = {}) => {
  const center = opts.center !== undefined, pct = ((v - min) / Math.max(1, max - min)) * 100;
  const style = center ? (v >= opts.center ? `left:50%;width:${pct - 50}%` : `left:${pct}%;width:${50 - pct}%`) : `width:${pct}%`;
  return html`<div class="prm"><span class="n" title="${label}">${label}</span><div class="bar ${center ? 'c' : ''} ${opts.acc ? 'acc' : ''}"><i style="${style}"></i></div><span class="v">${opts.text ?? v}</span></div>`;
};
const pp = (p, key, opts = {}) => { const d = PARAMS.find((x) => x.key === key); return pbar(opts.label || d.label, p.payload[d.off], d.min, d.max, { center: d.center, text: formatValue(d, p.payload[d.off]), ...opts }); };
const pt = (p, key, label) => { const d = PARAMS.find((x) => x.key === key), v = p.payload[d.off]; return pbar(label, v, 0, 127, { text: v + ' · ' + fmtSeconds(approxSeconds(v)) }); };
const CTABS = [['anatomy', 'Anatomía'], ['params', 'Parámetros'], ['macros', 'Macros'], ['compare', 'Comparar'], ['lab', 'Laboratorio'], ['history', 'Historial']];
function renderCenter() {
  const p = S.sel && lib.byId(S.sel);
  if (!p) return html`<section class="pane center"><div class="empty"><h3>Elige un patch</h3><p>Verás cómo está construido: fuentes, filtro, envolventes, modulación y macros, explicado en un diagrama y en una receta legible.</p></div></section>`;
  const inf = lib.info(p);
  return html`<section class="pane center"><div class="pane-h"><button class="btn small mobile-back" data-act="closeDetail">${raw(IC.back)}Lista</button><div class="ctabs" style="border:0;padding:0">${CTABS.map(([k, l]) => html`<button class="${S.ctab === k ? 'on' : ''}" data-act="ctab" data-t="${k}">${l}</button>`)}</div><span class="sp"></span>
      <button class="btn small" data-act="listenSel" ${S.dev.session ? '' : 'disabled'} title="Enviar a la RAM del equipo y tocar la frase de prueba (Espacio)">${raw(IC.play)}Escuchar</button>${octBtnsHTML(p)}<button class="btn small" data-act="duplicate" title="Otro sonido a partir de este, con su propio nombre y sus propias carpetas (para editar sin tocar este no hace falta: los cambios van a su versión y siempre puedes volver al original)">${raw(IC.dup)}Duplicar</button></div>
    <div class="pane-b">${{ anatomy: centerAnatomy, params: tabSynth, macros: tabMacros, compare: tabCompare, lab: centerLab, history: centerHistory }[S.ctab](p, inf)}</div></section>`;
}
function centerHistory(p) {
  const hist = lib.history.filter((h) => h.ids?.includes(p.id)).slice(-20).reverse();
  return html`<div class="box"><h3>Historial de este patch</h3>${hist.length ? html`<table class="t">${hist.map((h) => html`<tr class="${h.undone ? 'dim' : ''}"><td class="num">${h.at.slice(0, 16).replace('T', ' ')}</td><td>${h.text}</td><td>${h.undoable && !h.undone ? html`<button class="btn small" data-act="undo" data-id="${h.id}">Deshacer</button>` : h.undone ? 'deshecho' : ''}</td></tr>`)}</table>` : html`<p class="note">Sin cambios registrados.</p>`}</div>`;
}
// Diagrama del flujo de señal.
const ANAT_POS = {
  osc1: [8, 40], osc2: [8, 100], noise: [8, 160], ring: [8, 220],
  drive: [176, 130], filter: [292, 130], dist: [408, 130], chorus: [524, 130], eq: [640, 130], out: [756, 130],
  env1: [8, 330], env2: [182, 330], env3: [356, 330], lfo1: [530, 330], lfo2: [704, 330]
};
const BW = 108, BH = 50;
function centerAnatomy(p) {
  const A = anatomy(p.payload), B = A.blocks, sel = S.block;
  const hlB = new Set(A.routes.filter((r) => r.via === 'macro' && r.knob === S.knob).map((r) => ANAT_POS[r.to] ? r.to : r.to === 'osc' ? 'osc1' : null).filter(Boolean));
  const box = (id) => { const [x, y] = ANAT_POS[id], b = B[id]; return `<g class="blk ${b.on ? 'on' : 'off'} ${b.modulated ? 'mod' : ''} ${sel === id ? 'bsel' : ''} ${hlB.has(id) ? 'mhl' : ''}" data-act="block" data-b="${id}"><rect x="${x}" y="${y}" width="${BW}" height="${BH}" rx="5"/><text class="t1" x="${x + 9}" y="${y + 21}">${esc(b.title)}</text><text class="t2" x="${x + 9}" y="${y + 39}">${esc(b.line.length > 15 ? b.line.slice(0, 14) + '…' : b.line)}</text><title>${esc(b.title + ' · ' + b.line)}</title></g>`; };
  const mid = (id, side) => { const [x, y] = ANAT_POS[id]; return side === 'r' ? [x + BW, y + BH / 2] : side === 'l' ? [x, y + BH / 2] : side === 'b' ? [x + BW / 2, y + BH] : [x + BW / 2, y]; };
  const curve = (a, b) => `M${a[0]} ${a[1]} C${a[0] + 60} ${a[1]} ${b[0] - 60} ${b[1]} ${b[0]} ${b[1]}`;
  let wires = '';
  // Señal: fuentes → (drive) → filtro → …
  const mixIn = [150, 155];
  for (const id of ['osc1', 'osc2', 'noise', 'ring']) wires += `<path class="${B[id].on ? 'w-audio' : 'w-off'}" d="${curve(mid(id, 'r'), mixIn)}"/>`;
  const chain = ['drive', 'filter', 'dist', 'chorus', 'eq', 'out'];
  let prev = mixIn;
  for (const id of chain) { const inP = mid(id, 'l'); wires += `<path class="w-audio" d="M${prev[0]} ${prev[1]} L${inP[0]} ${inP[1]}"/>`; prev = mid(id, 'r'); }
  // Modulación
  const srcPos = (from) => from?.startsWith('m') ? null : ANAT_POS[from] ? mid(from, 't') : null;
  const tgtPos = (to) => ANAT_POS[to] ? mid(to, 'b') : to === 'osc' ? mid('osc1', 'b') : null;
  const macroX = (k) => 8 + k * 108;
  A.routes.forEach((r, i) => {
    const t = tgtPos(r.to); if (!t) return;
    const dimmed = S.hoverRoute !== null && S.hoverRoute !== i ? ' w-dim' : '';
    if (r.via === 'macro') return; // las macros no se dibujan como cables: van como chapas sobre el bloque
    const s0 = srcPos(r.from); if (!s0) return;
    wires += `<path class="${r.via === 'fixed' ? 'w-fix' : 'w-mod'}${dimmed}" d="M${s0[0]} ${s0[1]} C${s0[0]} ${s0[1] - 70} ${t[0]} ${t[1] + 70} ${t[0]} ${t[1]}" data-ri="${i}"/>`;
  });
  const mk = {}; A.routes.filter((r) => r.via === 'macro').forEach((r) => { const b = ANAT_POS[r.to] ? r.to : r.to === 'osc' ? 'osc1' : null; if (b) (mk[b] ||= new Set()).add(r.knob); });
  const tags = Object.entries(mk).map(([b, set]) => { const [x, y] = ANAT_POS[b]; return [...set].sort().map((kk, j) => `<g class="mtag" data-act="anatKnob" data-i="${kk}"><rect x="${x + BW - 26 - j * 28}" y="${y - 9}" width="25" height="15" rx="2"/><text x="${x + BW - 13.5 - j * 28}" y="${y + 2}" text-anchor="middle">M${kk + 1}</text></g>`).join(''); }).join('');
  
  const knobs = A.decoded.macros.map((k) => `<g class="macro ${k.active ? 'on' : ''} ${S.knob === k.index && k.active ? 'cur' : ''}" data-act="anatKnob" data-i="${k.index}"><rect x="${macroX(k.index)}" y="418" width="96" height="28" rx="14"/><text x="${macroX(k.index) + 48}" y="437" text-anchor="middle">M${k.index + 1}${k.active ? ' · ' + k.slots.filter((s) => s.state === 'active').length : ''}</text></g>`).join('');
  const svgTxt = `<svg class="anat" viewBox="0 0 880 456" role="img" aria-label="Flujo de señal del patch"><defs><linearGradient id="sig" x1="0" x2="1"><stop offset="0" stop-color="#ff7a1a"/><stop offset=".55" stop-color="#ff2e86"/><stop offset="1" stop-color="#8a3dff"/></linearGradient></defs>
    <text class="lane" x="8" y="26">FUENTES</text><text class="lane" x="176" y="116">CADENA DE AUDIO →</text><text class="lane" x="8" y="316">MODULADORES</text><text class="lane" x="8" y="408">MACROS</text>
    <circle cx="150" cy="155" r="5" fill="#ecebe4"/>${wires}${Object.keys(ANAT_POS).map(box).join('')}${tags}${knobs}</svg>`;
  const blockDetail = sel ? blockParams(p, sel) : '';
  return html`<div class="legend-w" style="margin-bottom:6px"><span><i style="border-color:var(--paper)"></i>Señal de audio</span><span><i style="border-color:var(--mod)"></i>Matriz de modulación</span><span><b style="font:700 10.5px var(--fm);color:var(--mac);border:1px solid var(--mac);padding:0 4px;border-radius:2px">M5</b>Bloque movido por la macro 5 (pulsa una macro para resaltar sus bloques)</span><span><i style="border-color:var(--dim)"></i>Env 2 → filtro</span><span style="color:var(--mute)">Bloques punteados: sin efecto en este patch · pulsa un bloque para ver sus parámetros</span></div>
    ${raw(svgTxt)}<div class="anat-list">${Object.entries(B).map(([id, b]) => html`<button class="ab ${b.on ? 'on' : 'off'} ${S.block === id ? 'bsel' : ''}" data-act="block" data-b="${id}"><b>${b.title}</b><span>${b.line}</span>${b.modulated ? html`<i>modulado</i>` : ''}</button>`)}</div>${blockDetail}
    <div class="grid2" style="margin-top:12px"><div class="box"><h3>Cómo está hecho <small>receta generada de los bytes</small></h3><dl class="recipe">${A.recipe.map((r) => html`<dt>${r.k}</dt><dd>${r.t}</dd>`)}</dl></div>
    <div class="box"><h3>Rutas de modulación <small>${A.routes.length}</small></h3>${A.routes.length ? html`<div class="routes">${A.routes.map((r, i) => html`<div data-hr="${i}"><i style="border-color:${r.via === 'macro' ? 'var(--mac)' : r.via === 'fixed' ? 'var(--dim)' : 'var(--mod)'}"></i>${r.label}</div>`)}</div>` : html`<p class="note">Ninguna: el sonido solo cambia con las envolventes.</p>`}
      <p class="note" style="margin-top:8px">Los tiempos (≈) son aproximados.</p></div></div>`;
}
const BLOCK_GROUPS = { osc1: ['osc1', 'mix.osc1'], osc2: ['osc2', 'mix.osc2'], noise: ['mix.noise'], ring: ['mix.ring'], drive: ['filter.drive', 'filter.drivetype'], filter: ['filter.'], dist: ['fx.dist', 'fx.disttype', 'fx.distcomp'], chorus: ['fx.chorus'], eq: ['eq.'], out: ['mix.prefx', 'mix.postfx'], env1: ['env1.'], env2: ['env2.', 'filter.env2'], env3: ['env3.'], lfo1: ['lfo1.'], lfo2: ['lfo2.'] };
function blockParams(p, id) {
  const keys = BLOCK_GROUPS[id] || [], list = PARAMS.filter((d) => keys.some((k) => d.key.startsWith(k)));
  const isVar = p.kind === 'variant';
  return html`<div class="box" style="margin-top:10px"><h3>${anatomy(p.payload).blocks[id].title} <small>${isVar ? (lib.changeState(p) === 'adopted' ? 'editando su versión' : 'edición directa') + (S.live && S.dev.session ? ' · envío en vivo' : '') : 'original: «Editar» crea su versión (el original se guarda)'}</small></h3>
    ${list.map((d) => isVar ? html`<div class="prm"><span class="n">${d.label}</span>${d.enum ? html`<select data-act="pedit" data-off="${d.off}">${d.enum.map((n, i) => html`<option value="${i}" ${p.payload[d.off] === i ? 'selected' : ''}>${n}</option>`)}</select>` : html`<input type="range" min="${d.min}" max="${d.max}" value="${p.payload[d.off]}" data-act="pedit" data-off="${d.off}">`}<span class="v">${formatValue(d, p.payload[d.off])}${/\.(a|d|r|delay)$/.test(d.key) ? ' · ' + fmtSeconds(approxSeconds(p.payload[d.off])) : ''}</span></div>` : pp(p, d.key, /\.(a|d|r|delay)$/.test(d.key) ? { text: p.payload[d.off] + ' · ' + fmtSeconds(approxSeconds(p.payload[d.off])) } : {}))}
    ${isVar ? html`<label class="note" style="margin-top:6px;display:block"><input type="checkbox" class="chk" data-act="opt" data-k="live" ${S.live ? 'checked' : ''}> Enviar cada cambio a la RAM del equipo</label>` : html`<button class="btn small" data-act="editStart" style="margin-top:6px">Editar</button>`}</div>`;
}
// ---------- Paleta de acciones (Ctrl K): todo lo que se hace con el patch actual, desde cualquier sección ----------
const norm = (x) => String(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const fakeEv = { preventDefault() {}, stopPropagation() {} };
async function transposeIds(ids, n) {
  const seen = new Set(), adopt = [];
  // v3.10: se suma a la versión de cada sonido (sin variantes nuevas)
  for (const p of ids.map((id) => faceOf(lib.byId(id))).filter(Boolean)) { if (seen.has(p.id)) continue; seen.add(p.id); const t = transposeSemitones(p.payload, n, regMethod(), {}); const v = await lib.editSound(p, t.payload, 'register', `Octava ${fmtSemis(n / 12)} (a mano)`); adopt.push(v.id); }
  S.rowsKey = ''; return adopt.length;
}
function paletteItems(q) {
  const p = cur(), out = [], add = (group, label, run, hint = '') => out.push({ group, label, run, hint });
  if (p) {
    const id = p.id, inTags = new Set(p.meta.tags || []);
    add('Patch', 'Escuchar en el equipo', () => A.listenSel(), 'Espacio');
    add('Patch', p.meta.fav ? 'Quitar de favoritos' : 'Marcar favorito', () => A.fav({ dataset: { id } }, fakeEv));
    for (let n = 1; n <= 5; n++) add('Patch', `Puntuar ${'★'.repeat(n)}`, () => { S.sel = id; A.rate({ dataset: { n } }); });
    for (const [n, l] of [[-12, 'Bajar una octava'], [12, 'Subir una octava'], [-24, 'Bajar dos octavas'], [24, 'Subir dos octavas']]) add('Patch', l, async () => { const k = await transposeIds([id], n); toast(`${l}: se suma a su versión (Ctrl Z deshace)`); if (k) rerender(); });
    if (!patternOf(p)) add('Patch', 'Adjuntar el patrón generado', async () => { await autoAttach(p); toast('Patrón adjuntado'); rerender(); });
    add('Patch', 'Abrir en Patrones', () => A.patOpenFor({ dataset: { id } }));
    for (const [t, l] of EDIT_TABS) add('Editar', `${l} del patch`, () => A.goEdit({ dataset: { t } }));
    add('Patch', 'Añadir al pack', () => { S.sel = id; A.addToBank(); });
    add('Patch', 'Exportar .syx', () => { S.sel = id; A.exportSyx(); });
    add('Patch', 'Marcar para descartar', async () => { await lib.updateMeta([id], { review: 'discard' }, 'Marcado para descartar'); rerender(); });
    for (const c of CATEGORIES) { add('Carpeta', `Carpeta: ${c.label}`, async () => { await lib.setCategory([id], c.id, null); rerender(); }); for (const x of lib.tax[c.id]) add('Carpeta', `Carpeta: ${c.label} / ${x.label}`, async () => { await lib.setSubfolder([id], c.id, x.id); rerender(); }); }
    for (const t of [...new Set([...lib.tagPalette.flatMap((g) => g.tags), ...lib.allTags().map(([t]) => t)])]) add('Etiqueta', `${inTags.has(t) ? 'Quitar' : 'Etiquetar'}: ${t}`, async () => { await lib.addTags([id], [t], inTags.has(t)); rerender(); });
    const free = q.match(/^(?:etiqueta|tag)[:\s]+(.+)$/i); if (free) add('Etiqueta', `Etiquetar: ${free[1].trim()}`, async () => { await lib.addTags([id], [free[1].trim()]); rerender(); });
  }
  TABS.forEach(([v, l]) => add('Ir a', `Ir a ${l}`, () => A.view({ dataset: { v } })));
  add('Ir a', 'Reanalizar la biblioteca', () => { S.view = 'organize'; S.orgTab = 'rean'; rerender(); });
  add('Ir a', 'Corregir octavas (plan)', () => { S.view = 'organize'; S.orgTab = 'register'; S.regView = 'plan'; rerender(); });
  add('Ir a', `Papelera (${lib.trashCount()})`, () => { S.view = 'organize'; S.orgTab = 'trash'; rerender(); });
  add('Hacer', 'Deshacer lo último (Ctrl Z)', () => undoLast());
  add('Hacer', 'Atajos de teclado (?)', () => showKeys());
  if (p) add('Patch', 'Eliminar (a la papelera)', () => trashIds([p.id]), 'Supr');
  const nq = norm(q).trim(), words = nq.split(/\s+/).filter(Boolean);
  let list = words.length ? out.filter((x) => words.every((w) => norm(x.group + ' ' + x.label).includes(w))) : out.filter((x) => x.group === 'Patch' || x.group === 'Editar').slice(0, 14);
  if (words.length) {
    const pm = lib.faces().filter((x) => words.every((w) => norm(x.name + ' ' + (x.fileName || '')).includes(w))).slice(0, 8);
    list = [...pm.map((x) => ({ group: 'Abrir patch', label: x.name, hint: catName(x.meta.category || lib.info(x).cls.category, x.meta.subtype), run: () => { S.sel = x.id; if (S.view === 'audition') S.view = 'library'; if (S.view !== 'library') S.dock = true; rerender(); } })), ...list];
  }
  return list.slice(0, 40);
}
function openPalette() {
  if ($('#pal')) return $('#pal input').focus();
  const box = document.createElement('div'); box.id = 'pal'; box.className = 'pal-bg';
  box.innerHTML = `<div class="pal" role="dialog" aria-label="Acciones"><div class="pal-h">${cur() ? `Patch actual: <b>${esc(cur().name)}</b>` : 'Sin patch elegido: escribe un nombre para abrirlo'}</div><input type="text" placeholder="Busca una acción o un patch: «octava», «reverb», «bass subs», «macros»…" aria-label="Buscar acción"><div class="pal-l" role="listbox"></div></div>`;
  document.body.appendChild(box);
  const inp = box.querySelector('input'), ul = box.querySelector('.pal-l'); let items = [], i = 0;
  const draw = () => { items = paletteItems(inp.value); i = Math.min(i, Math.max(0, items.length - 1)); let g = ''; ul.innerHTML = items.length ? items.map((x, k) => (x.group !== g ? `<div class="pal-g">${esc((g = x.group))}</div>` : '') + `<button class="pal-i ${k === i ? 'on' : ''}" data-k="${k}" role="option"><span>${esc(x.label)}</span><small>${esc(x.hint || '')}</small></button>`).join('') : '<p class="note" style="padding:10px">Nada coincide.</p>'; ul.querySelector('.on')?.scrollIntoView({ block: 'nearest' }); };
  const close = () => box.remove();
  const run = async (k) => { const x = items[k]; close(); if (x) await x.run(); };
  inp.addEventListener('input', () => { i = 0; draw(); });
  inp.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); i = Math.min(items.length - 1, i + 1); draw(); } else if (e.key === 'ArrowUp') { e.preventDefault(); i = Math.max(0, i - 1); draw(); } else if (e.key === 'Enter') { e.preventDefault(); run(i); } else if (e.key === 'Escape') { e.preventDefault(); close(); } e.stopPropagation(); });
  ul.addEventListener('click', (e) => { const b = e.target.closest('.pal-i'); if (b) run(+b.dataset.k); });
  box.addEventListener('mousedown', (e) => { if (e.target === box) close(); });
  draw(); inp.focus();
}
// ---------- Patch actual: la ficha completa en cualquier sección ----------
const EDIT_TABS = [['anatomy', 'Anatomía'], ['params', 'Parámetros'], ['macros', 'Macros'], ['compare', 'Comparar'], ['lab', 'Laboratorio'], ['history', 'Historial']];
function renderDock() {
  const p = cur();
  return html`<div class="dock"><div class="dock-h"><span class="mlabel">Patch actual</span><span class="sp"></span><button class="lk" data-act="dockLib" title="Abrirlo en la Biblioteca">Biblioteca</button><button class="lk" data-act="dockToggle" aria-label="Cerrar">✕</button></div>
    <div class="dock-go">${EDIT_TABS.map(([t, l]) => html`<button class="lk" data-act="goEdit" data-t="${t}">${l}</button>`)}<button class="lk" data-act="patOpenFor" data-id="${p.id}">Patrón</button></div>
    ${renderInspector()}</div>`;
}
function renderInspector() {
  const p = cur();
  if (!p) return html`<aside class="pane insp"><div class="pane-b">${lib.patches.length ? html`<div class="statgrid">${kpiTiles(true)}</div>` : ''}</div></aside>`;
  const inf = lib.info(p), m = p.meta, c = inf.cls, cat = m.category || c.category, md = mood(p, lib), cp = compatOf(p), au = auditChecks(p, lib, S.profile), reg = register(p.payload);
  const packs = lib.banks.filter((b) => b.slots.includes(p.id)).map((b) => b.name + ' #' + (b.slots.indexOf(p.id) + 1));
  return html`<aside class="pane insp"><div class="pane-b">
    <div class="label"><div class="k">Patch${lib.changeState(p) === 'adopted' ? ' · editado' : p.copyOf ? ' · copia' : ''} · ${COMPAT_LABEL[cp.status]}</div><h2>${p.name || '(sin nombre)'}</h2>
      <div class="tags">${cat ? html`<span class="${m.category ? '' : 'prop'}">${catName(cat, m.category ? m.subtype : c.subtype)}</span>` : ''}${md ? html`<span class="${md.source === 'measured' || md.source === 'user' ? '' : 'prop'}" title="${MOOD_SOURCE[md.source]}">${md.label}</span>` : ''}<span>${['Mono', 'Mono AG', 'Poly'][p.payload[32]]}</span>${(m.tags || []).slice(0, 4).map((t) => html`<span>${t}</span>`)}</div>
      <dl class="meta"><dt>Al tocar Do</dt><dd>${describePitch(lib.settings.kbdMidi === 'no' ? reg.lowestSemis : reg.effective)}${reg.confidence === 'dudosa' ? ' (dudoso)' : ''}${reg.keyboardOctave ? ` · tecl. ${fmtSemis(reg.keyboardOctave)}` : ''}</dd><dt>Origen</dt><dd>${p.folderPath || p.fileName || '—'}</dd><dt>Pack</dt><dd>${packs.join(', ') || '—'}</dd></dl>
      <div class="acts"><span class="stars">${[1, 2, 3, 4, 5].map((n) => html`<span class="${n <= (m.rating || 0) ? 'on' : ''}" data-act="rate" data-n="${n}">★</span>`)}</span><span class="sp"></span><button class="ib ${m.fav ? 'on' : ''}" data-act="fav" data-id="${p.id}" aria-label="Favorito">${raw(IC.heart)}</button><button class="ib" data-act="exportSyx" title="Exportar .syx">.syx</button><button class="ib" data-act="addToBank" title="Añadir al pack">+ Pack</button></div><div class="spec"></div></div>
    ${chgInspector(p)}
    ${inspFolder(p, inf)}
    ${inspTags(p, inf)}
    ${inspPattern(p)}
    <div class="isec"><div class="mlabel"><span>Revisión</span><span>${au.passed} de ${au.total}</span></div><div class="checks">${au.items.map((x) => html`<div class="${x.level}"><i></i><span><b>${x.group}.</b> ${x.text}</span></div>`)}</div></div>
    <div class="isec"><div class="mlabel"><span>Ficha</span></div>
      <label class="lab">Estado<select class="field" data-act="metaSel" data-k="review">${Object.entries(REVIEW).map(([k, v]) => html`<option value="${k}" ${m.review === k ? 'selected' : ''}>${v}</option>`)}</select></label>
      <label class="lab" style="margin-top:8px">Notas de uso<textarea class="field" data-act="metaTxt" data-k="notes" placeholder="Dónde lo usaste, qué macros mover…">${m.notes}</textarea></label>
      ${p.kind === 'variant' ? html`<label class="lab" style="margin-top:8px">Nombre (16 caracteres)<input class="field" data-act="rename" maxlength="16" value="${p.name}"></label>` : ''}</div>
    <div class="isec"><div class="mlabel"><span>Compatibilidad y archivo</span></div><div class="checks">${cp.checks.map((x) => html`<div class="${x.level === 'ok' ? 'ok' : x.level === 'warn' ? 'warn' : ''}"><i></i><span>${x.text}</span></div>`)}</div>${measuredMini(p)}
      <div class="row2" style="margin-top:8px">${lib.fileOf(p) ? html`<button class="btn small" data-act="exportOriginal">Archivo original</button>` : ''}<button class="btn small" data-act="queueOne">A la escucha</button><button class="btn small danger" data-act="deleteOne">Eliminar</button></div></div>
  </div></aside>`;
}
// ---------- Ficha: carpeta (categoría / subcarpeta) y etiquetas ----------
function inspFolder(p, inf) {
  const m = p.meta, c = inf.cls, saved = !!m.category, cat = m.category || c.category;
  const sub = saved ? m.subtype : c.subtype, propSub = c.category === cat && c.subtype !== (saved ? m.subtype : null) ? c.subtype : null;
  const list = cat ? lib.tax[cat] : [];
  const status = saved ? (m.subtype || !list.length ? 'guardada' : 'sin subcarpeta') : cat ? 'propuesta' : 'sin propuesta';
  const subWhy = c.subBasis && propSub ? html`<p class="note sub-why">Propuesta: <b>${lib.subLabel(cat, c.subtype)}</b>, ${c.subBasis.from === 'text' ? 'lo dice el nombre o la carpeta' : 'por sus ajustes'}: ${c.subBasis.why.join(' · ')}${c.subAlt ? html` · también podría ser <a href="#" data-act="setSub" data-c="${cat}" data-s="${c.subAlt}">${lib.subLabel(cat, c.subAlt)}</a>` : ''}</p>` : '';
  return html`<div class="isec"><div class="mlabel"><span>Carpeta</span><span>${saved ? 'decidido por ti' : whyText(c, false)[1].toLowerCase()}</span></div>
    <div class="fpath ${saved ? '' : 'prop'}">${cat ? html`<b>${CAT_LABEL[cat]}</b>${sub ? html`<i>/</i><b>${lib.subLabel(cat, sub)}</b>` : ''}` : c.candidates ? html`<b>${c.candidates.map((x) => CAT_LABEL[x]).join(' / ')}</b>` : html`<b>Sin propuesta</b>`}<span class="badge ${saved && (m.subtype || !list.length) ? 'ok' : 'prop'}">${status}</span></div>
    ${saved ? '' : html`<p class="note" style="margin-top:6px"><b>${CERTAINTY[c.certainty].label}.</b> ${CERTAINTY[c.certainty].help}</p>`}
    ${!cat && c.hint ? html`<p class="note" style="margin-top:6px">Indicio débil de <b>${CAT_LABEL[c.hint.cat]}</b> solo por parámetros: no basta para proponerlo. Escúchalo y decide.</p>` : ''}
    ${nnHint(p)}
    ${c.contradictions.length ? html`<p class="note" style="color:var(--warn);margin-top:6px">⚠ ${c.contradictions.map((x) => x.text).join(' · ')}</p>` : ''}
    <div class="row2" style="margin-top:8px">${!saved && c.category ? html`<button class="btn small primary" data-act="accept">Aceptar</button>` : ''}<select class="sel" data-act="setCat" aria-label="Categoría" style="height:27px;font-size:12px;max-width:160px"><option value="">${saved ? 'Otra categoría…' : 'Elegir categoría…'}</option>${CATEGORIES.map((x) => html`<option value="${x.id}" ${x.id === m.category ? 'selected' : ''}>${x.label}</option>`)}</select><button class="btn small" data-act="toggleEvidence">${S.showEv ? 'Ocultar' : 'Por qué'}</button></div>
    ${cat ? html`<div class="mlabel sm" style="margin-top:10px"><span>Subcarpeta de ${CAT_LABEL[cat]}</span><a href="#" data-act="orgFolders" data-c="${cat}">editar</a></div>
      <div class="subchips">${list.map((x) => html`<button class="subc ${saved && m.subtype === x.id ? 'on' : ''} ${propSub === x.id ? 'prop' : ''}" data-act="setSub" data-c="${cat}" data-s="${x.id}" aria-pressed="${saved && m.subtype === x.id}" title="${propSub === x.id ? 'Propuesta' : ''}">${x.label}</button>`)}${S.subNew === cat ? html`<input class="field subnew" data-act="subNewIn" data-c="${cat}" placeholder="Nombre y Intro" maxlength="40" autofocus>` : html`<button class="subc add" data-act="subNew" data-c="${cat}">+ Nueva</button>`}</div>${subWhy}` : ''}
    ${S.showEv ? html`<table class="t" style="margin-top:8px">${[...c.evidence].sort((x, y) => (y.pts || y.subPts || 0) - (x.pts || x.subPts || 0)).map((e) => html`<tr><td>${catName(e.cat, e.sub)}</td><td class="note">${e.source}: ${e.why}</td><td class="num">${e.pts || (e.subPts ? '+' + e.subPts : '')}</td></tr>`)}</table><p class="note">${CERTAINTY[c.certainty].help}</p>` : ''}</div>`;
}
function inspTags(p, inf) {
  const m = p.meta, tags = m.tags || [], fx = lib.fxOf(p), pal = lib.tagPalette, inPal = new Set(pal.flatMap((g) => g.tags));
  const sugMap = new Map(); for (const x of [...fx, ...autoTags(p, inf).filter((x) => x.k !== 'cat')]) if (!sugMap.has(x.t)) sugMap.set(x.t, x);
  const sug = [...sugMap.values()].filter((x) => !tags.includes(x.t) && !inPal.has(x.t));
  return html`<div class="isec"><div class="mlabel"><span>Etiquetas</span><span>${tags.length || ''}</span></div>
    <div class="tagbox">${tags.map((t) => html`<span class="tagp">${t}<button data-act="tagDel" data-t="${t}" aria-label="Quitar ${t}">×</button></span>`)}<input class="tagin" data-act="tagIn" list="tagList" placeholder="${tags.length ? 'Añadir…' : 'Escribe una etiqueta y pulsa Intro'}" aria-label="Añadir etiqueta"></div>
    <datalist id="tagList">${[...new Set([...lib.allTags().map(([t]) => t), ...inPal, ...DESCRIPTORS])].map((t) => html`<option value="${t}">`)}</datalist>
    <div class="tagpal">${pal.map((g) => html`<div class="tpg"><span class="tpn">${g.name}</span><span class="tpc">${g.tags.map((t) => { const on = tags.includes(t), hint = sugMap.get(t); const qn = quickTags().indexOf(t); return html`<button class="tq ${on ? 'on' : ''} ${!on && hint ? 'hint' : ''}" data-act="tagToggle" data-t="${t}" aria-pressed="${on}" title="${hint ? hint.why || ({ name: 'Del nombre', meas: 'Medido', par: 'De los ajustes', pdesc: 'Carácter leído en los ajustes', use: 'Uso' }[hint.k] || '') : qn >= 0 ? 'Alt+' + (qn + 1) : ''}">${t}${qn >= 0 ? html`<sup>${qn + 1}</sup>` : ''}</button>`; })}</span></div>`)}</div>
    ${sug.length ? html`<div class="chips" style="margin-top:6px">${sug.map((x) => html`<button class="tagc ${x.k}" data-act="addTag" data-t="${x.t}" title="${x.why || { use: 'Uso', name: 'Del nombre', meas: 'Medido', par: 'De los ajustes', pdesc: 'Carácter leído en los ajustes' }[x.k] || ''}">+ ${x.t}</button>`)}</div>` : ''}
    ${tagClipHTML()}<p class="note" style="margin-top:4px"><a href="#" data-act="orgFolders" data-c="">Editar las etiquetas rápidas</a> · con borde discontinuo, las que sugiere el nombre o el patch.</p></div>`;
}
async function acceptSubs(ids) {
  if (!ids.length) return;
  const was = new Map(ids.map((id) => { const p = lib.byId(id); return [id, { cat: p.meta.category, st: p.meta.classStatus, cls: lib.info(p).cls }]; }));
  const h = await lib.updateMeta(ids, { category: (p) => was.get(p.id).cat || was.get(p.id).cls.category, subtype: (p) => was.get(p.id).cls.subtype, classStatus: (p) => (was.get(p.id).cat ? was.get(p.id).st : 'accepted'), classAt: Date.now() }, `Subcarpeta propuesta aceptada en ${ids.length} patch(es)`);
  toast(h.text); rerender();
}
// Crea las variantes de octava de varios grupos, cada uno con su objetivo y modo.
function regFixList(k, live = regLive(), drafts = regDraftParents()) { const pl = regPlanOf(k); if (pl.target === 'skip') return []; const rep = regReportFor(k, live), mode = regModeOf(k); return rep.off.filter((x) => regShift(x, mode) !== 0 && !drafts.has(x.id)).map((x) => ({ x, goal: rep.goal, mode })); }
async function regFixGroups(keys, quiet = false) {
  const live = regLive(), drafts = regDraftParents(), mode = S.regAdopt || 'smart', adopt = []; let created = 0, groups = 0;
  if (!quiet) { const n = keys.reduce((a, k) => a + regFixList(k, live, drafts).length, 0); if (!n) return null; if (!(await confirmBox('Corregir octava y tono', `Se corregirán ${n} patches de ${keys.map(regLabel).join(', ')}, cada uno a su objetivo, en la versión de cada sonido. Los originales se guardan.`, 'Corregir'))) return null; }
  for (const k of keys) {
    const list = regFixList(k, live, drafts); if (!list.length) continue; groups++;
    for (const { x, goal, mode: m } of list) {
      const p = lib.byId(x.id), t = regFixPayload(p, x, m);
      const v = await lib.createVariant(p.id, t.payload, 'register', `Altura ${fmtSemis(regShift(x, m))} st (a ${describePitch(goal)})`, ''); created++;
      if (mode === 'all' || (mode === 'smart' && x.confidence === 'clara' && !t.problems.length)) adopt.push(v.id);
    }
  }
  if (adopt.length) await lib.adoptVariants(adopt, true);
  S.rowsKey = ''; rerender();
  return { created, adopted: adopt.length, groups };
}
function revAutoPlay() { if (S.view !== 'organize' || S.regView !== 'review' || !S.dev.session) return; const q = regQueue(), v = q[Math.min(S.revI || 0, q.length - 1)]; if (v) playTest(faceOf(v), proposalApplied(v)); }
function measuredMini(p) {
  const a = p.acoustic; if (!a) return html`<p class="note" style="margin-top:8px">Sin medición acústica.${S.dev.session && S.dev.audioId ? html` <a href="#" data-act="measureSel">Medir ahora</a>` : ''}</p>`;
  const d = a.desc; if (d.silent) return html`<p class="note" style="margin-top:8px">Medición sin señal.</p>`;
  return html`<div class="mfeat" style="margin-top:8px">${a.features.map((f) => html`<span class="badge" title="${f.basis}">${f.label}</span>`)}</div><p class="note" style="margin-top:4px">f0 ${d.f0 ? d.f0.toFixed(1) + ' Hz' : '—'} · ataque ${d.attackMs.toFixed(0)} ms · cola ${d.releaseMs.toFixed(0)} ms</p>`;
}
function autoTags(p, inf) {
  const c = inf.cls;
  return [...(c.category ? [{ t: catName(c.category, c.subtype), k: 'cat' }] : []), ...c.usage.map((u) => ({ t: CAT_LABEL[u] || u, k: 'use' })), ...c.descriptors.map((d) => ({ t: d.label, k: d.declared ? 'name' : 'pdesc' })),
    ...(p.acoustic?.features || []).filter((f) => f.id !== 'm-silent').map((f) => ({ t: f.label.replace(/ \(medid[oa]\)/, ''), k: 'meas' })),
    ...inf.an.features.filter((f) => ['mono', 'poly', 'glide', 'percussive', 'slow-attack', 'long-release', 'acid-like', 'distortion', 'filter-drive', 'wavetable', 'detuned', 'density', 'ringmod', 'vsync', 'noise', 'lfo-mod', 'pitch-env', 'chorus'].includes(f.id)).map((f) => ({ t: f.label, k: 'par' }))]
    .filter((x, i, arr) => arr.findIndex((y) => y.t === x.t) === i);
}
function kpiTiles(small) {
  const la = LA(), issues = lib.faces().filter((p) => { const a = lib.info(p).macros; return a.integrity.length || a.shared.length; }).length;
  return [['Patches', la.N, 'all'], ['Sin categoría guardada', lib.faces().filter((p) => !p.meta.category).length, 'untagged'], ['Sin propuesta', lib.faces().filter((p) => !p.meta.category && !lib.info(p).cls.category).length, 'untagged'], ['Duplicados', la.dup, 'duplicate'], ['Circuit original', la.legacy, 'legacy'], ['Macros con incidencias', issues, 'macro'], ['Pendientes', lib.faces().filter((p) => p.meta.review === 'pending').length, 'pending']]
    .map(([l, n, k]) => html`<button class="stat" data-act="kpi" data-k="${k}"><strong>${n}</strong><span>${l}</span></button>`);
}
let envSeq = 0;
// Envolvente: fondo tinta, línea fina naranja→rosa y relleno ciruela translúcido.
function envSvg(a, d, s, r, delay = 0) {
  const W = 300, H = 96, B = H - 14, T = 10, sc = (x) => (x / 127) * 62, id = 'ev' + (++envSeq);
  // Los tramos se reparten el ancho en proporción a sus valores; el sustain ocupa un 22 % fijo.
  const avail = W - 12, susW = avail * 0.22, u = [sc(delay) * 0.5, sc(a) + 2, sc(d) + 2, sc(r) + 2], k = (avail - susW) / u.reduce((x, y) => x + y, 0);
  const x0 = 6 + u[0] * k, x1 = x0 + u[1] * k, x2 = x1 + u[2] * k, x3 = x2 + susW, x4 = x3 + u[3] * k, ys = B - (s / 127) * (B - T);
  const line = `6,${B} ${x0},${B} ${x1},${T} ${x2},${ys} ${x3},${ys} ${x4},${B}`;
  const lab = (x, t) => `<text x="${x}" y="${H - 3}" text-anchor="middle" fill="#8b8e91" font-size="9" font-family="CT Mono,monospace">${t}</text>`;
  return raw(`<svg class="envsvg" viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs><linearGradient id="${id}l" x1="0" x2="1"><stop offset="0" stop-color="#ff7a1a"/><stop offset="1" stop-color="#ff2e86"/></linearGradient><linearGradient id="${id}f" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ff2e86" stop-opacity=".34"/><stop offset="1" stop-color="#7a1d55" stop-opacity=".10"/></linearGradient></defs>
    <line x1="0" x2="${W}" y1="${B}" y2="${B}" stroke="#303337"/><polygon points="${line}" fill="url(#${id}f)"/><polyline points="${line}" fill="none" stroke="url(#${id}l)" stroke-width="1.8" stroke-linejoin="round"/>
    ${lab((x0 + x1) / 2, 'A')}${lab((x1 + x2) / 2, 'D')}${lab((x2 + x3) / 2, 'S')}${lab((x3 + x4) / 2, 'R')}</svg>`);
}
function tabSynth(p, inf) {
  const v = inf.an.decoded.v, d = inf.an.decoded, isVar = p.kind === 'variant';
  if (S.editParams && isVar) return paramEditor(p);
  const envs = [['Amp', 'env1'], ['Filter', 'env2'], ['Mod', 'env3']], e = envs[S.envTab][1], lf = S.lfoTab + 1, fl = d.lfoFlags[S.lfoTab], routes = d.matrix.filter((m) => m.active);
  return html`<div class="row2"><span class="note">${isVar ? (lib.changeState(p) === 'adopted' ? 'Editado: los cambios se suman a su versión, la que suena y se exporta. El original se guarda.' : 'Copia independiente: los cambios se guardan solos.') : 'Original. Al editar se crea su versión; el original se guarda y siempre puedes volver a él.'}</span><span style="flex:1"></span>${isVar ? html`<button class="btn small" data-act="editParams">Editar parámetros</button><button class="btn small" data-act="listenSel">▶ Probar en equipo</button>` : html`<button class="btn small" data-act="editStart">Editar parámetros</button>`}</div>
  <div class="grid2">
    <div class="box"><h3>Osciladores</h3>${[1, 2].map((n) => html`<div class="wave">${raw(WAVE_ICON(v[`osc${n}.wave`]))}<span>OSC ${n} · ${OSC_WAVES[v[`osc${n}.wave`]]}</span></div>${pp(p, `mix.osc${n}`, { label: 'Nivel', acc: true })}`)}
      ${pp(p, 'osc1.semi', { label: 'Semit. 1' })}${pp(p, 'osc2.semi', { label: 'Semit. 2' })}${pp(p, 'osc2.cents', { label: 'Cents 2' })}${pp(p, 'osc1.density', { label: 'Density 1' })}${pp(p, 'osc1.vsync', { label: 'VSync 1' })}</div>
    <div class="box"><h3>Filtro <small>${FILTER_TYPES[v['filter.type']]} · ${['ruta normal', 'OSC 1 bypass', 'bypass 1+2'][v['filter.routing']] || '?'}</small></h3>
      ${pp(p, 'filter.freq', { label: 'Cutoff', acc: true })}${pp(p, 'filter.res', { label: 'Res', acc: true })}${pp(p, 'filter.drive')}${pp(p, 'filter.env2', { label: 'Env 2 → freq' })}${pp(p, 'filter.track', { label: 'Tracking' })}<p class="note">Drive ${formatValue(PARAMS.find((x) => x.key === 'filter.drivetype'), v['filter.drivetype'])}</p></div></div>
  <div class="grid3">
    <div class="box"><h3>Envolventes</h3><div class="envtabs">${envs.map(([l], i) => html`<button class="${S.envTab === i ? 'on' : ''}" data-act="envTab" data-i="${i}">${l}</button>`)}</div>
      ${envSvg(v[e + '.a'], v[e + '.d'], v[e + '.s'], v[e + '.r'], e === 'env3' ? v['env3.delay'] : 0)}${pt(p, e + '.a', 'Attack')}${pt(p, e + '.d', 'Decay')}${pp(p, e + '.s', { label: 'Sustain' })}${pt(p, e + '.r', 'Release')}
      <p class="note">Tiempos ≈ aproximados, a partir de la guía de Novation (Env 3 Delay: 85 ≈ 1 s, 127 ≈ 10 s).</p></div>
    <div class="box"><h3>LFO</h3><div class="subtabs">${[0, 1].map((i) => html`<button class="btn small ${S.lfoTab === i ? 'on' : ''}" data-act="lfoTab" data-i="${i}">LFO ${i + 1}</button>`)}</div>
      <div class="wave">${raw(WAVE_ICON(v[`lfo${lf}.wave`] <= 1 ? v[`lfo${lf}.wave`] : v[`lfo${lf}.wave`] === 3 ? 13 : 99))}<span>${LFO_WAVES[v[`lfo${lf}.wave`]]}</span></div>
      ${pp(p, `lfo${lf}.rate`, { label: 'Rate' })}${pp(p, `lfo${lf}.slew`, { label: 'Slew' })}<p class="note">Sync ${v[`lfo${lf}.ratesync`] || 'off'} · ${fl.text}</p></div>
    <div class="box"><h3>FX</h3>${pp(p, 'fx.dist', { label: 'Distorsión' })}<p class="note" style="margin:-2px 0 4px">${formatValue(PARAMS.find((x) => x.key === 'fx.disttype'), v['fx.disttype'])}</p>${pp(p, 'fx.chorus', { label: v['fx.chorustype'] ? 'Chorus' : 'Phaser' })}${pp(p, 'fx.chorusrate', { label: 'Rate' })}${pp(p, 'fx.chorusfb', { label: 'Feedback' })}</div></div>
  <div class="grid2">
    <div class="box"><h3>Voz y mezcla</h3>${pp(p, 'voice.poly')}${pp(p, 'voice.portamento', { label: 'Glide' })}${pp(p, 'voice.octave', { label: 'Octava' })}${pp(p, 'mix.ring', { label: 'Ring mod' })}${pp(p, 'mix.noise', { label: 'Ruido' })}</div>
    <div class="box"><h3>Matriz de modulación <small>${routes.length}/20 activas</small></h3>${routes.length ? html`<table class="t"><tr><th>#</th><th>Fuente</th><th>Destino</th><th>Prof.</th></tr>${routes.map((r) => html`<tr><td>${r.index + 1}</td><td>${r.s1Name}${r.s2 ? ' × ' + r.s2Name : ''}</td><td>${r.destName}</td><td>${r.depth - 64 > 0 ? '+' : ''}${r.depth - 64}</td></tr>`)}</table>` : html`<p class="note">Sin rutas con profundidad distinta de 0.</p>`}</div></div>`;
}
function paramEditor(p) {
  const groups = {}; for (const d of PARAMS) (groups[d.group] ||= []).push(d);
  return html`<div class="row2"><b class="hf">Edición de parámetros</b><span style="flex:1"></span><button class="btn small" data-act="listenSel">▶ Probar</button><button class="btn small" data-act="editParams">Volver</button></div>
  <p class="note">Cada cambio se guarda en su versión (el original se guarda). Rangos de la guía oficial.</p>
  ${Object.entries(groups).map(([g, list]) => html`<div class="box"><h3>${GROUP_LABELS[g]}</h3>${list.map((d) => html`<div class="prm"><span class="n">${d.label} <span class="ev">${d.off}</span></span>${d.enum ? html`<select data-act="pedit" data-off="${d.off}">${d.enum.map((n, i) => html`<option value="${i}" ${p.payload[d.off] === i ? 'selected' : ''}>${n}</option>`)}</select>` : html`<input type="number" min="${d.min}" max="${d.max}" value="${p.payload[d.off]}" data-act="pedit" data-off="${d.off}">`}<span class="v">${formatValue(d, p.payload[d.off])}</span></div>`)}</div>`)}`;
}
function knobSvg(pos, active) {
  const a0 = -135, ang = a0 + (pos / 127) * 270, rad = (x) => (x - 90) * Math.PI / 180, R = 15, c = 20;
  const ptk = (deg, r = R) => [c + r * Math.cos(rad(deg)), c + r * Math.sin(rad(deg))];
  const [sx, sy] = ptk(a0), [ex, ey] = ptk(ang), [fx, fy] = ptk(135), [nx, ny] = ptk(ang, 9), large = ang - a0 > 180 ? 1 : 0;
  return raw(`<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M${sx} ${sy} A${R} ${R} 0 1 1 ${fx} ${fy}" fill="none" stroke="#4a4e54" stroke-width="2.4" stroke-linecap="round"/>${pos > 0 ? `<path d="M${sx} ${sy} A${R} ${R} 0 ${large} 1 ${ex} ${ey}" fill="none" stroke="${active ? '#ff6a2b' : '#8a8c8f'}" stroke-width="2.4" stroke-linecap="round"/>` : ''}<line x1="20" y1="20" x2="${nx}" y2="${ny}" stroke="#ecebe7" stroke-width="2" stroke-linecap="round"/></svg>`);
}
// ===== MESA DE MACROS =====
// Los 8 knobs se giran (arrastrar, rueda o flechas). Girar NO guarda nada: es una posición de prueba que
// muestra en vivo qué valor alcanza cada destino y, con el equipo conectado, manda el CC de la macro.
// Guardar la posición o editar rutas crea (o actualiza) la versión del sonido.
const MGROUP_ORDER = ['voice', 'osc', 'mixer', 'filter', 'env', 'lfo', 'fx', 'matrix', 'unknown'];
const MGROUP_TITLE = { voice: 'Voz', osc: 'Osciladores', mixer: 'Mezcla', filter: 'Filtro', env: 'Envolventes', lfo: 'LFO', fx: 'Efectos', matrix: 'Matriz de modulación', unknown: 'Sin identificar' };
const sgnN = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
function macroDestName(dest, dec) {
  const d = MACRO_DESTS[dest];
  if (!d) return { t: `Código ${dest}`, sub: 'fuera del rango documentado 0–70' };
  if (d.group === 'matrix') { const mi = dest - 50, m = dec.matrix[mi]; return { t: `Matriz ${mi + 1} · profundidad`, sub: m && m.active ? `${MOD_SOURCES[m.s1] ?? '?'}${m.s2 ? ' × ' + (MOD_SOURCES[m.s2] ?? '?') : ''} → ${MOD_DESTS[m.dest] ?? '?'}` : 'ruta de matriz vacía en este patch' }; }
  return { t: d.label, sub: '' };
}
// Parámetro real detrás de un destino de macro: offset, rango y cómo mostrar un valor.
function destParam(dest) {
  const d = MACRO_DESTS[dest]; if (!d || d.off == null) return null;
  const def = PARAMS.find((x) => x.off === d.off);
  if (d.group === 'matrix') return { off: d.off, min: 0, max: 127, show: (v) => sgnN(v - 64) };
  return { off: d.off, min: def ? def.min : 0, max: def ? def.max : 127, show: (v) => (def ? formatValue(def, v) : String(v)) };
}
function knobStatus(kn, a) {
  if (a.integrity.some((x) => x.knob === kn.index)) return ['e', '⚠ Revisar'];
  const sh = a.shared.find((x) => x.knobs.includes(kn.index));
  if (sh) return ['w', `⚠ Comparte con ${sh.knobs.filter((x) => x !== kn.index).map((x) => 'M' + (x + 1)).join(', ')}`];
  if (kn.activeCount) return ['ok', `✓ ${kn.activeCount} ${kn.activeCount === 1 ? 'destino' : 'destinos'}`];
  return ['z', kn.slots.some((s) => s.state !== 'empty') ? '○ Sin efecto' : '— Vacía'];
}
function knobName(kn, dec) {
  const act = kn.slots.filter((s) => s.state === 'active');
  if (!act.length) return 'Sin efecto';
  const first = macroDestName(act[0].dest, dec).t;
  return act.length > 1 ? `${first} +${act.length - 1}` : first;
}
// Posición de prueba (no guardada) por patch y knob
const mTest = (p, k) => (S.mtest?.[p.id]?.[k] ?? p.payload[204 + k * 17]);
function bigKnob(pos, saved, active) {
  const a0 = -135, ang = (v) => a0 + (v / 127) * 270, rad = (x) => (x - 90) * Math.PI / 180, R = 25, c = 32;
  const pt = (deg, r = R) => [c + r * Math.cos(rad(deg)), c + r * Math.sin(rad(deg))];
  const [sx, sy] = pt(a0), [fx, fy] = pt(135), [ex, ey] = pt(ang(pos)), [nx, ny] = pt(ang(pos), 13), [t1x, t1y] = pt(ang(saved), R + 3), [t2x, t2y] = pt(ang(saved), R + 8);
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M${sx} ${sy} A${R} ${R} 0 1 1 ${fx} ${fy}" fill="none" stroke="#3a3e43" stroke-width="4" stroke-linecap="round"/>${pos > 0 ? `<path d="M${sx} ${sy} A${R} ${R} 0 ${ang(pos) - a0 > 180 ? 1 : 0} 1 ${ex} ${ey}" fill="none" stroke="${active ? '#ff7a1a' : '#7d8186'}" stroke-width="4" stroke-linecap="round"/>` : ''}<circle cx="${c}" cy="${c}" r="17" fill="#202326" stroke="#3a3e43"/><line x1="${c}" y1="${c}" x2="${nx}" y2="${ny}" stroke="#ecebe4" stroke-width="3" stroke-linecap="round"/>${saved !== pos ? `<line x1="${t1x}" y1="${t1y}" x2="${t2x}" y2="${t2y}" stroke="#8b8e91" stroke-width="2"/>` : ''}</svg>`;
}
// Medidor de un destino: rango completo del parámetro, valor del patch, alcance y valor actual.
function meterHtml(sl, p, pos) {
  const dp = destParam(sl.dest); if (!dp) return '';
  const base = p.payload[dp.off], r = macroReach(sl, pos, base, dp.min, dp.max), pc = (v) => ((v - dp.min) / Math.max(1, dp.max - dp.min)) * 100;
  return html`<div class="meter" data-s="${sl.slot}"><i class="reach ${sl.depthSigned < 0 ? 'neg' : ''}" style="left:${pc(r.from)}%;width:${Math.max(0.8, pc(r.to) - pc(r.from))}%"></i><i class="base" style="left:${pc(base)}%"></i><i class="now" style="left:${pc(r.value)}%"></i></div>
    <div class="mread"><span>Patch <b>${dp.show(base)}</b></span><span>Con el knob en ${pos}: <b class="nowv">${dp.show(r.value)}</b></span><span>Con el knob a tope: <b>${dp.show(r.atMax)}</b>${r.clipped ? ' (tope del parámetro)' : ''}</span></div>`;
}
function routeSentence(sl, others) {
  const lo = Math.min(sl.start, sl.end), hi = Math.max(sl.start, sl.end);
  if (sl.depthSigned === 0) return 'Cantidad 0: todavía no hace nada.';
  if (sl.start === sl.end) return 'Inicio y fin del tramo coinciden: no hace nada.';
  const where = lo === 0 && hi === 127 ? 'en todo el giro del knob' : `solo cuando el knob está entre ${lo} y ${hi}`;
  return `${sl.depthSigned > 0 ? 'Sube' : 'Baja'} el valor ${where}${sl.start > sl.end ? ' (al revés: más knob, menos efecto)' : ''}.${others.length ? ` También lo mueve ${others.map((x) => 'M' + (x + 1)).join(' y ')}: los efectos se suman.` : ''}`;
}
function macroBoard(p, inf) {
  const a = inf.macros, dec = inf.an.decoded, live = !!S.dev.session, k = a.knobs[S.knob];
  const deck = html`<div class="mdeck" aria-label="Macros: arrastra un knob arriba/abajo, usa la rueda o las flechas">${a.knobs.map((kn) => { const [c, t] = knobStatus(kn, a), pos = mTest(p, kn.index);
    return html`<div class="mk ${kn.activeCount ? '' : 'off'} ${S.knob === kn.index ? 'cur' : ''}" data-act="knob" data-i="${kn.index}" data-knob="${kn.index}" role="slider" tabindex="0" aria-label="Macro ${kn.index + 1}: ${knobName(kn, dec)}" aria-valuemin="0" aria-valuemax="127" aria-valuenow="${pos}">
      <span class="no">${kn.index + 1}</span><span class="kn">${raw(bigKnob(pos, kn.position, kn.activeCount))}</span><span class="val ${pos !== kn.position ? 'test' : ''}">${pos}</span><span class="fn">${knobName(kn, dec)}</span><span class="st ${c}">${t}</span></div>`; })}</div>`;
  const pos = mTest(p, S.knob), dirty = pos !== k.position;
  const used = k.slots.filter((sl) => sl.state !== 'empty'), free = k.slots.find((sl) => sl.state === 'empty');
  const othersOf = (dest) => a.knobs.filter((x) => x.index !== S.knob && x.slots.some((sl) => sl.state === 'active' && sl.dest === dest)).map((x) => x.index);
  const destOptions = (cur) => MGROUP_ORDER.filter((g) => g !== 'unknown').map((g) => html`<optgroup label="${MGROUP_TITLE[g]}">${MACRO_DESTS.map((d, i) => d.group === g ? html`<option value="${i}" ${i === cur ? 'selected' : ''}>${macroDestName(i, dec).t}${d.group === 'matrix' && dec.matrix[i - 50]?.active ? ' · ' + macroDestName(i, dec).sub : ''}</option>` : '')}</optgroup>`);
  const savebar = html`<div class="msave ${dirty ? 'dirty' : ''}">${dirty ? html`<span>Posición de prueba <b>${pos}</b> · guardada en el patch: <b>${k.position}</b></span><button class="btn small primary" data-act="mSavePos">Guardar ${pos} como posición inicial</button><button class="btn small" data-act="mResetPos">Volver a ${k.position}</button>`
    : html`<span>Gira el knob para ver (y oír, con el equipo conectado) cómo cambia cada destino. <b>Girar no guarda nada.</b></span>`}<span class="sp"></span>
    <button class="btn small" data-act="sweep" data-k="${S.knob}" ${live ? '' : 'disabled'} title="Mantiene una nota y mueve la macro 0→127→0 (CC ${80 + S.knob})">${raw(IC.play)}Barrer</button><button class="btn small" data-act="knobMove" data-k="${S.knob}" data-d="-1" ${S.knob ? '' : 'disabled'} title="Intercambiar con la macro de la izquierda">◀</button><button class="btn small" data-act="knobMove" data-k="${S.knob}" data-d="1" ${S.knob < 7 ? '' : 'disabled'} title="Intercambiar con la macro de la derecha">▶</button></div>`;
  const routes = used.map((sl) => { const n = macroDestName(sl.dest, dec), open = S.mOpen === `${p.id}:${S.knob}:${sl.slot}`;
    return html`<div class="mroute ${sl.state === 'active' ? '' : 'inert'}" data-s="${sl.slot}"><div class="mhead"><span class="ab">${'ABCD'[sl.slot]}</span><b>${n.t}</b>${n.sub ? html`<span class="note">${n.sub}</span>` : ''}<span class="sp"></span><span class="amt ${sl.depthSigned < 0 ? 'neg' : ''}">${sgnN(sl.depthSigned)}</span><button class="btn small" data-act="mOpen" data-v="${S.knob}:${sl.slot}">${open ? 'Cerrar' : 'Editar'}</button></div>
      ${meterHtml(sl, p, pos)}<p class="say">${routeSentence(sl, othersOf(sl.dest))}</p>
      ${open ? html`<div class="ed"><label>Destino<select data-act="mroute" data-k="${S.knob}" data-s="${sl.slot}" data-f="dest">${destOptions(sl.dest)}</select></label>
        <label>Tramo del knob: desde<input type="number" min="0" max="127" value="${sl.start}" data-act="mroute" data-k="${S.knob}" data-s="${sl.slot}" data-f="start"></label>
        <label>hasta<input type="number" min="0" max="127" value="${sl.end}" data-act="mroute" data-k="${S.knob}" data-s="${sl.slot}" data-f="end"></label>
        <label>Cantidad ${sgnN(sl.depthSigned)}<input type="range" min="0" max="127" value="${sl.depth}" data-act="mroute" data-k="${S.knob}" data-s="${sl.slot}" data-f="depth"></label>
        <button class="btn small danger" data-act="mclear" data-k="${S.knob}" data-s="${sl.slot}">Quitar destino</button></div>` : ''}</div>`; });
  const detail = html`<div class="box mdetail"><h3>Macro ${S.knob + 1} · ${knobName(k, dec)} <small>${p.kind === 'variant' ? (lib.changeState(p) === 'adopted' ? 'editado' : 'copia') : 'original · al guardar o editar se crea su versión'}</small></h3>${savebar}
    <div class="mroutes">${routes.length ? routes : html`<p class="note">Esta macro no mueve nada todavía.</p>`}</div>
    ${free ? html`<div class="madd"><select data-act="mroute" data-k="${S.knob}" data-s="${free.slot}" data-f="newdest" aria-label="Añadir destino a la macro ${S.knob + 1}"><option value="">+ Añadir destino a M${S.knob + 1}…</option>${destOptions(-1)}</select><span class="note">${4 - k.slots.filter((x) => x.state === 'empty').length} de 4 destinos usados · se añade con todo el giro y +32</span></div>` : html`<p class="note">Los 4 destinos de esta macro están ocupados.</p>`}
    <p class="note" style="margin-top:8px">Barra: <i class="lg base"></i> valor guardado en el patch · <i class="lg reach"></i> hasta dónde llega la macro · <i class="lg now"></i> valor con el knob donde lo tienes. Los valores con el knob girado son aproximados. Con el equipo conectado, al girar lo oyes de verdad.</p></div>`;
  return html`${deck}${detail}`;
}
// Giro en vivo: actualiza knob, lectura y medidores sin redibujar toda la vista; manda el CC si hay equipo.
function knobLive(k, v) {
  const p = cur(); if (!p) return;
  v = Math.max(0, Math.min(127, Math.round(v)));
  (S.mtest ||= {})[p.id] ||= {}; if (S.mtest[p.id][k] === v) return; S.mtest[p.id][k] = v;
  const el = document.querySelector(`.mk[data-knob="${k}"]`), kn = lib.info(p).macros.knobs[k];
  if (el) { el.querySelector('.kn').innerHTML = bigKnob(v, kn.position, kn.activeCount); const vv = el.querySelector('.val'); vv.textContent = v; vv.classList.toggle('test', v !== kn.position); el.setAttribute('aria-valuenow', v); }
  if (k === S.knob) for (const sl of kn.slots) { const box = document.querySelector(`.mroute[data-s="${sl.slot}"]`); if (!box || sl.state === 'empty') continue; const mt = box.querySelector('.meter'); if (!mt) continue; const tmp = document.createElement('div'); tmp.innerHTML = meterHtml(sl, p, v).s ?? meterHtml(sl, p, v); mt.replaceWith(tmp.children[0]); box.querySelector('.mread').replaceWith(tmp.children[0]); }
  const s = S.dev.session;
  if (s) { if (S.mSentFor !== p.id + ':' + p.modifiedAt) { s.sendPatch(p.payload, S.dev.synth); S.mSentFor = p.id + ':' + p.modifiedAt; } const now = performance.now(); if (!S.mLastCC || now - S.mLastCC > 12) { s.cc(S.dev.synth, 80 + k, v); S.mLastCC = now; } }
}
function bindKnobs() {
  let drag = null;
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-knob]'); if (!el || e.button !== 0) return;
    const k = +el.dataset.knob, p = cur(); if (!p) return;
    drag = { k, y: e.clientY, v0: mTest(p, k), moved: false };
    try { el.setPointerCapture(e.pointerId); } catch { /* algunos navegadores */ }
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag) return; const dy = drag.y - e.clientY; if (Math.abs(dy) > 2) drag.moved = true;
    if (drag.moved) { e.preventDefault(); knobLive(drag.k, drag.v0 + dy * (e.shiftKey ? 0.2 : 0.8)); }
  }, { passive: false });
  document.addEventListener('pointerup', () => { if (!drag) return; const d = drag; drag = null; if (d.moved) { S.knob = d.k; S.suppressClick = true; setTimeout(() => (S.suppressClick = false), 0); rerender(); } });
  document.addEventListener('wheel', (e) => { const el = e.target.closest('[data-knob]'); if (!el) return; e.preventDefault(); const p = cur(); if (!p) return; const k = +el.dataset.knob; knobLive(k, mTest(p, k) + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 1 : 4)); clearTimeout(S.wheelT); S.wheelT = setTimeout(() => { S.knob = k; rerender(); }, 300); }, { passive: false });
  document.addEventListener('keydown', (e) => { const el = e.target.closest?.('[data-knob]'); if (!el || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'].includes(e.key)) return; e.preventDefault(); e.stopPropagation(); const p = cur(), k = +el.dataset.knob, st = e.key.startsWith('Page') ? 16 : e.shiftKey ? 1 : 4; knobLive(k, mTest(p, k) + (['ArrowUp', 'ArrowRight', 'PageUp'].includes(e.key) ? st : -st)); clearTimeout(S.wheelT); S.wheelT = setTimeout(() => { S.knob = k; rerender(); document.querySelector(`.mk[data-knob="${k}"]`)?.focus(); }, 300); }, true);
}
function tabMacros(p, inf) {
  const a = inf.macros, isVar = p.kind === 'variant', k = a.knobs[S.knob], groupsMap = {};
  a.knobs.forEach((kn) => kn.groups.forEach((g) => (groupsMap[g] ||= []).push(kn.index + 1)));
  const statusRows = [
    ...a.integrity.map((x) => ({ c: 'e', ic: IC.warn, t: 'Integridad', x: x.text })),
    ...a.observations.filter((o) => o.shared).map((x) => ({ c: 'w', ic: IC.warn, t: 'Destino compartido', x: x.text.replace('Destino compartido: ', '') })),
    ...a.observations.filter((o) => o.inactive).map((x) => ({ c: 'i', ic: IC.inf, t: 'Macro inactiva', x: x.text })),
    ...a.observations.filter((o) => !o.shared && !o.inactive).map((x) => ({ c: 'i', ic: IC.inf, t: 'Observación', x: x.text }))
  ];
  const fit = profileFit(p.payload, S.profile), live = !!S.dev.session;
  return html`${macroBoard(p, inf)}
  <div class="status">${statusRows.length ? statusRows.map((r) => html`<div class="${r.c}">${raw(r.ic)}<b>${r.t}</b><span>${r.x}</span></div>`) : html`<div class="o">${raw(IC.okc)}<b>Sin incidencias</b><span>Estructura dentro de los rangos documentados.</span></div>`}</div>
  <div class="box"><h3>Perfil de referencia <small>preferencia de trabajo, no requisito</small></h3>
    <select class="sel" data-act="profile" style="max-width:none">${Object.entries(PROFILES).map(([id, pr]) => html`<option value="${id}" ${S.profile === id ? 'selected' : ''}>${pr.title}</option>`)}</select>
    <table class="t" style="margin-top:6px"><tr><th>M</th><th>Perfil</th><th>Patch</th><th></th></tr>${fit.map((f) => html`<tr><td>${f.knob + 1}</td><td>${f.want.label}</td><td>${f.have}</td><td>${{ match: '✓', group: '≈', differs: '≠', empty: '○' }[f.status]}</td></tr>`)}</table>
    <div class="row2" style="margin-top:8px"><button class="btn small" data-act="applyProfile" data-m="reorder">Reordenar</button><button class="btn small" data-act="applyProfile" data-m="fill">Rellenar vacías</button><button class="btn small danger" data-act="applyProfile" data-m="rebuild">Reconstruir</button></div>
    <p class="note">«Reordenar» mueve macros completas sin perder rutas. «Rellenar» solo toca macros vacías. «Reconstruir» descarta las rutas de la copia (profundidad +32 y recorrido 0–127: valores de partida propios).</p></div>`;
}
function measuredBox(p) {
  const a = p.acoustic, d = a?.desc;
  if (!a) return html`<div class="box"><h3>Medición acústica <small>no medido</small></h3><p class="note">Con el equipo conectado por USB y su salida de audio entrando en una interfaz, «Medir» graba la nota de prueba y calcula ataque, cola, registro y brillo reales.</p><div class="row2"><button class="btn small" data-act="measureSel" ${S.dev.session && S.dev.audioId ? '' : 'disabled'}>${raw(IC.mic)}Medir</button></div></div>`;
  return html`<div class="box"><h3>Medición acústica <small>${a.at.slice(0, 16).replace('T', ' ')} · nota ${a.protocol?.note ?? '?'}</small></h3>
    ${d.silent ? html`<p class="note">Sin señal (pico ${d.peakDb.toFixed(1)} dBFS). Revisa la entrada de audio.</p>` : html`<div class="mfeat">${a.features.map((f) => html`<span class="badge" title="${f.basis}">${f.label}</span>`)}</div>
    <dl class="kv" style="margin-top:8px"><dt>f0</dt><dd>${d.f0 ? d.f0.toFixed(1) + ' Hz' + (d.octaveOffset ? ` (${d.octaveOffset > 0 ? '+' : ''}${d.octaveOffset} oct. respecto a la nota)` : '') : 'sin altura clara'}</dd><dt>Ataque</dt><dd>${d.attackMs.toFixed(0)} ms</dd><dt>Sustain</dt><dd>${(d.sustainRatio * 100).toFixed(0)} % del pico</dd><dt>Cola</dt><dd>${d.releaseMs.toFixed(0)} ms${d.releaseCapped ? '+' : ''}</dd><dt>Centroide</dt><dd>${d.centroid?.toFixed(0)} Hz${d.f0 ? ` (${(d.centroid / d.f0).toFixed(1)}× f0)` : ''}</dd><dt>Planitud</dt><dd>${d.flatness?.toFixed(2)}</dd><dt>Pico</dt><dd>${d.peakDb.toFixed(1)} dBFS · latencia ${d.latencyMs?.toFixed(0)} ms</dd></dl>`}
    <p class="note">Medido con la cadena de audio actual, macros en posición guardada y la nota de prueba. Compara entre patches medidos igual.</p>
    <div class="row2"><button class="btn small" data-act="measureSel" ${S.dev.session && S.dev.audioId ? '' : 'disabled'}>Volver a medir</button><button class="btn small" data-act="clearMeasure">Borrar medición</button></div></div>`;
}
function tabClass(p, inf) {
  const c = inf.cls, m = p.meta, cert = CERTAINTY[c.certainty], ev = [...c.evidence].sort((x, y) => y.pts - x.pts);
  return html`<div class="box"><h3>Propuesta <small>${{ rejected: 'rechazada', accepted: 'aceptada', manual: 'corregida a mano' }[m.classStatus] || 'pendiente'}</small></h3>
    <div class="grid3"><div><div class="mlabel">Categoría</div><div class="hf" style="font-size:20px">${c.category ? catName(c.category, c.subtype) : c.candidates ? c.candidates.map((x) => CAT_LABEL[x]).join(' / ') : 'Sin propuesta'}</div></div>
      <div><div class="mlabel">Certeza</div><div class="hf" style="font-size:16px">${cert.label}</div><div class="note">${cert.help}</div></div>
      <div><div class="mlabel">Uso</div><div class="note">${c.usage.map((u) => CAT_LABEL[u] || u).join(', ') || '—'}</div></div></div>
    <div class="row2" style="margin-top:10px"><button class="btn small primary" data-act="accept" ${c.category ? '' : 'disabled'}>Aceptar</button>
      <select class="sel" data-act="correct" aria-label="Corregir"><option value="">Corregir…</option>${folderOptions()}</select>
      <button class="btn small" data-act="reject">Rechazar</button><button class="btn small" data-act="exception" title="Fija la categoría solo para esta carga exacta">Excepción</button></div>
    <p class="note" style="margin-top:6px">Solo cambia tu ficha; los bytes SysEx no se tocan. Todo queda en el historial y se puede deshacer.</p></div>
  <div class="box"><h3>Auto tags <small>sugeridos por parámetros, nombre y medición · pulsa para añadir a tus etiquetas</small></h3><div class="chips tagchips">${[
    ...(c.category ? [{ t: catName(c.category, c.subtype), k: 'cat' }] : []), ...c.usage.map((u) => ({ t: CAT_LABEL[u] || u, k: 'use' })),
    ...c.descriptors.map((d) => ({ t: d.label, k: 'name' })), ...(p.acoustic?.features || []).filter((f) => f.id !== 'm-silent').map((f) => ({ t: f.label.replace(' (medido)', '').replace(' (medida)', ''), k: 'meas' })),
    ...inf.an.features.filter((f) => ['mono', 'poly', 'glide', 'percussive', 'slow-attack', 'long-release', 'acid-like', 'distortion', 'filter-drive', 'wavetable', 'detuned', 'density', 'ringmod', 'vsync', 'noise', 'lfo-mod', 'pitch-env', 'chorus'].includes(f.id)).map((f) => ({ t: f.label, k: 'par' }))
  ].map((x) => html`<button class="tagc ${x.k} ${(m.tags || []).includes(x.t) ? 'on' : ''}" data-act="addTag" data-t="${x.t}" title="${{ cat: 'Categoría propuesta', use: 'Uso', name: 'Del nombre', meas: 'Medido', par: 'De parámetros' }[x.k]}">${x.t}</button>`)}</div>
    <p class="note">Contorno: <span class="tagc cat">categoría</span> <span class="tagc meas">medido</span> <span class="tagc name">del nombre</span> <span class="tagc par">parámetros</span></p></div>
  <div class="box"><h3>Evidencias <small>puntos = peso de la fuente × fiabilidad</small></h3>${ev.length ? html`<table class="t"><tr><th>Categoría</th><th>Fuente</th><th>Motivo</th><th>Pts</th></tr>${ev.map((e) => html`<tr><td>${catName(e.cat, e.sub)}</td><td>${e.source}</td><td>${e.why}</td><td>${e.pts || ''}</td></tr>`)}</table>
    <p class="note">Totales: ${Object.entries(c.scores).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${CAT_LABEL[k]} ${Math.round(v * 10) / 10}`).join(' · ')}.</p>` : html`<p class="note">Ninguna fuente aporta indicios.</p>`}</div>
  ${c.contradictions.length ? html`<div class="status">${c.contradictions.map((x) => html`<div class="w">${raw(IC.warn)}<b>${x.kind === 'measured' ? 'Medición' : 'Contradicción'}</b><span>${x.text}</span></div>`)}</div>` : ''}
  <div class="grid2"><div class="box"><h3>Descriptores del nombre</h3>${c.descriptors.length ? html`<div class="chips">${c.descriptors.map((d) => html`<span class="badge prop" title="${d.source}: «${d.term}»">${d.label}</span>`)}</div><p class="note">Proceden del texto: no describen el sonido hasta que se escuchan o miden.</p>` : html`<p class="note">Ninguno.</p>`}</div>
    <div class="box"><h3>Pendiente</h3><ul class="note" style="margin:0;padding-left:16px">${c.pending.map((x) => html`<li>${x}</li>`)}</ul></div></div>
  <div class="box"><h3>Rasgos de configuración <small>parámetros, no sonido</small></h3><div class="chips">${inf.an.features.map((f) => html`<span class="badge ${f.kind === 'hypothesis' ? 'prop' : ''}" title="${f.basis}">${f.label}</span>`)}</div></div>
  <div class="box"><h3>Metadatos Novation <small>bytes 16 y 17</small></h3><p class="note">Categoría <b>${p.payload[16]}</b> · género <b>${p.payload[17]}</b>. Sin tabla oficial de nombres. Si compruebas en Components qué significa un código, regístralo:</p>
    <div class="row2"><select class="sel" id="nvcatCat"><option value="">Código ${p.payload[16]} significa…</option>${CATEGORIES.map((x) => html`<option value="${x.id}">${x.label}</option>`)}</select><button class="btn small" data-act="nvcatRule">Guardar regla</button></div></div>`;
}
function tabCompare(p) {
  const fam = lib.families().of.get(p.id);
  const near = nearest(p.payload, lib.faces().filter((x) => x.id !== p.id).map((x) => ({ id: x.id, payload: x.payload })), 8);
  const b = lib.byId(S.cmpB);
  const opts = [...(fam ? fam.members.filter((m) => m.id !== p.id).map((m) => m.id) : []), ...near.map((n) => n.id)].filter((v, i, a) => a.indexOf(v) === i);
  let body = html`<p class="note">Elige un patch: primero su familia, luego los técnicamente más parecidos.</p>`;
  if (b) {
    const rel = relation(p.payload, b.payload), groups = groupDiff(diffParams(p.payload, b.payload));
    body = html`<div class="status"><div class="${rel.level === 'different' ? 'i' : 'w'}">${raw(IC.inf)}<b>${rel.label}</b><span>Similitud técnica ${Math.round(similarity(p.payload, b.payload) * 100)}/100 (no equivale a similitud sonora) · ${groups.reduce((n, g) => n + g.items.length, 0)} bytes distintos</span></div></div>
    <div class="row2"><button class="btn small" data-act="abListen" data-w="a" ${S.dev.session ? '' : 'disabled'}>▶ A</button><button class="btn small" data-act="abListen" data-w="b" ${S.dev.session ? '' : 'disabled'}>▶ B</button><span class="note">Escucha A/B con la misma frase.</span></div>
    ${groups.map((g) => html`<div class="box"><h3>${g.label} <small>${g.items.length}</small></h3>${g.items.map((d) => html`<div class="diffrow"><span>${d.label} <span class="ev">${d.off}</span></span><div class="vv a"><span>${d.fa}</span><div class="bar"><i style="width:${(d.a / 127) * 100}%"></i></div></div><div class="vv b"><span>${d.fb}</span><div class="bar"><i style="width:${(d.b / 127) * 100}%"></i></div></div><span class="note hint">${d.hint}</span></div>`)}</div>`)}`;
  }
  return html`<div class="row2"><span class="mlabel">A · ${p.name}</span><select class="sel" data-act="cmpPick" style="max-width:none;flex:1"><option value="">B…</option>${opts.map((id) => { const q = lib.byId(id); return html`<option value="${id}" ${S.cmpB === id ? 'selected' : ''}>${q.name}${fam?.members.some((m) => m.id === id) ? ' · familia' : ''} — ${relation(p.payload, q.payload).label}</option>`; })}</select></div>${body}`;
}
function tabIdentity(p, inf) {
  const root = lib.rootOf(p), f = lib.fileOf(root), m = p.meta, md = mood(p, lib), c = inf.cls, copy = p.copyOf && lib.byId(p.copyOf), np = lib.proposalsOf(p).length;
  const packs = lib.banks.filter((b) => b.slots.includes(p.id)).map((b) => `${b.name} #${b.slots.indexOf(p.id) + 1}`);
  return html`<div class="box"><h3>Identidad</h3><div class="grid2"><dl class="kv">
      <dt>Nombre</dt><dd>${p.name}</dd><dt>Tipo</dt><dd>${m.category ? catName(m.category, m.subtype) : c.category ? catName(c.category, c.subtype) + ' (propuesta)' : '—'}</dd>
      <dt>Mood</dt><dd>${md ? `${md.label} · ${MOOD_SOURCE[md.source]}` : '—'}</dd><dt>Origen</dt><dd>${COMPAT_LABEL[compatOf(p).status]} · ${p.folderPath || p.bankName || '—'}</dd></dl>
    <dl class="kv"><dt>Pack</dt><dd>${packs.join(', ') || '—'}</dd><dt>Importado</dt><dd>${p.importedAt.slice(0, 10)}</dd><dt>Modificado</dt><dd>${(p.modifiedAt || p.importedAt).slice(0, 10)}</dd><dt>Favorito</dt><dd>${m.fav ? '★ Sí' : 'No'}</dd></dl></div>
    ${!m.category && c.category ? html`<div class="row2" style="margin-top:8px"><button class="btn small primary" data-act="accept">Aceptar «${catName(c.category, c.subtype)}»</button><button class="btn small" data-act="tab" data-t="tags">Ver evidencias</button></div>` : ''}</div>
  <div class="box"><h3>Ficha</h3>
    <div class="grid2"><label class="lab">Estado<select class="field" data-act="metaSel" data-k="review">${Object.entries(REVIEW).map(([k, v]) => html`<option value="${k}" ${m.review === k ? 'selected' : ''}>${v}</option>`)}</select></label>
      <label class="lab">Etiquetas (coma)<input class="field" data-act="metaTxt" data-k="tags" value="${(m.tags || []).join(', ')}"></label></div>
    <label class="lab" style="margin-top:8px">Notas de uso<textarea class="field" data-act="metaTxt" data-k="notes">${m.notes}</textarea></label>
    ${p.kind === 'variant' ? html`<label class="lab" style="margin-top:8px">Nombre interno (16 ASCII)<input class="field" data-act="rename" maxlength="16" value="${p.name}"></label>` : ''}</div>
  <div class="box"><h3>Archivo</h3><dl class="kv">
    <dt>Versión</dt><dd>${p.id !== root.id ? 'Editado' + (p.ops?.length ? ' (' + p.ops.join(' · ') + ')' : '') + ' · el original sigue guardado' : copy ? html`Copia de <a href="#" data-act="pick" data-id="${faceOf(copy).id}">${copy.name}</a>` : p.meta.lab ? 'Nacido en el Laboratorio' : 'Original'}${np ? ` · ${np} propuesta(s) pendiente(s)` : ''}</dd>
    <dt>Archivo</dt><dd>${root.fileName || p.fileName || '—'}${f?.reconstructed ? ' (reconstruido)' : ''}</dd>
    ${f ? html`<dt>SHA-256</dt><dd style="font-family:var(--mono);font-size:11px">${f.sha256.slice(0, 32)}…</dd><dt>Mensajes</dt><dd>${f.messageCount ?? 1}${f.isBank ? ' · banco de 64' : ''} · nº ${p.msgIndex + 1}</dd>` : ''}
    <dt>Cabecera</dt><dd>${p.header.product === 0x60 ? 'Circuit original (0x60)' : 'Circuit Tracks (0x64)'} · cmd ${p.header.command} · ubic. ${p.header.location}</dd>
    ${p.alsoFoundIn?.length ? html`<dt>También en</dt><dd>${p.alsoFoundIn.join(' · ')}</dd>` : ''}<dt>Escuchas</dt><dd>${m.auditions || 0}${m.lastAudition ? ' · última ' + m.lastAudition.slice(0, 10) : ''}</dd></dl>
    <div class="row2" style="margin-top:8px"><button class="btn small" data-act="exportSyx">Exportar .syx</button>${f ? html`<button class="btn small" data-act="exportOriginal">Archivo original</button>` : ''}<button class="btn small" data-act="queueOne">A la escucha</button><button class="btn small" data-act="duplicate">Duplicar como sonido nuevo</button><button class="btn small danger" data-act="deleteOne">Eliminar</button></div></div>`;
}
function tabCompat(p) {
  const c = compatOf(p), lv = { ok: ['o', IC.okc], info: ['i', IC.inf], warn: ['w', IC.warn] };
  return html`<div class="box"><h3>Compatibilidad <small>${COMPAT_LABEL[c.status]}</small></h3><div class="status">${c.checks.map((x) => html`<div class="${lv[x.level][0]}">${raw(lv[x.level][1])}<b>${x.level === 'ok' ? 'OK' : x.level === 'warn' ? 'Revisar' : 'Nota'}</b><span>${x.text}</span></div>`)}</div></div>
  <div class="box"><h3>Qué significa</h3><dl class="kv"><dt>Tracks</dt><dd>Mensaje con cabecera de Circuit Tracks (producto 0x64).</dd><dt>Circuit</dt><dd>Patch del Circuit original (0x60). Novation Components acepta SysEx de ambos modelos.</dd><dt>Convertido</dt><dd>Variante de un patch del Circuit original: se exporta con cabecera de Circuit Tracks.</dd><dt>Duplicado</dt><dd>Misma síntesis que otro patch de la biblioteca (puede cambiar solo el nombre).</dd></dl>
    ${c.dupOf ? html`<div class="row2" style="margin-top:8px"><button class="btn small" data-act="cmpWith" data-id="${c.dupOf}">Comparar con el original</button></div>` : ''}</div>`;
}
function tabAudit(p, inf) {
  const a = auditChecks(p, lib, S.profile), lv = { ok: ['o', IC.okc], info: ['i', IC.inf], warn: ['w', IC.warn] };
  const hist = lib.history.filter((h) => h.ids?.includes(p.id)).slice(-8).reverse();
  return html`<div class="box"><h3>Auditoría <small><b class="okn">${a.passed}</b> de ${a.total} comprobaciones</small></h3><div class="status">${a.items.map((x) => html`<div class="${lv[x.level][0]}">${raw(lv[x.level][1])}<b>${x.group}</b><span>${x.text}</span></div>`)}</div><p class="note" style="margin-top:6px">Recuento de comprobaciones, no una nota de calidad: un patch con macros vacías puede ser perfecto para tu uso.</p></div>
  ${measuredBox(p)}
  <div class="box"><h3>Integridad</h3>${inf.integrity.length ? html`<ul class="note" style="margin:0;padding-left:16px">${inf.integrity.map((x) => html`<li>${x.level === 'info' ? '' : '⚠ '}${x.text}</li>`)}</ul>` : html`<p class="note"><span class="dot ok"></span>Valores dentro de los rangos documentados.</p>`}</div>
  <div class="box"><h3>Historial</h3>${hist.length ? html`<table class="t">${hist.map((h) => html`<tr class="${h.undone ? 'dim' : ''}"><td>${h.at.slice(0, 16).replace('T', ' ')}</td><td>${h.text}</td><td>${h.undoable && !h.undone ? html`<button class="btn small" data-act="undo" data-id="${h.id}">Deshacer</button>` : h.undone ? 'deshecho' : ''}</td></tr>`)}</table>` : html`<p class="note">Sin cambios.</p>`}</div>`;
}
// ---------- vistas completas ----------
// ===== PATRONES =====
function patInit() {
  if (S.pat) return;
  const p = cur(), inf = p && lib.info(p), cat = p && (p.meta.category || inf.cls.category);
  const d = lib.settings.patternDraft;
  if (!S.patMode && d?.mode) S.patMode = d.mode;
  if (d?.pat && (d.pat.kind === 'drum') === isDrumMode()) { S.patOpts = d.opts; S.pat = d.pat; S.patId = d.id || null; return; }
  if (isDrumMode()) { S.patOpts = { ...DRUM_DEFAULTS, seed: 1 + Math.floor(Math.random() * 9999) }; S.pat = generateDrums(S.patOpts); S.patId = null; return; }
  S.patOpts = { ...DEFAULTS, style: STYLE_FOR_CAT[cat] || 'offbeat', seed: 1 + Math.floor(Math.random() * 9999) };
  S.pat = generatePattern(S.patOpts); S.patId = null;
}
function patSaveDraft() { clearTimeout(S.patDraftT); S.patDraftT = setTimeout(() => { lib.settings.patternDraft = { opts: S.patOpts, pat: S.pat, id: S.patId, mode: S.patMode || 'synth' }; lib.store.putMany('settings', [{ id: 'patternDraft', value: lib.settings.patternDraft }]); }, 400); } // sin emit: no invalida cachés de la biblioteca
function patRegen() { S.patPrev = S.pat; S.pat = isDrumMode() ? generateDrums(S.patOpts) : generatePattern(S.patOpts); if (S.patId) S.pat.name = findPattern(S.patId)?.name || S.pat.name; patSaveDraft(); }
function patRows(pt) {
  const iv = (SCALES[pt.scale] || SCALES.minor).iv, base = pt.octave + pt.root, ns = pt.notes.map((e) => e.n);
  const lo = Math.min(base - 5, ...ns), hi = Math.max(base + 19, ...ns), rows = [];
  for (let n = hi; n >= lo; n--) { const inScale = iv.includes((((n - pt.root) % 12) + 12) % 12); if (inScale || ns.includes(n)) rows.push({ n, root: (((n - pt.root) % 12) + 12) % 12 === 0, inScale }); }
  return rows;
}
function patGrid(pt) {
  const rows = patRows(pt), N = pt.steps, starts = new Map(pt.notes.map((e) => [e.t + ':' + e.n, e]));
  const head = html`<div class="pg-row pg-head"><span class="pg-lab"></span>${Array.from({ length: N }, (_, t) => html`<span class="pg-c ${t % 4 === 0 ? 'pg-beat' : ''} ${t % 16 === 0 ? 'pg-bar' : ''}">${t % 4 === 0 ? t / 4 + 1 : ''}</span>`)}</div>`;
  const body = rows.map((r) => html`<div class="pg-row ${r.root ? 'root' : ''} ${r.inScale ? '' : 'out'}"><span class="pg-lab">${noteName(r.n)}</span>${Array.from({ length: N }, (_, t) => { const e = starts.get(t + ':' + r.n);
    return html`<span class="pg-c ${t % 4 === 0 ? 'pg-beat' : ''} ${t % 16 === 0 ? 'pg-bar' : ''}" data-act="patCell" data-t="${t}" data-n="${r.n}" title="${noteName(r.n)} · paso ${t + 1}">${e ? html`<i class="pg-n ${e.v >= 120 ? 'acc' : ''} ${e.slide ? 'sl' : ''}" style="width:calc(${e.d * 100}% - 2px)"></i>` : ''}</span>`; })}</div>`);
  const lane = pt.cc?.length ? html`<div class="pg-row pg-lane"><span class="pg-lab">M${pt.cc[0].num - 79}</span>${Array.from({ length: N }, (_, t) => { const c = pt.cc.find((x) => x.t === t); return html`<span class="pg-c ${t % 4 === 0 ? 'pg-beat' : ''}"><i style="height:${c ? (c.v / 127) * 100 : 0}%"></i></span>`; })}</div>` : '';
  return html`<div class="pgrid" style="--n:${N}">${head}${body}${lane}</div>`;
}
// Destino → canal (según Equipo / Setup View del Circuit)
function destChannel(d) { const D = S.dev; return d === 'synth1' ? D.channels[0] : d === 'synth2' ? D.channels[1] : d === 'midi1' ? (D.chMidi?.[0] ?? 2) : d === 'midi2' ? (D.chMidi?.[1] ?? 3) : (D.chDrum ?? 9); }
const isDrumMode = () => S.patMode === 'drum';
const recLanes = () => S.recLanes || [true, true, true, true];
const waitMs = (ms) => new Promise((r) => setTimeout(r, ms));
function patDest() { return isDrumMode() ? 'drums' : (S.patDest || 'synth1'); }
function patSwitch(mode) {
  if ((S.patMode || 'synth') === mode) return;
  (S.patStore ||= {})[S.patMode || 'synth'] = { pat: S.pat, opts: S.patOpts, id: S.patId, prev: S.patPrev };
  S.patMode = mode; const st = S.patStore[mode];
  if (st?.pat) Object.assign(S, { pat: st.pat, patOpts: st.opts, patId: st.id, patPrev: st.prev });
  else if (mode === 'drum') { S.patOpts = { ...DRUM_DEFAULTS, seed: 1 + Math.floor(Math.random() * 9999) }; S.pat = generateDrums(S.patOpts); S.patId = null; S.patPrev = null; }
  else { S.pat = null; patInit(); }
}
function drumGrid(pt) {
  const N = pt.steps, at = new Map(pt.notes.map((e) => [e.lane + ':' + e.t, e])), on = recLanes();
  const head = html`<div class="pg-row pg-head"><span class="pg-lab"></span>${Array.from({ length: N }, (_, t) => html`<span class="pg-c ${t % 4 === 0 ? 'pg-beat' : ''} ${t % 16 === 0 ? 'pg-bar' : ''}">${t % 4 === 0 ? t / 4 + 1 : ''}</span>`)}</div>`;
  const rows = [0, 1, 2, 3].map((lane) => html`<div class="pg-row dr ${on[lane] ? "" : "lane-off"}"><span class="pg-lab" title="${DRUM_ROLES[lane]}">Drum ${lane + 1}<small>${DRUM_ROLES[lane]}</small></span>${Array.from({ length: N }, (_, t) => { const e = at.get(lane + ':' + t);
    return html`<span class="pg-c ${t % 4 === 0 ? 'pg-beat' : ''} ${t % 16 === 0 ? 'pg-bar' : ''}" data-act="patDrum" data-lane="${lane}" data-t="${t}" title="Drum ${lane + 1} · paso ${t + 1}${e ? ' · velocidad ' + e.v : ''}">${e ? html`<i class="pg-hit l${lane} ${e.v >= 120 ? 'acc' : e.v <= 60 ? 'gh' : ''}"></i>` : ''}</span>`; })}</div>`);
  return html`<div class="pgrid drums" style="--n:${N}">${head}${rows}</div>`;
}
// Avisos de lo que el Circuit hace con lo que recibe (guía de usuario de Novation): escala del proyecto y swing.
function circuitHints(pt) {
  const out = [];
  if (pt.kind !== 'drum') {
    const sc = SCALES[pt.scale] || SCALES.minor, off = outOfScale(pt);
    out.push(html`<li>Escala del proyecto en el Circuit: <b>${NOTE_NAMES_ES[pt.root]} ${sc.ct}</b> (Scale View, pad ${sc.pad}; tónica en la fila de abajo). Si el proyecto está en otra escala, el Circuit mueve cada nota que no encaje a la más cercana; con <b>Chromatic</b> (pad 32) se graba tal cual.${off.length ? html` <span class="warnc">${off.length} nota(s) del patrón están fuera de ${sc.label.toLowerCase()}: usa Chromatic en el Circuit.</span>` : ''}</li>`);
  }
  if (pt.swing > 0) out.push(html`<li>Swing ${Math.round(pt.swing * 100)} %: ${S.recSwing === 'micro' ? html`se graba desplazado; desactiva <b>Rec Quantise</b> (Mayús + Record, en rojo) o el Circuit lo alinea al paso.` : html`se graba recto. Para oírlo igual, pon el swing del Circuit en <b>${circuitSwing(pt.swing)}</b> (Tempo View, macro 2; aproximado).`}</li>`);
  return out;
}
function sendBox(pt, p) {
  const live = !!S.dev.session, d = patDest(), drum = isDrumMode(), N = S.recSteps || 16, ch = destChannel(d) + 1, lanes = recLanes();
  const synthIdx = d === 'synth1' ? 0 : d === 'synth2' ? 1 : -1, hints = circuitHints(pt), kit = S.dev.drumKit || [0, 0, 0, 0];
  return html`<div class="box sendbox"><h3>Enviar al Circuit Tracks</h3>
    <div class="row2" style="flex-wrap:wrap;gap:8px">${drum ? html`<span class="note">Pistas:</span>${[0, 1, 2, 3].map((l) => html`<label class="dchk ${lanes[l] ? 'on' : ''}"><input type="checkbox" class="chk" data-act="patLane" data-lane="${l}" ${lanes[l] ? 'checked' : ''}> Drum ${l + 1}</label>`)}`
      : html`<span class="note">Destino:</span>${[['synth1', 'Synth 1'], ['synth2', 'Synth 2'], ['midi1', 'MIDI 1'], ['midi2', 'MIDI 2']].map(([k, l]) => html`<button class="btn small ${d === k ? 'on' : ''}" data-act="patDest" data-v="${k}">${l}</button>`)}`}
      <span class="sp"></span><span class="note">Pasos en el Circuit:</span>${[16, 32].map((n) => html`<button class="btn small ${N === n ? 'on' : ''}" data-act="recSteps" data-v="${n}">${n}</button>`)}</div>
    <p class="note" style="margin:6px 0">${drum ? html`Canal ${ch}: ${lanes.map((on, l) => (on ? `Drum ${l + 1} = nota ${DRUM_NOTES[l]}` : null)).filter(Boolean).join(' · ')}.` : html`Canal ${ch}.`} ${pt.steps !== N ? html`El patrón tiene ${pt.steps} pasos: se ${pt.steps > N ? `enviarán los ${N} primeros` : `repetirá hasta llenar ${N}`}.` : ''} ${N === 32 ? html`<b>En el Circuit, pon antes el patrón en 32 pasos</b> (botón Step Page): si no, la segunda mitad se graba encima de la primera.` : ''}</p>
    ${hints.length ? html`<ul class="hints">${hints}</ul>` : ''}
    ${pt.swing > 0 ? html`<div class="row2" style="gap:6px;margin:4px 0"><span class="note">Swing al grabar:</span><button class="btn small ${S.recSwing === 'micro' ? '' : 'on'}" data-act="recSwing" data-v="straight">Recto + swing del Circuit</button><button class="btn small ${S.recSwing === 'micro' ? 'on' : ''}" data-act="recSwing" data-v="micro">Desplazado (sin Rec Quantise)</button></div>` : ''}
    ${synthIdx >= 0 && p ? html`<label class="note"><input type="checkbox" class="chk" data-act="opt" data-k="recPatch" ${S.recPatch !== false ? 'checked' : ''}> Cargar también «${p.name}» en ${DESTS[d].label} (solo RAM; para conservarlo, guarda el proyecto en el Circuit)</label>` : ''}
    ${d.startsWith('midi') ? html`<p class="note">MIDI 1/2 sacan las notas por su salida hacia otro equipo. Que el Circuit grabe en esas pistas las notas que le llegan por USB no está documentado: compruébalo con un patrón corto.</p>` : ''}
    ${drum ? html`<details class="kit" ${kit.some(Boolean) ? 'open' : ''}><summary>Sonido de cada Drum (opcional)</summary><p class="note">Elige uno de los 64 samples del Circuit para cada pista. Se envía por CC en el canal ${destChannel('drums') + 1} antes de escuchar o grabar (CC 8, 18, 44 y 50, según la guía de Novation). Cambia el proyecto abierto en el Circuit: guárdalo con Save si te gusta.</p>
      <div class="kitrow">${[0, 1, 2, 3].map((l) => html`<label class="lab">Drum ${l + 1}<select class="field" data-act="drumKit" data-lane="${l}"><option value="0" ${kit[l] ? '' : 'selected'}>Sin cambiar</option>${Array.from({ length: 64 }, (_, k) => html`<option value="${k + 1}" ${kit[l] === k + 1 ? 'selected' : ''}>Sample ${k + 1} · página ${Math.floor(k / 16) + 1}, pad ${(k % 16) + 1}</option>`)}</select></label>`)}</div></details>` : ''}
    <div class="row2" style="margin-top:8px"><button class="btn" data-act="patPlay" data-loop="0" ${live ? '' : 'disabled'}>${raw(IC.play)}Escuchar en ${drum ? 'Drum 1–4' : DESTS[d].label}</button><button class="btn ${S.patLooping ? 'on' : ''}" data-act="patPlay" data-loop="1" ${live ? '' : 'disabled'}>⟳ Bucle</button><button class="btn" data-act="patStop" ${live ? '' : 'disabled'}>${raw(IC.stop)}Parar</button>
      <span class="sp"></span><button class="btn rec" data-act="patRec" ${live && !S.recording ? '' : 'disabled'}>● ${S.recording ? 'Grabando…' : 'Grabar en el Circuit'}</button></div>
    ${live ? '' : html`<p class="note" style="margin-top:6px">Conecta el Circuit Tracks por USB en <a href="#" data-act="view" data-v="device">Equipo</a> para escuchar y grabar. Sin equipo puedes generar, editar y exportar a .mid.</p>`}</div>`;
}
// ---- Grabar varias pistas de una pasada: un patrón por destino, con el mismo reloj ----
const MT_DESTS = [['synth1', 'Synth 1', 'synth'], ['synth2', 'Synth 2', 'synth'], ['midi1', 'MIDI 1', 'synth'], ['midi2', 'MIDI 2', 'synth'], ['drums', 'Drum 1–4', 'drum']];
function mtPattern(v) {
  if (!v) return null;
  if (v === 'cur:synth' || v === 'cur:drum') { const want = v === 'cur:drum' ? 'drum' : 'synth'; if ((S.patMode || 'synth') === want) return S.pat; return S.patStore?.[want]?.pat || null; }
  return findPattern(v) || null;
}
function multiBox() {
  const mt = S.mtSel || {}, saved = lib.settings.patterns || [], live = !!S.dev.session, N = S.recSteps || 16;
  const rows = MT_DESTS.map(([k, l, kind]) => {
    const cur = kind === 'drum' ? 'cur:drum' : 'cur:synth', curPat = mtPattern(cur);
    const opts = [['', '— nada —'], ...(curPat ? [[cur, `En pantalla: ${curPat.name}`]] : []), ...saved.filter((x) => (x.kind === 'drum') === (kind === 'drum')).map((x) => [x.id, x.name])];
    const pt = mtPattern(mt[k]), att = pt && pt.id && kind === 'synth' && lib.patches.find((q) => q.meta.patternId === pt.id && q.kind !== 'variant');
    return html`<tr><td><b>${l}</b><br><span class="note">canal ${destChannel(k) + 1}</span></td><td><select class="field" data-act="mtSet" data-k="${k}">${opts.map(([v, t]) => html`<option value="${v}" ${(mt[k] || '') === v ? 'selected' : ''}>${t}</option>`)}</select></td>
      <td class="note">${pt ? html`${pt.steps} pasos · ${pt.notes.length} ${kind === 'drum' ? 'golpes' : 'notas'}${(k === 'synth1' || k === 'synth2') && att ? html` · carga «${att.name}»` : ''}` : ''}</td></tr>`;
  });
  const n = MT_DESTS.filter(([k]) => mtPattern(mt[k])).length;
  return html`<div class="box multibox"><h3>Grabar varias pistas de una vez</h3>
    <p class="note">Elige un patrón para cada pista y la herramienta las graba a la vez con el mismo reloj: por ejemplo, el bajo en Synth 1, el arpegio en Synth 2 y la batería en Drum 1–4. Usa el tempo del patrón en pantalla (${S.pat.tempo} BPM) y ${N} pasos.${(S.dev.channels[0] === S.dev.channels[1]) ? ' ⚠ Synth 1 y Synth 2 tienen el mismo canal: revísalo en Equipo.' : ''}</p>
    <table class="t">${rows}</table>
    <label class="note"><input type="checkbox" class="chk" data-act="opt" data-k="mtPatch" ${S.mtPatch !== false ? 'checked' : ''}> En Synth 1 y 2, cargar antes el patch que tenga adjunto cada patrón (solo RAM)</label>
    <div class="row2" style="margin-top:8px"><button class="btn" data-act="mtPlay" ${live && n ? '' : 'disabled'}>${raw(IC.play)}Escuchar juntas</button><span class="sp"></span><button class="btn rec" data-act="mtRec" ${live && n && !S.recording ? '' : 'disabled'}>● Grabar ${n} pista${n === 1 ? '' : 's'} en el Circuit</button></div></div>`;
}
function mtBuild(N) {
  const mt = S.mtSel || {}, events = [], ccs = [], patches = [];
  const bake = (pt) => (S.recSwing === 'micro' && pt.swing ? (t) => (t % 2 === 1 ? t + pt.swing : t) : (t) => t);
  for (const [k, , kind] of MT_DESTS) {
    const pt0 = mtPattern(mt[k]); if (!pt0) continue;
    const pt = fitSteps(pt0, N), sw = bake(pt), r = patternEvents(pt, { channel: destChannel(k), drumChannel: destChannel('drums'), lanes: kind === 'drum' ? recLanes() : undefined });
    events.push(...r.events.map((e) => ({ ...e, t: sw(e.t) }))); ccs.push(...r.ccs.map((c) => ({ ...c, t: sw(c.t) })));
    if ((k === 'synth1' || k === 'synth2') && S.mtPatch !== false && pt0.id) { const att = lib.patches.find((q) => q.meta.patternId === pt0.id && q.kind !== 'variant'); const v = att && (lib.replacementOf(att) || att); if (v) patches.push([v, k === 'synth1' ? 0 : 1]); }
  }
  return { events, ccs, patches };
}
async function sendDrumKit() {
  const s = S.dev.session, kit = S.dev.drumKit || [];
  if (!s || !kit.some(Boolean)) return 0;
  const ch = destChannel('drums'), cc = [8, 18, 44, 50]; let t = s.clock() + 5;
  kit.forEach((v, l) => { if (v) { s.raw([0xB0 | ch, cc[l], v - 1], t); t += 5; } });
  await waitMs(60); return 60;
}
function viewPatterns() {
  patInit();
  const drum = isDrumMode(), o = S.patOpts, pt = S.pat, p = cur(), saved = lib.settings.patterns || [];
  const sel = (k, opts, v) => html`<select class="field" data-act="patSet" data-k="${k}">${opts.map(([val, l]) => html`<option value="${val}" ${String(v) === String(val) ? 'selected' : ''}>${l}</option>`)}</select>`;
  const rng = (k, v, min, max, step, fmt) => html`<label class="lab">${fmt}<input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-act="patSet" data-k="${k}"></label>`;
  const attached = (id) => lib.faces().filter((x) => x.meta.patternId === id).length;
  const steps = sel('steps', [[16, '16 (1 compás)'], [32, '32 (2 compases)'], [64, '64 (4 compases, solo .mid)']], o.steps);
  const seed = html`<label class="lab">Semilla<span class="row2" style="gap:4px"><input class="field" type="number" min="1" max="99999" value="${o.seed}" data-act="patSet" data-k="seed" style="width:90px"><button class="btn small" data-act="patSeed" title="Otra variación con los mismos ajustes">🎲</button><button class="btn small" data-act="patVary" title="Variación del patrón actual: misma idea con algunos cambios, para el patrón siguiente en el Circuit">Variar</button></span></label>`;
  let ctl;
  if (drum) {
    const st = DRUM_STYLES[o.style];
    ctl = html`<div class="box patctl"><h3>Generador de batería</h3>
      <label class="lab">Estilo${sel('style', Object.entries(DRUM_STYLES).map(([k, x]) => [k, x.label]), o.style)}</label><p class="note">${st.desc}</p>
      <div class="grid2"><label class="lab">Pasos${steps}</label><label class="lab">Tempo<input class="field" type="number" min="40" max="240" value="${o.tempo ?? st.tempo}" data-act="patSet" data-k="tempo"></label>${seed}<label class="lab">Remate final<select class="field" data-act="patSet" data-k="fill"><option value="1" ${o.fill ? 'selected' : ''}>Sí</option><option value="0" ${o.fill ? '' : 'selected'}>No</option></select></label></div>
      ${rng('density', o.density, 0, 1, 0.05, html`Densidad <b>${Math.round(o.density * 100)} %</b>`)}
      ${rng('humanize', o.humanize, 0, 0.5, 0.05, html`Variación de velocidad <b>${Math.round(o.humanize * 100)} %</b>`)}
      ${rng('swing', o.swing, 0, 0.5, 0.02, html`Swing <b>${Math.round(o.swing * 100)} %</b>`)}
      <p class="note" style="margin-top:8px">Cada carril es una pista de batería del Circuit. En el kit de fábrica: Drum 1 bombo, Drum 2 caja, Drum 3 charles cerrado y Drum 4 percusión; si usas otros samples, el patrón suena con los tuyos.</p></div>`;
  } else {
    const st = STYLES[o.style];
    ctl = html`<div class="box patctl"><h3>Generador de sintetizador</h3>
      <label class="lab">Estilo${sel('style', Object.entries(STYLES).map(([k, x]) => [k, x.label]), o.style)}</label><p class="note">${st.desc}</p>
      <div class="grid2"><label class="lab">Tónica${sel('root', NOTE_NAMES_ES.map((x, i) => [i, x]), o.root)}</label><label class="lab">Escala${sel('scale', Object.entries(SCALES).map(([k, x]) => [k, x.label]), o.scale)}</label>
      <label class="lab">Registro${sel('octave', [['', `Del estilo (${noteName(st.oct)})`], ...[24, 36, 48, 60, 72].map((n) => [n, 'Desde ' + noteName(n)])], o.octave ?? '')}</label><label class="lab">Pasos${steps}</label>
      <label class="lab">Tempo<input class="field" type="number" min="40" max="240" value="${o.tempo}" data-act="patSet" data-k="tempo"></label>${seed}</div>
      ${rng('density', o.density ?? st.density, 0, 1, 0.05, html`Densidad <b>${Math.round((o.density ?? st.density) * 100)} %</b>`)}
      ${rng('accent', o.accent ?? st.accent ?? 0.15, 0, 1, 0.05, html`Acentos <b>${Math.round((o.accent ?? st.accent ?? 0.15) * 100)} %</b>`)}
      ${rng('slide', o.slide ?? st.slide ?? 0, 0, 1, 0.05, html`Ligados <b>${Math.round((o.slide ?? st.slide ?? 0) * 100)} %</b>`)}
      ${rng('gate', o.gate ?? st.gate, 0.1, 1, 0.05, html`Duración de nota <b>${Math.round((o.gate ?? st.gate) * 100)} %</b>`)}
      ${rng('swing', o.swing, 0, 0.5, 0.02, html`Swing <b>${Math.round(o.swing * 100)} %</b>`)}
      <h4 class="mlabel" style="margin-top:12px">Carril de macro</h4><p class="note">Mueve una macro mientras suena (CC 80–87), para oír cómo responde el patch.</p>
      <div class="grid2"><label class="lab">Macro${sel('mknob', [[-1, 'Ninguna'], ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => [k, 'M' + (k + 1) + (p ? ' · ' + knobName(lib.info(p).macros.knobs[k], lib.info(p).an.decoded) : '')])], o.macro.knob)}</label><label class="lab">Forma${sel('mshape', Object.entries(MACRO_SHAPES), o.macro.shape)}</label>
      <label class="lab">Desde<input class="field" type="number" min="0" max="127" value="${o.macro.lo}" data-act="patSet" data-k="mlo"></label><label class="lab">Hasta<input class="field" type="number" min="0" max="127" value="${o.macro.hi}" data-act="patSet" data-k="mhi"></label></div></div>`;
  }
  const list = saved.filter((x) => (x.kind === 'drum') === drum);
  return html`<div class="pad"><div class="ptitle"><h2>Patrones</h2><p>Genera patrones mientras eliges patch, escúchalos en el Circuit Tracks y grábalos directamente en su secuenciador: Synth 1, Synth 2, MIDI 1, MIDI 2 o las cuatro baterías. También se exportan a .mid para Ableton.</p></div>
  <div class="modetabs"><button class="${drum ? '' : 'on'}" data-act="patMode" data-v="synth">Sintetizador</button><button class="${drum ? 'on' : ''}" data-act="patMode" data-v="drum">Batería</button></div>
  ${howTo([['Genera', drum ? 'elige estilo y densidad; «🎲» da otra variación con los mismos ajustes.' : 'elige estilo, tonalidad y escala; «🎲» da otra variación con los mismos ajustes.'], ['Edita', drum ? 'clic pone o quita un golpe · Mayús+clic: acento · Alt+clic: golpe fantasma.' : 'clic añade o quita una nota · Mayús+clic: acento · Alt+clic: ligado.'], ['Escucha', 'lo toca el Circuit en la pista de destino, una vez o en bucle, sin grabar nada.'], ['Graba', 'con REC activado en el Circuit, «Grabar en el Circuit» lo arranca desde el paso 1 con su reloj, toca el patrón exacto y lo para. Después, Save en el equipo.']])}
  <div class="patgrid">${ctl}
    <div><div class="box patmain"><h3>${pt.name}${pt.edited ? html` <small>editado a mano</small>` : ''}${S.patId ? html` <small>guardado</small>` : ''}</h3>
      <div class="transport"><span class="note">${drum ? html`${pt.notes.length} golpes` : html`Patch: <b>${p ? p.name : 'ninguno'}</b> ${p ? html`<span class="note">(${p.meta.category ? CAT_LABEL[p.meta.category] : 'elige otro en Biblioteca'})</span>` : ''}`}</span><span class="sp"></span>${S.patPrev ? html`<button class="btn small" data-act="patUndo" title="Volver al patrón anterior">Deshacer</button>` : ''}</div>
      ${drum ? drumGrid(pt) : patGrid(pt)}
      <p class="note" style="margin-top:6px">${drum ? `${pt.steps} pasos · ${pt.tempo} BPM${pt.swing ? ` · swing ${Math.round(pt.swing * 100)} %` : ''} · color claro = acento, apagado = golpe fantasma.` : `${pt.notes.length} notas · ${pt.steps} pasos · ${pt.tempo} BPM${pt.swing ? ` · swing ${Math.round(pt.swing * 100)} %` : ''} · Do3 = nota MIDI 60 (como en Ableton). La fila resaltada es la tónica.`}</p>
      <div class="row2" style="margin-top:10px"><button class="btn" data-act="patSave">${S.patId ? 'Guardar cambios' : 'Guardar patrón'}</button>${S.patId ? html`<button class="btn" data-act="patSaveNew">Guardar como nuevo</button>` : ''}
        ${drum ? '' : html`<button class="btn accent" data-act="patAttach" ${p ? '' : 'disabled'}>Adjuntar a «${p ? p.name : '—'}»</button>`}
        <button class="btn" data-act="patMidi">Exportar .mid</button>${drum ? html`<button class="btn" data-act="patMidi" data-gm="1" title="Notas 36/38/42/46 para un Drum Rack de Ableton">.mid (Drum Rack)</button>` : ''}<button class="btn" data-act="patJson" title="Formato de la herramienta: se puede volver a cargar">.json</button></div></div>
      ${sendBox(pt, p)}</div>
  </div>
  ${multiBox()}
  <div class="box"><h3>Tus patrones de ${drum ? 'batería' : 'sintetizador'} <small>${list.length}</small></h3>${list.length ? html`<table class="t"><tr><th>Nombre</th><th>Estilo</th><th>${drum ? 'Pasos' : 'Tonalidad'}</th>${drum ? '' : html`<th>Adjunto a</th>`}<th></th></tr>${list.map((x) => html`<tr class="${S.patId === x.id ? 'curow' : ''}"><td>${x.name}</td><td>${(drum ? DRUM_STYLES : STYLES)[x.style]?.label || x.style}${x.edited ? ' · editado' : ''}</td><td>${drum ? x.steps + ' pasos' : `${NOTE_NAMES_ES[x.root]} ${(SCALES[x.scale] || SCALES.minor).label.toLowerCase()} · ${x.steps} pasos`}</td>${drum ? '' : html`<td>${attached(x.id)} patch(es)</td>`}<td class="acts"><button class="btn small" data-act="patLoad" data-id="${x.id}">Abrir</button><button class="btn small" data-act="patMidi" data-id="${x.id}">.mid</button><button class="btn small danger" data-act="patDel" data-id="${x.id}" aria-label="Borrar">✕</button></td></tr>`)}</table>` : html`<p class="note">Aún no has guardado patrones de ${drum ? 'batería' : 'sintetizador'}.${drum ? '' : ' Los guardados aparecen también en Escucha (selector de frase).'}</p>`}
    <p class="note" style="margin-top:8px">El Circuit Tracks no recibe patrones por SysEx; por eso la herramienta graba como lo harías tú, pero exacto: hace de reloj maestro (Start + reloj MIDI), toca el patrón y lo para justo al acabar. El equipo debe tener <b>Clock Rx</b> activado en Setup (viene así de fábrica). Se graba encima de lo que haya en el patrón: usa uno vacío.</p></div></div>`;
}
let patTimer = null;
async function patPlay(loop) {
  const s = S.dev.session, p = cur(); if (!s) return;
  patStopNow(); S.patLooping = !!loop;
  const d = patDest(), synthIdx = d === 'synth1' ? 0 : d === 'synth2' ? 1 : -1;
  if (isDrumMode()) await sendDrumKit();
  const pt = S.pat, { events, ccs } = patternEvents(pt, { channel: destChannel(d), drumChannel: destChannel('drums'), lanes: recLanes() });
  let t0 = s.clock() + 60;
  if (synthIdx >= 0 && p && S.recPatch !== false) t0 = s.sendPatch(p.payload, synthIdx) + (S.dev.patchDelay ?? 80);
  const go = (start) => { const r = s.playEvents(events, { tempo: pt.tempo, steps: pt.steps, swing: pt.swing, start, ccs }); if (S.patLooping) patTimer = setTimeout(() => go(r.loopEnd), Math.max(0, r.loopEnd - performance.now() - 120)); };
  go(t0);
}
// Lista de comprobación antes de grabar (se puede ocultar).
async function recChecklist(what, N, tempo, extra = '') {
  if (S.recNoHelp) return true;
  const go = await modal('Grabar en el Circuit Tracks', html`<ol class="steps">
      <li>En el Circuit, abre el proyecto y elige un <b>patrón vacío</b> en ${what}: la grabación se suma a lo que haya.</li>
      ${N === 32 ? html`<li>Pon ese patrón en <b>32 pasos</b> (botón Step Page).</li>` : ''}
      ${extra}
      <li>Comprueba que <b>Clock Rx</b> está activado (Setup View; viene activado de fábrica).</li>
      <li>Pulsa <b>REC</b> en el Circuit (sin Play).</li>
      <li>Pulsa «Grabar ahora». La herramienta arranca el Circuit desde el paso 1, toca ${N} pasos a ${tempo} BPM y lo para.</li>
      <li>Después, Play para oírlo y <b>Save</b> para guardar el proyecto.</li></ol>
      <label class="note"><input type="checkbox" class="chk" id="recNoHelp"> No volver a mostrar estos pasos</label>`,
    [{ label: 'Cancelar', value: null }, { label: '● Grabar ahora', primary: true, value: (m) => ({ skip: $('#recNoHelp', m).checked }) }]);
  if (!go) return false; if (go.skip) { S.recNoHelp = true; await saveSettings(); }
  return true;
}
async function runRecord(events, ccs, N, tempo, label, count, unit) {
  const s = S.dev.session;
  const r = s.recordPattern(events, { tempo, steps: N, swing: 0, ccs, lead: 250 });
  S.recording = true; rerender();
  toast(`● Grabando ${N} pasos en ${label}…`, Math.max(1500, r.end - performance.now()));
  await waitMs(Math.max(0, r.end - performance.now() + 150));
  S.recording = false; rerender();
  toast(`Grabado en ${label}: ${count} ${unit}. Pulsa Play en el Circuit para oírlo y Save para guardar el proyecto.`, 8000);
}
// La herramienta es el reloj maestro durante exactamente N pasos.
async function patRecord() {
  const s = S.dev.session, p = cur(); if (!s || S.recording) return;
  const d = patDest(), N = S.recSteps || 16, synthIdx = d === 'synth1' ? 0 : d === 'synth2' ? 1 : -1, drum = isDrumMode();
  const pt = fitSteps(S.pat, N), sc = SCALES[pt.scale] || SCALES.minor;
  const extra = drum ? '' : html`<li>Pon la escala del proyecto en <b>${NOTE_NAMES_ES[pt.root]} ${sc.ct}</b> o en <b>Chromatic</b>: si no, el Circuit mueve las notas que no encajen.</li>`;
  if (!(await recChecklist(drum ? 'las pistas Drum' : DESTS[d].label, N, pt.tempo, extra))) return;
  patStopNow();
  const sw = S.recSwing === 'micro' && pt.swing ? (t) => (t % 2 === 1 ? t + pt.swing : t) : (t) => t;
  const r = patternEvents(pt, { channel: destChannel(d), drumChannel: destChannel('drums'), lanes: recLanes() });
  const events = r.events.map((e) => ({ ...e, t: sw(e.t) })), ccs = r.ccs.map((c) => ({ ...c, t: sw(c.t) }));
  if (drum) await sendDrumKit();
  if (synthIdx >= 0 && p && S.recPatch !== false) { s.sendPatch(p.payload, synthIdx); await waitMs((S.dev.patchDelay ?? 80) + 60); }
  await runRecord(events, ccs, N, pt.tempo, drum ? 'Drum 1–4' : DESTS[d].label, events.length, drum ? 'golpes' : 'notas');
}
async function mtRecord(listenOnly) {
  const s = S.dev.session; if (!s || S.recording) return;
  const N = S.recSteps || 16, tempo = S.pat.tempo, b = mtBuild(N);
  if (!b.events.length) { toast('Elige al menos un patrón con notas'); return; }
  const names = MT_DESTS.filter(([k]) => mtPattern((S.mtSel || {})[k])).map(([, l]) => l).join(', ');
  if (!listenOnly && !(await recChecklist(names, N, tempo, html`<li>Pon la escala del proyecto a juego con los patrones de sintetizador, o en <b>Chromatic</b>.</li>`))) return;
  patStopNow();
  if ((S.mtSel || {}).drums) await sendDrumKit();
  for (const [v, idx] of b.patches) { s.sendPatch(v.payload, idx); await waitMs(30); }
  if (b.patches.length) await waitMs((S.dev.patchDelay ?? 80) + 60);
  if (listenOnly) { s.playEvents(b.events, { tempo, steps: N, swing: 0, ccs: b.ccs }); return; }
  await runRecord(b.events, b.ccs, N, tempo, names, b.events.length, 'notas y golpes');
}
function patStopNow() { clearTimeout(patTimer); patTimer = null; S.patLooping = false; const s = S.dev.session; if (s) s.stopChannels([...new Set([...S.dev.channels, ...(S.dev.chMidi || [2, 3]), S.dev.chDrum ?? 9])]); }
async function patNameBox(def) { return modal('Nombre del patrón', html`<input class="field" id="patNm" value="${def}" maxlength="60" style="width:100%">`, [{ label: 'Cancelar', value: null }, { label: 'Guardar', primary: true, value: (m) => $('#patNm', m).value.trim() || def }]); }
async function patStore(asNew) {
  const list = [...(lib.settings.patterns || [])];
  if (S.patId && !asNew) { const i = list.findIndex((x) => x.id === S.patId); if (i >= 0) { list[i] = { ...S.pat, id: S.patId, opts: S.patOpts, savedAt: Date.now() }; await lib.setSetting('patterns', list); return list[i]; } }
  const name = await patNameBox(S.pat.name); if (!name) return null;
  const rec = { ...S.pat, name, id: 'pat' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), opts: S.patOpts, savedAt: Date.now() };
  list.push(rec); await lib.setSetting('patterns', list); S.patId = rec.id; S.pat = { ...S.pat, name }; patSaveDraft(); return rec;
}
function midiName(pt, p) { const safe = (x) => String(x).replace(/[^\w \-áéíóúñÁÉÍÓÚÑ]+/g, '_').trim().slice(0, 60); return (p ? safe(p.name) + ' - ' : '') + safe(pt.name) + '.mid'; }
// ===== CAMBIOS · v3.10: un sonido, una versión; las propuestas esperan aquí =====
const ORIGIN_LABEL = { register: 'Octava / tono', edit: 'Edición', 'macro-normalize': 'Macros normalizadas', 'macro-profile': 'Macros según perfil', template: 'Plantilla de macros', copy: 'Copia', live: 'Macros desde el equipo' };
const originLabel = (v) => ORIGIN_LABEL[v.origin] || (v.origin?.startsWith('macro') ? 'Macros' : v.origin ? 'Edición' : 'Variante');
const CHG_STEPS = [
  ['Original', 'El archivo que importaste. Nunca se modifica, ni aquí ni en tu disco: siempre puedes volver a él.'],
  ['Una versión', 'Lo que editas (octava, macros, parámetros…) se suma en una sola versión por sonido: es la que suena, la que ves en la lista y la que se exporta. Nada de copias sueltas.'],
  ['Propuestas', 'Lo que la herramienta corrige en bloque y no tiene claro queda como propuesta: escúchala (A/B) y aplícala (se suma a la versión) o descártala.'],
  ['Exportar', 'Organizar → Ordenar en disco, Packs o .syx: va la versión de cada sonido, con el nombre y el sitio del original. Al Circuit, solo a la RAM para escuchar.']
];
// Cómo quedaría el sonido si se aplica la propuesta: su versión actual + lo que cambia la propuesta.
function proposalApplied(v) { const f = faceOf(v), pl = new Uint8Array(f.payload); for (const [o, x] of lib.proposalDiff(v)) pl[o] = x; return pl; }
const diffLine = (a, b, n = 2) => { const d = diffParams(a, b).filter((x) => x.off >= 16); return d.length ? d.slice(0, n).map((x) => `${x.label}: ${x.fa}→${x.fb}`).join(' · ') + (d.length > n ? ` · +${d.length - n}` : '') : '—'; };
let _vp = null;
const versionsPlanNow = () => { if (!_vp || _vp.v !== S.version) _vp = { v: S.version, plan: lib.versionsPlan() }; return _vp.plan; };
function howTo(steps) { return html`<ol class="flow small" aria-label="Cómo funciona">${steps.map(([t, d], i) => html`<li><b><span>${i + 1}</span>${t}</b><p>${d}</p></li>`)}</ol>`; }
function chgSteps(active) {
  return html`<ol class="flow">${CHG_STEPS.map(([t, d], i) => html`<li class="${i === active ? 'on' : i < active ? 'done' : ''}"><b><span>${i + 1}</span>${t}</b><p>${d}</p></li>`)}</ol>`;
}
// Por qué se propone esa categoría, en dos o tres palabras (lista de la Biblioteca).
function whyText(c, user) {
  if (user) return ['manual', 'Decidido por ti'];
  if (c.certainty === 'ambiguous') return ['ambiguous', 'Dudoso'];
  if (c.certainty === 'none') return ['none', 'Sin pistas'];
  if (c.certainty === 'technical') return ['technical', 'Por sus ajustes'];
  return [c.certainty, 'Por ' + (c.basis?.length ? c.basis.join(' + ') : 'el nombre')];
}
function whyTag(c, user) {
  const [lvl, t] = whyText(c, user), warn = !user && c.contradictions.length;
  return html`<span class="why w-${lvl}" title="${CERTAINTY[lvl].label}: ${CERTAINTY[lvl].help}${warn ? ' · ⚠ ' + c.contradictions.map((x) => x.text).join(' · ') : ''}">${warn ? '⚠ ' : ''}${t}</span>`;
}
function chgBadge(p) {
  const st = lib.changeState(p), np = lib.proposalsOf(p).length;
  const ed = st === 'adopted' ? html` <span class="badge chg ok" title="Editado${p.ops?.length ? ': ' + p.ops.join(' · ') : ''}. Suena y se exporta así; el original sigue guardado.">editado</span>` : '';
  const cp = p.copyOf ? html` <span class="badge chg" title="Copia independiente de otro sonido">copia</span>` : '';
  return html`${ed}${cp}${np ? html` <span class="badge chg draft" title="${np} cambio(s) propuesto(s): escúchalos y aplícalos o descártalos (ficha o Cambios)">${np} propuesta${np > 1 ? 's' : ''}</span>` : ''}`;
}
function chgInspector(p) {
  const root = lib.rootOf(p), isV = p.id !== root.id, props = lib.proposalsOf(p), copy = p.copyOf && lib.byId(p.copyOf);
  if (!isV && !props.length && !copy) return '';
  const d = isV ? diffParams(root.payload, p.payload).filter((x) => x.off >= 16) : [], live = !!S.dev.session;
  return html`<div class="isec chgbox ${isV ? 'adopted' : ''}"><div class="mlabel"><span>Versión</span><span>${isV ? 'editado' : copy ? 'copia' : 'original'}</span></div>
    ${isV ? html`<p class="note">Suena y se exporta así. El original sigue guardado${p.ops?.length ? html`. Cambios: <b>${p.ops.join(' · ')}</b>` : ''}.</p>
      ${d.length ? html`<ul class="chglist">${d.slice(0, 4).map((x) => html`<li><span>${x.label}</span><b>${x.fa} → ${x.fb}</b></li>`)}${d.length > 4 ? html`<li class="note">y ${d.length - 4} cambio(s) más · pestaña Comparar</li>` : ''}</ul>` : html`<p class="note">Aún igual que el original.</p>`}
      <div class="row2" style="margin-top:6px"><button class="btn small" data-act="chgAB" data-id="${p.id}" ${live ? '' : 'disabled'} title="Toca la frase con el original y después con esta versión">A/B con el original</button><button class="btn small" data-act="chgRevert" data-id="${p.id}" title="La versión va a la papelera (Ctrl Z la devuelve)">Volver al original</button></div>` : ''}
    ${copy ? html`<p class="note">Copia independiente de <a href="#" data-act="pick" data-id="${faceOf(copy).id}">«${copy.name}»</a>: tiene su propia carpeta y sus etiquetas.</p>` : ''}
    ${props.length ? html`<div class="mlabel sm" style="margin-top:10px"><span>Propuestas pendientes</span><span>${props.length}</span></div>
      ${props.map((v) => html`<div class="propc"><div><b>${originLabel(v)}</b> <span class="note">${v.originText || ''}</span></div><div class="note mono">${diffLine(p.payload, proposalApplied(v), 3)}</div>
        <div class="row2" style="margin-top:4px"><button class="btn small" data-act="chgAB" data-id="${v.id}" ${live ? '' : 'disabled'} title="Toca el sonido tal como está y después con la propuesta">A/B</button><button class="btn small primary" data-act="chgAdopt" data-id="${v.id}" data-on="1" title="Se suma a la versión del sonido">Aplicar</button><button class="btn small danger" data-act="chgDrop" data-id="${v.id}" title="A la papelera (Ctrl Z la devuelve)">Descartar</button></div></div>`)}` : ''}</div>`;
}
function viewChangesList() {
  const props = lib.patches.filter((v) => v.kind === 'variant' && lib.isVersion(v) && lib.changeState(v) === 'draft'), edited = lib.faces().filter((f) => lib.changeState(f) === 'adopted');
  const list = (S.chgShow || 'draft') === 'draft' ? props : edited;
  return list.filter((v) => !S.chgOrigin || originLabel(v) === S.chgOrigin);
}
function viewChanges() {
  const props = lib.patches.filter((v) => v.kind === 'variant' && lib.isVersion(v) && lib.changeState(v) === 'draft'), edited = lib.faces().filter((f) => lib.changeState(f) === 'adopted');
  const show = S.chgShow === 'adopted' ? 'adopted' : 'draft', list = viewChangesList(), origins = [...new Set((show === 'draft' ? props : edited).map(originLabel))], live = !!S.dev.session, plan = versionsPlanNow();
  const propRow = (v) => { const f = faceOf(v);
    return html`<tr><td><a href="#" data-act="pick" data-id="${f.id}">${f.name}</a></td><td>${originLabel(v)}<small class="note" style="display:block">${v.originText || ''}</small></td><td class="mono">${diffLine(f.payload, proposalApplied(v))}</td>
      <td class="acts"><button class="btn small" data-act="chgAB" data-id="${v.id}" ${live ? '' : 'disabled'}>A/B</button><button class="btn small primary" data-act="chgAdopt" data-id="${v.id}" data-on="1">Aplicar</button><button class="btn small danger" data-act="chgDrop" data-id="${v.id}" aria-label="Descartar">✕</button></td></tr>`; };
  const edRow = (f) => { const root = lib.rootOf(f);
    return html`<tr><td><a href="#" data-act="pick" data-id="${f.id}">${f.name}</a></td><td>${(f.ops || [f.originText]).filter(Boolean).join(' · ') || 'Edición'}</td><td class="mono">${diffLine(root.payload, f.payload)}</td>
      <td class="acts"><button class="btn small" data-act="chgAB" data-id="${f.id}" ${live ? '' : 'disabled'} title="Original y después la versión">A/B</button><button class="btn small" data-act="chgRevert" data-id="${f.id}">Volver al original</button></td></tr>`; };
  return html`<div class="pad"><div class="ptitle"><h2>Cambios</h2><p>Cada sonido tiene <b>una sola versión</b>: la que suena, la que ves en la lista y la que se exporta. Lo que editas se suma en ella. Lo que una corrección en bloque no tiene claro queda como <b>propuesta</b>: escúchala y aplícala o descártala.</p></div>
    ${chgSteps(props.length ? 2 : edited.length ? 1 : 0)}
    ${plan.sounds.length ? html`<div class="box tidybox"><h3>Ordenar versiones de antes <small>${plan.sounds.length} sonido(s)</small></h3>
      <p class="note">Con la forma anterior de guardar cambios se acumulaban copias: cadenas de versiones aceptadas, ramas abandonadas y borradores iguales al original. Ordenarlas deja <b>una versión por sonido</b> (con exactamente lo que sonaba), unifica carpeta, etiquetas y valoración, y lleva lo que sobra a la papelera. Los packs siguen apuntando al sonido. Se puede deshacer entero.</p>
      <div class="statgrid" style="margin:8px 0"><div class="stat"><strong>${plan.collapse}</strong><span>cadenas de versiones</span></div><div class="stat"><strong>${plan.drop.length}</strong><span>variantes que sobran</span></div><div class="stat"><strong>${plan.keep.length}</strong><span>propuestas que cambian algo</span></div><div class="stat"><strong>${plan.meta}</strong><span>con datos distintos</span></div></div>
      <div class="row2"><button class="btn primary" data-act="tidyRun">Ordenar (las propuestas quedan pendientes)</button>${plan.keep.length ? html`<button class="btn" data-act="tidyRun" data-drop="1">Ordenar y descartar también las ${plan.keep.length} propuestas</button>` : ''}</div></div>` : ''}
    <div class="statgrid" style="margin:12px 0"><div class="stat"><strong>${props.length}</strong><span>propuestas pendientes</span></div><div class="stat g"><strong>${edited.length}</strong><span>sonidos editados</span></div></div>
    <div class="row2" style="margin-bottom:10px">${[['draft', `Propuestas (${props.length})`], ['adopted', `Editados (${edited.length})`]].map(([k, l]) => html`<button class="btn small ${show === k ? 'on' : ''}" data-act="chgShow" data-v="${k}">${l}</button>`)}
      <select class="sel" data-act="chgOrigin"><option value="">Todos los orígenes</option>${origins.map((o) => html`<option ${S.chgOrigin === o ? 'selected' : ''}>${o}</option>`)}</select><span class="sp"></span>
      ${show === 'draft' && list.length ? html`<button class="btn primary" data-act="chgAdoptAll">Aplicar las ${list.length} de la lista</button><button class="btn danger" data-act="chgDropAll">Descartarlas</button>` : ''}</div>
    ${list.length ? html`<div class="box" style="overflow:auto"><table class="t"><tr><th>Sonido</th><th>${show === 'draft' ? 'Propuesta' : 'Cambios'}</th><th>Qué cambia</th><th></th></tr>${list.slice(0, 400).map(show === 'draft' ? propRow : edRow)}</table>${list.length > 400 ? html`<p class="note">Mostrando 400 de ${list.length}.</p>` : ''}</div>`
      : html`<div class="box"><p class="note">${show === 'draft' ? 'No hay propuestas pendientes.' : 'Todavía no has editado ningún sonido. Se editan al corregir octavas, girar y guardar macros, aplicar plantillas o cambiar parámetros.'}</p></div>`}
    <div class="box nextbox"><h3>Siguiente paso</h3><p>Al exportar va la versión de cada sonido, con el nombre y el sitio de su original. Las propuestas pendientes no se exportan.</p>
      <div class="row2"><button class="btn accent" data-act="goDisk">Ordenar en disco</button><button class="btn" data-act="view" data-v="banks">Montar un pack</button></div></div></div>`;
}
// Explicación tras corregir en bloque desde cualquier herramienta
async function afterChanges(n, adopted, what) { // adopted: true (todas), false (ninguna) o número de aplicadas
  const nA = adopted === true ? n : adopted || 0, nP = n - nA;
  const go = await modal(`${n} ${n === 1 ? 'sonido corregido' : 'sonidos corregidos'}`, html`<p>${what}</p>
    <p>${nA ? html`<b>${nA} ya forman parte de la versión de su sonido</b>: suenan y se exportan así (cada sonido sigue teniendo una sola versión). ` : ''}${nP ? html`<b>${nP} quedan como propuesta</b>: escúchalas y aplícalas o descártalas en <b>Cambios</b> (o en la ficha de cada sonido).` : ''}</p>
    <p class="note">Tus archivos originales no se han tocado y nada se ha enviado al Circuit Tracks. Todo está guardado en la biblioteca de este navegador; haz una copia de seguridad en Datos.</p>`,
    [S.view === 'organize' && S.orgTab === 'register' && nP ? { label: 'Revisión rápida', value: 'review', primary: true } : { label: 'Ver en Cambios', value: 'changes', primary: !!nP }, { label: 'Ordenar en disco', value: 'disk', primary: !nP }, { label: 'Seguir aquí', value: null }]);
  if (go === 'changes') { S.view = 'changes'; S.chgShow = nP ? 'draft' : 'adopted'; rerender(); }
  if (go === 'disk') { S.view = 'organize'; S.orgTab = 'disk'; rerender(); }
  if (go === 'review') { S.regView = 'review'; S.revI = 0; rerender(); revAutoPlay(); }
}
// A/B: la misma frase, primero A y después B (solo RAM del equipo).
// Versión: A = original, B = versión. Propuesta: A = el sonido como está, B = con la propuesta aplicada.
function abPlay(v) {
  const s = S.dev.session; if (!s || !v) return;
  const root = lib.rootOf(v), prop = lib.changeState(v) === 'draft';
  const a = prop ? faceOf(v).payload : root.payload, b = prop ? proposalApplied(v) : v.payload;
  s.stopAll();
  const tp = testPlan(faceOf(v)), opt = (t) => ({ tempo: tempoNow(), root: tp.root, start: t + (S.dev.patchDelay ?? 80) });
  toast(prop ? 'A: como está → B: con la propuesta' : 'A: original → B: tu versión', 4000);
  const ra = s.playPhrase(tp.ph, S.dev.synth, opt(s.sendPatch(a, S.dev.synth)));
  setTimeout(() => { s.playPhrase(tp.ph, S.dev.synth, opt(s.sendPatch(b, S.dev.synth))); }, Math.max(0, ra.end - performance.now()));
}
function renderFull() { return { patterns: viewPatterns, songs: viewSongs, changes: viewChanges, audition: viewAudition, organize: viewOrganize, analyze: viewAnalyze, macros: viewMacroStudio, analyzeOld: viewMap, audit: viewAudit, banks: viewBanks, device: viewDevice, data: viewData }[S.view](); }

// ===== ORGANIZAR =====
function viewOrganize() {
  if (!lib.patches.length) return html`<div class="empty"><h3>Nada que organizar</h3><p>Importa tu carpeta de patches primero.</p></div>`;
  const tabs = [['rean', 'Reanalizar'], ['folders', 'Carpetas y subcarpetas'], ['arch', 'Mismo synth, otros ajustes'], ['register', 'Octava y tono'], ['dups', 'Duplicados'], ['disk', 'Ordenar en disco'], ['trash', `Papelera${lib.trashCount() ? ' (' + lib.trashCount() + ')' : ''}`]];
  return html`<div class="ptitle"><h2>Organizar</h2><p>Herramientas para poner orden en una colección grande: agrupar patches que son el mismo sintetizador con otros ajustes, corregir la octava de los bajos, limpiar duplicados y volcar todo ordenado a una carpeta.</p></div>
  <div class="subtabs">${tabs.map(([k, l]) => html`<button class="btn ${S.orgTab === k ? 'on' : ''}" data-act="orgTab" data-t="${k}">${l}</button>`)}</div>
  ${{ rean: orgRean, folders: orgFolders, arch: orgArch, register: orgRegister, dups: orgDups, disk: orgDisk, trash: orgTrash }[S.orgTab]()}`;
}
function orgTrash() {
  const list = lib.trash(), n = lib.trashCount();
  const when = (at) => new Date(at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return html`<div class="box"><h3>Papelera <small>${n} patch(es) · se vacía sola a los 30 días</small></h3>
    <p class="note">Lo que eliminas (tecla Supr en Escucha o en la biblioteca) viene aquí: deja de aparecer en la biblioteca, en los packs y en las colecciones, pero se puede recuperar con su sitio en los packs. Vaciar la papelera lo borra de esta herramienta para siempre; <b>tus archivos del disco no se tocan nunca</b>.</p>
    ${list.length ? html`<table class="t"><tr><th>Cuándo</th><th>Qué</th><th></th></tr>${list.map((h) => { const ps = h.before.patches; return html`<tr><td class="num">${when(h.at)}</td><td>${ps.slice(0, 6).map((p) => p.name).join(' · ')}${ps.length > 6 ? html` <span class="note">y ${ps.length - 6} más</span>` : ''}</td><td class="acts"><button class="btn small" data-act="trashRestore" data-h="${h.id}">Recuperar</button><button class="btn small danger" data-act="trashPurge" data-h="${h.id}">Eliminar definitivamente</button></td></tr>`; })}</table>
      <div class="row2" style="margin-top:10px"><span class="sp"></span><button class="btn danger" data-act="trashEmpty">Vaciar la papelera (${n})</button></div>` : html`<div class="empty"><h3>La papelera está vacía</h3><p>Pulsa Supr mientras escuchas para quitar de en medio los patches que no quieras.</p></div>`}</div>`;
}
// ---------- Reanalizar: categorías, subcarpetas y etiquetas de toda la biblioteca, sin audio ----------
const REAN_TABS = () => [['cat', 'Por nombre o ajustes'], ['nn', 'Por parecido'], ['sub', 'Subcarpetas'], ['tags', 'Etiquetas'], ['conflict', 'Contradicen tu categoría'], ['none', 'Sin pistas']];
function orgRean() {
  const r = S.rean, o = S.reanOpt || (S.reanOpt = { cat: true, nn: true, sub: true, fx: true, ch: false, nm: true });
  const refs = lib.nnRefs().refs.length;
  const head = html`${howTo([['Reanaliza', 'vuelve a leer nombres, carpetas, ajustes y tus reglas; y compara cada patch con los que ya has clasificado tú.'], ['Revisa', 'qué cambiaría y por qué, por tipo de cambio.'], ['Aplica', 'solo lo que marques; todo queda en el historial y se puede deshacer.'], ['Escucha', 'lo que queda sin pistas: se manda a Escucha en un clic.']])}
  <div class="box"><h3>Reanalizar la biblioteca <small>${r ? 'último: ' + new Date(r.at).toTimeString().slice(0, 5) + ' · ' + r.total + ' patches' : 'no hace falta el audio'}</small></h3>
    <p class="note">Sin medir con la salida de audio: la propuesta sale del nombre y la carpeta, de cómo está programado cada patch, de tus reglas y del <b>parecido</b> con los ${refs} patches que ya tienen categoría tuya${refs < 8 ? ' (hacen falta al menos 8 para usarlo)' : ''}. Cuantos más clasifiques, mejor acierta el parecido.</p>
    <div class="row2" style="margin-top:8px"><button class="btn accent" data-act="reanRun" ${S.reanBusy ? 'disabled' : ''}>${S.reanBusy ? 'Analizando… ' + S.reanBusy : r ? 'Volver a analizar' : 'Reanalizar ahora'}</button></div></div>`;
  if (!r) return head;
  const T = REAN_TABS(), tab = S.reanTab || 'cat', cnt = { cat: r.cat.length, nn: r.nn.length, sub: r.sub.length, tags: r.tags.length, conflict: r.conflict.length, none: r.none.length + r.weak.length };
  const name = (id) => lib.byId(id)?.name || '—', tagN = (k) => r.tags.reduce((a, x) => a + (x[k].length ? 1 : 0), 0);
  const rows = { cat: r.cat, nn: r.nn, sub: r.sub, tags: r.tags, conflict: r.conflict, none: [...r.weak, ...r.none] }[tab];
  const cell = (x) => tab === 'tags' ? html`<td>${[...x.fx.map((t) => html`<span class="tq hint">${t}</span>`), ...x.nm.map((t) => html`<span class="tq">${t}</span>`), ...x.ch.map((t) => html`<span class="tq pdesc">${t}</span>`)]}</td><td class="note">${x.fx.length ? 'efectos · ' : ''}${x.nm.length ? 'nombre · ' : ''}${x.ch.length ? 'ajustes' : ''}</td>`
    : tab === 'conflict' ? html`<td>${catName(x.from)} → <b>${catName(x.to)}</b></td><td class="note">${x.why}</td>`
    : tab === 'none' ? html`<td>${x.to ? html`<span class="dimc">quizá ${catName(x.to)}</span>` : '—'}${x.nn ? html` <span class="note">· parecido a ${catName(x.nn.cat)} (${x.nn.n} de ${x.nn.k})</span>` : ''}</td><td class="note">${x.why || 'sin pistas'}</td>`
    : html`<td><b>${catName(x.to, x.sub)}</b></td><td class="note">${x.why}</td>`;
  return html`${head}
  <div class="statgrid" style="margin-top:12px">${T.map(([k, l]) => html`<button class="stat ${tab === k ? 'on' : ''} ${k === 'conflict' && cnt[k] ? 'w' : ''}" data-act="reanTab" data-t="${k}"><strong>${cnt[k]}</strong><span>${l}</span></button>`)}</div>
  <div class="box"><h3>Aplicar <small>solo lo marcado</small></h3>
    <div class="reanopts">
      <label class="note"><input type="checkbox" class="chk" data-act="reanOpt" data-k="cat" ${o.cat ? 'checked' : ''}> Categoría propuesta por nombre o ajustes con pistas claras (${r.cat.length})</label>
      <label class="note"><input type="checkbox" class="chk" data-act="reanOpt" data-k="nn" ${o.nn ? 'checked' : ''}> Categoría por parecido con lo que ya clasificaste, ≥ 70 % de los votos (${r.nn.length})</label>
      <label class="note"><input type="checkbox" class="chk" data-act="reanOpt" data-k="sub" ${o.sub ? 'checked' : ''}> Subcarpetas propuestas (${r.sub.length} + las de las categorías nuevas)</label>
      <label class="note"><input type="checkbox" class="chk" data-act="reanOpt" data-k="fx" ${o.fx ? 'checked' : ''}> Etiquetas de efectos detectados (${tagN('fx')})</label>
      <label class="note"><input type="checkbox" class="chk" data-act="reanOpt" data-k="nm" ${o.nm ? 'checked' : ''}> Carácter que dice el nombre: Dark, Warm… (${tagN('nm')})</label>
      <label class="note"><input type="checkbox" class="chk" data-act="reanOpt" data-k="ch" ${o.ch ? 'checked' : ''}> Carácter leído en los ajustes (${tagN('ch')}) <span class="dimc">· orientativo</span></label></div>
    <div class="row2" style="margin-top:10px;flex-wrap:wrap;gap:6px"><button class="btn accent" data-act="reanApply">Aplicar</button>${cnt.none ? html`<button class="btn" data-act="reanListen">Mandar a Escucha los ${cnt.none} sin pistas</button>` : ''}${cnt.conflict ? html`<button class="btn" data-act="reanShow" data-t="conflict">Ver en la Biblioteca los ${cnt.conflict} que contradicen</button>` : ''}</div>
    <p class="note" style="margin-top:6px">Las contradicciones nunca se cambian solas: revísalas tú. Todo lo aplicado se puede deshacer en Historial.</p></div>
  <div class="box"><h3>${T.find((x) => x[0] === tab)[1]} <small>${rows.length} patches</small></h3>${rows.length ? html`<div style="overflow:auto;max-height:520px"><table class="t"><tr><th>Patch</th><th>${tab === 'tags' ? 'Etiquetas' : tab === 'conflict' ? 'Tu categoría → propuesta' : 'Propuesta'}</th><th>Por qué</th></tr>${rows.slice(0, 300).map((x) => html`<tr><td><a href="#" data-act="pick" data-id="${x.id}">${name(x.id)}</a></td>${cell(x)}</tr>`)}</table></div>${rows.length > 300 ? html`<p class="note">Se muestran 300 de ${rows.length}.</p>` : ''}` : html`<p class="note">Nada en este apartado.</p>`}</div>`;
}
// Recuento por categoría y subcarpeta: guardado por ti / propuesto por la herramienta
function folderStats() {
  const st = {};
  for (const p of lib.faces()) {
    if (p.meta.review === 'discard' || (lib.changeState && lib.changeState(p) === 'superseded')) continue;
    const c = lib.info(p).cls, cat = p.meta.category || c.category; if (!cat) continue;
    const r = (st[cat] ||= { saved: 0, prop: 0, noSub: 0, subs: {}, propSubs: {}, pending: [] });
    if (p.meta.category) r.saved++; else r.prop++;
    const sub = p.meta.category ? p.meta.subtype : c.subtype;
    if (sub) (r.subs[sub] ||= { saved: 0, prop: 0 })[p.meta.category && p.meta.subtype ? 'saved' : 'prop']++; else r.noSub++;
    if ((!p.meta.category || !p.meta.subtype) && c.category === cat && c.subtype) { r.propSubs[c.subtype] = (r.propSubs[c.subtype] || 0) + 1; r.pending.push(p.id); }
  }
  return st;
}
function orgFolders() {
  const st = folderStats(), cats = CATEGORIES.filter((c) => c.id !== 'other'), cat = S.fCat && lib.tax[S.fCat] ? S.fCat : cats.find((c) => st[c.id])?.id || 'bass', r = st[cat] || { saved: 0, prop: 0, noSub: 0, subs: {}, propSubs: {}, pending: [] };
  const list = lib.tax[cat], custom = !!(lib.settings.subfolders || {})[cat];
  const allPending = Object.values(st).reduce((a, x) => a + x.pending.length, 0);
  return html`${howTo([['Define', 'las subcarpetas de cada categoría: renombra, ordena, quita o crea las tuyas (Subs, Drones, Groovy…).'], ['Asigna', 'en la ficha de cada patch, en bloque desde la lista o aceptando aquí las propuestas.'], ['Revisa', 'qué ha propuesto la herramienta y por qué: el nombre manda; si no dice nada, sus ajustes.'], ['Ordena', 'en disco: «Ordenar en disco» usa estas carpetas (Categoría / Subcarpeta).']])}
  <div class="fold">
    <div class="box fold-cats"><h3>Categorías</h3>${cats.map((c) => { const x = st[c.id]; return html`<button class="fold-cat ${c.id === cat ? 'on' : ''}" data-act="fCat" data-c="${c.id}"><span>${c.label}</span><small>${x ? x.saved + x.prop : 0}</small></button>`; })}</div>
    <div class="box"><h3>${CAT_LABEL[cat]} <small>${r.saved} guardados · ${r.prop} propuestos · ${r.noSub} sin subcarpeta</small></h3>
      <div class="fold-list"><div class="fold-row fold-hd"><span>Subcarpeta</span><span class="num">Tuyos</span><span class="num">Propuestos</span><span></span></div>
        ${list.map((x, i) => { const n = r.subs[x.id] || { saved: 0, prop: 0 }; return html`<div class="fold-row"><input class="field fold-in" data-act="fRename" data-c="${cat}" data-s="${x.id}" value="${x.label}" maxlength="40" aria-label="Nombre de la subcarpeta"><span class="num">${n.saved || '·'}</span><span class="num dimc">${n.prop || '·'}</span>
          <span class="fold-acts">${n.saved || n.prop ? html`<a href="#" data-act="ask" data-q='${JSON.stringify({ category: cat, subtype: x.id })}'>ver</a>` : ''}<button class="lk" data-act="fMove" data-c="${cat}" data-s="${x.id}" data-d="-1" ${i ? '' : 'disabled'} aria-label="Subir">↑</button><button class="lk" data-act="fMove" data-c="${cat}" data-s="${x.id}" data-d="1" ${i < list.length - 1 ? '' : 'disabled'} aria-label="Bajar">↓</button><button class="lk" data-act="fDel" data-c="${cat}" data-s="${x.id}" aria-label="Quitar">Quitar</button></span></div>`; })}
        <div class="fold-row"><input class="field fold-in" data-act="fAdd" data-c="${cat}" placeholder="+ Nueva subcarpeta (Intro)" maxlength="40"><span class="num">${r.noSub ? r.noSub : ''}</span><span class="note">${r.noSub ? 'sin subcarpeta' : ''}</span><span></span></div></div>
      <div class="row2" style="margin-top:10px;flex-wrap:wrap;gap:6px">${r.pending.length ? html`<button class="btn accent" data-act="fAccept" data-c="${cat}">Aceptar ${r.pending.length} subcarpeta(s) propuesta(s) en ${CAT_LABEL[cat]}</button>` : html`<span class="note">No hay subcarpetas propuestas pendientes en ${CAT_LABEL[cat]}.</span>`}<span class="sp"></span>${custom ? html`<button class="btn small" data-act="fReset" data-c="${cat}">Volver a las de la herramienta</button>` : ''}</div>
      ${r.pending.length ? html`<p class="note" style="margin-top:6px">Propuestas: ${Object.entries(r.propSubs).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${lib.subLabel(cat, k) || k} ${n}`).join(' · ')}. Se guardan con la categoría; puedes cambiarlas una a una en la ficha.</p>` : ''}
      ${allPending > r.pending.length ? html`<p class="note">En toda la biblioteca hay ${allPending} subcarpetas propuestas sin aceptar. <a href="#" data-act="fAcceptAll">Aceptarlas todas</a></p>` : ''}
    </div>
  </div>
  <div class="box" style="margin-top:12px"><h3>Etiquetas rápidas <small>aparecen como botones en la ficha de cada patch</small></h3>
    <div class="palrows">${lib.tagPalette.map((g, i) => html`<div class="palrow"><input class="field" data-act="palName" data-i="${i}" value="${g.name}" aria-label="Nombre del grupo"><input class="field" data-act="palTags" data-i="${i}" value="${g.tags.join(', ')}" aria-label="Etiquetas del grupo" placeholder="Separadas por comas"><button class="lk" data-act="palDel" data-i="${i}">Quitar</button></div>`)}</div>
    <div class="row2" style="margin-top:8px;flex-wrap:wrap;gap:6px"><button class="btn small" data-act="palAdd">+ Grupo</button>${Array.isArray(lib.settings.tagPalette) ? html`<button class="btn small" data-act="palReset">Volver a las de la herramienta</button>` : ''}<span class="sp"></span><button class="btn small accent" data-act="fxAutoTag">Etiquetar efectos detectados</button></div>
    <p class="note" style="margin-top:6px">Delay y reverb son efectos del proyecto en el Circuit Tracks, no del patch: la herramienta solo los detecta en el nombre (delay, dly, echo, verb, hall, space…). Chorus, phaser, distorsión y EQ se leen también en el propio patch.</p></div>`;
}
function orgArch() {
  const groups = architectureGroups(lib.faces(), S.archLevel), inG = groups.reduce((n, g) => n + g.size, 0);
  return html`<p class="note">Una <b>arquitectura</b> es lo que define qué synth es: modo de voz, formas de onda de los osciladores audibles, tipo y ruta de filtro, si usa drive/distorsión/chorus, las conexiones de la matriz y los destinos de las macros. Aquí están los grupos con la misma arquitectura y valores distintos (cutoff, tiempos, profundidades…). Abre uno para ver qué cambia entre ellos.</p>
  <div class="row2"><label class="lab" style="min-width:320px">Precisión<select class="field" data-act="archLevel">${ARCH_LEVELS.map((l) => html`<option value="${l.id}" ${S.archLevel === l.id ? 'selected' : ''}>${l.label}</option>`)}</select></label><span class="note" style="align-self:flex-end"><b>${groups.length}</b> grupos · <b>${inG}</b> patches. Menos precisión = grupos más grandes y más parecidos «de receta».</span></div>
  ${groups.length ? groups.slice(0, 120).map((g) => { const open = S.openGroups.has(g.key); const ps = g.ids.map((id) => lib.byId(id)); const cols = g.varying.slice(0, 6); return html`<div class="org-group"><header data-act="orgOpen" data-k="${g.key}"><span class="n">${g.size}</span><div><b>${g.summary}</b><div class="vary">${g.varying.slice(0, 8).map((v) => html`<span>${v.label.split(' · ').pop()}</span>`)}${g.varying.length > 8 ? html`<span>+${g.varying.length - 8}</span>` : ''}</div></div><span class="sp"></span><span class="note">${g.distinct} ajustes distintos</span><button class="btn small" data-act="orgQueue" data-k="${g.key}">Escuchar el grupo</button></header>
    ${open ? html`<div class="body"><table class="t"><tr><th>Patch</th><th>Tipo</th>${cols.map((v) => html`<th title="${v.label}">${v.label.split(' · ').slice(-2).join(' ')}</th>`)}<th></th></tr>${ps.map((p) => html`<tr><td><a href="#" data-act="pick" data-id="${p.id}">${p.name}</a> <span class="note">${p.folderPath || ''}</span></td><td>${catName(effCat(p)) || '—'}</td>${cols.map((v) => { const d = PARAMS.find((x) => x.off === v.off), x = p.payload[v.off]; return html`<td class="num" style="${x === v.max ? 'color:var(--o)' : x === v.min ? 'color:var(--mod)' : ''}">${formatValue(d, x)}</td>`; })}<td class="num"><button class="btn small" data-act="pickListen" data-id="${p.id}" ${S.dev.session ? '' : 'disabled'}>▶</button> <span class="star ${p.meta.fav ? 'on' : ''}" data-act="fav" data-id="${p.id}">★</span></td></tr>`)}</table>
      <p class="note" style="margin-top:6px">Naranja = valor máximo del grupo; violeta = mínimo. ${g.varying.length} parámetros varían en total.</p></div>` : ''}</div>`; }) : html`<div class="empty"><h3>Sin grupos</h3><p>No hay patches con la misma arquitectura y ajustes distintos.</p></div>`}`;
}
// ---- Octava y tono ----
const kbdMode = () => lib.settings.kbdMidi || 'unknown'; // 'yes' | 'no' | 'unknown'
// Grupos de la corrección de octava: categoría, o categoría / subcarpeta. Los marcados como «está bien» no se analizan.
const regKeyOf = (p) => { const c = effCat(p); if (!c) return null; if (!S.regBySub) return c; const sb = p.meta.category ? p.meta.subtype : lib.info(p).cls.subtype; return sb ? c + ':' + sb : c; };
const regLabel = (k) => { const [c, sb] = String(k).split(':'); return catName(c, sb || null); };
const regPlanOf = (k) => (lib.settings.regPlan || {})[k] || {};
async function regPlanSet(k, patch) { const all = { ...(lib.settings.regPlan || {}) }; all[k] = { ...(all[k] || {}), ...patch }; await lib.setSetting('regPlan', all); }
function regLive() {
  // se analiza cada sonido una vez, en su versión vigente
  return lib.faces().filter((p) => { for (let q = p, i = 0; q && i < 8; q = q.parentId && lib.byId(q.parentId), i++) if (q.meta.regKeep) return false; return true; });
}
function regReportFor(k, live = regLive()) {
  const t = regPlanOf(k).target;
  return registerReport(live, regKeyOf, k, t === undefined || t === null || t === 'skip' || t === '' ? null : +t, { ignoreKbd: kbdMode() === 'no' });
}
function regReport() { return regReportFor(S.regCat); }
const regModeOf = (k) => regPlanOf(k).mode || 'full';
// sonidos (sus versiones vigentes) que ya tienen una propuesta de octava pendiente
const regDraftParents = () => new Set(regQueue().map((v) => faceOf(v).id));
const regMethod = () => (kbdMode() === 'no' ? 'osc' : S.regMethod);
const regShift = (x, mode = regModeOf(S.regCat)) => (mode === 'octave' ? x.octDelta * 12 : x.delta);
function regFixPayload(p, x, mode) {
  return transposeSemitones(p.payload, regShift(x, mode), regMethod(), { tune: S.regTune });
}
function kbdShare(rep) {
  const n = rep.items.length, k = rep.items.filter((x) => x.keyboardOctave).length;
  return n ? `En ${Math.round((k / n) * 100)} % de estos patches (${k} de ${n}) la transposición viene de este byte.` : '';
}
function regTargetOpts(rep, cur) {
  const v = cur === undefined || cur === null ? '' : String(cur);
  return html`<option value="" ${v === '' ? 'selected' : ''}>Lo habitual (${describePitch(rep.mode)})</option>${[-48, -36, -24, -12, 0, 12].map((t) => html`<option value="${t}" ${v === String(t) ? 'selected' : ''}>${describePitch(t)}</option>`)}<option value="skip" ${v === 'skip' ? 'selected' : ''}>No corregir este grupo</option>`;
}
function regGroups() {
  const n = new Map(); for (const p of regLive()) { const k = regKeyOf(p); if (k) n.set(k, (n.get(k) || 0) + 1); }
  return [...n].map(([k, c]) => ({ k, n: c, label: regLabel(k) })).sort((a, b) => b.n - a.n);
}
function orgRegister() {
  if (S.regView === 'detail') return orgRegisterDetail();
  if (S.regView === 'review') return orgRegisterReview();
  const live = regLive(), drafts = regDraftParents(), groups = regGroups(), km = kbdMode();
  const rows = groups.map((g) => { const rep = regReportFor(g.k, live), pl = regPlanOf(g.k), mode = regModeOf(g.k), skip = pl.target === 'skip'; const fix = skip ? [] : rep.off.filter((x) => regShift(x, mode) !== 0 && !drafts.has(x.id)); return { ...g, rep, pl, mode, skip, fix }; });
  const total = rows.reduce((a, r) => a + r.fix.length, 0), nDrafts = drafts.size, adoptMode = S.regAdopt || 'smart';
  const pc = (e) => html`<span class="pitch"><b>${NOTE_NAMES[((e % 12) + 12) % 12]}</b>${Math.floor(e / 12) ? fmtSemis(Math.floor(e / 12)) + ' oct' : '0 oct'}</span>`;
  return html`${howTo([['Revisa el plan', 'cada categoría (o subcarpeta) tiene su objetivo: por defecto, donde suena la mayoría de los tuyos. Cámbialo o pon «No corregir».'], ['Corrige todo', 'de una vez: las claras se suman a la versión de cada sonido; las dudosas quedan como propuesta. Los originales se guardan.'], ['Revisión rápida', 'solo de las dudosas: A/B con 1 y 2, Intro acepta, Supr descarta, K «estaba bien».'], ['Exporta', 'en Ordenar en disco, la versión aceptada ocupa el sitio y el nombre del original.']])}
  <div class="box regplan"><h3>Plan de octava y tono <small>${live.length} patches analizados</small></h3>
    <div class="row2" style="margin-bottom:10px;flex-wrap:wrap;gap:8px"><span class="seg"><button class="btn small ${S.regBySub ? '' : 'on'}" data-act="regBySub" data-v="0">Por categoría</button><button class="btn small ${S.regBySub ? 'on' : ''}" data-act="regBySub" data-v="1">Por categoría / subcarpeta</button></span><span class="sp"></span>
      <label class="note">Método <select class="sel" data-act="regSet" data-k="regMethod" ${km === 'no' ? 'disabled' : ''}><option value="osc" ${regMethod() === 'osc' ? 'selected' : ''}>semitonos de los osciladores</option><option value="keyboard" ${regMethod() === 'keyboard' ? 'selected' : ''}>octava de teclado + osciladores</option></select></label>
      <label class="note"><input type="checkbox" class="chk" data-act="regTuneChk" ${S.regTune ? 'checked' : ''}> centrar cents</label></div>
    <div class="regrows"><div class="regrow hd"><span>Grupo</span><span class="num">Patches</span><span>Suena casi siempre en</span><span class="num">Fuera</span><span>Objetivo</span><span>Qué</span><span></span></div>
    ${rows.map((r) => html`<div class="regrow ${r.skip ? 'skip' : ''}"><a href="#" data-act="regOpen" data-g="${r.k}"><b>${r.label}</b></a><span class="num">${r.n}</span><span>${pc(r.rep.mode)}</span>
      <span class="num">${r.rep.off.length ? html`${r.rep.off.length}${r.rep.summary.doubtful ? html` <small class="dimc" title="dudosos">(${r.rep.summary.doubtful}?)</small>` : ''}` : html`<span class="dot ok"></span>`}</span>
      <select class="sel" data-act="regPlanSel" data-g="${r.k}" data-f="target">${regTargetOpts(r.rep, r.pl.target)}</select>
      <select class="sel" data-act="regPlanSel" data-g="${r.k}" data-f="mode" ${r.skip ? 'disabled' : ''}><option value="full" ${r.mode === 'full' ? 'selected' : ''}>Octava y tono</option><option value="octave" ${r.mode === 'octave' ? 'selected' : ''}>Solo octava</option></select>
      <span class="regacts">${r.fix.length ? html`<button class="btn small" data-act="regFixGroup" data-g="${r.k}">Corregir ${r.fix.length}</button>` : ''}<button class="lk" data-act="regOpen" data-g="${r.k}">detalle</button></span></div>`)}</div>
    <div class="actbox" style="margin-top:12px"><div><b>${total ? `Corregir todo el plan: ${total} patches en ${rows.filter((r) => r.fix.length).length} grupos` : 'Nada que corregir con este plan'}</b><p class="note">Cada sonido sigue con una sola versión; se puede deshacer (Ctrl Z, Cambios). ${nDrafts ? html`Hay <a href="#" data-act="regView" data-v="review">${nDrafts} dudosa(s) por revisar</a>.` : ''}</p></div>
      <label class="lab">Al crearlas<select class="field" data-act="regSet" data-k="regAdopt"><option value="smart" ${adoptMode === 'smart' ? 'selected' : ''}>Aceptar las claras; dudosas en borrador</option><option value="all" ${adoptMode === 'all' ? 'selected' : ''}>Aceptarlas todas ya</option><option value="none" ${adoptMode === 'none' ? 'selected' : ''}>Todas en borrador</option></select></label>
      <button class="btn accent" data-act="regFixPlan" ${total ? '' : 'disabled'}>Corregir todo</button>${nDrafts ? html`<button class="btn" data-act="regView" data-v="review">Revisión rápida (${nDrafts})</button>` : ''}</div>
  </div>`;
}
function regQueue() { return lib.patches.filter((v) => v.kind === 'variant' && v.origin === 'register' && lib.isVersion(v) && lib.changeState(v) === 'draft'); }
function regCrumbs(here) {
  return html`<div class="crumbs"><button class="btn back" data-act="regView" data-v="plan" title="Esc">← Volver al plan <kbd>Esc</kbd></button><nav aria-label="Ruta"><a href="#" data-act="regView" data-v="plan">Octava y tono</a><span>›</span><b>${here}</b></nav></div>`;
}
function orgRegisterReview() {
  const q = regQueue(), live = !!S.dev.session;
  if (!q.length) return html`${regCrumbs('Revisión rápida')}<div class="empty"><h3>No hay correcciones pendientes</h3><p>Todas las propuestas de octava están aplicadas o descartadas.</p></div>`;
  const i = Math.min(S.revI || 0, q.length - 1), v = q[i], o = faceOf(v), x = regReportFor(regKeyOf(o) || 'bass', [o]).items[0], y = o && pitchInfo(proposalApplied(v));
  return html`${regCrumbs(`Revisión rápida · ${i + 1} de ${q.length}`)}
  <div class="box regrev"><div class="mlabel"><span>${o ? regLabel(regKeyOf(o) || '') : ''} · ${v.originText || ''}</span><span>${i + 1} / ${q.length}</span></div>
    <h2 class="hf">${o?.name || v.name}</h2>
    <p class="note">${x ? html`Suena en <b>${describePitch(x.effective)}</b> → corregido a <b>${describePitch(y.effective)}</b> · confianza ${x.confidence}${x.reasons.length ? ' · ' + x.reasons.slice(0, 2).join('; ') : ''}` : ''}</p>
    <div class="row2" style="margin-top:12px;flex-wrap:wrap;gap:6px"><button class="btn" data-act="revPlay" data-w="o" ${live ? '' : 'disabled'}><kbd>1</kbd> Original</button><button class="btn" data-act="revPlay" data-w="v" ${live ? '' : 'disabled'}><kbd>2</kbd> Corregido</button><span class="sp"></span>
      <button class="btn" data-act="revKeep" title="El original estaba bien: descarta la corrección y no vuelve a proponerlo"><kbd>K</kbd> Estaba bien</button><button class="btn danger" data-act="revDrop"><kbd>Supr</kbd> Descartar</button><button class="btn primary" data-act="revOk"><kbd>Intro</kbd> Aceptar</button></div>
    ${live ? '' : html`<p class="note" style="margin-top:8px">Conecta el equipo en <a href="#" data-act="view" data-v="device">Equipo</a> para escuchar.</p>`}
    <p class="note" style="margin-top:10px">← → para moverte · al aceptar o descartar se pasa al siguiente y suena corregido.</p></div>`;
}
function orgRegisterDetail() {
  const rep = regReport(), km = kbdMode(), maxN = Math.max(1, ...rep.distribution.map((d) => d[1]));
  const cats = [...new Set(lib.faces().map((p) => effCat(p)).filter(Boolean))];
  const pc = (e) => html`<span class="pitch"><b>${NOTE_NAMES[((e % 12) + 12) % 12]}</b>${Math.floor(e / 12) ? fmtSemis(Math.floor(e / 12)) + ' oct' : '0 oct'}</span>`;
  const probCls = { 'octava': 'oct', 'tono': 'tone', 'octava y tono': 'both' };
  const list = S.regShow === 'all' ? rep.items : rep.off;
  const drafts = new Map(regQueue().map((v) => [faceOf(v).id, v]));
  const fixable = rep.off.filter((x) => regShift(x) !== 0 && !drafts.has(x.id)), keepN = lib.faces().filter((p) => p.meta.regKeep && regKeyOf(p) === S.regCat).length;
  const adoptMode = S.regAdopt || 'smart';
  const sm = rep.summary, live = !!S.dev.session, canVerify = live && S.dev.audioId;
  return html`${regCrumbs(regLabel(S.regCat))}${howTo([['Elige', 'categoría y objetivo (por defecto, lo habitual en tu colección).'], ['Escucha', '«▶ corregido» lo toca en el Circuit sin guardar nada (solo RAM).'], ['Corrige', 'cada patch en su versión (las dudosas, como propuesta), en la biblioteca de este navegador. El original se guarda.'], ['Exporta', 'en Ordenar en disco, la versión de cada sonido ocupa el sitio y el nombre del original. Tus archivos no se tocan.']])}
  <p class="note">Nota que suena al tocar un Do: <b>octava de teclado × 12 + semitonos del oscilador que manda</b> (el más fuerte; si suenan parecido, el más grave). Así una quinta añadida no cuenta como «otro tono». Si un patch está medido con la entrada de audio, manda la medición. El objetivo por defecto es lo más habitual en <b>tu</b> colección.</p>
  <div class="verify ${km !== 'unknown' ? 'ok' : ''}"><div style="flex:1;min-width:260px"><span class="mlabel">Octava de teclado (byte 35) y notas MIDI externas</span><div class="note" style="margin-top:3px">${km === 'yes' ? html`<b>Medido con tu equipo:</b> la octava de teclado del patch también transpone las notas que llegan por MIDI. Se cuenta en el cálculo.` : km === 'no' ? html`<b>Medido con tu equipo:</b> la octava de teclado solo afecta a los pads; las notas MIDI externas no se transponen. Se ignora en el cálculo y la corrección usa los osciladores.` : html`<b>Se cuenta en el cálculo.</b> La guía de Novation lo documenta como parámetro de la voz (CC 13), no como la octava de los pads, lo que apunta a que transpone el sonido. ${kbdShare(rep)} Si no afecta a las notas que mandas desde Ableton, sonarán más agudos de lo que indica la tabla. Si quieres medirlo, «Comprobar con el equipo» lo hace en unos segundos con la entrada de audio.`}</div></div>
    <button class="btn ${km === 'unknown' ? 'accent' : 'small'}" data-act="regVerify" ${canVerify && !S.verifying ? '' : 'disabled'} title="${canVerify ? '' : 'Conecta el equipo y elige una entrada de audio en Equipo'}">${S.verifying ? 'Midiendo…' : km === 'unknown' ? 'Comprobar con el equipo' : 'Repetir comprobación'}</button>
    <select class="field" style="width:auto" data-act="regKbd"><option value="unknown" ${km === 'unknown' ? 'selected' : ''}>Se cuenta (por defecto)</option><option value="yes" ${km === 'yes' ? 'selected' : ''}>Afecta al MIDI externo</option><option value="no" ${km === 'no' ? 'selected' : ''}>Solo afecta a los pads</option></select></div>
  <div class="grid3"><label class="lab">Grupo<select class="field" data-act="regSet" data-k="regCat">${regGroups().map((g) => html`<option value="${g.k}" ${S.regCat === g.k ? 'selected' : ''}>${g.label} (${g.n})</option>`)}</select></label>
    <label class="lab">Objetivo<select class="field" data-act="regPlanSel" data-g="${S.regCat}" data-f="target">${regTargetOpts(rep, regPlanOf(S.regCat).target)}</select></label>
    <label class="lab">Qué corregir<select class="field" data-act="regPlanSel" data-g="${S.regCat}" data-f="mode"><option value="full" ${regModeOf(S.regCat) === 'full' ? 'selected' : ''}>Octava y tono (al objetivo exacto)</option><option value="octave" ${regModeOf(S.regCat) === 'octave' ? 'selected' : ''}>Solo la octava (respeta el tono)</option></select></label>
    <label class="lab">Método${km === 'no' ? html`<select class="field" disabled><option>Semitonos de los osciladores</option></select>` : html`<select class="field" data-act="regSet" data-k="regMethod"><option value="osc" ${S.regMethod === 'osc' ? 'selected' : ''}>Semitonos de los osciladores</option><option value="keyboard" ${S.regMethod === 'keyboard' ? 'selected' : ''}>Octavas en la octava de teclado, resto en osciladores</option></select>`}</label>
    <label class="lab">Afinación fina<select class="field" data-act="regSet" data-k="regTune"><option value="" ${!S.regTune ? 'selected' : ''}>No tocar los cents</option><option value="1" ${S.regTune ? 'selected' : ''}>Centrar los cents del oscilador raíz</option></select></label>
    <label class="lab">Mostrar<select class="field" data-act="regSet" data-k="regShow"><option value="off" ${S.regShow === 'off' ? 'selected' : ''}>Solo los que no cuadran</option><option value="all" ${S.regShow === 'all' ? 'selected' : ''}>Todos</option></select></label></div>
  <div class="statgrid"><div class="stat g"><strong>${rep.items.length - rep.off.length}</strong><span>En ${describePitch(rep.goal)}</span></div><div class="stat"><strong>${sm.octave}</strong><span>Otra octava</span></div><div class="stat"><strong>${sm.tone}</strong><span>Otro tono</span></div><div class="stat"><strong>${sm.both}</strong><span>Octava y tono</span></div><div class="stat"><strong>${sm.doubtful}</strong><span>Dudosos: medir</span></div><div class="stat"><strong>${sm.detuned}</strong><span>Desafinados ≥10 ct</span></div></div>
  <div class="box"><h3>Dónde suena cada ${regLabel(S.regCat)} <small>${rep.items.length} patches · tocando un Do</small></h3><div class="dist">${rep.distribution.map(([e, n]) => html`<div class="${e === rep.mode ? 'mode' : ''} ${e === rep.goal ? 'goal' : ''}" title="${describePitch(e)}: ${n}"><span>${n}</span><i style="height:${(n / maxN) * 60}px"></i><span>${NOTE_NAMES[((e % 12) + 12) % 12]}${Math.floor(e / 12)}</span></div>`)}</div><p class="note">Nota y octava relativas (Do0 = sin transponer). Verde = objetivo; gris claro = lo más habitual en tu colección.</p></div>
  <div class="box"><h3>${S.regShow === 'all' ? 'Todos' : 'Fuera del objetivo'} <small>${list.length} patches</small></h3>${list.length ? html`<div style="overflow:auto;max-height:640px"><table class="t"><tr><th>Patch</th><th>Problema</th><th>Suena en</th><th>Raíz</th><th>Confianza</th><th>Corrección</th><th></th></tr>${list.slice(0, 400).map((x) => { const p = lib.byId(x.id), sh = regShift(x); return html`<tr><td><a href="#" data-act="pick" data-id="${p.id}">${p.name}</a> <span class="note">${p.folderPath || ''}</span></td><td>${x.problem ? html`<span class="prob ${probCls[x.problem]}">${x.problem}</span>` : html`<span class="dot ok"></span>`}</td><td>${pc(x.effective)}${x.source === 'medido' ? html` <span class="note">${x.measured.f0.toFixed(0)} Hz</span>` : ''}</td><td class="num">OSC ${x.root + 1} ${fmtSemis(x.osc[x.root])} st · tecl. ${fmtSemis(x.keyboardOctave)}${x.interval !== null ? html` <span class="note">(+OSC ${2 - x.root} a ${fmtSemis(x.interval)})</span>` : ''}${x.centsRoot ? html` <span class="note">${fmtSemis(x.centsRoot)} ct</span>` : ''}</td><td class="conf-${x.confidence}" title="${x.reasons.join('; ')}">${x.confidence}${x.macroPitch.length ? html` <span class="note">· macro de afinación</span>` : ''}</td><td class="num">${x.off && sh ? fmtSemis(sh) + ' st' : '—'}</td><td class="num"><button class="btn small" data-act="regListen" data-id="${p.id}" ${live ? '' : 'disabled'} title="Escuchar original">▶</button> ${drafts.has(p.id) ? html`<span class="badge chg draft">borrador creado</span> <button class="btn small" data-act="chgAB" data-id="${drafts.get(p.id).id}" ${live ? '' : 'disabled'}>A/B</button> <button class="btn small primary" data-act="chgAdopt" data-id="${drafts.get(p.id).id}" data-on="1">✓ Aceptar</button>` : x.off && sh ? html`<button class="btn small" data-act="regTry" data-id="${p.id}" ${live ? '' : 'disabled'} title="Escuchar corregido (solo RAM)">▶ corregido</button> <button class="btn small" data-act="regFix" data-id="${p.id}">Crear variante</button>` : p.kind === 'variant' ? html`<span class="badge chg ok">corregido</span>` : ''} ${canVerify ? html`<button class="btn small" data-act="regMeasure" data-id="${p.id}" title="Medir la nota real con la entrada de audio">Medir</button>` : ''} ${x.off ? html`<button class="btn small" data-act="regKeep" data-id="${p.id}" title="Está bien como está: no volver a proponerlo">Está bien</button>` : ''}</td></tr>`; })}</table></div>${list.length > 400 ? html`<p class="note">Se muestran 400 de ${list.length}.</p>` : ''}
    ${fixable.length ? html`<div class="actbox"><div><b>Corregir ${fixable.length} patches</b><p class="note">Cada uno se lleva a ${describePitch(rep.goal)} en su versión. Los originales se guardan.</p></div>
      <label class="lab">Al crearlas<select class="field" data-act="regSet" data-k="regAdopt"><option value="smart" ${adoptMode === 'smart' ? 'selected' : ''}>Aceptar las de confianza clara; las dudosas, en borrador</option><option value="all" ${adoptMode === 'all' ? 'selected' : ''}>Aceptarlas todas ya</option><option value="none" ${adoptMode === 'none' ? 'selected' : ''}>Dejarlas todas en borrador para revisarlas</option></select></label>
      <button class="btn accent" data-act="regFixAll">Corregir</button></div>` : ''}
    ${drafts.size ? html`<p class="note" style="margin-top:8px">${drafts.size} borrador(es) de octava esperando revisión: <a href="#" data-act="regView" data-v="review">revisión rápida</a>.</p>` : ''}
    ${keepN ? html`<p class="note">${keepN} patch(es) de este grupo marcados como «está bien»: no se analizan. <a href="#" data-act="regUnkeep" data-g="${S.regCat}">Volver a analizarlos</a></p>` : ''}` : html`<p class="note"><span class="dot ok"></span>Todos los patches de esta categoría suenan en ${describePitch(rep.goal)}.</p>`}</div>`;
}
async function measureF0(payload) {
  const s = S.dev.session, note = S.dev.measureNote;
  s.stopAll();
  const { x, sr } = await record(2600, (t0) => { const t = s.sendPatch(payload, S.dev.synth); s.note(S.dev.synth, note, 100, Math.max(t + (S.dev.patchDelay ?? 80), t0 + 250), 1200); });
  const d = analyzeRecording(x, sr, { noteOn: 0.25, noteOff: 1.45, playedNote: note });
  return d.silent || !d.f0 ? null : d.f0;
}
function orgDups() {
  const fams = lib.families().list.map((f) => ({ f, dups: f.members.filter((m) => m.rel && (m.rel.level === 'payload' || m.rel.level === 'synth')) })).filter((x) => x.dups.length);
  return html`<p class="note">Duplicado = misma síntesis (bytes 32–339 idénticos); puede cambiar solo el nombre. Se conserva el primero de cada familia (o el mejor valorado al limpiar).</p>
  <div class="row2"><button class="btn accent" data-act="dupDiscard" ${fams.length ? '' : 'disabled'}>Marcar duplicados como «Descartar»</button><span class="note">No borra nada: solo cambia su estado (y quedan fuera de Packs y del orden en disco).</span></div>
  ${fams.length ? html`<div class="box"><table class="t"><tr><th>Se conserva</th><th>Duplicados</th><th></th></tr>${fams.map(({ f, dups }) => html`<tr><td><a href="#" data-act="pick" data-id="${f.head}">${lib.byId(f.head)?.name}</a> <span class="note">${lib.byId(f.head)?.folderPath || ''}</span></td><td>${dups.map((d, i) => html`${i ? ', ' : ''}<a href="#" data-act="pick" data-id="${d.id}">${lib.byId(d.id)?.name}</a> <span class="note">${lib.byId(d.id)?.folderPath || ''}</span>`)}</td><td>${dups.map((d) => lib.byId(d.id)?.meta.review === 'discard' ? 'descartado' : '').filter(Boolean).length ? 'descartados' : ''}</td></tr>`)}</table></div>` : html`<div class="empty"><h3>Sin duplicados</h3></div>`}`;
}
function orgDisk() {
  const o = S.plan, scope = planScope(lib, filteredPatches(), o.scope);
  const plan = diskPlan(lib, scope, o), tree = new Map();
  for (const e of plan.entries) if (e.action === 'write') { const k = e.dir.join(' / '); (tree.get(k) || tree.set(k, []).get(k)).push(e.file); }
  const sel = (k, opts) => html`<select class="field" data-act="planSet" data-k="${k}">${opts.map(([v, l]) => html`<option value="${v}" ${o[k] === v ? 'selected' : ''}>${l}</option>`)}</select>`;
  return html`<p class="note">Genera una copia ordenada de tu colección. Dentro de la carpeta que elijas se crea siempre una subcarpeta nueva con fecha, así que nunca se sobrescribe nada. Los archivos originales del disco no se tocan. Cada patch se escribe como .syx de Circuit Tracks y se adjunta un manifiesto CSV con la ruta antigua y la nueva.</p>
  <div class="grid3"><label class="lab">Estructura${sel('layout', [['category', 'Categoría / subcarpeta (tus carpetas)'], ['architecture', 'Arquitectura (mismo synth juntos)'], ['source', 'Carpetas de origen']])}</label>
    <label class="lab">Nombre de archivo${sel('naming', [['{cat} - {name}', 'Categoría - Nombre'], ['{name}', 'Nombre'], ['{n} {name}', 'Número Nombre']])}</label>
    <label class="lab">Duplicados${sel('duplicates', [['folder', 'Aparte en _Duplicados'], ['skip', 'No copiarlos']])}</label>
    <label class="lab">Parecidos de una familia${sel('variants', [['family', 'Juntas en una subcarpeta'], ['flat', 'Sin subcarpeta']])}</label>
    <label class="lab">Qué incluir${sel('scope', [['all', 'Toda la biblioteca'], ['filter', 'El filtro actual de la biblioteca']])}</label></div><p class="note">Los patches en estado «Descartar» nunca se copian. Las carpetas y subcarpetas se editan en <a href="#" data-act="orgTab" data-t="folders">Carpetas y subcarpetas</a>.</p>
  ${(() => { const W = plan.entries.filter((e) => e.action === 'write'), rep = W.filter((e) => e.replaces).length, mids = W.filter((e) => planMid(e)).length, why = {}; plan.entries.filter((e) => e.action === 'skip').forEach((e) => { const r = e.reason.startsWith('sustituido') ? 'originales sustituidos por su versión corregida' : e.reason.startsWith('variante en borrador') ? 'variantes en borrador' : e.reason.startsWith('duplicado') ? 'duplicados' : e.reason; why[r] = (why[r] || 0) + 1; });
    return html`<div class="statgrid" style="margin-top:4px"><div class="stat"><strong>${plan.writes}</strong><span>patches a escribir</span></div><div class="stat g"><strong>${rep}</strong><span>en su versión corregida</span></div><div class="stat"><strong>${mids}</strong><span>con patrón .mid</span></div><div class="stat"><strong>${plan.folders}</strong><span>carpetas</span></div><div class="stat"><strong>${plan.skipped}</strong><span>no se escriben</span></div></div>
    <p class="note">Se escribe la <b>versión vigente</b> de cada patch: el original si no lo has cambiado, o su versión editada (con el mismo nombre y en el mismo sitio).${Object.keys(why).length ? html` No se escriben: ${Object.entries(why).map(([r, n]) => `${n} ${r}`).join(' · ')}.` : ''}${plan.entries.some((e) => e.reason?.startsWith('variante en borrador')) ? html` <a href="#" data-act="view" data-v="changes">Revisar los borradores</a>.` : ''}</p>`; })()}
  <div class="box"><h3>Vista previa <small>primeras carpetas</small></h3><div class="tree">${[...tree.entries()].slice(0, 60).map(([d, files]) => html`<div class="d">▸ ${d} <span class="s">(${files.length})</span></div>${files.slice(0, 5).map((f) => html`<div class="s">&nbsp;&nbsp;&nbsp;${f}</div>`)}${files.length > 5 ? html`<div class="s">&nbsp;&nbsp;&nbsp;… ${files.length - 5} más</div>` : ''}`)}</div>
    <div class="row2" style="margin-top:10px"><button class="btn primary" data-act="planWrite">Elegir carpeta y escribir</button><button class="btn" data-act="planZip">Descargar como ZIP</button><button class="btn" data-act="planCsv">Manifiesto CSV</button><span class="note">Escribir en carpeta requiere Chrome o Edge.</span></div></div>`;
}
// ===== MACROS (taller) =====
function viewMacroStudio() {
  const p = S.sel && lib.byId(S.sel);
  const tpls = [...S.templates, ...profileTemplates()], tsel = tpls.find((t) => t.id === S.tplSel) || null;
  const head = html`<div class="ptitle"><h2>Macros</h2><p>Edita las 8 macros de un patch ruta a ruta, guárdalas como plantilla y aplícalas a otros patches. Los cambios van a la versión de cada sonido: el original se guarda y siempre puedes volver a él.</p></div>`;
  if (!p) return html`${head}<div class="empty"><h3>Elige un patch</h3><p>Selecciónalo en la Biblioteca y vuelve aquí.</p><button class="btn" data-act="view" data-v="library">Ir a la biblioteca</button></div>${tplLibrary(tpls, tsel, null)}`;
  const inf = lib.info(p), a = inf.macros, isVar = p.kind === 'variant', live = !!S.dev.session;
  return html`${head}
  <div class="banner ${isVar ? 'ok' : ''}">${raw(isVar ? IC.okc : IC.inf)}<span><b>${p.name}</b> — ${isVar ? (lib.changeState(p) === 'adopted' ? 'editado: lo que cambies aquí se suma a su versión, la que suena y se exporta.' : 'copia independiente: lo que cambies se guarda solo.') : 'original. Girar los knobs no guarda nada; al guardar una posición o editar un destino se crea su versión (el original se guarda).'}</span><span class="sp"></span><label class="note"><input type="checkbox" class="chk" data-act="opt" data-k="live" ${S.live ? 'checked' : ''} ${live ? '' : 'disabled'}> Enviar cada cambio al equipo</label><button class="btn small" data-act="listenSel" ${live ? '' : 'disabled'}>${raw(IC.play)}Escuchar</button></div>
  ${macroBoard(p, inf)}
  <div class="status">${a.integrity.map((x) => html`<div class="e">${raw(IC.warn)}<b>Integridad</b><span>${x.text}</span></div>`)}${a.shared.map((x) => html`<div class="w">${raw(IC.warn)}<b>Destino compartido</b><span>${x.label} en ${x.knobs.map((k) => 'M' + (k + 1)).join(', ')}</span></div>`)}${!a.integrity.length && !a.shared.length ? html`<div class="o">${raw(IC.okc)}<b>Estructura correcta</b><span>Sin códigos fuera de rango ni destinos repetidos entre macros.</span></div>` : ''}</div>
  <p class="note">«Barrer» mantiene una nota y mueve la macro en el equipo: es la forma de comprobar de oído qué hace cada una.</p>
  ${tplLibrary(tpls, tsel, p)}`;
}
function tplLibrary(tpls, tsel, p) {
  return html`<div class="box"><h3>Plantillas <small>${S.templates.length} tuyas · 24 integradas</small></h3>
    <div class="row2" style="margin-bottom:10px">${p ? html`<button class="btn small accent" data-act="tplSave">Guardar las macros de «${p.name}» como plantilla</button>` : ''}<span class="sp"></span>${tsel ? html`<select class="sel" data-act="tplMode" style="height:27px;font-size:12px"><option value="replace" ${S.tplMode === 'replace' ? 'selected' : ''}>Aplicar las 8 macros</option><option value="empty" ${S.tplMode === 'empty' ? 'selected' : ''}>Solo en macros vacías</option><option value="selected" ${S.tplMode === 'selected' ? 'selected' : ''}>Solo la macro ${S.knob + 1}</option></select>${p ? html`<button class="btn small primary" data-act="tplApply">Aplicar a «${p.name}»</button>` : ''}<button class="btn small" data-act="tplApplySel" ${S.multi.size ? '' : 'disabled'}>Aplicar a la selección (${S.multi.size})</button>${tsel.builtin ? '' : html`<button class="btn small danger" data-act="tplDel">Eliminar</button>`}` : html`<span class="note">Elige una plantilla para aplicarla.</span>`}</div>
    <div class="tpls">${tpls.map((t) => html`<div class="tpl ${S.tplSel === t.id ? 'on' : ''}" data-act="tplPick" data-id="${t.id}"><b>${t.name}</b><span class="note">${t.builtin ? 'Integrada' : 'Tuya · ' + (t.created || '').slice(0, 10)}${t.from ? ' · de ' + t.from : ''}</span><div class="mini">${templateSummary(t).map((k) => html`<span title="${k.label}">${k.knob + 1} ${k.label}</span>`)}</div></div>`)}</div></div>`;
}
// ===== ANÁLISIS =====
function viewAnalyze() {
  if (lib.patches.length < 3) return html`<div class="empty"><h3>Análisis</h3><p>Hacen falta al menos 3 patches.</p></div>`;
  const la = LA(), pctf = (x) => (x * 100).toFixed(1).replace('.', ',') + ' %';
  return html`<div class="ptitle"><h2>Análisis de la colección</h2><p>Qué tienes, cómo se reparte y dónde conviene escuchar. Todo es clicable y filtra la biblioteca.</p><span class="sp"></span><div class="row2"><button class="btn" data-act="autoTagModal">${raw(IC.tag)}Auto tag</button><button class="btn" data-act="detectDups">${raw(IC.dup)}Duplicados</button><button class="btn" data-act="buildPackModal">${raw(IC.banks)}Construir pack</button><button class="btn" data-act="normalizeModal" ${S.sel || S.multi.size ? '' : 'disabled'}>${raw(IC.norm)}Normalizar macros</button></div></div>
  <div class="statgrid">${kpiTiles()}</div>
  <div class="astrip"><button class="sc" data-act="kpi" data-k="duplicate"><b>Duplicados</b><strong>${la.dup}</strong><small>${pctf(la.dupPct)} de la colección</small></button>
    <button class="sc" data-act="kpi" data-k="native"><b>Origen</b><strong>${la.tracks} / ${la.legacy}</strong><small>Circuit Tracks / Circuit original</small></button>
    <div class="sc"><b>Grupos de parámetros</b>${sparkBars(la.clusters.map((c) => c.size), null, 'stripCluster', true)}<small>${la.clusters.length} grupos</small></div>
    <div class="sc"><b>Duración (amp env)</b>${sparkBars(la.envBins, null, 'stripEnv')}<div class="binbtns">${la.envLabels.map((l, i) => html`<button data-act="stripEnv" data-i="${i}">${l}</button>`)}</div></div>
    <div class="sc"><b>Brillo estimado</b>${sparkBars(la.briBins, null, 'stripBri', true)}<small>${la.measuredBri ? la.measuredBri + ' medidos' : 'por parámetros'}</small></div>
    <button class="sc" data-act="kpi" data-k="mono"><b>Voz</b><div class="vbars"><span>Mono</span><div class="bar"><i style="width:${la.mono / la.N * 100}%"></i></div><span>Poly</span><div class="bar"><i style="width:${la.poly / la.N * 100}%"></i></div></div><small>${la.mono} mono · ${la.poly} poly</small></button>
    <button class="sc" data-act="view" data-v="macros"><b>Coherencia de macros</b><strong>${Math.round(la.consistentPct * 100)} %</strong><small>≥ 6/8 con «${PROFILES[S.profile].title}»</small></button></div>
  ${viewMap()}
  ${viewAudit().s.includes('Preguntas') ? raw(viewAudit().s.replace(/<h2>[^<]*<\/h2>/, '').replace(/<div class="statgrid">[\s\S]*?<\/div><\/div>\s*<div class="box"><h3>Preguntas/, '<div class="box"><h3>Preguntas')) : ''}`;
}
// ===== ESCUCHA =====
function buildQueue(src = S.qsrc) {
  S.qsrc = src; let list;
  if (src === 'pending') list = lib.faces().filter((p) => p.meta.review === 'pending');
  else if (src === 'uncategorized') list = lib.faces().filter((p) => !p.meta.category);
  else if (src === 'filter') list = lib.faces().filter((p) => lib.matches(p, { ...S.q, features: S.q.features?.length ? S.q.features : undefined }));
  else if (src === 'selection') list = [...S.multi].map((id) => faceOf(lib.byId(id))).filter(Boolean);
  else if (src === 'unmeasured') list = lib.faces().filter((p) => !p.acoustic);
  else if (src.startsWith('col:')) { const c = lib.collections.find((x) => x.id === src.slice(4)); list = c ? lib.faces().filter((p) => c.kind === 'manual' ? c.ids.includes(p.id) : lib.matches(p, c.query)) : []; }
  else list = lib.faces();
  // Una sola escucha por familia: el resto se revisa desde Comparar. En la cola va cada sonido (su original).
  const { of } = lib.families(), seen = new Set();
  list = list.filter((p) => { const f = of.get(p.id); if (!f) return true; if (seen.has(f.id)) return false; seen.add(f.id); return true; });
  const cur = S.queue[S.qi];
  S.queue = [...new Set(list.map((p) => lib.rootOf(p).id))]; S.qi = Math.max(0, cur ? S.queue.indexOf(cur) : 0);
}
function viewAudition() {
  if (!lib.patches.length) return html`<div class="empty"><h3>Nada que escuchar</h3><p>Importa patches en Library o léelos desde Equipo.</p></div>`;
  const id = S.queue[S.qi], p = id && faceOf(lib.byId(id)), live = !!S.dev.session;
  const srcs = [['pending', 'Pendientes de revisión'], ['uncategorized', 'Sin categoría'], ['unmeasured', 'Sin medir'], ['filter', 'Filtro de Library'], ['selection', `Selección (${S.multi.size})`], ['all', 'Toda la biblioteca'], ...lib.collections.map((c) => ['col:' + c.id, 'Colección · ' + c.name])];
  const queueHtml = html`<div class="queue"><div class="qh"><select class="sel" data-act="qsrc" style="max-width:none">${srcs.map(([k, l]) => html`<option value="${k}" ${S.qsrc === k ? 'selected' : ''}>${l}</option>`)}</select><span class="note">${S.queue.length} en cola · una por familia</span></div>
    <div class="ql">${S.queue.slice(0, 600).map((qid, i) => { const q = faceOf(lib.byId(qid)); if (!q) return ''; const cat = effCat(q); return html`<div class="qi ${i === S.qi ? 'on' : ''}" data-act="qgo" data-i="${i}"><span class="ix">${i + 1}</span><span class="nm">${q.name}</span><span>${q.meta.category ? html`<span class="dot ok"></span>` : ''}${cat ? html`<span class="badge ${q.meta.category ? '' : 'prop'}">${catName(cat)}</span>` : ''}</span></div>`; })}</div></div>`;
  if (!p) return html`<h2>Escucha</h2><div class="aud">${queueHtml}<div class="empty"><h3>Cola vacía</h3><p>Elige otra fuente de cola.</p></div></div>`;
  const inf = lib.info(p), c = inf.cls, m = p.meta, tp = testPlan(p, 'auto');
  const v = inf.an.decoded.v, saved = !!m.category, cat = m.category || c.category, subs = cat ? lib.tax[cat] : [];
  const propSub = c.category === cat && c.subtype && c.subtype !== (saved ? m.subtype : null) ? c.subtype : null;
  return html`<h2>Escucha y decisión</h2>
  ${live ? html`<div class="banner ok">${raw(IC.okc)}<span>Conectado a <b>${S.dev.session.name}</b> · Synth ${S.dev.synth + 1} (canal ${S.dev.channels[S.dev.synth] + 1}) · ${tempoNow()} BPM${S.followClock && S.dev.session.clockTempo() ? ' (reloj del equipo)' : ''}${S.dev.audioId ? ' · medición activa' : ''}</span><span style="flex:1"></span><button class="btn small" data-act="view" data-v="device">Ajustes</button></div>` : html`<div class="banner">${raw(IC.warn)}<span>Sin equipo conectado: puedes decidir igualmente, pero escuchar en el Circuit Tracks es la forma fiable de clasificar.</span><button class="btn small primary" data-act="midiConnect">Conectar Circuit Tracks</button></div>`}
  <div class="aud">${queueHtml}
  <div class="stage">
    <div class="hero"><div class="mlabel">${S.qi + 1} / ${S.queue.length} · ${p.folderPath || p.fileName || ''}</div><h2>${p.name}${chgBadge(p)}</h2>
      <div class="meta"><div class="audfolder"><div class="mlabel"><span>Carpeta</span><span>${saved ? 'tuya · ' + REVIEW[m.review].toLowerCase() : cat ? 'propuesta · ' + CERTAINTY[c.certainty].label.toLowerCase() : 'sin propuesta'}</span></div>
          <div class="row2" style="gap:6px"><select class="sel" data-act="audCatSel" aria-label="Categoría del patch que suena">${cat ? '' : html`<option value="">Elegir categoría…</option>`}${CATEGORIES.map((x) => html`<option value="${x.id}" ${x.id === cat ? 'selected' : ''}>${x.label}${!saved && x.id === c.category ? ' (propuesta)' : ''}</option>`)}</select>${!saved && c.category ? html`<button class="btn small primary" data-act="audAccept" title="Aceptar la propuesta y pasar al siguiente">Aceptar <span class="kbd">INTRO</span></button>` : ''}</div>
          ${subs.length ? html`<div class="subchips" style="margin-top:6px">${subs.map((x) => html`<button class="subc ${saved && m.subtype === x.id ? 'on' : ''} ${propSub === x.id ? 'prop' : ''}" data-act="audSub" data-c="${cat}" data-s="${x.id}" aria-pressed="${saved && m.subtype === x.id}" title="${propSub === x.id ? 'Propuesta' : ''}">${x.label}</button>`)}</div>` : ''}
          ${nnHint(p, true)}</div>
        <div><div class="mlabel">Voz · amp env</div><div class="note">${['Mono', 'Mono AG', 'Poly'][v['voice.poly']]} · A ${fmtSeconds(approxSeconds(v['env1.a']))} · R ${fmtSeconds(approxSeconds(v['env1.r']))}</div><div class="note">${FILTER_TYPES[v['filter.type']]} · cutoff ${v['filter.freq']} · res ${v['filter.res']}</div></div>
        <div><div class="mlabel">Valoración</div><div class="stars" style="font-size:18px">${[1, 2, 3, 4, 5].map((n) => html`<span class="${n <= (m.rating || 0) ? 'on' : ''}" data-act="rate" data-n="${n}">★</span>`)}</div><div class="note">${m.fav ? '♥ favorito' : ''}</div></div></div>
      ${c.contradictions.length ? html`<p class="note" style="margin-top:8px">⚠ ${c.contradictions.map((x) => x.text).join(' · ')}</p>` : ''}
      ${p.acoustic && !p.acoustic.desc.silent ? html`<div class="mfeat" style="margin-top:8px">${p.acoustic.features.map((f) => html`<span class="badge" title="${f.basis}">${f.label}</span>`)}</div>` : ''}</div>
    <div class="row2"><button class="btn big play ${S.playing ? 'on' : ''}" data-act="audPlay" ${live ? '' : 'disabled'}>${raw(IC.play)}Escuchar <span class="kbd">ESPACIO</span></button><button class="btn big" data-act="audStop" ${live ? '' : 'disabled'}>${raw(IC.stop)}<span class="kbd">ESC</span></button><button class="btn big" data-act="measureSel" ${live && S.dev.audioId ? '' : 'disabled'} title="${S.dev.audioId ? '' : 'Configura una entrada de audio en Equipo'}">${raw(IC.mic)}Medir <span class="kbd">M</span></button>
      <select class="sel" data-act="phrase" style="max-width:none" aria-label="Frase de prueba"><option value="auto" ${S.phrase === 'auto' ? 'selected' : ''}>Automática (${tp.src === 'att' ? 'patrón adjunto: ' : ''}${tp.label})</option>${Object.entries({ ...PHRASES, ...S.customPhrases }).map(([k, f]) => html`<option value="${k}" ${S.phrase === k ? 'selected' : ''}>${f.custom ? '● ' : ''}${f.label}</option>`)}${(lib.settings.patterns || []).length ? html`<optgroup label="Tus patrones">${lib.settings.patterns.filter((x) => x.kind !== 'drum').map((x) => html`<option value="pat:${x.id}" ${S.phrase === 'pat:' + x.id ? 'selected' : ''}>▦ ${x.name}</option>`)}</optgroup>` : ''}</select>
      <label class="note"><input type="checkbox" class="chk" data-act="opt" data-k="autoPlay" ${S.autoPlay ? 'checked' : ''}> auto-escuchar</label><label class="note"><input type="checkbox" class="chk" data-act="opt" data-k="autoNext" ${S.autoNext ? 'checked' : ''}> avanzar al decidir</label></div>
    <div class="box">${testBox(p, 'aud')}</div>
    <div class="box"><h3>Macros en el equipo <small>mantiene una nota y barre 0→127→0 · Mayús+1…8</small></h3><div class="sweeps">${inf.macros.knobs.map((k) => html`<button class="btn" data-act="sweep" data-k="${k.index}" ${live ? '' : 'disabled'}>M${k.index + 1}<small>${k.activeCount ? k.slots.find((s) => s.state === 'active').info.label : 'sin efecto'}</small></button>`)}</div></div>
    <div class="box"><h3>Decidir <small>tecla = categoría y siguiente · Intro = aceptar la propuesta (o confirmar la tuya) · 1–5 valoración · F favorito · Supr eliminar · ← → navegar · ? todos los atajos</small></h3>
      <div class="keys">${CATEGORIES.filter((x) => KEY_OF[x.id]).map((x) => html`<button class="btn ${m.category === x.id ? 'cur' : c.category === x.id ? 'prop' : ''}" data-act="audCat" data-c="${x.id}">${x.label}<kbd>${KEY_OF[x.id]}</kbd></button>`)}</div>
      <div class="row2" style="margin-top:8px"><button class="btn primary" data-act="audAccept" ${c.category || m.category ? '' : 'disabled'}>${m.category ? 'Confirmar' : 'Aceptar propuesta'} <span class="kbd">INTRO</span></button><button class="btn" data-act="audReview" data-r="keep">Conservar</button><button class="btn" data-act="audReview" data-r="discard" title="Se queda en la biblioteca, pero no se exporta">Descartar <span class="kbd">MAYÚS SUPR</span></button><button class="btn danger" data-act="audDelete" title="Fuera de la biblioteca (a la papelera; Ctrl+Z deshace)">Eliminar <span class="kbd">SUPR</span></button><button class="btn" data-act="audFav">${m.fav ? '♥ Favorito' : '♡ Favorito'} <span class="kbd">F</span></button><span style="flex:1"></span><button class="btn" data-act="qstep" data-d="-1">◀</button><button class="btn" data-act="qstep" data-d="1">Siguiente ▶</button><button class="btn" data-act="openSel">Abrir ficha</button></div>
      <div class="row2" style="margin-top:8px">${octBtnsHTML(p)}</div>${tagClipHTML()}
      <div class="qtags"><span class="mlabel">Etiquetas rápidas</span>${quickTags().map((t, i) => html`<button class="tq ${(m.tags || []).includes(t) ? 'on' : ''}" data-act="audTag" data-t="${t}" title="Alt+${i + 1}">${t}<sup>${i + 1}</sup></button>`)}</div></div>
  </div></div>`;
}
// Toca el sonido con su frase de prueba (testPlan, igual en toda la herramienta). payload: otra carga (p. ej. «▶ corregido»).
async function audPlay(p = cur(), payload = null) {
  const s = S.dev.session; if (!s || !p) return;
  const r = playTest(p, payload); if (!r) return;
  S.playing = true; $('[data-act="audPlay"]')?.classList.add('on');
  clearTimeout(S.playTimer); S.playTimer = setTimeout(() => { S.playing = false; $('[data-act="audPlay"]')?.classList.remove('on'); }, r.end - performance.now());
  lib.logAudition(p.id);
}
// Eliminar sin preguntar: va a la papelera y el aviso ofrece deshacer. En Escucha pasa al siguiente.
async function trashIds(ids) {
  ids = ids.filter((id) => lib.byId(id)); if (!ids.length) return;
  const name = ids.length === 1 ? lib.byId(ids[0]).name : `${ids.length} patches`;
  ids = [...new Set(ids.flatMap((id) => lib.groupIds(id)))]; // el sonido entero: original, versión y propuestas
  const set = new Set(ids);
  if (S.sel && set.has(S.sel)) { const rows = (S.rows || []).filter((r) => !r.header && r.p); const i = rows.findIndex((r) => r.p.id === S.sel); const nx = rows.slice(i + 1).find((r) => !set.has(r.p.id)) || rows.slice(0, Math.max(0, i)).reverse().find((r) => !set.has(r.p.id)); S.sel = nx ? nx.p.id : null; }
  const atQ = S.queue.indexOf(S.queue[S.qi]);
  await lib.deletePatches(ids);
  for (const id of ids) S.multi.delete(id);
  S.queue = S.queue.filter((id) => !set.has(id)); S.qi = Math.max(0, Math.min(atQ, S.queue.length - 1));
  S.rowsKey = ''; rerender();
  toastAct(`${name} a la papelera`, 'Deshacer · Ctrl Z', undoLast);
  if (S.view === 'audition' && S.autoPlay && S.queue.length) audPlay();
}
async function undoLast() {
  const h = lib.lastUndoable(); if (!h) { toast('Nada que deshacer'); return; }
  try { await lib.undo(h.id); } catch (e) { toast(e.message); return; }
  if (h.op === 'delete') { const back = [...new Set(h.ids.filter((id) => lib.byId(id)).map((id) => lib.rootOf(lib.byId(id)).id))].filter((id) => !S.queue.includes(id)); if (back.length && S.view === 'audition') { S.queue.splice(S.qi, 0, ...back); } const f = faceOf(lib.byId(h.ids[0])); if (f && S.view !== 'audition') S.sel = f.id; }
  S.rowsKey = ''; toast('Deshecho: ' + h.text); rerender();
}
async function audDecide(fn) {
  const p = cur(); if (!p) return;
  await fn(p);
  if (S.autoNext && S.qi < S.queue.length - 1) { S.qi++; rerender(); if (S.autoPlay) audPlay(); } else rerender();
}

// ===== MAPA =====
function viewMap() {
  if (lib.patches.length < 3) return html`<div class="empty"><h3>Mapa</h3><p>Hacen falta al menos 3 patches.</p></div>`;
  const ranking = lib.affinityRanking(30), refs = lib.referenceSet();
  const cats = [...new Set(lib.faces().map((p) => effCat(p) || 'none'))];
  const la = LA();
  return html`<h3 class="sec-h">Grupos y mapa técnico</h3>
  <div class="box"><h3>Clusters de parámetros <small>k-means sobre los parámetros de síntesis · etiqueta = categoría dominante</small></h3><div class="clusters">${la.clusters.map((c) => html`<button class="clus" data-act="clusterGo" data-id="${c.id}"><b>${c.label}</b><span>${c.size} patches · ${Math.round(c.purity * 100)} % ${c.label}</span><div class="bar acc"><i style="width:${c.purity * 100}%"></i></div></button>`)}</div><p class="note">Grupos técnicos, no sonoros. Un grupo mezclado indica patches parecidos en parámetros pero clasificados distinto: buen sitio para escuchar y corregir.</p></div>
  <p class="note">Cada punto es un patch, colocado por proyección (PCA) de sus parámetros de síntesis: los puntos cercanos tienen configuraciones parecidas. Es un mapa técnico, no auditivo. Pulsa un punto para elegirlo; arrastra para seleccionar una zona.</p>
  <div class="row2"><span class="mlabel">Color</span>${[['category', 'Categoría'], ['certainty', 'Certeza'], ['review', 'Revisión'], ['measured', 'Medidos']].map(([k, l]) => html`<button class="btn small ${S.mapColor === k ? 'on' : ''}" data-act="mapColor" data-k="${k}">${l}</button>`)}</div>
  <div class="legend">${S.mapColor === 'category' ? cats.map((c) => html`<span class="${S.mapHidden.has(c) ? 'off' : ''}" data-act="mapToggle" data-c="${c}"><i style="background:${MAP_COLORS[c] || '#888'}"></i>${c === 'none' ? 'Sin categoría' : CAT_LABEL[c]}</span>`) : ''}</div>
  <div class="mapwrap"><div class="mapc"><canvas id="mapCanvas"></canvas><div class="maptip" id="mapTip"></div></div>
    <div class="side">${mapSelBox()}${S.sel && lib.byId(S.sel) ? (() => { const p = lib.byId(S.sel); return html`<div class="box"><h3>${p.name}</h3><p class="note">${catName(effCat(p)) || 'Sin categoría'} · ${REVIEW[p.meta.review]}</p><div class="row2"><button class="btn small" data-act="listenSel" ${S.dev.session ? '' : 'disabled'}>▶ Escuchar</button><button class="btn small" data-act="openSel">Abrir ficha</button><button class="btn small" data-act="mapNear">Vecinos a la escucha</button></div></div>`; })() : ''}
      <div class="box"><h3>Parecidos a lo que usas <small>${refs.length} de referencia</small></h3>${refs.length ? html`<p class="note">Referencia: favoritos, valorados con ≥ 4 estrellas y patches colocados en packs.</p><table class="t">${ranking.map((r) => html`<tr><td><a href="#" data-act="pick" data-id="${r.id}">${lib.byId(r.id).name}</a></td><td>${catName(effCat(lib.byId(r.id)))}</td><td>${Math.round(r.s * 100)}</td></tr>`)}</table><button class="btn small" data-act="queueAffinity" style="margin-top:6px">Llevar a la escucha</button>` : html`<p class="note">Marca favoritos, valora con 4–5 estrellas o coloca patches en un pack para obtener recomendaciones.</p>`}</div></div></div>`;
}
function drawMap() {
  const cv = $('#mapCanvas'); if (!cv) return;
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; cv.width = r.width * dpr; cv.height = r.height * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const xy = lib.map(), pts = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [, [x, y]] of xy) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  // Escala común en ambos ejes: no se exagera la componente con menos varianza.
  const pad = 18, W = r.width - 2 * pad, H = r.height - 2 * pad, k = Math.min(W / (maxX - minX || 1), H / (maxY - minY || 1));
  const ox = pad + (W - (maxX - minX) * k) / 2, oy = pad + (H - (maxY - minY) * k) / 2, sx = (x) => ox + (x - minX) * k, sy = (y) => oy + (y - minY) * k;
  g.strokeStyle = '#34373b'; g.lineWidth = 1; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(pad + W * i / 4, pad); g.lineTo(pad + W * i / 4, pad + H); g.moveTo(pad, pad + H * i / 4); g.lineTo(pad + W, pad + H * i / 4); g.stroke(); }
  const colorOf = (p) => {
    if (S.mapColor === 'category') return MAP_COLORS[effCat(p) || 'none'] || '#888';
    if (S.mapColor === 'certainty') { const c = p.meta.category ? 'manual' : lib.info(p).cls.certainty; return { manual: '#4fd18b', corroborated: '#a7c9a0', textual: '#b9b8b3', technical: '#8a8c8f', ambiguous: '#ffb340', none: '#4a4e54' }[c]; }
    if (S.mapColor === 'review') return { pending: '#5c5f64', reviewed: '#b9b8b3', listened: '#4fd18b', keep: '#a7c9a0', discard: '#ff5a5a' }[p.meta.review] || '#888';
    return p.acoustic ? '#4fd18b' : '#4a4e54';
  };
  const hl = mapHLSet();
  for (const p of lib.faces()) {
    const c = xy.get(p.id); if (!c) continue;
    if (S.mapColor === 'category' && S.mapHidden.has(effCat(p) || 'none')) continue;
    const X = sx(c[0]), Y = sy(c[1]); pts.push({ id: p.id, X, Y });
    const on = !hl || hl.has(p.id);
    g.beginPath(); g.arc(X, Y, (p.meta.fav ? 4.5 : 3.2) * (hl && on ? 1.25 : 1), 0, Math.PI * 2); g.fillStyle = colorOf(p); g.globalAlpha = hl ? (on ? 0.95 : 0.12) : 0.85; g.fill(); g.globalAlpha = 1;
  }
  // seleccionados (los mismos que en la biblioteca)
  if (S.multi.size) { g.strokeStyle = '#ebe8e3'; g.lineWidth = 1.2; for (const q of pts) if (S.multi.has(q.id)) { g.beginPath(); g.arc(q.X, q.Y, 6, 0, Math.PI * 2); g.stroke(); } }
  const sel = pts.find((q) => q.id === S.sel);
  if (sel) { g.beginPath(); g.arc(sel.X, sel.Y, 8, 0, Math.PI * 2); g.strokeStyle = '#ff6a2b'; g.lineWidth = 2; g.stroke(); }
  mapSelDraw(g);
  S.mapPts = pts;
  const near = (e) => { const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top; let best = null, bd = 100; for (const q of S.mapPts) { const d = (q.X - x) ** 2 + (q.Y - y) ** 2; if (d < bd) { bd = d; best = q; } } return { best, x, y }; };
  mapSelInstall(cv);
  cv.onmousemove = (e) => { if (S._mdrag?.moved) { $('#mapTip').style.display = 'none'; return; } const { best, x, y } = near(e), tip = $('#mapTip'); if (!best) { tip.style.display = 'none'; return; } const p = lib.byId(best.id); tip.textContent = `${p.name} · ${catName(effCat(p)) || 'sin categoría'}`; tip.style.display = 'block'; tip.style.left = Math.min(x + 12, cv.clientWidth - 180) + 'px'; tip.style.top = y + 10 + 'px'; };
  cv.onmouseleave = () => { $('#mapTip').style.display = 'none'; };
  cv.onclick = (e) => { if (S._mdragDone) { S._mdragDone = false; return; } const { best } = near(e); if (best) { S.sel = best.id; rerender(); } };
}

// ===== AUDITORÍA (incluye reglas y calibración) =====
function statsOf() {
  const st = { cats: {}, user: 0, cert: {}, mono: 0, longEnv: 0, dist: 0, lfo: 0, inactive: 0, integrity: 0, contr: 0, pending: 0, seq: 0, variants: 0, measured: 0, mdark: 0, mlow: 0 };
  for (const p of lib.faces()) {
    const i = lib.info(p), c = i.cls, H = (id) => i.an.features.some((f) => f.id === id), HM = (id) => p.acoustic?.features?.some((f) => f.id === id);
    const cat = p.meta.category || c.category || (c.candidates ? 'ambiguous' : 'none');
    st.cats[cat] = (st.cats[cat] || 0) + 1; if (p.meta.category) st.user++;
    st.cert[c.certainty] = (st.cert[c.certainty] || 0) + 1;
    if (H('mono')) st.mono++; if (H('long-release') || H('slow-attack')) st.longEnv++; if (H('distortion') || H('filter-drive')) st.dist++; if (H('lfo-mod')) st.lfo++; if (H('fast-attack') && H('short-decay')) st.seq++;
    if (i.macros.knobs.some((k) => !k.activeCount)) st.inactive++; if (i.integrity.some((x) => x.level !== 'info')) st.integrity++; if (c.contradictions.length) st.contr++;
    if (p.meta.review === 'pending') st.pending++; if (p.kind === 'variant') st.variants++; if (p.acoustic) st.measured++; if (HM('m-dark')) st.mdark++; if (HM('m-low')) st.mlow++;
  }
  return st;
}
function viewAudit() {
  if (!lib.patches.length) return html`<div class="empty"><h3>Sin datos</h3><p>Importa patches para auditar la colección.</p></div>`;
  const st = statsOf(), dups = lib.duplicates(), fams = lib.families().list, N = lib.faces().length, maxc = Math.max(...Object.values(st.cats));
  const q = (label, n, query) => html`<button data-act="ask" data-q="${JSON.stringify(query)}"><span>${label}</span><b>${n}</b></button>`;
  const cal = calibration(lib.decisions());
  const tokenFreq = new Map(); for (const p of lib.faces()) if (!p.meta.category) for (const t of lib.info(p).cls.unknownTokens) tokenFreq.set(t, (tokenFreq.get(t) || 0) + 1);
  const topTok = [...tokenFreq.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 16);
  return html`<h2>Auditoría</h2>
  <div class="statgrid"><div class="stat"><strong>${N}</strong><span>Patches (${st.variants} editados)</span></div><div class="stat"><strong>${fams.length}</strong><span>Familias de duplicados y parecidos</span></div><div class="stat g"><strong>${st.user}</strong><span>Clasificados por ti</span></div><div class="stat"><strong>${st.pending}</strong><span>Pendientes de revisión</span></div><div class="stat g"><strong>${st.measured}</strong><span>Medidos acústicamente</span></div><div class="stat"><strong>${dups.payload.length}</strong><span>Grupos de duplicados binarios</span></div></div>
  <div class="box"><h3>Preguntas <small>pulsa para filtrar Library</small></h3><div class="qa">
    ${q('¿Cuántos bajos tengo? (tuyos + propuestas)', st.cats.bass || 0, { category: 'bass', includeProposals: true })}${q('Monofónicos', st.mono, { features: ['mono'] })}${q('Envolventes largas', st.longEnv, { features: ['long-release'] })}${q('Con distorsión o drive', st.dist, { features: ['distortion'] })}
    ${q('Con modulación por LFO', st.lfo, { features: ['lfo-mod'] })}${q('Para secuencias cortas', st.seq, { features: ['fast-attack', 'short-decay'] })}${q('Con alguna macro inactiva', st.inactive, { inactiveMacros: true })}${q('Con parámetros anómalos', st.integrity, { integrity: true })}
    ${q('Clasificación contradictoria', st.contr, { contradictions: true })}${q('Sin categoría guardada', N - st.user, { uncategorized: true })}${q('Medidos como graves', st.mlow, { features: ['m-low'] })}${q('Medidos como oscuros', st.mdark, { features: ['m-dark'] })}
  </div></div>
  <div class="grid2"><div class="box"><h3>Por categoría <small>guardada o propuesta</small></h3>${Object.entries(st.cats).sort((a, b) => b[1] - a[1]).map(([k, n]) => html`<div class="hbar" data-act="ask" data-q="${JSON.stringify(k === 'ambiguous' ? { certainty: 'ambiguous' } : k === 'none' ? { certainty: 'none', uncategorized: true } : { category: k, includeProposals: true })}"><span>${k === 'ambiguous' ? 'Ambigua' : k === 'none' ? 'Sin evidencia' : CAT_LABEL[k]}</span><div class="bar"><i style="width:${(n / maxc) * 100}%"></i></div><span>${n}</span></div>`)}</div>
    <div class="box"><h3>Certeza de las propuestas</h3>${Object.entries(CERTAINTY).filter(([k]) => k !== 'manual').map(([k, v]) => html`<div class="hbar" data-act="ask" data-q="${JSON.stringify({ certainty: k })}"><span>${v.label}</span><div class="bar"><i style="width:${((st.cert[k] || 0) / N) * 100}%"></i></div><span>${st.cert[k] || 0}</span></div>`)}
      <h3 style="margin-top:12px">Calibración <small>propuesta frente a tu decisión</small></h3>${Object.keys(cal).length ? html`<table class="t"><tr><th>Certeza</th><th>N</th><th>Aceptadas</th><th>Corregidas</th><th>Acierto</th></tr>${Object.entries(cal).map(([k, r]) => html`<tr><td>${CERTAINTY[k]?.label || k}</td><td>${r.total}</td><td>${r.accepted}</td><td>${r.corrected + r.rejected}</td><td>${Math.round((r.accepted / r.total) * 100)} %</td></tr>`)}</table>` : html`<p class="note">Aún sin decisiones.</p>`}</div></div>
  <div class="box"><h3>Familias <small>duplicados y parecidos agrupados; una escucha por familia</small></h3>${fams.slice(0, 60).map((f) => html`<div class="row2" style="margin:3px 0">${f.members.map((m, i) => html`${i ? '·' : ''}<a href="#" data-act="pick" data-id="${m.id}">${lib.byId(m.id)?.name}</a>${m.rel ? html` <span class="note">(${m.rel.level === 'payload' ? 'idéntico' : m.rel.level === 'synth' ? 'misma síntesis' : m.rel.level === 'macro' || m.rel.level === 'macro-position' ? 'macros' : m.rel.level === 'param' ? m.rel.count + ' parám.' : 'parecido'})</span>` : ''}`)}</div>`)}${fams.length > 60 ? html`<p class="note">… y ${fams.length - 60} más.</p>` : ''}${fams.length ? '' : html`<p class="note">Sin familias.</p>`}</div>
  <div class="box"><h3>Reglas aprendidas <small>peso 4 (código Novation: 2)</small></h3>${lib.rules.length ? html`<table class="t"><tr><th>Tipo</th><th>Patrón</th><th>Categoría</th><th>Activa</th><th></th></tr>${lib.rules.map((r) => html`<tr><td>${{ token: 'Palabra', folder: 'Carpeta', nvcat: 'Código Novation', patch: 'Excepción' }[r.type]}</td><td>${r.type === 'patch' ? r.pattern.slice(0, 10) + '…' : r.pattern}</td><td>${catName(r.category, r.subtype)}</td><td><input type="checkbox" class="chk" data-act="ruleToggle" data-id="${r.id}" ${r.enabled ? 'checked' : ''}></td><td><button class="btn small danger" data-act="ruleDel" data-id="${r.id}">Eliminar</button></td></tr>`)}</table>` : html`<p class="note">Se proponen al corregir una clasificación.</p>`}
    <div class="row2" style="margin-top:8px"><select class="sel" id="rType"><option value="token">Palabra</option><option value="folder">Carpeta</option><option value="nvcat">Código Novation</option></select><input class="field" id="rPat" placeholder="patrón" style="width:160px"><select class="sel" id="rCat">${CATEGORIES.map((c) => html`<option value="${c.id}">${c.label}</option>`)}</select><button class="btn small" data-act="ruleAdd">Añadir</button></div>
    ${topTok.length ? html`<p class="mlabel" style="margin-top:10px">Palabras frecuentes sin interpretar</p><div class="chips">${topTok.map(([t, n]) => html`<span class="badge prop">${t} · ${n}</span>`)}</div>` : ''}</div>`;
}
// ===== MACROS =====
function viewMacros() {
  const rows = lib.faces().map((p) => ({ p, a: lib.info(p).macros })).filter((x) => x.a.integrity.length || x.a.shared.length || x.a.knobs.some((k) => !k.activeCount));
  return html`<h2>Macros</h2>
  <div class="box"><h3>Observaciones en la colección <small>${rows.length} patches</small></h3><p class="note"><b>Integridad</b> = códigos fuera de rango. <b>Observaciones</b> = macros sin efecto o destinos compartidos: no son errores.</p>
    <table class="t"><tr><th>Patch</th><th>Activas</th><th>Inactivas</th><th>Compartidos</th><th>Integridad</th></tr>${rows.slice(0, 300).map(({ p, a }) => html`<tr><td><a href="#" data-act="pickMacros" data-id="${p.id}">${p.name}</a></td><td>${a.knobs.filter((k) => k.activeCount).map((k) => 'M' + (k.index + 1)).join(' ')}</td><td>${a.knobs.filter((k) => !k.activeCount).map((k) => 'M' + (k.index + 1)).join(' ')}</td><td>${a.shared.map((s) => s.label + ' (' + s.knobs.map((k) => 'M' + (k + 1)).join('/') + ')').join('; ')}</td><td>${a.integrity.length ? '⚠ ' + a.integrity.length : '—'}</td></tr>`)}</table></div>
  <div class="box"><h3>24 perfiles <small>distribuciones opcionales</small></h3><div class="grid2">${Object.entries(PROFILES).map(([, pr]) => html`<div class="box" style="background:var(--surf)"><h3>${pr.title}</h3><div class="fgroups">${pr.knobs.map((k, i) => html`<div class="fgroup"><span>M${i + 1}</span>${k.label}</div>`)}</div></div>`)}</div></div>
  <div class="box"><h3>Macros en bloque <small>${S.multi.size} seleccionados en Library</small></h3><div class="row2"><select class="sel" data-act="profile" style="max-width:none">${Object.entries(PROFILES).map(([id, pr]) => html`<option value="${id}" ${S.profile === id ? 'selected' : ''}>${pr.title}</option>`)}</select><button class="btn small" data-act="bulkProfile" data-m="reorder" ${S.multi.size ? '' : 'disabled'}>Reordenar</button><button class="btn small" data-act="bulkProfile" data-m="fill" ${S.multi.size ? '' : 'disabled'}>Rellenar vacías</button></div><p class="note">Quedan como propuesta en cada sonido (solo si cambia algo): escúchalas y aplícalas en Cambios.</p></div>`;
}
// ===== PACKS =====
function viewBanks() {
  const b = lib.banks.find((x) => x.id === S.bank) || lib.banks[0]; if (!b) return ''; S.bank = b.id;
  const iss = lib.bankIssues(b), dupSet = new Set(iss.dups.flat()), misSet = new Set(iss.blockMismatch), pick = S.bankPick.toLowerCase();
  const avail = lib.faces().filter((p) => !pick || (p.name + ' ' + (p.meta.category || '') + ' ' + p.folderPath).toLowerCase().includes(pick)).slice(0, 300);
  const slots = Array.from({ length: 32 }, (_, i) => S.page * 32 + i);
  return html`<h2>Packs · 128 posiciones</h2>
  <div class="status"><div class="i">${raw(IC.inf)}<b>Mapa virtual</b><span>El Pack nativo (.circuittrackspack) lo crea Components: se exportan 128 .syx numerados + mapa CSV para montarlo allí.</span></div></div>
  <div class="row2"><select class="sel" data-act="bankSel" style="max-width:none">${lib.banks.map((x) => html`<option value="${x.id}" ${x.id === b.id ? 'selected' : ''}>${x.name}</option>`)}</select><button class="btn small" data-act="bankNew">Nuevo</button><button class="btn small" data-act="bankRename">Renombrar</button><button class="btn small" data-act="bankDup">Duplicar</button><button class="btn small danger" data-act="bankDel">Eliminar</button><span style="flex:1"></span><button class="btn small accent" data-act="buildPackModal">Construir automáticamente</button><button class="btn small" data-act="bankBlock">Reservar bloque</button><button class="btn small primary" data-act="bankExport">Exportar ZIP</button></div>
  <div class="note">${b.slots.filter(Boolean).length}/128 · ${iss.gaps.length} huecos · ${iss.dups.length} duplicados de síntesis · ${iss.blockMismatch.length} fuera de su bloque</div>
  <div class="grid2" style="grid-template-columns:260px 1fr">
    <div><input class="field" id="bankPick" placeholder="Buscar patch…" value="${S.bankPick}"><div class="minilist" style="margin-top:6px">${avail.map((p) => html`<div draggable="true" data-drag="${p.id}" data-act="bankPickPatch" data-id="${p.id}" style="${S.sel === p.id ? 'background:var(--surf2)' : ''}"><span>${p.name}</span><span class="note">${catName(effCat(p))}</span></div>`)}</div><p class="note">Arrastra a una posición, o selecciona y pulsa la posición. Arrastra entre posiciones para intercambiar.</p></div>
    <div><div class="subtabs">${[0, 1, 2, 3].map((i) => html`<button class="btn small ${S.page === i ? 'on' : ''}" data-act="bankPage" data-i="${i}">${i * 32 + 1}–${i * 32 + 32}</button>`)}</div>
    <div class="slots">${slots.map((i) => { const p = b.slots[i] && lib.byId(b.slots[i]), blk = b.blocks.find((k) => i >= k.from && i <= k.to); return html`<div class="slot ${p ? 'fill' : ''} ${dupSet.has(i) ? 'dup' : ''} ${misSet.has(i) ? 'mis' : ''} ${S.slotSel === i ? 'selslot' : ''}" data-slot="${i}" data-act="slot" draggable="${p ? 'true' : 'false'}">${blk ? raw('<span class="blk"></span>') : ''}<div class="n">${String(i + 1).padStart(3, '0')}${blk ? ' · ' + blk.label : ''}</div>${p ? html`<div class="p">${p.name}</div><div class="c">${catName(effCat(p))}</div>` : ''}</div>`; })}</div>
    ${S.slotSel >= 0 && b.slots[S.slotSel] ? html`<div class="row2" style="margin-top:8px"><span class="note">Posición ${S.slotSel + 1}</span><button class="btn small" data-act="slotClear">Vaciar</button><button class="btn small" data-act="slotListen" ${S.dev.session ? '' : 'disabled'}>▶ Escuchar</button><button class="btn small" data-act="slotOpen">Abrir</button></div>` : ''}</div></div>`;
}
// ===== EQUIPO =====
function viewDevice() {
  const d = S.dev, acc = d.access, ports = acc ? findCircuitPorts(acc) : null, s = d.session, ct = s?.clockTempo();
  const chSel2 = (k, v) => html`<select class="field" data-act="devCh2" data-k="${k}">${Array.from({ length: 15 }, (_, c) => html`<option value="${c}" ${v === c ? 'selected' : ''}>Canal ${c + 1}</option>`)}</select>`;
  const chSel = (i) => html`<select class="field" data-act="devCh" data-i="${i}">${Array.from({ length: 15 }, (_, c) => html`<option value="${c}" ${d.channels[i] === c ? 'selected' : ''}>Canal ${c + 1}</option>`)}</select>`;
  return html`<h2>Equipo</h2>
  <div class="grid2"><div class="box"><h3>Conexión MIDI <small>Web MIDI · Chrome / Edge · USB</small></h3>
    ${acc ? html`<div class="grid2"><label class="lab">Salida<select class="field" data-act="devSet" data-k="outId">${ports.outputs.map((o) => html`<option value="${o.id}" ${d.outId === o.id ? 'selected' : ''}>${o.name}</option>`)}</select></label><label class="lab">Entrada (respuestas, notas, CC y reloj)<select class="field" data-act="devSet" data-k="inId">${ports.inputs.map((o) => html`<option value="${o.id}" ${d.inId === o.id ? 'selected' : ''}>${o.name}</option>`)}</select></label></div>
      <div class="grid3" style="margin-top:8px"><label class="lab">Pista de escucha<select class="field" data-act="devSet" data-k="synth"><option value="0" ${d.synth === 0 ? 'selected' : ''}>Synth 1</option><option value="1" ${d.synth === 1 ? 'selected' : ''}>Synth 2</option></select></label><label class="lab">Canal Synth 1${chSel(0)}</label><label class="lab">Canal Synth 2${chSel(1)}</label></div>
      <div class="grid3" style="margin-top:8px"><label class="lab">Canal MIDI 1${chSel2('m0', d.chMidi?.[0] ?? 2)}</label><label class="lab">Canal MIDI 2${chSel2('m1', d.chMidi?.[1] ?? 3)}</label><label class="lab">Canal baterías (Drum 1–4)${chSel2('dr', d.chDrum ?? 9)}</label></div>
      <p class="note">Valores de fábrica: Synth 1 = 1, Synth 2 = 2, MIDI 1 = 3, MIDI 2 = 4 y las cuatro baterías = 10 (notas 60, 62, 64 y 65). Si los cambiaste en Setup View del equipo, ajústalos aquí: los usan las frases de prueba y «Grabar en el Circuit».</p>
      <div class="banner ${s ? 'ok' : ''}" style="margin-top:8px">${s ? html`${raw(IC.okc)} Sesión activa con ${s.name}` : html`${raw(IC.warn)} Elige la salida de Circuit Tracks`}</div>` : html`<p class="note">Pide permiso MIDI con SysEx. Nada se envía sin una acción tuya; escuchar usa «Replace Current Patch» (RAM de la pista) y <b>nunca escribe en la memoria</b>.</p><button class="btn primary" data-act="midiConnect">Conectar</button>`}</div>
    <div class="box"><h3>Tempo y frases</h3>
      <div class="row2"><label class="lab">Tempo propio<input class="field" type="number" min="40" max="240" value="${d.tempo}" data-act="devSet" data-k="tempo" style="width:80px"></label><label class="lab">Transponer frases<input class="field" type="number" min="-12" max="12" value="${d.root}" data-act="devSet" data-k="root" style="width:80px"></label><label class="lab" title="Tiempo entre enviar el patch y tocar la primera nota. Súbelo si la primera nota suena con el patch anterior.">Espera tras enviar (ms)<input class="field" type="number" min="20" max="500" value="${d.patchDelay ?? 80}" data-act="devSet" data-k="patchDelay" style="width:90px"></label><label class="note"><input type="checkbox" class="chk" data-act="opt" data-k="followClock" ${S.followClock ? 'checked' : ''}> seguir el reloj del equipo</label></div>
      <p class="note">Reloj recibido: <b id="clockBpm">${ct ? ct + ' BPM' : 'no llega (activa Clock Tx en Setup View o pon el equipo en marcha)'}</b></p>
      <div class="row2" style="margin-top:6px"><button class="btn small ${S.capturing ? 'primary' : ''}" data-act="capture" ${s && d.inId ? '' : 'disabled'}>${S.capturing ? '■ Parar y guardar frase' : '● Capturar frase de los pads'}</button><span class="note">Toca en Note View del equipo (Note Tx activo). Se cuantiza a semicorcheas.</span></div>
      ${Object.keys(S.customPhrases).length ? html`<table class="t" style="margin-top:6px">${Object.entries(S.customPhrases).map(([k, ph]) => html`<tr><td>${ph.label}</td><td>${ph.notes.length} notas</td><td><button class="btn small" data-act="phraseTry" data-k="${k}" ${s ? '' : 'disabled'}>▶</button> <button class="btn small danger" data-act="phraseDel" data-k="${k}">✕</button></td></tr>`)}</table>` : ''}</div></div>
  <div class="grid2"><div class="box"><h3>Macros del equipo</h3><p class="note">Con CC Tx activo, al girar las macros del Circuit Tracks llegan sus posiciones (CC 80–87). Puedes guardarlas en la versión del patch seleccionado sin grabarlas en el equipo.</p>
      <div class="sweeps" id="liveMacros">${(s?.macroPos[d.synth] || new Array(8).fill(null)).map((v, i) => html`<div class="btn" style="cursor:default">M${i + 1}<small>${v ?? '—'}</small></div>`)}</div>
      <div class="row2" style="margin-top:8px"><button class="btn small" data-act="saveLiveMacros" ${s && S.sel ? '' : 'disabled'}>Guardar posiciones en «${S.sel ? lib.byId(S.sel)?.name : '—'}»</button></div></div>
    <div class="box"><h3>Medición acústica <small>opcional</small></h3><p class="note">Salida de audio del Circuit Tracks → interfaz → elige la entrada. Se graba una nota de prueba con el procesado del navegador desactivado.</p>
      <div class="row2"><button class="btn small" data-act="audioList">Elegir entrada</button>${S.audioInputs ? html`<select class="sel" data-act="devSet" data-k="audioId" style="max-width:none">${[html`<option value="">— ninguna —</option>`, ...S.audioInputs.map((a) => html`<option value="${a.deviceId}" ${d.audioId === a.deviceId ? 'selected' : ''}>${a.label || 'Entrada ' + a.deviceId.slice(0, 6)}</option>`)]}</select>` : d.audioId ? html`<span class="note">Entrada guardada</span>` : ''}</div>
      <div style="margin-top:8px"><div class="mlabel">Nivel</div><div class="meter"><i id="lvl"></i></div><div class="row2" style="margin-top:6px"><button class="btn small" data-act="audioTest" ${d.audioId ? '' : 'disabled'}>Probar nivel 3 s</button><label class="lab">Nota de medición<input class="field" type="number" min="24" max="84" value="${d.measureNote}" data-act="devSet" data-k="measureNote" style="width:80px"></label></div></div>
      <p class="note">Umbrales: percusivo si sustain &lt; ${MT.percSustain * 100} % y ataque &lt; ${MT.percAttackMs} ms; grave si f0 &lt; ${MT.lowHz} Hz; oscuro si centroide &lt; ${MT.darkRatio}× f0, brillante si &gt; ${MT.brightRatio}× f0.</p></div></div>
  <div class="grid2"><div class="box"><h3>Leer del equipo</h3><p class="note">Program Change 0–63 → ~10 ms → petición de volcado. Al terminar se devuelve a la pista el sonido que tenía (por SysEx a la RAM); el número de patch seleccionado sí queda cambiado. No modifica la memoria. Requiere PGM Rx activo (por defecto sí).</p>
      <div class="row2"><button class="btn small" data-act="readCurrent" ${s ? '' : 'disabled'}>Leer patch activo</button><button class="btn small" data-act="readStored" ${s ? '' : 'disabled'}>Leer patches 1–64</button></div>
      <p class="note">La guía solo documenta Program Change 0–63 para los synths: las posiciones 65–128 no se leen.</p></div>
    <div class="box"><h3>Enviar</h3><p class="note">Solo «Replace Current Patch». La herramienta nunca usa «Replace Patch» (escritura en flash).</p><div class="row2"><button class="btn small" data-act="listenSel" ${s && S.sel ? '' : 'disabled'}>Enviar y escuchar el seleccionado</button><button class="btn small" data-act="audStop" ${s ? '' : 'disabled'}>Parar todo</button></div></div></div>
  <details class="box"><summary>Protocolo y mapa de parámetros</summary>${protocolRef()}</details>`;
}
function protocolRef() {
  return html`<table class="t" style="margin-top:8px"><tr><th>Mensaje</th><th>Estructura</th></tr>
    <tr><td>Replace Current Patch</td><td>F0 00 20 29 01 64 00 ubic(0–1) 00 · 340 datos · F7 (350 B)</td></tr>
    <tr><td>Replace Patch</td><td>… 01 nº(0–63) 00 · 340 · F7 — escritura en flash, no usado</td></tr>
    <tr><td>Dump Request</td><td>F0 00 20 29 01 64 40 ubic F7 · respuesta solo por USB</td></tr>
    <tr><td>Canales</td><td>Synth 1 = 1, Synth 2 = 2 · macros CC 80–87 · PGM 0–63 · ≥ 20 ms entre SysEx</td></tr>
    <tr><td>Circuit original</td><td>Producto 0x60, misma estructura de 340 bytes</td></tr>
    <tr><td>Destinos de macro 0–70</td><td>Nombres de la tabla de destinos de la herramienta</td></tr>
    <tr><td>Escala de tiempo</td><td>Exponencial, a partir de «Env 3 Delay 85 ≈ 1 s, 127 ≈ 10 s» (guía de Novation)</td></tr></table>
  <table class="t" style="margin-top:8px"><tr><th>Off.</th><th>Parámetro</th><th>Rango</th><th>Def.</th></tr>${PARAMS.map((d) => html`<tr><td>${d.off}</td><td>${GROUP_LABELS[d.group]} · ${d.label}</td><td>${d.min}–${d.max}</td><td>${d.def}</td></tr>`)}<tr><td>124–203</td><td>Matriz 20 × (fuente1, fuente2, prof., destino)</td><td>0–12 / 0–127 / 0–17</td><td>0,0,64,0</td></tr><tr><td>204–339</td><td>8 macros × (posición + 4 × destino, inicio, fin, prof.)</td><td>0–127 / 0–70</td><td></td></tr></table>
  <p class="note">Fuentes de matriz: ${Object.entries(MOD_SOURCES).map(([k, v]) => k + ' ' + v).join(' · ')}. Destinos: ${MOD_DESTS.map((v, i) => i + ' ' + v).join(' · ')}.</p>`;
}
// ===== DATOS =====
function viewData() {
  const R = S.reset ||= { templates: true, patterns: true, rules: true, device: true };
  const nv = lib.patches.filter((p) => p.kind === 'variant').length;
  const newLib = html`<div class="box resetbox"><h3>Empezar una biblioteca nueva</h3>
    <p class="note">Borra de este navegador los <b>${lib.patches.length - nv} patches</b>${nv ? html`, <b>${nv} variantes</b>` : ''}, ${lib.banks.length} pack(s), las colecciones manuales, las mediciones y el historial. <b>Los archivos de tu disco no se tocan</b>: podrás volver a importarlos cuando quieras.</p>
    <div class="row2" style="flex-wrap:wrap;gap:14px;margin:8px 0">${[['templates', 'Conservar plantillas de macros'], ['patterns', 'Conservar patrones y frases'], ['rules', 'Conservar reglas de clasificación aprendidas'], ['device', 'Conservar ajustes del equipo']].map(([k, l]) => html`<label class="note"><input type="checkbox" class="chk" data-act="resetOpt" data-k="${k}" ${R[k] ? 'checked' : ''}> ${l}</label>`)}</div>
    <div class="row2"><button class="btn" data-act="backup">Descargar copia antes</button><button class="btn danger" data-act="resetLib" ${lib.patches.length || lib.banks.length ? '' : 'disabled'}>Empezar de cero…</button></div></div>`;
  return html`<h2>Datos</h2>${newLib}
  <div class="grid2"><div class="box"><h3>Copia de seguridad <small>${(() => { const b = lib.backupStatus(); return b.last ? 'última: ' + b.last.slice(0, 16).replace('T', ' ') + (b.pending ? ' · hay cambios sin copiar' : ' · al día') : 'nunca'; })()}</small></h3><p class="note">JSON con archivos originales, fichas, variantes, mediciones, colecciones, packs, reglas, plantillas, frases e historial. La biblioteca vive solo en este navegador: si borras sus datos o cambias de ordenador, esta copia es lo que te queda.</p><div class="row2"><button class="btn primary" data-act="backup">Descargar copia</button><button class="btn" data-act="import">Restaurar / migrar v5…</button></div></div>
    <div class="box"><h3>Organizar en disco</h3><p class="note">Escribe tu colección ordenada en una carpeta que elijas (o en un ZIP): por categoría, arquitectura o carpeta de origen, con la versión vigente de cada patch y sus patrones .mid. Vista previa antes de escribir.</p><div class="row2"><button class="btn" data-act="goDisk">Ir a Ordenar en disco</button></div></div>
    <div class="box"><h3>Informes</h3><div class="row2"><button class="btn" data-act="csvAll">CSV · todo</button><button class="btn" data-act="csvFiltered">CSV · filtro</button><button class="btn" data-act="jsonReport">JSON · análisis</button></div><p class="note">CSV con «;» y BOM; celdas que empiezan por = + - @ neutralizadas.</p></div>
    <div class="box"><h3>ZIP</h3><div class="row2"><button class="btn" data-act="zipFiltered">.syx del filtro</button><button class="btn" data-act="zipOriginals">Archivos originales</button></div></div>
    <div class="box"><h3>Almacenamiento</h3><p class="note">${storeKind === 'indexeddb' ? 'IndexedDB de este navegador' : 'Memoria temporal'} · persistencia: ${S.persisted ? 'garantizada' : 'no solicitada'}.</p><div class="row2"><button class="btn small" data-act="persist">Solicitar persistencia</button></div></div></div>`;
}

// ---------- MIDI y audio ----------
async function connectMidi(silent = false) {
  if (!navigator.requestMIDIAccess) { if (!silent) toast('Este navegador no ofrece Web MIDI (usa Chrome o Edge)'); return; }
  try { S.dev.access = await navigator.requestMIDIAccess({ sysex: true }); } catch (e) { if (!silent) toast('Permiso MIDI denegado: ' + e.message); return; }
  const ports = findCircuitPorts(S.dev.access);
  if (!S.dev.outId || !S.dev.access.outputs.get(S.dev.outId)) S.dev.outId = ports.out?.id || '';
  if (!S.dev.inId || !S.dev.access.inputs.get(S.dev.inId)) S.dev.inId = ports.in?.id || '';
  S.dev.access.onstatechange = () => { openSession(); rerender(); };
  openSession(); await saveSettings(); rerender();
  if (!silent) toast(S.dev.session ? 'Conectado a ' + S.dev.session.name : 'No se encontró Circuit Tracks; elige la salida en Equipo');
}
function openSession() {
  S.dev.session?.dispose?.(); S.dev.session = null;
  const out = S.dev.access?.outputs.get(S.dev.outId), inp = S.dev.access?.inputs.get(S.dev.inId);
  if (!out) return;
  const s = new CircuitSession(out, inp || null, undefined, S.dev.channels);
  s.onMacro = (synth) => { if (S.view === 'device' && synth === S.dev.synth) { const box = $('#liveMacros'); if (box) box.innerHTML = s.macroPos[synth].map((v, i) => `<div class="btn" style="cursor:default">M${i + 1}<small>${v ?? '—'}</small></div>`).join(''); } };
  S.dev.session = s;
  clearInterval(S.clockTimer); S.clockTimer = setInterval(() => { const el = $('#clockBpm'); if (el) { const t = s.clockTempo(); el.textContent = t ? t + ' BPM' : 'no llega (activa Clock Tx en Setup View o pon el equipo en marcha)'; } }, 1000);
}
async function getStream() {
  if (S.dev.stream && S.dev.streamId === S.dev.audioId) return S.dev.stream;
  S.dev.stream?.getTracks().forEach((t) => t.stop());
  S.dev.stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: S.dev.audioId ? { exact: S.dev.audioId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
  S.dev.streamId = S.dev.audioId; return S.dev.stream;
}
const WORKLET = `class R extends AudioWorkletProcessor{process(i){const c=i[0]&&i[0][0];if(c)this.port.postMessage(c.slice(0));return true}}registerProcessor('ctpl-rec',R);`;
async function record(ms, during) {
  const stream = await getStream();
  if (!S.dev.ctx) { S.dev.ctx = new AudioContext({ latencyHint: 'interactive' }); await S.dev.ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))); }
  const ctx = S.dev.ctx; await ctx.resume();
  const src = ctx.createMediaStreamSource(stream), node = new AudioWorkletNode(ctx, 'ctpl-rec'), chunks = [];
  node.port.onmessage = (e) => { chunks.push(e.data); const lv = $('#lvl'); if (lv) { let m = 0; for (const v of e.data) m = Math.max(m, Math.abs(v)); lv.style.width = Math.min(100, m * 100) + '%'; } };
  src.connect(node); node.connect(ctx.destination);
  const t0 = performance.now(); during?.(t0);
  await new Promise((r) => setTimeout(r, ms));
  src.disconnect(); node.disconnect();
  const n = chunks.reduce((a, c) => a + c.length, 0), x = new Float32Array(n); let o = 0; for (const c of chunks) { x.set(c, o); o += c.length; }
  // Silenciar la salida del nodo grabador (conectado solo para que procese)
  return { x, sr: ctx.sampleRate, t0 };
}
async function measure(p) {
  const s = S.dev.session; if (!s || !S.dev.audioId) { toast('Conecta el equipo y elige una entrada de audio en Equipo'); return; }
  toast('Midiendo… (3 s)', 3000);
  s.stopAll(); const note = S.dev.measureNote;
  try {
    const { x, sr } = await record(3400, (t0) => { const t = s.sendPatch(p.payload, S.dev.synth); s.note(S.dev.synth, note, 100, Math.max(t + (S.dev.patchDelay ?? 80), t0 + 250), 1500); });
    const desc = analyzeRecording(x, sr, { noteOn: 0.25, noteOff: 1.75, playedNote: note });
    await lib.setAcoustic(p.id, desc, { note, tempo: S.dev.tempo, input: S.dev.audioId, synth: S.dev.synth });
    rerender(); toast(desc.silent ? 'No llegó señal: revisa la entrada de audio' : 'Medición guardada');
  } catch (e) { toast('Error al medir: ' + e.message, 6000); }
}

// ---------- importación ----------
async function readInputs(fileList) {
  const out = []; let ignored = 0, big = 0; const packed = [];
  for (const f of fileList) {
    const rel = f.webkitRelativePath || f._path || '', full = rel || f.name;
    if (/\.(rar|7z|tar|gz|tgz)$/i.test(f.name) && !/(^|\/)(__MACOSX|\._)/.test(full)) { packed.push(full); continue; }
    if (!/\.(syx|sysex|bin|zip|json|circuittrackspack|circuitpack)$/i.test(f.name) || /(^|\/)(__MACOSX|\._)/.test(full)) { ignored++; continue; }
    const path = rel ? rel.split('/').slice(0, -1).join('/') : '';
    // Archivos SysEx grandes (packs de samples, transferencias de Components): solo se leen 16 bytes para identificarlos.
    if (/\.(syx|sysex|bin|circuitpack)$/i.test(f.name) && f.size > 2 * 1024 * 1024) { big++; out.push({ name: f.name, path, bytes: new Uint8Array(await f.slice(0, 16).arrayBuffer()), size: f.size, headOnly: true }); continue; }
    if (f.size > 300 * 1024 * 1024) { toast('Demasiado grande: ' + f.name); continue; }
    out.push({ name: f.name, path, bytes: new Uint8Array(await f.arrayBuffer()), size: f.size });
  }
  if (ignored) toast(`${ignored} archivo(s) que no son de patches (audio, PDF, AppleDouble…) se han ignorado sin leerlos`);
  if (packed.length) toast(`${packed.length} archivo(s) comprimido(s) que la herramienta no abre (.rar / .7z): ${packed.slice(0, 3).join(' · ')}${packed.length > 3 ? ' …' : ''}. Descomprímelos e importa la carpeta.`, 12000);
  return out;
}
async function doImport(fileList) {
  const inputs = await readInputs(fileList), json = inputs.filter((x) => /\.json$/i.test(x.name)), rest = inputs.filter((x) => !/\.json$/i.test(x.name));
  for (const j of json) await restoreFrom(j.bytes, j.name);
  if (!rest.length) return;
  let rep;
  try { rep = await lib.importInputs(rest); } catch (e) { toast('No se pudo guardar la importación: ' + (/quota/i.test(e.message) ? 'el navegador no tiene más espacio. Libera espacio o exporta y vacía la biblioteca.' : e.message), 9000); await lib.load(); rerender(); return; }
  S.rowsKey = ''; buildQueue(); rerender();
  if (!S.persisted && navigator.storage?.persist) navigator.storage.persist().then((ok) => { S.persisted = ok; });
  await importReport(rep);
}
async function importReport(rep) {
  const G = rep.groups || { unknown: [], warnings: [], skipped: [], foreign: [] };
  const grp = (arr, cls) => html`<div class="rgroups">${arr.slice(0, 12).map((g) => html`<div class="${cls}"><b class="n">${g.count}</b><div>${g.why}<div class="ex">${g.examples.join(' · ')}${g.count > g.examples.length ? ' …' : ''}</div></div></div>`)}</div>`;
  const KN = { components: 'Samples / sesiones / packs de Components', mininova: 'Patches de MiniNova / UltraNova', controller: 'Plantillas de controlador', midiTemplate: 'Plantillas MIDI de Circuit Tracks' };
  await modal('Informe de importación', html`<div class="statgrid"><div class="stat g"><strong>${rep.patches}</strong><span>Patches nuevos</span></div><div class="stat"><strong>${rep.duplicatesPatch.length}</strong><span>Ya estaban (copias)</span></div><div class="stat"><strong>${rep.files}</strong><span>Archivos con patches</span></div>${rep.repaired ? html`<div class="stat"><strong>${rep.repaired}</strong><span>Recuperados</span></div>` : ''}</div>
    ${rep.repaired ? html`<p class="note" style="margin-top:10px"><span class="dot ok"></span><b>${rep.repaired} patches recuperados</b> de archivos escritos por otro editor (número de patch 0xFF y/o sin F7 final). Su carga de 340 bytes está intacta; al exportarlos se escribe una cabecera válida.</p>` : ''}
    ${rep.packs?.length ? html`<p class="note"><span class="dot ok"></span>${rep.packs.map((k) => `Pack «${k.pack}»: ${k.entries} posiciones leídas, ${k.patches} patches nuevos`).join(' · ')}. Los samples y proyectos del pack no se importan.</p>` : ''}
    ${G.foreign.length ? html`<p class="mlabel" style="margin-top:14px">No son patches de Circuit — se dejan fuera</p><div class="rgroups">${G.foreign.map((g) => html`<div><b class="n">${g.files}</b><div><b>${KN[g.kind] || g.kind}</b>${g.items > g.files ? html` <span class="note">(${g.items} elementos)</span>` : ''}<div class="note">${g.why}</div><div class="ex">${g.examples.join(' · ')}${g.files > g.examples.length ? ' …' : ''}</div>${g.names.length ? html`<details><summary class="note">Ver nombres (${g.names.length}${g.items > g.names.length ? ' de ' + g.items : ''})</summary><div class="ex">${g.names.join(' · ')}</div></details>` : ''}</div></div>`)}</div>` : ''}
    ${G.unknown.length ? html`<p class="mlabel" style="margin-top:14px">Sin patch reconocible</p>${grp(G.unknown, 'warn')}` : ''}
    ${G.warnings.length ? html`<p class="mlabel" style="margin-top:14px">Avisos</p>${grp(G.warnings, 'warn')}` : ''}
    ${G.skipped.length ? html`<p class="mlabel" style="margin-top:14px">Omitidos</p>${grp(G.skipped, '')}` : ''}
    ${rep.errors.length ? html`<p class="mlabel" style="margin-top:14px">Errores</p><ul class="note">${rep.errors.slice(0, 20).map((x) => html`<li>${x}</li>`)}</ul>` : ''}
    ${rep.duplicatesFile.length ? html`<p class="note" style="margin-top:10px">${rep.duplicatesFile.length} archivo(s) eran byte a byte iguales a otros ya leídos y no se han vuelto a guardar.</p>` : ''}
    <p class="note" style="margin-top:12px">Las clasificaciones quedan como <b>propuestas</b>. Siguientes pasos recomendados: <b>Organizar → Octava y tono</b> y <b>Duplicados</b>.</p>`);
}
async function restoreFrom(bytes, name) {
  let obj; try { obj = JSON.parse(new TextDecoder().decode(bytes)); } catch { toast(name + ': JSON no válido'); return; }
  const isV5 = obj?.format === 'ct-patch-library-v1';
  const mode = isV5 ? 'merge' : await modal('Restaurar copia', html`<p>${name}: ${obj?.patches?.length ?? 0} patches.</p><p class="note">«Combinar» añade lo que falte. «Reemplazar» borra la biblioteca actual.</p>`, [{ label: 'Cancelar', value: null }, { label: 'Reemplazar', value: 'replace', danger: true }, { label: 'Combinar', value: 'merge', primary: true }]);
  if (!mode) return;
  if (mode === 'replace' && !(await confirmBox('Reemplazar biblioteca', 'Se eliminará la biblioteca actual. ¿Tienes una copia?', 'Reemplazar', true))) return;
  try { const r = await lib.restore(obj, mode); S.templates = lib.settings.templates || S.templates; S.customPhrases = lib.settings.phrases || S.customPhrases; S.rowsKey = ''; S.bank = lib.banks[0]?.id; buildQueue(); rerender(); toast(`${r.migrated ? 'Migración v5' : 'Restauración'}: ${r.patches} patches, ${r.banks} packs${r.skipped ? ', ' + r.skipped + ' omitidos' : ''}`); } catch (e) { toast('Error al restaurar: ' + e.message, 6000); }
}

// ---------- acciones ----------
// v3.10: un sonido = una ficha. Lo que se ve, suena y se edita es siempre la versión vigente del sonido.
const faceOf = (p) => (p ? lib.currentVersion(lib.rootOf(p)) : null);
const cur = () => faceOf(S.view === 'audition' && S.queue[S.qi] ? lib.byId(S.queue[S.qi]) : S.sel && lib.byId(S.sel));
// Una operación sobre el sonido actual (macros, plantilla…): se suma a su versión; el original queda guardado.
async function variantFrom(p, payload, op, note) {
  if (p.payload.every((b, i) => b === payload[i])) { toast('La operación no cambia nada'); return null; }
  const v = await lib.editSound(p, payload, op, note); S.sel = v.id; S.rowsKey = ''; toast(`«${v.name}»: ${note}. El original sigue guardado (Versión → Volver al original).`, 4500); return v;
}
const listOf = (ids) => ids.map((id) => lib.byId(id)).filter(Boolean);
const A = {
  view: (el) => { S.view = el.dataset.v; if (S.view === 'library') S.q.collection = ''; if (S.view === 'audition') buildQueue(); rerender(); },
  collection: (el) => { S.view = 'library'; S.q.collection = S.q.collection === el.dataset.id ? '' : el.dataset.id; rerender(); },
  newCollection: async () => {
    const r = await modal('Nueva colección', html`<label class="lab">Nombre<input class="field" id="cName"></label><p class="note">«Inteligente» guarda el filtro actual; «Manual» guarda la selección.</p>`, [{ label: 'Cancelar', value: null }, { label: 'Manual', value: (m) => ({ kind: 'manual', name: $('#cName', m).value }) }, { label: 'Inteligente', primary: true, value: (m) => ({ kind: 'smart', name: $('#cName', m).value }) }]);
    if (!r?.name) return; const q = { ...S.q }; delete q.collection;
    await lib.saveCollection({ name: r.name, kind: r.kind, query: r.kind === 'smart' ? q : null, ids: r.kind === 'manual' ? [...S.multi] : [] }); rerender();
  },
  dockToggle: () => { if (S.view === 'library') { S.mobileOpen = true; rerender(); return; } S.dock = !S.dock; rerender(); },
  dockLib: () => { const p = cur(); if (!p) return; S.sel = p.id; S.view = 'library'; S.mobileOpen = true; rerender(); },
  goEdit: (el) => { const p = cur(); if (!p) return; S.sel = p.id; S.view = 'library'; S.ctab = el.dataset.t; S.mobileOpen = true; rerender(); },
  palOpen: (el, e) => { e?.preventDefault?.(); openPalette(); },
  pick: (el, e) => { e.preventDefault(); if (e.target.closest('[data-act="check"],[data-act="fav"],[data-act="openFam"]')) return; if (e.shiftKey || e.metaKey || e.ctrlKey || S.selMode) { const id = el.dataset.id; S.multi.has(id) ? S.multi.delete(id) : S.multi.add(id); rerender(); return; } S.sel = el.dataset.id; S.cmpB = ''; if (S.view !== 'library') { if (S.view === 'audition') S.view = 'library'; else { S.dock = true; S.editParams = false; rerender(); return; } } S.editParams = false; S.mobileOpen = true; S.knob = 0; S.block = null; rerender(); },
  pickMacros: (el, e) => { e.preventDefault(); S.sel = el.dataset.id; S.view = 'library'; S.ctab = 'macros'; S.mobileOpen = true; rerender(); },
  openSel: () => { const id = S.view === 'audition' ? S.queue[S.qi] : S.sel; if (!id) return; S.sel = id; S.view = 'library'; S.mobileOpen = true; rerender(); },
  closeDetail: () => { S.mobileOpen = false; rerender(); },
  openFam: (el, e) => { e.stopPropagation(); const id = el.dataset.id; S.openFam.has(id) ? S.openFam.delete(id) : S.openFam.add(id); rerenderList(); },
  toggleFamilies: () => { S.families = !S.families; rerender(); },
  check: (el, e) => { e.stopPropagation(); el.checked ? S.multi.add(el.dataset.id) : S.multi.delete(el.dataset.id); rerenderList(); },
  selAll: (el) => { if (el.checked) filteredPatches().forEach((p) => S.multi.add(p.id)); else S.multi.clear(); rerenderList(); },
  clearSel: () => { S.multi.clear(); rerenderList(); },
  fav: async (el, e) => { e.stopPropagation(); const p = lib.byId(el.dataset.id); await lib.updateMeta([p.id], { fav: !p.meta.fav }, p.meta.fav ? 'Quitado de favoritos' : 'Favorito'); rerender(); },
  rate: async (el) => { const p = cur(); if (!p) return; const n = +el.dataset.n; await lib.updateMeta([p.id], { rating: p.meta.rating === n ? 0 : n }, 'Puntuación ' + n); rerender(); },
  sort: (el) => { const k = el.dataset.k; S.sort = { by: k, dir: S.sort.by === k ? -S.sort.dir : 1 }; rerender(); },
  toggleFav: () => { S.q.fav = !S.q.fav; rerender(); },
  toggleQ: (el) => { S.q[el.dataset.k] = !S.q[el.dataset.k]; rerender(); },
  clearFilters: () => { S.q = blankQ(); rerender(); },
  ask: (el) => { S.q = { ...blankQ(), ...JSON.parse(el.dataset.q) }; S.view = 'library'; rerender(); },
  tab: (el) => { S.tab = el.dataset.t; rerender(); },
  envTab: (el) => { S.envTab = +el.dataset.i; rerender(); },
  lfoTab: (el) => { S.lfoTab = +el.dataset.i; rerender(); },
  knob: (el) => { if (S.suppressClick) return; S.knob = +el.dataset.i; rerender(); },
  mOpen: (el) => { const key = cur().id + ':' + el.dataset.v; S.mOpen = S.mOpen === key ? null : key; rerender(); },
  mSavePos: async () => { const p0 = cur(), k = S.knob, v = mTest(p0, k); const p = await ensureVariant(p0); if (!p) return; await lib.editVariantBytes(p.id, [[204 + k * 17, v]], `Macro ${k + 1}: posición inicial ${v}`); delete S.mtest?.[p0.id]?.[k]; toast(`Guardado en «${p.name}» (${lib.changeState(p) === 'adopted' ? 'variante aceptada' : 'variante en borrador'}): al cargar el patch, la macro ${k + 1} empezará en ${v}`, 5000); rerender(); },
  mResetPos: () => { const p = cur(); delete S.mtest?.[p.id]?.[S.knob]; if (S.dev.session) S.dev.session.cc(S.dev.synth, 80 + S.knob, p.payload[204 + S.knob * 17]); rerender(); },
  anatKnob: (el) => { const i = +el.dataset.i; if (S.knob === i && S.view === 'library') { S.ctab = 'macros'; } S.knob = i; rerender(); },
  editParams: () => { S.editParams = !S.editParams; rerender(); },
  // Empezar a editar un original: se crea su versión (el original se guarda) y se abre el editor
  editStart: async () => { const p = cur(); if (!p) return; await ensureVariant(p); S.editParams = true; S.tab = 'synth'; rerender(); },
  import: () => $('#fileIn').click(),
  importDir: () => $('#dirIn').click(),
  duplicate: async () => { const p = cur(); if (!p) return; const c = await lib.duplicateSound(p); S.sel = c.id; S.rowsKey = ''; toast(`«${c.name}»: sonido nuevo, independiente de «${p.name}». Edítalo sin miedo.`, 4500); rerender(); },
  exportSyx: () => { const p = cur(); if (p) download(safeFile(p.name) + '.syx', lib.exportSyx(p)); },
  exportOriginal: () => { const p = cur(), b = lib.originalFileBytes(p); if (b) download(p.fileName || safeFile(p.name) + '.syx', b); },
  backup: async () => { lib.settings.templates = S.templates; lib.settings.phrases = S.customPhrases; await lib.markBackup(); setTimeout(rerender, 50); download(`CircuitTracks_Biblioteca_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(lib.backupObject()), 'application/json'); toast('Copia descargada'); },
  accept: async () => { const p = cur(); if (!p) return; await lib.acceptClassification([p.id]); rerender(); },
  reject: async () => { await lib.rejectClassification([S.sel]); rerender(); },
  exception: async () => { const p = cur(), cat = p.meta.category || lib.info(p).cls.category; if (!cat) return toast('Fija primero una categoría'); await lib.addRule({ type: 'patch', pattern: p.fp.payload, category: cat, subtype: p.meta.subtype || null }); toast('Excepción registrada'); rerender(); },
  nvcatRule: async () => { const c = $('#nvcatCat').value; if (!c) return; await lib.addRule({ type: 'nvcat', pattern: String(cur().payload[16]), category: c }); toast('Regla guardada'); rerender(); },
  bulkAccept: async () => { const h = await lib.acceptClassification([...S.multi]); toast(h ? h.text : 'Nada que aceptar'); rerender(); },
  bulkDelete: async () => { if (S.multi.size > 50 && !(await confirmBox('Eliminar', `¿Llevar ${S.multi.size} patches a la papelera? Se pueden recuperar desde Organizar → Papelera.`, 'Eliminar', true))) return; await trashIds([...S.multi]); },
  bulkZip: () => zipOf(listOf([...S.multi]), 'seleccion'),
  deleteOne: () => trashIds([cur().id]),
  audDelete: () => { const p = cur(); if (p) trashIds([p.id]); },
  audTag: async (el) => { const p = lib.byId(S.queue[S.qi]); if (!p) return; const on = (p.meta.tags || []).includes(el.dataset.t); await lib.addTags([p.id], [el.dataset.t], on); rerender(); },
  undoLast: () => undoLast(),
  keysHelp: () => showKeys(),
  trashRestore: async (el) => { const h = lib.history.find((x) => x.id === el.dataset.h); if (!h) return; await lib.undo(h.id); toast(`Recuperado${h.before ? '' : ''}: ${h.ids.length} patch(es)`); rerender(); },
  trashPurge: async (el) => { if (!(await confirmBox('Eliminar definitivamente', 'Estos patches dejan de poder recuperarse. Tus archivos del disco no se tocan.', 'Eliminar', true))) return; await lib.emptyTrash([el.dataset.h]); rerender(); },
  trashEmpty: async () => { const n = lib.trashCount(); if (!(await confirmBox('Vaciar la papelera', `${n} patch(es) dejan de poder recuperarse. Tus archivos del disco no se tocan.`, 'Vaciar', true))) return; await lib.emptyTrash(); toast('Papelera vacía'); rerender(); },
  undo: async (el) => { try { await lib.undo(el.dataset.id); S.rowsKey = ''; toast('Deshecho'); } catch (e) { toast(e.message); } if (!lib.byId(S.sel)) S.sel = null; rerender(); },
  cmpSet: (el, e) => { e.preventDefault(); S.cmpB = el.dataset.id; rerender(); },
  abListen: (el) => { const p = el.dataset.w === 'a' ? cur() : lib.byId(S.cmpB); audPlay(p); },
  applyProfile: async (el) => {
    const p = cur(), m = el.dataset.m, title = PROFILES[S.profile].title;
    if (m === 'rebuild' && !(await confirmBox('Reconstruir macros', 'Se quitarán todas las rutas de macro y se pondrá una por macro según el perfil, en su versión. El original se guarda.', 'Reconstruir'))) return;
    const pl = m === 'reorder' ? reorderToProfile(p.payload, S.profile).payload : m === 'fill' ? fillEmptyFromProfile(p.payload, S.profile).payload : rebuildFromProfile(p.payload, S.profile);
    await variantFrom(p, pl, 'macro-' + m, `Macros ${{ reorder: 'reordenadas', fill: 'vacías rellenas', rebuild: 'reconstruidas' }[m]} · ${title}`); rerender();
  },
  bulkProfile: async (el) => {
    const m = el.dataset.m; let n = 0;
    for (const p of listOf([...S.multi])) { const pl = m === 'reorder' ? reorderToProfile(p.payload, S.profile).payload : fillEmptyFromProfile(p.payload, S.profile).payload; if (p.payload.some((b, i) => b !== pl[i])) { await lib.createVariant(p.id, pl, 'macro-' + m, `Macros ${m === 'reorder' ? 'reordenadas' : 'rellenas'} · ${PROFILES[S.profile].title}`, ''); n++; } }
    rerender(); if (n) await afterChanges(n, false, `Macros ${m === 'reorder' ? 'reordenadas' : 'rellenadas'} según el perfil «${PROFILES[S.profile].title}».`); else toast('Ningún patch necesitaba cambios');
  },
  knobMove: async (el) => { const p0 = cur(), d = +el.dataset.d, k = el.dataset.k !== undefined ? +el.dataset.k : S.knob; const p = await ensureVariant(p0); if (!p) return; await lib.editVariantBytes(p.id, [...swapKnobs(p.payload, k, k + d)].map((v, i) => [i, v]).filter(([i]) => i >= 204)); S.knob = k + d; if (S.live) liveSend(); rerender(); },
  addToBank: async () => {
    const ids = S.multi.size ? [...S.multi] : [S.sel], b = lib.banks.find((x) => x.id === S.bank) || lib.banks[0]; let n = 0;
    for (const id of ids) { if (b.slots.includes(id)) continue; const i = b.slots.indexOf(null); if (i < 0) break; b.slots[i] = id; n++; }
    await lib.saveBank(b); toast(`${n} añadido(s) a «${b.name}»`); rerender();
  },
  bankPage: (el) => { S.page = +el.dataset.i; S.slotSel = -1; rerender(); },
  bankNew: async () => { S.bank = (await lib.createBank('Pack ' + (lib.banks.length + 1))).id; rerender(); },
  bankDup: async () => { const src = lib.banks.find((x) => x.id === S.bank), b = await lib.createBank(src.name + ' (copia)'); b.slots = [...src.slots]; b.blocks = structuredClone(src.blocks); await lib.saveBank(b); S.bank = b.id; rerender(); },
  bankRename: async () => { const b = lib.banks.find((x) => x.id === S.bank), n = await modal('Renombrar pack', html`<input class="field" id="bn" value="${b.name}">`, [{ label: 'Cancelar', value: null }, { label: 'Guardar', primary: true, value: (m) => $('#bn', m).value }]); if (n) { b.name = n; await lib.saveBank(b); rerender(); } },
  bankDel: async () => { if (lib.banks.length < 2) return toast('Debe quedar al menos un pack'); if (!(await confirmBox('Eliminar pack', 'Solo se elimina el mapa.', 'Eliminar', true))) return; await lib.deleteBank(S.bank); S.bank = lib.banks[0].id; rerender(); },
  bankBlock: async () => {
    const b = lib.banks.find((x) => x.id === S.bank);
    const r = await modal('Reservar bloque', html`<div class="grid3"><label class="lab">Desde<input class="field" id="bf" type="number" min="1" max="128" value="1"></label><label class="lab">Hasta<input class="field" id="bt" type="number" min="1" max="128" value="16"></label><label class="lab">Categoría<select class="field" id="bc"><option value="">—</option>${CATEGORIES.map((c) => html`<option value="${c.id}">${c.label}</option>`)}</select></label></div><label class="lab">Etiqueta<input class="field" id="bl" value="Bass"></label>`, [{ label: 'Cancelar', value: null }, { label: 'Borrar bloques', danger: true, value: 'clear' }, { label: 'Guardar', primary: true, value: (m) => ({ from: +$('#bf', m).value - 1, to: +$('#bt', m).value - 1, category: $('#bc', m).value || null, label: $('#bl', m).value || 'Bloque' }) }]);
    if (r === 'clear') b.blocks = []; else if (r && r.from >= 0 && r.to <= 127 && r.from <= r.to) b.blocks = [...b.blocks.filter((k) => k.to < r.from || k.from > r.to), r]; else return;
    await lib.saveBank(b); rerender();
  },
  bankExport: () => { const b = lib.banks.find((x) => x.id === S.bank); download(safeFile(b.name) + '_128.zip', lib.bankExport(b), 'application/zip'); },
  bankPickPatch: (el) => { S.sel = el.dataset.id; rerender(); },
  slot: async (el) => { const i = +el.dataset.slot, b = lib.banks.find((x) => x.id === S.bank); if (S.sel && !b.slots[i]) { const old = b.slots.indexOf(S.sel); if (old >= 0) b.slots[old] = null; b.slots[i] = S.sel; await lib.saveBank(b); } S.slotSel = i; rerender(); },
  slotClear: async () => { const b = lib.banks.find((x) => x.id === S.bank); b.slots[S.slotSel] = null; await lib.saveBank(b); rerender(); },
  slotOpen: () => { const b = lib.banks.find((x) => x.id === S.bank); S.sel = b.slots[S.slotSel]; S.view = 'library'; S.mobileOpen = true; rerender(); },
  slotListen: () => { const b = lib.banks.find((x) => x.id === S.bank); audPlay(lib.byId(b.slots[S.slotSel])); },
  ruleToggle: async (el) => { await lib.toggleRule(el.dataset.id, el.checked); rerender(); },
  ruleDel: async (el) => { await lib.deleteRule(el.dataset.id); rerender(); },
  ruleAdd: async () => { const pat = $('#rPat').value.trim(); if (pat) { await lib.addRule({ type: $('#rType').value, pattern: pat, category: $('#rCat').value }); rerender(); } },
  csvAll: () => download('circuit_tracks_biblioteca.csv', lib.csvReport(), 'text/csv;charset=utf-8'),
  csvFiltered: () => download('circuit_tracks_filtro.csv', lib.csvReport(filteredPatches().map((p) => p.id)), 'text/csv;charset=utf-8'),
  jsonReport: () => download('circuit_tracks_analisis.json', JSON.stringify(lib.faces().map((p) => { const i = lib.info(p); return { id: p.id, name: p.name, file: p.fileName, folder: p.folderPath, kind: p.kind, parentId: p.parentId, family: lib.families().of.get(p.id)?.id || null, userMeta: p.meta, proposal: { category: i.cls.category, subtype: i.cls.subtype, candidates: i.cls.candidates, certainty: i.cls.certainty, scores: i.cls.scores, evidence: i.cls.evidence, contradictions: i.cls.contradictions, descriptors: i.cls.descriptors, usage: i.cls.usage }, features: i.an.features, acoustic: p.acoustic || null, integrity: i.integrity, macros: i.macros.knobs.map((k) => ({ knob: k.index + 1, position: k.position, active: k.activeCount, routes: k.slots.map((s) => ({ dest: s.dest, label: s.info.label, start: s.start, end: s.end, depth: s.depthSigned, state: s.state })) })), fingerprints: p.fp }; }), null, 1), 'application/json'),
  zipFiltered: () => zipOf(filteredPatches(), 'filtro'),
  zipOriginals: () => { const seen = new Set(), files = []; for (const p of filteredPatches()) { const f = lib.fileOf(p); if (!f || seen.has(f.id)) continue; seen.add(f.id); files.push({ path: (f.path ? f.path + '/' : '') + f.name, bytes: f.bytes }); } download('originales.zip', writeZip(files), 'application/zip'); },
  toDisk: async (el) => {
    if (!window.showDirectoryPicker) return toast('Tu navegador no permite escribir carpetas (usa Chrome o Edge)');
    let dir; try { dir = await window.showDirectoryPicker({ mode: 'readwrite' }); } catch { return; }
    dir = await dir.getDirectoryHandle('Circuit Tracks export ' + new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', 'h'), { create: true });
    const n = await lib.exportToDirectory(dir, filteredPatches(), el.dataset.l); toast(`${n} archivos escritos en «${dir.name}»`);
  },
  persist: async () => { S.persisted = await navigator.storage?.persist?.(); toast(S.persisted ? 'Persistencia concedida' : 'El navegador no la ha concedido'); rerender(); },
  resetOpt: (el) => { S.reset[el.dataset.k] = el.checked; },
  resetLib: async () => {
    const R = S.reset, b = lib.backupStatus();
    const ok = await modal('Empezar una biblioteca nueva', html`<p>Se borrarán <b>${lib.patches.length} patches y variantes</b>, packs, colecciones manuales, mediciones e historial de este navegador.</p>
      <p>Se conservan: ${[R.templates && 'plantillas', R.patterns && 'patrones y frases', R.rules && 'reglas aprendidas', R.device && 'ajustes del equipo', 'colecciones inteligentes'].filter(Boolean).join(', ')}.</p>
      ${b.pending || !b.last ? html`<p style="color:var(--warn)">⚠ ${b.last ? 'Hay cambios sin copia de seguridad.' : 'No has hecho ninguna copia de seguridad.'} Si quieres poder recuperar esta biblioteca, cancela y pulsa «Descargar copia antes».</p>` : ''}
      <p class="note">Tus archivos del disco no se tocan. Para confirmar, escribe <b>BORRAR</b>:</p><input class="field" id="rsConfirm" autocomplete="off" style="width:100%">`,
      [{ label: 'Cancelar', value: null }, { label: 'Borrar y empezar', danger: true, value: (m) => ($('#rsConfirm', m).value.trim().toUpperCase() === 'BORRAR' ? 'yes' : 'no') }]);
    if (ok === 'no') { toast('No se ha borrado nada: hay que escribir BORRAR para confirmar'); return; }
    if (ok !== 'yes') return;
    patStopNow?.();
    const before = await lib.resetLibrary(R);
    Object.assign(S, { sel: null, multi: new Set(), queue: [], qi: 0, mtest: {}, rowsKey: '', openFam: new Set(), bank: null, chgOrigin: '', pat: null, patId: null, patPrev: null, view: 'library' });
    S.templates = lib.settings.templates || []; S.customPhrases = lib.settings.phrases || {};
    buildQueue(); rerender();
    toast(`Biblioteca nueva: se han borrado ${before.patches} patches. Importa tus archivos para empezar.`, 6000);
  },
  wipe: async () => { if (!(await confirmBox('Vaciar biblioteca', 'Se borrará todo lo guardado en este navegador. Descarga antes una copia.', 'Vaciar', true))) return; await lib.restore({ format: 'ctpl-backup', files: [], patches: [] }, 'replace'); S.sel = null; S.bank = lib.banks[0]?.id; buildQueue(); rerender(); },
  // --- escucha ---
  midiConnect: () => connectMidi(false),
  listenSel: () => { const p = cur(); if (!S.dev.session) { toast('Conecta el equipo en «Equipo»'); return; } audPlay(p); },
  audPlay: () => audPlay(),
  audStop: () => { S.dev.session?.stopAll(); S.playing = false; $('[data-act="audPlay"]')?.classList.remove('on'); },
  sweep: (el) => { const p = S.view === 'audition' ? lib.byId(S.queue[S.qi]) : cur(), s = S.dev.session; if (!s || !p) return; s.stopAll(); const k = +el.dataset.k; const t = s.sendPatch(p.payload, S.dev.synth); s.macroSweep(S.dev.synth, k, { note: (lib.info(p).cls.category === 'bass' ? 36 : 48) + S.dev.root, restore: p.payload[204 + 17 * k], start: t + (S.dev.patchDelay ?? 80) }); toast(`Barrido M${k + 1}`, 1500); },
  qsrc: () => {}, phrase: () => {},
  qgo: (el) => { S.qi = +el.dataset.i; rerender(); if (S.autoPlay) audPlay(); },
  qstep: (el) => { S.qi = Math.max(0, Math.min(S.queue.length - 1, S.qi + +el.dataset.d)); rerender(); if (S.autoPlay) audPlay(); },
  // Tecla de categoría: decide y pasa al siguiente. Conserva la subcarpeta si ya era de esa categoría (tuya o propuesta).
  audCat: (el) => audDecide((p) => { const c = el.dataset.c, cls = lib.info(p).cls, sub = p.meta.category === c ? p.meta.subtype : cls.category === c ? cls.subtype : null; return lib.setCategory([p.id], c, sub || null).then(() => lib.updateMeta([p.id], { review: 'listened' }, 'Escuchado')); }),
  // Intro: si ya tiene tu carpeta, la confirma; si no, acepta la propuesta. Y al siguiente.
  audAccept: () => audDecide(async (p) => { if (!p.meta.category) await lib.acceptClassification([p.id]); await lib.updateMeta([p.id], { review: 'listened' }, 'Escuchado'); }),
  // Carpeta del patch que suena, sin pasar al siguiente (para corregir la propuesta con calma)
  audSub: async (el) => { const p = cur(); if (!p) return; const c = el.dataset.c, sb = el.dataset.s || null; const on = p.meta.category === c && p.meta.subtype === sb && sb; await lib.setSubfolder([p.id], c, on ? null : sb); rerender(); },
  audReview: (el) => audDecide((p) => lib.updateMeta([p.id], { review: el.dataset.r }, REVIEW[el.dataset.r])),
  audFav: async () => { const p = cur(); if (!p) return; await lib.updateMeta([p.id], { fav: !p.meta.fav }, 'Favorito'); rerender(); },
  measureSel: () => { const p = S.view === 'audition' ? lib.byId(S.queue[S.qi]) : cur(); if (p) measure(p); },
  clearMeasure: async () => { await lib.clearAcoustic(S.sel); rerender(); },
  queueSel: () => { S.qsrc = 'selection'; buildQueue('selection'); S.qi = 0; S.view = 'audition'; rerender(); },
  queueOne: () => { S.multi = new Set([S.sel]); A.queueSel(); },
  queueAffinity: () => { S.multi = new Set(lib.affinityRanking(30).map((r) => r.id)); A.queueSel(); },
  mapNear: () => { const p = cur(); S.multi = new Set([p.id, ...nearest(p.payload, lib.faces().filter((x) => x.id !== p.id).map((x) => ({ id: x.id, payload: x.payload })), 12).map((n) => n.id)]); A.queueSel(); },
  mapColor: (el) => { S.mapColor = el.dataset.k; rerender(); },
  mapToggle: (el) => { const c = el.dataset.c; S.mapHidden.has(c) ? S.mapHidden.delete(c) : S.mapHidden.add(c); rerender(); },
  // --- rediseño ---
  toggleSelMode: () => { S.selMode = !S.selMode; if (!S.selMode) S.multi.clear(); rerender(); },
  mclear: async (el) => { const p = await ensureVariant(cur()); const pl = setSlot(p.payload, +el.dataset.k, +el.dataset.s, { dest: 0, start: 0, end: 127, depth: 64 }); await lib.editVariantBytes(p.id, [...pl].map((v, i) => [i, v]).filter(([i]) => i >= 204)); if (S.live) liveSend(); rerender(); },
  ctab: (el) => { S.ctab = el.dataset.t; rerender(); },
  block: (el) => { S.block = S.block === el.dataset.b ? null : el.dataset.b; rerender(); },
  qset: (el) => { const k = el.dataset.k, v = el.dataset.v; S.q[k] = S.q[k] === v ? '' : v; rerender(); },
  toggleEvidence: () => { S.showEv = !S.showEv; rerender(); },
  orgTab: (el) => { S.orgTab = el.dataset.t; rerender(); },
  reanRun: async () => { S.reanBusy = '0 %'; rerender(); S.rean = await lib.reanalyze({ progress: (i, n) => { S.reanBusy = Math.round((i / n) * 100) + ' %'; const b = $('[data-act="reanRun"]'); if (b) b.textContent = 'Analizando… ' + S.reanBusy; } }); S.reanBusy = null; S.rowsKey = ''; rerender(); },
  reanTab: (el) => { S.reanTab = el.dataset.t; rerender(); },
  reanApply: async () => {
    const r = S.rean, o = S.reanOpt; if (!r) return;
    const n = (o.cat ? r.cat.length : 0) + (o.nn ? r.nn.length : 0) + (o.sub ? r.sub.length : 0) + r.tags.filter((x) => (o.fx && x.fx.length) || (o.ch && x.ch.length) || (o.nm && x.nm.length)).length;
    if (!n) return toast('No hay nada marcado que aplicar');
    if (!(await confirmBox('Aplicar el reanálisis', `Se aplican ${n} cambios a tu biblioteca. Las contradicciones no se tocan. Se puede deshacer en Historial.`, 'Aplicar'))) return;
    const done = await lib.applyReanalysis(r, o); toast('Aplicado: ' + done.join(' · '));
    S.rean = await lib.reanalyze(); S.rowsKey = ''; rerender();
  },
  reanListen: () => { const ids = [...S.rean.weak, ...S.rean.none].map((x) => x.id); S.q = { ...blankQ(), ids }; S.multi = new Set(ids); A.queueSel(); },
  reanShow: (el) => { const ids = S.rean[el.dataset.t].map((x) => x.id); S.q = { ...blankQ(), ids }; S.view = 'library'; rerender(); },
  nnUse: async (el) => { const p = cur(); if (!p) return; await lib.setCategory([p.id], el.dataset.c, el.dataset.s || null); rerender(); },
  fCat: (el) => { S.fCat = el.dataset.c; rerender(); },
  fMove: async (el) => { await lib.moveSubfolder(el.dataset.c, el.dataset.s, +el.dataset.d); rerender(); },
  fDel: async (el) => { const c = el.dataset.c, sb = el.dataset.s, n = lib.faces().filter((p) => p.meta.category === c && p.meta.subtype === sb).length; if (n && !(await confirmBox('Quitar subcarpeta', `${n} patch(es) tienen «${lib.subLabel(c, sb)}». Se quedan en ${CAT_LABEL[c]} sin subcarpeta (se puede deshacer en el historial).`))) return; await lib.removeSubfolder(c, sb); rerender(); },
  fReset: async (el) => { await lib.resetTax(el.dataset.c); rerender(); },
  fAccept: async (el) => { const ids = folderStats()[el.dataset.c]?.pending || []; await acceptSubs(ids); },
  fAcceptAll: async () => { const ids = Object.values(folderStats()).flatMap((x) => x.pending); await acceptSubs(ids); },
  orgOpen: (el, e) => { if (e.target.closest('button')) return; const k = el.dataset.k; S.openGroups.has(k) ? S.openGroups.delete(k) : S.openGroups.add(k); rerender(); },
  orgQueue: (el) => { const g = architectureGroups(lib.faces(), S.archLevel).find((x) => x.key === el.dataset.k); if (!g) return; S.multi = new Set(g.ids); S.qsrc = 'selection'; buildQueue('selection'); S.qi = 0; S.view = 'audition'; rerender(); },
  pickListen: (el) => { audPlay(lib.byId(el.dataset.id)); },
  regListen: (el) => audPlay(lib.byId(el.dataset.id)),
  regTry: (el) => { const p = lib.byId(el.dataset.id), x = regReport().items.find((i) => i.id === p.id); if (!x) return; const t = regFixPayload(p, x); audPlay(p, t.payload); },
  regFix: async (el) => { const p = lib.byId(el.dataset.id), x = regReport().items.find((i) => i.id === p.id); if (!x) return; const t = regFixPayload(p, x); if (t.problems.length) toast(t.problems[0], 5000); const v = await lib.createVariant(p.id, t.payload, 'register', `Altura ${fmtSemis(regShift(x))} st (a ${describePitch(regReport().goal)})`, ''); if ((S.regAdopt || 'smart') === 'all' || ((S.regAdopt || 'smart') === 'smart' && x.confidence === 'clara' && !t.problems.length)) { await lib.adoptVariants([v.id], true); toast(`Corregido: «${p.name}» suena y se exporta así`, 5000); } else toast('Queda como propuesta: aplícala en su ficha o en Cambios', 5000); rerender(); },
  regView: (el) => { S.regView = el.dataset.v; S.revI = 0; rerender(); if (S.regView === 'review') revAutoPlay(); },
  regOpen: (el) => { S.regCat = el.dataset.g; S.regView = 'detail'; rerender(); },
  regBySub: (el) => { S.regBySub = el.dataset.v === '1'; rerender(); },
  regFixGroup: async (el) => { const k = el.dataset.g, r = await regFixGroups([k]); if (r) await afterChanges(r.created, r.adopted, `Has corregido ${r.created} patches de ${regLabel(k)}.`); },
  regFixPlan: async () => {
    const ks = regGroups().map((g) => g.k).filter((k) => regPlanOf(k).target !== 'skip');
    const n = ks.reduce((a, k) => a + regFixList(k).length, 0); if (!n) return;
    if (!(await confirmBox('Corregir todo el plan', `Se corregirán ${n} patches en ${ks.filter((k) => regFixList(k).length).length} grupos, cada uno al objetivo de su grupo. ${{ smart: 'Las claras se suman a la versión de cada sonido; las dudosas quedan como propuesta para la revisión rápida.', all: 'Todas se suman a la versión de cada sonido.', none: 'Todas quedan como propuesta.' }[S.regAdopt || 'smart']} Los originales se guardan.`, 'Corregir'))) return;
    const r = await regFixGroups(ks, true); if (r) await afterChanges(r.created, r.adopted, `Has corregido ${r.created} patches en ${r.groups} grupos.${r.created > r.adopted ? ` ${r.created - r.adopted} dudosas esperan en la revisión rápida.` : ''}`);
  },
  regKeep: async (el) => { await lib.updateMeta([el.dataset.id], { regKeep: true }, 'Octava: está bien como está'); rerender(); },
  regUnkeep: async (el) => { const ids = lib.faces().filter((p) => p.meta.regKeep && regKeyOf(p) === el.dataset.g).map((p) => p.id); if (ids.length) await lib.updateMeta(ids, { regKeep: false }, 'Octava: volver a analizar'); rerender(); },
  regTuneChk: (el) => { S.regTune = el.checked; rerender(); },
  revPlay: (el) => { const q = regQueue(), v = q[Math.min(S.revI || 0, q.length - 1)]; if (!v) return; if (el.dataset.w === 'o') audPlay(faceOf(v)); else playTest(faceOf(v), proposalApplied(v)); },
  revOk: async () => { const v = regQueue()[Math.min(S.revI || 0, regQueue().length - 1)]; if (!v) return; await lib.adoptVariants([v.id], true); rerender(); revAutoPlay(); },
  revDrop: async () => { const v = regQueue()[Math.min(S.revI || 0, regQueue().length - 1)]; if (!v) return; await lib.deletePatches([v.id]); S.rowsKey = ''; rerender(); revAutoPlay(); },
  revKeep: async () => { const v = regQueue()[Math.min(S.revI || 0, regQueue().length - 1)]; if (!v) return; await lib.updateMeta([lib.rootOf(v).id], { regKeep: true }, 'Octava: está bien como está'); await lib.deletePatches([v.id], true); S.rowsKey = ''; rerender(); revAutoPlay(); },
  revStep: (d) => { const n = regQueue().length; S.revI = Math.max(0, Math.min(n - 1, (S.revI || 0) + d)); rerender(); revAutoPlay(); },
  regFixAll: async () => {
    const rep = regReport(), drafts = regDraftParents(), list = rep.off.filter((x) => regShift(x) !== 0 && !drafts.has(x.id));
    if (!(await confirmBox('Corregir octava y tono', `Se llevarán ${list.length} patches a ${describePitch(rep.goal)} (${regModeOf(S.regCat) === 'octave' ? 'solo octavas' : 'octava y tono'}; ${regMethod() === 'osc' ? 'semitonos de los osciladores' : 'octava de teclado + osciladores'}). Los originales se guardan. ${{ smart: 'Los de confianza clara se suman a la versión de cada sonido; los dudosos quedan como propuesta.', all: 'Todos se suman a la versión de cada sonido: se exportarán así.', none: 'Todos quedan como propuesta hasta que los apliques en Cambios.' }[S.regAdopt || 'smart']}`, 'Corregir'))) return;
    const mode = S.regAdopt || 'smart', adopt = []; let probs = 0;
    for (const x of list) { const p = lib.byId(x.id), t = regFixPayload(p, x); probs += t.problems.length ? 1 : 0; const v = await lib.createVariant(p.id, t.payload, 'register', `Altura ${fmtSemis(regShift(x))} st (a ${describePitch(rep.goal)})`, ''); if (mode === 'all' || (mode === 'smart' && x.confidence === 'clara' && !t.problems.length)) adopt.push(v.id); }
    if (adopt.length) await lib.adoptVariants(adopt, true);
    rerender();
    await afterChanges(list.length, adopt.length, `Has llevado ${list.length} patches de ${regLabel(S.regCat)} a ${describePitch(rep.goal)}.${adopt.length && adopt.length < list.length ? ` Las de confianza dudosa${probs ? ' o con valores recortados' : ''} quedan en borrador para que las escuches antes.` : ''}`);
  },
  patSeed: () => { S.patOpts.seed = 1 + Math.floor(Math.random() * 99998); patRegen(); rerender(); },
  patUndo: () => { if (!S.patPrev) return; [S.pat, S.patPrev] = [S.patPrev, null]; patSaveDraft(); rerender(); },
  patCell: (el, e) => { S.patPrev = S.pat; S.pat = toggleNote(S.pat, +el.dataset.t, +el.dataset.n, { accent: e?.shiftKey, slide: e?.altKey }); patSaveDraft(); rerender(); },
  patPlay: (el) => { patPlay(el.dataset.loop === '1'); rerender(); },
  patMode: (el) => { patSwitch(el.dataset.v); rerender(); },
  patDest: (el) => { S.patDest = el.dataset.v; rerender(); },
  recSteps: (el) => { S.recSteps = +el.dataset.v; rerender(); },
  patLane: (el) => { const l = [...recLanes()]; l[+el.dataset.lane] = !l[+el.dataset.lane]; if (!l.some(Boolean)) { toast('Deja al menos una pista de batería'); rerender(); return; } S.recLanes = l; rerender(); },
  patDrum: (el, e) => { S.patPrev = S.pat; S.pat = toggleDrum(S.pat, +el.dataset.lane, +el.dataset.t, { accent: e?.shiftKey, ghost: e?.altKey }); patSaveDraft(); rerender(); },
  patRec: () => patRecord(),
  patVary: () => { S.patVary = (S.patVary || 0) + 1; S.patPrev = S.pat; S.pat = varyPattern(S.pat, { amount: 0.25, seed: S.patVary }); S.patId = null; patSaveDraft(); toast('Variación creada: guárdala como nuevo patrón para grabarla en el patrón siguiente del Circuit', 5000); rerender(); },
  recSwing: (el) => { S.recSwing = el.dataset.v; rerender(); },
  mtPlay: () => mtRecord(true),
  mtRec: () => mtRecord(false),
  patStop: () => { patStopNow(); rerender(); },
  patSave: async () => { const r = await patStore(false); if (r) { toast(`Patrón «${r.name}» guardado en tu biblioteca`); rerender(); } },
  patSaveNew: async () => { const r = await patStore(true); if (r) { toast(`Guardado como «${r.name}»`); rerender(); } },
  patAttach: async () => { const p = cur(); if (!p) return; const r = await patStore(false); if (!r) return; await lib.updateMeta([p.id], { patternId: r.id }, `Patrón «${r.name}» adjuntado a ${p.name}`); toast(`Adjuntado: Escucha usará «${r.name}» con ${p.name}, y al ordenar en disco irá un .mid junto a su .syx`, 6000); rerender(); },
  patMidi: (el) => { const pt = el.dataset.id ? findPattern(el.dataset.id) : S.pat; if (!pt) return; const drum = pt.kind === 'drum', ch = drum ? destChannel('drums') : destChannel(S.patDest || 'synth1'), gm = el.dataset.gm === '1'; download(midiName(gm ? { ...pt, name: pt.name + ' (GM)' } : pt, el.dataset.id || drum ? null : cur()), patternToMidi(pt, { channel: ch, drumNotes: drum ? (gm ? GM_DRUM_NOTES : DRUM_NOTES) : undefined }), 'audio/midi'); },
  patJson: () => download(midiName(S.pat, null).replace(/\.mid$/, '.json'), JSON.stringify({ format: 'ctpl-pattern', ...S.pat }, null, 1), 'application/json'),
  patLoad: (el) => { const x = findPattern(el.dataset.id); if (!x) return; S.patMode = x.kind === 'drum' ? 'drum' : 'synth'; S.patPrev = S.pat; S.pat = { ...x }; S.patOpts = { ...(x.kind === 'drum' ? DRUM_DEFAULTS : DEFAULTS), ...(x.opts || {}) }; S.patId = x.id; patSaveDraft(); rerender(); },
  patDel: async (el) => { const x = findPattern(el.dataset.id), n = lib.faces().filter((p) => p.meta.patternId === x.id); if (!(await confirmBox('Borrar patrón', `Se borra «${x.name}» de tu biblioteca${n.length ? ` y se desadjunta de ${n.length} patch(es)` : ''}.`))) return; if (n.length) await lib.updateMeta(n.map((p) => p.id), { patternId: null }, 'Patrón desadjuntado'); await lib.setSetting('patterns', (lib.settings.patterns || []).filter((y) => y.id !== x.id)); if (S.patId === x.id) S.patId = null; rerender(); },
  patOpenFor: (el) => { const p = lib.byId(el.dataset.id); S.sel = p.id; S.patMode = 'synth'; const x = patternOf(p); if (x) { S.pat = { ...x }; S.patOpts = { ...DEFAULTS, ...(x.opts || {}) }; S.patId = x.id; } else { const inf = lib.info(p); S.patOpts = { ...DEFAULTS, style: STYLE_FOR_CAT[p.meta.category || inf.cls.category] || 'offbeat', seed: 1 + Math.floor(Math.random() * 9999) }; S.pat = generatePattern(S.patOpts); S.patId = null; } S.view = 'patterns'; rerender(); },
  chgAdopt: async (el) => { const v = lib.byId(el.dataset.id); if (!v) return; await lib.adoptVariants([v.id], el.dataset.on === '1'); S.rowsKey = ''; toast(el.dataset.on === '1' ? `Aplicada a «${faceOf(lib.byId(lib.rootOf(v).id))?.name || ''}»: suena y se exporta así` : 'Vuelve a propuesta: suena el original'); rerender(); },
  chgDrop: async (el) => { const v = lib.byId(el.dataset.id); if (!v) return; await lib.deletePatches([v.id]); S.rowsKey = ''; toastAct('Propuesta descartada', 'Deshacer · Ctrl Z', undoLast); rerender(); },
  chgRevert: async (el) => { const p = lib.byId(el.dataset.id); if (!p) return; const r = await lib.revertToOriginal(p); S.sel = r.id; S.rowsKey = ''; toastAct(`«${r.name}» vuelve a sonar como el original`, 'Deshacer · Ctrl Z', undoLast); rerender(); },
  chgAdoptAll: async () => { const ids = viewChangesList().map((v) => v.id); if (!(await confirmBox('Aplicar propuestas', `${ids.length} propuestas se suman a la versión de su sonido: sonarán y se exportarán así. Puedes volver al original de cada uno cuando quieras.`, 'Aplicar'))) return; await lib.adoptVariants(ids, true); S.rowsKey = ''; rerender(); },
  chgDropAll: async () => { const ids = viewChangesList().map((v) => v.id); if (!(await confirmBox('Descartar propuestas', `Se descartan ${ids.length} propuestas (a la papelera). Los sonidos no cambian.`))) return; await lib.deletePatches(ids); S.rowsKey = ''; rerender(); },
  chgShow: (el) => { S.chgShow = el.dataset.v; S.chgOrigin = ''; rerender(); },
  tidyOpen: () => { S.view = 'changes'; rerender(); },
  tidyRun: async (el) => { const plan = lib.versionsPlan(), drop = el.dataset.drop === '1'; if (!plan.sounds.length) return; if (!(await confirmBox('Ordenar versiones', `${plan.sounds.length} sonido(s) quedarán con una sola versión (la que suena ahora). ${plan.drop.length + (drop ? plan.keep.length : 0)} variante(s) sobrante(s) irán fuera${drop ? ', también las propuestas' : ''}. Se puede deshacer entero (Ctrl Z o Historial).`, 'Ordenar'))) return; const r = await lib.tidyVersions(plan, { dropProposals: drop }); S.rowsKey = ''; rerender(); toastAct(`Versiones ordenadas: ${r.sounds} sonido(s), ${r.dropped} variante(s) fuera`, 'Deshacer · Ctrl Z', undoLast); },
  chgAB: (el) => { abPlay(lib.byId(el.dataset.id)); },
  goDisk: () => { S.view = 'organize'; S.orgTab = 'disk'; rerender(); },
  regKbd: async (el) => { await lib.setSetting('kbdMidi', el.value === 'unknown' ? null : el.value); if (el.value === 'no') S.regMethod = 'osc'; rerender(); },
  regMeasure: async (el) => { await measure(lib.byId(el.dataset.id)); },
  regVerify: async () => {
    const rep = regReport(), cand = rep.items.find((x) => x.confidence === 'clara' && lib.byId(x.id).payload[35] >= 59 && lib.byId(x.id).payload[35] <= 68) || rep.items[0];
    const p = cand ? lib.byId(cand.id) : lib.byId(S.sel); if (!p) { toast('No hay patches para probar'); return; }
    S.verifying = true; rerender();
    try {
      const a = new Uint8Array(p.payload), b = new Uint8Array(p.payload); a[35] = 64; b[35] = 65;
      const fa = await measureF0(a); await new Promise((r) => setTimeout(r, 300)); const fb = await measureF0(b);
      if (S.sel) { const cur = lib.byId(S.sel); if (cur) S.dev.session.sendPatch(cur.payload, S.dev.synth); }
      if (!fa || !fb) { toast('No se pudo medir la altura (sin señal o sonido sin tono claro). Revisa la entrada de audio o prueba con otro patch seleccionado.', 8000); return; }
      const st = 12 * Math.log2(fb / fa);
      if (Math.abs(st - 12) < 1.5) { await lib.setSetting('kbdMidi', 'yes'); toast(`Medido: la octava de teclado transpone el MIDI externo (${fa.toFixed(0)} → ${fb.toFixed(0)} Hz)`, 7000); }
      else if (Math.abs(st) < 1.5) { await lib.setSetting('kbdMidi', 'no'); S.regMethod = 'osc'; toast(`Medido: la octava de teclado NO afecta al MIDI externo (${fa.toFixed(0)} y ${fb.toFixed(0)} Hz)`, 7000); }
      else toast(`Resultado no concluyente (${fmtSemis(Math.round(st))} st). Prueba con un patch de tono claro seleccionado.`, 8000);
    } catch (e) { toast('Error al comprobar: ' + e.message, 6000); }
    finally { S.verifying = false; rerender(); }
  },
  dupDiscard: async () => {
    const ids = []; for (const f of lib.families().list) for (const m of f.members) if (m.rel && (m.rel.level === 'payload' || m.rel.level === 'synth')) ids.push(m.id);
    if (!(await confirmBox('Descartar duplicados', `${ids.length} patches pasarán a estado «Descartar». No se borra nada y se puede deshacer.`, 'Marcar'))) return;
    await lib.updateMeta(ids, { review: 'discard' }, `${ids.length} duplicados descartados`); rerender();
  },
  planWrite: async () => {
    if (!window.showDirectoryPicker) return toast('Tu navegador no permite escribir en carpetas: usa «Descargar como ZIP»');
    let dir; try { dir = await window.showDirectoryPicker({ mode: 'readwrite' }); } catch { return; }
    const plan = currentPlan(); let n = 0;
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', 'h');
    dir = await dir.getDirectoryHandle('Circuit Tracks ordenado ' + stamp, { create: true });
    let mids = 0;
    for (const e of plan.entries) { if (e.action !== 'write') continue; let h = dir; for (const part of e.dir) h = await h.getDirectoryHandle(part, { create: true }); const fh = await h.getFileHandle(e.file, { create: true }), w = await fh.createWritable(); await w.write(lib.exportSyx(lib.byId(e.id))); await w.close(); n++;
      const mid = planMid(e); if (mid) { const mh = await h.getFileHandle(mid.file, { create: true }), mw = await mh.createWritable(); await mw.write(mid.bytes); await mw.close(); mids++; } }
    const mh = await dir.getFileHandle('_manifiesto.csv', { create: true }), mw = await mh.createWritable(); await mw.write(planManifest(plan, lib)); await mw.close();
    toast(`${n} patches${mids ? ` y ${mids} patrones .mid` : ''} escritos en «${dir.name}»`);
  },
  planZip: () => { const plan = currentPlan(); const files = plan.entries.filter((e) => e.action === 'write').flatMap((e) => { const mid = planMid(e); return [{ path: ['Circuit Tracks ordenado', ...e.dir, e.file].join('/'), bytes: lib.exportSyx(lib.byId(e.id)) }, ...(mid ? [{ path: ['Circuit Tracks ordenado', ...e.dir, mid.file].join('/'), bytes: mid.bytes }] : [])]; }); files.push({ path: 'Circuit Tracks ordenado/_manifiesto.csv', bytes: new TextEncoder().encode(planManifest(plan, lib)) }); download('Circuit_Tracks_ordenado.zip', writeZip(files), 'application/zip'); },
  planCsv: () => download('manifiesto_orden.csv', planManifest(currentPlan(), lib), 'text/csv;charset=utf-8'),
  tplPick: (el) => { S.tplSel = S.tplSel === el.dataset.id ? '' : el.dataset.id; rerender(); },
  tplSave: async () => {
    const p = cur(); const name = await modal('Guardar plantilla', html`<label class="lab">Nombre<input class="field" id="tn" value="Macros de ${p.name}"></label>`, [{ label: 'Cancelar', value: null }, { label: 'Guardar', primary: true, value: (m) => $('#tn', m).value }]);
    if (!name) return; const t = { ...extractTemplate(p.payload, name), id: 'tpl' + Date.now(), from: p.name }; S.templates.push(t); S.tplSel = t.id; await saveSettings(); toast('Plantilla guardada'); rerender();
  },
  tplDel: async () => { S.templates = S.templates.filter((t) => t.id !== S.tplSel); S.tplSel = ''; await saveSettings(); rerender(); },
  tplApply: async () => {
    const p = cur(), t = [...S.templates, ...profileTemplates()].find((x) => x.id === S.tplSel); if (!t) return;
    const r = applyTemplate(p.payload, t, S.tplMode === 'selected' ? { knobs: [S.knob] } : { mode: S.tplMode });
    if (p.kind === 'variant') { await lib.editVariantBytes(p.id, [...r.payload].map((v, i) => [i, v]).filter(([i]) => i >= 204)); toast('Plantilla aplicada a su versión'); }
    else await variantFrom(p, r.payload, 'template', 'Plantilla «' + t.name + '»');
    if (r.warnings.length) await modal('Avisos de la plantilla', html`<ul class="note">${r.warnings.map((w) => html`<li>${w}</li>`)}</ul>`);
    if (S.live) liveSend(); rerender();
  },
  tplApplySel: async () => {
    const t = [...S.templates, ...profileTemplates()].find((x) => x.id === S.tplSel); if (!t) return; let n = 0, warn = 0;
    for (const p of listOf([...S.multi])) { const r = applyTemplate(p.payload, t, S.tplMode === 'selected' ? { knobs: [S.knob] } : { mode: S.tplMode }); warn += r.warnings.length; if (p.payload.some((b, i) => b !== r.payload[i])) { await lib.createVariant(p.id, r.payload, 'template', 'Plantilla «' + t.name + '»', ''); n++; } }
    rerender(); if (n) await afterChanges(n, false, `Plantilla «${t.name}» aplicada.${warn ? ` ${warn} aviso(s): alguna macro apunta a una ruta de matriz vacía en el patch.` : ''}`); else toast('Ningún patch necesitaba cambios');
  },
  // --- analyzer ---
  kpi: (el) => { const k = el.dataset.k; S.view = 'library'; S.q = { ...blankQ(), text: S.q.text };
    if (['native', 'legacy', 'duplicate'].includes(k)) S.q.compat = k; if (k === 'macro') S.q.macroIssues = true; if (k === 'untagged') S.q.uncategorized = true; if (k === 'pending') S.q.review = 'pending'; if (k === 'mono') S.q.features = ['mono']; rerender(); },
  toggleStrip: () => { S.strip = !S.strip; saveSettings(); rerender(); },
  stripCluster: (el) => { const c = LA().clusters[+el.dataset.i]; if (c) { S.q = { ...blankQ(), ids: c.ids }; S.view = 'library'; rerender(); toast(`Cluster «${c.label}»: ${c.size} patches`); } },
  clusterGo: (el) => { const c = LA().clusters.find((x) => String(x.id) === el.dataset.id); if (c) { S.q = { ...blankQ(), ids: c.ids }; S.view = 'library'; rerender(); } },
  stripEnv: (el) => { const la = LA(); S.q = { ...blankQ(), ids: la.envIds[+el.dataset.i] }; S.view = 'library'; rerender(); toast(`Duración amp env ${la.envLabels[+el.dataset.i]}`); },
  stripBri: (el) => { S.q = { ...blankQ(), ids: LA().briIds[+el.dataset.i] }; S.view = 'library'; rerender(); toast(`Brillo estimado ${el.dataset.i}–${+el.dataset.i + 1} / 10`); },
  noop: () => {},
  detectDups: () => { const la = LA(); if (!la.dup) { toast('Sin duplicados de síntesis en la biblioteca'); return; } S.q = { ...blankQ(), compat: 'duplicate' }; S.families = false; S.view = 'library'; rerender(); toast(`${la.dup} duplicado(s). Ábrelos y usa «Comparar con el original».`); },
  cmpWith: (el) => { S.cmpB = el.dataset.id; S.tab = 'compare'; rerender(); },
  tagToggle: async (el) => { const p = cur(); if (!p) return; const t = el.dataset.t, on = (p.meta.tags || []).includes(t); await lib.addTags([p.id], [t], on); rerender(); },
  toggleWords: () => { S.showWords = !S.showWords; rerender(); },
  qWord: (el) => { const w = el.dataset.w, l = S.q.words || []; S.q = { ...S.q, words: l.includes(w) ? l.filter((x) => x !== w) : [...l, w] }; rerender(); },
  qTag: (el) => { const t = el.dataset.t, l = S.q.tags || []; S.q = { ...S.q, tags: l.includes(t) ? l.filter((x) => x !== t) : [...l, t] }; rerender(); },
  wordsMore: () => { S.wordsAll = !S.wordsAll; rerender(); },
  wordToTag: async () => { const ids = filteredPatches().map((p) => p.id), t = (S.q.words || []).map((w) => w[0].toUpperCase() + w.slice(1)); if (!ids.length || !t.length) return; if (!(await confirmBox('Etiquetar por palabra', `Se añade «${t.join('», «')}» a los ${ids.length} patches que lo llevan en el nombre.`, 'Etiquetar'))) return; const h = await lib.addTags(ids, t); toast(h.text); rerender(); },
  wordsToFolder: async () => { S.multi = new Set(filteredPatches().map((p) => p.id)); rerender(); toast(`${S.multi.size} seleccionados: elige «Carpeta…» abajo`); },
  fxAutoTag: async () => { const todo = lib.faces().map((p) => [p, lib.fxOf(p).map((x) => x.t).filter((t) => !(p.meta.tags || []).includes(t))]).filter(([, t]) => t.length); if (!todo.length) return toast('No hay efectos nuevos que etiquetar'); if (!(await confirmBox('Etiquetar efectos detectados', `Se añaden etiquetas de efecto a ${todo.length} patch(es): delay y reverb cuando el nombre lo dice; chorus, phaser, distorsión y EQ cuando el patch los usa.`, 'Etiquetar'))) return; for (const [p, t] of todo) await lib.addTags([p.id], t); toast(`${todo.length} patch(es) etiquetados`); rerender(); },
  palAdd: async () => { const pal = structuredClone(lib.tagPalette); pal.push({ name: 'Nuevo grupo', tags: [] }); await lib.setSetting('tagPalette', pal); rerender(); },
  palDel: async (el) => { const pal = structuredClone(lib.tagPalette); pal.splice(+el.dataset.i, 1); await lib.setSetting('tagPalette', pal); rerender(); },
  palReset: async () => { await lib.setSetting('tagPalette', null); rerender(); },
  setSub: async (el) => { const p = cur(), c = el.dataset.c, sb = el.dataset.s; if (!p) return; const on = p.meta.category === c && p.meta.subtype === sb; await lib.setSubfolder([p.id], c, on ? null : sb); rerender(); },
  subNew: (el) => { S.subNew = el.dataset.c; rerender(); $('.subnew')?.focus(); },
  tagDel: async (el) => { await lib.addTags([S.sel], [el.dataset.t], true); rerender(); $('.tagin')?.focus(); },
  orgFolders: (el) => { S.view = 'organize'; S.orgTab = 'folders'; S.fCat = el.dataset.c || S.fCat; rerender(); },
  bulkTags: async () => {
    const ids = [...S.multi], all = lib.allTags();
    const r = await modal(`Etiquetas · ${ids.length} patch(es)`, html`<input class="field" id="btag" list="btagList" placeholder="Una o varias, separadas por comas" style="width:100%"><datalist id="btagList">${[...new Set([...all.map(([t]) => t), ...DESCRIPTORS])].map((t) => html`<option value="${t}">`)}</datalist>${all.length ? html`<p class="note" style="margin-top:8px">En uso: ${all.slice(0, 24).map(([t, n]) => `${t} (${n})`).join(' · ')}</p>` : ''}`,
      [{ label: 'Cancelar', value: null }, { label: 'Quitar', value: (m) => ['del', $('#btag', m).value] }, { label: 'Añadir', primary: true, value: (m) => ['add', $('#btag', m).value] }]);
    if (!r || !r[1].trim()) return;
    const h = await lib.addTags(ids, r[1].split(','), r[0] === 'del'); if (h) toast(h.text); rerender();
  },
  autoNext: () => { const p = cur(); if (!p) return; const r = lib.rootOf(p); S.autoSeed[r.id] = (S.autoSeed[r.id] || 0) + 1; rerender(); if (S.dev.session && S.autoListen !== false) audPlay(p); },
  phOct: (el) => shiftPhrase(cur(), +el.dataset.d),
  autoAttach: async () => { const p = cur(); if (!p || patternOf(p)) return; const r = await autoAttach(p); toast(`Patrón adjuntado a «${p.name}». Lo tienes en Patrones para editarlo.`); rerender(); return r; },
  autoDetach: async () => { const p = cur(); if (!p?.meta.patternId) return; await lib.updateMeta([p.id], { patternId: null }, `Patrón quitado de ${p.name}`); rerender(); },
  autoOpen: () => { const p = cur(); if (!p) return; const pt = autoPat(p); S.patMode = 'synth'; S.pat = { ...pt }; S.patOpts = { ...DEFAULTS, style: pt.style, root: pt.root, scale: pt.scale, steps: pt.steps, tempo: pt.tempo, seed: autoSeedOf(p) }; S.patId = null; S.view = 'patterns'; rerender(); },
  bulkAutoAttach: async () => { const ids = [...S.multi].filter((id) => !patternOf(lib.byId(id))); if (!ids.length) return toast('Todos los seleccionados ya tienen patrón.'); if (!(await confirmBox('Adjuntar patrones generados', `Se adjunta a ${ids.length} patch(es) el patrón que la herramienta genera para cada uno (según su subcarpeta o categoría). Se puede quitar uno a uno.`, 'Adjuntar'))) return; for (const id of ids) await autoAttach(lib.byId(id)); toast(`${ids.length} patrones adjuntados`); rerender(); },
  addTag: async (el) => { const p = cur(), t = el.dataset.t, tags = p.meta.tags || []; await lib.updateMeta([p.id], { tags: tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t] }, 'Etiquetas'); rerender(); },
  normalizeModal: async () => {
    const ids = S.multi.size ? [...S.multi] : [S.sel];
    const r = await modal('Normalizar macros', html`<p class="note">${ids.length} patch(es). Quedan como <b>propuesta</b> en cada sonido (solo si la operación cambia algo): escúchalas y aplícalas en Cambios.</p>
      <div class="grid2"><label class="lab">Perfil<select class="field" id="nmP">${Object.entries(PROFILES).map(([id, pr]) => html`<option value="${id}" ${S.profile === id ? 'selected' : ''}>${pr.title}</option>`)}</select></label>
      <label class="lab">Operación<select class="field" id="nmM"><option value="reorder">Reordenar macros completas (sin perder rutas)</option><option value="fill">Rellenar solo macros vacías</option></select></label></div>`,
      [{ label: 'Cancelar', value: null }, { label: 'Proponer', primary: true, value: (m) => ({ p: $('#nmP', m).value, m: $('#nmM', m).value }) }]);
    if (!r) return; S.profile = r.p; let n = 0;
    for (const p of listOf(ids)) { const pl = r.m === 'reorder' ? reorderToProfile(p.payload, r.p).payload : fillEmptyFromProfile(p.payload, r.p).payload; if (p.payload.some((b, i) => b !== pl[i])) { await lib.createVariant(p.id, pl, 'macro-' + r.m, `Macros ${r.m === 'reorder' ? 'reordenadas' : 'rellenas'} · ${PROFILES[r.p].title}`, ''); n++; } }
    rerender(); if (n) await afterChanges(n, false, `Macros normalizadas con el perfil «${PROFILES[r.p].title}» (${ids.length - n} patches ya estaban bien).`); else toast('Ningún patch necesitaba cambios');
  },
  autoTagModal: async () => {
    const scope = S.multi.size ? listOf([...S.multi]) : filteredPatches();
    const pend = scope.filter((p) => !p.meta.category && lib.info(p).cls.category);
    const by = (lvl) => pend.filter((p) => CERTAINTY[lib.info(p).cls.certainty].rank >= CERTAINTY[lvl].rank).length;
    const r = await modal('Auto tag', html`<p>${S.multi.size ? 'Selección' : 'Filtro actual'}: ${scope.length} patches · ${pend.length} con propuesta y sin categoría guardada.</p>
      <label class="lab">Aplicar propuestas con certeza mínima<select class="field" id="atL"><option value="corroborated">Corroborada (${by('corroborated')})</option><option value="textual" selected>Una fuente o más (${by('textual')})</option><option value="technical">Incluir hipótesis técnicas (${by('technical')})</option></select></label>
      <p class="note">Solo cambia tus fichas (categoría, uso, descriptores). Nunca el SysEx. Se registra como decisión y se puede revertir desde el historial.</p>`,
      [{ label: 'Cancelar', value: null }, { label: 'Aplicar', primary: true, value: (m) => $('#atL', m).value }]);
    if (!r) return;
    const ids = pend.filter((p) => CERTAINTY[lib.info(p).cls.certainty].rank >= CERTAINTY[r].rank).map((p) => p.id);
    if (!ids.length) return toast('Nada que aplicar');
    await lib.acceptClassification(ids); toast(`${ids.length} patches etiquetados`); rerender();
  },
  buildPackModal: async () => {
    const scope = S.multi.size ? 'selection' : 'filter';
    const r = await modal('Construir pack de 128', html`<p class="note">Circuit Tracks muestra los patches en 4 páginas de 32. Cada página se dedica a un grupo; dentro, ordenados por subtipo y valoración. Una sola versión por familia (la mejor valorada) y sin descartados.</p>
      <table class="t">${DEFAULT_LAYOUT.map((l, i) => html`<tr><td>Página ${i + 1} · ${i * 32 + 1}–${i * 32 + 32}</td><td>${l.label}</td></tr>`)}</table>
      <div class="grid2" style="margin-top:8px"><label class="lab">Origen<select class="field" id="bpS"><option value="${scope}">${scope === 'selection' ? 'Selección (' + S.multi.size + ')' : 'Filtro actual (' + computeRows().length + ' filas)'}</option><option value="all">Toda la biblioteca</option></select></label>
      <label class="lab">Usar también propuestas<select class="field" id="bpC"><option value="none">No: solo categorías guardadas</option><option value="corroborated">Sí, si son corroboradas</option><option value="textual" selected>Sí, desde una fuente</option></select></label></div>
      <label class="note"><input type="checkbox" class="chk" id="bpF"> Rellenar huecos con lo que sobre de otras categorías</label><label class="lab" style="margin-top:6px">Nombre<input class="field" id="bpN" value="Pack auto ${new Date().toISOString().slice(0, 10)}"></label>`,
      [{ label: 'Cancelar', value: null }, { label: 'Construir', primary: true, value: (m) => ({ s: $('#bpS', m).value, c: $('#bpC', m).value, f: $('#bpF', m).checked, n: $('#bpN', m).value }) }]);
    if (!r) return;
    const cand = r.s === 'all' ? lib.faces() : r.s === 'selection' ? listOf([...S.multi]) : filteredPatches();
    const res = buildPack(cand, lib, { allowProposals: r.c !== 'none', minCertainty: r.c === 'none' ? 'manual' : r.c, fillGaps: r.f });
    const b = await lib.createBank(r.n || 'Pack auto'); b.slots = res.slots; b.blocks = res.blocks; await lib.saveBank(b); S.bank = b.id; S.page = 0; S.view = 'banks'; rerender();
    await modal('Pack construido', html`<p>${res.placed} de 128 posiciones ocupadas.</p><table class="t">${res.pages.map((pg, i) => html`<tr><td>Página ${i + 1} · ${pg.label}</td><td>${pg.placed}/32</td><td>${pg.available > 32 ? pg.available - 32 + ' no caben' : ''}</td><td>${pg.fromProposals ? pg.fromProposals + ' por propuesta' : ''}</td></tr>`)}</table>
      <p class="note">Excluidos: ${res.excluded.family} por familia · ${res.excluded.discarded} descartados · ${res.excluded.uncategorized} sin categoría · ${res.excluded.lowCertainty} con certeza baja.</p>`);
  },
  // --- equipo ---
  devCh: async (el) => {},
  devCh2: async () => {},
  capture: async () => {
    const s = S.dev.session; if (!s) return;
    if (!S.capturing) { s.startCapture(); S.capturing = true; toast('Capturando: toca la frase en el equipo'); rerender(); return; }
    S.capturing = false; const n = Object.keys(S.customPhrases).length + 1;
    const ph = s.stopCapture(tempoNow(), 'Mi frase ' + n);
    if (!ph) { toast('No llegaron notas (activa Note Tx en Setup View)'); rerender(); return; }
    S.customPhrases['custom' + Date.now()] = ph; await saveSettings(); toast(`Frase guardada: ${ph.notes.length} notas`); rerender();
  },
  phraseTry: (el) => { const s = S.dev.session; if (s) s.playPhrase(S.customPhrases[el.dataset.k], S.dev.synth, { tempo: tempoNow() }); },
  phraseDel: async (el) => { delete S.customPhrases[el.dataset.k]; await saveSettings(); rerender(); },
  saveLiveMacros: async () => {
    const p = cur(), pos = S.dev.session?.macroPos[S.dev.synth] || [];
    if (!pos.some((v) => v !== null)) { toast('Aún no han llegado posiciones: gira las macros del equipo (CC Tx activo)'); return; }
    const pl = new Uint8Array(p.payload); pos.forEach((v, k) => { if (v !== null) pl[204 + 17 * k] = v; });
    await variantFrom(p, pl, 'macro-positions', 'Posiciones de macros capturadas del equipo'); rerender();
  },
  readCurrent: async () => { try { const pl = await S.dev.session.requestCurrent(S.dev.synth); await importDump([{ n: 'activo', payload: pl }]); } catch (e) { toast(e.message, 6000); } },
  readStored: async () => {
    if (!(await confirmBox('Leer patches 1–64', `Se seleccionarán uno a uno los patches 1–64 en Synth ${S.dev.synth + 1} y se pedirá su volcado (unos 10 s). Cambia el patch activo de la pista; no modifica la memoria del equipo.`, 'Leer'))) return;
    const res = await S.dev.session.readStored(Array.from({ length: 64 }, (_, i) => i), S.dev.synth, (n) => { if (n % 8 === 0) toast(`Leyendo ${n + 1}/64…`, 900); });
    if (res.aborted) { toast(res.aborted, 9000); return; }
    if (res.restored) setTimeout(() => toast('Lectura terminada: la pista vuelve a tener el sonido que tenía antes'), 1200);
    await importDump(res);
  },
  audioList: async () => { try { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); st.getTracks().forEach((t) => t.stop()); S.audioInputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput'); rerender(); } catch (e) { toast('Sin acceso al audio: ' + e.message); } },
  audioTest: async () => { try { await record(3000); toast('Prueba de nivel terminada'); } catch (e) { toast('Error de audio: ' + e.message); } }
};
// Patrón adjunto al patch de una entrada del plan → .mid con el mismo nombre que su .syx
function planMid(e) { const p = lib.byId(e.id), pt = p && patternOf(p); return pt ? { file: e.file.replace(/\.syx$/i, '.mid'), bytes: patternToMidi(pt, { channel: S.dev.channels?.[S.dev.synth] ?? 0, name: p.name }) } : null; }
function currentPlan() { const o = S.plan; return diskPlan(lib, planScope(lib, filteredPatches(), o.scope), o); }
// Primer cambio sobre un sonido: se crea su versión (la que suena y se exporta) y los cambios se suman en ella.
async function ensureVariant(p) {
  const root = lib.rootOf(p), cv = lib.currentVersion(root);
  if (cv.kind === 'variant') { if (S.sel !== cv.id && S.view === 'library') { S.sel = cv.id; S.rowsKey = ''; } return cv; }
  const v = await lib.createVariant(root.id, root.payload, 'edit', 'Edición', '', { adopted: true }); S.sel = v.id; S.rowsKey = '';
  toast(`Editando «${v.name}»: los cambios se guardan solos y es lo que se exporta. El original sigue guardado (Volver al original).`, 5000); return v;
}
let liveTimer;
function liveSend() { clearTimeout(liveTimer); liveTimer = setTimeout(() => { const p = cur(), s = S.dev.session; if (p && s) s.sendPatch(p.payload, S.dev.synth); }, 120); }
async function importDump(res) {
  const ok = res.filter((r) => r.payload), stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const inputs = ok.map((r) => ({ name: `volcado_${typeof r.n === 'number' ? 'patch_' + String(r.n + 1).padStart(2, '0') : 'activo'}_${stamp}.syx`, path: 'Volcados MIDI/' + stamp, bytes: lib.exportSyx({ payload: r.payload }) }));
  const rep = await lib.importInputs(inputs); S.rowsKey = ''; buildQueue(); rerender();
  if (res.length - ok.length) toast(`${res.length - ok.length} sin respuesta`, 5000);
  await importReport(rep);
}
async function zipOf(list, label) { const files = list.map((p, i) => ({ path: `${String(i + 1).padStart(4, '0')} - ${safeFile(p.name)}.syx`, bytes: lib.exportSyx(p) })); if (!files.length) return toast('Nada que exportar'); download(`circuit_tracks_${label}.zip`, writeZip(files), 'application/zip'); }
async function suggestRulesModal(sug) {
  const chosen = await modal('¿Aprender de esta corrección?', html`<p class="note">Se aplicarían a futuras importaciones; puedes desactivarlas en Audit.</p>${sug.map((s, i) => html`<label class="row2" style="margin:6px 0"><input type="checkbox" class="chk" data-r="${i}"> ${s.type === 'token' ? 'Palabra' : 'Carpeta'} «${s.pattern}» → ${CAT_LABEL[s.category]} <span class="note">${s.why}</span></label>`)}`, [{ label: 'No', value: null }, { label: 'Guardar', primary: true, value: (m) => $$('[data-r]', m).filter((x) => x.checked).map((x) => sug[+x.dataset.r]) }]);
  for (const s of chosen || []) await lib.addRule({ type: s.type, pattern: s.pattern, category: s.category });
  if (chosen?.length) { toast(chosen.length + ' regla(s) guardadas'); rerender(); }
}
function rerenderList() { rerender(); }
// ---------- eventos ----------
let searchTimer;
function bindList() {
  const vl = $('#vlist'); if (vl) vl.onscroll = () => requestAnimationFrame(renderRows);
  const qt = $('#gsearch'); if (qt) qt.oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { S.q.text = qt.value; if (S.view !== 'library') S.view = 'library'; rerender(); const v = $('#gsearch'); v.focus(); v.setSelectionRange(v.value.length, v.value.length); }, 200); };
  $$('.routes [data-hr]').forEach((d) => { d.onmouseenter = () => { S.hoverRoute = +d.dataset.hr; $$('.anat [data-ri]').forEach((w) => w.classList.toggle('w-dim', +w.dataset.ri !== S.hoverRoute)); }; d.onmouseleave = () => { S.hoverRoute = null; $$('.anat [data-ri]').forEach((w) => w.classList.remove('w-dim')); }; });
}
function afterRender() {
  bindList();
  $('#fileIn').onchange = async (e) => { await doImport([...e.target.files]); e.target.value = ''; };
  $('#dirIn').onchange = async (e) => { await doImport([...e.target.files]); e.target.value = ''; };
  const bp = $('#bankPick'); if (bp) bp.oninput = () => { S.bankPick = bp.value; clearTimeout(searchTimer); searchTimer = setTimeout(() => { rerender(); const x = $('#bankPick'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }, 200); };
  if (S.view === 'banks') bindBankDnD();
  if (S.view === 'analyze') requestAnimationFrame(drawMap);
  if (S.view === 'audition') $('.qi.on')?.scrollIntoView({ block: 'nearest' });
}
function bindBankDnD() {
  $$('[data-drag]').forEach((el) => { el.ondragstart = (e) => e.dataTransfer.setData('text/plain', 'p:' + el.dataset.drag); });
  $$('.slot').forEach((el) => {
    el.ondragstart = (e) => e.dataTransfer.setData('text/plain', 's:' + el.dataset.slot);
    el.ondragover = (e) => { e.preventDefault(); el.classList.add('over'); };
    el.ondragleave = () => el.classList.remove('over');
    el.ondrop = async (e) => {
      e.preventDefault(); const d = e.dataTransfer.getData('text/plain'), i = +el.dataset.slot, b = lib.banks.find((x) => x.id === S.bank);
      if (d.startsWith('p:')) { const id = d.slice(2); if (b.slots[i] && b.slots[i] !== id && !(await confirmBox('Reemplazar', `La posición ${i + 1} contiene «${lib.byId(b.slots[i])?.name}». ¿Reemplazar?`, 'Reemplazar'))) return rerender(); const old = b.slots.indexOf(id); if (old >= 0) b.slots[old] = null; b.slots[i] = id; }
      if (d.startsWith('s:')) { const j = +d.slice(2); [b.slots[i], b.slots[j]] = [b.slots[j], b.slots[i]]; }
      await lib.saveBank(b); rerender();
    };
  });
}
function bindGlobal() {
  bindKnobs();
  document.addEventListener('click', (e) => { const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type !== 'checkbox')) return; if (el.tagName === 'INPUT' && el.dataset.act === 'opt') return; const f = A[el.dataset.act]; if (f) f(el, e); });
  document.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.dataset.q) { S.q[el.dataset.q] = el.value; if (el.dataset.q === 'category') S.q.subtype = ''; rerender(); return; }
    const act = el.dataset.act; if (!act) return; const p = cur();
    if (act === 'opt') { S[el.dataset.k] = el.checked; saveSettings(); return; }
    if (act === 'qsrc') { buildQueue(el.value); S.qi = 0; saveSettings(); rerender(); return; }
    if (act === 'phrase') { S.phrase = el.value; rerender(); return; }
    if (act === 'chgOrigin') { S.chgOrigin = el.value; rerender(); return; }
    if (act === 'drumKit') { const k = [...(S.dev.drumKit || [0, 0, 0, 0])]; k[+el.dataset.lane] = +el.value; S.dev.drumKit = k; saveSettings(); rerender(); return; }
    if (act === 'mtSet') { S.mtSel = { ...(S.mtSel || {}), [el.dataset.k]: el.value }; rerender(); return; }
    if (act === 'patSet') { const k = el.dataset.k, v = el.value, o = S.patOpts; if (k === 'mknob') o.macro = { ...o.macro, knob: +v, shape: +v >= 0 && o.macro.shape === 'none' ? 'rise' : o.macro.shape }; else if (k === 'mshape') o.macro = { ...o.macro, shape: v }; else if (k === 'mlo' || k === 'mhi') o.macro = { ...o.macro, [k === 'mlo' ? 'lo' : 'hi']: Math.max(0, Math.min(127, +v)) }; else if (k === 'octave') o.octave = v === '' ? null : +v; else if (k === 'style' && isDrumMode()) { o.style = v; o.tempo = null; } else if (k === 'fill') o.fill = v === '1'; else if (k === 'style') { o.style = v; o.density = o.accent = o.slide = o.gate = o.octave = null; } else o[k] = ['root', 'steps', 'tempo', 'seed'].includes(k) ? +v : +v; patRegen(); rerender(); return; }
    if (act === 'groupBy') { S.groupBy = el.value; rerender(); return; }
    if (act === 'sortSel') { S.sort = { by: el.value, dir: 1 }; rerender(); return; }
    if (act === 'collectionSel') { if (el.value === '__save') { el.value = ''; A.newCollection(); return; } S.q.collection = el.value; rerender(); return; }
    if (act === 'regKbd') { await A.regKbd(el); return; }
    if (act === 'archLevel') { S.archLevel = el.value; S.openGroups.clear(); saveSettings(); rerender(); return; }
    if (act === 'bulkOct' && el.value) {
      const n = +el.value, adopt = { length: await transposeIds([...S.multi], n) };
      toast(`${adopt.length} patch(es) transpuestos ${n > 0 ? '+' : '−'}${Math.abs(n) / 12} oct (en la versión de cada uno; Ctrl Z deshace)`); rerender(); return;
    }
    if (act === 'regPlanSel') { await regPlanSet(el.dataset.g, { [el.dataset.f]: el.value === '' ? null : el.value }); rerender(); return; }
    if (act === 'regSet') { S[el.dataset.k] = el.dataset.k === 'regTune' ? !!el.value : el.value; rerender(); return; }
    if (act === 'planSet') { S.plan[el.dataset.k] = el.value; rerender(); return; }
    if (act === 'tplMode') { S.tplMode = el.value; rerender(); return; }
    if (act === 'mroute' || act === 'mpos') {
      const p = await ensureVariant(cur()); if (!p) return;
      const k = +el.dataset.k, val = +el.value;
      if (act === 'mpos') await lib.editVariantBytes(p.id, [[204 + 17 * k, val]]);
      else if (el.dataset.f === 'newdest') { if (el.value === '') return; const pl = setSlot(p.payload, k, +el.dataset.s, { dest: val, start: 0, end: 127, depth: 96 }); await lib.editVariantBytes(p.id, [...pl].map((v, i) => [i, v]).filter(([i]) => i >= 204)); }
      else { const pl = setSlot(p.payload, k, +el.dataset.s, { [el.dataset.f]: val }); await lib.editVariantBytes(p.id, [...pl].map((v, i) => [i, v]).filter(([i]) => i >= 204)); }
      S.knob = k; if (S.live) liveSend(); rerender(); return;
    }
    if (act === 'devCh') { S.dev.channels[+el.dataset.i] = +el.value; openSession(); await saveSettings(); rerender(); return; }
    if (act === 'devCh2') { const k = el.dataset.k; if (k === 'dr') S.dev.chDrum = +el.value; else { S.dev.chMidi = [...(S.dev.chMidi || [2, 3])]; S.dev.chMidi[+k.slice(1)] = +el.value; } await saveSettings(); rerender(); return; }
    if (act === 'devSet') { const k = el.dataset.k; S.dev[k] = ['synth', 'tempo', 'root', 'measureNote', 'patchDelay'].includes(k) ? +el.value : el.value; if (k === 'outId' || k === 'inId') openSession(); await saveSettings(); rerender(); return; }
    if (act === 'reanOpt') { S.reanOpt = { ...S.reanOpt, [el.dataset.k]: el.checked }; rerender(); return; }
    if (act === 'palName' || act === 'palTags') { const pal = structuredClone(lib.tagPalette), g = pal[+el.dataset.i]; if (act === 'palName') g.name = el.value.trim() || g.name; else g.tags = [...new Set(el.value.split(',').map((x) => x.trim()).filter(Boolean))]; await lib.setSetting('tagPalette', pal); rerender(); return; }
    if (act === 'fRename') { await lib.renameSubfolder(el.dataset.c, el.dataset.s, el.value); rerender(); return; }
    if (act === 'fAdd' && el.value.trim()) { await lib.addSubfolder(el.dataset.c, el.value); rerender(); $('[data-act="fAdd"]')?.focus(); return; }
    if (act === 'setCat' && el.value && p) { const r = await lib.setCategory([p.id], el.value, null); rerender(); if (r.suggestions.length && S.view !== 'audition') suggestRulesModal(r.suggestions); return; }
    if (act === 'audCatSel' && el.value && p) { const c = el.value, cls = lib.info(p).cls; await lib.setCategory([p.id], c, cls.category === c ? cls.subtype || null : null); rerender(); return; }
    if (act === 'correct' && el.value && p) { const [c, s] = el.value.split(':'); const r = await lib.setCategory([p.id], c, s || null); rerender(); if (r.suggestions.length) suggestRulesModal(r.suggestions); return; }
    if (act === 'profile') { S.profile = el.value; rerender(); return; }
    if (act === 'bankSel') { S.bank = el.value; rerender(); return; }
    if (act === 'cmpPick') { S.cmpB = el.value; rerender(); return; }
    if (act === 'metaSel') { await lib.updateMeta([p.id], { [el.dataset.k]: el.value }, 'Estado: ' + REVIEW[el.value]); rerender(); return; }
    if (act === 'metaTxt') { const k = el.dataset.k; await lib.updateMeta([p.id], { [k]: k === 'tags' ? el.value.split(',').map((s) => s.trim()).filter(Boolean) : el.value }, k === 'tags' ? 'Etiquetas' : 'Notas'); S.rowsKey = ''; return; }
    if (act === 'rename') { await lib.renameVariant(p.id, el.value); rerender(); return; }
    if (act === 'pedit') { await lib.editVariantBytes(p.id, [[+el.dataset.off, +el.value]]); if (S.live) liveSend(); rerender(); return; }
    if (act === 'slotEdit') { const pl = setSlot(p.payload, S.knob, +el.dataset.s, { [el.dataset.f]: +el.value }); await lib.editVariantBytes(p.id, [...pl].map((v, i) => [i, v]).filter(([i]) => i >= 204)); rerender(); return; }
    if (act === 'bulkCat' && el.value) { const [c, sb] = el.value.split(':'); const r = await lib.setCategory([...S.multi], c, sb || null); toast(r.history.text); rerender(); return; }
    if (act === 'bulkReview' && el.value) { await lib.updateMeta([...S.multi], { review: el.value }, `Estado ${REVIEW[el.value]} en ${S.multi.size}`); rerender(); return; }
    if (act === 'bulkCollection' && el.value) {
      let c = lib.collections.find((x) => x.id === el.value);
      if (el.value === '__new') { const n = await modal('Nueva colección manual', html`<input class="field" id="cn">`, [{ label: 'Cancelar', value: null }, { label: 'Crear', primary: true, value: (m) => $('#cn', m).value }]); if (!n) return rerender(); c = await lib.saveCollection({ name: n, kind: 'manual', ids: [] }); }
      c.ids = [...new Set([...c.ids, ...S.multi])]; await lib.saveCollection(c); toast(`Añadidos a «${c.name}»`); rerender();
    }
  });
  document.addEventListener('keydown', async (e) => {
    const act = e.target.dataset?.act;
    if (act === 'tagIn' && (e.key === 'Enter' || e.key === ',')) { e.preventDefault(); const v = e.target.value.split(',').map((x) => x.trim()).filter(Boolean), p = cur(); if (v.length && p) { await lib.addTags([p.id], v); rerender(); $('.tagin')?.focus(); } return; }
    if (act === 'tagIn' && e.key === 'Backspace' && !e.target.value) { const p = cur(), t = p?.meta.tags || []; if (t.length) { await lib.addTags([p.id], [t.at(-1)], true); rerender(); $('.tagin')?.focus(); } return; }
    if (act === 'subNewIn' && e.key === 'Enter') { e.preventDefault(); const c = e.target.dataset.c, id = await lib.addSubfolder(c, e.target.value), p = cur(); S.subNew = null; if (id && p) await lib.setSubfolder([p.id], c, id); rerender(); return; }
    if (act === 'subNewIn' && e.key === 'Escape') { S.subNew = null; rerender(); return; }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
    if (e.key === '.' && !e.target.matches('input,textarea,select') && !document.querySelector('.modal')) { e.preventDefault(); A.dockToggle(); return; }
    if (e.key === '/' && !e.target.matches('input,textarea,select')) { e.preventDefault(); $('#gsearch')?.focus(); return; }
    if (e.target.matches('input,textarea,select') || $('.modal')) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undoLast(); return; }
    if (e.key === '?') { e.preventDefault(); showKeys(); return; }
    if (e.altKey && /^Digit[1-9]$/.test(e.code) && ['audition', 'library'].includes(S.view)) { const t = quickTags()[+e.code.slice(5) - 1], id = S.view === 'audition' ? S.queue[S.qi] : S.sel, p = id && lib.byId(id); if (t && p) { e.preventDefault(); const on = (p.meta.tags || []).includes(t); lib.addTags([p.id], [t], on).then(() => { toast(`${on ? 'Quitada' : 'Etiqueta'}: ${t}`, 1400); rerender(); }); } return; }
    if (S.view === 'organize' && S.orgTab === 'register' && S.regView && S.regView !== 'plan' && e.key === 'Escape') { e.preventDefault(); A.regView({ dataset: { v: 'plan' } }); return; }
    if ((e.key === '<' || e.key === '>') && ['audition', 'library'].includes(S.view) && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); shiftPhrase(cur(), e.key === '>' ? 12 : -12); return; }
    if (S.view === 'audition') {
      const k = e.key.toLowerCase();
      if (e.code === 'Space') { e.preventDefault(); audPlay(); return; }
      if (e.key === 'Escape') { A.audStop(); return; }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); A.qstep({ dataset: { d: e.key === 'ArrowRight' ? 1 : -1 } }); return; }
      if (e.key === 'Enter') { e.preventDefault(); A.audAccept(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (e.shiftKey) A.audReview({ dataset: { r: 'discard' } }); else A.audDelete(); return; }
      if (e.shiftKey && /^Digit[1-8]$/.test(e.code)) { e.preventDefault(); A.sweep({ dataset: { k: +e.code.slice(5) - 1 } }); return; }
      if (/^[1-5]$/.test(e.key)) { A.rate({ dataset: { n: e.key } }); return; }
      if (k === 'f') { A.audFav(); return; }
      if (k === 'm') { A.measureSel(); return; }
      if (CAT_KEYS[k] && !e.ctrlKey && !e.metaKey) { A.audCat({ dataset: { c: CAT_KEYS[k] } }); return; }
    }
    if (S.view === 'library' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const rows = S.rows.filter((r) => !r.header); let i = rows.findIndex((r) => r.p.id === S.sel); i = Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
      if (rows[i]) { S.sel = rows[i].p.id; e.preventDefault(); rerender(); const vl = $('#vlist'); if (vl) { const y = S.rows.indexOf(rows[i]) * 46; if (y < vl.scrollTop || y > vl.scrollTop + vl.clientHeight - 40) { vl.scrollTop = y - vl.clientHeight / 2; renderRows(); } } }
    }
    if (S.view === 'organize' && S.orgTab === 'register' && S.regView === 'review') {
      const k = e.key.toLowerCase();
      if (k === '1') { A.revPlay({ dataset: { w: 'o' } }); return; } if (k === '2' || e.code === 'Space') { e.preventDefault(); A.revPlay({ dataset: { w: 'v' } }); return; }
      if (e.key === 'Enter') { e.preventDefault(); A.revOk(); return; } if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); A.revDrop(); return; }
      if (k === 'k') { A.revKeep(); return; } if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); A.revStep(e.key === 'ArrowRight' ? 1 : -1); return; }
    }
    if (S.view === 'library' && e.code === 'Space' && S.sel) { e.preventDefault(); A.listenSel(); }
    if (S.view === 'library' && (e.key === 'Delete' || e.key === 'Backspace') && (S.multi.size || S.sel)) { e.preventDefault(); trashIds(S.multi.size ? [...S.multi] : [S.sel]); return; }
    if (S.view === 'library' && S.sel && !e.ctrlKey && !e.metaKey && !e.altKey) { const k = e.key.toLowerCase(); if (k === 'g') { e.preventDefault(); A.autoNext(); } else if (k === 'a') { e.preventDefault(); A.autoAttach(); } }
  });
  let depth = 0;
  window.addEventListener('dragenter', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { depth++; $('#drop')?.classList.add('on'); } });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) $('#drop')?.classList.remove('on'); });
  window.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', async (e) => {
    if (!e.dataTransfer?.files?.length) return; e.preventDefault(); depth = 0; $('#drop')?.classList.remove('on');
    const items = [...e.dataTransfer.items || []].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
    if (items.some((x) => x.isDirectory)) { const files = []; for (const it of items) await walk(it, '', files); doImport(files); } else doImport([...e.dataTransfer.files]);
  });
  window.addEventListener('resize', () => { renderRows(); if (S.view === 'analyze') drawMap(); });
}
async function walk(entry, path, out) {
  if (entry.isFile) { const f = await new Promise((res, rej) => entry.file(res, rej)); f._path = path ? path + '/' + f.name : ''; out.push(f); return; }
  const reader = entry.createReader(); let batch;
  do { batch = await new Promise((res) => reader.readEntries(res, () => res([]))); for (const e of batch) await walk(e, path ? path + '/' + entry.name : entry.name, out); } while (batch.length);
}
window.addEventListener('DOMContentLoaded', () => { init().catch((e) => { document.body.innerHTML = '<pre style="color:#fff;padding:20px">Error al iniciar: ' + esc(e.message) + '</pre>'; }); });
window.__ctpl = { origin: __ORIGIN__, get lib() { return lib; }, S, A, planMid, get songTl() { return sgTl(); } };
