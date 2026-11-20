// core/pack.js — packs de 128 samples para la Circuit Rhythm: distribución, presupuesto de tiempo,
// Beat Match, constructor automático, nombres y archivos (Components y tarjeta SD).

import { keepFraction } from './shorten.js';
import { translit } from './classify.js';

export const SLOTS = 128;
export const PAGE = 16;
export const MAX_TOTAL_S = 228;   // tiempo total de samples por pack (Novation)
export const MAX_SAMPLE_S = 30;   // máximo por sample (Novation)
export const PROJECT_SIZE = 169092;

// ---------- distribuciones ----------
const R = (id, cats) => ({ id, cats });
const ROLE = {
  kick: R('kick', ['kick']), snare: R('snare', ['snare', 'clap']), hat: R('hat', ['hat']), ohat: R('ohat', ['ohat', 'cymbal']),
  perc: R('perc', ['clap', 'perc', 'tom', 'cymbal', 'fx']), mel: R('mel', ['synth', 'bass', 'atmos', 'vox']),
  bass: R('bass', ['bass']), synth: R('synth', ['synth']), tex: R('tex', ['atmos', 'fx', 'vox']),
  dloop: R('dloop', ['dloop']), mloop: R('mloop', ['mloop']), clap: R('clap', ['clap', 'snare']), ptom: R('ptom', ['perc', 'tom', 'cymbal']),
  any: R('any', null),
};

export const LAYOUTS = {
  // Como el pack de fábrica (guía de usuario): páginas 1–6 kits, 7 melódicos, 8 loops + breaks.
  novation: (() => {
    const kit = [ROLE.kick, ROLE.kick, ROLE.snare, ROLE.snare, ROLE.hat, ROLE.hat, ROLE.ohat, ROLE.ohat, ROLE.perc, ROLE.perc, ROLE.perc, ROLE.perc, ROLE.mel, ROLE.mel, ROLE.mel, ROLE.mel];
    const out = [];
    for (let p = 0; p < 6; p++) out.push(...kit);
    for (let i = 0; i < 16; i++) out.push(ROLE.mel);
    for (let i = 0; i < 12; i++) out.push(ROLE.mloop);
    for (let i = 0; i < 4; i++) out.push(ROLE.dloop);
    return out;
  })(),
  // Una página por instrumento: cómodo para elegir sample por pista (pista 1 = kicks…)
  instrument: (() => {
    const out = [];
    const page = (r, n = 16) => { for (let i = 0; i < n; i++) out.push(r); };
    page(ROLE.kick); page(ROLE.clap); page(ROLE.hat, 8); page(ROLE.ohat, 8); page(ROLE.ptom);
    page(ROLE.bass); page(ROLE.synth); page(ROLE.tex); page(ROLE.dloop, 8); page(ROLE.mloop, 8);
    return out;
  })(),
  free: Array.from({ length: SLOTS }, () => ROLE.any),
};
export const LAYOUT_IDS = Object.keys(LAYOUTS);
export const roleOf = (layout, slot) => (LAYOUTS[layout] || LAYOUTS.free)[slot];

export function emptyPack(name = 'Pack', layout = 'instrument') {
  return { id: 'pk_' + Math.random().toString(36).slice(2, 10), name, layout, color: 'orange', slots: Array(SLOTS).fill(null), names: Array(SLOTS).fill(''), bpm: 128, created: Date.now(), updated: Date.now() };
}

// ---------- tiempo ----------
// Los loops no se recortan por defecto: su silencio final es parte del compás (y del Beat Match).
const LOOP_CATS = new Set(['dloop', 'mloop']);
// v1.7: loop / one-shot es un atributo propio, independiente de la categoría (un bajo o un synth pueden ser loop).
// Lo que marques tú (user.kind) manda; si no, es loop si la categoría es de loops o si el nombre o la
// carpeta dicen «loop» sin decir «one shot». El sonido solo da una pista (`soundLoop`), no decide.
export function kindOf(s) {
  const k = s.user && s.user.kind;
  if (k === 'loop' || k === 'oneshot') return k;
  return autoKindOf(s);
}
export function autoKindOf(s) {
  const c = s.cls || s._cls;
  if (!c) return 'oneshot';
  if (LOOP_CATS.has(c.cat)) return 'loop';
  if (!c.textLoop || c.oneshotHint) return 'oneshot';
  // un golpe de menos de 1 s en una carpeta «loops» es un one-shot (un compás a 240 BPM ya dura 1 s)
  if (tooShortForLoop(s) && !c.soundLoop) return 'oneshot';
  return 'loop';
}
export function tooShortForLoop(s) { const a = s.analysis; return !!(a && !a.error && a.activeDur != null && a.activeDur < 1); }
export function isLoopSample(s) { return kindOf(s) === 'loop'; }
export function autoTrimOf(s) { const r = s.recipe || {}; return r.autoTrim != null ? r.autoTrim : !isLoopSample(s); }

