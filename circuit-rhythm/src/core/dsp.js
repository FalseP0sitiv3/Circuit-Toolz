import { applyKeep, keepIsIdentity, keepFraction } from './shorten.js';
import { loudnessMax } from './loud.js';
// core/dsp.js — conversión al formato de la Circuit Rhythm (48 kHz · mono · 16 bit) y utilidades.
// Todo es no destructivo: el original no se toca; la "preparación" es una receta que se aplica al exportar.

export const DEFAULT_RECIPE = Object.freeze({
  mono: 'auto',        // auto (repara si se cancela) | sum | repair | left | right
  autoTrim: true,      // quitar silencio inicial y cola por debajo del umbral
  thresholdDb: -60,    // umbral relativo al pico para el recorte automático
  trimStart: null,     // s (manual; null = automático o 0)
  trimEnd: null,       // s (manual; null = automático o final)
  fadeInMs: 0,
  fadeOutMs: 0,        // 0 = solo el fundido mínimo si se ha cortado cola
  normalize: 'peak',   // peak | none
  targetDb: -0.5,      // pico objetivo (dBFS)
  gainDb: 0,           // solo si normalize = none
  reverse: false,
  maxSec: 30,          // límite de la Circuit Rhythm por sample
  fitSec: null,        // loops: duración exacta (compases enteros) → Beat Match sin cambio de tono
  keep: null,          // loops: {n, sel} → solo esas slices, en ese orden (acortar; ver core/shorten.js)
  tune: 0,             // v2.3: semitonos (con decimales). Como un sampler: cambia la velocidad y la duración
  targetLufs: -14,     // v2.3: normalize = 'loud' → volumen percibido (máximo momentáneo, LUFS), sin pasar de targetDb de pico
});

export const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
export const undb = (d) => Math.pow(10, d / 20);

// ---------- FFT (radix 2, in situ) ----------
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

// ---------- mono ----------
export function stereoInfo(channels) {
  if (channels.length < 2) return { stereo: false, corr: 1, lossDb: 0, balanceDb: 0 };
  const L = channels[0], R = channels[1];
  let ll = 0, rr = 0, lr = 0;
  for (let i = 0; i < L.length; i++) { ll += L[i] * L[i]; rr += R[i] * R[i]; lr += L[i] * R[i]; }
  if (ll + rr === 0) return { stereo: true, corr: 1, lossDb: 0, balanceDb: 0, identical: true };
  const corr = ll && rr ? lr / Math.sqrt(ll * rr) : 0;
  const eSum = (ll + rr + 2 * lr) / 4, eRef = (ll + rr) / 2;
  const lossDb = eSum > 0 ? 10 * Math.log10(eRef / eSum) : 99;
  let identical = true;
  for (let i = 0; i < L.length; i += 7) if (Math.abs(L[i] - R[i]) > 1e-6) { identical = false; break; }
  return { stereo: true, corr, lossDb, balanceDb: 10 * Math.log10((ll + 1e-12) / (rr + 1e-12)), identical };
}

