// Fixtures SINTÉTICOS. Construidos a partir de los valores por defecto de la guía oficial.
// No sustituyen a archivos reales ni validan el comportamiento del hardware.
import { PARAMS } from '../src/core/params.js';
import { buildReplaceCurrent, buildReplacePatch, encodeName } from '../src/core/sysex.js';

export function initPayload(name = 'Initial Patch', set = {}) {
  const b = new Uint8Array(340);
  b.set(encodeName(name), 0);
  for (const p of PARAMS) b[p.off] = p.def;
  for (let i = 0; i < 20; i++) b.set([0, 0, 64, 0], 124 + 4 * i);
  for (let k = 0; k < 8; k++) { b[204 + 17 * k] = 0; for (let j = 0; j < 4; j++) b.set([0, 0, 127, 64], 205 + 17 * k + 4 * j); }
  for (const [off, v] of Object.entries(set)) b[+off] = v;
  return b;
}
export const syx = (payload, product = 0x64) => buildReplaceCurrent(payload, 0, product);
export const bank = (payloads) => { const parts = payloads.map((p, i) => buildReplacePatch(p, i)); const out = new Uint8Array(parts.length * 350); parts.forEach((p, i) => out.set(p, i * 350)); return out; };
export const setMacro = (b, k, j, dest, depth = 96, start = 0, end = 127) => { b.set([dest, start, end, depth], 205 + 17 * k + 4 * j); return b; };

// Perfiles sintéticos con configuración característica (offsets oficiales).
export const presets = {
  monoBass: () => initPayload('Rolling Bass 2', { 32: 0, 35: 62, 70: 0, 71: 50, 72: 40, 73: 10, 64: 40, 66: 30 }),
  padPoly: () => initPayload('UNTITLED', { 32: 2, 70: 80, 73: 100, 72: 110 }),
  pluck: () => initPayload('Thing 7', { 32: 2, 70: 0, 71: 40, 72: 0, 73: 20 }),
  acid: () => initPayload('Squelchy', { 32: 0, 35: 62, 66: 100, 68: 110, 76: 40, 77: 0, 64: 30 })
};
