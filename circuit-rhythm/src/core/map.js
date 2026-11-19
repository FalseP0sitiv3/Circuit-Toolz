// core/map.js — mapa de la colección: PCA de rasgos medidos, con escala común en los dos ejes
export function featureVec(a) {
  if (!a || !a.bands) return null;
  const b = a.bands;
  return [
    Math.log2((a.activeDur || 0.01) + 0.01), Math.log2((a.centroid || 100) / 100), b.sub + b.low, b.lowmid + b.mid, b.high + b.air,
    a.flatness || 0, Math.log2((a.attackMs || 0) + 1), a.f0conf > 0.6 ? 1 : 0, Math.min(1, (a.envDepthDb || 0) / 30), a.loopBpm ? 1 : 0,
  ];
}
function powerIter(C, d, skip) {
  let v = Array.from({ length: d }, (_, i) => Math.sin(i + 1));
  for (let it = 0; it < 80; it++) {
    let w = Array(d).fill(0);
    for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) w[i] += C[i][j] * v[j];
    if (skip) { const dp = w.reduce((s, x, i) => s + x * skip[i], 0); w = w.map((x, i) => x - dp * skip[i]); }
    const n = Math.hypot(...w) || 1; v = w.map((x) => x / n);
  }
  return v;
}
// items: [{id, analysis}] → {points:[{id,x,y}], explained}
export function pca(items) {
  const rows = items.map((it) => ({ id: it.id, v: featureVec(it.analysis) })).filter((r) => r.v);
  if (rows.length < 3) return { points: rows.map((r, i) => ({ id: r.id, x: i, y: 0 })) };
  const d = rows[0].v.length;
  const mean = Array(d).fill(0), sd = Array(d).fill(0);
  for (const r of rows) r.v.forEach((x, i) => (mean[i] += x / rows.length));
  for (const r of rows) r.v.forEach((x, i) => (sd[i] += (x - mean[i]) ** 2 / rows.length));
  const Z = rows.map((r) => r.v.map((x, i) => (x - mean[i]) / (Math.sqrt(sd[i]) || 1)));
  const C = Array.from({ length: d }, () => Array(d).fill(0));
  for (const z of Z) for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) C[i][j] += (z[i] * z[j]) / Z.length;
  const p1 = powerIter(C, d), p2 = powerIter(C, d, p1);
  const pts = Z.map((z, k) => ({ id: rows[k].id, x: z.reduce((s, v, i) => s + v * p1[i], 0), y: z.reduce((s, v, i) => s + v * p2[i], 0) }));
  return { points: pts };
}
// "Parecidos a lo que usas": vecinos de tus referencias que aún no están en packs
export function nearYourFavourites(items, refIds, exclude, n = 30) {
  const byId = new Map(items.map((i) => [i.id, featureVec(i.analysis)]));
  const refs = [...refIds].map((id) => byId.get(id)).filter(Boolean);
  if (!refs.length) return [];
  const out = [];
  for (const it of items) {
    if (refIds.has(it.id) || exclude.has(it.id)) continue;
    const v = byId.get(it.id); if (!v) continue;
    let best = Infinity, ref = null;
    refs.forEach((r, k) => { const dd = Math.hypot(...v.map((x, i) => x - r[i])); if (dd < best) { best = dd; ref = k; } });
    out.push({ id: it.id, d: best, ref: [...refIds][ref] });
  }
  return out.sort((a, b) => a.d - b.d).slice(0, n);
}

