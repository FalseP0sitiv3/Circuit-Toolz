// Huellas, niveles de duplicado, similitud técnica y diferencias parámetro a parámetro.
import { describeOffset, formatValue, macroDestInfo, GROUP_LABELS } from './params.js';
import { featureVector } from './patch.js';

// Hash rápido (dos FNV-1a de 32 bits) para indexar; la igualdad se confirma byte a byte.
export function quickHash(bytes, from = 0, to = bytes.length) {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x9e3779b9;
  for (let i = from; i < to; i++) { h1 = Math.imul(h1 ^ bytes[i], 0x01000193); h2 = Math.imul(h2 ^ bytes[i], 0x5bd1e995); h2 ^= h2 >>> 15; }
  return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0'));
}
export async function sha256(bytes) {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// Zonas de comparación:
//  payload → 0–339 completo; synth → 32–339 (sin nombre/metadatos); core → 32–203 (sin macros);
//  macros → 204–339; macroRoutes → macros sin las 8 posiciones guardadas.
export function fingerprints(payload) {
  const routes = new Uint8Array(128);
  for (let k = 0; k < 8; k++) routes.set(payload.slice(205 + 17 * k, 221 + 17 * k), 16 * k);
  return { payload: quickHash(payload), synth: quickHash(payload, 32, 340), core: quickHash(payload, 32, 204), macros: quickHash(payload, 204, 340), macroRoutes: quickHash(routes) };
}

const eqRange = (a, b, from, to) => { for (let i = from; i < to; i++) if (a[i] !== b[i]) return false; return true; };

export function relation(a, b) {
  if (eqRange(a, b, 0, 340)) return { level: 'payload', label: 'Duplicado binario (carga idéntica)' };
  if (eqRange(a, b, 32, 340)) return { level: 'synth', label: 'Duplicado de síntesis (solo cambian nombre/metadatos)' };
  if (eqRange(a, b, 32, 204)) {
    let routesEq = true;
    for (let k = 0; k < 8; k++) if (!eqRange(a, b, 205 + 17 * k, 221 + 17 * k)) routesEq = false;
    return routesEq ? { level: 'macro-position', label: 'Variante de posición de macros' } : { level: 'macro', label: 'Variante de macros' };
  }
  const n = diffParams(a, b).filter((d) => d.off >= 32 && d.off < 204).length;
  if (n <= 6) return { level: 'param', label: `Variante de parámetros (${n} diferencia${n === 1 ? '' : 's'} en el núcleo)`, count: n };
  return { level: 'different', label: 'Patches distintos', count: n };
}

// Similitud técnica 0–1 sobre parámetros normalizados. NO equivale a similitud sonora.
export function similarity(a, b) {
  const va = featureVector(a), vb = featureVector(b);
  let num = 0, den = 0;
  for (let i = 0; i < va.length; i++) {
    const w = va[i].w; den += w;
    if ('cat' in va[i]) num += w * (va[i].cat === vb[i].cat ? 1 : 0);
    else num += w * (1 - Math.abs(va[i].x - vb[i].x));
  }
  return den ? num / den : 0;
}

export function diffParams(a, b) {
  const out = [];
  for (let o = 0; o < 340; o++) {
    if (a[o] === b[o]) continue;
    const d = describeOffset(o);
    out.push({ off: o, group: d.group, label: d.label, a: a[o], b: b[o], fa: fmt(o, d, a[o]), fb: fmt(o, d, b[o]), ev: d.ev, hint: influence(d, a[o], b[o]) });
  }
  return out;
}
function fmt(o, d, v) {
  if (d.param) return formatValue(d.param, v);
  if (o >= 204 && (o - 205) % 17 % 4 === 0 && (o - 204) % 17 !== 0) return macroDestInfo(v).label;
  return String(v);
}
// Posible influencia (orientativa) del cambio A→B.
function influence(d, a, b) {
  const k = d.param?.key || '';
  const up = b > a;
  if (k === 'filter.freq') return up ? 'Filtro más abierto: probable más brillo' : 'Filtro más cerrado: probable menos brillo';
  if (k === 'filter.res') return up ? 'Más resonancia: pico más marcado' : 'Menos resonancia';
  if (k === 'env1.a') return up ? 'Entrada más lenta' : 'Ataque más inmediato';
  if (k === 'env1.d' || k === 'env1.r') return up ? 'Notas con cola más larga' : 'Notas más cortas';
  if (k === 'env1.s') return up ? 'Más sostenido' : 'Más percusivo';
  if (k === 'filter.drive' || k === 'fx.dist') return up ? 'Más saturación' : 'Más limpio';
  if (k === 'voice.poly') return 'Cambia la polifonía y el comportamiento del glide';
  if (k.endsWith('.wave')) return 'Cambia la forma de onda base';
  if (k.endsWith('.semi') || k === 'voice.octave') return 'Cambia la afinación / registro';
  if (d.group === 'macros') return 'Cambia lo que hacen las macros, no el sonido en reposo (salvo la posición)';
  if (d.group === 'matrix') return 'Cambia una ruta de modulación';
  if (d.group === 'meta') return 'Solo metadatos';
  return '';
}

export function groupDiff(diffs) {
  const g = {};
  for (const d of diffs) (g[d.group] ||= []).push(d);
  return Object.entries(g).map(([group, items]) => ({ group, label: GROUP_LABELS[group] || group, items }));
}

// Agrupa una colección por nivel. records: [{id, payload, fp}]
export function groupDuplicates(records) {
  const by = (key) => { const m = new Map(); for (const r of records) { const k = r.fp[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r.id); } return [...m.values()].filter((x) => x.length > 1); };
  const payload = by('payload'), synth = by('synth'), core = by('core');
  // Variantes de macros: mismo núcleo pero distinta huella de síntesis.
  const macroVariants = core.filter((ids) => new Set(ids.map((id) => records.find((r) => r.id === id).fp.synth)).size > 1);
  return { payload, synth, macroVariants };
}

export function nearest(target, records, k = 8) {
  return records.filter((r) => r.payload !== target).map((r) => ({ id: r.id, s: similarity(target, r.payload) })).sort((a, b) => b.s - a.s).slice(0, k);
}
