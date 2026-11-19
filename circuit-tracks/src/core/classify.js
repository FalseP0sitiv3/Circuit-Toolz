// Clasificación explicable: texto (nombre interno, archivo, carpeta, banco) + rasgos de síntesis
// + reglas aprendidas del usuario. No asigna porcentajes: suma puntos con desglose visible y
// traduce el resultado a un nivel de certeza cualitativo.
import { analyze, hasFeature } from './patch.js';
import { measuredFeatures } from './acoustic.js';

export const CATEGORIES = [
  { id: 'bass', label: 'Bass', kind: 'timbre' }, { id: 'lead', label: 'Lead', kind: 'timbre' },
  { id: 'keys', label: 'Keys', kind: 'timbre' }, { id: 'chords', label: 'Chords', kind: 'timbre' },
  { id: 'pad', label: 'Pad', kind: 'timbre' }, { id: 'pluck', label: 'Pluck', kind: 'timbre' },
  { id: 'stab', label: 'Stab', kind: 'timbre' }, { id: 'brass', label: 'Brass', kind: 'timbre' },
  { id: 'strings', label: 'Strings', kind: 'timbre' }, { id: 'bell', label: 'Bell / Mallet', kind: 'timbre' },
  { id: 'perc', label: 'Percussive Synth', kind: 'timbre' }, { id: 'fx', label: 'FX', kind: 'timbre' },
  { id: 'drone', label: 'Drone / Texture', kind: 'timbre' }, { id: 'transition', label: 'Transition', kind: 'timbre' },
  { id: 'arp', label: 'Arpeggio', kind: 'usage' }, { id: 'sequence', label: 'Sequenced Synth', kind: 'usage' },
  { id: 'other', label: 'Other / Unclassified', kind: 'none' }
];
export const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));
// Subcarpetas por categoría (las que trae la herramienta). Cada usuario puede renombrarlas, quitarlas o añadir
// las suyas (settings.subfolders); los identificadores de estas no cambian, así que las fichas guardadas siguen valiendo.
export const SUBTYPES = {
  bass: { sub: 'Subs', rolling: 'Rolling', groovy: 'Groovy', acid: 'Acid', reese: 'Reese', wobble: 'Wobble', pluck: 'Plucky', dist: 'Distorted', fm: 'FM - Metallic', drone: 'Drones', b808: '808' },
  lead: { mono: 'Mono', poly: 'Poly', acid: 'Acid', sync: 'Sync', saw: 'Supersaw', soft: 'Soft' },
  keys: { organ: 'Organ', epiano: 'E-Piano', piano: 'Piano', clav: 'Clav' },
  chords: { stab: 'Stab chords', dub: 'Dub chords', pad: 'Pad chords' },
  pad: { warm: 'Warm', dark: 'Dark', evolving: 'Evolving', airy: 'Airy' },
  pluck: { short: 'Short', bell: 'Bell-like', soft: 'Soft' },
  stab: { rave: 'Rave - Hoover', chord: 'Chord stabs', dub: 'Dub stabs' },
  fx: { riser: 'Risers', sweep: 'Sweeps', impact: 'Impacts', noise: 'Noise', zap: 'Zaps - Lasers' },
  drone: { dark: 'Dark', texture: 'Textures', atmos: 'Atmospheres', noise: 'Noise beds' },
  perc: { kick: 'Kicks', snare: 'Snares - Claps', hat: 'Hats', tom: 'Toms', metal: 'Metallic' },
  transition: { riser: 'Risers', down: 'Downlifters' }
};
// Taxonomía efectiva: la del usuario si la ha tocado; si no, la de la herramienta. → { cat: [{ id, label }] }
export function taxonomy(user = {}) {
  const out = {};
  for (const c of CATEGORIES) out[c.id] = Array.isArray(user[c.id]) ? user[c.id].map((x) => ({ ...x })) : Object.entries(SUBTYPES[c.id] || {}).map(([id, label]) => ({ id, label }));
  return out;
}
export function subLabelOf(tax, cat, sub) { if (!cat || !sub) return null; return tax?.[cat]?.find((x) => x.id === sub)?.label || SUBTYPES[cat]?.[sub] || null; }
export const DESCRIPTORS = ['Dark', 'Warm', 'Bright', 'Deep', 'Punchy', 'Soft', 'Cold', 'Metallic', 'Digital', 'Analog', 'Distorted', 'Hypnotic', 'Aggressive', 'Dry', 'Wide', 'Vintage', 'Glassy', 'Acidic', 'Ambient'];

