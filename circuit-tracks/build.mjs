// Empaqueta los módulos ES en un único HTML autónomo (sin dependencias externas obligatorias).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const order = ['core/params.js', 'core/sysex.js', 'core/patch.js', 'core/acoustic.js', 'core/classify.js', 'core/compare.js', 'core/families.js', 'core/macros.js', 'core/zip.js', 'core/midi.js', 'core/library.js', 'core/analysis.js', 'core/packbuilder.js', 'core/anatomy.js', 'core/organize.js', 'core/templates.js', 'core/patterns.js', 'core/song.js', 'core/mapsel.js', 'core/lab.js', 'ui/app.js', 'ui/song_ui.js', 'ui/public.js', 'ui/mapsel_ui.js', 'ui/lab_ui.js', 'ui/quick_ui.js', 'ui/listen_ui.js'];
const names = new Map();
let js = order.map((f) => {
  let src = readFileSync('src/' + f, 'utf8');
  if (src.split('\n').some((l) => l.startsWith('import') && !l.trim().endsWith(';'))) throw new Error('import multilínea en ' + f);
  src = src.replace(/^import\s.*?;\s*$/gm, '').replace(/^export\s+(?=(const|let|function|class|async)\b)/gm, '');
  if (/^export\s/m.test(src)) throw new Error('export no soportado en ' + f);
  for (const m of src.matchAll(/^(?:const|let|function|class|async function)\s+([A-Za-z_$][\w$]*)/gm)) { if (names.has(m[1])) throw new Error(`Nombre duplicado ${m[1]} en ${f} y ${names.get(m[1])}`); names.set(m[1], f); }
  return `// ---- ${f} ----\n${src}`;
}).join('\n');
const site = JSON.parse(readFileSync('src/site.json', 'utf8'));
// v3.7: lo publicado no lleva comentarios de CSS (notas internas de diseño)
const css = (readFileSync('src/ui/fonts.css', 'utf8') + '\n' + readFileSync('src/ui/styles.css', 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n{3,}/g, '\n\n');
// ---------- v3.7: autoría, huella y marca invisible (como en la herramienta de la Rhythm) ----------
// Huella = SHA-256 del código y del CSS (igual en ES y EN). Marca = caracteres de ancho cero (U+200B = 0, U+200C = 1,
// entre U+2060) con «CT1|huella|autor|herramienta»; tools/marca.mjs, en la raíz del repositorio, la lee y la comprueba.
const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version;
const appV = (readFileSync('src/core/library.js', 'utf8').match(/APP_VERSION = '([^']+)'/) || [])[1];
if (appV !== VERSION) throw new Error(`APP_VERSION (${appV}) no coincide con package.json (${VERSION})`);
const FP = createHash('sha256').update(js).update(css).digest('hex').slice(0, 16);
const ORIGIN = { tool: 'Circuit Tracks · Patch Library / Editor', version: VERSION, author: site.author || '', year: 2026, url: site.kofiUrl || site.siteUrl || '', license: site.license || '', fp: FP };
const zw = (txt) => '\u2060' + [...Buffer.from(txt, 'utf8')].map((b) => b.toString(2).padStart(8, '0')).join('').replace(/0/g, '\u200b').replace(/1/g, '\u200c') + '\u2060';
const WM = zw(`CT1|${FP}|${ORIGIN.author}|${ORIGIN.tool}`);
const HEAD = `<!-- ${ORIGIN.tool} ${VERSION} · © ${ORIGIN.year} ${ORIGIN.author} · ${ORIGIN.license} · ${ORIGIN.url} · fingerprint ${FP} -->`;
js = `(() => {\n'use strict';\nconst __SITE__ = ${JSON.stringify(site)};\nconst __ORIGIN__ = ${JSON.stringify(ORIGIN)};\nconst __WM__ = ${JSON.stringify(WM)};\n${js}\n})();`;
const html = readFileSync('src/ui/index.template.html', 'utf8').replace('<!DOCTYPE html>', '<!DOCTYPE html>\n' + HEAD).replace('/*CSS*/', () => css).replace('/*JS*/', () => js.replace(/<\/script/gi, '<\\/script'));
mkdirSync('dist', { recursive: true });
writeFileSync('dist/Circuit_Tracks_Patch_Library_Editor.html', html);
console.log('dist/Circuit_Tracks_Patch_Library_Editor.html', (html.length / 1024).toFixed(0) + ' KB', names.size + ' símbolos', 'huella ' + FP);
