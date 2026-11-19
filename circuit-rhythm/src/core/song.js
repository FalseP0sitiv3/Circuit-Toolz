// core/song.js — canciones completas para la Circuit Rhythm
// Cada pista recibe 8 patrones con un papel fijo. v1.9: la música electrónica se apoya en la repetición, así que
// el groove repite A y solo varía al final de la frase:
//   1 ligero (intro de la batería; notas largas del break en bajo, synth y FX) · 2 A · 3 A (igual) · 4 A' (A con un
//   remate sutil al final: charles, percusión, palma; mismo bombo y mismo bajo) · 5 fill · 6 B · 7 build · 8 silencio
// La cadena del groove es A A A' fill (patrones 2–5, consecutivos como exige la Rhythm). Cuando la escena dura más
// que esa cadena (la marca una pista en silencio que hace de reloj), las escenas del medio de una sección tocan solo
// A (2–3) y el remate y el fill quedan para la última escena: frases largas que cambian al final, como en la pista.
// Una estrategia de arreglo encadena secciones; sale como línea de tiempo (escucha, .mid, audio) y proyecto .ncs.
import { generate, vary, rng, noteFor, SCALES } from './patterns.js';

export const SLOT_ROLES = ['light', 'main', 'main2', 'turn', 'fill', 'alt', 'build', 'empty'];
// cadenas (rango de slots) que puede tocar una pista en una escena; 1, 2 o 4 patrones para que encajen.
// groove = A A A' fill · groove2 = A A (solo A) · fillbuild = A' fill (bombo y palma en un build) · intro y break comparten el 1
export const RANGES = { light: [0, 0], groove: [1, 4], groove2: [1, 2], alt: [5, 5], fillbuild: [3, 4], build: [6, 6], break: [0, 0], off: [7, 7] };
export const MID_RANGE = [1, 2]; // escenas del medio de una sección: solo A
const TK = 0, TC = 1, TH = 2, TO = 3, TP = 4, TB = 5, TS = 6, TF = 7;
const T = 'KCHOPBSF';

// ---------- familia de patrones de una pista ----------
const sHit = (v, extra = {}) => ({ v: Math.max(1, Math.min(127, Math.round(v))), ...extra });
const empty = (n) => Array(n).fill(null);
const tile = (ln, n) => Array.from({ length: n }, (_, i) => (ln[i % ln.length] ? { ...ln[i % ln.length] } : null));

function light(t, main, n) {
  const out = empty(n);
  main.forEach((s, i) => {
    if (!s) return;
    if (t === TK && i % 4 === 0) out[i] = { ...s };
    if (t === TH && i % 4 === 2) out[i] = sHit(Math.min(s.v, 85));
    if (t === TP && i % 8 === 6) out[i] = { ...s };
  });
  if (t === TH && !out.some(Boolean)) for (let i = 2; i < n; i += 4) out[i] = sHit(80);
  return out;
}
function fill(t, main, n, R) {
  const out = main.map((s) => (s ? { ...s } : null));
  const a = n - 4;
  if (t === TK) { out[n - 2] = null; out[n - 1] = null; }
  if (t === TC) for (let i = a; i < n; i++) out[i] = sHit(55 + (i - a) * 20);
  if (t === TH) for (let i = a; i < n; i++) out[i] = sHit(70 + (i - a) * 12);
  if (t === TP) { out[n - 3] = sHit(95); out[n - 1] = sHit(110); }
  if (t === TS && R() < 0.6) out[n - 2] = sHit(100, { n: 0 });
  return out;
}
// A': A con un remate sutil en el último tiempo (último cuarto de compás). El bombo, el bajo y el synth no cambian.
function turn(t, main, n, R) {
  const out = main.map((s) => (s ? { ...s } : null));
  if (t === TH) { if (!out[n - 3]) out[n - 3] = sHit(68); if (!out[n - 1]) out[n - 1] = sHit(76); }
  if (t === TO && R() < 0.6) out[n - 2] = sHit(88);
  if (t === TP) { out[n - 2] = sHit(86); if (R() < 0.5) out[n - 4] = null; }
  if (t === TC && !out[n - 1]) out[n - 1] = sHit(48);
  return out;
}
function build(t, n, R, sc) {
  const out = empty(n);
  const ramp = (i) => 35 + (92 * i) / (n - 1);
  if (t === TK) for (let i = 0; i < n - 4; i += 4) out[i] = sHit(118);
  if (t === TC) for (let i = 0; i < n; i++) if (i < n / 2 ? i % 2 === 0 : true) out[i] = sHit(ramp(i));
  if (t === TH) for (let i = 0; i < n; i++) out[i] = sHit(50 + (70 * i) / (n - 1));
  if (t === TP) for (let i = 2; i < n - 2; i += 4) out[i] = sHit(80 + (i / n) * 30);
  if (t === TB) for (let i = 0; i < n - 4; i += 4) out[i] = sHit(ramp(i), { n: i >= n / 2 && R() < 0.5 ? sc(4) : 0 });
  if (t === TF) out[0] = sHit(110); // riser o impacto de la pista FX
  return out;
}
function brk(t, n, R, sc) {
  const out = empty(n);
  if (t === TH && R() < 0.5) for (let i = 2; i < n; i += 8) out[i] = sHit(55);
  if (t === TP && R() < 0.4) out[n - 6] = sHit(70);
  if (t === TB) { out[0] = sHit(95, { n: 0 }); out[n / 2] = sHit(85, { n: sc([0, 5, 3, 4][Math.floor(R() * 4)]) }); }
  if (t === TS) [0, 6, 10, n / 2, n / 2 + 6].filter((i) => i < n).forEach((i, k) => { if (k === 0 || R() < 0.55) out[i] = sHit(90 - k * 6, { n: sc([0, 2, 4, 6][k % 4]) }); });
  if (t === TF) out[0] = sHit(100); // atmósfera o pad largo
  return out;
}

