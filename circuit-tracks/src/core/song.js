// Canciones completas para el Circuit Tracks.
// Cada pista recibe 8 patrones con un papel fijo, como en la herramienta de la Rhythm. v3.4: más repetición, como en
// la pista: 1 intro/break · 2 A · 3 A (igual) · 4 A' (A con un remate sutil en el último tiempo de la batería; synths
// iguales) · 5 fill · 6 B · 7 build · 8 silencio. El groove encadena A A A' fill (2–5); con pista reloj, las escenas
// del medio de una sección tocan solo A (2–3) y el remate y el fill quedan para la última. Una estrategia de arreglo encadena secciones; cada sección es una escena del Circuit
// con la cadena de patrones de cada pista. Sale como escucha en el equipo, grabación guiada por patrones,
// .mid de la canción (una pista por pista del Circuit) y hoja de ruta para montar las escenas.
import { generatePattern, generateDrums, varyPattern, rng, SCALES, DRUM_NOTES, GM_DRUM_NOTES, NOTE_NAMES_ES } from './patterns.js';

// Orden del Circuit Tracks (Patterns View y Mixer): Synth 1, Synth 2, MIDI 1, MIDI 2, Drum 1–4
export const SONG_TRACKS = [
  { id: 'synth1', label: 'Synth 1', role: 'Bajo', kind: 'synth', dest: 'synth1' },
  { id: 'synth2', label: 'Synth 2', role: 'Lead / stabs', kind: 'synth', dest: 'synth2' },
  { id: 'midi1', label: 'MIDI 1', role: 'Pad / acordes', kind: 'synth', dest: 'midi1' },
  { id: 'midi2', label: 'MIDI 2', role: 'Drone / FX', kind: 'synth', dest: 'midi2' },
  { id: 'drum1', label: 'Drum 1', role: 'Bombo', kind: 'drum', lane: 0 },
  { id: 'drum2', label: 'Drum 2', role: 'Caja / palmas', kind: 'drum', lane: 1 },
  { id: 'drum3', label: 'Drum 3', role: 'Charles', kind: 'drum', lane: 2 },
  { id: 'drum4', label: 'Drum 4', role: 'Percusión', kind: 'drum', lane: 3 },
];
export const SLOT_ROLES = ['Intro / break', 'Groove A', 'Groove A (copia)', "Groove A'", 'Fill', 'Groove B', 'Build', 'Silencio'];
// cadenas que puede tocar una pista en una escena (patrones 1–8 del Circuit = índices 0–7)
// groove = A A A' fill · groove2 = A A · fillbuild = A' fill · intro y break comparten el patrón 1
export const SONG_RANGES = { light: [0, 0], groove: [1, 4], groove2: [1, 2], alt: [5, 5], fillbuild: [3, 4], build: [6, 6], break: [0, 0], off: [7, 7] };
export const MID_RANGE = [1, 2]; // escenas del medio de una sección: solo A
const SG_MIX = { '-': 'off', l: 'light', g: 'groove', h: 'groove2', a: 'alt', f: 'fillbuild', b: 'build', k: 'break' };

// Estilo de cada synth según el estilo de batería (se puede cambiar)
export const SONG_SYNTH_STYLES = {
  techno: ['offbeat', 'stab', 'pad', 'drone'], rumble: ['rolling', 'stab', 'pad', 'drone'], house: ['offbeat', 'chords', 'pad', 'drone'],
  minimal: ['offbeat', 'perc', 'pad', 'drone'], breakbeat: ['acid', 'lead', 'chords', 'drone'], electro: ['acid', 'arp', 'pad', 'drone'],
  industrial: ['rolling', 'stab', 'drone', 'drone'], halftime: ['sub', 'pad', 'pad', 'drone'], euclid: ['perc', 'arp', 'pad', 'drone'],
};

