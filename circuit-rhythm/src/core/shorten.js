// core/shorten.js — acortar loops repetitivos por slices (ahorrar tiempo del pack, 228 s).
// Dos piezas:
//  1) repetition(): mide cuánto se parecen las partes (mitades, cuartos, octavos) de un loop y propone
//     quedarse con menos (p. ej. 1 de 2 mitades, o el compás 1 + el remate del compás 4).
//  2) applyKeep(): la receta {n, sel} se aplica al exportar: concatena las slices elegidas, con un fundido
//     cruzado muy corto en cada unión y en el punto de bucle, para que no haga clic al repetirse.
// Todo es no destructivo: el original no se toca.
import { fft } from './dsp.js';

export const KEEP_XFADE_MS = 2;   // unión entre slices no contiguas
export const LOOP_XFADE_MS = 3;   // final → principio (cuando la Rhythm repite el sample)
export const REPEAT_HIGH = 0.9;   // «se repite»
export const REPEAT_MID = 0.8;    // «parecidas, con variaciones»

// "1-4, 7 8" → [0,1,2,3,6,7] (1-based → 0-based, admite repetir y reordenar). null si no es válido.
export function parseSel(text, n) {
  const out = [];
  const parts = String(text || '').split(/[\s,;]+/).filter(Boolean);
  if (!parts.length) return null;
  for (const p of parts) {
    const m = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(p);
    if (!m) return null;
    const a = +m[1], b = m[2] != null ? +m[2] : a;
    if (a < 1 || b < 1 || a > n || b > n) return null;
    const step = a <= b ? 1 : -1;
    for (let k = a; step > 0 ? k <= b : k >= b; k += step) out.push(k - 1);
  }
  return out.length && out.length <= 64 ? out : null;
}
// [0,1,2,3,6,7] → "1-4, 7-8"
export function selText(sel) {
  const out = [];
  for (let i = 0; i < sel.length; ) {
    let j = i;
    while (j + 1 < sel.length && sel[j + 1] === sel[j] + 1) j++;
    out.push(j > i ? `${sel[i] + 1}-${sel[j] + 1}` : `${sel[i] + 1}`);
    i = j + 1;
  }
  return out.join(', ');
}
export function validKeep(k) {
  return !!(k && Number.isInteger(k.n) && k.n >= 2 && k.n <= 64 && Array.isArray(k.sel) && k.sel.length >= 1 && k.sel.length <= 64 && k.sel.every((i) => Number.isInteger(i) && i >= 0 && i < k.n));
}
// ¿la receta deja el loop igual que estaba? (todas las slices, en orden)
export function keepIsIdentity(k) { return !validKeep(k) || (k.sel.length === k.n && k.sel.every((v, i) => v === i)); }
export const keepFraction = (k) => (validKeep(k) ? k.sel.length / k.n : 1);

const bounds = (N, n) => Array.from({ length: n + 1 }, (_, i) => Math.round((i * N) / n));
const eqPow = (u) => Math.sin((Math.PI / 2) * u);

// Aplica {n, sel} sobre y (mono). Devuelve un Float32Array nuevo.
export function applyKeep(y, keep, rate) {
  if (keepIsIdentity(keep)) return y;
  const N = y.length, b = bounds(N, keep.n), sel = keep.sel;
  const len = sel.reduce((a, i) => a + (b[i + 1] - b[i]), 0);
  const out = new Float32Array(len);
  const X = Math.max(1, Math.round((KEEP_XFADE_MS * rate) / 1000));
  let pos = 0;
  for (let j = 0; j < sel.length; j++) {
    const i = sel[j], a = b[i], e = b[i + 1], L = e - a;
    out.set(y.subarray(a, e), pos);
    // unión: si la slice anterior no es la que va justo antes en el original, fundido cruzado con
    // la continuación natural de la anterior (lo que sonaba después de ella) → sin clic y sin hueco.
    if (j > 0 && sel[j - 1] + 1 !== i) {
      const cont = b[sel[j - 1] + 1];
      const n = Math.min(X, L);
      for (let k = 0; k < n; k++) {
        const u = k / n, prev = cont + k < N ? y[cont + k] : 0;
        out[pos + k] = y[a + k] * eqPow(u) + prev * eqPow(1 - u);
      }
    }
    pos += L;
  }
  // punto de bucle: el final debe llevar a la primera slice como en el original.
  // Lo que en el original va justo antes de la primera slice (o el final del loop si es la 1) se mezcla
  // en los últimos ms: al repetirse no hay salto.
  const first = sel[0], last = sel[sel.length - 1];
  if (!(last + 1 === keep.n && first === 0) && !(last + 1 === first)) {
    const n = Math.min(Math.round((LOOP_XFADE_MS * rate) / 1000), len);
    const src = first > 0 ? b[first] : N; // muestras justo antes de la primera slice
    for (let k = 0; k < n; k++) {
      const idx = src - n + k, u = (k + 1) / n;
      const lead = idx >= 0 && idx < N ? y[idx] : 0;
      const o = len - n + k;
      out[o] = out[o] * eqPow(1 - u) + lead * eqPow(u);
    }
  }
  return out;
}

