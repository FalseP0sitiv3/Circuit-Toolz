// core/taxonomy.js — v1.4: carpetas y subcarpetas, etiquetas, efectos detectados, palabras del nombre y
// «por parecido» (vecinos más cercanos entre los samples que ya has decidido tú).
// Las propuestas salen del nombre (si dice algo claro) y si no, de lo medido en el audio. Siempre explicadas.
import { tokenize } from './classify.js';

// Subcarpetas por defecto de cada categoría: [id, etiqueta]. Las etiquetas se traducen en la interfaz.
export const SUBTYPES = {
  kick: [['b808', '808 / largos'], ['punch', 'Con pegada'], ['short', 'Secos'], ['dist', 'Distorsionados'], ['rumble', 'Rumble']],
  snare: [['tight', 'Secas'], ['fat', 'Gordas'], ['rim', 'Rimshots'], ['noise', 'Ruidosas'], ['tail', 'Con cola']],
  clap: [['dry', 'Secas'], ['room', 'Con sala'], ['layer', 'En capas'], ['snap', 'Snaps']],
  hat: [['tight', 'Cortos'], ['shaker', 'Shakers'], ['metal', 'Metálicos'], ['dirty', 'Sucios']],
  ohat: [['short', 'Cortos'], ['long', 'Largos'], ['metal', 'Metálicos']],
  cymbal: [['ride', 'Rides'], ['crash', 'Crashes'], ['rev', 'Al revés']],
  tom: [['low', 'Graves'], ['high', 'Agudos'], ['elec', 'Electrónicos']],
  perc: [['wood', 'Madera y clicks'], ['metal', 'Metálicas'], ['shaker', 'Shakers'], ['tonal', 'Tonales'], ['noise', 'Ruido']],
  bass: [['sub', 'Subs'], ['stab', 'Stabs'], ['reese', 'Reese y sucios'], ['acid', 'Acid'], ['drone', 'Notas largas']],
  synth: [['stab', 'Stabs'], ['chord', 'Acordes'], ['lead', 'Leads'], ['pluck', 'Plucks']],
  atmos: [['pad', 'Pads'], ['drone', 'Drones'], ['texture', 'Texturas'], ['field', 'Field recordings']],
  fx: [['riser', 'Subidas'], ['down', 'Bajadas'], ['impact', 'Impactos'], ['noise', 'Ruido'], ['glitch', 'Glitch']],
  vox: [['phrase', 'Frases'], ['chop', 'Chops'], ['shout', 'Gritos y efectos']],
  dloop: [['full', 'Completos'], ['top', 'Tops'], ['perc', 'Percusión'], ['break', 'Breaks']],
  mloop: [['bass', 'Bajo'], ['synth', 'Synth'], ['chord', 'Acordes'], ['texture', 'Texturas']],
};

// Paleta rápida de etiquetas: grupos con las más usadas. El usuario la amplía o la recorta.
export const TAG_PALETTE = {
  fx: ['Reverb', 'Delay', 'Distorsión', 'Filtrado', 'Reverse', 'Lo-fi', 'Sidechain'],
  char: ['Oscuro', 'Brillante', 'Seco', 'Sucio', 'Analógico', 'Metálico', 'Orgánico', 'Industrial'],
  use: ['Intros', 'Breaks', 'Drops', 'Fills', 'Transición', 'Capa'],
};
export const PALETTE_GROUPS = ['fx', 'char', 'use'];

// ---------- taxonomía editable ----------
// tax: { [cat]: [{ id, label, user? }] } guardada en los ajustes; sin tocar = la de fábrica
export function taxonomy(tax, cat) {
  if (tax && Array.isArray(tax[cat])) return tax[cat];
  return (SUBTYPES[cat] || []).map(([id, label]) => ({ id, label }));
}
const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 24) || 'sub';
function own(tax, cat) { const t = { ...(tax || {}) }; t[cat] = taxonomy(tax, cat).map((x) => ({ ...x })); return t; }
export function addSubfolder(tax, cat, label) {
  const t = own(tax, cat); const name = String(label || '').trim().slice(0, 32); if (!name) return { tax: t, id: null };
  const found = t[cat].find((x) => x.label.toLowerCase() === name.toLowerCase()); if (found) return { tax: t, id: found.id };
  let id = slug(name), k = 2; while (t[cat].some((x) => x.id === id)) id = slug(name) + k++;
  t[cat].push({ id, label: name, user: true });
  return { tax: t, id };
}
export function renameSubfolder(tax, cat, id, label) { const t = own(tax, cat); const x = t[cat].find((y) => y.id === id); if (x && String(label).trim()) x.label = String(label).trim().slice(0, 32); return t; }
export function moveSubfolder(tax, cat, id, d) { const t = own(tax, cat); const i = t[cat].findIndex((y) => y.id === id), j = i + d; if (i >= 0 && j >= 0 && j < t[cat].length) [t[cat][i], t[cat][j]] = [t[cat][j], t[cat][i]]; return t; }
export function removeSubfolder(tax, cat, id) { const t = own(tax, cat); t[cat] = t[cat].filter((y) => y.id !== id); return t; }
export function resetTax(tax, cat) { const t = { ...(tax || {}) }; delete t[cat]; return t; }
export function subLabelOf(tax, cat, id) { const x = taxonomy(tax, cat).find((y) => y.id === id); return x ? x.label : null; }