// ---------- utilidades ----------
const sgNotes = (pat) => (pat?.notes || []).map((e) => ({ ...e }));
const sgPat = (base, notes, extra = {}) => ({ ...base, notes: notes.sort((a, b) => a.t - b.t || a.n - b.n), cc: [], ...extra });
function sgDeg(root, scale, oct) {
  const iv = (SCALES[scale] || SCALES.minor).iv, L = iv.length;
  return (d) => oct + root + iv[((d % L) + L) % L] + 12 * Math.floor(d / L);
}
const sgVel = (v) => Math.max(1, Math.min(127, Math.round(v)));

// ---------- synths: los 8 papeles ----------
function synthSlots(t, o, R) {
  const N = o.steps, style = o.styles[t];
  const base = { v: 1, kind: undefined, root: o.root, scale: o.scale, steps: N, tempo: o.tempo, swing: 0, style };
  const gen = (st, seed, extra = {}) => generatePattern({ style: st, root: o.root, scale: o.scale, steps: N, tempo: o.tempo, seed, density: o.density === 0.5 ? null : o.density, ...extra });
  const main = gen(style, o.seed * 13 + t);
  const oct = main.octave ?? 48, deg = sgDeg(o.root, o.scale, oct);
  const altStyle = style === 'offbeat' ? 'rolling' : style === 'rolling' ? 'offbeat' : style === 'stab' ? 'chords' : style;
  const alt = gen(t === 0 ? altStyle : style, o.seed * 13 + t + 101);
  // intro: la mitad de las notas, más suaves (los pads y drones, enteros)
  const sustained = ['pad', 'drone', 'chords', 'sub'].includes(style);
  const light = sgPat(base, sustained ? sgNotes(main).map((e) => ({ ...e, v: sgVel(e.v - 20) })) : sgNotes(main).filter((e, i) => i % 2 === 0 || e.t % 8 === 0).map((e) => ({ ...e, v: sgVel(e.v - 15), slide: false })));
  // fill: corta el final y mete un remate que sube
  const fillN = sgNotes(main).filter((e) => e.t < N - 4).map((e) => ({ ...e, d: Math.min(e.d, N - 4 - e.t) }));
  if (t === 0) { fillN.push({ t: N - 3, n: deg(7), d: 0.5, v: 118 }); fillN.push({ t: N - 1, n: deg(0) + 12, d: 0.5, v: 110 }); }
  else if (!sustained) [0, 1, 2, 3].forEach((k) => fillN.push({ t: N - 4 + k, n: deg(k * 2), d: 0.6, v: 90 + k * 10 }));
  else fillN.push({ t: N - 4, n: deg(4), d: 4, v: 96 });
  const fill = sgPat(base, fillN);
  // build: notas repetidas que se aceleran y suben de velocidad
  const bN = [], ramp = (i) => 40 + (85 * i) / Math.max(1, N - 1);
  if (t === 0) for (let i = 0; i < N; i += i < N / 2 ? 2 : 1) bN.push({ t: i, n: deg(0) + (i >= (3 * N) / 4 && R() < 0.5 ? 12 : 0), d: 0.5, v: sgVel(ramp(i)) });
  else if (t === 1) for (let i = 0; i < N; i += 2) bN.push({ t: i, n: deg(Math.floor((i / N) * 7)), d: 0.8, v: sgVel(ramp(i)) });
  else bN.push({ t: 0, n: deg(0), d: N, v: 100 }, { t: 0, n: deg(4), d: N, v: 90 });
  const build = sgPat(base, bN);
  // break: notas largas (bajo), acordes largos (lead, pad), drone
  let brk;
  if (t === 0) brk = sgPat(base, sgNotes(gen('sub', o.seed * 13 + 55)));
  else if (t === 1) brk = sgPat(base, sgNotes(gen('pad', o.seed * 13 + 56, { octave: 48 })));
  else brk = sgPat(base, sgNotes(t === 2 ? gen('pad', o.seed * 13 + 57) : gen('drone', o.seed * 13 + 58)));
  const empty = sgPat(base, []);
  // patrón 1: intro y break. Pads y drones, la versión suave; bajo y lead, las notas largas del break
  const sparse = sustained ? light : brk;
  // A' de un synth = A: el remate lo hace la batería, el bajo y el lead siguen repitiendo
  return [sparse, sgPat(base, sgNotes(main)), sgPat(base, sgNotes(main)), sgPat(base, sgNotes(main)), fill, sgPat(base, sgNotes(alt)), build, empty];
}