// opts: { style, seed, steps (16|32), density, root, scale, flip:{4:[slots]}, prob:true, locked:Set, prev }
export function songFamily(opts = {}) {
  const o = { style: 'techno', seed: 1, steps: 32, density: 0.5, root: 33, scale: 'minor', prob: true, flip: null, locked: null, prev: null, ...opts };
  const n = o.steps;
  const R = rng(o.seed * 97 + 13);
  const scl = SCALES[o.scale] || SCALES.minor;
  const sc = (d) => scl[((d % scl.length) + scl.length) % scl.length] + 12 * Math.floor(d / scl.length);
  const g = generate({ style: o.style, seed: o.seed, steps: 16, density: o.density, root: o.root, scale: o.scale, fill: false });
  const gAlt = generate({ style: o.style, seed: o.seed + 101, steps: 16, density: Math.min(1, o.density + 0.15), root: o.root, scale: o.scale, fill: false,
    bassStyle: ['offbeat', 'rolling', 'syncopated'][(o.seed + 1) % 3] });
  const main = g.lanes.map((l) => tile(l.steps, n));
  const alt = gAlt.lanes.map((l, t) => (t === TK ? main[TK].map((s) => (s ? { ...s } : null)) : tile(l.steps, n)));
  const tracks = [];
  for (let t = 0; t < 8; t++) {
    if (o.locked && o.locked.has(t) && o.prev) { tracks.push(o.prev[t]); continue; }
    // 1: la batería, ligera (intro); bajo, synth y FX, las notas largas del break
    const sparse = t === TB || t === TS || t === TF ? brk(t, n, R, sc) : light(t, main[t], n);
    const copyA = () => main[t].map((s) => (s ? { ...s } : null));
    const slots = [sparse, copyA(), copyA(), turn(t, main[t], n, R), fill(t, main[t], n, R), alt[t], build(t, n, R, sc), empty(n)];
    // probabilidad en golpes suaves (hats y perc): la repetición cambia sola en cada vuelta
    if (o.prob && (t === TH || t === TP)) for (const sl of [1, 2, 3, 5]) slots[sl].forEach((s) => { if (s && s.v < 80) s.p = 5; });
    // sample flip en la percusión: varios sonidos en una pista
    const fl = o.flip && o.flip[t];
    if (fl && fl.length > 1) for (const sl of [1, 2, 3, 4, 5]) { let k = 0; slots[sl].forEach((s) => { if (s) s.sl = fl[k++ % fl.length]; }); }
    tracks.push(slots);
  }
  return { steps: n, root: o.root, scale: o.scale, style: o.style, seed: o.seed, tracks };
}