// Léxico por secuencias de tokens; las coincidencias más largas consumen sus tokens primero.
// w = multiplicador de fiabilidad del término (abreviaturas ambiguas < 1).
const L = (seq, out) => ({ seq: seq.split(' '), ...out });
export const LEXICON = [
  L('sub bass', { cat: 'bass', sub: 'sub' }), L('subbass', { cat: 'bass', sub: 'sub' }), L('acid bass', { cat: 'bass', sub: 'acid', desc: 'Acidic' }),
  L('reese bass', { cat: 'bass', sub: 'reese' }), L('reese', { cat: 'bass', sub: 'reese' }), L('reece', { cat: 'bass', sub: 'reese' }), L('wobble bass', { cat: 'bass', sub: 'wobble' }),
  L('wobble', { cat: 'bass', sub: 'wobble', w: 0.8 }), L('wob', { cat: 'bass', sub: 'wobble', w: 0.6 }), L('wooble', { cat: 'bass', sub: 'wobble', w: 0.8 }), L('woble', { cat: 'bass', sub: 'wobble', w: 0.8 }), L('wub', { cat: 'bass', sub: 'wobble', w: 0.6 }),
  L('rolling bass', { cat: 'bass', sub: 'rolling' }), L('bass line', { cat: 'bass', use: 'sequence' }), L('bassline', { cat: 'bass', use: 'sequence' }),
  L('bass', { cat: 'bass' }), L('basses', { cat: 'bass' }), L('bss', { cat: 'bass', w: 0.8 }), L('bs', { cat: 'bass', w: 0.5 }),
  L('sub', { cat: 'bass', sub: 'sub', w: 0.6 }), L('acid', { cat: 'bass', sub: 'acid', desc: 'Acidic', w: 0.6 }), L('303', { cat: 'bass', sub: 'acid', desc: 'Acidic', w: 0.6 }), L('tb', { cat: 'bass', sub: 'acid', w: 0.5 }), L('808', { cat: 'bass', sub: 'b808', w: 0.8 }),
  L('synth brass', { cat: 'brass' }), L('brass', { cat: 'brass' }), L('horn', { cat: 'brass' }), L('horns', { cat: 'brass' }),
  L('lead', { cat: 'lead' }), L('leads', { cat: 'lead' }), L('ld', { cat: 'lead', w: 0.6 }), L('solo', { cat: 'lead', w: 0.6 }),
  L('keys', { cat: 'keys' }), L('keyboard', { cat: 'keys' }), L('piano', { cat: 'keys', sub: 'piano' }), L('e piano', { cat: 'keys', sub: 'epiano' }),
  L('epiano', { cat: 'keys', sub: 'epiano' }), L('rhodes', { cat: 'keys', sub: 'epiano' }), L('wurli', { cat: 'keys', sub: 'epiano' }), 
  L('chord', { cat: 'chords' }), L('chords', { cat: 'chords' }), L('chrd', { cat: 'chords', w: 0.8 }), L('chd', { cat: 'chords', w: 0.6 }),
  L('pad', { cat: 'pad' }), L('pads', { cat: 'pad' }),
  L('pluck', { cat: 'pluck' }), L('plucks', { cat: 'pluck' }), L('plucked', { cat: 'pluck' }), L('plk', { cat: 'pluck', w: 0.8 }),
  L('stab', { cat: 'stab' }), L('stabs', { cat: 'stab' }), L('stb', { cat: 'stab', w: 0.6 }),
  L('strings', { cat: 'strings' }), L('string', { cat: 'strings' }), L('str', { cat: 'strings', w: 0.4 }),
  L('bell', { cat: 'bell' }), L('bells', { cat: 'bell' }), L('mallet', { cat: 'bell' }), L('marimba', { cat: 'bell' }), L('vibes', { cat: 'bell', w: 0.6 }), L('glock', { cat: 'bell' }),
  L('perc', { cat: 'perc' }), L('percussion', { cat: 'perc' }), L('hit', { cat: 'perc', w: 0.7 }), L('hits', { cat: 'perc', w: 0.6 }), 
  L('fx', { cat: 'fx' }), L('sfx', { cat: 'fx' }), L('effect', { cat: 'fx' }), L('effects', { cat: 'fx' }), L('sweep', { cat: 'fx', sub: 'sweep' }), L('impact', { cat: 'fx', sub: 'impact' }),
  L('riser', { cat: 'transition', sub: 'riser' }), L('uplifter', { cat: 'transition' }), L('transition', { cat: 'transition' }), L('build', { cat: 'transition', w: 0.5 }),
  L('drone', { cat: 'drone' }), L('txt', { cat: 'drone', w: 0.5 }), L('soundscape', { cat: 'drone' }),
  L('arp', { cat: 'arp' }), L('arps', { cat: 'arp' }), L('arpeggio', { cat: 'arp' }), L('arpeggiated', { cat: 'arp' }),
  L('seq', { cat: 'sequence' }), L('sequence', { cat: 'sequence' }), L('sequenced', { cat: 'sequence' }), L('sq', { cat: 'sequence', w: 0.5 }),
  // v2.8: subcarpetas y variantes de nombre habituales
  L('groovy', { cat: 'bass', sub: 'groovy', w: 0.9 }), L('groove', { cat: 'bass', sub: 'groovy', w: 0.4 }), L('funk', { cat: 'bass', sub: 'groovy', w: 0.5 }), L('funky', { cat: 'bass', sub: 'groovy', w: 0.8 }),
  L('rolling', { cat: 'bass', sub: 'rolling', w: 0.9 }), L('roller', { cat: 'bass', sub: 'rolling', w: 0.5 }), L('drone bass', { cat: 'bass', sub: 'drone' }), L('pluck bass', { cat: 'bass', sub: 'pluck' }),
  L('fm bass', { cat: 'bass', sub: 'fm' }), L('dist bass', { cat: 'bass', sub: 'dist' }), L('distorted bass', { cat: 'bass', sub: 'dist' }), L('808 bass', { cat: 'bass', sub: 'b808' }), L('mid bass', { cat: 'bass' }),
  L('sync lead', { cat: 'lead', sub: 'sync' }), L('supersaw', { cat: 'lead', sub: 'saw' }), L('super saw', { cat: 'lead', sub: 'saw' }), L('saw lead', { cat: 'lead', sub: 'saw' }), L('acid lead', { cat: 'lead', sub: 'acid' }),
  L('hoover', { cat: 'stab', sub: 'rave' }), L('rave', { cat: 'stab', sub: 'rave', w: 0.6 }), L('dub chord', { cat: 'chords', sub: 'dub' }), L('dub chords', { cat: 'chords', sub: 'dub' }), L('dub stab', { cat: 'stab', sub: 'dub' }), L('chord stab', { cat: 'stab', sub: 'chord' }),
  L('clav', { cat: 'keys', sub: 'clav' }), L('clavinet', { cat: 'keys', sub: 'clav' }), L('organ', { cat: 'keys', sub: 'organ' }),
  L('evolving', { cat: 'pad', sub: 'evolving', w: 0.8 }), L('airy', { cat: 'pad', sub: 'airy', w: 0.8 }), L('air pad', { cat: 'pad', sub: 'airy' }), L('warm pad', { cat: 'pad', sub: 'warm', desc: 'Warm' }), L('dark pad', { cat: 'pad', sub: 'dark', desc: 'Dark' }),
  L('zap', { cat: 'fx', sub: 'zap', w: 0.7 }), L('laser', { cat: 'fx', sub: 'zap' }), L('noise', { cat: 'fx', sub: 'noise', w: 0.5 }), L('downlifter', { cat: 'transition', sub: 'down' }), L('down lifter', { cat: 'transition', sub: 'down' }),
  L('kick', { cat: 'perc', sub: 'kick' }), L('snare', { cat: 'perc', sub: 'snare' }), L('clap', { cat: 'perc', sub: 'snare' }), L('hat', { cat: 'perc', sub: 'hat', w: 0.7 }), L('hihat', { cat: 'perc', sub: 'hat' }), L('hi hat', { cat: 'perc', sub: 'hat' }), L('tom', { cat: 'perc', sub: 'tom', w: 0.7 }),
  L('texture', { cat: 'drone', sub: 'texture' }), L('atmo', { cat: 'drone', sub: 'atmos', desc: 'Ambient' }), L('atmos', { cat: 'drone', sub: 'atmos', desc: 'Ambient' }), L('atmosphere', { cat: 'drone', sub: 'atmos', desc: 'Ambient' }),
  // Descriptores declarados (no implican nada sobre el sonido real).
  ...[['dark', 'Dark'], ['darker', 'Dark'], ['shadow', 'Dark'], ['warm', 'Warm'], ['lush', 'Warm'], ['bright', 'Bright'], ['shiny', 'Bright'], ['deep', 'Deep'],
    ['punchy', 'Punchy'], ['punch', 'Punchy'], ['soft', 'Soft'], ['mellow', 'Soft'], ['cold', 'Cold'], ['icy', 'Cold'], ['metal', 'Metallic'], ['metallic', 'Metallic'],
    ['digital', 'Digital'], ['analog', 'Analog'], ['analogue', 'Analog'], ['dist', 'Distorted'], ['distorted', 'Distorted'], ['fuzz', 'Distorted'], ['dirty', 'Distorted'], ['driven', 'Distorted'],
    ['hypnotic', 'Hypnotic'], ['hypno', 'Hypnotic'], ['aggressive', 'Aggressive'], ['hard', 'Aggressive'], ['harsh', 'Aggressive'], ['dry', 'Dry'], ['wide', 'Wide'],
    ['vintage', 'Vintage'], ['retro', 'Vintage'], ['tape', 'Vintage'], ['glass', 'Glassy'], ['glassy', 'Glassy'], ['ambient', 'Ambient']].map(([t, d]) => L(t, { desc: d }))
].sort((a, b) => b.seq.length - a.seq.length);