// ---------- v2.8: mono que repara en vez de elegir un canal ----------
// Solo afecta a lo que va a la Rhythm (48 kHz · mono). El archivo original y las exportaciones «como el original»
// siguen en estéreo: esto vive en la receta.
// auto (por orden, el primero que resuelve):
//   iguales → un canal · contrafase → se invierte un canal · retardo entre canales (≤ 30 ms) → se alinea ·
//   aún se pierde nivel → suma alineada por frecuencias (por debajo de 150 Hz, suma normal) · si no, suma.
export const MONO_DELAY_MAX_MS = 30;
const MONO_BAND_OK = 6;              // dB que puede perder una banda al sumar sin que se considere cancelación
const MONO_SPLIT_HZ = 150;
const monoEnergy = (x) => { let e = 0; for (let i = 0; i < x.length; i++) e += x[i] * x[i]; return e; };
const lossOf = (eRef, x) => { const e = monoEnergy(x) / Math.max(1, x.length); return e > 0 ? 10 * Math.log10(eRef / e) : 99; };
function sumWith(L, R, sign = 1, lag = 0) {
  // lag > 0: R va adelantado (se retrasa R); lag < 0: L va adelantado
  const n = L.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const l = lag < 0 ? (i + lag >= 0 ? L[i + lag] : 0) : L[i];
    const r = lag > 0 ? (i - lag >= 0 ? R[i - lag] : 0) : R[i];
    out[i] = (l + sign * r) * 0.5;
  }
  return out;
}
const nextPow2 = (n) => { let p = 1; while (p < n) p <<= 1; return p; };
// Retardo entre canales por correlación cruzada (FFT) sobre los primeros segundos. Devuelve { lag, c, c0 }:
// lag en muestras (> 0: R va por delante), c la correlación normalizada en ese retardo (con signo) y c0 sin retardo.
export function channelDelay(L, R, sr, maxMs = MONO_DELAY_MAX_MS) {
  const len = Math.min(L.length, Math.round(sr * 6)), maxLag = Math.min(len - 1, Math.round((maxMs / 1000) * sr));
  if (len < 64) return { lag: 0, c: 1, c0: 1 };
  const N = nextPow2(len * 2);
  const ar = new Float64Array(N), ai = new Float64Array(N), br = new Float64Array(N), bi = new Float64Array(N);
  let el = 0, er = 0;
  for (let i = 0; i < len; i++) { ar[i] = L[i]; br[i] = R[i]; el += L[i] * L[i]; er += R[i] * R[i]; }
  if (!el || !er) return { lag: 0, c: 1, c0: 1 };
  fft(ar, ai); fft(br, bi);
  // A · conj(B) → correlación L con R desplazada
  for (let k = 0; k < N; k++) { const xr = ar[k] * br[k] + ai[k] * bi[k], xi = ai[k] * br[k] - ar[k] * bi[k]; ar[k] = xr; ai[k] = -xi; }
  fft(ar, ai); // IFFT por conjugado: resultado real = ar / N
  const norm = Math.sqrt(el * er) * N, at = (lag) => ar[(lag + N) % N] / norm;
  let best = 0, bc = at(0);
  for (let d = 1; d <= maxLag; d++) for (const lg of [d, -d]) { const c = at(lg); if (Math.abs(c) > Math.abs(bc) + 1e-9) { bc = c; best = lg; } }
  // at(m) correlaciona L[i + m] con R[i]: m > 0 → R va por delante
  return { lag: best, c: bc, c0: at(0) };
}
// Suma alineada por frecuencias: en cada frecuencia (por encima de MONO_SPLIT_HZ) se suman las magnitudes con la
// fase de la suma (o del canal más fuerte si la suma se anula). STFT de 2048 con ventana raíz de Hann y salto 1/4.
export function spectralMono(L, R, sr) {
  const N = 2048, H = N / 4, n = L.length, out = new Float32Array(n + N), win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const kSplit = Math.round((MONO_SPLIT_HZ * N) / sr);
  const lr = new Float64Array(N), li = new Float64Array(N), rr = new Float64Array(N), ri = new Float64Array(N);
  for (let st = -N + H; st < n; st += H) {
    for (let i = 0; i < N; i++) { const j = st + i, w = win[i]; lr[i] = j >= 0 && j < n ? L[j] * w : 0; rr[i] = j >= 0 && j < n ? R[j] * w : 0; li[i] = 0; ri[i] = 0; }
    fft(lr, li); fft(rr, ri);
    for (let k = 0; k <= N / 2; k++) {
      const sr2 = lr[k] + rr[k], si2 = li[k] + ri[k];
      let xr, xi;
      if (k < kSplit) { xr = sr2 / 2; xi = si2 / 2; }
      else {
        const ml = Math.hypot(lr[k], li[k]), mr = Math.hypot(rr[k], ri[k]), ms = Math.hypot(sr2, si2), m = (ml + mr) / 2;
        let pr, pi;
        if (ms > 0.1 * (ml + mr) && ms > 1e-12) { pr = sr2 / ms; pi = si2 / ms; }
        else if (ml >= mr && ml > 1e-12) { pr = lr[k] / ml; pi = li[k] / ml; }
        else if (mr > 1e-12) { pr = rr[k] / mr; pi = ri[k] / mr; } else { pr = 0; pi = 0; }
        xr = m * pr; xi = m * pi;
      }
      lr[k] = xr; li[k] = xi;
      if (k > 0 && k < N / 2) { lr[N - k] = xr; li[N - k] = -xi; }
    }
    // IFFT: conjugar, FFT, conjugar y dividir
    for (let k = 0; k < N; k++) li[k] = -li[k];
    fft(lr, li);
    for (let i = 0; i < N; i++) { const j = st + i; if (j >= 0 && j < n + N) out[j] += (lr[i] / N) * win[i] / 1.5; }
  }
  return out.subarray(0, n);
}
// Cuánto se pierde al sumar, por bandas de frecuencia: la suma tal cual frente a la suma alineada. Dos canales sin
// relación pierden ~2,5 dB por igual en todas; una cancelación (filtro de peine, graves en contrafase) deja huecos
// profundos en algunas. Devuelve { worstDb, worstHz } de las bandas con energía.
export function monoBands(L, R, sr) {
  const N = 2048, n = L.length, frames = Math.max(1, Math.floor((n - N) / N) + 1), step = Math.max(1, Math.floor(frames / 120));
  const edges = []; for (let f = 60; f < Math.min(sr / 2, 16000); f *= 1.41) edges.push(f);
  const eS = new Float64Array(edges.length), eA = new Float64Array(edges.length);
  const lr = new Float64Array(N), li = new Float64Array(N), rr = new Float64Array(N), ri = new Float64Array(N);
  for (let fi = 0; fi < frames; fi += step) {
    const st = fi * N;
    for (let i = 0; i < N; i++) { const j = st + i, w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N); lr[i] = j < n ? L[j] * w : 0; rr[i] = j < n ? R[j] * w : 0; li[i] = 0; ri[i] = 0; }
    fft(lr, li); fft(rr, ri);
    let b = 0;
    for (let k = 1; k < N / 2; k++) {
      const f = (k * sr) / N; while (b < edges.length - 1 && f >= edges[b + 1]) b++;
      if (f < edges[0] || f >= edges[edges.length - 1] * 1.41) continue;
      const sr2 = lr[k] + rr[k], si2 = li[k] + ri[k], a = Math.hypot(lr[k], li[k]) + Math.hypot(rr[k], ri[k]);
      eS[b] += sr2 * sr2 + si2 * si2; eA[b] += a * a;
    }
  }
  const top = Math.max(...eA);
  let worstDb = 0, worstHz = 0;
  edges.forEach((f, b) => { if (eA[b] > top * 1e-3) { const d = 10 * Math.log10((eA[b] + 1e-20) / (eS[b] + 1e-20)); if (d > worstDb) { worstDb = d; worstHz = f * 1.19; } } });
  return { worstDb, worstHz };
}
const _monoCache = new WeakMap();
// Devuelve { data, used, fix }: used ∈ mono | left | right | sum | flip | align | spectral;
// fix = { lossBefore, lossAfter, delayMs, flipped } (pérdida de nivel de la suma tal cual y de lo elegido, en dB).
export function toMono(channels, mode = 'auto', sr = 48000) {
  if (channels.length === 1) return { data: channels[0], used: 'mono', fix: null };
  const L = channels[0], R = channels[1];
  if (mode === 'left') return { data: L, used: 'left', fix: null };
  if (mode === 'right') return { data: R, used: 'right', fix: null };
  const plain = () => sumWith(L, R);
  if (mode === 'sum') return { data: plain(), used: 'sum', fix: null };
  const key = mode + '|' + sr;
  let c = _monoCache.get(L); if (c && c.R === R && c[key]) return c[key];
  const res = monoRepair(L, R, sr, mode === 'repair');
  if (!c || c.R !== R) { c = { R }; _monoCache.set(L, c); }
  c[key] = res;
  return res;
}
function monoRepair(L, R, sr, force) {
  const s = stereoInfo([L, R]);
  if (s.identical) return { data: L, used: 'left', fix: null };
  const eRef = (monoEnergy(L) + monoEnergy(R)) / 2 / Math.max(1, L.length);
  const sum = sumWith(L, R), lossBefore = lossOf(eRef, sum);
  const bands = monoBands(L, R, sr);
  const base = { lossBefore, worstDb: bands.worstDb, worstHz: bands.worstHz, delayMs: 0, flipped: false };
  const done = (data, used, extra = {}) => ({ data, used, fix: { ...base, lossAfter: lossOf(eRef, data), ...extra } });
  const keepSum = () => ({ data: sum, used: 'sum', fix: { ...base, lossAfter: lossBefore } });
  // la suma basta: ninguna banda pierde de más (dos canales sin relación pierden ~2,5 dB por igual y no es cancelación)
  if (!force && s.corr >= 0 && bands.worstDb <= MONO_BAND_OK) return keepSum();
  const d = channelDelay(L, R, sr);
  // 1) contrafase sin retardo
  // (solo si al invertir se conserva casi todo: si no, lo que tienen en común se perdería)
  if (s.corr <= -0.5 && Math.abs(d.c) <= Math.abs(s.corr) + 0.1) { const fl = sumWith(L, R, -1); if (lossOf(eRef, fl) <= 1) return done(fl, 'flip', { flipped: true }); }
  // 2) retardo claro entre canales (con o sin contrafase)
  if (d.lag !== 0 && Math.abs(d.c) >= 0.5 && Math.abs(d.c) - Math.abs(d.c0) >= 0.2) {
    const sign = d.c < 0 ? -1 : 1;
    return done(sumWith(L, R, sign, d.lag), 'align', { delayMs: (Math.abs(d.lag) / sr) * 1000, lead: d.lag > 0 ? 'R' : 'L', flipped: sign < 0 });
  }
  // 3) cancelación que no es de retardo (chorus, ensanchadores): suma alineada por frecuencias
  if (force || s.corr < 0 || bands.worstDb > MONO_BAND_OK) return done(spectralMono(L, R, sr), 'spectral');
  return keepSum();
}

