// Familias de patches (duplicados y variantes agrupados) y mapa 2D de similitud técnica.
import { similarity, relation } from './compare.js';
import { baseName, matchText } from './classify.js';
import { featureVector } from './patch.js';

// items: [{id, payload, fp, name, fileName, importedAt}]
// Une: misma síntesis (32–339), mismo núcleo (32–203: variantes de macros), y mismo nombre base con
// similitud técnica ≥ simNamed (variantes de parámetros con nombre emparentado).
export function buildFamilies(items, { simNamed = 0.9 } = {}) {
  const parent = new Map(items.map((x) => [x.id, x.id]));
  const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
  const byKey = (fn) => { const m = new Map(); for (const x of items) { const k = fn(x); if (!k) continue; if (m.has(k)) union(m.get(k), x.id); else m.set(k, x.id); } };
  byKey((x) => x.fp.synth); byKey((x) => x.fp.core);
  const byName = new Map();
  // Nombres genéricos («Bass 01», «Pad 2») no indican parentesco: solo se agrupan nombres con alguna palabra propia.
  for (const x of items) { const k = baseName(x.name) || baseName(x.fileName); if (!k || k.length < 3 || !matchText(k).unknown.length) continue; (byName.get(k) || byName.set(k, []).get(k)).push(x); }
  for (const group of byName.values()) {
    if (group.length < 2 || group.length > 60) continue;
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) if (find(group[i].id) !== find(group[j].id) && similarity(group[i].payload, group[j].payload) >= simNamed) union(group[i].id, group[j].id);
  }
  const fams = new Map();
  for (const x of items) { const r = find(x.id); (fams.get(r) || fams.set(r, []).get(r)).push(x); }
  return [...fams.values()].filter((m) => m.length > 1).map((members) => {
    members.sort((a, b) => (a.kind === 'variant') - (b.kind === 'variant') || (a.importedAt < b.importedAt ? -1 : 1));
    const head = members[0];
    return { id: head.id, head: head.id, members: members.map((m) => ({ id: m.id, rel: m === head ? null : relation(head.payload, m.payload) })) };
  });
}

// PCA a 2 componentes sobre vectores de parámetros (one-hot para listas).
export function vectorize(payload) {
  const out = [];
  for (const v of featureVector(payload)) {
    if ('cat' in v) {
      const isWave = v.k.startsWith('osc') && v.k.endsWith('.wave');
      const k = v.k === 'voice.poly' ? 3 : v.k === 'filter.type' ? 6 : isWave ? 4 : 2;
      const bucket = isWave ? (v.cat <= 1 ? 0 : v.cat <= 11 ? 1 : (v.cat <= 13 || v.cat === 15) ? 2 : 3) : v.cat % k;
      for (let i = 0; i < k; i++) out.push(i === bucket ? v.w * 0.7 : 0);
    }
    else out.push(v.x * v.w);
  }
  return out;
}
export function pca2(rows) {
  const n = rows.length; if (n < 3) return rows.map((_, i) => [i, 0]);
  const d = rows[0].length, mean = new Float64Array(d);
  for (const r of rows) for (let j = 0; j < d; j++) mean[j] += r[j] / n;
  const X = rows.map((r) => r.map((v, j) => v - mean[j]));
  const cov = Array.from({ length: d }, () => new Float64Array(d));
  for (const r of X) for (let a = 0; a < d; a++) { const ra = r[a]; if (!ra) continue; for (let b = a; b < d; b++) cov[a][b] += ra * r[b]; }
  for (let a = 0; a < d; a++) for (let b = 0; b < a; b++) cov[a][b] = cov[b][a];
  const comps = [];
  for (let c = 0; c < 2; c++) {
    let v = Array.from({ length: d }, (_, i) => Math.sin(i * 1.7 + c + 1));
    for (let it = 0; it < 120; it++) {
      const w = new Float64Array(d);
      for (let a = 0; a < d; a++) { let s = 0; for (let b = 0; b < d; b++) s += cov[a][b] * v[b]; w[a] = s; }
      for (const p of comps) { const dot = w.reduce((s, x, i) => s + x * p[i], 0); for (let i = 0; i < d; i++) w[i] -= dot * p[i]; }
      const norm = Math.hypot(...w) || 1; v = Array.from(w, (x) => x / norm);
    }
    comps.push(v);
  }
  return X.map((r) => comps.map((p) => r.reduce((s, x, i) => s + x * p[i], 0)));
}

// Afinidad con «lo que sueles usar»: media de las 3 mayores similitudes con el conjunto de referencia.
export function affinity(target, refs) {
  if (!refs.length) return 0;
  const s = refs.map((r) => similarity(target, r)).sort((a, b) => b - a).slice(0, 3);
  return s.reduce((a, b) => a + b, 0) / s.length;
}