// ---------- estrategias de arreglo ----------
// mix: una letra por pista (KCHOPBSF) → rango; '-' = en silencio
const MIX = {
  '-': 'off', l: 'light', g: 'groove', h: 'groove2', a: 'alt', f: 'fillbuild', b: 'build', k: 'break',
};
// La pista FX en «intro» (patrón 1) no tiene golpes: se escribe en silencio para que marque el tiempo de la escena
const sec = (id, bars, mix, energy) => ({ id, bars, mix: mix[7] === 'l' ? mix.slice(0, 7) + '-' : mix, energy });
export const STRATEGIES = {
  dj: { sections: [
    sec('intro', 16, 'g-l-----', 0.3), sec('intro2', 8, 'g-glh---', 0.45), sec('bassin', 16, 'g-ggggh-', 0.6), sec('build', 8, 'ffbbbb-b', 0.7),
    sec('drop', 32, 'gggggggl', 1), sec('break', 16, '--l-lkkk', 0.35), sec('build', 8, 'ffbbbb-b', 0.75), sec('drop2', 16, 'aaaaaaal', 1), sec('outro', 8, 'g-gglh--', 0.4),
  ] },
  hypnotic: { sections: [
    sec('intro', 8, 'g-------', 0.25), sec('add', 8, 'g-g-----', 0.35), sec('add', 8, 'g-g-g---', 0.45), sec('add', 8, 'g-g-gg--', 0.6), sec('add', 16, 'g-gggg--', 0.7),
    sec('peak', 16, 'gggggghl', 0.85), sec('break', 8, '--l-hk--', 0.4), sec('peak', 16, 'gggggggl', 0.95), sec('sub', 8, 'g-gggg--', 0.65), sec('sub', 8, 'g-g-g---', 0.45), sec('outro', 8, 'g-------', 0.3),
  ] },
  peak: { sections: [
    sec('intro', 8, 'g-l-----', 0.35), sec('build', 8, 'ffbbbb-b', 0.65), sec('drop', 32, 'gggggggl', 1), sec('break', 16, '----lkkk', 0.35), sec('build', 4, 'ffbbbb-b', 0.85),
    sec('drop2', 32, 'aaaaaaal', 1), sec('outro', 16, 'g-ggl---', 0.4),
  ] },
  melodic: { sections: [
    sec('intro', 16, 'g-l--h--', 0.3), sec('groove', 16, 'g-ggghh-', 0.6), sec('break', 32, '----lkkk', 0.4), sec('build', 16, 'ffbbbbh-', 0.7),
    sec('drop', 32, 'gggggggl', 1), sec('outro', 16, 'g-gglh--', 0.45),
  ] },
  live: { sections: [
    sec('base', 8, 'g-l-----', 0.3), sec('groove', 8, 'g-ggg---', 0.5), sec('bassin', 8, 'g-ggggh-', 0.65), sec('full', 8, 'gggggggl', 0.9),
    sec('fullb', 8, 'aaaaaaal', 0.95), sec('break', 8, '----lkkk', 0.35), sec('build', 8, 'ffbbbb-b', 0.75), sec('drop', 8, 'gggggggl', 1),
  ] },
};
export const STRATEGY_IDS = Object.keys(STRATEGIES);

// variación de estructura: alarga o acorta secciones y cambia qué entra en cada una, sin romper la forma
export function arrange(strategyId, seed = 1, { reshuffle = 0 } = {}) {
  const st = STRATEGIES[strategyId] || STRATEGIES.dj;
  const R = rng(seed * 31 + reshuffle * 7919 + 3);
  return st.sections.map((s) => {
    let bars = s.bars;
    if (reshuffle && R() < 0.35 && bars >= 16) bars = R() < 0.5 ? bars / 2 : bars;
    if (reshuffle && R() < 0.25 && bars <= 8 && s.id !== 'build') bars *= 2;
    let mix = s.mix.split('');
    if (reshuffle) mix = mix.map((m, i) => (m === 'g' && i !== TK && R() < 0.12 ? 'h' : m === 'h' && R() < 0.2 ? 'g' : m));
    return { ...s, bars, mix: mix.join('') };
  });
}

// bars por vuelta de la cadena de una pista
export const passBars = (rangeKey, steps) => { const r = RANGES[rangeKey]; return ((r[1] - r[0] + 1) * steps) / 16; };
export function rangeOf(sec, t) { return MIX[sec.mix[t]] || 'off'; }