// ---------- batería: los 8 papeles, un patrón por pista Drum ----------
function drumSlots(o, R) {
  const N = o.steps;
  const g = (seed, d = o.density) => generateDrums({ style: o.style, seed, steps: N, density: d, fill: false, humanize: 0.12 });
  const main = g(o.seed), alt0 = g(o.seed + 101, Math.min(1, o.density + 0.15));
  const lane = (p, l) => p.notes.filter((e) => e.lane === l).map((e) => ({ ...e }));
  const H = (l, t, v) => ({ t, lane: l, n: DRUM_NOTES[l], d: 0.5, v: sgVel(v) });
  const base = { v: 1, kind: 'drum', steps: N, tempo: o.tempo, swing: 0, style: o.style };
  const out = [[], [], [], []];
  for (let l = 0; l < 4; l++) {
    const m = lane(main, l);
    const light = l === 0 ? m.filter((e) => e.t % 4 === 0) : l === 2 ? (m.filter((e) => e.t % 4 === 2).map((e) => ({ ...e, v: Math.min(e.v, 85) })).length ? m.filter((e) => e.t % 4 === 2).map((e) => ({ ...e, v: Math.min(e.v, 85) })) : Array.from({ length: N / 4 }, (_, k) => H(2, k * 4 + 2, 80))) : l === 3 ? m.filter((e) => e.t % 8 === 6) : [];
    const alt = l === 0 ? m.map((e) => ({ ...e })) : lane(alt0, l);
    let fill = m.filter((e) => e.t < N - 4);
    if (l === 0) fill = m.filter((e) => e.t < N - 2);
    if (l === 1) for (let i = N - 4; i < N; i++) fill.push(H(1, i, 55 + (i - N + 4) * 20));
    if (l === 2) for (let i = N - 4; i < N; i++) fill.push(H(2, i, 70 + (i - N + 4) * 12));
    if (l === 3) { fill = m.filter((e) => e.t < N - 3); fill.push(H(3, N - 3, 95), H(3, N - 1, 110)); }
    const ramp = (i) => 35 + (92 * i) / (N - 1), build = [];
    if (l === 0) for (let i = 0; i < N - 4; i += 4) build.push(H(0, i, 118));
    if (l === 1) for (let i = 0; i < N; i++) if (i < N / 2 ? i % 2 === 0 : true) build.push(H(1, i, ramp(i)));
    if (l === 2) for (let i = 0; i < N; i++) build.push(H(2, i, 50 + (70 * i) / (N - 1)));
    if (l === 3) for (let i = 2; i < N - 2; i += 4) build.push(H(3, i, 80 + (i / N) * 30));
    // A': A con un remate sutil en el último tiempo (charles, percusión, golpe fantasma de caja); el bombo no cambia
    const has = (x) => m.some((e) => Math.round(e.t) === x);
    const turn = m.map((e) => ({ ...e }));
    if (l === 1 && !has(N - 1)) turn.push(H(1, N - 1, 48));
    if (l === 2) { if (!has(N - 3)) turn.push(H(2, N - 3, 68)); if (!has(N - 1)) turn.push(H(2, N - 1, 76)); }
    if (l === 3) { for (let i = turn.length - 1; i >= 0; i--) if (Math.round(turn[i].t) === N - 4) turn.splice(i, 1); if (!has(N - 2)) turn.push(H(3, N - 2, 86)); }
    // patrón 1: intro y break comparten la versión ligera
    out[l] = [light, m, m.map((e) => ({ ...e })), turn, fill, alt, build, []].map((ns) => sgPat(base, ns));
  }
  return out;
}

