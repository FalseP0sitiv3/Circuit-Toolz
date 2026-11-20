// core/hits.js — v2.3: sacar los golpes de un loop (un break, un loop de batería) como one-shots.
// 1. Ataques por flujo espectral con ventanas cortas (≈3 ms de resolución) y umbral adaptativo.
// 2. Cada golpe va de su ataque al siguiente, sin la cola por debajo de −50 dB, con fundidos cortos.
// 3. Cada golpe se mide y se clasifica por el sonido (como cualquier sample).
// 4. Los golpes parecidos de la misma categoría se agrupan: un break con 8 bombos da un grupo «Kick ×8» y se
//    queda el más completo (el de cola más larga, que no corta el golpe siguiente).
import { fft } from './dsp.js';
import { analyze } from './analyze.js';
import { soundScores, CAT_IDS } from './classify.js';

export const HIT_SENS = { low: { k: 2.2, rel: 0.14, gap: 0.07 }, normal: { k: 1.6, rel: 0.07, gap: 0.045 }, high: { k: 1.25, rel: 0.035, gap: 0.03 } };
export const HIT_GROUP_DIST = 0.09;
const HIGH_CATS = ['hat', 'ohat', 'cymbal', 'snare', 'clap', 'perc'];   // distancia de rasgos para «el mismo golpe» (pack.featureDistance)
const N = 512;

function monoSum(channels) {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length, y = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) y[i] += c[i] / channels.length;
  return y;
}
function env1ms(x, sr) {
  const w = Math.max(1, Math.round(sr / 2000)), n = Math.ceil(x.length / w), e = new Float32Array(n);
  for (let j = 0; j < n; j++) { let s = 0; const a = j * w, b = Math.min(x.length, a + w); for (let i = a; i < b; i++) s += x[i] * x[i]; e[j] = Math.sqrt(s / Math.max(1, b - a)); }
  return { e, w };
}

// Ataques (en muestras) de una señal mono
export function hitOnsets(x, sr, sens = 'normal') {
  const P = HIT_SENS[sens] || HIT_SENS.normal, hop = Math.max(64, Math.round(sr / 375)); // ≈2,7 ms
  const frames = Math.floor((x.length - N) / hop) + 1;
  if (frames < 3) return x.length ? [0] : [];
  const w = new Float64Array(N); for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const re = new Float64Array(N), im = new Float64Array(N), flux = new Float64Array(frames);
  let prev = new Float64Array(N / 2);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < N; i++) { re[i] = x[f * hop + i] * w[i]; im[i] = 0; }
    fft(re, im);
    const cur = new Float64Array(N / 2); let s = 0;
    for (let k = 1; k < N / 2; k++) { const m = Math.log1p(100 * Math.hypot(re[k], im[k])); cur[k] = m; if (m > prev[k]) s += m - prev[k]; }
    flux[f] = s; prev = cur;
  }
  let mx = 0; for (const v of flux) mx = Math.max(mx, v);
  const { e, w: ew } = env1ms(x, sr);
  // envolvente de la señal derivada (agudos): marca el ataque aunque suene encima la cola de un bombo
  const dx = new Float32Array(x.length); for (let i = 1; i < x.length; i++) dx[i] = x[i] - x[i - 1];
  const ed = env1ms(dx, sr).e;
  const out = [], gap = Math.round(P.gap * sr);
  for (let f = 1; f < frames - 1; f++) {
    if (!(flux[f] > flux[f - 1] && flux[f] >= flux[f + 1])) continue;
    const win = Array.from(flux.subarray(Math.max(0, f - 16), Math.min(frames, f + 16))).sort((p, q) => p - q);
    if (flux[f] < win[win.length >> 1] * P.k + mx * P.rel) continue;
    // afinar en el tiempo: el mínimo antes del máximo de la envolvente de agudos y, desde ahí, donde sube al 20 %
    const a0 = Math.max(0, Math.floor((f * hop - N / 4) / ew)), a1 = Math.min(ed.length, Math.ceil((f * hop + N + 0.01 * sr) / ew));
    let pj = a0; for (let j = a0; j < a1; j++) if (ed[j] > ed[pj]) pj = j;
    let bj = a0; for (let j = a0; j <= pj; j++) if (ed[j] < ed[bj]) bj = j;
    const thr = ed[bj] + 0.2 * (ed[pj] - ed[bj]);
    let j = bj; while (j < pj && ed[j] < thr) j++;
    const at = Math.max(0, j * ew - Math.round(0.001 * sr));
    if (out.length && at - out[out.length - 1] < gap) continue;
    out.push(at);
  }
  // si el audio empieza sonando, el principio también es un golpe
  if (!out.length || out[0] > gap) {
    let pk0 = 0; for (let j = 0; j < Math.min(e.length, Math.round(0.02 * sr / ew)); j++) pk0 = Math.max(pk0, e[j]);
    let pkAll = 0; for (const v of e) pkAll = Math.max(pkAll, v);
    if (pk0 > pkAll * 0.1) out.unshift(0);
  }
  return out;
}