const STOP = new Set(['the', 'and', 'of', 'a', 'my', 'new', 'patch', 'patches', 'synth', 'init', 'initial', 'circuit', 'tracks', 'novation', 'syx', 'sysex', 'copy', 'copia', 'alt', 'var', 'version', 'final', 'test']);

// Normaliza y tokeniza: separa camelCase, letras/dígitos, guiones, puntos y subrayados.
export function tokenize(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2').replace(/(\d)([A-Za-z])/g, '$1 $2')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
    // Las cifras "303" se mantienen; los números de versión sueltos se descartan.
    .filter((t) => t === '303' || !/^\d+$/.test(t));
}

// Nombre base para agrupar variantes: elimina sufijos de versión, numeración y copias.
export function baseName(text) {
  let s = String(text || '').replace(/\.[a-z0-9]{2,6}$/i, ''), prev;
  do { prev = s; s = s.replace(/[\s_\-]*(\(\d+\)|copy|copia|alt\d*|var\d*|v\d+|ver\d+|\d+|[a-c])$/i, ''); } while (s !== prev && s.length > 2);
  return tokenize(s || prev).join(' ');
}

export function matchText(text) {
  const toks = tokenize(text), used = new Array(toks.length).fill(false), hits = [];
  for (const entry of LEXICON) {
    const n = entry.seq.length;
    for (let i = 0; i + n <= toks.length; i++) {
      let ok = true;
      for (let j = 0; j < n; j++) if (used[i + j] || toks[i + j] !== entry.seq[j]) { ok = false; break; }
      if (!ok) continue;
      for (let j = 0; j < n; j++) used[i + j] = true;
      hits.push({ term: entry.seq.join(' '), cat: entry.cat, sub: entry.sub, desc: entry.desc, use: entry.use, w: entry.w ?? 1 });
    }
  }
  const unknown = toks.filter((t, i) => !used[i] && t.length >= 3 && !STOP.has(t));
  return { tokens: toks, hits, unknown };
}

// Pesos de cada fuente textual (documentados y ajustables).
export const SOURCE_WEIGHTS = { internal: 3, file: 3, folder: 2, parentFolder: 1, bank: 1, rule: 4, nvcat: 2, measured: 2.5 };

