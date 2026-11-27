// Orden de la colección: «mismo synth con otros ajustes», registro/octava y plan de carpetas para el disco.
import { PARAMS, GROUP_LABELS, formatValue, MACRO_DESTS } from './params.js';
import { decodePatch } from './patch.js';
import { quickHash } from './compare.js';
import { CAT_LABEL, SUBTYPES, taxonomy, subLabelOf } from './classify.js';

// ---------- Arquitectura ----------
// Lo que define «qué synth es» y no «cómo está ajustado»: modo de voz, formas de onda y fuentes audibles,
// tipo y ruta de filtro, presencia de drive/distorsión/chorus, topología de la matriz (fuentes → destinos)
// y destinos de las macros. Los valores continuos (cutoff, tiempos, profundidades…) se ignoran.
export function architecture(payload) {
  const d = decodePatch(payload), v = d.v, on = (x) => (x > 0 ? 1 : 0);
  const parts = [
    v['voice.poly'] === 2 ? 'poly' : 'mono',
    on(v['mix.osc1']) ? 'o1:' + v['osc1.wave'] : 'o1:-', on(v['mix.osc2']) ? 'o2:' + v['osc2.wave'] : 'o2:-',
    'n' + on(v['mix.noise']), 'r' + on(v['mix.ring']), 'f' + v['filter.type'] + '/' + v['filter.routing'],
    'dr' + on(v['filter.drive']), 'di' + on(v['fx.dist']), 'ch' + (v['fx.chorus'] ? v['fx.chorustype'] : '-'),
    'mx' + d.matrix.filter((m) => m.active).map((m) => `${m.s1}.${m.s2}>${m.dest}`).sort().join(','),
    'mc' + d.macros.map((k) => k.slots.filter((s) => s.state === 'active').map((s) => s.dest).sort((a, b) => a - b).join('.')).join('|')
  ];
  return { key: quickHash(new TextEncoder().encode(parts.join(';'))), parts };
}
export function describeArchitecture(payload) {
  const d = decodePatch(payload), v = d.v, w = (n) => v[`mix.osc${n}`] > 0 ? PARAMS.find((p) => p.key === `osc${n}.wave`).enum[v[`osc${n}.wave`]] : null;
  return [v['voice.poly'] === 2 ? 'Poly' : 'Mono', [w(1), w(2)].filter(Boolean).join(' + ') || 'sin osc', PARAMS.find((p) => p.key === 'filter.type').enum[v['filter.type']], `${d.matrix.filter((m) => m.active).length} rutas`, `${d.macros.filter((k) => k.active).length}/8 macros`].join(' · ');
}

// Grupos de la misma arquitectura con ajustes distintos. Devuelve qué parámetros varían y en qué rango.
// Precisión del agrupado «mismo synth». Con colecciones reales, las macros (mapeos de directo) separan
// patches que suenan a la misma receta; por defecto se ignoran.
export const ARCH_LEVELS = [
  { id: 'strict', n: 11, label: 'Estricta: motor, efectos, matriz y macros' },
  { id: 'engine-fx', n: 10, label: 'Motor, efectos y matriz (ignora macros)' },
  { id: 'engine', n: 9, label: 'Motor y efectos (ignora matriz y macros)' },
  { id: 'base', n: 6, label: 'Misma base: voz, osciladores y filtro' }
];
export function architectureGroups(patches, level = 'engine-fx') {
  const n = (ARCH_LEVELS.find((l) => l.id === level) || ARCH_LEVELS[1]).n, by = new Map();
  for (const p of patches) { const a = n === 11 ? architecture(p.payload).key : level + ':' + architecture(p.payload).parts.slice(0, n).join(';'); (by.get(a) || by.set(a, []).get(a)).push(p); }
  const out = [];
  for (const [key, members] of by) {
    if (members.length < 2) continue;
    const distinctCore = new Set(members.map((p) => p.fp.core));
    if (distinctCore.size < 2) continue; // todos idénticos: eso son duplicados, no variantes
    const varying = [];
    for (const prm of PARAMS) {
      const vals = members.map((p) => p.payload[prm.off]);
      const min = Math.min(...vals), max = Math.max(...vals);
      if (min !== max) varying.push({ off: prm.off, label: GROUP_LABELS[prm.group] + ' · ' + prm.label, min, max, fmin: formatValue(prm, min), fmax: formatValue(prm, max), spread: (max - min) / Math.max(1, prm.max - prm.min) });
    }
    varying.sort((a, b) => b.spread - a.spread);
    out.push({ key, ids: members.map((p) => p.id), size: members.length, distinct: distinctCore.size, summary: describeArchitecture(members[0].payload), varying });
  }
  return out.sort((a, b) => b.size - a.size);
}