// Golpes de un audio decodificado: [{a, b, t, dur, cut}] (muestras del original; cut = lo corta el siguiente)
export function findHits(decoded, { sens = 'normal', floorDb = -50 } = {}) {
  const sr = decoded.sampleRate, x = monoSum(decoded.channels);
  const on = hitOnsets(x, sr, sens), { e, w } = env1ms(x, sr), out = [];
  for (let i = 0; i < on.length; i++) {
    const a = on[i], next = i + 1 < on.length ? on[i + 1] : x.length;
    let pk = 0; for (let j = Math.floor(a / w); j < Math.ceil(next / w) && j < e.length; j++) pk = Math.max(pk, e[j]);
    if (pk <= 1e-5) continue;
    const thr = pk * Math.pow(10, floorDb / 20);
    let last = Math.floor(a / w); for (let j = Math.floor(a / w); j < Math.ceil(next / w) && j < e.length; j++) if (e[j] > thr) last = j;
    const b = Math.min(next, (last + 1) * w);
    if (b - a < Math.round(0.01 * sr)) continue;
    out.push({ a, b, t: a / sr, dur: (b - a) / sr, cut: next < x.length && b >= next - w, peak: pk });
  }
  return out;
}

// El audio de un golpe, con todos los canales del original y fundidos cortos (0,5 ms de entrada; de salida
// 4 ms si lo corta el golpe siguiente y 2 ms si acaba solo)
export function hitAudio(decoded, h) {
  const sr = decoded.sampleRate, fi = Math.round(0.0005 * sr), fo = Math.round((h.cut ? 0.004 : 0.002) * sr);
  const channels = decoded.channels.map((c) => {
    const y = c.slice(h.a, h.b);
    for (let i = 0; i < Math.min(fi, y.length); i++) y[i] *= i / fi;
    for (let i = 0; i < Math.min(fo, y.length); i++) y[y.length - 1 - i] *= Math.sin((Math.PI / 2) * (i / fo)) ** 2;
    return y;
  });
  return { channels, sampleRate: sr, bits: decoded.bits, format: decoded.format };
}

