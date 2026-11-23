// node tools/build.mjs — genera dist/Circuit_Rhythm_Sample_Library.html (ES) y _EN.html (EN)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(root, p), 'utf8');
const ORDER = [
  'src/core/wav.js', 'src/core/loud.js', 'src/core/dsp.js', 'src/core/shorten.js', 'src/core/analyze.js', 'src/core/classify.js', 'src/core/zip.js', 'src/core/pack.js', 'src/core/slices.js', 'src/core/tune.js', 'src/core/hits.js',
  'src/core/patterns.js', 'src/core/song.js', 'src/core/map.js', 'src/core/place.js', 'src/core/organize.js', 'src/core/taxonomy.js',
  'src/core/library.js', 'src/core/midi.js', 'src/ui/i18n.js', 'src/ui/audio.js', 'src/ui/app_data.js', 'src/ui/app_views.js', 'src/ui/app_events.js', 'src/ui/app_ext.js', 'src/ui/app_song.js', 'src/ui/app_org.js', 'src/ui/app_kind.js', 'src/ui/app_mapsel.js', 'src/ui/app_coll.js', 'src/ui/app_sound.js', 'src/ui/app_tagclip.js', 'src/ui/app_short.js', 'src/ui/app_parts.js', 'src/ui/app_mono.js', 'src/ui/app_trash.js', 'src/ui/app_dock.js', 'src/ui/app_public.js',
];

function strip(code, file) {
  const out = code
    .replace(/^import\s[^;]*;\s*$/gm, '')
    .replace(/^export\s+(?=(async\s+)?function|const|let|class)/gm, '');
  if (/^\s*(import|export)\s/m.test(out)) throw new Error('import/export sin quitar en ' + file);
  return `// ---- ${file} ----\n${out}`;
}
// plantilla de proyecto vacío (CircuitGM, MPL-2.0) como deflate-raw base64
const NCS_TPL = deflateRawSync(readFileSync(join(root, 'third_party/circuitgm/RhythmEmpty.ncs')), { level: 9 }).toString('base64');
const js = ORDER.map((f) => strip(rd(f), f)).join('\n');
// comprobación de sintaxis
new Function(js);