// ---------- parecido entre partes ----------
// Rasgos por trama (10 ms): energía en 16 bandas logarítmicas (dB). Se resta la media de cada banda en
// todo el loop, así se compara el ritmo y el timbre en el tiempo, no el color general (que comparten
// también dos compases distintos).
function frames(x, sr) {
  const hop = Math.max(1, Math.round(sr * 0.01)), W = 1024;
  const nb = 16, f0 = 40, f1 = Math.min(16000, sr / 2 - 1);
  const edges = Array.from({ length: nb + 1 }, (_, i) => Math.round(((f0 * Math.pow(f1 / f0, i / nb)) / sr) * W));
  const win = new Float32Array(W); for (let i = 0; i < W; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (W - 1));
  const nF = Math.max(1, Math.floor(x.length / hop));
  const F = new Float32Array(nF * nb);
  const re = new Float64Array(W), im = new Float64Array(W);
  for (let f = 0; f < nF; f++) {
    const c = f * hop - W / 2;
    for (let i = 0; i < W; i++) { const k = c + i; re[i] = k >= 0 && k < x.length ? x[k] * win[i] : 0; im[i] = 0; }
    fft(re, im);
    for (let bnd = 0; bnd < nb; bnd++) {
      let s = 0; const a = Math.max(1, edges[bnd]), e = Math.max(a + 1, edges[bnd + 1]);
      for (let k = a; k < e && k < W / 2; k++) s += re[k] * re[k] + im[k] * im[k];
      F[f * nb + bnd] = 10 * Math.log10(1e-10 + s / (e - a));
    }
  }
  // suelo de ruido: lo que esté 70 dB por debajo del máximo cuenta igual (silencio = silencio)
  let mx = -Infinity; for (let i = 0; i < F.length; i++) if (F[i] > mx) mx = F[i];
  for (let i = 0; i < F.length; i++) if (F[i] < mx - 70) F[i] = mx - 70;
  const mu = new Float64Array(nb);
  for (let f = 0; f < nF; f++) for (let bnd = 0; bnd < nb; bnd++) mu[bnd] += F[f * nb + bnd] / nF;
  for (let f = 0; f < nF; f++) for (let bnd = 0; bnd < nb; bnd++) F[f * nb + bnd] -= mu[bnd];
  return { F, nF, nb, hop };
}
// Parecido entre dos tramos de tramas (correlación; tolera ±2 tramas de desfase por redondeo)
function simFrames(fr, a0, b0, len) {
  const { F, nb, nF } = fr;
  let best = -1;
  for (let lag = -2; lag <= 2; lag++) {
    let sa = 0, sb = 0, sab = 0, saa = 0, sbb = 0, n = 0;
    for (let f = 0; f < len; f++) {
      const fa = a0 + f, fb = b0 + f + lag;
      if (fa < 0 || fb < 0 || fa >= nF || fb >= nF) continue;
      for (let k = 0; k < nb; k++) { const u = F[fa * nb + k], v = F[fb * nb + k]; sa += u; sb += v; sab += u * v; saa += u * u; sbb += v * v; n++; }
    }
    if (n < nb * 4) continue;
    const cov = sab - (sa * sb) / n, va = saa - (sa * sa) / n, vb = sbb - (sb * sb) / n;
    const r = va > 1e-9 && vb > 1e-9 ? cov / Math.sqrt(va * vb) : (va <= 1e-9 && vb <= 1e-9 ? 1 : 0);
    if (r > best) best = r;
  }
  return Math.max(0, best);
}
// ¿copia exacta? correlación de la onda (±2 ms) — distingue «idénticas» de «muy parecidas»
function waveSim(x, a0, b0, len, sr) {
  const step = Math.max(1, Math.floor(len / 40000)); // como mucho ~40 000 puntos
  const maxLag = Math.round(sr * 0.002);
  let best = 0;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < len; i += step) {
      const j = b0 + i + lag; if (j < 0 || j >= x.length) continue;
      const u = x[a0 + i], v = x[j]; sab += u * v; saa += u * u; sbb += v * v;
    }
    const r = saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
    if (r > best) best = r;
  }
  return best;
}

