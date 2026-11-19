// core/wav.js — lectura de WAV/AIFF/AIFC y escritura de WAV 16 bit mono.
// Puro JS (sin Web Audio) para poder probarlo en Node y para conservar la frecuencia original.

export const RHYTHM_RATE = 48000;

function fourcc(dv, o) {
  return String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
}

// IEEE 754 de 80 bits (frecuencia en AIFF)
function readExtended(dv, o) {
  const exp = ((dv.getUint8(o) & 0x7f) << 8) | dv.getUint8(o + 1);
  const hi = dv.getUint32(o + 2), lo = dv.getUint32(o + 6);
  if (exp === 0 && hi === 0 && lo === 0) return 0;
  const sign = dv.getUint8(o) & 0x80 ? -1 : 1;
  return sign * (hi * Math.pow(2, exp - 16383 - 31) + lo * Math.pow(2, exp - 16383 - 63));
}

function deinterleave(dv, off, frames, ch, bits, fmt, le) {
  const out = [];
  for (let c = 0; c < ch; c++) out.push(new Float32Array(frames));
  const bps = bits / 8, stride = bps * ch;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < ch; c++) {
      const p = off + i * stride + c * bps;
      let v;
      if (fmt === 'float') v = bits === 64 ? dv.getFloat64(p, le) : dv.getFloat32(p, le);
      else if (bits === 8) v = le ? (dv.getUint8(p) - 128) / 128 : dv.getInt8(p) / 128; // WAV 8 bit sin signo, AIFF con signo
      else if (bits === 16) v = dv.getInt16(p, le) / 32768;
      else if (bits === 24) {
        const b0 = dv.getUint8(p), b1 = dv.getUint8(p + 1), b2 = dv.getUint8(p + 2);
        let x = le ? (b0 | (b1 << 8) | (b2 << 16)) : ((b0 << 16) | (b1 << 8) | b2);
        if (x & 0x800000) x -= 0x1000000;
        v = x / 8388608;
      } else if (bits === 32) v = dv.getInt32(p, le) / 2147483648;
      else throw new Error('bits ' + bits);
      out[c][i] = v;
    }
  }
  return out;
}

// Devuelve { sampleRate, channels:[Float32Array], bits, format, container, meta }
export function parseAudio(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (u8.length < 12) throw new Error('archivo demasiado corto');
  const id = fourcc(dv, 0);
  if (id === 'RIFF' || id === 'RIFX') return parseWav(dv, id === 'RIFF');
  if (id === 'FORM') return parseAiff(dv);
  throw new Error('no es WAV ni AIFF');
}

function parseWav(dv, le) {
  if (fourcc(dv, 8) !== 'WAVE') throw new Error('RIFF sin WAVE');
  let p = 12, fmt = null, data = null;
  const meta = {};
  while (p + 8 <= dv.byteLength) {
    const cid = fourcc(dv, p);
    let size = dv.getUint32(p + 4, le);
    const body = p + 8;
    if (body + size > dv.byteLength) size = dv.byteLength - body; // tolerar tamaños mal escritos
    if (cid === 'fmt ') {
      let tag = dv.getUint16(body, le);
      const ch = dv.getUint16(body + 2, le);
      const rate = dv.getUint32(body + 4, le);
      const bits = dv.getUint16(body + 14, le);
      if (tag === 0xfffe && size >= 40) tag = dv.getUint16(body + 24, le); // EXTENSIBLE: subformato
      fmt = { tag, ch, rate, bits };
    } else if (cid === 'data') {
      data = { off: body, size };
    } else if (cid === 'smpl' && size >= 36) {
      meta.rootNote = dv.getUint32(body + 12, le);
      const pitchFrac = dv.getUint32(body + 16, le);
      if (pitchFrac) meta.rootCents = Math.round((pitchFrac / 4294967296) * 100);
      const nLoops = dv.getUint32(body + 28, le);
      meta.loops = [];
      for (let i = 0; i < nLoops && body + 36 + i * 24 + 24 <= body + size; i++) {
        const q = body + 36 + i * 24;
        meta.loops.push({ start: dv.getUint32(q + 8, le), end: dv.getUint32(q + 12, le) });
      }
    } else if (cid === 'acid' && size >= 24) {
      const flags = dv.getUint32(body, le);
      meta.acidOneShot = !!(flags & 1);
      meta.acidRoot = dv.getUint16(body + 4, le);
      meta.beats = dv.getUint32(body + 12, le);
      meta.tempo = dv.getFloat32(body + 20, le);
    }
    p = body + size + (size & 1);
  }
  if (!fmt) throw new Error('WAV sin bloque fmt');
  if (!data) throw new Error('WAV sin datos');
  let kind;
  if (fmt.tag === 1) kind = 'int';
  else if (fmt.tag === 3) kind = 'float';
  else throw new Error('WAV comprimido (formato ' + fmt.tag + ')');
  if (![8, 16, 24, 32, 64].includes(fmt.bits)) throw new Error('profundidad ' + fmt.bits);
  const frames = Math.floor(data.size / ((fmt.bits / 8) * fmt.ch));
  const channels = deinterleave(dv, data.off, frames, fmt.ch, fmt.bits, kind, le);
  return { sampleRate: fmt.rate, channels, bits: fmt.bits, format: kind, container: 'wav', meta };
}