// opts: { style, seed, steps (16|32), density, root (0–11), scale, tempo, styles[4], locked:Set, prev }
export function songFamily(opts = {}) {
  const o = { style: 'techno', seed: 1, steps: 16, density: 0.5, root: 9, scale: 'minor', tempo: 128, locked: null, prev: null, ...opts };
  o.styles = opts.styles || SONG_SYNTH_STYLES[o.style] || SONG_SYNTH_STYLES.techno;
  const R = rng(o.seed * 97 + 13);
  const drums = drumSlots(o, R), tracks = [];
  for (let t = 0; t < 8; t++) {
    if (o.locked?.has(t) && o.prev?.[t]) { tracks.push(o.prev[t]); continue; }
    tracks.push(t < 4 ? synthSlots(t, o, R) : drums[t - 4]);
  }
  return { steps: o.steps, root: o.root, scale: o.scale, style: o.style, styles: o.styles, seed: o.seed, tempo: o.tempo, tracks };
}

// ---------- estrategias de arreglo (las mismas que en la herramienta de la Rhythm) ----------
// mix: una letra por pista en el orden S1 S2 M1 M2 D1 D2 D3 D4
const sgSec = (id, bars, mix, energy) => ({ id, bars, mix, energy });
// Convierte una mezcla escrita para la Rhythm (KCHOPBSF) al orden del Tracks
const fromRhythm = (m) => m[5] + m[6] + m[7] + (m[7] === 'l' ? '-' : m[7]) + m[0] + m[1] + m[2] + m[4];
const RS = (id, bars, mix, e) => sgSec(id, bars, fromRhythm(mix), e);
// Cada estrategia cabe en las 16 escenas del Circuit: secciones en múltiplos de 8 compases (o 4 para un build corto)
// y como mucho 128 compases. Una sección de 16 o 32 compases se toca con 2 o 4 escenas iguales seguidas.
export const STRATEGIES = {
  dj: [RS('intro', 16, 'g-l-----', 0.3), RS('intro2', 8, 'g-glh---', 0.45), RS('bassin', 16, 'g-ggggh-', 0.6), RS('build', 8, 'ffbbbb-b', 0.7), RS('drop', 32, 'gggggggl', 1),
    RS('break', 16, '--l-lkkk', 0.35), RS('build', 8, 'ffbbbb-b', 0.75), RS('drop2', 16, 'aaaaaaal', 1), RS('outro', 8, 'g-gglh--', 0.4)],
  hypnotic: [RS('intro', 8, 'g-------', 0.25), RS('add', 8, 'g-g-----', 0.35), RS('add', 8, 'g-g-g---', 0.45), RS('add', 8, 'g-g-gg--', 0.6), RS('add', 16, 'g-gggg--', 0.7),
    RS('peak', 16, 'gggggghl', 0.85), RS('break', 8, '--l-hk--', 0.4), RS('peak', 16, 'gggggggl', 0.95), RS('sub', 8, 'g-gggg--', 0.65), RS('sub', 8, 'g-g-g---', 0.45), RS('outro', 8, 'g-------', 0.3)],
  peak: [RS('intro', 8, 'g-l-----', 0.35), RS('build', 8, 'ffbbbb-b', 0.65), RS('drop', 32, 'gggggggl', 1), RS('break', 16, '----lkkk', 0.35), RS('build', 4, 'ffbbbb-b', 0.85),
    RS('drop2', 32, 'aaaaaaal', 1), RS('outro', 16, 'g-ggl---', 0.4)],
  melodic: [RS('intro', 16, 'g-l--h--', 0.3), RS('groove', 16, 'g-ggghh-', 0.6), RS('break', 32, '----lkkk', 0.4), RS('build', 16, 'ffbbbbhb', 0.7),
    RS('drop', 32, 'gggggggl', 1), RS('outro', 16, 'g-gglh--', 0.45)],
  live: [RS('base', 8, 'g-l-----', 0.3), RS('groove', 8, 'g-ggg---', 0.5), RS('bassin', 8, 'g-ggggh-', 0.65), RS('full', 8, 'gggggggl', 0.9), RS('fullb', 8, 'aaaaaaal', 0.95),
    RS('break', 8, '----lkkk', 0.35), RS('build', 8, 'ffbbbb-b', 0.75), RS('drop', 8, 'gggggggl', 1)],
};
export const STRATEGY_IDS = Object.keys(STRATEGIES);

