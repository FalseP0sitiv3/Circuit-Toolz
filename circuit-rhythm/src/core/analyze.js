// core/analyze.js — medición de cada sample a partir del propio audio.
// Es la "segunda fuente" de la clasificación: no depende del nombre ni del equipo.

import { fft, db, peakOf, rmsEnvelope, autoTrimPoints, stereoInfo, toMono } from './dsp.js';

const BANDS = [
  ['sub', 20, 60], ['low', 60, 150], ['lowmid', 150, 500],
  ['mid', 500, 2000], ['high', 2000, 6000], ['air', 6000, 20000],
];

function hann(n) { const w = new Float32Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)); return w; }
const HANN = {};
const getHann = (n) => (HANN[n] ||= hann(n));

// Espectro medio ponderado por energía + trayectoria del centroide
function spectral(x, sr, maxSec = 4) {
  const N = 2048, hop = 1024, w = getHann(N);
  const lim = Math.min(x.length, Math.round(maxSec * sr));
  const nb = N / 2;
  const acc = new Float64Array(nb);
  const cents = [];
  let totalW = 0;
  const re = new Float64Array(N), im = new Float64Array(N);
  const frames = Math.max(1, Math.floor((lim - N) / hop) + 1);
  for (let f = 0; f < frames; f++) {
    const o = f * hop;
    let e = 0;
    for (let i = 0; i < N; i++) { const v = (x[o + i] || 0) * w[i]; re[i] = v; im[i] = 0; e += v * v; }
    if (e < 1e-10) continue;
    fft(re, im);
    let num = 0, den = 0;
    for (let k = 1; k < nb; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      acc[k] += p; // la energía del marco ya pondera
      const hz = (k * sr) / N;
      num += hz * p; den += p;
    }
    totalW += e;
    if (den > 0) cents.push({ t: o / sr, c: num / den, e });
  }
  const bands = {};
  let tot = 0;
  for (let k = 1; k < nb; k++) tot += acc[k];
  for (const [name, lo, hi] of BANDS) {
    let s = 0;
    for (let k = 1; k < nb; k++) { const hz = (k * sr) / N; if (hz >= lo && hz < hi) s += acc[k]; }
    bands[name] = tot > 0 ? s / tot : 0;
  }
  let num = 0, cum = 0, roll = 0, lg = 0, ar = 0, cnt = 0;
  for (let k = 1; k < nb; k++) num += ((k * sr) / N) * acc[k];
  for (let k = 1; k < nb; k++) { cum += acc[k]; if (!roll && cum >= 0.85 * tot) roll = (k * sr) / N; }
  for (let k = 1; k < nb; k++) {
    const hz = (k * sr) / N;
    if (hz < 100 || hz > 16000) continue;
    const p = acc[k] + 1e-20; lg += Math.log(p); ar += p; cnt++;
  }
  const flat = cnt ? Math.exp(lg / cnt) / (ar / cnt) : 0;
  // tendencia del brillo: tercio inicial frente a tercio final
  let trend = 0;
  if (cents.length >= 6) {
    const third = Math.floor(cents.length / 3);
    const avg = (a) => a.reduce((s, q) => s + q.c, 0) / a.length;
    const c0 = avg(cents.slice(0, third)), c1 = avg(cents.slice(-third));
    trend = Math.log2((c1 + 1) / (c0 + 1)); // octavas
  }
  return { bands, centroid: tot ? num / tot : 0, rolloff: roll, flatness: flat, brightTrend: trend, frames: cents.length };
}

