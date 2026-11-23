// core/organize.js — «Ordenar en disco»: plan de copia ordenada de tu colección (los originales no se tocan)
import { safeName } from './pack.js';
import { LOOP_HOME, loopPlace, keepsBothKinds } from './place.js';
import { defaultSubLabel } from './taxonomy.js';
import { sliceName } from './slices.js';

// v2.6: nombres coherentes con las categorías (en plural) y con las subcarpetas de los loops
export const CAT_FOLDER = { kick: 'Kicks', snare: 'Snares', clap: 'Claps', hat: 'Closed-Hats', ohat: 'Open-Hats', cymbal: 'Cymbals', tom: 'Toms', perc: 'Perc',
  bass: 'Bass', synth: 'Synth', atmos: 'Atmos', fx: 'FX', vox: 'Vox', dloop: 'Drum Loops', mloop: 'Melodic Loops' };
export const ORDER = Object.keys(CAT_FOLDER);
export const catFolderName = (cat, number = true) => (number ? String(ORDER.indexOf(cat) + 1).padStart(2, '0') + ' ' : '') + CAT_FOLDER[cat];
export const KIND_DIR = { loop: 'Loops', oneshot: 'One-shots' };

// samples: [{id, name, path, ext, cat, cert, discard, sub (nombre de la subcarpeta), kind ('loop'|'oneshot'), tags, rating, fav, split}]
// v1.7: `kinds` separa Loops y One-shots dentro de cada categoría; `tagsInName` añade tus etiquetas al nombre
// del archivo: «Nombre [Oscuro, Analógico].wav».
// v2.9: un sample, un sitio (core/place.js). Los loops de batería van a Drum Loops y los de bajo, synth y
// atmos a Melodic Loops, en la carpeta de lo que suena; así las carpetas de instrumento solo tienen
// one-shots y no necesitan «One-shots» dentro. Loops y One-shots solo se separan donde conviven: FX y Vox.
// `format`: 'asis' (el archivo tal cual), 'cuts' (como el original, con tus cortes) o 'rhythm' (48 kHz mono).
// Con 'cuts' o 'rhythm', `slices` > 1 parte cada loop en una carpeta «Nombre (8 slices)/Nombre 01.wav…» y
// los loops separados en partes (v2.7) salen solo como sus partes (`skipSplit`).
export function organizePlan(samples, { by = 'category', subs = true, kinds = false, tagsInName = false, converted = false, format = null, slices = 1, skipSplit = true, includeDiscarded = false, minCert = 'any', number = true, reviewDir = '_Por revisar', kindDir = KIND_DIR } = {}) {
  const fmt = format || (converted ? 'rhythm' : 'asis');
  const rank = { user: 4, confirmed: 3, onehint: 2, sound: 2, doubt: 0, none: -1 };
  const need = { user: 4, confirmed: 3, onehint: 2, any: -1 }[minCert] ?? -1;
  const used = new Set(), items = [], skipped = { discard: 0, uncertain: 0, split: 0 };
  const oi = (c) => { const i = ORDER.indexOf(c); return i < 0 ? 99 : i; };
  const sorted = samples.slice().sort((a, b) => (oi(a.cat) - oi(b.cat)) || a.path.localeCompare(b.path, undefined, { numeric: true }));
  const counters = {};
  const nSl = [2, 4, 8, 16].includes(slices) && fmt !== 'asis' ? slices : 1;
  const free = (dir, base, ext) => { let name = `${base}.${ext}`, k = 2; while (used.has((dir + '/' + name).toLowerCase())) name = `${base} (${k++}).${ext}`; used.add((dir + '/' + name).toLowerCase()); return name; };
  for (const s of sorted) {
    if (s.discard && !includeDiscarded) { skipped.discard++; continue; }
    if (s.split && skipSplit && fmt !== 'asis') { skipped.split++; continue; }
    let cat = s.cat, sub = s.sub;
    // por si llega sin colocar: un instrumento en bucle va a su familia de loops
    if (s.kind === 'loop' && LOOP_HOME[cat]) { const p = loopPlace(cat); cat = p.cat; sub = defaultSubLabel(p.cat, p.sub); }
    let dir;
    if (by === 'category') {
      const ok = cat && (rank[s.cert] ?? -1) >= need;
      if (!ok) skipped.uncertain++;
      dir = ok ? (number ? String(ORDER.indexOf(cat) + 1).padStart(2, '0') + ' ' : '') + CAT_FOLDER[cat] : reviewDir;
      if (ok && kinds && s.kind && keepsBothKinds(cat)) dir += '/' + kindDir[s.kind];
      if (ok && subs && sub) dir += '/' + safeName(sub, 32);
    } else dir = String(s.path).split('/').slice(0, -1).join('/') || '_';
    const ext = fmt === 'asis' ? (s.ext || 'wav') : 'wav';
    let base = safeName(s.name, 60);
    if (tagsInName && s.tags && s.tags.length) base = safeName(`${base} [${s.tags.join(', ')}]`, 110);
    const row = { id: s.id, src: s.path, cat: cat || '', sub: sub || '', kind: s.kind || '', tags: s.tags || [], rating: s.rating || 0, fav: !!s.fav };
    if (nSl > 1 && s.kind === 'loop') {
      const folder = free(dir, `${base} (${nSl} slices)`, 'd').replace(/\.d$/, '');
      for (let i = 0; i < nSl; i++) items.push({ ...row, dest: `${dir}/${folder}/${sliceName(base, i, nSl)}.wav`, slice: { i, n: nSl } });
      counters[dir + '/' + folder] = nSl;
      continue;
    }
    counters[dir] = (counters[dir] || 0) + 1;
    items.push({ ...row, dest: dir + '/' + free(dir, base, ext) });
  }
  return { items, folders: counters, skipped, format: fmt };
}
// v1.7: el manifiesto lleva todo lo que has marcado, para poder filtrar tu colección en una hoja de cálculo.
export function manifestCSV(plan, root) {
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  return ['source,destination,category,subfolder,type,tags,rating,favourite',
    ...plan.items.map((i) => [q(i.src), q(root + '/' + i.dest), q(i.cat), q(i.sub), q(i.kind), q((i.tags || []).join('; ')), i.rating || '', i.fav ? 'yes' : ''].join(','))].join('\n');
}