// ---------- propuesta de subcarpeta ----------
// Del nombre primero (lo que pone manda), luego del sonido. Devuelve { id, why, src: 'name'|'sound' } o null.
const TEXT_SUB = {
  kick: { b808: ['808', 'sub', 'subkick', 'boom', 'long'], dist: ['dist', 'distorted', 'drive', 'driven', 'hard', 'hardcore', 'gabber', 'saturated', 'crushed'], rumble: ['rumble', 'rmbl'], short: ['short', 'tight', 'dry', 'click'], punch: ['punch', 'punchy'] },
  snare: { rim: ['rim', 'rimshot', 'rimshots', 'rs', 'sidestick', 'stick'], tail: ['verb', 'reverb', 'room', 'long', 'tail'], noise: ['noise', 'noisy', 'white'], tight: ['tight', 'short', 'dry'], fat: ['fat', 'big', 'heavy'] },
  clap: { snap: ['snap', 'snaps', 'finger', 'fingersnap'], room: ['verb', 'reverb', 'room', 'hall', 'long'], layer: ['layer', 'layered', 'group', 'crowd', 'stack'], dry: ['dry', 'short', 'tight'] },
  hat: { shaker: ['shaker', 'shake', 'shk', 'maraca', 'maracas', 'cabasa'], metal: ['metal', 'metallic', 'ring', 'fm'], dirty: ['dirty', 'dist', 'lofi', 'crushed', 'noise'], tight: ['tight', 'short', 'closed'] },
  ohat: { long: ['long'], short: ['short'], metal: ['metal', 'metallic'] },
  cymbal: { ride: ['ride', 'rd', 'bell'], crash: ['crash', 'splash', 'china'], rev: ['rev', 'reverse', 'reversed', 'swell'] },
  tom: { elec: ['808', '909', 'simmons', 'synth', 'elec', 'electronic'], low: ['low', 'floor', 'lo'], high: ['high', 'hi', 'rack'] },
  perc: { wood: ['wood', 'block', 'woodblock', 'click', 'clave', 'claves', 'knock', 'rim'], metal: ['metal', 'metallic', 'bell', 'cowbell', 'cow', 'agogo', 'anvil', 'pipe'], shaker: ['shaker', 'shake', 'tamb', 'tambourine', 'maraca', 'cabasa'], tonal: ['conga', 'bongo', 'tabla', 'tonal', 'pitched', 'marimba'], noise: ['noise', 'glitch', 'zap'] },
  bass: { sub: ['sub', 'subbass', '808'], acid: ['acid', '303', 'tb303', 'squelch'], reese: ['reese', 'dist', 'distorted', 'growl', 'dirty', 'grit'], stab: ['stab', 'short', 'pluck', 'hit'], drone: ['drone', 'long', 'sustain', 'held'] },
  synth: { chord: ['chord', 'chords', 'chd', 'chrd', 'maj', 'min', 'min7', 'maj7'], stab: ['stab', 'stabs', 'hit'], pluck: ['pluck', 'plucks', 'pling'], lead: ['lead', 'ld', 'arp', 'line', 'riff'] },
  atmos: { pad: ['pad', 'pads'], drone: ['drone', 'drones'], texture: ['texture', 'tex', 'noise', 'granular', 'grain'], field: ['field', 'foley', 'rain', 'city', 'street', 'nature', 'birds', 'ambience', 'amb', 'room'] },
  fx: { riser: ['riser', 'rise', 'up', 'uplifter', 'sweepup', 'build'], down: ['down', 'downlifter', 'fall', 'drop', 'sweepdown'], impact: ['impact', 'hit', 'boom', 'slam', 'crash'], noise: ['noise', 'white', 'sweep'], glitch: ['glitch', 'stutter', 'zap', 'laser', 'blip'] },
  vox: { phrase: ['phrase', 'vocal', 'spoken', 'speech', 'word', 'words'], chop: ['chop', 'chops', 'cut', 'slice'], shout: ['shout', 'yeah', 'hey', 'scream', 'breath', 'fx'] },
  dloop: { top: ['top', 'tops', 'toploop', 'hats', 'hat'], break: ['break', 'breaks', 'breakbeat', 'amen', 'jungle'], perc: ['perc', 'percussion', 'conga', 'bongo', 'shaker'], full: ['full', 'drum', 'drums', 'beat'] },
  mloop: { bass: ['bass', 'bassline', 'sub'], chord: ['chord', 'chords', 'keys', 'piano'], texture: ['texture', 'atmos', 'pad', 'ambient', 'drone'], synth: ['synth', 'lead', 'arp', 'melody', 'riff', 'seq'] },
};
export function nameTokens(s) { return new Set([...tokenize(s.name || ''), ...tokenize(String(s.path || '').split('/').slice(-2, -1)[0] || '')]); }