// x: loop mono (ya recortado/ajustado igual que al exportar), sr. beats: tiempos del loop si se conocen.
// Devuelve { parts: {2:[...],4:[...],8:[...]}, options:[{keep, frac, sim, kind, partBeats}], best }.
export function repetition(x, sr, { beats = null, minBeats = 4 } = {}) {
  const res = { v: 1, beats, parts: {}, options: [], identical: false };
  if (!x || x.length < sr * 0.5) return res;
  const fr = frames(x, sr);
  for (const d of [2, 4, 8]) {
    if (beats) { if (beats % d !== 0 || beats / d < minBeats / 2) continue; }
    else if (x.length / sr / d < 0.4) continue;
    const fb = bounds(fr.nF, d), len = Math.min(...fb.slice(1).map((v, i) => v - fb[i]));
    if (len < 8) continue;
    // matriz de parecido de cada parte con la 1 y la media de todas con todas
    const toFirst = [], m = [];
    for (let i = 0; i < d; i++) { m.push([]); for (let j = 0; j < d; j++) m[i].push(i === j ? 1 : null); }
    for (let i = 0; i < d; i++) for (let j = i + 1; j < d; j++) { const s = simFrames(fr, fb[i], fb[j], len); m[i][j] = m[j][i] = s; }
    for (let i = 1; i < d; i++) toFirst.push(m[0][i]);
    res.parts[d] = { toFirst, matrix: m.map((r) => r.map((v) => Math.round(v * 1000) / 1000)) };
  }
  const opts = [];
  const pb = (d) => (beats ? beats / d : null);
  for (const d of [2, 4, 8]) {
    const P = res.parts[d]; if (!P) continue;
    const okBar = !beats || pb(d) >= minBeats;
    const minAll = Math.min(...P.toFirst);
    // todas las partes como la 1 → quedarse con 1 de d
    if (okBar) opts.push({ keep: { n: d, sel: [0] }, frac: 1 / d, sim: minAll, kind: 'repeat', partBeats: pb(d) });
    // todas como la 1 salvo la última (un remate o fill) → la 1 + la última
    if (d >= 4 && okBar) {
      const head = Math.min(...P.toFirst.slice(0, -1)), lastSim = P.toFirst[P.toFirst.length - 1];
      if (head >= REPEAT_MID && lastSim < head - 0.04) opts.push({ keep: { n: d, sel: [0, d - 1] }, frac: 2 / d, sim: head, lastSim, kind: 'fill', partBeats: pb(d) });
    }
  }
  // exactitud en la onda para las opciones prometedoras
  const B = (n) => bounds(x.length, n);
  for (const o of opts) {
    if (o.sim < REPEAT_HIGH) continue;
    const b = B(o.keep.n), len = Math.min(...b.slice(1).map((v, i) => v - b[i]));
    const others = o.kind === 'fill' ? Array.from({ length: o.keep.n - 2 }, (_, i) => i + 1) : Array.from({ length: o.keep.n - 1 }, (_, i) => i + 1);
    o.wave = Math.min(...others.map((i) => waveSim(x, b[0], b[i], len, sr)));
    o.identical = o.wave > 0.995;
  }
  for (const o of opts) { o.sim = Math.round(o.sim * 1000) / 1000; if (o.lastSim != null) o.lastSim = Math.round(o.lastSim * 1000) / 1000; if (o.wave != null) o.wave = Math.round(o.wave * 10000) / 10000; }
  // orden: las que de verdad se repiten primero y, entre ellas, la más corta
  const good = opts.filter((o) => o.sim >= REPEAT_HIGH).sort((a, b) => a.frac - b.frac || b.sim - a.sim);
  const mid = opts.filter((o) => o.sim >= REPEAT_MID && o.sim < REPEAT_HIGH).sort((a, b) => b.sim - a.sim || a.frac - b.frac);
  res.options = [...good, ...mid];
  res.best = good[0] || null;
  res.identical = !!(good[0] && good[0].identical);
  return res;
}
