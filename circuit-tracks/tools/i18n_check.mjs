// Lista los textos en español que aún no tienen traducción en tools/i18n/en.json.
import fs from 'fs'; import { walkLiterals, mapText, junk } from './jswalk.mjs';
const D = JSON.parse(fs.readFileSync(new URL('./i18n/en.json', import.meta.url), 'utf8')), miss = new Set();
const sp = (s) => /[áéíóúñ¿¡ÁÉÍÓÚÑ]/.test(s) || (/[A-Za-z]{2,}/.test(s) && (/\s/.test(s) || /^[A-ZÁÉÍÓÚ][a-záéíóúñ]+/.test(s)));
for (const f of ['src/ui/app.js', 'src/ui/song_ui.js', 'src/ui/public.js', 'src/ui/mapsel_ui.js', 'src/ui/lab_ui.js', 'src/ui/quick_ui.js', 'src/ui/listen_ui.js', ...fs.readdirSync('src/core').map((x) => 'src/core/' + x)]) walkLiterals(fs.readFileSync(f, 'utf8'), (t) => { mapText(t, (c) => { if (!(c in D) && sp(c) && !junk(c)) miss.add(c); return null; }); return t; });
console.log(miss.size ? `Sin traducir (${miss.size}):\n` + [...miss].join('\n') : 'Traducción completa');
process.exitCode = miss.size ? 1 : 0;