export function proposeSub(s, cat, tax = null) {
  if (!cat) return null;
  const ids = new Set(taxonomy(tax, cat).map((x) => x.id));
  const toks = nameTokens(s);
  const ts = TEXT_SUB[cat] || {};
  for (const [id, words] of Object.entries(ts)) { const w = words.find((x) => toks.has(x)); if (w && ids.has(id)) return { id, src: 'name', why: `«${w}»` }; }
  // texto que coincide con una subcarpeta tuya (por su nombre)
  for (const x of taxonomy(tax, cat)) { const lw = x.label.toLowerCase().split(/[^a-z0-9áéíóúñ]+/).filter((w) => w.length >= 3); const w = lw.find((y) => toks.has(y) || toks.has(y.replace(/s$/, ''))); if (w) return { id: x.id, src: 'name', why: `«${w}»` }; }
  const r = soundSub(s.analysis, cat);
  return r && ids.has(r.id) ? { ...r, src: 'sound' } : null;
}
// Reglas sobre lo medido. why: clave de texto + valor (la interfaz lo traduce)
function soundSub(a, cat) {
  if (!a || !a.bands || a.error) return null;
  const b = a.bands, d = a.activeDur || 0, low = b.sub + b.low, hi = b.high + b.air, fl = a.flatness || 0;
  const tail = a.t40 != null ? a.t40 : d * 1000;
  const R = (id, why) => ({ id, why });
  switch (cat) {
    case 'kick':
      if (fl > 0.14 && hi > 0.12) return R('dist', 'ruido y agudos');
      if (tail > 550 || (d > 0.6 && a.f0conf > 0.5)) return R('b808', 'cola larga con tono');
      if (d < 0.25 || tail < 180) return R('short', 'muy corto');
      if (d > 0.45 && b.sub > 0.35 && fl > 0.05) return R('rumble', 'grave largo y sucio');
      return R('punch', 'ataque y cuerpo');
    case 'snare':
      if (tail > 420 || d > 0.55) return R('tail', 'cola larga');
      if (fl > 0.42) return R('noise', 'mucho ruido');
      if (d < 0.18) return R('tight', 'muy corto');
      if (b.lowmid + b.low > 0.35) return R('fat', 'cuerpo en medios-graves');
      return R('tight', 'corto');
    case 'clap':
      if (tail > 350 || d > 0.5) return R('room', 'cola larga');
      if ((a.bursts || 0) >= 3) return R('layer', 'varias ráfagas');
      if (d < 0.12) return R('snap', 'muy corto');
      return R('dry', 'corto');
    case 'hat':
      if ((a.onsets || 0) >= 3 || (a.attackMs > 15 && d > 0.15)) return R('shaker', 'ataque suave o varios golpes');
      if (fl < 0.2 || a.f0conf > 0.45) return R('metal', 'tono metálico');
      if (a.centroid < 5500 && fl > 0.35) return R('dirty', 'ruido oscuro');
      return R('tight', 'corto y brillante');
    case 'ohat':
      if (fl < 0.2 || a.f0conf > 0.45) return R('metal', 'tono metálico');
      return d > 0.6 ? R('long', 'cola larga') : R('short', 'cola corta');
    case 'cymbal':
      if (a.attackMs > 120) return R('rev', 'ataque lento');
      return d > 1.6 && fl > 0.3 ? R('crash', 'larga y ruidosa') : R('ride', 'definida');
    case 'tom':
      if (a.f0conf > 0.7 && fl < 0.05 && a.sustainDb > -14) return R('elec', 'tono puro');
      return a.f0 && a.f0 < 120 ? R('low', 'tono grave') : R('high', 'tono agudo');
    case 'perc':
      if (a.f0conf > 0.65 && fl < 0.1) return R('tonal', 'tono claro');
      if ((a.onsets || 0) >= 3 || (a.attackMs > 15 && fl > 0.3)) return R('shaker', 'ataque suave o varios golpes');
      if (fl > 0.45) return R('noise', 'mucho ruido');
      if (a.centroid > 3500 && fl < 0.25) return R('metal', 'brillante y con tono');
      return R('wood', 'corto y seco');
    case 'bass':
      if (fl > 0.12 || hi > 0.15) return R('reese', 'armónicos y suciedad');
      if (d > 1.5 && a.sustainDb > -8) return R('drone', 'nota sostenida');
      if (d < 0.45) return R('stab', 'nota corta');
      if (b.sub > 0.45 && a.centroid < 250) return R('sub', 'casi todo sub');
      return R('sub', 'grave limpio');
    case 'synth':
      if (a.chordLike) return R('chord', 'varias notas a la vez');
      if (d < 0.35 && a.attackMs < 10) return R('pluck', 'ataque rápido y corto');
      if (d < 0.7) return R('stab', 'corto');
      return R('lead', 'nota sostenida');
    case 'atmos':
      if (fl > 0.45) return R('texture', 'mucho ruido');
      if (low > 0.5) return R('drone', 'grave sostenido');
      if ((a.onsets || 0) >= 6 && fl > 0.25) return R('field', 'eventos irregulares');
      return R('pad', 'tonal y largo');
    case 'fx':
      if (a.brightTrend > 0.15 && d > 0.8) return R('riser', 'el brillo sube');
      if (a.brightTrend < -0.15 && d > 0.8) return R('down', 'el brillo baja');
      if (a.attackMs < 10 && low > 0.25) return R('impact', 'golpe con grave');
      if (fl > 0.5) return R('noise', 'mucho ruido');
      return R('glitch', 'corto y raro');
    case 'vox':
      if (d > 1.5) return R('phrase', 'largo');
      if (fl > 0.3) return R('shout', 'ruidoso');
      return R('chop', 'corto');
    case 'dloop':
      if (low < 0.12) return R('top', 'casi sin graves');
      if ((a.onsetRegularity || 1) < 0.45) return R('break', 'golpes irregulares');
      return R('full', 'graves y agudos');
    case 'mloop':
      if (low > 0.5) return R('bass', 'sobre todo graves');
      if (fl > 0.3) return R('texture', 'mucho ruido');
      if (a.chordLike) return R('chord', 'varias notas a la vez');
      return R('synth', 'línea tonal');
  }
  return null;
}

