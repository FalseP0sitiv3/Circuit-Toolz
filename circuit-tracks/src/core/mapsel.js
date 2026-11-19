// core/mapsel.js — v3.5: seleccionar en el mapa (los más parecidos y por zona), como en la herramienta de la Rhythm.
// El parecido se mide en los parámetros de síntesis normalizados (media 0, desviación 1 por parámetro), así ningún
// parámetro pesa más solo por su escala.

// entries: [[id, vector]] → Map id → vector normalizado
export function zScoreMap(entries) {
  const out = new Map(); if (!entries.length) return out;
  const d = entries[0][1].length, n = entries.length, mean = new Float64Array(d), sd = new Float64Array(d);
  for (const [, v] of entries) for (let i = 0; i < d; i++) mean[i] += v[i] / n;
  for (const [, v] of entries) for (let i = 0; i < d; i++) sd[i] += (v[i] - mean[i]) ** 2 / n;
  for (let i = 0; i < d; i++) sd[i] = Math.sqrt(sd[i]) || 1;
  for (const [id, v] of entries) { const z = new Float64Array(d); for (let i = 0; i < d; i++) z[i] = (v[i] - mean[i]) / sd[i]; out.set(id, z); }
  return out;
}
// Los n más parecidos a una o varias referencias (distancia a la referencia más cercana), sin las referencias
export function nearestByZ(zmap, refIds, n = 25, skip = null) {
  const refs = [...refIds].map((id) => zmap.get(id)).filter(Boolean);
  if (!refs.length) return [];
  const out = [];
  for (const [id, v] of zmap) {
    if (refIds.has(id) || (skip && skip(id))) continue;
    let best = Infinity;
    for (const r of refs) { let s = 0; for (let i = 0; i < v.length; i++) s += (v[i] - r[i]) ** 2; if (s < best) best = s; }
    out.push({ id, d: Math.sqrt(best) });
  }
  return out.sort((a, b) => a.d - b.d).slice(0, n);
}
// Puntos (en pantalla) dentro de un rectángulo, en cualquier dirección
export function rectIds(points, x0, y0, x1, y1) {
  const [a, b] = [Math.min(x0, x1), Math.max(x0, x1)], [c, d] = [Math.min(y0, y1), Math.max(y0, y1)];
  return points.filter((p) => p.X >= a && p.X <= b && p.Y >= c && p.Y <= d).map((p) => p.id);
}