// ---------- remuestreo: sinc con ventana de Kaiser, tabla interpolada ----------
const KZ = 24;            // cruces por cero a cada lado
const KRES = 256;         // resolución de la tabla por cruce
let KTABLE = null;
function besselI0(x) { let s = 1, t = 1; for (let k = 1; k < 30; k++) { t *= (x / (2 * k)) ** 2; s += t; } return s; }
function kernelTable() {
  if (KTABLE) return KTABLE;
  const beta = 8.6, n = KZ * KRES + 2;
  KTABLE = new Float32Array(n);
  const i0b = besselI0(beta);
  for (let i = 0; i < n; i++) {
    const x = i / KRES;
    const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
    const r = x / KZ;
    const w = r >= 1 ? 0 : besselI0(beta * Math.sqrt(1 - r * r)) / i0b;
    KTABLE[i] = sinc * w;
  }
  return KTABLE;
}

export function resample(x, srcRate, dstRate) {
  if (srcRate === dstRate) return Float32Array.from(x);
  const tab = kernelTable();
  const ratio = dstRate / srcRate;
  const cutoff = Math.min(1, ratio) * 0.96;   // por debajo de Nyquist del destino
  const outLen = Math.max(1, Math.round(x.length * ratio));
  const out = new Float32Array(outLen);
  const half = KZ / cutoff;                   // ancho de la ventana en muestras de origen
  const step = cutoff * KRES;
  for (let n = 0; n < outLen; n++) {
    const t = n / ratio;
    const i0 = Math.ceil(t - half), i1 = Math.floor(t + half);
    let acc = 0;
    for (let k = i0; k <= i1; k++) {
      if (k < 0 || k >= x.length) continue;
      const pos = Math.abs(t - k) * step;
      const ip = pos | 0;
      if (ip >= tab.length - 1) continue;
      const fr = pos - ip;
      acc += x[k] * (tab[ip] + (tab[ip + 1] - tab[ip]) * fr);
    }
    out[n] = acc * cutoff;
  }
  return out;
}