// Segundos que ocupará el sample en la Rhythm según su receta (sin remuestrear).
export function sampleSeconds(sample) {
  const r = sample.recipe || {};
  return Math.min(r.maxSec || MAX_SAMPLE_S, rawSeconds(sample));
}
// Lo mismo sin el tope de 30 s (para avisar de lo que se recortaría)
export function rawSeconds(sample) {
  const a = sample.analysis || {};
  const r = sample.recipe || {};
  const auto = autoTrimOf(sample);
  let d = a.dur || 0;
  if (auto && a.activeDur != null) d = a.activeDur; // el análisis usa el mismo recorte automático
  if (r.trimStart != null || r.trimEnd != null) {
    const s = r.trimStart != null ? r.trimStart : (auto ? (a.leadMs || 0) / 1000 : 0);
    const e = r.trimEnd != null ? r.trimEnd : (auto && a.activeDur != null ? (a.leadMs || 0) / 1000 + a.activeDur : a.dur);
    d = Math.max(0, e - s);
  }
  if (r.fitSec) d = r.fitSec;
  // afinado (v2.3): más agudo = más corto, como en un sampler
  return (Math.max(0, d) * keepFraction(r.keep)) / Math.pow(2, (r.tune || 0) / 12);
}
// Loops: tiempos enteros a un BPM → duración exacta para que el Beat Match no cambie el tono
export function fitToBeats(durSec, bpm) {
  if (!durSec || !bpm) return null;
  const beats = Math.max(1, Math.round((durSec * bpm) / 60));
  return { beats, sec: (beats * 60) / bpm, diff: (beats * 60) / bpm - durSec };
}

export function budget(pack, byId) {
  const per = Array(SLOTS).fill(0), pages = Array(8).fill(0);
  let total = 0, used = 0, over30 = [];
  pack.slots.forEach((id, i) => {
    if (!id || !byId[id]) return;
    const s = byId[id];
    const raw = s.analysis ? rawSeconds(s) : 0;
    const sec = sampleSeconds(s);
    per[i] = sec; pages[Math.floor(i / PAGE)] += sec; total += sec; used++;
    if (raw > MAX_SAMPLE_S) over30.push(i);
  });
  return { per, pages, total, used, free: MAX_TOTAL_S - total, over: total > MAX_TOTAL_S, over30 };
}

// ---------- Beat Match (guía de usuario, firmware 2.0) ----------
// La Rhythm estira el sample a una duración de N pasos (4–128) entre la mitad y el doble de la original;
// estirar cambia el tono. Devuelve la opción más cercana al tono original.
export const BEAT_STEPS = [4, 8, 16, 32, 64, 128];
export function beatMatch(durSec, bpm) {
  if (!durSec || !bpm) return null;
  const stepSec = 60 / bpm / 4;
  const natural = durSec / stepSec;
  const opts = [];
  for (const n of BEAT_STEPS) {
    const ratio = (n * stepSec) / durSec;          // >1 = más largo = más grave
    if (ratio < 0.5 || ratio > 2) continue;
    opts.push({ steps: n, ratio, semis: -12 * Math.log2(ratio) });
  }
  if (!opts.length) return { natural, steps: null, semis: null, opts };
  opts.sort((a, b) => Math.abs(a.semis) - Math.abs(b.semis));
  return { natural, ...opts[0], opts };
}

// ---------- nombres ----------
export function safeName(s, max = 32) {
  let t = translit(String(s || '')).replace(/\.(wav|aiff?|aif|mp3|flac|ogg)$/i, '');
  t = t.replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim();
  if (t.length > max) t = t.slice(0, max).trim();
  return t || 'Sample';
}
export function sdFileName(slot, name, sep = '__') {
  const n = slot < 10 ? '0' + slot : String(slot);
  return `${n}${sep}${safeName(name)}.wav`;
}
// Tarjeta SD: carpeta Rhythm/<n>/…; el número decide la posición del pack (0 = segundo pack del equipo).
export function sdPlan(pack, wavBySlot, { packNumber = 0, sep = '__', suffix = '' } = {}) {
  const base = `Rhythm/${packNumber}${suffix ? ' ' + safeName(suffix, 24) : ''}`;
  const files = [
    { name: `${base}/meta/`, data: null }, { name: `${base}/Sessions/`, data: null }, { name: `${base}/PCM/`, data: null },
  ];
  pack.slots.forEach((id, i) => {
    if (!id || !wavBySlot[i]) return;
    files.push({ name: `${base}/PCM/${sdFileName(i, pack.names[i], sep)}`, data: wavBySlot[i] });
  });
  return { base, files };
}

