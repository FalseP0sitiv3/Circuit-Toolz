#!/usr/bin/env node
// Lee la marca de autoría de un HTML de Circuit Tools (aunque lo hayan copiado o renombrado).
// Uso: node tools/marca.mjs archivo.html [otro.html …]
//
// Cada herramienta lleva tres señales de origen:
//  1. un comentario en la primera línea: herramienta, versión, © autor, licencia, enlace y huella;
//  2. la constante __ORIGIN__ en el código (la muestra «Acerca de» y la consola);
//  3. una marca invisible: caracteres de ancho cero (U+200B = 0, U+200C = 1, entre U+2060) dentro del título y del pie,
//     con «CT1|huella|autor|herramienta». No se ve en pantalla, sobrevive a copiar y pegar el HTML y a cambiarle
//     el nombre al archivo, y si alguien borra el comentario y el aviso, sigue ahí.
// La huella es el SHA-256 (16 primeras cifras) del código y el CSS de esa versión: la publicas junto a cada versión
// (SHA256SUMS.txt de tools/publicar.mjs) y te sirve para demostrar qué es tuyo y desde cuándo.
import { readFileSync } from 'node:fs';

export function readMarks(html) {
  const out = { marks: [], head: null, origin: null };
  // 3. marcas de ancho cero (con o sin los delimitadores)
  const runs = html.match(/⁠?[​‌]{16,}⁠?/g) || [];
  for (const r of runs) {
    const bits = r.replace(/⁠/g, '').replace(/​/g, '0').replace(/‌/g, '1');
    const bytes = []; for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
    const txt = Buffer.from(bytes).toString('utf8');
    if (txt.startsWith('CT1|')) { const [, fp, author, tool] = txt.split('|'); out.marks.push({ fp, author, tool }); }
  }
  // 1. comentario de cabecera
  const h = html.match(/<!--\s*(.*?)\s*·\s*©\s*(\d{4})\s+(.*?)\s*·\s*(.*?)\s*·\s*(.*?)\s*·\s*fingerprint\s+([0-9a-f]{16})\s*-->/);
  if (h) out.head = { tool: h[1], year: h[2], author: h[3], license: h[4], url: h[5], fp: h[6] };
  // 2. __ORIGIN__ en el código
  const o = html.match(/const __ORIGIN__ = (\{[^\n]*?\});/);
  if (o) { try { out.origin = JSON.parse(o[1]); } catch { /* manipulado */ } }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2);
  if (!files.length) { console.log('Uso: node tools/marca.mjs archivo.html [otro.html …]'); process.exit(2); }
  let bad = 0;
  for (const f of files) {
    const r = readMarks(readFileSync(f, 'utf8'));
    const fps = new Set([...r.marks.map((m) => m.fp), r.head?.fp, r.origin?.fp].filter(Boolean));
    console.log(`\n${f}`);
    if (r.marks.length) console.log(`  marca invisible: ${r.marks.length}× · ${r.marks[0].tool} · autor ${r.marks[0].author} · huella ${r.marks[0].fp}`);
    else console.log('  marca invisible: no encontrada');
    console.log(`  cabecera: ${r.head ? `${r.head.tool} · © ${r.head.year} ${r.head.author} · ${r.head.license} · huella ${r.head.fp}` : 'no encontrada (¿la han borrado?)'}`);
    const oOK = r.origin && r.origin.fp && r.origin.author;
    console.log(`  __ORIGIN__: ${oOK ? `${r.origin.tool} ${r.origin.version} · © ${r.origin.year} ${r.origin.author} · huella ${r.origin.fp}` : r.origin ? 'manipulado' : 'no encontrado'}`);
    const author = r.marks[0]?.author || r.head?.author || r.origin?.author;
    if (!r.marks.length && !r.head && !oOK) { console.log('  → sin señales de Circuit Tools'); bad++; }
    else if (fps.size > 1) { console.log(`  → las huellas no coinciden (${[...fps].join(' / ')}): el archivo se ha modificado`); bad++; }
    else if (!r.head || !oOK || (r.head && r.head.author !== author) || (oOK && r.origin.author !== author)) console.log(`  → COPIA MODIFICADA de Circuit Tools: el original es de ${author} (huella ${[...fps][0]}), pero han borrado o cambiado el aviso de autoría`);
    else console.log(`  → origen: Circuit Tools · © ${author} · huella ${[...fps][0]}`);
  }
  process.exit(bad ? 1 : 0);
}