// ctx: { payload, fileName, folderPath, bankName, rules[], acoustic{desc} }
export function classify(ctx) {
  const out = { category: null, subtype: null, usage: [], descriptors: [], measured: [], techTags: [], evidence: [], contradictions: [], pending: [], scores: {}, certainty: 'none', unknownTokens: [] };
  const an = ctx.payload ? analyze(ctx.payload) : null;
  const add = (cat, pts, source, why, sub) => {
    out.scores[cat] = (out.scores[cat] || 0) + pts;
    out.evidence.push({ cat, sub, pts: Math.round(pts * 10) / 10, source, why });
  };
  // 1) Fuentes textuales; textos idénticos cuentan una sola vez.
  const internal = an ? an.decoded.name : '';
  const file = String(ctx.fileName || '').replace(/\.[^.]+$/, '');
  const folders = String(ctx.folderPath || '').split(/[\\/]/).map((s) => s.trim()).filter(Boolean);
  const texts = [];
  const seen = new Set();
  // Textos iguales salvo sufijos de versión («Acid Line» / «Acid Line v2») cuentan como una sola fuente.
  const pushText = (text, source, weight) => { const k = baseName(text) || tokenize(text).join(' '); if (!k || seen.has(k)) { if (k) texts.find((t) => t.key === k)?.alsoIn.push(source); return; } seen.add(k); texts.push({ key: k, text, source, weight, alsoIn: [] }); };
  pushText(internal, 'Nombre interno SysEx', SOURCE_WEIGHTS.internal);
  pushText(file, 'Nombre de archivo', SOURCE_WEIGHTS.file);
  folders.slice().reverse().forEach((f, i) => pushText(f, i === 0 ? 'Carpeta' : 'Carpeta superior', i === 0 ? SOURCE_WEIGHTS.folder : SOURCE_WEIGHTS.parentFolder));
  if (ctx.bankName) pushText(ctx.bankName, 'Banco / ZIP', SOURCE_WEIGHTS.bank);
  const textSupport = {}; // cat -> set de fuentes independientes
  const subVotes = {}, textSub = {};
  for (const t of texts) {
    const m = matchText(t.text);
    if (t.source === 'Nombre interno SysEx' || t.source === 'Nombre de archivo') out.unknownTokens.push(...m.unknown);
    const catsHere = new Map();
    for (const h of m.hits) {
      if (h.desc && !out.descriptors.some((d) => d.label === h.desc)) out.descriptors.push({ label: h.desc, source: t.source, term: h.term, declared: true });
      if (h.use && !out.usage.includes(h.use)) out.usage.push(h.use);
      if (!h.cat) continue;
      const prev = catsHere.get(h.cat);
      if (!prev || prev.w < h.w) catsHere.set(h.cat, h);
      if (h.sub) { subVotes[h.cat + ':' + h.sub] = (subVotes[h.cat + ':' + h.sub] || 0) + t.weight * h.w; (textSub[h.cat + ':' + h.sub] ||= []).push(`«${h.term}» (${t.source})`); }
    }
    for (const [cat, h] of catsHere) {
      const label = t.alsoIn.length ? `${t.source} (= ${t.alsoIn.join(', ')})` : t.source;
      add(cat, t.weight * h.w, label, `«${h.term}» en «${t.text}»`, h.sub);
      (textSupport[cat] ||= new Set()).add(t.source);
    }
  }
  // 2) Reglas del usuario (palabra, carpeta, código Novation). Las excepciones por patch se aplican fuera.
  for (const r of ctx.rules || []) {
    if (!r.enabled) continue;
    let hit = false, why = '';
    if (r.type === 'token') { const tk = tokenize(r.pattern).join(' '); hit = texts.some((t) => (' ' + t.key + ' ').includes(' ' + tk + ' ')); why = `regla: palabra «${r.pattern}»`; }
    if (r.type === 'folder') { hit = folders.some((f) => f.toLowerCase() === String(r.pattern).toLowerCase()); why = `regla: carpeta «${r.pattern}»`; }
    if (r.type === 'nvcat' && ctx.payload) { hit = ctx.payload[16] === Number(r.pattern); why = `regla: código de categoría Novation ${r.pattern}`; }
    if (hit) { add(r.category, r.type === 'nvcat' ? SOURCE_WEIGHTS.nvcat : SOURCE_WEIGHTS.rule, 'Regla aprendida', why, r.subtype); (textSupport[r.category] ||= new Set()).add('Regla ' + r.id); if (r.subtype) { subVotes[r.category + ':' + r.subtype] = (subVotes[r.category + ':' + r.subtype] || 0) + 4; (textSub[r.category + ':' + r.subtype] ||= []).push(why); } }
  }
  // 3) Hipótesis de síntesis (pesos bajos: apoyan, no deciden frente a un nombre claro).
  const synth = {};
  if (an) {
    const H = (id) => hasFeature(an, id);
    out.techTags = an.features.map((f) => f.label);
    const hyp = (cat, pts, why, sub) => { add(cat, pts, 'Síntesis', why, sub); synth[cat] = true; if (sub) subVotes[cat + ':' + sub] = (subVotes[cat + ':' + sub] || 0) + pts; };
    if (H('deep-register')) hyp('bass', 2, 'Transpuesto dos octavas o más hacia abajo');
    else if (H('low-register')) hyp('bass', 0.75, 'Transpuesto una octava hacia abajo (también común en leads y arps)');
    if (H('low-register') && H('pure-waves') && !H('distortion') && !H('high-res')) hyp('bass', 0.5, 'Ondas simples en registro grave', 'sub');
    if (H('acid-like') && H('mono')) hyp('bass', 1, 'Resonancia + envolvente corta al filtro en voz mono', 'acid');
    if (H('wobble-like') && H('low-register')) hyp('bass', 0.5, 'LFO rítmico al filtro en registro grave', 'wobble');
    if ((H('detuned') || H('density')) && H('low-register') && !H('percussive')) hyp('bass', 0.5, 'Osciladores desafinados en registro grave', 'reese');
    if (H('poly') && H('slow-attack') && H('long-release')) hyp('pad', 2, 'Polifónico, ataque lento y release largo');
    else if (H('poly') && H('sustained') && H('long-release')) hyp('pad', 1, 'Polifónico sostenido con release largo');
    if (H('percussive') && !H('low-register')) hyp('pluck', 1.5, 'Envolvente de amplitud percusiva');
    const v = an.decoded.v;
    if (v['env1.a'] <= 2 && v['env1.s'] === 0 && v['env1.d'] <= 35) hyp('perc', 1 + (H('pitch-env') ? 0.5 : 0) + (H('noise') ? 0.5 : 0), 'Envolvente muy corta' + (H('pitch-env') ? ' + env de afinación' : '') + (H('noise') ? ' + ruido' : ''));
    if (H('sustained') && H('long-release') && (H('lfo-mod') || H('mod-rich')) && !H('percussive')) hyp('drone', 1, 'Sostenido, release largo y modulación');
    if (H('mono') && !H('low-register') && !H('percussive') && (H('glide') || H('vibrato'))) hyp('lead', 1, 'Mono, registro no grave, glide/vibrato');
    if (H('noise') && (H('pitch-env') || H('lfo-mod')) && !H('low-register')) hyp('fx', 1, 'Ruido modulado');
  }
  // 3b) Medición acústica real (si existe). Cuenta como fuente independiente del texto.
  const M = ctx.acoustic?.desc ? measuredFeatures(ctx.acoustic.desc) : [];
  out.measured = M;
  const HM = (id) => M.some((f) => f.id === id);
  const mAdd = (cat, k, why, sub) => { add(cat, SOURCE_WEIGHTS.measured * k, 'Medición acústica', why, sub); (textSupport[cat] ||= new Set()).add('Medición'); if (sub) subVotes[cat + ':' + sub] = (subVotes[cat + ':' + sub] || 0) + 2; };
  if (M.length && !HM('m-silent')) {
    const d = ctx.acoustic.desc;
    if (HM('m-low')) mAdd('bass', 1, `f0 medida ${d.f0.toFixed(0)} Hz con la nota de prueba`, HM('m-dark') && !HM('m-noisy') ? 'sub' : undefined);
    if (HM('m-slow-attack') && HM('m-long-release')) mAdd('pad', 1, 'Ataque lento y cola larga medidos');
    else if (HM('m-sustained') && HM('m-long-release') && HM('m-moving')) mAdd('drone', 0.6, 'Sostenido con movimiento y cola larga');
    if (HM('m-percussive') && !HM('m-low')) mAdd(HM('m-noisy') ? 'perc' : 'pluck', 0.8, 'Envolvente percusiva medida');
    if (HM('m-noisy') && !d.f0) mAdd('fx', 0.8, 'Sin altura clara y espectro ruidoso');
  }
  // 4) Decisión. Las categorías de uso (arp/sequence) solo son principales si no hay tímbrica.
  const ranked = Object.entries(out.scores).sort((a, b) => b[1] - a[1]);
  const timbre = ranked.filter(([c]) => CATEGORIES.find((x) => x.id === c)?.kind === 'timbre');
  for (const [c] of ranked) if ((c === 'arp' || c === 'sequence') && timbre.length && !out.usage.includes(c)) out.usage.push(c);
  // Si el nombre o la carpeta declaran un uso (ARP, SEQ) y la tímbrica solo viene de indicios débiles de síntesis,
  // manda el uso declarado: «12.5% ARP» una octava abajo es un arpegio, no un bajo.
  const usageDeclared = ranked.filter(([c]) => CATEGORIES.find((x) => x.id === c)?.kind !== 'timbre' && textSupport[c]?.size);
  // con un uso declarado en el texto, solo cuenta la tímbrica que también tiene apoyo textual
  const timbreSolid = timbre.filter(([c]) => textSupport[c]?.size);
  const pool = usageDeclared.length && !timbreSolid.length ? ranked.filter(([c]) => !timbre.some(([t]) => t === c)) : timbre.length ? timbre : ranked;
  const [top, second] = pool;
  if (top) {
    const textCount = textSupport[top[0]]?.size || 0;
    if (second && second[1] >= top[1] - 1 && (textSupport[second[0]]?.size || 0) > 0) {
      out.certainty = 'ambiguous';
      out.contradictions.push({ text: `Indicios similares de ${CAT_LABEL[top[0]]} (${top[1]}) y ${CAT_LABEL[second[0]]} (${second[1]})`, kind: 'text' });
      out.candidates = [top[0], second[0]];
    } else {
      // Un único indicio débil de síntesis (p. ej. solo «una octava abajo») no basta para poner categoría:
      // queda como pista visible y el patch sigue «sin categoría».
      if (!textCount && top[1] < 1.5) { out.hint = { cat: top[0], pts: top[1] }; out.pending.push(`Indicio débil de ${CAT_LABEL[top[0]]} por parámetros: escúchalo para decidir`); }
      else {
        out.category = top[0];
        out.certainty = textCount >= 2 ? 'corroborated' : textCount === 1 ? 'textual' : 'technical';
        out.basis = [...new Set([...(textSupport[top[0]] || [])].map(BASIS_WORD))];
      }
    }
  }
  if (out.category && an) {
    // Subcarpeta deducida de cómo está programado (apoya o decide cuando el nombre no dice nada)
    for (const r of paramSubtypes(out.category, an)) {
      subVotes[out.category + ':' + r.sub] = (subVotes[out.category + ':' + r.sub] || 0) + r.pts;
      out.evidence.push({ cat: out.category, sub: r.sub, pts: 0, source: 'Ajustes → subcarpeta', why: r.why, subPts: r.pts });
    }
  }
  if (out.category) {
    const subs = Object.entries(subVotes).filter(([k]) => k.startsWith(out.category + ':')).sort((a, b) => b[1] - a[1]);
    if (subs.length && subs[0][1] >= 0.75) {
      out.subtype = subs[0][0].split(':')[1];
      const key = out.category + ':' + out.subtype, fromText = !!textSub[key];
      const why = fromText ? textSub[key] : out.evidence.filter((e) => e.cat === out.category && e.sub === out.subtype).map((e) => e.why);
      out.subBasis = { from: fromText ? 'text' : 'params', why: [...new Set(why)].slice(0, 3), pts: Math.round(subs[0][1] * 10) / 10 };
      if (subs[1] && subs[1][1] >= subs[0][1] - 0.5) out.subAlt = subs[1][0].split(':')[1];
    }
  }
  // Carácter deducido de los ajustes (se distingue del declarado en el nombre)
  if (an) for (const d of paramDescriptors(an)) if (!out.descriptors.some((x) => x.label === d.label)) out.descriptors.push({ label: d.label, source: 'Ajustes', term: d.why, declared: false });
  // 5) Contradicciones entre el nombre y la configuración (avisos; nunca cambian la propuesta).
  if (an && out.category) {
    const H = (id) => hasFeature(an, id), c = out.category, X = (t) => out.contradictions.push({ text: t, kind: 'synth' });
    if (c === 'pad' && H('percussive')) X('Se propone Pad pero la envolvente de amplitud es percusiva');
    if (c === 'bass' && H('high-register')) X('Se propone Bass pero el patch está transpuesto hacia arriba');
    if (c === 'bass' && H('poly') && H('slow-attack')) X('Se propone Bass pero es polifónico con ataque lento');
    if (c === 'bass' && out.subtype === 'sub' && (H('high-res') || H('distortion') || H('wavetable'))) X('Sub Bass con resonancia, distorsión u ondas digitales: comprobar si es realmente un sub');
    if (c === 'pluck' && (H('slow-attack') || (an.decoded.v['env1.s'] >= 90 && H('long-release')))) X('Se propone Pluck pero la envolvente es lenta o sostenida');
    if (c === 'lead' && H('low-register')) X('Se propone Lead pero el registro es grave (¿Lead Bass?)');
    if ((c === 'perc' || c === 'stab') && H('slow-attack')) X(`Se propone ${CAT_LABEL[c]} pero el ataque es lento`);
    if (c === 'drone' && H('percussive')) X('Se propone Drone pero la envolvente es percusiva');
    for (const d of out.descriptors.filter((x) => x.declared)) {
      if (d.label === 'Dark' && H('open-filter')) X('El nombre declara «Dark» pero el filtro LP está abierto (no prueba que no suene oscuro)');
      if (d.label === 'Bright' && H('low-cutoff')) X('El nombre declara «Bright» pero el cutoff LP es bajo');
      if (d.label === 'Distorted' && !H('distortion') && !H('filter-drive')) X('El nombre declara distorsión pero no hay drive/distorsión altos configurados (puede venir de las macros)');
    }
    if (M.length && !HM('m-silent')) {
      const X2 = (t) => out.contradictions.push({ text: t, kind: 'measured' });
      if (c === 'bass' && ctx.acoustic.desc.f0 && ctx.acoustic.desc.f0 > 260) X2(`Se propone Bass pero la f0 medida es ${ctx.acoustic.desc.f0.toFixed(0)} Hz`);
      if (c === 'pad' && HM('m-percussive')) X2('Se propone Pad pero la medición es percusiva');
    }
    if (out.contradictions.some((x) => x.kind !== 'text') && out.certainty === 'corroborated') out.certainty = 'textual';
  }
  if (M.length && !HM('m-silent')) for (const d of out.descriptors.filter((x) => x.declared)) {
    if (d.label === 'Dark' && HM('m-bright')) out.contradictions.push({ text: 'El nombre dice «Dark» y la medición indica brillo alto', kind: 'measured' });
    if (d.label === 'Bright' && HM('m-dark')) out.contradictions.push({ text: 'El nombre dice «Bright» y la medición indica sonido oscuro', kind: 'measured' });
  }
  // 6) Aspectos pendientes de escucha.
  if (!M.length) out.pending.push('Timbre real: sin escucha ni medición registradas');
  else if (HM('m-silent')) out.pending.push('La medición no captó señal: revisa la entrada de audio');
  if (an) {
    if (an.activeMacros) out.pending.push(`${an.activeMacros} macro(s) activas pueden cambiar mucho el carácter según su posición`);
    if (hasFeature(an, 'lfo-mod')) out.pending.push('Comprobar si la modulación por LFO es audible y a qué velocidad');
    const decl = out.descriptors.filter((d) => d.declared);
    if (decl.length) out.pending.push('Los descriptores (' + decl.map((d) => d.label).join(', ') + ') proceden del nombre, no de la escucha');
    if (out.category === 'bass' || out.category === 'lead') out.pending.push('Registro efectivo depende de las notas del patrón');
  }
  out.unknownTokens = [...new Set(out.unknownTokens)];
  out.analysis = an;
  return out;
}

