// Constructor automático de Packs de 128 patches.
// Circuit Tracks muestra los patches en Patch View como 4 páginas de 32 (rejilla 8×4):
// cada página se dedica a un grupo de categorías para encontrar los sonidos tocando.
export const DEFAULT_LAYOUT = [
  { label: 'Bajos', cats: ['bass'] },
  { label: 'Leads · plucks · arps', cats: ['lead', 'pluck', 'arp', 'sequence', 'stab'] },
  { label: 'Pads · keys · acordes', cats: ['pad', 'keys', 'chords', 'strings', 'brass', 'bell'] },
  { label: 'FX · drones · perc', cats: ['fx', 'drone', 'transition', 'perc'] }
];
const RANK = { manual: 5, corroborated: 4, textual: 3, technical: 2, ambiguous: 0, none: 0 };

// candidates: patches; lib: Library. opts: { layout, allowProposals, minCertainty, excludeDiscarded, onePerFamily, fillGaps }
export function buildPack(candidates, lib, opts = {}) {
  const o = { layout: DEFAULT_LAYOUT, allowProposals: true, minCertainty: 'textual', excludeDiscarded: true, onePerFamily: true, fillGaps: false, ...opts };
  const excluded = { discarded: 0, family: 0, uncategorized: 0, lowCertainty: 0, overflow: 0 };
  const score = (p) => (p.meta.fav ? 100 : 0) + (p.meta.rating || 0) * 10 + (['listened', 'keep'].includes(p.meta.review) ? 6 : 0) + (p.acoustic ? 2 : 0) + (p.kind === 'variant' ? 1 : 0);
  // 1) Filtrado y un representante por familia (el mejor valorado).
  let list = candidates.filter((p) => {
    if (o.excludeDiscarded && p.meta.review === 'discard') { excluded.discarded++; return false; }
    const st = lib.changeState ? lib.changeState(p) : 'original';
    if (st === 'superseded' || st === 'draft') { excluded.changes = (excluded.changes || 0) + 1; return false; } // va la variante aceptada, no el original ni los borradores
    return true;
  });
  if (o.onePerFamily) {
    const { of } = lib.families(), best = new Map();
    for (const p of list) { const f = of.get(p.id); const key = f ? f.id : p.id; const cur = best.get(key); if (!cur || score(p) > score(cur)) best.set(key, p); }
    excluded.family = list.length - best.size; list = [...best.values()];
  }
  // 2) Categoría efectiva.
  const withCat = [];
  for (const p of list) {
    let cat = p.meta.category, sub = p.meta.subtype, cert = 'manual';
    if (!cat && o.allowProposals) { const c = lib.info(p).cls; if (c.category && RANK[c.certainty] >= RANK[o.minCertainty]) { cat = c.category; sub = c.subtype; cert = c.certainty; } else if (c.category) excluded.lowCertainty++; }
    if (!cat) { excluded.uncategorized++; continue; }
    withCat.push({ p, cat, sub, cert, s: score(p) });
  }
  // 3) Reparto por páginas de 32, ordenado por subtipo y valoración.
  const slots = new Array(128).fill(null), pages = [], blocks = [], used = new Set();
  o.layout.forEach((pg, i) => {
    const pool = withCat.filter((x) => pg.cats.includes(x.cat) && !used.has(x.p.id)).sort((a, b) => pg.cats.indexOf(a.cat) - pg.cats.indexOf(b.cat) || String(a.sub || '').localeCompare(String(b.sub || '')) || b.s - a.s || RANK[b.cert] - RANK[a.cert] || a.p.name.localeCompare(b.p.name));
    const take = pool.slice(0, 32);
    take.forEach((x, j) => { slots[i * 32 + j] = x.p.id; used.add(x.p.id); });
    excluded.overflow += pool.length - take.length;
    pages.push({ label: pg.label, placed: take.length, available: pool.length, fromProposals: take.filter((x) => x.cert !== 'manual').length });
    blocks.push({ from: i * 32, to: i * 32 + 31, label: pg.label, category: pg.cats[0], cats: [...pg.cats] });
  });
  // 4) Relleno opcional de huecos con lo que sobró (de cualquier categoría).
  if (o.fillGaps) { const rest = withCat.filter((x) => !used.has(x.p.id)).sort((a, b) => b.s - a.s); for (let i = 0; i < 128 && rest.length; i++) if (!slots[i]) { const x = rest.shift(); slots[i] = x.p.id; used.add(x.p.id); excluded.overflow--; } }
  return { slots, blocks, pages, excluded, placed: used.size };
}
