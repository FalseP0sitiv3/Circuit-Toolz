// core/zip.js — ZIP mínimo y defensivo: lectura (store/deflate) y escritura (deflate o store).
// Usa CompressionStream/DecompressionStream (navegador y Node ≥ 18).

let CRC = null;
export function crc32(u8) {
  if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function streamBytes(u8, ts) {
  const s = new Blob([u8]).stream().pipeThrough(ts);
  return new Uint8Array(await new Response(s).arrayBuffer());
}
export const deflateRaw = (u8) => streamBytes(u8, new CompressionStream('deflate-raw'));
export const inflateRaw = (u8) => streamBytes(u8, new DecompressionStream('deflate-raw'));

const enc = new TextEncoder();
const dec = new TextDecoder();

// Lista las entradas (sin descomprimir). Lanza error si no es ZIP.
export function zipEntries(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('ZIP sin directorio central');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  if (p === 0xffffffff) throw new Error('ZIP64 no admitido');
  const out = [];
  for (let i = 0; i < count; i++) {
    if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP dañado');
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const nameBytes = u8.subarray(p + 46, p + 46 + nlen);
    const name = flags & 0x800 ? dec.decode(nameBytes) : Array.from(nameBytes, (c) => String.fromCharCode(c)).join('');
    out.push({ name, method, csize, usize, local, encrypted: !!(flags & 1), dir: name.endsWith('/') });
    p += 46 + nlen + xlen + clen;
  }
  return { u8, dv, entries: out };
}

export async function zipRead(z, entry) {
  const { u8, dv } = z;
  const p = entry.local;
  if (dv.getUint32(p, true) !== 0x04034b50) throw new Error('cabecera local dañada');
  const nlen = dv.getUint16(p + 26, true), xlen = dv.getUint16(p + 28, true);
  const start = p + 30 + nlen + xlen;
  const data = u8.subarray(start, start + entry.csize);
  if (entry.encrypted) throw new Error('ZIP cifrado');
  if (entry.method === 0) return data.slice();
  if (entry.method === 8) return inflateRaw(data);
  throw new Error('método ZIP ' + entry.method);
}

// files: [{name, data:Uint8Array|string, store?:bool}] → Uint8Array (ZIP)
export async function zipWrite(files, { compress = true } = {}) {
  const parts = [], central = [];
  let off = 0;
  const dosTime = 0, dosDate = (2026 - 1980) << 9 | 1 << 5 | 1; // fecha fija → archivos reproducibles
  for (const f of files) {
    const nameB = enc.encode(f.name);
    const raw = typeof f.data === 'string' ? enc.encode(f.data) : (f.data || new Uint8Array(0));
    const isDir = f.name.endsWith('/');
    let method = 0, body = raw;
    if (compress && !f.store && !isDir && raw.length > 64) {
      const d = await deflateRaw(raw);
      if (d.length < raw.length) { method = 8; body = d; }
    }
    const crc = isDir ? 0 : crc32(raw);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x800, true); lh.setUint16(8, method, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, body.length, true); lh.setUint32(22, raw.length, true); lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), nameB, body);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x800, true); ch.setUint16(10, method, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, body.length, true);
    ch.setUint32(24, raw.length, true); ch.setUint16(28, nameB.length, true); ch.setUint32(38, isDir ? 0x10 : 0, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), nameB);
    off += 30 + nameB.length + body.length;
  }
  const cdSize = central.reduce((s, b) => s + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)];
  const total = all.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(total);
  let q = 0; for (const b of all) { out.set(b, q); q += b.length; }
  return out;
}
