import fs from 'fs'; import { walkLiterals, mapText } from './jswalk.mjs';
const files = process.argv.slice(2), seen = new Map();
const spanish = (s) => /[áéíóúñ¿¡ÁÉÍÓÚÑ]/.test(s) || (/[A-Za-z]{2,}/.test(s) && (/\s/.test(s.trim()) || /^[A-ZÁÉÍÓÚ][a-záéíóúñ]+/.test(s)));
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  walkLiterals(src, (t, k) => { mapText(t, (core) => { if (spanish(core) && !/^[\w.-]+\.(js|css|syx|mid|json|zip)$/.test(core)) seen.set(core, (seen.get(core) || 0) + 1); return null; }); return t; });
}
const arr = [...seen.keys()];
fs.writeFileSync('/tmp/units.json', JSON.stringify(arr, null, 0));
console.log(arr.length, 'unidades,', arr.join('').length, 'caracteres');