// Graves (< 150 Hz) con dos polos: para saber si un golpe trae graves propios o solo lleva la cola del anterior
function lowPass(x, sr, fc = 150) {
  const k = 1 - Math.exp((-2 * Math.PI * fc) / sr), y = new Float32Array(x.length);
  let p1 = 0, p2 = 0;
  for (let i = 0; i < x.length; i++) { p1 += k * (x[i] - p1); p2 += k * (p1 - p2); y[i] = p2; }
  return y;
}
// Paso alto de 4.º orden (dos biquads Butterworth a 200 Hz): quita la cola grave del golpe anterior (−48 dB a 50 Hz)
function highPass4(x, sr, fc = 200) {
  const w = (2 * Math.PI * fc) / sr, cw = Math.cos(w), al = Math.sin(w) / Math.SQRT2, a0 = 1 + al;
  const b0 = (1 + cw) / 2 / a0, b1 = -(1 + cw) / a0, a1 = (-2 * cw) / a0, a2 = (1 - al) / a0;
  let y = x;
  for (let pass = 0; pass < 2; pass++) {
    const z = new Float32Array(y.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < y.length; i++) { const v = b0 * y[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = y[i]; y2 = y1; y1 = v; z[i] = v; }
    y = z;
  }
  return y;
}
// Solo el golpe, para medirlo: hasta que cae 40 dB por debajo de su pico y se queda ahí 5 ms. Lo que suene
// después (el final brusco de la cola de otro golpe, un clic de un recorte mal hecho) no cuenta.
function trimTail(c, sr, dB = -40) {
  const { e, w } = env1ms(c, sr); let pk = 0, pj = 0; for (let j = 0; j < e.length; j++) if (e[j] > pk) { pk = e[j]; pj = j; }
  const thr = pk * Math.pow(10, dB / 20), hold = Math.max(1, Math.round((0.005 * sr) / w));
  let end = e.length;
  for (let j = pj, run = 0; j < e.length; j++) { if (e[j] < thr) { if (++run >= hold) { end = j - hold + 1; break; } } else run = 0; }
  return c.slice(0, Math.min(c.length, end * w));
}
const energy = (x, a, b) => { let s = 0; for (let i = Math.max(0, a); i < Math.min(x.length, b); i++) s += x[i] * x[i]; return s; };

// Medir y clasificar por el sonido cada golpe. Si el golpe no trae graves nuevos (los que hay son la cola del
// golpe anterior: un charles encima de un bombo), se clasifica sin ellos; el audio que se guarda no cambia.
export function describeHits(decoded, hits) {
  const sr = decoded.sampleRate, mono = monoSum(decoded.channels), low = lowPass(mono, sr), w = Math.round(0.03 * sr);
  let hp = null; // el loop entero sin graves, filtrado de una vez: recortar después no deja transitorios en los bordes
  return hits.map((h, i) => {
    const d = hitAudio(decoded, h);
    const before = h.a > w ? energy(low, h.a - w, h.a) : 0, after = energy(low, h.a, h.a + w);
    const bleed = h.a > w && before > 1e-6 && after < before * 2;
    const highOnly = () => { hp ||= highPass4(mono, sr); const m = trimTail(hp.slice(h.a, h.b), sr); try { return analyze({ ...d, channels: [m] }); } catch { return null; } };
    let analysis = null;
    if (bleed) analysis = highOnly(); else try { analysis = analyze(d); } catch { analysis = null; }
    const sc = soundScores(analysis).scores;
    const top = Object.entries(sc).filter(([c]) => c !== 'dloop' && c !== 'mloop').sort((p, q) => q[1] - p[1])[0];
    const cat = top ? top[0] : 'perc';
    // para agrupar, los golpes agudos se comparan siempre sin graves: así el mismo charles con y sin la cola
    // de un bombo debajo cae en el mismo grupo
    const ga = HIGH_CATS.includes(cat) ? (bleed ? analysis : highOnly()) : analysis;
    return { ...h, i, analysis, ga, bleed, cat, conf: top ? top[1] : 0 };
  });
}

// Distancia entre golpes: como la de los parecidos de la biblioteca, pero el ruido y la duración pesan menos,
// porque cambian con lo que suena debajo (la cola de la caja bajo un charles); el brillo y las bandas, no.
function hitVec(a) {
  if (!a || !a.bands) return null;
  return [0.5 * Math.log2((a.activeDur || 0.01) + 0.01) / 5, Math.log2((a.centroid || 100) / 100) / 8, a.bands.sub + a.bands.low, a.bands.lowmid + a.bands.mid, a.bands.high + a.bands.air, 0.35 * (a.flatness || 0), a.f0conf > 0.6 ? (a.midi || 0) / 127 : 0];
}
export function hitDistance(a, b) {
  const x = hitVec(a), y = hitVec(b);
  if (!x || !y) return 1;
  let s = 0; for (let i = 0; i < x.length; i++) s += (x[i] - y[i]) ** 2;
  return Math.sqrt(s);
}

// Agrupar los golpes parecidos de la misma categoría. Devuelve grupos ordenados como las categorías,
// cada uno con sus miembros y el elegido (rep).
export function groupHits(described, { dist = HIT_GROUP_DIST } = {}) {
  const groups = [];
  for (const h of described) {
    const fa = (m) => m.ga || m.analysis;
    const g = groups.find((x) => x.cat === h.cat && fa(h) && fa(x.members[0]) && hitDistance(fa(x.members[0]), fa(h)) < dist);
    if (g) g.members.push(h); else groups.push({ cat: h.cat, members: [h] });
  }
  for (const g of groups) {
    g.rep = g.members.slice().sort((p, q) => (p.bleed - q.bleed) || (p.cut - q.cut) || (q.dur - p.dur) || (q.peak - p.peak))[0];
  }
  const ord = (c) => { const i = CAT_IDS.indexOf(c); return i < 0 ? 99 : i; };
  return groups.sort((p, q) => ord(p.cat) - ord(q.cat) || q.members.length - p.members.length || p.rep.t - q.rep.t);
}

// Nombre base para los golpes: sin «loop», «break», tempo… para que el nombre no diga que es un loop
export function hitBaseName(name) {
  const raw = String(name || '').replace(/\.(wav|wave|aiff?|aifc|mp3|flac|ogg)$/i, '').replace(/[_\-.]+/g, ' ');
  const tidy = (x) => x.replace(/\s+/g, ' ').trim();
  const light = tidy(raw.replace(/\b\d{2,3}\s*bpm\b/gi, ' ').replace(/\bbpm\s*\d{2,3}\b/gi, ' ').replace(/\b(loops?|drumloops?)\b/gi, ' '));
  const full = tidy(light.replace(/\b(breaks?|breakbeats?|brks?|grooves?|grv|beats?|fills?|tops?|percloops?|hatloops?|toploops?)\b/gi, ' '));
  // si no queda nada (un «Top Loop»), basta con quitar «loop» y el tempo
  return full || light || tidy(raw) || 'Hit';
}