// ---------- Plan de escenas: lo que la Rhythm tocará de verdad ----------
// En la Circuit una escena dura lo que su cadena de patrones más larga y, dentro de la cadena de escenas, cada escena
// suena UNA vez (las cadenas más cortas dan vueltas dentro de ella). Por eso una sección larga se toca con varias escenas
// iguales seguidas (copias), como mucho 16. Las pistas en silencio tocan el patrón 8, vacío: la herramienta lo alarga
// (más lento y más largo) para que haga de reloj y la escena dure lo que hace falta aunque las demás cadenas sean cortas.
export const MAX_SCENES = 16;
export const TIMER_MAX = 8;
// patrón reloj de T compases: [último paso, velocidad] (3 = 1/16, 5 = 1/8, 7 = 1/4)
export const timerPattern = (T) => (T <= 2 ? [16 * T - 1, 3] : T <= 4 ? [8 * T - 1, 5] : [4 * T - 1, 7]);

function planWith(sections, steps, Tv, maxScenes) {
  const pb = steps / 16;
  const secs = sections.map((s0, i) => {
    const tracks = [];
    for (let t = 0; t < 8; t++) { const key = rangeOf(s0, t), [a, b] = RANGES[key]; tracks.push({ key, from: a, to: b, slots: Array.from({ length: b - a + 1 }, (_, k) => a + k), bars: key === 'off' ? (Tv && Tv[t]) || pb : (b - a + 1) * pb }); }
    const L = Math.max(pb, ...tracks.filter((x) => x.key !== 'off' || Tv).map((x) => x.bars));
    const copies = Math.max(1, Math.round(s0.bars / L));
    // escenas del medio: el groove solo con A; vale si la escena sigue durando lo mismo (la marca otra pista o el reloj)
    const mid = tracks.map((x) => (x.key === 'groove' ? { ...x, from: MID_RANGE[0], to: MID_RANGE[1], slots: [MID_RANGE[0], MID_RANGE[1]], bars: 2 * pb, mid: true } : x));
    const Lmid = Math.max(pb, ...mid.filter((x) => x.key !== 'off' || Tv).map((x) => x.bars));
    return { ...s0, index: i, L, copies, want: s0.bars, tracks, mid: mid.some((x) => x.mid) && Lmid === L ? mid : null };
  });
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
      scenes.push({ n: scenes.length + 1, sec: x.index, id: x.id, copy: c, of: x.copies, start: bar + c * x.L, bars: x.L, tracks, same, end: x.mid && c === x.copies - 1 });
    }
    bar += x.bars;
  }
  const changed = kept.filter((x) => x.bars !== x.want).map((x) => ({ id: x.id, index: x.index, from: x.want, to: x.bars }));
  const cost = changed.reduce((a, x) => a + Math.abs(x.from - x.to), 0) + cut.reduce((a, x) => a + 2 * x.want, 0);
  return { sections: kept, scenes, bars: bar, steps, timers: Tv, timer: Tv ? Math.max(...Tv) : null, cut: cut.map((x) => x.id), changed, cost, wanted: sections.reduce((a, x) => a + x.bars, 0) };
}
// Elige la duración del reloj de cada pista (1–8 compases) que respeta mejor la estructura pedida en 16 escenas:
// primero el mismo reloj para todas y luego se afina pista a pista (p. ej. un build corto con solo el synth en silencio)
export function scenePlan(sections, { steps = 32, maxScenes = MAX_SCENES, timers = 'auto' } = {}) {
  const silentT = new Set(); sections.forEach((s) => s.mix.split('').forEach((m, t) => { if (rangeOf(s, t) === 'off') silentT.add(t); }));
  if (!silentT.size) return planWith(sections, steps, null, maxScenes);
  if (Array.isArray(timers)) return planWith(sections, steps, timers, maxScenes);
  const vec = (T) => Array.from({ length: 8 }, () => T);
  let best = null;
  const tryV = (v) => { const p = planWith(sections, steps, v, maxScenes); if (!best || p.cost < best.cost || (p.cost === best.cost && p.scenes.length < best.scenes.length)) best = p; };
  for (let T = TIMER_MAX; T >= 1; T--) tryV(vec(T));
  for (let pass = 0; pass < 2 && best.cost > 0; pass++) for (const t of silentT) for (let T = TIMER_MAX; T >= 1; T--) { const v = best.timers.slice(); v[t] = T; tryV(v); }
  return best;
}
// Compatibilidad: la línea de tiempo ES el plan de escenas
export function timeline(fam, sections, opts = {}) { return scenePlan(sections, { steps: fam.steps, ...opts }); }