// ---------- utilidades de nivel ----------
export function peakOf(x) { let p = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > p) p = a; } return p; }

// Envolvente RMS en ventanas de win muestras
export function rmsEnvelope(x, win) {
  const n = Math.ceil(x.length / win), env = new Float32Array(n);
  for (let j = 0; j < n; j++) {
    let s = 0; const a = j * win, b = Math.min(x.length, a + win);
    for (let i = a; i < b; i++) s += x[i] * x[i];
    env[j] = Math.sqrt(s / Math.max(1, b - a));
  }
  return env;
}

// Puntos de recorte automáticos (en muestras) con preroll de 1 ms y margen de cola de 10 ms.
export function autoTrimPoints(x, rate, thresholdDb = -60) {
  const pk = peakOf(x);
  if (pk === 0) return { start: 0, end: 0, silent: true };
  const thr = pk * undb(thresholdDb);
  let s = 0;
  while (s < x.length && Math.abs(x[s]) < thr) s++;
  s = Math.max(0, s - Math.round(rate * 0.001));
  const win = Math.max(1, Math.round(rate * 0.005));
  const env = rmsEnvelope(x, win);
  let j = env.length - 1;
  while (j > 0 && env[j] < thr * 0.7071) j--;
  let e = Math.min(x.length, (j + 1) * win + Math.round(rate * 0.010));
  if (e <= s) e = Math.min(x.length, s + win);
  return { start: s, end: e, silent: false };
}

