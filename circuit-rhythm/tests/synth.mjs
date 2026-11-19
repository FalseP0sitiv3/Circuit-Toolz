// Señales sintéticas para probar análisis y clasificación (deterministas).
export const SR = 44100;
function rng(seed = 7) { let s = seed; return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s / 4294967296) * 2 - 1; }; }
const buf = (sec, sr = SR) => new Float32Array(Math.round(sec * sr));
function hp(x, a = 0.95) { const y = new Float32Array(x.length); let px = 0, py = 0; for (let i = 0; i < x.length; i++) { py = a * (py + x[i] - px); px = x[i]; y[i] = py; } return y; }
function lp(x, a = 0.2) { const y = new Float32Array(x.length); let p = 0; for (let i = 0; i < x.length; i++) { p += a * (x[i] - p); y[i] = p; } return y; }

export function kick(sr = SR, len = 0.5, lead = 0) {
  const x = buf(len + lead, sr); let ph = 0; const o = Math.round(lead * sr);
  for (let i = 0; i + o < x.length; i++) { const t = i / sr; const f = 50 + 120 * Math.exp(-t * 30); ph += (2 * Math.PI * f) / sr; x[i + o] = 0.9 * Math.sin(ph) * Math.exp(-t * 7); }
  return x;
}
export function hat(sr = SR, len = 0.12, decay = 40) { const r = rng(3), n = buf(len, sr); for (let i = 0; i < n.length; i++) n[i] = r() * Math.exp(-(i / sr) * decay); const h = hp(hp(hp(n, 0.6), 0.6), 0.6); return h.map((v) => v * 0.8); }
export function snare(sr = SR, len = 0.35) { const r = rng(5), x = buf(len, sr); for (let i = 0; i < x.length; i++) { const t = i / sr; x[i] = 0.5 * Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 25) + 0.5 * r() * Math.exp(-t * 14); } return hp(x, 0.97); }
export function clap(sr = SR) { const r = rng(9), x = buf(0.4, sr); for (const st of [0, 0.011, 0.022, 0.034]) { const o = Math.round(st * sr); for (let i = 0; i < x.length - o; i++) { const t = i / sr; const g = st < 0.03 ? Math.exp(-t * 300) : Math.exp(-t * 18); x[o + i] += 0.5 * r() * g; } } const y = hp(lp(x, 0.5), 0.9); return y; }
export function saw(f, sec, sr = SR, att = 0.002, rel = 0.05, amp = 0.6) { const x = buf(sec, sr); for (let i = 0; i < x.length; i++) { const t = i / sr; const ph = (t * f) % 1; const e = Math.min(1, t / att) * Math.min(1, (sec - t) / rel); x[i] = amp * (2 * ph - 1) * e; } return lp(x, 0.35); }
export function sine(f, sec, sr = SR, amp = 0.7) { const x = buf(sec, sr); for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin((2 * Math.PI * f * i) / sr) * Math.min(1, i / (sr * 0.003)) * Math.min(1, (x.length - i) / (sr * 0.02)); return x; }
export function pad(sr = SR, sec = 4) { const x = buf(sec, sr); for (const f of [220, 261.6, 329.6]) for (let i = 0; i < x.length; i++) { const t = i / sr; x[i] += 0.2 * Math.sin(2 * Math.PI * f * t + Math.sin(2 * Math.PI * 0.3 * t)) * Math.min(1, t / 1.2) * Math.min(1, (sec - t) / 0.8); } return x; }
export function cymbal(sr = SR, len = 2.5) { return hat(sr, len, 1.6); }
export function riser(sr = SR, sec = 3) { const r = rng(11), x = buf(sec, sr); let p = 0; for (let i = 0; i < x.length; i++) { const t = i / sr; const a = 0.02 + 0.9 * (t / sec) ** 2; p += a * (r() - p); x[i] = (r() * (t / sec) - p * (1 - t / sec)) * 0.7 * Math.min(1, t / 0.5); } return x; }
export function drumLoop(bpm = 128, bars = 2, sr = SR) {
  const beat = 60 / bpm, len = bars * 4 * beat, x = buf(len, sr);
  const k = kick(sr, 0.4), h = hat(sr, 0.08);
  for (let b = 0; b < bars * 4; b++) {
    const o = Math.round(b * beat * sr); for (let i = 0; i < k.length && o + i < x.length; i++) x[o + i] += k[i];
    const o2 = Math.round((b + 0.5) * beat * sr); for (let i = 0; i < h.length && o2 + i < x.length; i++) x[o2 + i] += h[i] * 0.6;
  }
  return x;
}
export const st = (L, R) => [L, R];
