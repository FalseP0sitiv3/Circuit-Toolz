// core/lab.js — v3.8: laboratorio de sonido. Patches nuevos a partir de los que ya tienes:
//  · mutar:   variaciones de un patch, con la intensidad y las partes que elijas
//  · cruzar:  hijos de dos (o más) patches, bloque a bloque (osciladores, filtro, envolventes, LFO, efectos, matriz)
//  · mezclar: un punto intermedio entre A y B (los valores continuos se interpolan; los de tipo cambian a mitad)
// Nunca se tocan el nombre, la categoría ni los bytes reservados. Las macros son siempre las del patch de partida,
// para que los knobs sigan haciendo lo mismo. Los resultados pasan por un saneado que evita patches mudos.
import { PARAMS } from './params.js';

export const LAB_GROUPS = { osc: ['osc1', 'osc2', 'mixer'], filter: ['filter'], env: ['env1', 'env2', 'env3'], mod: ['lfo1', 'lfo2'], fx: ['fx', 'eq'] };
export const LAB_GROUP_IDS = Object.keys(LAB_GROUPS);
// sd: desviación típica como fracción del rango; flip: probabilidad de cambiar un parámetro de tipo (onda, filtro…)
export const LAB_AMOUNTS = { subtle: { sd: 0.06, flip: 0 }, medium: { sd: 0.14, flip: 0.1 }, wild: { sd: 0.3, flip: 0.35 } };
export const LAB_BLOCKS = ['osc1', 'osc2', 'mixer', 'filter', 'env1', 'env2', 'env3', 'lfo1', 'lfo2', 'fx', 'eq', 'matrix'];
const MATRIX = [124, 204];                       // 20 ranuras × 4 bytes: fuente 1, fuente 2, profundidad, destino
// Se conservan siempre: la afinación (semitonos, bend), la voz y los bits de las LFO
const KEEP = new Set(['osc1.semi', 'osc2.semi', 'osc1.bend', 'osc2.bend', 'lfo1.flags', 'lfo2.flags']);
const SYNC = new Set(['lfo1.delaysync', 'lfo1.ratesync', 'lfo2.delaysync', 'lfo2.ratesync', 'fx.chorussync']);
const discrete = (p) => !!p.enum || !!p.flags || SYNC.has(p.key);
const clampP = (p, v) => Math.max(p.min, Math.min(p.max, Math.round(v)));

