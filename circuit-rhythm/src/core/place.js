// core/place.js — v2.9: un sample, un sitio. Lo que suena y el tipo (loop / one-shot) deciden la carpeta.
// Un loop de hats es siempre «Drum loop › Closed-Hats», se marque como se marque: con la tecla H, con D y la
// subcarpeta, o con W sobre un Closed hat. Un loop de bajo, «Melodic loop › Bass». Así no hay dos caminos
// para lo mismo, y lo que eliges con una tecla acaba en la misma carpeta que lo que eliges con dos.
//
//   one-shot            → la carpeta del instrumento (04 Closed-Hats / su carácter)
//   loop de batería     → 14 Drum Loops / el instrumento (o Full, Breaks, Tops si suenan varios)
//   loop de bajo, synth
//   o atmos             → 15 Melodic Loops / el instrumento
//   FX y Vox            → su carpeta, con Loops y One-shots dentro (no tienen familia de loops)

export const LOOP_FAMILIES = new Set(['dloop', 'mloop']);
export const DRUM_INST = ['kick', 'snare', 'clap', 'hat', 'ohat', 'cymbal', 'tom', 'perc'];
export const MELODIC_INST = ['bass', 'synth', 'atmos'];
// familia de loops de cada instrumento
export const LOOP_HOME = Object.freeze({ ...Object.fromEntries(DRUM_INST.map((c) => [c, 'dloop'])), ...Object.fromEntries(MELODIC_INST.map((c) => [c, 'mloop'])) });
// subcarpeta del loop que dice qué suena (ids de SUBTYPES.dloop / SUBTYPES.mloop)
const TO_LOOP = { kick: 'kick', snare: 'clap', clap: 'clap', hat: 'hat', ohat: 'ohat', cymbal: 'cymbal', tom: 'tom', perc: 'perc', bass: 'bass', synth: 'synth', atmos: 'texture' };
// subcarpetas de un one-shot que dicen más que el instrumento y tienen su sitio en los loops
const SUB_TO_LOOP = { hat: { shaker: 'shaker' }, perc: { shaker: 'shaker' }, synth: { chord: 'chord' } };
// al revés: de la subcarpeta del loop al instrumento (y su subcarpeta). Si hay varios, se elige con `pick`.
const FROM_LOOP = {
  dloop: { kick: [['kick']], clap: [['snare'], ['clap']], hat: [['hat']], ohat: [['ohat']], shaker: [['perc', 'shaker'], ['hat', 'shaker']],
    cymbal: [['cymbal']], tom: [['tom']], perc: [['perc']] },
  mloop: { bass: [['bass']], synth: [['synth']], chord: [['synth', 'chord']], texture: [['atmos']] },
};

export const hasLoopHome = (cat) => !!LOOP_HOME[cat];
// ¿la carpeta separa Loops y One-shots dentro? Solo donde conviven los dos tipos (FX y Vox).
export const keepsBothKinds = (cat) => !!cat && !LOOP_HOME[cat] && !LOOP_FAMILIES.has(cat);

// Lo que suena: el instrumento de un loop («Drum loop › Closed-Hats» → hat) o la propia categoría.
export function whatOf(cat, sub) {
  if (!LOOP_FAMILIES.has(cat) || !sub) return cat || null;
  const o = FROM_LOOP[cat][sub];
  return o ? o[0][0] : cat;
}
// Todos los instrumentos que puede ser (para «Snares & Claps»: snare o clap)
export function whatsOf(cat, sub) {
  if (!LOOP_FAMILIES.has(cat) || !sub) return cat ? [cat] : [];
  const o = FROM_LOOP[cat][sub];
  return o ? [...new Set(o.map((x) => x[0]))] : [cat];
}

// Un instrumento en bucle → su familia de loops y la subcarpeta de lo que suena. null si no tiene familia.
export function loopPlace(cat, sub = null) {
  const home = LOOP_HOME[cat]; if (!home) return null;
  return { cat: home, sub: (SUB_TO_LOOP[cat] && SUB_TO_LOOP[cat][sub]) || TO_LOOP[cat] };
}
// Un loop que pasa a one-shot → el instrumento que suena en él. `pick(cands)` elige entre varios (por las
// pistas del nombre y el sonido); sin pistas, el primero. Full, Breaks, Tops (o sin subcarpeta): el
// instrumento con más pistas de su familia.
export function oneshotPlace(cat, sub = null, pick = null) {
  if (!LOOP_FAMILIES.has(cat)) return null;
  const choose = (cands) => (pick && cands.length > 1 ? pick(cands) : null) || cands[0];
  const opts = sub && FROM_LOOP[cat][sub];
  if (opts) {
    const inst = choose(opts.map((x) => x[0]));
    const o = opts.find((x) => x[0] === inst) || opts[0];
    return { cat: o[0], sub: o[1] || null };
  }
  return { cat: choose(cat === 'dloop' ? ['perc', ...DRUM_INST.filter((c) => c !== 'perc')] : ['synth', 'bass', 'atmos']), sub: null };
}
// El sitio de un sample: { cat, sub, moved }. kind: 'loop' | 'oneshot'.
export function canonPlace({ cat, kind, sub = null }, pick = null) {
  if (!cat) return { cat: null, sub: sub || null, moved: false };
  if (kind === 'loop' && LOOP_HOME[cat]) { const p = loopPlace(cat, sub); return { ...p, moved: true }; }
  if (kind === 'oneshot' && LOOP_FAMILIES.has(cat)) { const p = oneshotPlace(cat, sub, pick); return { ...p, moved: true }; }
  return { cat, sub: sub || null, moved: false };
}
// `pick` a partir de puntuaciones { cat: n }: el que más tiene; a igualdad, el primero de la lista.
export const pickByScores = (scores) => (cands) => {
  if (!scores) return null;
  let best = null, bv = 0;
  for (const c of cands) { const v = scores[c] || 0; if (v > bv) { best = c; bv = v; } }
  return best;
};
// La clasificación (core/classify.js) en su sitio, sabiendo si el sample es loop o one-shot.
// La propuesta de la herramienta («Closed hat», y es un loop) pasa a «Drum loop» con la subcarpeta de lo que
// suena (`placedSub`) y recuerda el instrumento (`placedFrom`). Lo que decidiste tú ya se guarda en su sitio
// (ver la interfaz); aquí solo se coloca la propuesta que se ve junto a tu decisión (`auto`).
export function placeProposal(c, kind) {
  if (!c) return c;
  if (c.cert === 'user') {
    if (!c.auto || !c.auto.cat) return c;
    const p = canonPlace({ cat: c.auto.cat, kind }, pickByScores(c.auto.scores));
    return p.moved ? { ...c, auto: { ...c.auto, cat: p.cat, placedFrom: c.auto.cat, placedSub: p.sub } } : c;
  }
  if (!c.cat) return c;
  const p = canonPlace({ cat: c.cat, kind }, pickByScores(c.scores));
  return p.moved ? { ...c, cat: p.cat, placedFrom: c.cat, placedSub: p.sub } : c;
}