// Eventos con tiempo en pasos (semicorcheas), tal como los tocará la Rhythm: escena a escena, cada pista
// empieza su cadena al principio de la escena y le da vueltas hasta que la escena acaba
export function songEvents(fam, tl, { onlyTrack = null } = {}) {
  const ev = [];
  const n = fam.steps;
  for (const sc of tl.scenes) {
    const steps = sc.bars * 16;
    sc.tracks.forEach((tr, t) => {
      if (onlyTrack != null && t !== onlyTrack) return;
      if (tr.key === 'off') return;
      const seq = tr.slots.map((sl) => fam.tracks[t][sl]);
      const len = seq.length * n;
      for (let k = 0; k < steps; k++) {
        const pat = seq[Math.floor((k % len) / n)];
        const st = pat[k % n];
        if (st) ev.push({ step: sc.start * 16 + k, t, v: st.v, n: st.n, sl: st.sl, p: st.p });
      }
    });
  }
  return ev.sort((a, b) => a.step - b.step || a.t - b.t);
}

export function energyCurve(tl) { return tl.sections.map((s) => ({ start: s.start, bars: s.bars, e: s.energy })); }

// ---------- proyecto .ncs (formato descrito por la comunidad; plantilla guardada por una Rhythm) ----------
const SC_BASE = 0x38, BLOCK = 0x2e4, BSIZE = 2600, TAIL = BLOCK + 64 * BSIZE;
export function writeProject(template, fam, tl, { name = 'Song', tempo = 128, swing = 50, kit = [], sampleMidi = [], color = 8 } = {}) {
  const d = new Uint8Array(template);
  if (String.fromCharCode(...d.subarray(0, 4)) !== 'RUSE' || d.length !== 169092) throw new Error('plantilla de proyecto no válida');
  d.set(new TextEncoder().encode(String(name).replace(/[^\x20-\x7e]/g, ' ').padEnd(32, ' ').slice(0, 32)), 0x10);
  new DataView(d.buffer).setUint32(0x0c, color % 14, true);
  d[0x34] = Math.max(40, Math.min(240, Math.round(tempo)));
  d[0x35] = Math.max(20, Math.min(80, Math.round(swing)));
  // escenas: una por copia (hasta 16), en orden; la cadena de escenas recorre la canción entera
  d.fill(0, SC_BASE + 1, SC_BASE + 684);
  const scenes = tl.scenes.slice(0, MAX_SCENES);
  scenes.forEach((s, i) => {
    const base = SC_BASE + i * 40;
    s.tracks.forEach((tr, t) => { d[base + 8 + t * 4] = tr.from; d[base + 9 + t * 4] = tr.to; });
    d[base + 40] = 1; d[base + 41] = 0;
  });
  d[SC_BASE + 648] = 0; d[SC_BASE + 649] = scenes.length - 1;
  scenes[0].tracks.forEach((tr, t) => { d[SC_BASE + 652 + t * 4] = tr.from; d[SC_BASE + 653 + t * 4] = tr.to; });
  // patrones: 8 por pista; el 8 (vacío) es el reloj de las escenas
  for (let t = 0; t < 8; t++) {
    const def = kit[t] == null ? 0 : kit[t];
    const [tEnd, tRate] = tl.timers ? timerPattern(tl.timers[t]) : [fam.steps - 1, 3];
    for (let sl = 0; sl < 8; sl++) {
      const o = BLOCK + (t * 8 + sl) * BSIZE;
      for (let s = 0; s < 32; s++) d.set([0, 6, 0, 0, 7, 0xff, 0, 0], o + s * 8);
      d.fill(0, o + 256, o + 296);
      d[o + 256] = sl === 7 ? tEnd : fam.steps - 1; d[o + 257] = 0; d[o + 258] = sl === 7 ? tRate : 3; d[o + 259] = 0;
      d.fill(0xff, o + 296, o + BSIZE);
      if (sl === 7) continue;
      fam.tracks[t][sl].forEach((st, s) => {
        if (!st || s >= 32) return;
        const note = st.n != null && (t === 5 || t === 6) ? noteFor(st.n, fam.root, sampleMidi[t]) : 60;
        const flip = st.sl != null && st.sl !== def ? st.sl : 0xff;
        d.set([note + 12, 6, 1, st.v, st.p != null ? st.p : 7, flip], o + s * 8);
      });
    }
    d[TAIL + 8 + t] = def;
    d[TAIL + 50 + t * 41] = def;
    d[TAIL + 50 + t * 41 + 10] = 64; // Tune al centro: las notas suenan a la altura escrita
  }
  return d;
}