// ---------- Subcarpeta por ajustes ----------
// Reglas sencillas y explicables por categoría. pts: fuerza del indicio (el nombre pesa 3 por fuente).
export function paramSubtypes(cat, an) {
  const H = (id) => hasFeature(an, id), v = an.decoded.v, out = [], R = (sub, pts, why) => out.push({ sub, pts, why });
  const shortEnv = H('percussive') || H('short-decay'), sustained = !H('percussive') && (H('sustained') || v['env1.s'] >= 70);
  const bright = H('open-filter') || !(v['filter.type'] <= 1), harsh = H('distortion') || H('filter-drive');
  const metallic = H('ringmod') || H('vsync') || H('wavetable');
  if (cat === 'bass') {
    if (H('acid-like')) R('acid', 2, 'Resonancia alta y envolvente corta sobre el filtro');
    if (H('wobble-like')) R('wobble', 2, 'LFO rítmico sobre el filtro');
    if ((H('detuned') || H('density')) && sustained) R('reese', 1.5, 'Osciladores desafinados o density con nota sostenida');
    if (H('pure-waves') && !harsh && !H('high-res') && !metallic) R('sub', 1.5 + (H('deep-register') ? 0.5 : 0), 'Ondas simples, filtro cerrado y sin saturación');
    if (harsh && !H('acid-like')) R('dist', 1.25, 'Distorsión o drive del filtro altos');
    if (metallic && !H('pure-waves')) R('fm', 1.25, H('ringmod') ? 'Ring mod' : H('vsync') ? 'Virtual sync' : 'Ondas digitales de tabla');
    if ((H('slow-attack') || H('long-release')) && sustained && !H('filter-env')) R('drone', 1.25, 'Ataque lento o release largo sin envolvente al filtro');
    if (shortEnv && H('filter-env') && !H('acid-like')) {
      if (H('deep-register') || v['filter.freq'] <= 60) R('rolling', 1.25, 'Notas cortas con envolvente al filtro, muy graves u oscuras');
      else R('groovy', 1.25, 'Notas cortas con envolvente al filtro en registro medio-grave');
    }
    if (H('glide') && H('filter-env') && !H('acid-like')) R('groovy', 0.75, 'Glide y envolvente al filtro');
    if (H('percussive') && bright && !H('filter-env')) R('pluck', 1, 'Envolvente percusiva con filtro abierto');
    if (H('pitch-env') && H('deep-register') && H('long-decay')) R('b808', 1.5, 'Envolvente de afinación con caída larga en registro muy grave');
  } else if (cat === 'lead') {
    if (H('acid-like')) R('acid', 2, 'Configuración tipo acid');
    if (H('vsync')) R('sync', 1.5, 'Virtual sync');
    if ((H('density') || H('detuned')) && (bright || H('chorus'))) R('saw', 1.25, 'Density o desafinación con filtro abierto');
    if (H('slow-attack') || (H('low-cutoff') && !H('high-res'))) R('soft', 1, 'Ataque lento o filtro cerrado');
    if (H('mono')) R('mono', 0.75, 'Voz monofónica'); else if (H('poly')) R('poly', 0.75, 'Voz polifónica');
  } else if (cat === 'pad') {
    if (H('lfo-mod') || H('mod-rich')) R('evolving', 1.25, 'Modulación por LFO o matriz densa');
    if (H('low-cutoff')) R('dark', 1.25, 'Filtro LP cerrado');
    if (H('noise') || (bright && H('long-release'))) R('airy', 1, H('noise') ? 'Ruido en la mezcla' : 'Filtro abierto y cola larga');
    if (!bright && (H('chorus') || H('detuned')) && !H('low-cutoff')) R('warm', 1, 'Filtro LP a medio abrir con chorus o desafinación');
  } else if (cat === 'pluck') {
    if (metallic || H('high-register')) R('bell', 1.25, metallic ? 'Ring mod, sync u ondas de tabla' : 'Registro agudo');
    if (H('low-cutoff')) R('soft', 1, 'Filtro cerrado');
    if (H('short-decay')) R('short', 1, 'Caída muy breve');
  } else if (cat === 'stab') {
    if ((H('density') || H('detuned')) && (harsh || H('pitch-env'))) R('rave', 1.5, 'Desafinado con saturación o envolvente de afinación');
    if (H('chorus') && H('long-release')) R('dub', 1.25, 'Chorus y cola larga');
    if (H('poly')) R('chord', 0.75, 'Polifónico');
  } else if (cat === 'chords') {
    if (H('chorus') && H('long-release')) R('dub', 1.25, 'Chorus y cola larga');
    if (shortEnv) R('stab', 1, 'Envolvente corta');
    if (H('slow-attack')) R('pad', 1, 'Ataque lento');
  } else if (cat === 'keys') {
    if (sustained && !H('filter-env') && H('pure-waves')) R('organ', 1, 'Sostenido, ondas simples y sin envolvente al filtro');
    if (H('long-decay') && H('chorus')) R('epiano', 1, 'Caída larga con chorus');
    if (H('percussive') && H('high-res')) R('clav', 1, 'Percusivo con resonancia');
  } else if (cat === 'fx') {
    if (H('noise') && !H('pitch-env')) R('noise', 1.25, 'Ruido destacado');
    if (H('pitch-env') && H('percussive')) R('zap', 1.5, 'Envolvente de afinación en un golpe corto');
    if (H('filter-lfo') || (H('filter-env') && H('slow-attack'))) R('sweep', 1, 'Barrido del filtro');
    if (H('percussive') && (H('noise') || harsh) && !H('pitch-env')) R('impact', 1, 'Golpe corto con ruido o saturación');
    if (H('slow-attack') && (H('pitch-env') || H('filter-env'))) R('riser', 1, 'Ataque lento con envolvente de afinación o filtro');
  } else if (cat === 'drone') {
    if (H('noise')) R('noise', 1.25, 'Ruido destacado');
    if (H('low-cutoff')) R('dark', 1.25, 'Filtro LP cerrado');
    if (H('mod-rich') || metallic) R('texture', 1, 'Matriz densa u ondas digitales');
    if (H('long-release') && (H('chorus') || H('lfo-mod'))) R('atmos', 1, 'Cola larga con chorus o LFO');
  } else if (cat === 'perc') {
    if (H('pitch-env') && (H('low-register') || H('pure-waves'))) R('kick', 1.5, 'Envolvente de afinación sobre un tono grave o simple');
    if (H('noise') && (v['filter.type'] >= 4)) R('hat', 1.5, 'Ruido con filtro paso alto');
    else if (H('noise')) R('snare', 1.25, 'Ruido en un golpe corto');
    if (metallic) R('metal', 1.25, 'Ring mod, sync u ondas de tabla');
    if (H('pitch-env') && !H('low-register') && !H('noise')) R('tom', 1, 'Envolvente de afinación en registro medio');
  } else if (cat === 'transition') {
    if (H('slow-attack')) R('riser', 0.75, 'Ataque lento');
  }
  return out;
}
// Carácter que se puede leer en los ajustes. Son indicios, no escucha: la ficha los marca «de los ajustes».
export function paramDescriptors(an) {
  const H = (id) => hasFeature(an, id), out = [], D = (label, why) => out.push({ label, why });
  if (H('low-cutoff') && !H('high-res') && !H('distortion')) D('Dark', 'Filtro LP cerrado');
  if (H('open-filter') && !H('pure-waves')) D('Bright', 'Filtro LP abierto con ondas ricas');
  if (H('distortion') || H('filter-drive')) D('Distorted', 'Distorsión o drive altos');
  if (H('acid-like')) D('Acidic', 'Resonancia y envolvente corta al filtro');
  if (H('ringmod') || H('vsync')) D('Metallic', H('ringmod') ? 'Ring mod' : 'Virtual sync');
  if (H('wavetable')) D('Digital', 'Ondas de tabla');
  if (H('detuned') || H('density') || H('chorus')) D('Wide', 'Desafinación, density o chorus');
  if (H('fast-attack') && H('filter-env') && !H('long-release')) D('Punchy', 'Ataque rápido con envolvente al filtro');
  if (H('slow-attack') && !H('high-res')) D('Soft', 'Ataque lento');
  if (H('lfo-mod') && !H('percussive')) D('Hypnotic', 'Modulación por LFO sostenida');
  return out;
}