// ---------- pack de Components (.circuitrhythmpack) ----------
// Estructura inferida de packs guardados por Components (proyecto CircuitGM, docs/circuit-rhythm-format.md).
export function emptyProject() {
  const d = new Uint8Array(PROJECT_SIZE);
  d.set([0x49, 0x4e, 0x49, 0x54], 0); // "INIT"
  for (let i = 16; i < 48; i++) d[i] = 0x20;
  return d;
}
export const GRID_FX_DEFAULT = new Uint8Array([0x7f, 0, 0, 0, 0, 0, 0]);

export function componentsFiles(pack, wavBySlot, { projects = null, gridFx = null } = {}) {
  const index = {
    name: safeName(pack.name, 32), color: pack.color || 'orange', product: 'circuit-rhythm', version: '2.0',
    projects: [], samples: [], gridEffects: [],
  };
  const files = [{ name: 'projects/', data: null }];
  const proj = emptyProject();
  for (let i = 0; i < 64; i++) {
    const p = projects && projects[i];
    index.projects.push({ name: p ? p.name : i === 0 ? 'User Session' : '', url: `projects/project_${i}.ncs` });
    files.push({ name: `projects/project_${i}.ncs`, data: p ? p.data : proj });
  }
  files.push({ name: 'samples/', data: null });
  for (let i = 0; i < SLOTS; i++) {
    const has = pack.slots[i] && wavBySlot[i];
    index.samples.push({ name: has ? safeName(pack.names[i]) : '', url: `samples/sample_${i}.wav` });
    if (has) files.push({ name: `samples/sample_${i}.wav`, data: wavBySlot[i] });
  }
  files.push({ name: 'grid_effects/', data: null });
  for (let i = 0; i < 16; i++) {
    const g = gridFx && gridFx[i];
    index.gridEffects.push({ effectType: g ? g.effectType : 127, url: `grid_effects/grid_effect_${i}.grideffect` });
    files.push({ name: `grid_effects/grid_effect_${i}.grideffect`, data: g ? g.data : GRID_FX_DEFAULT });
  }
  files.push({ name: 'index.json', data: JSON.stringify(index) });
  return { files, index };
}

// Uso de samples en los proyectos de un pack (lectura comunitaria del formato .ncs)
export function projectUsage(ncs) {
  const u8 = ncs instanceof Uint8Array ? ncs : new Uint8Array(ncs);
  const magic = String.fromCharCode(...u8.subarray(0, 4));
  if (magic !== 'RUSE' || u8.length < PROJECT_SIZE) return null;
  const name = String.fromCharCode(...u8.subarray(0x10, 0x30)).trim();
  const used = new Map();
  const tail = 0x28ce4;
  for (let t = 0; t < 8; t++) { const s = u8[tail + 8 + t]; if (s < 128) used.set(s, (used.get(s) || 0) + 1); }
  for (let b = 0; b < 64; b++) {
    for (let j = 0; j < 32; j++) {
      const o = 0x2e4 + b * 2600 + j * 8;
      if (u8[o] !== 0 && u8[o + 5] !== 0xff && u8[o + 5] < 128) used.set(u8[o + 5], (used.get(u8[o + 5]) || 0) + 1);
    }
  }
  return { name, tempo: u8[0x34], slots: [...used.keys()].sort((a, b) => a - b) };
}

// ---------- constructor automático ----------
const CERT_RANK = { user: 4, confirmed: 3, onehint: 2, sound: 2, doubt: 0, none: -1 };
export const MIN_CERT = { user: 4, confirmed: 3, onehint: 2, any: 0 };

export function packVec(a) { return vec(a); }
function vec(a) {
  if (!a || !a.bands) return null;
  return [Math.log2((a.activeDur || 0.01) + 0.01) / 5, Math.log2((a.centroid || 100) / 100) / 8, a.bands.sub + a.bands.low, a.bands.high + a.bands.air, a.flatness || 0, a.f0conf > 0.6 ? (a.midi || 0) / 127 : 0];
}
export const SIMILAR = 0.02;
export function featureDistance(a, b) {
  const x = vec(a), y = vec(b);
  if (!x || !y) return 1;
  let s = 0; for (let i = 0; i < x.length; i++) s += (x[i] - y[i]) ** 2;
  return Math.sqrt(s);
}