// ---------- efectos y carácter detectados ----------
const FX_WORDS = {
  Reverb: ['reverb', 'verb', 'rvb', 'hall', 'plate', 'room', 'wet', 'space', 'spring'],
  Delay: ['delay', 'dly', 'echo', 'echoes', 'dub', 'tape', 'pingpong'],
  'Distorsión': ['dist', 'distorted', 'distortion', 'drive', 'driven', 'overdrive', 'fuzz', 'saturated', 'sat', 'crush', 'crushed', 'bitcrush', 'clip'],
  Filtrado: ['filter', 'filtered', 'filt', 'lpf', 'hpf', 'bpf', 'sweep'],
  Reverse: ['rev', 'reverse', 'reversed', 'backwards', 'rvs'],
  'Lo-fi': ['lofi', 'vinyl', 'crackle', 'cassette', 'tape', 'sp1200', 'mpc'],
  Sidechain: ['sidechain', 'pump', 'pumping', 'ducked'],
  Oscuro: ['dark', 'deep', 'oscuro'], Brillante: ['bright', 'shiny'], Seco: ['dry'], Sucio: ['dirty', 'grit', 'gritty', 'raw'],
  'Analógico': ['analog', 'analogue', 'modular', 'moog', 'tr808', 'tr909'], 'Metálico': ['metal', 'metallic'], Industrial: ['industrial', 'factory', 'machine'],
};
const DRUMS = new Set(['kick', 'snare', 'clap', 'hat', 'ohat', 'tom', 'perc']);
const TAIL_LONG = { kick: 800, snare: 600, clap: 550, hat: 350, ohat: 1400, tom: 900, perc: 600 };
// [{ tag, src: 'name'|'sound', why }]
export function detectTags(s, cat) {
  const out = [], toks = nameTokens(s), seen = new Set();
  const add = (tag, src, why) => { if (!seen.has(tag)) { seen.add(tag); out.push({ tag, src, why }); } };
  for (const [tag, words] of Object.entries(FX_WORDS)) { const w = words.find((x) => toks.has(x)); if (w) add(tag, 'name', `«${w}»`); }
  const a = s.analysis;
  if (a && a.bands && !a.error) {
    const tail = a.t40 != null ? a.t40 : (a.activeDur || 0) * 1000;
    if (DRUMS.has(cat) && tail > (TAIL_LONG[cat] || 700) && (a.sustainDb == null || a.sustainDb < -4)) add('Reverb', 'sound', 'cola larga');
    if (DRUMS.has(cat) && a.attackMs > 120) add('Reverse', 'sound', 'ataque lento');
    if ((cat === 'kick' || cat === 'bass') && (a.flatness || 0) > 0.14) add('Distorsión', 'sound', 'ruido y armónicos');
    const lowish = a.bands.sub + a.bands.low + a.bands.lowmid;
    if (a.centroid < 900 && lowish > 0.7 && !['kick', 'bass'].includes(cat)) add('Oscuro', 'sound', 'pocos agudos');
    if (a.centroid > 6000 && !['hat', 'ohat', 'cymbal'].includes(cat)) add('Brillante', 'sound', 'muchos agudos');
  }
  return out;
}