// YIN simplificado: f0 y confianza (1 = periódico perfecto)
export function yin(x, sr, start, W = 2048, fmin = 30, fmax = 1500) {
  const tauMax = Math.min(Math.floor(sr / fmin), W - 1), tauMin = Math.max(2, Math.floor(sr / fmax));
  if (start + W + tauMax > x.length) start = Math.max(0, x.length - W - tauMax);
  if (start < 0 || x.length < W + tauMax) return { f0: 0, conf: 0 };
  const d = new Float64Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) { const v = x[start + i] - x[start + i + tau]; s += v * v; }
    d[tau] = s;
  }
  const cm = new Float64Array(tauMax + 1); cm[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= tauMax; tau++) { run += d[tau]; cm[tau] = run > 0 ? (d[tau] * tau) / run : 1; }
  let best = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (cm[tau] < 0.15) { while (tau + 1 <= tauMax && cm[tau + 1] < cm[tau]) tau++; best = tau; break; }
  }
  if (best < 0) { let mn = Infinity; for (let tau = tauMin; tau <= tauMax; tau++) if (cm[tau] < mn) { mn = cm[tau]; best = tau; } }
  // interpolación parabólica
  let t = best;
  if (best > 1 && best < tauMax) {
    const a = cm[best - 1], b = cm[best], c = cm[best + 1];
    const den = a - 2 * b + c; if (den) t = best + (0.5 * (a - c)) / den;
  }
  return { f0: sr / t, conf: Math.max(0, 1 - cm[best]) };
}

// Ataques (flujo espectral) en marcos de ~10 ms
function onsets(x, sr) {
  const N = 1024, hop = 512, w = getHann(N);
  const frames = Math.floor((x.length - N) / hop) + 1;
  if (frames < 3) return { times: [], flux: [], hopSec: hop / sr };
  const re = new Float64Array(N), im = new Float64Array(N);
  let prev = new Float64Array(N / 2);
  const flux = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < N; i++) { re[i] = x[f * hop + i] * w[i]; im[i] = 0; }
    fft(re, im);
    let s = 0;
    const cur = new Float64Array(N / 2);
    for (let k = 1; k < N / 2; k++) {
      const m = Math.log1p(1000 * Math.sqrt(re[k] * re[k] + im[k] * im[k]));
      cur[k] = m; const dlt = m - prev[k]; if (dlt > 0) s += dlt;
    }
    flux[f] = s; prev = cur;
  }
  const times = [];
  const minGap = Math.round(0.06 * sr / hop);
  let last = -minGap;
  let mx = 0; for (let i = 0; i < frames; i++) if (flux[i] > mx) mx = flux[i];
  for (let f = 1; f < frames - 1; f++) {
    const a = Math.max(0, f - 8), b = Math.min(frames, f + 8);
    const win = Array.from(flux.subarray(a, b)).sort((p, q) => p - q);
    const med = win[win.length >> 1];
    if (flux[f] > flux[f - 1] && flux[f] >= flux[f + 1] && flux[f] > med * 1.5 + 0.08 * mx && f - last >= minGap) {
      times.push((f * hop) / sr); last = f;
    }
  }
  return { times, flux, hopSec: hop / sr };
}

// Tempo por autocorrelación de la curva de ataques, en 70–180 BPM
function tempoFromFlux(flux, hopSec) {
  const n = flux.length;
  if (n < 32) return { bpm: 0, strength: 0 };
  let mean = 0; for (let i = 0; i < n; i++) mean += flux[i]; mean /= n;
  const f = flux.map((v) => Math.max(0, v - mean));
  let e0 = 0; for (let i = 0; i < n; i++) e0 += f[i] * f[i];
  if (!e0) return { bpm: 0, strength: 0 };
  let best = 0, bestLag = 0;
  const lagMin = Math.floor(60 / 180 / hopSec), lagMax = Math.min(n - 2, Math.ceil(60 / 70 / hopSec));
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let s = 0; for (let i = 0; i + lag < n; i++) s += f[i] * f[i + lag];
    s /= e0 * (n - lag) / n;
    if (s > best) { best = s; bestLag = lag; }
  }
  return { bpm: bestLag ? 60 / (bestLag * hopSec) : 0, strength: best };
}