function parseAiff(dv) {
  const form = fourcc(dv, 8);
  if (form !== 'AIFF' && form !== 'AIFC') throw new Error('FORM sin AIFF');
  let p = 12, comm = null, ssnd = null;
  const meta = {};
  while (p + 8 <= dv.byteLength) {
    const cid = fourcc(dv, p);
    let size = dv.getUint32(p + 4, false);
    const body = p + 8;
    if (body + size > dv.byteLength) size = dv.byteLength - body;
    if (cid === 'COMM') {
      comm = {
        ch: dv.getUint16(body, false),
        frames: dv.getUint32(body + 2, false),
        bits: dv.getUint16(body + 6, false),
        rate: readExtended(dv, body + 8),
        comp: form === 'AIFC' && size >= 22 ? fourcc(dv, body + 18) : 'NONE',
      };
    } else if (cid === 'SSND') {
      const offset = dv.getUint32(body, false);
      ssnd = { off: body + 8 + offset, size: size - 8 - offset };
    } else if (cid === 'INST' && size >= 8) {
      meta.rootNote = dv.getUint8(body);
    }
    p = body + size + (size & 1);
  }
  if (!comm || !ssnd) throw new Error('AIFF incompleto');
  let le = false, kind = 'int', bits = comm.bits;
  const c = comm.comp.toLowerCase();
  if (c === 'sowt') le = true;
  else if (c === 'fl32') { kind = 'float'; bits = 32; }
  else if (c === 'fl64') { kind = 'float'; bits = 64; }
  else if (c !== 'none') throw new Error('AIFC comprimido (' + comm.comp + ')');
  const frames = Math.min(comm.frames, Math.floor(ssnd.size / ((bits / 8) * comm.ch)));
  const channels = deinterleave(dv, ssnd.off, frames, comm.ch, bits, kind, le);
  return { sampleRate: Math.round(comm.rate), channels, bits, format: kind, container: 'aiff', meta };
}

// Cabecera rápida (sin decodificar): para no leer gigas al importar.
export function sniffAudio(head) {
  const u8 = head instanceof Uint8Array ? head : new Uint8Array(head);
  if (u8.length < 12) return null;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const id = fourcc(dv, 0);
  if ((id === 'RIFF' || id === 'RIFX') && fourcc(dv, 8) === 'WAVE') return 'wav';
  if (id === 'FORM' && (fourcc(dv, 8) === 'AIFF' || fourcc(dv, 8) === 'AIFC')) return 'aiff';
  if (id.startsWith('ID3') || (u8[0] === 0xff && (u8[1] & 0xe0) === 0xe0)) return 'mp3';
  if (id === 'fLaC') return 'flac';
  if (id === 'OggS') return 'ogg';
  if (u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 3 && u8[3] === 4) return 'zip';
  return null;
}

// Generador pseudoaleatorio determinista (para el dither: misma entrada → mismos bytes)
function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// Float32 mono → Int16 con dither TPDF (±1 LSB). Determinista.
export function quantize16(x, dither = true) {
  const out = new Int16Array(x.length);
  const rnd = lcg(0x5eed);
  for (let i = 0; i < x.length; i++) {
    let v = x[i] * 32767;
    if (dither) v += rnd() - rnd();
    v = Math.round(v);
    out[i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
  }
  return out;
}

// WAV PCM 16 bit mono limpio (solo fmt + data), como lo espera la Rhythm.
export function encodeWav16(pcm16, rate = RHYTHM_RATE) {
  const n = pcm16.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < 4; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE');
  w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  w(36, 'data'); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, pcm16[i], true);
  return new Uint8Array(buf);
}

// Para pruebas: escribe WAV de cualquier profundidad (int 16/24, float 32), varios canales.
export function encodeWavGeneric(channels, rate, bits = 16, float = false) {
  const ch = channels.length, n = channels[0].length, bps = bits / 8;
  const buf = new ArrayBuffer(44 + n * ch * bps);
  const dv = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < 4; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * ch * bps, true); w(8, 'WAVE');
  w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, float ? 3 : 1, true); dv.setUint16(22, ch, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * ch * bps, true); dv.setUint16(32, ch * bps, true); dv.setUint16(34, bits, true);
  w(36, 'data'); dv.setUint32(40, n * ch * bps, true);
  let p = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const v = Math.max(-1, Math.min(1, channels[c][i]));
    if (float) dv.setFloat32(p, v, true);
    else if (bits === 16) dv.setInt16(p, Math.round(v * 32767), true);
    else if (bits === 24) { const x = Math.round(v * 8388607); dv.setUint8(p, x & 255); dv.setUint8(p + 1, (x >> 8) & 255); dv.setUint8(p + 2, (x >> 16) & 255); }
    p += bps;
  }
  return new Uint8Array(buf);
}