// ---------- Registro / octava ----------
// Transposición efectiva (semitonos) del oscilador audible más grave = octava de teclado × 12 + semitonos.
// ---------- Altura: octava y tono ----------
// Nota raíz del patch al tocar una nota MIDI: octava de teclado × 12 + semitonos del oscilador que manda.
// Manda el oscilador audible más fuerte; si los dos suenan parecido (±12 de nivel), el más grave.
// Así una quinta añadida a OSC 2 no se confunde con un patch «en otro tono».
// Confianza: «clara» si solo suena un oscilador, o si el raíz domina; «dudosa» si los dos suenan parecido a
// un intervalo que no es de octava, si domina el ruido o el ring mod: en esos casos conviene medir.
export const NOTE_NAMES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
export const SEMI_DESTS = MACRO_DESTS.map((d, i) => (d.off === 42 || d.off === 51 ? i : -1)).filter((i) => i >= 0);
const mod12 = (x) => ((x % 12) + 12) % 12;
export function pitchInfo(payload) {
  const kbd = payload[35] - 64, semis = [payload[42] - 64, payload[51] - 64], cents = [payload[43] - 64, payload[52] - 64];
  const lv = [payload[54], payload[55]], aud = [0, 1].filter((i) => lv[i] > 10);
  let root = 0;
  if (aud.length === 1) root = aud[0];
  else if (aud.length === 2) root = Math.abs(lv[0] - lv[1]) <= 12 ? (semis[0] <= semis[1] ? 0 : 1) : (lv[0] > lv[1] ? 0 : 1);
  const effective = kbd * 12 + semis[root], other = aud.length === 2 ? 1 - root : null;
  const interval = other === null ? null : semis[other] - semis[root];
  const reasons = [];
  if (!aud.length) reasons.push('ningún oscilador audible');
  if (other !== null && Math.abs(lv[0] - lv[1]) <= 12 && mod12(interval) !== 0) reasons.push(`los dos osciladores suenan parecido a ${Math.abs(interval)} st`);
  if (payload[57] > Math.max(...lv, 0) + 10) reasons.push('domina el ruido');
  if (payload[56] > 40) reasons.push('ring mod alto');
  const macroPitch = [];
  for (let k = 0; k < 8; k++) for (let s = 0; s < 4; s++) { const o = 204 + k * 17 + 1 + s * 4; if (SEMI_DESTS.includes(payload[o]) && payload[o + 3] !== 64) macroPitch.push({ knob: k, slot: s, dest: payload[o] }); }
  return { keyboardOctave: kbd, osc: semis, cents, levels: lv, root, rootLabel: 'OSC ' + (root + 1), interval, effective, octave: Math.floor(effective / 12), pitchClass: mod12(effective), centsRoot: cents[root], confidence: reasons.length ? 'dudosa' : 'clara', reasons, macroPitch };
}
// Compatibilidad: registro efectivo (en semitonos) y datos básicos.
export function register(payload) {
  const i = pitchInfo(payload);
  return { keyboardOctave: i.keyboardOctave, osc: i.osc, lowestSemis: i.osc[i.root], effective: i.effective, pitchClass: i.pitchClass, confidence: i.confidence };
}
export const fmtSemis = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x);
export function describePitch(e) { const o = Math.floor(e / 12), pc = mod12(e); return `${NOTE_NAMES[pc]} ${o > 0 ? '+' : o < 0 ? '−' : ''}${o ? Math.abs(o) + ' oct' : '0 oct'}`; }