function fade(x, n, out) {
  n = Math.min(n, x.length);
  for (let i = 0; i < n; i++) {
    const g = Math.sin((Math.PI / 2) * (i / n)) ** 2; // curva suave (cos²)
    if (out) x[x.length - 1 - i] *= g; else x[i] *= g;
  }
}

// Recorte de la receta (automático y/o manual) en muestras de la frecuencia original.
export function trimRange(x, sr, r) {
  let s = 0, e = x.length, cutTail = false;
  if (r.autoTrim) {
    const t = autoTrimPoints(x, sr, r.thresholdDb);
    s = t.start; e = t.end; cutTail = e < x.length;
  }
  if (r.trimStart != null) s = Math.max(0, Math.min(x.length, Math.round(r.trimStart * sr)));
  if (r.trimEnd != null) { e = Math.max(s + 1, Math.min(x.length, Math.round(r.trimEnd * sr))); cutTail = e < x.length; }
  if (e <= s) e = Math.min(x.length, s + 1);
  return { s, e, cutTail };
}
// La zona sobre la que se cuentan las slices, en la frecuencia original: mono, recortada y ajustada al
// compás (sin acortar, sin reverse ni tope de 30 s). Es lo que se analiza para ver si se repite.
export function regionMono(decoded, recipeIn = {}) {
  const r = { ...DEFAULT_RECIPE, ...recipeIn };
  const sr = decoded.sampleRate, m = toMono(decoded.channels, r.mono, decoded.sampleRate);
  const { s, e } = trimRange(m.data, sr, r);
  let x = m.data.subarray(s, e);
  if (r.fitSec) {
    const n = Math.round(r.fitSec * sr);
    if (n > x.length) { const z = new Float32Array(n); z.set(x); x = z; } else x = x.subarray(0, n);
  }
  return { x, sr, start: s / sr };
}

