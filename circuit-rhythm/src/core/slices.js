// core/slices.js — v1.8: exportar un sample entero o partido en slices iguales, en dos formatos:
//  · 'rhythm'   48 kHz · mono · 16 bit con su preparación (nivel, mono, recorte, ajuste al compás)
//  · 'original' la frecuencia, los canales y los bits del archivo original: solo se recorta y se parte
// Las slices se cuentan sobre la misma zona que la rejilla de Slices de la Rhythm: recortada y ajustada al compás.
import { DEFAULT_RECIPE, toMono, trimRange, render } from './dsp.js';
import { encodeWav16, quantize16 } from './wav.js';
import { applyKeep, keepIsIdentity } from './shorten.js';

export const SLICE_FADE_MS = 2;          // fundido corto en cada corte para que no haga clic
export const SLICE_MAX_SEC = 30;         // tope por archivo de la Rhythm (solo en formato Rhythm)

// Zona sobre la que se parte, en muestras del original: inicio y longitud (con el ajuste al compás).
export function zoneOf(decoded, recipeIn = {}) {
  const r = { ...DEFAULT_RECIPE, ...recipeIn };
  const sr = decoded.sampleRate;
  const m = toMono(decoded.channels, r.mono, decoded.sampleRate);
  const { s, e } = trimRange(m.data, sr, r);
  const len = r.fitSec ? Math.round(r.fitSec * sr) : e - s;
  return { s, len, sr };
}
// Límites [a, b) de n partes iguales de una longitud (en muestras)
export function sliceBounds(len, n) {
  const k = Math.max(1, Math.floor(n) || 1), out = [];
  for (let i = 0; i < k; i++) out.push([Math.round((i * len) / k), Math.round(((i + 1) * len) / k)]);
  return out;
}
function fadeEdges(arr, n, atStart, atEnd) {
  const m = Math.min(n, Math.floor(arr.length / 2));
  for (let i = 0; i < m; i++) {
    const g = Math.sin((Math.PI / 2) * (i / m)) ** 2;
    if (atStart) arr[i] *= g;
    if (atEnd) arr[arr.length - 1 - i] *= g;
  }
}

// Formato original: todos los canales, la frecuencia original, sin tocar el nivel.
// Solo lleva fundido donde se corta el audio (no en el principio ni en el final reales del archivo).
export function slicesOriginal(decoded, recipe, n = 1, { fadeMs = SLICE_FADE_MS } = {}) {
  const z = zoneOf(decoded, recipe), total = decoded.channels[0].length;
  const nf = Math.round((fadeMs / 1000) * z.sr);
  return sliceBounds(z.len, n).map(([a, b]) => {
    const st = z.s + a, en = z.s + b;
    const channels = decoded.channels.map((c) => {
      const y = new Float32Array(b - a);
      y.set(c.subarray(Math.min(st, c.length), Math.min(en, c.length)));
      fadeEdges(y, nf, st > 0, en < total);
      return y;
    });
    return { channels, sampleRate: z.sr };
  });
}

// v2.9: entero «como el original, con tus cortes»: la zona (recorte y ajuste al compás) y, si el loop está
// acortado, las slices elegidas unidas igual que para la Rhythm (mismos fundidos cruzados en las uniones y en el
// punto de bucle). Todos los canales, la frecuencia original y el nivel sin tocar.
export function cutOriginal(decoded, recipe) {
  const r = { ...DEFAULT_RECIPE, ...recipe };
  const [part] = slicesOriginal(decoded, r, 1);
  if (!r.keep || keepIsIdentity(r.keep)) return part;
  return { ...part, channels: part.channels.map((c) => applyKeep(c, r.keep, part.sampleRate)), kept: true };
}

// Formato Rhythm: la zona preparada entera (mismo nivel para todas las slices), partida en 48 kHz mono.
// Sin «acortar» ni reverse: las slices son partes del loop tal cual suena de principio a fin.
export function slicesRhythm(decoded, recipe, n = 1, { fadeMs = SLICE_FADE_MS, maxSec = SLICE_MAX_SEC } = {}) {
  const r = { ...DEFAULT_RECIPE, ...recipe, keep: null, reverse: false, maxSec: 1e9 };
  const { data, rate } = render(decoded, r, 48000);
  const nf = Math.round((fadeMs / 1000) * rate), cap = Math.round(maxSec * rate);
  const parts = sliceBounds(data.length, n);
  return parts.map(([a, b], i) => {
    let y = data.slice(a, b);
    fadeEdges(y, nf, i > 0, i < parts.length - 1);
    if (y.length > cap) { y = y.slice(0, cap); fadeEdges(y, nf, false, true); }
    return { channels: [y], sampleRate: rate, capped: b - a > cap };
  });
}

// Profundidad con la que se escribe «como el original»: la misma si el WAV la admite.
// 8 bit → 16; 32 bit entero → 24; coma flotante → 32 float; comprimidos (MP3, FLAC, OGG) → 24.
export function originalFormat(decoded) {
  if (decoded.format === 'float') return { bits: 32, float: true };
  const b = decoded.bits || 0;
  if (b === 16) return { bits: 16, float: false };
  if (b === 8) return { bits: 16, float: false };
  return { bits: 24, float: false };
}
// WAV con la escala inversa exacta de la lectura (÷32768, ÷8388608): lo que no se toca sale idéntico, bit a bit.
export function encodeOriginal(part, fmt) {
  const { channels, sampleRate: rate } = part, { bits, float } = fmt;
  const ch = channels.length, n = channels[0].length, bps = bits / 8;
  const buf = new ArrayBuffer(44 + n * ch * bps), dv = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < 4; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * ch * bps, true); w(8, 'WAVE');
  w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, float ? 3 : 1, true); dv.setUint16(22, ch, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * ch * bps, true); dv.setUint16(32, ch * bps, true); dv.setUint16(34, bits, true);
  w(36, 'data'); dv.setUint32(40, n * ch * bps, true);
  const FS = bits === 16 ? 32768 : 8388608, MAX = FS - 1;
  let p = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const v = channels[c][i];
    if (float) dv.setFloat32(p, v, true);
    else {
      const x = Math.max(-FS, Math.min(MAX, Math.round(v * FS)));
      if (bits === 16) dv.setInt16(p, x, true);
      else { dv.setUint8(p, x & 255); dv.setUint8(p + 1, (x >> 8) & 255); dv.setUint8(p + 2, (x >> 16) & 255); }
    }
    p += bps;
  }
  return new Uint8Array(buf);
}
// Formato Rhythm: el mismo camino que el resto de exportaciones (16 bit con dither TPDF determinista)
export function encodeRhythm(part) { return encodeWav16(quantize16(part.channels[0]), part.sampleRate); }
// «Nombre 03.wav»: número con ceros según cuántas haya
export function sliceName(base, i, n) { return n > 1 ? `${base} ${String(i + 1).padStart(String(n).length < 2 ? 2 : String(n).length, '0')}` : base; }
