// core/loud.js — v2.3: volumen percibido (LUFS, ITU-R BS.1770) para igualar los samples de una pista.
// Se usa el máximo de la sonoridad momentánea (ventanas de 400 ms): un golpe corto se mide en su ventana
// de 400 ms, como lo oiría un medidor, así un clic cuenta menos que un bombo largo con el mismo pico.

// Coeficientes de la ponderación K para cualquier frecuencia (derivación de De Man: a 48 kHz dan
// exactamente los de la norma)
function biquadShelf(fs) {
  const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  const K = Math.tan((Math.PI * f0) / fs), Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  const a0 = 1 + K / Q + K * K;
  return { b: [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0], a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0] };
}
function biquadHP(fs) {
  const f0 = 38.13547087602444, Q = 0.5003270373238773, K = Math.tan((Math.PI * f0) / fs), a0 = 1 + K / Q + K * K;
  return { b: [1, -2, 1], a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0] };
}
export function kCoefficients(fs) { return [biquadShelf(fs), biquadHP(fs)]; }
function filt(x, { b, a }) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
// Máximo de la sonoridad momentánea en LUFS (−Infinity si es silencio). Mono.
export function loudnessMax(x, fs) {
  if (!x || !x.length) return -Infinity;
  const [s1, s2] = kCoefficients(fs);
  const y = filt(filt(x, s1), s2);
  const W = Math.round(0.4 * fs), H = Math.round(0.1 * fs);
  let best = 0;
  if (y.length <= W) { let s = 0; for (let i = 0; i < y.length; i++) s += y[i] * y[i]; best = s / W; }
  else {
    // suma deslizante: ventana de 400 ms cada 100 ms, más la última ventana al final
    const c = new Float64Array(y.length + 1);
    for (let i = 0; i < y.length; i++) c[i + 1] = c[i] + y[i] * y[i];
    for (let st = 0; ; st += H) {
      const s0 = Math.min(st, y.length - W);
      best = Math.max(best, (c[s0 + W] - c[s0]) / W);
      if (s0 === y.length - W) break;
    }
  }
  return best > 0 ? -0.691 + 10 * Math.log10(best) : -Infinity;
}

// Igualar una pista (página): items [{id, lufs}] medidos con el pico ya normalizado, es decir, lo más
// fuerte que puede sonar cada uno sin saturar. El objetivo es el más flojo de los normales (los que están
// a menos de `spread` dB de la mediana): los demás bajan hasta él. Los que quedan por debajo no pueden subir
// sin saturar y se avisan.
export function matchGroup(items, { spread = 6 } = {}) {
  const ok = items.filter((x) => Number.isFinite(x.lufs));
  if (!ok.length) return { target: null, items: [] };
  const v = ok.map((x) => x.lufs).sort((p, q) => p - q), med = v[v.length >> 1];
  const target = Math.min(...v.filter((l) => l >= med - spread));
  return {
    target,
    items: ok.map((x) => ({ id: x.id, from: x.lufs, to: Math.min(x.lufs, target), cut: Math.max(0, x.lufs - target), low: x.lufs < target - 0.05 ? target - x.lufs : 0 })),
  };
}
