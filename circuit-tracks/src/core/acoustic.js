// Medición acústica de una grabación real (salida de Circuit Tracks → interfaz de audio → navegador).
// Calcula descriptores sencillos y explicables. Dependen de la cadena de audio, la nota y las macros:
// sirven para comparar patches medidos con el MISMO protocolo, no como verdad absoluta.

export function fft(re, im) { // radix-2 in situ
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

// Envolvente RMS en ventanas de hop ms.
export function rmsEnvelope(x, sr, hopMs = 5) {
  const hop = Math.max(1, Math.round(sr * hopMs / 1000)), out = new Float32Array(Math.floor(x.length / hop));
  for (let f = 0; f < out.length; f++) { let s = 0; for (let i = f * hop; i < (f + 1) * hop; i++) s += x[i] * x[i]; out[f] = Math.sqrt(s / hop); }
  return { env: out, hopSec: hop / sr };
}
const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));

// Espectro medio y descriptores en [a, b) segundos.
export function spectralStats(x, sr, a, b, N = 4096) {
  const i0 = Math.max(0, Math.floor(a * sr)), i1 = Math.min(x.length, Math.floor(b * sr));
  const mag = new Float64Array(N / 2); let frames = 0;
  const win = new Float64Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  const centroids = [];
  for (let s = i0; s + N <= i1; s += N / 2) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[s + i] * win[i];
    fft(re, im);
    let num = 0, den = 0;
    for (let k = 1; k < N / 2; k++) { const m = Math.hypot(re[k], im[k]); mag[k] += m; num += m * k * sr / N; den += m; }
    if (den > 1e-6) centroids.push(num / den);
    frames++;
  }
  if (!frames) return null;
  let num = 0, den = 0, low = 0, logSum = 0, cnt = 0, peakK = 1;
  for (let k = 1; k < N / 2; k++) {
    const m = mag[k] / frames, f = k * sr / N; if (f > 16000) break;
    num += m * f; den += m; if (f < 200) low += m * m;
    logSum += Math.log(m + 1e-12); cnt++; if (m > mag[peakK] / frames) peakK = k;
  }
  let pow = 0; for (let k = 1; k < N / 2 && k * sr / N <= 16000; k++) pow += (mag[k] / frames) ** 2;
  const flatness = Math.exp(logSum / cnt) / (den / cnt);
  const mean = centroids.reduce((p, c) => p + c, 0) / (centroids.length || 1);
  const sd = Math.sqrt(centroids.reduce((p, c) => p + (c - mean) ** 2, 0) / (centroids.length || 1));
  return { centroid: num / den, lowRatio: low / (pow || 1), flatness, peakHz: peakK * sr / N, centroidStart: centroids[0] ?? mean, centroidEnd: centroids.at(-1) ?? mean, centroidSd: sd };
}

// Estimación de f0 por diferencia normalizada (variante simplificada de YIN).
export function estimatePitch(x, sr, a, minHz = 30, maxHz = 1200) {
  const W = Math.min(Math.floor(sr * 0.08), 8192), s = Math.floor(a * sr);
  if (s + 2 * W > x.length) return null;
  const tauMin = Math.floor(sr / maxHz), tauMax = Math.min(W - 1, Math.floor(sr / minHz));
  const d = new Float64Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) { let sum = 0; for (let i = 0; i < W; i++) { const v = x[s + i] - x[s + i + tau]; sum += v * v; } d[tau] = sum; }
  let run = 0; const cm = new Float64Array(tauMax + 1); cm[0] = 1;
  for (let tau = 1; tau <= tauMax; tau++) { run += d[tau]; cm[tau] = d[tau] * tau / (run || 1); }
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (cm[tau] < 0.15) { while (tau + 1 <= tauMax && cm[tau + 1] < cm[tau]) tau++; const a0 = cm[tau - 1], b0 = cm[tau], c0 = cm[tau + 1] ?? b0; const den = a0 - 2 * b0 + c0; const t = tau + (den ? (a0 - c0) / (2 * den) : 0); return { hz: sr / t, clarity: 1 - cm[tau] }; }
  }
  return null;
}
export const hzToMidi = (hz) => 69 + 12 * Math.log2(hz / 440);