// ---------- palabras del nombre (para filtrar) ----------
const STOP = new Set(['the', 'and', 'wav', 'aif', 'aiff', 'mp3', 'flac', 'ogg', 'sample', 'samples', 'one', 'shot', 'oneshot', 'loop', 'loops', 'bpm', 'key', 'kit', 'pack', 'vol', 'copy', 'final', 'new', 'mix', 'master', 'stereo', 'mono']);
export function wordsOf(s) {
  const w = new Set();
  for (const x of tokenize(s.name || '')) if (x.length >= 3 && !/^\d+$/.test(x) && !STOP.has(x) && !/^\d+bpm$/.test(x)) w.add(x);
  return w;
}
// palabras más frecuentes de una lista (al menos en 2 samples y no en todos)
export function wordIndex(list, max = 24) {
  const n = new Map();
  for (const s of list) for (const x of wordsOf(s)) n.set(x, (n.get(x) || 0) + 1);
  return [...n].filter(([, c]) => c >= 2 && c < list.length).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max);
}

// ---------- por parecido: k vecinos más cercanos entre lo que ya decidiste ----------
// labeled: [{ id, cat, sub, v }] · item: { id, v } · dist(v1, v2)
export function neighbourGuess(item, labeled, { k = 7, dist } = {}) {
  if (!item.v || labeled.length < 3) return null;
  const best = [];
  for (const L of labeled) {
    if (L.id === item.id || !L.v) continue;
    const d = dist(item.v, L.v);
    if (best.length < k || d < best[best.length - 1].d) { best.push({ L, d }); best.sort((p, q) => p.d - q.d); if (best.length > k) best.pop(); }
  }
  if (!best.length) return null;
  const w = {}; let tot = 0;
  for (const { L, d } of best) { const x = 1 / (d + 0.03); w[L.cat] = (w[L.cat] || 0) + x; tot += x; }
  const [cat, wc] = Object.entries(w).sort((a, b) => b[1] - a[1])[0];
  const sw = {}; let st = 0;
  for (const { L, d } of best) if (L.cat === cat && L.sub) { const x = 1 / (d + 0.03); sw[L.sub] = (sw[L.sub] || 0) + x; st += x; }
  const sub = st ? Object.entries(sw).sort((a, b) => b[1] - a[1])[0] : null;
  return { cat, conf: wc / tot, n: best.filter((x) => x.L.cat === cat).length, near: best[0].d, sub: sub ? sub[0] : null, subConf: sub ? sub[1] / tot : 0, ids: best.map((x) => x.L.id) };
}
export const vecDist = (x, y) => { let s = 0; for (let i = 0; i < x.length; i++) s += (x[i] - y[i]) ** 2; return Math.sqrt(s); };