// ---------- v2.0: seleccionar en el mapa ----------
// Rasgos normalizados (media 0, desviación 1 por rasgo): así ninguno pesa más solo por su escala.
// items: [{id, analysis}] → Map id → vector
export function zVectors(items) {
  const rows = items.map((it) => ({ id: it.id, v: featureVec(it.analysis) })).filter((r) => r.v);
  const out = new Map(); if (!rows.length) return out;
  const d = rows[0].v.length, mean = Array(d).fill(0), sd = Array(d).fill(0);
  for (const r of rows) r.v.forEach((x, i) => (mean[i] += x / rows.length));
  for (const r of rows) r.v.forEach((x, i) => (sd[i] += (x - mean[i]) ** 2 / rows.length));
  for (const r of rows) out.set(r.id, r.v.map((x, i) => (x - mean[i]) / (Math.sqrt(sd[i]) || 1)));
  return out;
}
// Los n más parecidos a una o varias referencias (distancia a la referencia más cercana), sin las propias referencias
export function nearestIds(zmap, refIds, n = 25) {
  const refs = [...refIds].map((id) => zmap.get(id)).filter(Boolean);
  if (!refs.length) return [];
  const out = [];
  for (const [id, v] of zmap) {
    if (refIds.has(id)) continue;
    let best = Infinity;
    for (const r of refs) { let s = 0; for (let i = 0; i < v.length; i++) s += (v[i] - r[i]) ** 2; if (s < best) best = s; }
    out.push({ id, d: Math.sqrt(best) });
  }
  return out.sort((a, b) => a.d - b.d).slice(0, n);
}
// Carácter que se lee en lo medido (para resaltar en el mapa). Etiquetas en español; la interfaz las traduce.
export const MEASURED_CHARS = ['Oscuro', 'Brillante', 'Grave', 'Corto', 'Largo', 'Ruidoso', 'Tonal', 'Con pegada', 'Suave'];
export function measuredChar(a) {
  if (!a || !a.bands || a.error) return [];
  const out = [], b = a.bands;
  if (a.centroid < 900) out.push('Oscuro');
  if (a.centroid > 6000) out.push('Brillante');
  if (b.sub + b.low > 0.55) out.push('Grave');
  if ((a.activeDur || 0) < 0.25) out.push('Corto');
  if ((a.activeDur || 0) > 2) out.push('Largo');
  if ((a.flatness || 0) > 0.35) out.push('Ruidoso');
  if ((a.f0conf || 0) > 0.7) out.push('Tonal');
  if ((a.attackMs ?? 99) < 5 && (a.envDepthDb || 0) > 20) out.push('Con pegada');
  if ((a.attackMs || 0) > 60) out.push('Suave');
  return out;
}
// Puntos dentro de un rectángulo (coordenadas del mapa)
export function inRect(points, x0, y0, x1, y1) {
  const [a, b] = [Math.min(x0, x1), Math.max(x0, x1)], [c, d] = [Math.min(y0, y1), Math.max(y0, y1)];
  return points.filter((p) => p.x >= a && p.x <= b && p.y >= c && p.y <= d).map((p) => p.id);
}

// ---------- v2.1: grupos de sonidos parecidos (k-means sobre los rasgos normalizados) ----------
// Determinista: arranca con k-means++ con una semilla fija. k por defecto ≈ √(n/2), entre 2 y 12.
export function groupCount(n) { return Math.max(2, Math.min(12, Math.round(Math.sqrt(n / 2)))); }
export function kmeansGroups(zmap, k = null, { iters = 40, seed = 7 } = {}) {
  const ids = [...zmap.keys()], X = ids.map((id) => zmap.get(id)), n = X.length;
  if (n < 4) return { k: 0, groups: [], of: new Map() };
  k = Math.min(n, k || groupCount(n));
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const d2 = (a, b) => { let t = 0; for (let i = 0; i < a.length; i++) t += (a[i] - b[i]) ** 2; return t; };
  const C = [X[Math.floor(rnd() * n)].slice()];
  while (C.length < k) {
    const w = X.map((x) => Math.min(...C.map((c) => d2(x, c)))), tot = w.reduce((a, b) => a + b, 0);
    let r = rnd() * tot, i = 0; while (i < n - 1 && (r -= w[i]) > 0) i++;
    C.push(X[i].slice());
  }
  const lab = new Array(n).fill(0);
  for (let it = 0; it < iters; it++) {
    let moved = false;
    for (let i = 0; i < n; i++) { let b = 0, bd = Infinity; for (let j = 0; j < k; j++) { const dd = d2(X[i], C[j]); if (dd < bd) { bd = dd; b = j; } } if (lab[i] !== b) { lab[i] = b; moved = true; } }
    for (let j = 0; j < k; j++) { const m = X.filter((_, i) => lab[i] === j); if (m.length) C[j] = C[j].map((_, d) => m.reduce((a, x) => a + x[d], 0) / m.length); }
    if (!moved && it) break;
  }
  const groups = Array.from({ length: k }, (_, j) => ({ id: j, ids: ids.filter((_, i) => lab[i] === j) })).filter((g) => g.ids.length).sort((a, b) => b.ids.length - a.ids.length);
  groups.forEach((g, i) => { g.id = i; });
  const of = new Map(); for (const g of groups) for (const id of g.ids) of.set(id, g.id);
  return { k: groups.length, groups, of };
}