export function labRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gauss(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
const groupsFor = (ids) => new Set(ids.flatMap((g) => LAB_GROUPS[g] || []));

// Que el resultado suene: algún oscilador audible, una envolvente de amplitud que deje oír la frase y un filtro
// paso bajo que no quede cerrado del todo. Lo que estaba así en el patch de partida se respeta.
export function labSanitize(out, ref) {
  const lv = (b) => Math.max(b[54], b[55], b[56], b[57]);
  if (lv(out) < 40 && lv(ref) >= 40) { for (const o of [54, 55, 56, 57]) out[o] = Math.max(out[o], ref[o]); }
  if (out[70] > 110 && ref[70] <= 110) out[70] = Math.max(ref[70], 100);                  // ataque de amplitud eterno
  if (out[71] < 12 && out[72] < 12 && !(ref[71] < 12 && ref[72] < 12)) out[71] = Math.max(ref[71], 30); // un clic sin cuerpo
  const lp = out[63] <= 1, closed = out[64] < 18 && out[68] <= 66;
  if (lp && closed && !(ref[63] <= 1 && ref[64] < 18 && ref[68] <= 66)) out[64] = Math.max(18, ref[64]);
  for (const p of PARAMS) out[p.off] = clampP(p, out[p.off]);
  return out;
}

// Variación de un patch
export function labMutate(payload, { amount = 'medium', groups = ['filter', 'env', 'mod', 'fx'], seed = 1 } = {}) {
  const A = LAB_AMOUNTS[amount] || LAB_AMOUNTS.medium, r = labRng(seed), gs = groupsFor(groups), out = new Uint8Array(payload);
  for (const p of PARAMS) {
    if (!gs.has(p.group) || KEEP.has(p.key)) continue;
    if (discrete(p)) { if (A.flip && r() < A.flip) out[p.off] = p.min + Math.floor(r() * (p.max - p.min + 1)); continue; }
    const span = p.key.endsWith('.cents') ? 24 : p.max - p.min;   // los cents, poco: desafinar no es variar
    out[p.off] = clampP(p, payload[p.off] + gauss(r) * A.sd * span);
  }
  return labSanitize(out, payload);
}

// Hijo de varios padres, bloque a bloque. El primero es el patch de partida (nombre, categoría, voz y macros).
// Devuelve { payload, from: {bloque: índice del padre} }.
export function labCross(parents, { seed = 1, mutate = 'subtle' } = {}) {
  const r = labRng(seed), base = parents[0], out = new Uint8Array(base), from = {};
  for (const bl of LAB_BLOCKS) from[bl] = Math.floor(r() * parents.length);
  // con dos padres, que haya algo de cada uno
  const used = new Set(Object.values(from));
  if (parents.length > 1 && used.size === 1) { const bl = LAB_BLOCKS[Math.floor(r() * LAB_BLOCKS.length)]; from[bl] = (from[bl] + 1) % parents.length; }
  for (const p of PARAMS) { if (from[p.group] != null) out[p.off] = parents[from[p.group]][p.off]; }
  out.set(parents[from.matrix].subarray(MATRIX[0], MATRIX[1]), MATRIX[0]);
  const child = mutate ? labMutate(out, { amount: mutate, groups: LAB_GROUP_IDS.filter((g) => g !== 'osc'), seed: seed * 7 + 3 }) : labSanitize(out, base);
  return { payload: child, from };
}

// Punto intermedio entre A (t = 0) y B (t = 1)
export function labMorph(a, b, t) {
  const out = new Uint8Array(a), k = Math.max(0, Math.min(1, t));
  for (const p of PARAMS) out[p.off] = discrete(p) || KEEP.has(p.key) ? (k < 0.5 ? a[p.off] : b[p.off]) : clampP(p, a[p.off] + (b[p.off] - a[p.off]) * k);
  // matriz: la profundidad se interpola si la ranura hace lo mismo en los dos; si no, cambia a mitad
  for (let o = MATRIX[0]; o < MATRIX[1]; o += 4) {
    const same = a[o] === b[o] && a[o + 1] === b[o + 1] && a[o + 3] === b[o + 3];
    if (same) out[o + 2] = Math.round(a[o + 2] + (b[o + 2] - a[o + 2]) * k);
    else if (k >= 0.5) out.set(b.subarray(o, o + 4), o);
  }
  return labSanitize(out, k < 0.5 ? a : b);
}

// Lo que más cambia entre dos patches (fracción del rango), para describir un resultado en una línea
export function labChanges(a, b, n = 3) {
  const out = [];
  for (const p of PARAMS) {
    const d = b[p.off] - a[p.off]; if (!d) continue;
    out.push({ key: p.key, label: p.label, group: p.group, d, rel: discrete(p) ? 0.5 : Math.abs(d) / Math.max(1, p.max - p.min), discrete: discrete(p), to: b[p.off], p });
  }
  return out.sort((x, y) => y.rel - x.rel).slice(0, n);
}
// Cuánto se parece a A, de 0 a 1 (media de las diferencias relativas de todos los parámetros)
export function labCloseness(a, b) {
  let s = 0; for (const p of PARAMS) s += discrete(p) ? (a[p.off] === b[p.off] ? 0 : 1) : Math.abs(a[p.off] - b[p.off]) / Math.max(1, p.max - p.min);
  return 1 - s / PARAMS.length;
}