// Otra estructura: alarga o acorta secciones y cambia qué entra en cada una, sin romper la forma
export function arrange(strategyId, seed = 1, { reshuffle = 0 } = {}) {
  const st = STRATEGIES[strategyId] || STRATEGIES.dj, R = rng(seed * 31 + reshuffle * 7919 + 3);
  return st.map((s) => {
    let bars = s.bars;
    if (reshuffle && R() < 0.35 && bars >= 16) bars = R() < 0.5 ? bars / 2 : bars;
    if (reshuffle && R() < 0.25 && bars <= 8 && s.id !== 'build') bars *= 2;
    let mix = s.mix.split('');
    if (reshuffle) mix = mix.map((m, i) => (m === 'g' && i !== 4 && R() < 0.12 ? 'h' : m === 'h' && R() < 0.2 ? 'g' : m));
    return { ...s, bars, mix: mix.join('') };
  });
}
export const songRangeOf = (sec, t) => SG_MIX[sec.mix[t]] || 'off';
export const songPassBars = (key, steps) => { const r = SONG_RANGES[key]; return ((r[1] - r[0] + 1) * steps) / 16; };

// ---------- Plan de escenas: lo que el Circuit tocará de verdad ----------
// En el Circuit Tracks una escena dura lo que su cadena de patrones más larga y, dentro de una cadena de escenas, cada
// escena suena UNA vez (las pistas con cadenas más cortas dan vueltas dentro de ella). Las cadenas son de patrones
// consecutivos. Por eso:
//  · una sección larga se toca con varias escenas iguales seguidas (copias), como mucho 16 escenas en total;
//  · la duración de cada escena la fija una pista libre (MIDI 2 o MIDI 1 sin sinte) encadenando patrones vacíos de
//    16 pasos (los del proyecto vacío): la «pista reloj». Así una escena puede durar 1–8 compases aunque la batería
//    tenga una cadena más corta.
// Sin pista libre, la escena dura lo que la cadena más larga.
export const MAX_SCENES = 16;
export function scenePlan(sections, { steps = 16, off = new Set(), maxScenes = MAX_SCENES } = {}) {
  const pb = steps / 16, timer = off.has(3) ? 3 : off.has(2) ? 2 : null;
  const secs = sections.map((s0, i) => {
    const tracks = [];
    for (let t = 0; t < 8; t++) { const key = off.has(t) ? 'off' : songRangeOf(s0, t), [a, b] = SONG_RANGES[key]; tracks.push({ key, from: a, to: b, bars: (b - a + 1) * pb }); }
    const realMax = Math.max(pb, ...tracks.filter((x) => x.key !== 'off').map((x) => x.bars));
    let L = realMax;
    if (timer != null) { // la escena más larga posible (≤ 8 compases) que divida la sección y no corte ninguna cadena
      for (let k = Math.min(8, s0.bars); k >= realMax; k--) if (s0.bars % k === 0) { L = k; break; }
    }
    const copies = Math.max(1, Math.round(s0.bars / L));
    if (timer != null) tracks[timer] = { key: 'timer', from: 0, to: L - 1, bars: L };
    // escenas del medio: el groove solo con A; vale si la escena sigue durando lo mismo (pista reloj u otra cadena)
    const mid = tracks.map((x) => (x.key === 'groove' ? { ...x, from: MID_RANGE[0], to: MID_RANGE[1], bars: 2 * pb, mid: true } : x));
    const midMax = Math.max(pb, ...mid.filter((x) => x.key !== 'off' && x.key !== 'timer').map((x) => x.bars));
    const midOK = mid.some((x) => x.mid) && (timer != null ? midMax <= L : midMax === L);
    return { ...s0, index: i, L, copies, want: s0.bars, tracks, mid: midOK ? mid : null };
  });
  // cabe en 16 escenas: se quitan copias a las secciones más largas, de una en una
  let total = secs.reduce((a, x) => a + x.copies, 0);
  while (total > maxScenes) { const big = secs.filter((x) => x.copies > 1).sort((a, b) => b.copies - a.copies || b.index - a.index)[0]; if (!big) break; big.copies--; total--; }
  const kept = [], cut = [];
  for (const x of secs) (kept.reduce((a, y) => a + y.copies, 0) + x.copies <= maxScenes ? kept : cut).push(x);
  let bar = 0; const scenes = [];
  for (const x of kept) {
    x.start = bar; x.bars = x.copies * x.L;
    const first = scenes.length + 1;
    for (let c = 0; c < x.copies; c++) {
      const tracks = x.mid && c < x.copies - 1 ? x.mid : x.tracks;
      const same = c > 0 && tracks === (x.mid && x.copies > 1 ? x.mid : x.tracks) ? first : null;
      scenes.push({ n: scenes.length + 1, sec: x.index, id: x.id, copy: c, of: x.copies, start: bar + c * x.L, bars: x.L, tracks, same, end: !!x.mid && c === x.copies - 1 });
    }
    bar += x.bars;
  }
  const changed = kept.filter((x) => x.bars !== x.want).map((x) => ({ id: x.id, from: x.want, to: x.bars }));
  return { sections: kept, scenes, bars: bar, steps, timer, cut: cut.map((x) => x.id), changed, wanted: sections.reduce((a, x) => a + x.bars, 0) };
}
// Compatibilidad: la línea de tiempo ES el plan de escenas
export function songTimeline(sections, { off = new Set(), steps = 16 } = {}) { return scenePlan(sections, { off, steps }); }