// lectura de vuelta (para comprobar lo escrito)
const RATE_DIV = [16 / 3 / 2, 1 / 2, 2 / 3, 1, 4 / 3, 2, 8 / 3, 4]; // pasos de 1/16 por paso del patrón
export function readProject(d) {
  const name = String.fromCharCode(...d.subarray(0x10, 0x30)).trim();
  const chain = [d[SC_BASE + 648], d[SC_BASE + 649]];
  const scenes = [];
  for (let i = chain[0]; i <= chain[1]; i++) {
    const base = SC_BASE + i * 40;
    scenes.push(Array.from({ length: 8 }, (_, t) => [d[base + 8 + t * 4], d[base + 9 + t * 4]]));
  }
  const P = (t, sl) => BLOCK + (t * 8 + sl) * BSIZE;
  const pat = (t, sl) => Array.from({ length: d[P(t, sl) + 256] + 1 }, (_, s) => { const o = P(t, sl) + s * 8; return d[o] ? { note: d[o] - 12, v: d[o + 3], p: d[o + 4], sl: d[o + 5] } : null; });
  // duración real de un patrón en semicorcheas
  const patSteps = (t, sl) => (d[P(t, sl) + 256] - d[P(t, sl) + 257] + 1) * (RATE_DIV[d[P(t, sl) + 258]] || 1);
  const sceneBars = scenes.map((sc) => Math.max(...sc.map(([a, b], t) => { let x = 0; for (let k = a; k <= b; k++) x += patSteps(t, k); return x; })) / 16);
  return { name, tempo: d[0x34], swing: d[0x35], chain, scenes, sceneBars, defaults: Array.from(d.subarray(TAIL + 8, TAIL + 16)), pat, patSteps };
}

// Hoja de ruta: escena a escena, cuánto dura y qué cadena toca cada pista
export function roadmap(fam, tl, labels, bpm) {
  return tl.scenes.map((sc) => ({ scene: sc.n, id: sc.id, label: labels[sc.id] || sc.id, copy: sc.copy, of: sc.of, same: sc.same ?? null, end: !!sc.end, bars: sc.bars,
    sec: Math.round((sc.bars * 4 * 60) / bpm), tracks: sc.tracks.map((x, t) => (x.key === 'off' ? '·' : T[t])).join(''),
    chains: sc.tracks.map((x) => (x.key === 'off' ? (tl.timers ? '8⏱' : '') : x.from === x.to ? String(x.from + 1) : `${x.from + 1}–${x.to + 1}`)) }));
}

// Mezcla directa en JS (más rápida y estable que OfflineAudioContext con miles de voces).
// Pistas monofónicas como en la Rhythm: cada golpe corta el anterior de su pista con un fundido corto.
export function mixEvents(ev, bufOf, { kit, midi = [], root = 33, stepSec, swing = 50, sr = 48000, len, onlyTrack = null }) {
  const out = new Float32Array(len);
  const fade = Math.round(sr * 0.003);
  const byTrack = Array.from({ length: 8 }, () => []);
  for (const e of ev) if (onlyTrack == null || e.t === onlyTrack) byTrack[e.t].push(e);
  const atOf = (e) => Math.round((e.step * stepSec + (e.step % 2 ? (Math.max(0, swing - 50) / 50) * stepSec : 0)) * sr);
  byTrack.forEach((list, t) => {
    list.sort((a, b) => a.step - b.step);
    for (let k = 0; k < list.length; k++) {
      const e = list[k];
      const data = bufOf(e.sl != null ? e.sl : kit[t]); if (!data) continue;
      const rate = e.n != null && (t === TB || t === TS) ? Math.pow(2, (noteFor(e.n, root, midi[t]) - 60) / 12) : 1;
      const g = 0.75 * Math.pow(e.v / 127, 1.4);
      const start = atOf(e);
      const cut = k + 1 < list.length ? atOf(list[k + 1]) : len;
      const end = Math.min(len, cut, start + Math.floor((data.length - 1) / rate));
      for (let i = start; i < end; i++) {
        const x = (i - start) * rate, i0 = x | 0, f = x - i0;
        let v = data[i0] + (data[i0 + 1] - data[i0]) * f;
        if (end === cut && cut - i < fade) v *= (cut - i) / fade;
        out[i] += v * g;
      }
    }
  });
  return out;
}
