// Genera archivos SINTÉTICOS para la prueba de navegador.
import { writeFileSync, mkdirSync } from 'node:fs';
import { initPayload, syx, bank, setMacro, presets } from './fixtures.js';
import { writeZip } from '../src/core/zip.js';
import { b64 } from '../src/core/library.js';
const dir = 'tests/out'; mkdirSync(dir, { recursive: true });
const acid = initPayload('Acid Line', { 32: 0, 35: 62, 66: 100, 68: 110, 76: 40, 77: 0, 64: 30 }); setMacro(acid, 4, 0, 20); setMacro(acid, 5, 0, 21); setMacro(acid, 6, 0, 20);
const pad = presets.padPoly(); pad.set([8, 0, 90, 12], 124);
const files = {
  'Acid Line.syx': syx(acid), 'Dark Pad.syx': syx(initPayload('Dark Pad', { 32: 2, 70: 80, 73: 100, 64: 120 })), 'untitled 3.syx': syx(pad),
  'Lead Bass.syx': syx(initPayload('Lead Bass')), 'Rolling Bass 2.syx': syx(presets.monoBass()), 'Glass Pluck.syx': syx(presets.pluck()),
  'Acid Line v2.syx': syx(setMacro(new Uint8Array(acid), 7, 0, 44)), 'broken.syx': syx(initPayload('Broken')).slice(0, 200)
};
for (const [n, b] of Object.entries(files)) writeFileSync(`${dir}/${n}`, b);
writeFileSync(`${dir}/Pack Techno.zip`, writeZip([{ path: 'Basses/Sub Deep 01.syx', bytes: syx(initPayload('SUB DEEP 01', { 32: 0, 35: 61, 36: 0, 64: 60 })) }, { path: 'Leads/Neon Lead.syx', bytes: syx(initPayload('Neon Lead', { 32: 0, 33: 30 })) }, { path: 'docs/readme.txt', bytes: new TextEncoder().encode('x') }]));
writeFileSync(`${dir}/bank64.syx`, bank(Array.from({ length: 64 }, (_, i) => initPayload(['Bass', 'Pad', 'Arp', 'FX'][i % 4] + ' B' + i, { 64: i * 2 }))));
writeFileSync(`${dir}/v5_backup.json`, JSON.stringify({ format: 'ct-patch-library-v1', version: 2, patches: [{ id: 'x1', name: 'Old Reese', category: 'Bass', character: 'Dark', raw: b64(initPayload('Old Reese', { 55: 100, 52: 70 })), fav: true, rating: 4, listened: true, fileName: 'old reese.syx' }], packs: [{ id: 'k', name: 'Viejo', slots: ['x1'] }] }));
console.log(Object.keys(files).length + 3, 'fixtures');