// ---------- textos ----------
const STR_RX = /\bt\('((?:[^'\\]|\\.)*)'/g;
const strings = new Set();
for (const m of js.matchAll(STR_RX)) strings.add(m[1].replace(/\\'/g, "'"));
const enPath = join(root, 'tools/i18n/en.json');
const en = existsSync(enPath) ? JSON.parse(readFileSync(enPath, 'utf8')) : {};
const missing = [...strings].filter((s) => !(s in en));
const unused = Object.keys(en).filter((k) => !strings.has(k) && !js.includes("'" + k + "'"));
// las palabras que el código compara deben traducirse siempre
if (en['BORRAR'] !== 'DELETE') missing.push('BORRAR (debe ser DELETE)');

// ---------- fuentes (subconjunto latino, WOFF incrustado) ----------
// Las fuentes ya recortadas van en el repositorio (assets/fonts), así el build no depende de
// tener github.com/google/fonts a mano. Solo si falta alguna se regenera desde GF_OFL.
const fontsDir = join(root, 'assets/fonts');
mkdirSync(fontsDir, { recursive: true });
const gf = process.env.GF_OFL || 'google-fonts/ofl'; // carpeta ofl/ de github.com/google/fonts (solo si falta alguna fuente)
const UNI = 'U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2010-2027,U+2030-203A,U+2190-2193,U+2212,U+2260,U+25A0,U+25B2,U+25B6,U+25BC,U+25CF,U+2605,U+2665,U+2713,U+2715,U+20AC';
function font(name, src, out, axes) {
  const dst = join(fontsDir, out);
  if (!existsSync(dst)) {
    let input = src;
    if (axes) {
      input = join(fontsDir, out + '.inst.ttf');
      execFileSync('python3', ['-m', 'fontTools.varLib.instancer', src, ...axes, '-o', input], { stdio: 'ignore' });
    }
    execFileSync('python3', ['-m', 'fontTools.subset', input, `--unicodes=${UNI}`, '--flavor=woff', '--layout-features=kern,liga,tnum', `--output-file=${dst}`], { stdio: 'ignore' });
  }
  return dst;
}
const faces = [];
function face(family, file, weight) {
  if (!existsSync(file)) return;
  faces.push(`@font-face{font-family:'${family}';src:url(data:font/woff;base64,${readFileSync(file).toString('base64')}) format('woff');font-weight:${weight};font-style:normal;font-display:swap}`);
}
try {
  face('ArchivoX', font('ArchivoX', `${gf}/archivo/Archivo[wdth,wght].ttf`, 'ArchivoX-800.woff', ['wdth=125', 'wght=800']), 800);
  face('ArchivoX', font('ArchivoX', `${gf}/archivo/Archivo[wdth,wght].ttf`, 'ArchivoX-700.woff', ['wdth=125', 'wght=700']), 700);
  face('ArchivoX', font('ArchivoX', `${gf}/archivo/Archivo[wdth,wght].ttf`, 'ArchivoX-300.woff', ['wdth=125', 'wght=300']), 300);
  for (const [w, f] of [[400, 'Regular'], [500, 'Medium'], [600, 'SemiBold']]) face('BarlowC', font('BarlowC', `${gf}/barlowcondensed/BarlowCondensed-${f}.ttf`, `BarlowC-${w}.woff`), w);
  face('JBMono', font('JBMono', `${gf}/jetbrainsmono/JetBrainsMono[wght].ttf`, 'JBMono-400.woff', ['wght=400']), 400);
} catch (e) { console.warn('Fuentes no incrustadas:', e.message); }

const tpl = rd('src/ui/index.html');
const site = JSON.parse(rd('src/site.json'));
// icono propio (8 pads con el degradado de la Rhythm), nada del logotipo de Novation
const ICON = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#121214'/>${['#5b25a6', '#5b4bc4', '#5b6fd8', '#4f8fe4', '#4aa3e8', '#40c2e8', '#38dbe6', '#34f0e6'].map((c, i) => `<rect x='${8 + (i % 4) * 12.5}' y='${18 + Math.floor(i / 4) * 16}' width='10' height='12' rx='2.5' fill='${c}'/>`).join('')}</svg>`);
const DESC = { es: 'Herramienta gratuita para Circuit Rhythm: mide y clasifica tus samples, monta packs de 128 y llévalos al equipo. Todo en tu navegador.', en: 'Free tool for Circuit Rhythm: measure and sort your samples, build 128-slot packs and load them onto your unit. All in your browser.' };
// v2.2: lo publicado no lleva comentarios de CSS (notas internas de diseño)
const css = rd('src/ui/styles.css').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n{3,}/g, '\n\n');
mkdirSync(join(root, 'dist'), { recursive: true });

// ---------- v2.2: autoría, huella y marca invisible ----------
// La huella es el SHA-256 del código y del CSS de esta versión (igual en ES y EN). La marca son caracteres de ancho
// cero (U+200B = 0, U+200C = 1, entre U+2060) con «CT1|huella|autor|herramienta»: no se ven y viajan con el HTML.
// tools/marca.mjs (en la raíz del repositorio) la lee y la comprueba.
const VERSION = JSON.parse(rd('package.json')).version;
const appV = (rd('src/ui/app_data.js').match(/APP_VERSION = '([^']+)'/) || [])[1];
if (appV !== VERSION) throw new Error(`APP_VERSION (${appV}) no coincide con package.json (${VERSION})`);
const FP = createHash('sha256').update(js).update(css).digest('hex').slice(0, 16);
const ORIGIN = { tool: 'Circuit Rhythm · Sample Library', version: VERSION, author: site.author || '', year: 2026, url: site.kofiUrl || site.siteUrl || '', license: site.license || '', fp: FP };
const zw = (txt) => '\u2060' + [...Buffer.from(txt, 'utf8')].map((b) => b.toString(2).padStart(8, '0')).join('').replace(/0/g, '\u200b').replace(/1/g, '\u200c') + '\u2060';
const WM = zw(`CT1|${FP}|${ORIGIN.author}|${ORIGIN.tool}`);
const HEAD = `<!-- ${ORIGIN.tool} ${VERSION} · © ${ORIGIN.year} ${ORIGIN.author} · ${ORIGIN.license} · ${ORIGIN.url} · fingerprint ${FP} -->`.replace(/--(?!>)/g, '—').replace('<!—', '<!--');
function emit(lang, file) {
  const pre = `const __LANG__ = ${JSON.stringify(lang)};\nconst __DICT__ = ${lang === 'es' ? '{}' : JSON.stringify(en)};\nconst __SITE__ = ${JSON.stringify(site)};\nconst __NCS_TPL__ = ${JSON.stringify(NCS_TPL)};\nconst __ORIGIN__ = ${JSON.stringify(ORIGIN)};\nconst __WM__ = ${JSON.stringify(WM)};\n`;
  const html = tpl.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n' + HEAD).replace('{{WM}}', WM).replace('{{LANG}}', lang).replaceAll('{{DESC}}', DESC[lang]).replace('{{ICON}}', ICON).replace('{{OGURL}}', site.siteUrl ? `<meta property="og:url" content="${site.siteUrl}">\n` : '').replace('{{FONTS}}', () => faces.join('\n')).replace('{{CSS}}', () => css)
    .replace('{{JS}}', () => `(function(){'use strict';\n${pre}${js}\n})();`);
  writeFileSync(join(root, 'dist', file), html);
  return html.length;
}
const a = emit('es', 'Circuit_Rhythm_Sample_Library.html');
const b = emit('en', 'Circuit_Rhythm_Sample_Library_EN.html');
console.log(`ES ${(a / 1024).toFixed(0)} KB · EN ${(b / 1024).toFixed(0)} KB · ${strings.size} textos · ${faces.length} fuentes · huella ${FP}`);
if (missing.length) { console.log(`Sin traducir (${missing.length}):`); mkdirSync(join(root, 'build'), { recursive: true }); writeFileSync(join(root, 'build/missing_en.json'), JSON.stringify(Object.fromEntries(missing.map((s) => [s, ''])), null, 1)); console.log(missing.slice(0, 15).join('\n')); }
if (unused.length) console.log(`Sobran en en.json: ${unused.length}`);
if (process.argv.includes('--strict') && missing.length) process.exit(1);