// ---------- Etiquetas rápidas (paleta) y efectos ----------
export const TAG_PALETTE = [
  { name: 'Efectos', tags: ['Delay', 'Reverb', 'Chorus', 'Phaser', 'Distortion', 'EQ'] },
  { name: 'Carácter', tags: ['Dark', 'Warm', 'Bright', 'Deep', 'Punchy', 'Soft', 'Metallic', 'Hypnotic', 'Aggressive', 'Wide'] },
  { name: 'Uso', tags: ['Intro', 'Groove', 'Break', 'Build', 'Drop', 'Live', 'Layer'] }
];
const FX_WORDS = { delay: 'Delay', dly: 'Delay', echo: 'Delay', echoes: 'Delay', dub: 'Delay', reverb: 'Reverb', verb: 'Reverb', rev: 'Reverb', hall: 'Reverb', room: 'Reverb', space: 'Reverb', spacey: 'Reverb', spacy: 'Reverb', plate: 'Reverb', chorus: 'Chorus', phaser: 'Phaser', phase: 'Phaser', flanger: 'Phaser', dist: 'Distortion', distortion: 'Distortion', distorted: 'Distortion', fuzz: 'Distortion', crush: 'Distortion', bitcrush: 'Distortion', eq: 'EQ' };
// Efectos que se pueden leer en el nombre (delay, reverb…) o en el patch (chorus, phaser, distorsión, EQ).
// Delay y reverb son efectos del proyecto en el Circuit Tracks: en un patch solo pueden venir del nombre.
export function fxTags(texts, an) {
  const out = new Map();
  for (const t of texts) for (const w of tokenize(t)) if (FX_WORDS[w] && !out.has(FX_WORDS[w])) out.set(FX_WORDS[w], { t: FX_WORDS[w], k: 'name', why: `«${w}» en el nombre` });
  if (an) {
    const v = an.decoded.v;
    if (v['fx.chorus'] >= 40 && !out.has(v['fx.chorustype'] === 0 ? 'Phaser' : 'Chorus')) out.set(v['fx.chorustype'] === 0 ? 'Phaser' : 'Chorus', { t: v['fx.chorustype'] === 0 ? 'Phaser' : 'Chorus', k: 'par', why: 'Nivel ' + v['fx.chorus'] });
    if ((v['fx.dist'] >= 40 || v['filter.drive'] >= 50) && !out.has('Distortion')) out.set('Distortion', { t: 'Distortion', k: 'par', why: 'Distorsión o drive altos' });
    if ((Math.abs(v['eq.bassl'] - 64) >= 20 || Math.abs(v['eq.midl'] - 64) >= 20 || Math.abs(v['eq.trebl'] - 64) >= 20) && !out.has('EQ')) out.set('EQ', { t: 'EQ', k: 'par', why: 'Ecualizador marcado' });
  }
  return [...out.values()];
}
// Palabras del nombre (interno y de archivo) para filtrar: sin palabras vacías ni números sueltos.
const WORD_STOP = new Set([...STOP, 'v', 'b', 'mk', 'ii', 'iii', 'pt', 'no', 'de', 'la', 'el', 'y', 'en', 'un', 'una']);
export function nameWords(...texts) { const s = new Set(); for (const t of texts) for (const w of tokenize(String(t || '').replace(/\.[a-z0-9]{2,6}$/i, ''))) if (w.length >= 2 && !WORD_STOP.has(w)) s.add(w); return [...s]; }