// Pulsos dentro de los primeros 60 ms (palmas = varias ráfagas)
function earlyBursts(env1ms) {
  const lim = Math.min(env1ms.length, 70);
  let mx = 0; for (let i = 0; i < env1ms.length; i++) if (env1ms[i] > mx) mx = env1ms[i];
  let n = 0, last = -10;
  for (let i = 1; i < lim - 1; i++) {
    if (env1ms[i] > env1ms[i - 1] && env1ms[i] >= env1ms[i + 1] && env1ms[i] > 0.3 * mx && i - last >= 6) {
      // tiene que haber un valle real antes
      let mn = env1ms[i]; for (let j = Math.max(0, last); j < i; j++) mn = Math.min(mn, env1ms[j]);
      if (last < 0 || mn < env1ms[i] * 0.6) { n++; last = i; }
    }
  }
  return n;
}

export function noteName(midi, ableton = true) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const m = Math.round(midi);
  const oct = Math.floor(m / 12) - (ableton ? 2 : 1); // Ableton: C3 = 60
  return names[((m % 12) + 12) % 12] + oct;
}
export const hzToMidi = (hz) => 69 + 12 * Math.log2(hz / 440);

// Encaja la duración con compases enteros: BPM candidato más coherente con el tempo estimado
export function bpmFromDuration(dur, hint = 0) {
  const c = [];
  for (const beats of [2, 4, 8, 16, 32, 64]) {
    const bpm = (beats * 60) / dur;
    if (bpm >= 70 && bpm <= 185) c.push({ beats, bpm });
  }
  if (!c.length) return null;
  if (hint) {
    const dist = (b) => Math.min(...[0.5, 1, 2].map((m) => Math.abs(Math.log2(b / (hint * m)))));
    c.sort((a, b) => dist(a.bpm) - dist(b.bpm));
    return { ...c[0], fit: dist(c[0].bpm) };
  }
  // sin pista: el más cercano a 125
  c.sort((a, b) => Math.abs(a.bpm - 125) - Math.abs(b.bpm - 125));
  return { ...c[0], fit: null };
}