// samples: [{id, cls:{cat,cert}, rating, fav, discard, analysis, recipe, name, sha, family}]
export function autoBuild(samples, opts = {}) {
  const o = { layout: 'instrument', minCert: 'onehint', budget: MAX_TOTAL_S, loopMaxSec: 8, bpm: 128, keep: null, fill: true, ...opts };
  const layout = LAYOUTS[o.layout] || LAYOUTS.instrument;
  const slots = o.keep ? o.keep.slice() : Array(SLOTS).fill(null);
  const used = new Set(slots.filter(Boolean));
  const usedSha = new Set();
  const byId = Object.fromEntries(samples.map((s) => [s.id, s]));
  for (const id of used) if (byId[id]?.sha) usedSha.add(byId[id].sha);
  let total = slots.reduce((t, id) => t + (id && byId[id] ? sampleSeconds(byId[id]) : 0), 0);
  const minRank = MIN_CERT[o.minCert] ?? 2;
  const pool = samples.filter((s) => !s.discard && s.cls && s.cls.cat && (CERT_RANK[s.cls.cert] ?? -1) >= minRank);
  const report = { placed: 0, kept: used.size, emptyNoCandidates: {}, emptyBudget: 0, emptySimilar: 0, skippedLong: 0 };
  const score = (s, role) => {
    let v = (s.rating || 0) * 2 + (s.fav ? 3 : 0) + (CERT_RANK[s.cls.cert] || 0);
    const sec = sampleSeconds(s);
    const isLoop = role.cats && role.cats.some((c) => c === 'dloop' || c === 'mloop');
    if (isLoop) {
      const bm = beatMatch(sec, o.bpm);
      if (bm && bm.steps) v += Math.max(0, 2 - Math.abs(bm.semis) * 2); else v -= 2;
    } else v -= sec / 2;              // en one-shots, más corto = más barato
    if (role.cats && role.cats[0] === s.cls.cat) v += 1; // categoría principal del papel
    return v;
  };
  // orden de llenado: baterías (baratas) → notas → texturas → loops
  const order = [...Array(SLOTS).keys()].sort((a, b) => prio(layout[a]) - prio(layout[b]) || a - b);
  function prio(r) { const c = r.cats ? r.cats[0] : 'any'; return ['kick', 'snare', 'clap', 'hat', 'ohat'].includes(c) ? 0 : ['perc', 'tom', 'cymbal', 'bass', 'synth'].includes(c) ? 1 : ['atmos', 'fx', 'vox'].includes(c) ? 2 : c === 'any' ? 4 : 3; }
  const chosenByRole = {};
  for (const i of order) {
    if (slots[i]) continue;
    const role = layout[i];
    if (!o.fill && role.id === 'any') continue;
    const cands = pool.filter((s) => !used.has(s.id) && (!s.sha || !usedSha.has(s.sha)) && (!role.cats || role.cats.includes(s.cls.cat)));
    if (!cands.length) { report.emptyNoCandidates[role.id] = (report.emptyNoCandidates[role.id] || 0) + 1; continue; }
    cands.sort((a, b) => score(b, role) - score(a, role));
    let pick = null, why = null;
    for (const c of cands) {
      const sec = sampleSeconds(c);
      const isLoop = c.cls.cat === 'dloop' || c.cls.cat === 'mloop';
      if (isLoop && sec > o.loopMaxSec) { report.skippedLong++; why ||= 'long'; continue; }
      if (total + sec > o.budget) { why = 'budget'; continue; }
      const prev = chosenByRole[role.id] || [];
      if (prev.some((p) => featureDistance(p.analysis, c.analysis) < SIMILAR)) { why ||= 'similar'; continue; } // casi idénticos
      pick = c; break;
    }
    if (!pick) { if (why === 'budget') report.emptyBudget++; else if (why === 'similar') report.emptySimilar++; else report.emptyNoCandidates[role.id] = (report.emptyNoCandidates[role.id] || 0) + 1; continue; }
    slots[i] = pick.id; used.add(pick.id); if (pick.sha) usedSha.add(pick.sha);
    (chosenByRole[role.id] ||= []).push(pick);
    total += sampleSeconds(pick); report.placed++;
  }
  report.total = total;
  return { slots, report };
}

// Nombre corto para la Rhythm a partir del nombre de archivo
export function shortName(name) {
  return safeName(String(name || '').replace(/\.(wav|aiff?|mp3|flac|ogg)$/i, '').replace(/[_]+/g, ' '), 32);
}