// Notas de toda la canción tal como las tocará el Circuit: escena a escena, cada pista da vueltas a su cadena desde el
// principio de la escena. [{ t, n, d, v, track }]
export function songNotes(fam, tl, { onlyTrack = null, fromBar = 0 } = {}) {
  const ev = [], N = fam.steps;
  for (const sc of tl.scenes) {
    if (sc.start + sc.bars <= fromBar) continue;
    const total = sc.bars * 16;
    sc.tracks.forEach((tr, t) => {
      if ((onlyTrack != null && t !== onlyTrack) || tr.key === 'off' || tr.key === 'timer') return;
      const chain = []; for (let k = tr.from; k <= tr.to; k++) chain.push(fam.tracks[t][k]);
      const len = chain.length * N;
      for (let o = 0; o < total; o += len) chain.forEach((p, ci) => {
        for (const e of p.notes) {
          const step = o + ci * N + e.t; if (step >= total) continue;
          ev.push({ t: sc.start * 16 + step, n: e.n, d: Math.min(e.d, total - step), v: e.v, slide: e.slide, track: t, lane: e.lane });
        }
      });
    });
  }
  return ev.filter((e) => e.t >= fromBar * 16).sort((a, b) => a.t - b.t || a.track - b.track || a.n - b.n);
}

// Eventos de un patrón (1–8) de todas las pistas activas, para grabarlo en el Circuit de una pasada
export function slotEvents(fam, slot, { channels, drumChannel = 9, off = new Set(), drumNotes = DRUM_NOTES } = {}) {
  const ev = [];
  fam.tracks.forEach((slots, t) => {
    if (off.has(t)) return;
    const tr = SONG_TRACKS[t], p = slots[slot];
    for (const e of p.notes) ev.push(tr.kind === 'drum' ? { ...e, n: drumNotes[tr.lane], ch: drumChannel } : { ...e, ch: channels[t] });
  });
  return ev;
}
// Patrones que hay que grabar: los que usa alguna escena (el 8, silencio, nunca hace falta)
export function usedSlots(tl) {
  const s = new Set();
  for (const sec of tl.sections) for (const tr of sec.tracks) if (tr.key !== 'off' && tr.key !== 'timer') for (let k = tr.from; k <= tr.to; k++) if (k !== 7) s.add(k);
  return [...s].sort((a, b) => a - b);
}

