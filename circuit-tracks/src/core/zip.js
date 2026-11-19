// Lector y escritor ZIP mínimos y defensivos (sin dependencias).
// Lectura: métodos 0 (store) y 8 (deflate, vía DecompressionStream). Sin ZIP64 ni cifrado.

export const ZIP_LIMITS = { maxEntries: 5000, maxEntrySize: 4 * 1024 * 1024, maxTotal: 256 * 1024 * 1024, maxRatio: 200 };

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

// Normaliza una ruta interna y rechaza las peligrosas.
export function safeZipPath(name) {
  const n = String(name).replace(/\\/g, '/');
  if (/^\/|^[a-zA-Z]:/.test(n)) return { ok: false, why: 'ruta absoluta' };
  const parts = n.split('/').filter((p) => p !== '' && p !== '.');
  if (parts.some((p) => p === '..')) return { ok: false, why: 'ruta con «..»' };
  if (parts.some((p) => /[\x00-\x1f]/.test(p))) return { ok: false, why: 'caracteres de control' };
  return { ok: true, path: parts.join('/') };
}

const dv = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);

async function inflateRaw(data, expected) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([data]).stream().pipeThrough(ds);
  const reader = stream.getReader(); const chunks = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    total += value.length;
    if (total > expected || total > ZIP_LIMITS.maxEntrySize) { await reader.cancel(); throw new Error('tamaño descomprimido mayor que el declarado'); }
    chunks.push(value);
  }
  const out = new Uint8Array(total); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// filter(path) → true para extraer. Devuelve { entries:[{path,bytes}], skipped:[{path,why}], errors:[] }.
export async function readZip(bytes, filter = () => true) {
  const res = { entries: [], skipped: [], errors: [] };
  const v = dv(bytes);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) { res.errors.push('No es un ZIP válido o está dañado (sin directorio central)'); return res; }
  const count = v.getUint16(eocd + 10, true), cdSize = v.getUint32(eocd + 12, true), cdOff = v.getUint32(eocd + 16, true);
  if (count === 0xFFFF || cdOff === 0xFFFFFFFF) { res.errors.push('ZIP64 no soportado'); return res; }
  if (count > ZIP_LIMITS.maxEntries) { res.errors.push(`Demasiadas entradas (${count})`); return res; }
  if (cdOff + cdSize > bytes.length) { res.errors.push('Directorio central fuera del archivo: ZIP truncado'); return res; }
  let p = cdOff, total = 0;
  const dec = new TextDecoder('utf-8', { fatal: false }), dec437 = new TextDecoder('latin1');
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || v.getUint32(p, true) !== 0x02014b50) { res.errors.push('Entrada del directorio central dañada'); break; }
    const flags = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true), crc = v.getUint32(p + 16, true);
    const csize = v.getUint32(p + 20, true), usize = v.getUint32(p + 24, true);
    const nlen = v.getUint16(p + 28, true), elen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), loff = v.getUint32(p + 42, true);
    const rawName = bytes.slice(p + 46, p + 46 + nlen);
    const name = (flags & 0x800 ? dec : dec437).decode(rawName);
    p += 46 + nlen + elen + clen;
    if (name.endsWith('/')) continue;
    const sp = safeZipPath(name);
    if (!sp.ok) { res.skipped.push({ path: name, why: 'Ruta rechazada: ' + sp.why }); continue; }
    if (/(^|\/)__MACOSX\//.test(sp.path) || /(^|\/)\._/.test(sp.path) || /(^|\/)\.DS_Store$/.test(sp.path)) continue;
    if (!filter(sp.path)) { res.skipped.push({ path: sp.path, why: 'Tipo de archivo no importable' }); continue; }
    if (flags & 1) { res.skipped.push({ path: sp.path, why: 'Entrada cifrada' }); continue; }
    if (usize > ZIP_LIMITS.maxEntrySize) { res.skipped.push({ path: sp.path, why: `Demasiado grande (${usize} bytes)` }); continue; }
    if (csize > 0 && usize / csize > ZIP_LIMITS.maxRatio) { res.skipped.push({ path: sp.path, why: 'Ratio de compresión sospechoso' }); continue; }
    total += usize;
    if (total > ZIP_LIMITS.maxTotal) { res.errors.push('Tamaño descomprimido total por encima del límite'); break; }
    if (loff + 30 > bytes.length || v.getUint32(loff, true) !== 0x04034b50) { res.skipped.push({ path: sp.path, why: 'Cabecera local dañada' }); continue; }
    const start = loff + 30 + v.getUint16(loff + 26, true) + v.getUint16(loff + 28, true);
    if (start + csize > bytes.length) { res.skipped.push({ path: sp.path, why: 'Datos truncados' }); continue; }
    const data = bytes.slice(start, start + csize);
    let out;
    try {
      if (method === 0) out = data;
      else if (method === 8) out = await inflateRaw(data, usize);
      else { res.skipped.push({ path: sp.path, why: `Método de compresión ${method} no soportado` }); continue; }
    } catch (e) { res.skipped.push({ path: sp.path, why: 'Error al descomprimir: ' + e.message }); continue; }
    if (out.length !== usize) { res.skipped.push({ path: sp.path, why: 'Tamaño descomprimido incorrecto' }); continue; }
    if (crc32(out) !== crc) { res.skipped.push({ path: sp.path, why: 'CRC incorrecto: entrada dañada' }); continue; }
    res.entries.push({ path: sp.path, bytes: out });
  }
  return res;
}

// Escritor ZIP (store, UTF-8).
export function writeZip(files) {
  const enc = new TextEncoder(), locals = [], centrals = []; let offset = 0;
  const d = new Date(), dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of files) {
    const name = enc.encode(f.unsafeRawPath ?? (safeZipPath(f.path).path || 'file')), data = f.bytes, crc = crc32(data);
    const lh = new Uint8Array(30 + name.length), lv = dv(lh);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x800, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, dosTime, true); lv.setUint16(12, dosDate, true); lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true); lh.set(name, 30);
    const ch = new Uint8Array(46 + name.length), cv = dv(ch);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true); cv.setUint16(14, dosDate, true); cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); ch.set(name, 46);
    locals.push(lh, data); centrals.push(ch); offset += lh.length + data.length;
  }
  const cdSize = centrals.reduce((a, c) => a + c.length, 0), end = new Uint8Array(22), ev = dv(end);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22); let o = 0;
  for (const part of [...locals, ...centrals, end]) { out.set(part, o); o += part.length; }
  return out;
}
