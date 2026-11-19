// core/organize.js — «Ordenar en disco»: plan de copia ordenada de tu colección (los originales no se tocan)
import { safeName } from './pack.js';

const FOLDER = { kick: 'Kicks', snare: 'Snares', clap: 'Claps', hat: 'Hats Closed', ohat: 'Hats Open', cymbal: 'Cymbals', tom: 'Toms', perc: 'Perc',
  bass: 'Bass', synth: 'Synth', atmos: 'Atmos', fx: 'FX', vox: 'Vox', dloop: 'Loops Drum', mloop: 'Loops Melodic' };
export const ORDER = Object.keys(FOLDER);
const ORG_LOOP_CATS = new Set(['dloop', 'mloop']);
export const KIND_DIR = { loop: 'Loops', oneshot: 'One-shots' };

// samples: [{id, name, path, ext, cat, cert, discard, sub (nombre de la subcarpeta), kind ('loop'|'oneshot'), tags, rating, fav}]
// v1.7: `kinds` separa Loops y One-shots dentro de cada categoría (salvo en las de loops, que ya lo son);
// `tagsInName` añade tus etiquetas al nombre del archivo: «Nombre [Oscuro, Analógico].wav».
export function organizePlan(samples, { by = 'category', subs = true, kinds = false, tagsInName = false, converted = false, includeDiscarded = false, minCert = 'any', number = true, reviewDir = '_Por revisar', kindDir = KIND_DIR } = {}) {
  const rank = { user: 4, confirmed: 3, onehint: 2, sound: 2, doubt: 0, none: -1 };
  const need = { user: 4, confirmed: 3, onehint: 2, any: -1 }[minCert] ?? -1;
  const used = new Set(), items = [], skipped = { discard: 0, uncertain: 0 };
  const oi = (c) => { const i = ORDER.indexOf(c); return i < 0 ? 99 : i; };
  const sorted = samples.slice().sort((a, b) => (oi(a.cat) - oi(b.cat)) || a.path.localeCompare(b.path, undefined, { numeric: true }));
  const counters = {};
  for (const s of sorted) {
    if (s.discard && !includeDiscarded) { skipped.discard++; continue; }
    let dir;
    if (by === 'category') {
      const ok = s.cat && (rank[s.cert] ?? -1) >= need;
      if (!ok) skipped.uncertain++;
      dir = ok ? (number ? String(ORDER.indexOf(s.cat) + 1).padStart(2, '0') + ' ' : '') + FOLDER[s.cat] : reviewDir;
      if (ok && kinds && s.kind && !ORG_LOOP_CATS.has(s.cat)) dir += '/' + kindDir[s.kind];
      if (ok && subs && s.sub) dir += '/' + safeName(s.sub, 32);
    } else dir = String(s.path).split('/').slice(0, -1).join('/') || '_';
    const ext = converted ? 'wav' : (s.ext || 'wav');
    let base = safeName(s.name, 60);
    if (tagsInName && s.tags && s.tags.length) base = safeName(`${base} [${s.tags.join(', ')}]`, 110);
    let name = `${base}.${ext}`, k = 2;
    while (used.has((dir + '/' + name).toLowerCase())) name = `${base} (${k++}).${ext}`;
    used.add((dir + '/' + name).toLowerCase());
    counters[dir] = (counters[dir] || 0) + 1;
    items.push({ id: s.id, dest: dir + '/' + name, src: s.path, cat: s.cat || '', sub: s.sub || '', kind: s.kind || '', tags: s.tags || [], rating: s.rating || 0, fav: !!s.fav });
  }
  return { items, folders: counters, skipped };
}
// v1.7: el manifiesto lleva todo lo que has marcado, para poder filtrar tu colección en una hoja de cálculo.
export function manifestCSV(plan, root) {
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  return ['source,destination,category,subfolder,type,tags,rating,favourite',
    ...plan.items.map((i) => [q(i.src), q(root + '/' + i.dest), q(i.cat), q(i.sub), q(i.kind), q((i.tags || []).join('; ')), i.rating || '', i.fav ? 'yes' : ''].join(','))].join('\n');
}