// Compara cada patch de una categoría con lo habitual en TU colección (moda) o con un objetivo fijado.
// Si hay medición acústica (f0 a una nota conocida) manda la medición: es la prueba directa.
// Cada patch fuera de objetivo se etiqueta por tipo de problema: «octava», «tono» o «octava y tono».
export function registerReport(patches, catOf, category = 'bass', target = null, opts = {}) {
  const list = patches.filter((p) => catOf(p) === category);
  const items = list.map((p) => {
    const r = pitchInfo(p.payload), m = p.acoustic?.desc;
    let measured = null;
    if (m && !m.silent && m.f0 && p.acoustic.protocol?.note !== undefined && measureFits(p)) { // v3.11: solo si es de este sonido
      const st = 12 * Math.log2(m.f0 / 440) + 69 - p.acoustic.protocol.note;
      measured = { f0: m.f0, octaveOffset: m.octaveOffset, semis: Math.round(st), cents: Math.round((st - Math.round(st)) * 100), clarity: m.pitchClarity };
    }
    const reliableMeasure = measured && (measured.clarity ?? 1) > 0.6;
    const calc = opts.ignoreKbd ? r.osc[r.root] : r.effective;
    const effective = reliableMeasure ? measured.semis : calc;
    return { id: p.id, effective, calc, source: reliableMeasure ? 'medido' : 'parámetros', confidence: reliableMeasure ? 'medida' : r.confidence, reasons: r.reasons, keyboardOctave: r.keyboardOctave, osc: r.osc, root: r.root, interval: r.interval, centsRoot: r.centsRoot, macroPitch: r.macroPitch, measured };
  });
  const counts = new Map(); items.forEach((x) => counts.set(x.effective, (counts.get(x.effective) || 0) + 1));
  const mode = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
  const goal = target ?? mode;
  for (const x of items) {
    x.delta = goal - x.effective; x.octDelta = Math.round(x.delta / 12); x.residual = x.delta - x.octDelta * 12;
    x.octaveOff = Math.abs(x.delta) >= 7 && x.octDelta !== 0; x.toneOff = mod12(x.delta) !== 0;
    x.off = x.octaveOff || x.toneOff;
    x.problem = x.octaveOff && x.toneOff ? 'octava y tono' : x.octaveOff ? 'octava' : x.toneOff ? 'tono' : null;
    x.detuned = Math.abs(x.measured && x.source === 'medido' ? x.measured.cents : x.centsRoot) >= 10;
  }
  const off = items.filter((x) => x.off);
  return { category, mode, goal, distribution: [...counts.entries()].sort((a, b) => a[0] - b[0]), items, off,
    summary: { octave: off.filter((x) => x.problem === 'octava').length, tone: off.filter((x) => x.problem === 'tono').length, both: off.filter((x) => x.problem === 'octava y tono').length, doubtful: off.filter((x) => x.confidence === 'dudosa').length, detuned: items.filter((x) => x.detuned).length } };
}

