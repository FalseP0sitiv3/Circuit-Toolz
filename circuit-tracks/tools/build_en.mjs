// Genera la versión en inglés a partir del HTML en español: traduce solo el texto de los literales (nunca el código).
import fs from 'fs'; import { walkLiterals, mapText } from './jswalk.mjs';
const D = JSON.parse(fs.readFileSync(new URL('./i18n/en.json', import.meta.url), 'utf8'));
const src = process.argv[2] || 'dist/Circuit_Tracks_Patch_Library_Editor.html', dst = process.argv[3] || 'dist/Circuit_Tracks_Patch_Library_Editor_EN.html';
let html = fs.readFileSync(src, 'utf8');
const a = html.lastIndexOf('<script>') + 8, b = html.lastIndexOf('</script>');
let js = html.slice(a, b), miss = new Set();
const esc = (x, q) => q === '`' ? x.replace(/\\(?![rn])/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') : x.replace(new RegExp(q, 'g'), '\\' + q);
// Literales de una o dos letras en minúscula entre comillas son código ('a' de createElement, claves de clase…), nunca texto.
js = walkLiterals(js, (t, k, q) => (k === 'str' && /^[a-z]{1,2}$/.test(t)) ? t : mapText(t, (core) => { if (core in D) return D[core] === core ? null : esc(D[core], q); if (/[áéíóúñ¿¡]/i.test(core)) miss.add(core); return null; }));
js = js.replace(/mensaje \\d\+/g, 'message \\d+');
html = html.slice(0, a) + js + html.slice(b);
html = html.replace('<html lang="es">', '<html lang="en">').replaceAll('Herramienta gratuita y local para la Novation Circuit Tracks: biblioteca de patches, escucha y medición en el equipo, editor de macros, packs, patrones y canciones completas. Todo se queda en tu navegador.', 'Free, local tool for the Novation Circuit Tracks: patch library, listening and measuring on the device, macro editor, packs, patterns and full songs. Everything stays in your browser.').replace('Cargando biblioteca…', 'Loading library…').replace('Esta herramienta necesita JavaScript.', 'This tool needs JavaScript.');
fs.writeFileSync(dst, html);
console.log(dst, (html.length / 1024 | 0) + ' KB', '· sin traducir:', miss.size);
if (miss.size) console.log([...miss].slice(0, 40).join('\n'));