// Cuánto apoyo tiene una propuesta, dicho en llano. «rank» ordena de más a menos segura.
export const CERTAINTY = {
  manual: { label: 'Decidido por ti', rank: 5, help: 'La categoría la has puesto o aceptado tú.' },
  corroborated: { label: 'Confirmado', rank: 4, help: 'Dos pistas distintas dicen lo mismo (por ejemplo, el nombre y la carpeta, o el nombre y la medición) y nada lo contradice.' },
  textual: { label: 'Una pista', rank: 3, help: 'Solo una pista lo indica (normalmente el nombre o la carpeta). Suele acertar, pero conviene escucharlo.' },
  technical: { label: 'Por sus ajustes', rank: 2, help: 'Ni el nombre ni la carpeta dicen nada; se deduce de cómo está programado (por ejemplo, transpuesto dos octavas abajo → bajo). Escúchalo para confirmarlo.' },
  ambiguous: { label: 'Dudoso', rank: 1, help: 'Hay pistas de dos tipos con fuerza parecida. Decide tú al escucharlo.' },
  none: { label: 'Sin pistas', rank: 0, help: 'Nada indica qué es (un solo indicio débil de sus ajustes no basta). Escúchalo y clasifícalo.' }
};
// De qué pistas sale la propuesta, en palabras cortas («nombre», «carpeta», «medición»…).
const BASIS_WORD = (src) => /^Nombre interno/.test(src) ? 'nombre' : /^Nombre de archivo/.test(src) ? 'nombre' : /^Carpeta/.test(src) ? 'carpeta' : /^Banco/.test(src) ? 'banco' : /^Regla/.test(src) ? 'tu regla' : /^Medici/.test(src) ? 'medición' : src.toLowerCase();

// Propuestas de reglas tras una corrección manual (el usuario decide si las guarda).
export function suggestRules(cls, finalCat, ctx) {
  const out = [];
  for (const tok of cls.unknownTokens.slice(0, 3)) out.push({ type: 'token', pattern: tok, category: finalCat, why: `La palabra «${tok}» no está en el léxico` });
  const folder = String(ctx.folderPath || '').split(/[\\/]/).filter(Boolean).pop();
  if (folder && !matchText(folder).hits.some((h) => h.cat)) out.push({ type: 'folder', pattern: folder, category: finalCat, why: `La carpeta «${folder}» no indica categoría` });
  return out;
}

// Calibración: compara propuestas con decisiones del usuario por nivel de certeza.
export function calibration(decisions) {
  const by = {};
  for (const d of decisions) {
    if (!d.predicted || d.action === 'revert') continue;
    const k = d.predicted.certainty || 'none';
    const row = (by[k] ||= { total: 0, accepted: 0, corrected: 0, rejected: 0 });
    row.total++;
    if (d.action === 'accept' || (d.action === 'correct' && d.final === d.predicted.category)) row.accepted++;
    else if (d.action === 'reject') row.rejected++;
    else row.corrected++;
  }
  return by;
}