// ---------- v3.11 · Dónde suena cada sonido y dónde se toca su frase de prueba ----------
// Semitonos que el patch mueve la nota que recibe. Manda una medición de esa misma carga (f0 clara a una nota
// conocida: la prueba directa); si no hay, sus parámetros (octava de teclado y semitonos del oscilador que manda).
// rec: el registro con la medición (acoustic) · payload: la carga que se va a tocar (por defecto, la del registro).
// Una medición vale si es de esa carga: desde 3.11 guarda la huella de su sonido (protocol.fp = fp.synth, sin el
// nombre; library.stampAcoustic se la pone a las de antes cuando cambia la carga).
export const measureFits = (rec) => { const a = rec?.acoustic; return !!a && (!a.protocol?.fp || !rec.fp?.synth || a.protocol.fp === rec.fp.synth); };
export function measuredSemis(rec) {
  const a = rec?.acoustic, m = a?.desc;
  if (!measureFits(rec) || !m || m.silent || !m.f0 || a.protocol?.note === undefined || (m.pitchClarity ?? 1) <= 0.6) return null;
  return Math.round(12 * Math.log2(m.f0 / 440) + 69 - a.protocol.note) || 0; // sin −0
}
export function soundOffset(rec, payload = rec?.payload, { ignoreKbd = false } = {}) {
  const r = pitchInfo(payload), calc = ignoreKbd ? r.osc[r.root] : r.effective;
  const ms = payload === rec?.payload ? measuredSemis(rec) : null;
  if (ms !== null) return { semis: ms, calc, source: 'medido', confidence: 'medida' };
  return { semis: calc, calc, source: 'parámetros', confidence: r.confidence };
}
const modeOf = (vals) => { const c = new Map(); for (const v of vals) c.set(v, (c.get(v) || 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null; };
// Lo habitual de cada grupo: la moda de lo que mueven sus sonidos, por categoría y por categoría / subcarpeta.
// items: [{ cat, sub, semis }] · targets: objetivos de «Octava y tono» ({ bass: { target: '-12' }, 'bass:sub': … }).
export function offsetNorms(items, { targets = {}, min = 3 } = {}) {
  const by = new Map(), add = (k, v) => (by.get(k) || by.set(k, []).get(k)).push(v);
  for (const x of items) { if (!x.cat) continue; add(x.cat, x.semis); if (x.sub) add(x.cat + '/' + x.sub, x.semis); }
  const groups = new Map();
  for (const [k, v] of by) groups.set(k, { norm: modeOf(v), n: v.length });
  return { groups, targets, min };
}
// La referencia de un grupo: el objetivo que fijaste en «Octava y tono» (subcarpeta y si no categoría) o, si no hay,
// lo habitual de la subcarpeta (con al menos `min` sonidos) o de la categoría. Con pocos sonidos no hay referencia.
export function normFor(norms, cat, sub) {
  if (!cat) return { norm: null, n: 0, source: 'pocos', key: '' };
  const tg = (k) => { const t = norms.targets?.[k]?.target; return t === undefined || t === null || t === '' || t === 'skip' || Number.isNaN(+t) ? null : +t; };
  for (const k of sub ? [cat + ':' + sub, cat] : [cat]) { const t = tg(k); if (t !== null) return { norm: t, n: norms.groups.get(k.replace(':', '/'))?.n || 0, source: 'objetivo', key: k.replace(':', '/') }; }
  for (const k of sub ? [cat + '/' + sub, cat] : [cat]) { const g = norms.groups.get(k); if (g && g.n >= norms.min) return { norm: g.norm, n: g.n, source: 'coleccion', key: k }; }
  return { norm: null, n: norms.groups.get(cat)?.n || 0, source: 'pocos', key: cat };
}
// Dónde se toca la frase. base: su octava (estilo + la que elegiste para el grupo) · semis: lo que mueve este
// patch · norm: lo que mueven los de su grupo.
//  · dev: cuántas octavas se aparta el patch de su grupo (solo octavas enteras: un patch a una quinta no es
//    «otra octava»; misma regla que «Octava y tono»: 7 semitonos o más).
//  · 'fit' (en su registro): la frase sube o baja esas octavas y el patch suena donde los de su grupo.
//  · 'circuit': la misma frase para todo el grupo, como tus patrones en el equipo: el que está fuera suena fuera.
export function placePhrase(base, semis, norm, mode = 'fit') {
  const d = norm === null || norm === undefined ? 0 : semis - norm, dev = Math.abs(d) >= 7 ? Math.round(d / 12) : 0;
  const comp = mode === 'fit' ? -dev * 12 : 0;
  return { played: base + comp, comp, dev, mode };
}

// Transponer n semitonos. Métodos:
//  · 'osc': suma n a los semitonos de ambos osciladores (mantiene el intervalo entre ellos). Si una macro
//    controla los semitonos de un oscilador, se desplaza también su inicio/fin para que el knob no deshaga
//    la corrección.
//  · 'keyboard': las octavas completas van a la octava de teclado (byte 35, rango 58–69) y el resto de
//    semitonos a los osciladores. Su efecto sobre notas MIDI externas no está documentado: verificar.
// También puede centrar los cents del oscilador raíz (opción tune).
export function transposeSemitones(payload, n, method = 'osc', opts = {}) {
  const out = new Uint8Array(payload), problems = [], notes = [];
  let oscShift = n;
  if (method === 'keyboard') {
    const oct = Math.trunc(n / 12); oscShift = n - oct * 12;
    if (oct) {
      const nv = payload[35] + oct;
      if (nv < 58 || nv > 69) { problems.push(`Octava de teclado ${nv - 64} fuera del rango documentado (−6…+5): se usan los osciladores`); oscShift = n; }
      else { out[35] = nv; notes.push(`Octava de teclado ${fmtSemis(payload[35] - 64)} → ${fmtSemis(nv - 64)}`); }
    }
  }
  if (oscShift) {
    for (const o of [42, 51]) {
      const nv = payload[o] + oscShift;
      if (nv < 0 || nv > 127) problems.push(`OSC ${o === 42 ? 1 : 2}: ${fmtSemis(nv - 64)} st queda fuera del rango (−64…+63); se recorta`);
      out[o] = Math.max(0, Math.min(127, nv));
    }
    notes.push(`Osciladores ${fmtSemis(oscShift)} st`);
    for (let k = 0; k < 8; k++) for (let s = 0; s < 4; s++) {
      const o = 204 + k * 17 + 1 + s * 4;
      if (!SEMI_DESTS.includes(out[o]) || out[o + 3] === 64) continue;
      for (const q of [o + 1, o + 2]) { const nv = out[q] + oscShift; if (nv < 0 || nv > 127) problems.push(`Macro ${k + 1}: rango de semitonos recortado`); out[q] = Math.max(0, Math.min(127, nv)); }
      notes.push(`Macro ${k + 1} (semitonos) desplazada ${fmtSemis(oscShift)} st`);
    }
  }
  if (opts.tune) {
    const r = pitchInfo(payload).root, co = r === 0 ? 43 : 52;
    if (out[co] !== 64) { notes.push(`Cents de OSC ${r + 1}: ${fmtSemis(out[co] - 64)} → 0`); const d = 64 - out[co]; out[co] = 64; const other = r === 0 ? 52 : 43; out[other] = Math.max(0, Math.min(127, out[other] + d)); }
  }
  return { payload: out, problems, notes };
}
export function transposeOctaves(payload, octaves, method = 'osc') {
  if (method === 'keyboard') {
    const out = new Uint8Array(payload), problems = [], nv = payload[35] + octaves;
    if (nv < 58 || nv > 69) problems.push(`Octava de teclado ${nv - 64} fuera del rango documentado (−6…+5)`);
    out[35] = Math.max(58, Math.min(69, nv)); return { payload: out, problems, notes: [] };
  }
  return transposeSemitones(payload, octaves * 12, 'osc');
}

// ---------- Plan de carpetas para el disco ----------
const safe = (s, n = 48) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ()_\-.]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, n) || 'Sin nombre';
// opts: { layout: 'category'|'architecture'|'source', naming: '{name}'|'{cat} - {name}'|'{n} {name}', duplicates: 'skip'|'folder', variants: 'family'|'flat' }
// scope: 'all' (toda la biblioteca), 'filter' (el filtro de la biblioteca) o 'sel' (la selección; v3.11, como en la Rhythm 2.9)
export function planScope(lib, filtered, scope, selection = []) { return (scope === 'filter' ? filtered : scope === 'sel' && selection.length ? selection : lib.faces ? lib.faces() : lib.patches).filter((p) => p.meta.review !== 'discard'); }
export function diskPlan(lib, patches, opts = {}) {
  // drafts: 'skip' (por defecto) | 'family'  ·  las variantes aceptadas ocupan el sitio y el nombre de su original
  const o = { layout: 'category', naming: '{cat} - {name}', duplicates: 'folder', variants: 'family', drafts: 'skip', ...opts };
  const fam = lib.families().of, entries = [], used = new Set();
  const state = (p) => (lib.changeState ? lib.changeState(p) : p.kind === 'variant' ? 'draft' : 'original');
  const archNames = new Map(), tax = taxonomy(lib.settings?.subfolders || {});
  let counter = 0;
  for (const p of patches) {
    const st = state(p);
    if (st === 'superseded') { entries.push({ id: p.id, action: 'skip', reason: 'sustituido por su variante aceptada' }); continue; }
    if (st === 'draft' && o.drafts === 'skip') { entries.push({ id: p.id, action: 'skip', reason: 'variante en borrador (acéptala para incluirla)' }); continue; }
    const cat = p.meta.category || lib.info(p).cls.category, sub = p.meta.subtype || (p.meta.category ? null : lib.info(p).cls.subtype);
    const catLabel = cat ? CAT_LABEL[cat] : 'Sin clasificar', subLabel = sub && subLabelOf(tax, cat, sub);
    const f = fam.get(p.id), me = f?.members.find((m) => m.id === p.id), isDup = me?.rel && (me.rel.level === 'payload' || me.rel.level === 'synth');
    if (isDup && o.duplicates === 'skip') { entries.push({ id: p.id, action: 'skip', reason: 'duplicado de ' + lib.byId(f.head)?.name }); continue; }
    let dir = [];
    if (o.layout === 'category') { dir = [safe(catLabel)]; if (subLabel) dir.push(safe(subLabel)); }
    else if (o.layout === 'architecture') { const k = architecture(p.payload).key; if (!archNames.has(k)) archNames.set(k, `${String(archNames.size + 1).padStart(3, '0')} ${safe(describeArchitecture(p.payload), 60)}`); dir = [archNames.get(k)]; }
    else dir = (p.folderPath || 'Sin carpeta').split('/').map((x) => safe(x));
    if (isDup && o.duplicates === 'folder' && st !== 'adopted') dir = ['_Duplicados', ...dir];
    else if (st !== 'adopted' && f && f.members.filter((m) => !['superseded', 'draft'].includes(state(lib.byId(m.id) || {}))).length > 1 && o.variants === 'family') dir.push(safe(lib.byId(f.head)?.name || p.name) + ' (familia)');
    counter++;
    let base = o.naming.replace('{cat}', catLabel).replace('{name}', p.name || 'Sin nombre').replace('{n}', String(counter).padStart(4, '0'));
    base = safe(base, 64);
    let file = base + '.syx', k = 2;
    while (used.has((dir.join('/') + '/' + file).toLowerCase())) file = `${base} (${k++}).syx`;
    used.add((dir.join('/') + '/' + file).toLowerCase());
    entries.push({ id: p.id, action: 'write', dir, file, from: (p.folderPath ? p.folderPath + '/' : '') + (p.fileName || ''), category: catLabel, duplicate: !!isDup && st !== 'adopted', replaces: st === 'adopted' ? p.parentId : null });
  }
  const writes = entries.filter((e) => e.action === 'write');
  return { entries, writes: writes.length, skipped: entries.length - writes.length, folders: new Set(writes.map((e) => e.dir.join('/'))).size };
}
export function planManifest(plan, lib) {
  // v3.6 (como en la Rhythm): también subcarpeta, etiquetas, valoración y favorito, para filtrar la colección en una hoja de cálculo
  const rows = [['accion', 'origen', 'destino', 'categoria', 'subcarpeta', 'nombre', 'etiquetas', 'valoracion', 'favorito', 'motivo']];
  for (const e of plan.entries) {
    const p = lib.byId(e.id), m = p?.meta || {};
    const sub = m.subtype && (m.category || e.category) && lib.subLabel ? lib.subLabel(m.category || e.category, m.subtype) || m.subtype : '';
    rows.push([e.action, e.from || '', e.action === 'write' ? [...e.dir, e.file].join('/') : '', e.category || '', sub, p?.name || '', (m.tags || []).join(', '), m.rating || '', m.fav ? 'sí' : '', e.reason || (e.duplicate ? 'duplicado' : '')]);
  }
  return '﻿' + rows.map((r) => r.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\r\n');
}