// Análisis completo. noteOn / noteOff: segundos aproximados desde el inicio de la grabación.
export function analyzeRecording(x, sr, { noteOn = 0, noteOff, playedNote = 48 } = {}) {
  const { env, hopSec } = rmsEnvelope(x, sr);
  let peak = 0, peakAt = 0; for (let i = 0; i < env.length; i++) if (env[i] > peak) { peak = env[i]; peakAt = i; }
  const out = { peakDb: db(peak), silent: db(peak) < -50, sampleRate: sr, playedNote };
  if (out.silent) return out;
  // Inicio real: primer frame > -40 dB del pico (compensa la latencia de la cadena).
  const thr = peak * 0.01; let on = env.findIndex((v) => v > thr); if (on < 0) on = 0;
  const latency = Math.max(0, on * hopSec - noteOn);
  const offIdx = noteOff !== undefined ? Math.min(env.length - 1, Math.round((noteOff + latency) / hopSec)) : env.length - 1;
  const at90 = env.findIndex((v, i) => i >= on && v >= peak * 0.9);
  out.latencyMs = latency * 1000;
  out.attackMs = (at90 - on) * hopSec * 1000;
  // Sustain: nivel medio en los 200 ms anteriores al note off, relativo al pico.
  const sA = Math.max(peakAt, offIdx - Math.round(0.2 / hopSec)); let sSum = 0, sN = 0;
  for (let i = sA; i < offIdx; i++) { sSum += env[i]; sN++; }
  out.sustainRatio = sN ? sSum / sN / peak : 0;
  // Decaimiento: tiempo desde el pico hasta -20 dB (si ocurre antes del note off).
  const d20 = env.findIndex((v, i) => i > peakAt && i <= offIdx && v < peak * 0.1);
  out.decayMs = d20 > 0 ? (d20 - peakAt) * hopSec * 1000 : null;
  // Release: tras el note off, tiempo hasta caer 40 dB respecto al nivel en el note off.
  const lvlOff = env[offIdx] || 0; const r = env.findIndex((v, i) => i > offIdx && v < Math.max(lvlOff * 0.01, peak * 0.001));
  out.releaseMs = lvlOff < peak * 0.02 ? 0 : r > 0 ? (r - offIdx) * hopSec * 1000 : (env.length - offIdx) * hopSec * 1000;
  out.releaseCapped = r < 0 && lvlOff >= peak * 0.02;
  // Modulación de amplitud mientras suena (desviación relativa de la envolvente en el tramo sostenido).
  const heldA = Math.min(offIdx, at90 + Math.round(0.1 / hopSec)); let m = 0, m2 = 0, n = 0;
  for (let i = heldA; i < offIdx; i++) { m += env[i]; m2 += env[i] ** 2; n++; }
  out.ampModulation = n > 4 ? Math.sqrt(Math.max(0, m2 / n - (m / n) ** 2)) / (m / n || 1) : 0;
  const start = on * hopSec, end = Math.max(start + 0.1, offIdx * hopSec);
  const sp = spectralStats(x, sr, start, end);
  if (sp) Object.assign(out, sp);
  const p = estimatePitch(x, sr, Math.min(end - 0.1, start + 0.15));
  if (p) { out.f0 = p.hz; out.pitchClarity = p.clarity; out.octaveOffset = Math.round((hzToMidi(p.hz) - playedNote) / 12); }
  return out;
}

// Traduce descriptores a rasgos medidos (umbrales documentados y ajustables).
export const MT = { percSustain: 0.15, percAttackMs: 25, slowAttackMs: 150, longReleaseMs: 600, lowHz: 110, darkRatio: 3, brightRatio: 10, noisyFlat: 0.35, moving: 0.25, movingCentroid: 0.2 };
export function measuredFeatures(d) {
  if (!d || d.silent) return [{ id: 'm-silent', label: 'Sin señal en la grabación', basis: `Pico ${d?.peakDb?.toFixed(1)} dBFS` }];
  const f = [], add = (id, label, basis) => f.push({ id, label, basis, kind: 'measured' });
  if (d.sustainRatio < MT.percSustain && d.attackMs < MT.percAttackMs) add('m-percussive', 'Percusivo (medido)', `Sustain ${(d.sustainRatio * 100).toFixed(0)} % del pico, ataque ${d.attackMs.toFixed(0)} ms`);
  if (d.sustainRatio >= 0.5) add('m-sustained', 'Sostenido (medido)', `Sustain ${(d.sustainRatio * 100).toFixed(0)} % del pico`);
  if (d.attackMs >= MT.slowAttackMs) add('m-slow-attack', 'Ataque lento (medido)', `${d.attackMs.toFixed(0)} ms hasta el 90 %`);
  if (d.releaseMs >= MT.longReleaseMs) add('m-long-release', 'Cola larga (medida)', `${d.releaseMs.toFixed(0)} ms${d.releaseCapped ? '+' : ''} tras soltar`);
  if (d.f0 && d.f0 < MT.lowHz) add('m-low', 'Registro grave (medido)', `f0 ≈ ${d.f0.toFixed(1)} Hz`);
  if (d.f0 && d.pitchClarity > 0.6) { const ratio = d.centroid / d.f0; if (ratio < MT.darkRatio) add('m-dark', 'Oscuro / redondo (medido)', `Centroide ${d.centroid.toFixed(0)} Hz = ${ratio.toFixed(1)}× f0`); if (ratio > MT.brightRatio) add('m-bright', 'Brillante (medido)', `Centroide ${d.centroid.toFixed(0)} Hz = ${ratio.toFixed(1)}× f0`); }
  if (d.flatness > MT.noisyFlat || (!d.f0 && d.flatness > 0.2)) add('m-noisy', 'Ruidoso / inarmónico (medido)', `Planitud espectral ${d.flatness.toFixed(2)}${d.f0 ? '' : ', sin altura clara'}`);
  if (d.ampModulation > MT.moving || (d.centroidSd && d.centroid && d.centroidSd / d.centroid > MT.movingCentroid)) add('m-moving', 'Movimiento audible (medido)', `Mod. amplitud ${(d.ampModulation * 100).toFixed(0)} %, variación del centroide ${d.centroid ? (100 * d.centroidSd / d.centroid).toFixed(0) : 0} %`);
  if (d.centroidStart && d.centroidEnd && d.centroidStart > d.centroidEnd * 1.8) add('m-filter-sweep', 'Barrido descendente de brillo (medido)', `${d.centroidStart.toFixed(0)} → ${d.centroidEnd.toFixed(0)} Hz`);
  return f;
}