// ---------- .mid de la canción: SMF tipo 1, una pista por pista del Circuit ----------
const sgVlq = (n) => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
const sgStr = (s) => [...new TextEncoder().encode(s)];
const sgU32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
export function songToMidi(fam, tl, { tempo = 128, channels = [0, 1, 2, 3], drumChannel = 9, drumMap = 'circuit', name = 'Song', off = new Set(), ppq = 96 } = {}) {
  const q = ppq / 4, chunks = [];
  const us = Math.round(60000000 / tempo);
  const meta = [...sgVlq(0), 0xff, 0x03, ...sgVlq(sgStr(name).length), ...sgStr(name), ...sgVlq(0), 0xff, 0x51, 0x03, (us >> 16) & 255, (us >> 8) & 255, us & 255, ...sgVlq(0), 0xff, 0x58, 0x04, 4, 2, 24, 8];
  // marcadores de sección
  let last = 0;
  for (const s of tl.sections) { const at = s.start * 16 * q; const txt = sgStr(s.id); meta.push(...sgVlq(at - last), 0xff, 0x06, ...sgVlq(txt.length), ...txt); last = at; }
  meta.push(...sgVlq(tl.bars * 16 * q - last), 0xff, 0x2f, 0);
  chunks.push(meta);
  const dn = drumMap === 'gm' ? GM_DRUM_NOTES : DRUM_NOTES;
  for (let t = 0; t < 8; t++) {
    if (off.has(t)) continue;
    const tr = SONG_TRACKS[t], ch = tr.kind === 'drum' ? drumChannel : channels[t];
    const notes = songNotes(fam, tl, { onlyTrack: t }), ev = [];
    notes.forEach((e, i) => {
      const n = tr.kind === 'drum' ? dn[tr.lane] : e.n, on = Math.round(e.t * q);
      let offT = Math.max(on + 1, Math.round((e.t + Math.min(e.d, 16)) * q));
      const nx = notes.slice(i + 1).find((x) => x.n === e.n); if (nx && tr.kind !== 'drum') offT = Math.min(offT, Math.round(nx.t * q));
      ev.push([on, 1, [0x90 | ch, n, sgVel(e.v)]], [Math.max(on + 1, offT), 0, [0x80 | ch, n, 0]]);
    });
    ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const lbl = sgStr(tr.label), trk = [...sgVlq(0), 0xff, 0x03, ...sgVlq(lbl.length), ...lbl];
    let lt = 0; for (const [at, , b] of ev) { trk.push(...sgVlq(at - lt), ...b); lt = at; }
    trk.push(...sgVlq(Math.max(0, tl.bars * 16 * q - lt)), 0xff, 0x2f, 0);
    chunks.push(trk);
  }
  const out = [0x4d, 0x54, 0x68, 0x64, ...sgU32(6), 0, 1, 0, chunks.length, (ppq >> 8) & 255, ppq & 255];
  for (const c of chunks) out.push(0x4d, 0x54, 0x72, 0x6b, ...sgU32(c.length), ...c);
  return new Uint8Array(out);
}

// ---------- hoja de ruta para montar las escenas en el Circuit ----------
export function songRoadmap(fam, tl, bpm) {
  return tl.scenes.map((sc) => ({ scene: sc.n, id: sc.id, copy: sc.copy, of: sc.of, bars: sc.bars, sec: Math.round((sc.bars * 4 * 60) / bpm), same: sc.same ?? null, end: !!sc.end,
    chains: sc.tracks.map((x) => (x.key === 'off' ? '' : x.key === 'timer' ? `1–${x.to + 1}⏱` : x.from === x.to ? String(x.from + 1) : `${x.from + 1}–${x.to + 1}`)) }));
}
export const songKeyName = (root, scale) => `${NOTE_NAMES_ES[root]} ${(SCALES[scale] || SCALES.minor).ct}`;