export function analyze(decoded) {
  const sr = decoded.sampleRate;
  const st = stereoInfo(decoded.channels);
  // se mide lo que sonará en la Rhythm: mono automático (la suma, salvo que se cancele)
  const mm = toMono(decoded.channels, 'auto', sr), mono = mm.data;
  const totalDur = mono.length / sr;
  const t = autoTrimPoints(mono, sr, -60);
  const out = {
    v: 5,
    sr, ch: decoded.channels.length, bits: decoded.bits,
    dur: totalDur,
    silent: t.silent,
  };
  if (t.silent) return out;
  const x = mono.subarray(t.start, t.end);
  out.activeDur = x.length / sr;
  out.leadMs = (t.start / sr) * 1000;
  out.tailCutMs = ((mono.length - t.end) / sr) * 1000;
  const pk = peakOf(x);
  let ss = 0, dc = 0, runs = 0, run = 0;
  for (let i = 0; i < x.length; i++) {
    ss += x[i] * x[i]; dc += x[i];
    if (Math.abs(x[i]) >= 0.999) { run++; if (run === 3) runs++; } else run = 0;
  }
  out.peakDb = db(pk);
  out.rmsDb = db(Math.sqrt(ss / x.length));
  out.crestDb = out.peakDb - out.rmsDb;
  out.dc = dc / x.length;
  out.clipRuns = runs;
  // envolvente
  const w1 = Math.max(1, Math.round(sr / 1000));
  const env = rmsEnvelope(x, w1);
  let emx = 0, imx = 0;
  for (let i = 0; i < env.length; i++) if (env[i] > emx) { emx = env[i]; imx = i; }
  let a10 = 0; while (a10 < imx && env[a10] < 0.1 * emx) a10++;
  let a90 = a10; while (a90 < imx && env[a90] < 0.9 * emx) a90++;
  out.attackMs = a90 - a10;
  out.peakMs = imx;
  // caída: ventana de 10 ms para no confundir trémolos
  const env10 = rmsEnvelope(x, w1 * 10);
  let m10 = 0, i10 = 0; for (let i = 0; i < env10.length; i++) if (env10[i] > m10) { m10 = env10[i]; i10 = i; }
  const fall = (dB) => { const thr = m10 * Math.pow(10, dB / 20); for (let i = i10; i < env10.length; i++) if (env10[i] < thr) return (i - i10) * 10; return null; };
  out.t20 = fall(-20); out.t40 = fall(-40);
  const mid = Math.min(env10.length - 1, Math.floor(env10.length * 0.5));
  out.sustainDb = db((env10[mid] || 1e-9) / m10);
  // ráfagas iniciales sobre la señal derivada (agudos): los graves tonales no cuentan
  const dx = new Float32Array(x.length); for (let i = 1; i < x.length; i++) dx[i] = x[i] - x[i - 1];
  out.bursts = earlyBursts(rmsEnvelope(dx, w1));
  // profundidad de la envolvente (percusivo/loop frente a sostenido)
  const ev = Array.from(env10).filter((v) => v > m10 * 1e-3).sort((a, b) => a - b);
  out.envDepthDb = ev.length > 4 ? db(ev[Math.floor(ev.length * 0.9)] / (ev[Math.floor(ev.length * 0.3)] || 1e-9)) : 0;
  // espectro
  const sp = spectral(x, sr);
  out.bands = sp.bands; out.centroid = sp.centroid; out.rolloff = sp.rolloff;
  out.flatness = sp.flatness; out.brightTrend = sp.brightTrend;
  // tono: tras el ataque, en la parte estable
  const st0 = Math.min(x.length - 1, Math.round(sr * (imx / 1000 + (out.activeDur > 1 ? 0.08 : 0.02))));
  const y = yin(x, sr, st0, out.activeDur > 0.15 ? 2048 : 1024);
  out.f0 = y.f0; out.f0conf = y.conf;
  // un acorde da una fundamental "virtual" muy grave sin energía real en graves: no es una nota
  if (y.f0 > 0 && y.f0 < 80 && (sp.bands.sub + sp.bands.low) < 0.05) { out.chordLike = true; y.conf = Math.min(y.conf, 0.5); }
  out.f0conf = y.conf;
  if (y.conf > 0.6 && y.f0 > 0) { out.midi = hzToMidi(y.f0); out.note = noteName(out.midi); out.cents = Math.round((out.midi - Math.round(out.midi)) * 100); }
  // ataques y tempo
  const on = onsets(x, sr);
  out.onsets = on.times.length;
  out.onsetTimes = on.times.slice(0, 64).map((v) => Math.round(v * 1000) / 1000);
  if (out.activeDur >= 1.2 && on.times.length >= 3) {
    const tf = tempoFromFlux(on.flux, on.hopSec);
    out.tempoAcf = tf.bpm; out.tempoStrength = tf.strength;
    // la duración del archivo completo (los loops suelen venir cortados a compás)
    const fit = bpmFromDuration(totalDur, tf.bpm);
    if (fit) { out.loopBpm = fit.bpm; out.loopBeats = fit.beats; out.loopFit = fit.fit; }
    // regularidad de los ataques
    const gaps = []; for (let i = 1; i < on.times.length; i++) gaps.push(on.times[i] - on.times[i - 1]);
    const g = gaps.slice().sort((a, b) => a - b), med = g[g.length >> 1] || 1;
    out.onsetRegularity = gaps.filter((v) => Math.abs(v / med - Math.round(v / med)) < 0.12).length / gaps.length;
  }
  if (st.stereo) { let pk2 = 0; for (const c of decoded.channels) pk2 = Math.max(pk2, peakOf(c)); out.peakChDb = db(pk2); }
  out.stereo = st.stereo; out.corr = st.corr; out.monoLossDb = st.lossDb; out.identicalLR = !!st.identical;
  // v2.8: cómo se pasa a mono para la Rhythm y cuánto se perdía con la suma tal cual
  out.mono = { used: mm.used, ...(mm.fix ? { lossBefore: +mm.fix.lossBefore.toFixed(2), lossAfter: +mm.fix.lossAfter.toFixed(2), delayMs: +(mm.fix.delayMs || 0).toFixed(2), flipped: !!mm.fix.flipped, lead: mm.fix.lead || null, worstDb: +(mm.fix.worstDb || 0).toFixed(1), worstHz: Math.round(mm.fix.worstHz || 0) } : {}) };
  return out;
}