// Aplica la receta. Devuelve audio 48 kHz mono en coma flotante + informe de lo que se hizo.
export function render(decoded, recipeIn = {}, dstRate = 48000) {
  const r = { ...DEFAULT_RECIPE, ...recipeIn };
  const rep = { steps: [] };
  const m = toMono(decoded.channels, r.mono, decoded.sampleRate);
  rep.monoUsed = m.used; rep.monoFix = m.fix;
  let x = m.data;
  const sr = decoded.sampleRate;
  // recorte (en la frecuencia original)
  let { s, e, cutTail } = trimRange(x, sr, r);
  rep.trimStart = s / sr; rep.trimEnd = e / sr; rep.srcDur = x.length / sr;
  x = x.subarray(s, e);
  // remuestreo (y afinación: subir un semitono = leer el original 2^(1/12) veces más rápido)
  const ratio = Math.pow(2, (r.tune || 0) / 12);
  let y = resample(x, sr * ratio, dstRate);
  rep.resampled = sr !== dstRate || ratio !== 1;
  if (ratio !== 1) rep.tuned = r.tune;
  if (r.fitSec) {
    const n = Math.round((r.fitSec * dstRate) / ratio);
    if (n > y.length) { const z = new Float32Array(n); z.set(y); y = z; rep.padded = true; }
    else if (n < y.length) { y = y.slice(0, n); cutTail = true; }
    rep.fitted = true;
  }
  // acortar: slices elegidas (sobre la duración ya ajustada al compás, como la rejilla de slices)
  if (r.keep && !keepIsIdentity(r.keep)) {
    const before = y.length / dstRate;
    y = applyKeep(y, r.keep, dstRate);
    const k = r.keep, first = k.sel[0], last = k.sel[k.sel.length - 1];
    // el punto de bucle ya lleva su fundido cruzado: sin fundido de salida que haría un hueco al repetir
    if (!(last + 1 === k.n && first === 0) && last + 1 !== first) cutTail = false;
    rep.kept = { n: k.n, sel: k.sel.slice(), savedSec: before - y.length / dstRate };
  }
  if (r.reverse) y.reverse();
  // límite de duración
  const maxN = Math.round(r.maxSec * dstRate);
  if (y.length > maxN) { y = y.slice(0, maxN); cutTail = true; rep.capped = true; }
  // nivel
  const pk = peakOf(y);
  let gain = 1;
  if (r.normalize === 'peak' && pk > 0) gain = undb(r.targetDb) / pk;
  else if (r.normalize === 'none') gain = undb(r.gainDb || 0);
  else if (r.normalize === 'loud' && pk > 0) {
    const L = loudnessMax(y, dstRate);
    gain = Number.isFinite(L) ? undb((r.targetLufs ?? -14) - L) : 1;
    // sin pasar del pico objetivo: si no llega, se queda en el pico (y se avisa)
    if (pk * gain > undb(r.targetDb)) { gain = undb(r.targetDb) / pk; rep.loudLimited = true; }
    rep.lufs = L + db(gain);
  }
  if (gain !== 1) for (let i = 0; i < y.length; i++) y[i] *= gain;
  rep.gainDb = db(gain);
  // fundidos
  const fi = Math.round((r.fadeInMs || 0) * dstRate / 1000);
  if (fi > 0) fade(y, fi, false);
  let fo = Math.round((r.fadeOutMs || 0) * dstRate / 1000);
  if (cutTail) fo = Math.max(fo, Math.round(0.005 * dstRate));
  if (fo > 0) fade(y, fo, true);
  // tope de seguridad
  let clip = 0;
  for (let i = 0; i < y.length; i++) { if (y[i] > 1) { y[i] = 1; clip++; } else if (y[i] < -1) { y[i] = -1; clip++; } }
  rep.clipped = clip;
  rep.dur = y.length / dstRate;
  return { data: y, rate: dstRate, report: rep };
}

// Duración resultante sin remuestrear (rápida, para presupuestos de pack)
export function renderedDuration(decodedMono, rate, recipeIn = {}) {
  const r = { ...DEFAULT_RECIPE, ...recipeIn };
  let s = 0, e = decodedMono.length;
  if (r.autoTrim) { const t = autoTrimPoints(decodedMono, rate, r.thresholdDb); s = t.start; e = t.end; }
  if (r.trimStart != null) s = Math.round(r.trimStart * rate);
  if (r.trimEnd != null) e = Math.round(r.trimEnd * rate);
  let d = Math.max(0, (e - s) / rate);
  if (r.fitSec) d = r.fitSec;
  return Math.min(r.maxSec, (d * keepFraction(r.keep)) / Math.pow(2, (r.tune || 0) / 12));
}

// Picos para dibujar la forma de onda (min/max por columna)
export function overview(x, cols = 600) {
  const out = new Float32Array(cols * 2);
  const per = x.length / cols;
  for (let c = 0; c < cols; c++) {
    let mn = 0, mx = 0;
    const a = Math.floor(c * per), b = Math.max(a + 1, Math.floor((c + 1) * per));
    for (let i = a; i < b && i < x.length; i++) { const v = x[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    out[c * 2] = mn; out[c * 2 + 1] = mx;
  }
  return out;
}
