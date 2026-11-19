// Generador de patrones de prueba para escuchar patches.
// Un patrón es una secuencia de semicorcheas (t = paso) con notas MIDI absolutas y, opcionalmente,
// un carril de macro (CC 80–87). Es determinista: misma semilla y ajustes → mismo patrón.
// Exporta a MIDI estándar (SMF tipo 0) para Ableton u otro DAW.

export const NOTE_NAMES_ES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
// Convención de Ableton: 60 = Do3.
export const noteName = (n) => `${NOTE_NAMES_ES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 2}`;

// Las 16 escalas del Circuit Tracks, en el orden de Scale View (pads 17–32). Fuente: guía de usuario de Novation.
// Las notas que llegan por MIDI fuera de la escala del proyecto se ajustan a la más cercana, así que conviene que coincidan.
export const SCALES = {
  minor: { label: 'Menor natural', ct: 'Natural Minor', pad: 17, iv: [0, 2, 3, 5, 7, 8, 10] },
  major: { label: 'Mayor', ct: 'Major', pad: 18, iv: [0, 2, 4, 5, 7, 9, 11] },
  dorian: { label: 'Dórico', ct: 'Dorian', pad: 19, iv: [0, 2, 3, 5, 7, 9, 10] },
  phrygian: { label: 'Frigio', ct: 'Phrygian', pad: 20, iv: [0, 1, 3, 5, 7, 8, 10] },
  mixolydian: { label: 'Mixolidio', ct: 'Mixolydian', pad: 21, iv: [0, 2, 4, 5, 7, 9, 10] },
  melodic: { label: 'Menor melódica', ct: 'Melodic Minor', pad: 22, iv: [0, 2, 3, 5, 7, 9, 11] },
  harmonic: { label: 'Menor armónica', ct: 'Harmonic Minor', pad: 23, iv: [0, 2, 3, 5, 7, 8, 11] },
  bebopDorian: { label: 'Bebop dórico', ct: 'Bebop Dorian', pad: 24, iv: [0, 2, 3, 4, 5, 7, 9, 10] },
  blues: { label: 'Blues', ct: 'Blues', pad: 25, iv: [0, 3, 5, 6, 7, 10] },
  pentaMinor: { label: 'Pentatónica menor', ct: 'Minor Pentatonic', pad: 26, iv: [0, 3, 5, 7, 10] },
  hungarian: { label: 'Húngara menor', ct: 'Hungarian Minor', pad: 27, iv: [0, 2, 3, 6, 7, 8, 11] },
  ukrainian: { label: 'Dórica ucraniana', ct: 'Ukrainian Dorian', pad: 28, iv: [0, 2, 3, 6, 7, 9, 10] },
  marva: { label: 'Marva', ct: 'Marva', pad: 29, iv: [0, 1, 4, 6, 7, 9, 11] },
  todi: { label: 'Todi', ct: 'Todi', pad: 30, iv: [0, 1, 3, 6, 7, 8, 11] },
  wholeTone: { label: 'Tonos enteros', ct: 'Whole Tone', pad: 31, iv: [0, 2, 4, 6, 8, 10] },
  chromatic: { label: 'Cromática', ct: 'Chromatic', pad: 32, iv: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }
};

export const STYLES = {
  offbeat: { label: 'Bajo en contratiempo', oct: 36, gate: 0.5, density: 0.35, desc: 'Notas en el «y» de cada tiempo, algún adorno.' },
  rolling: { label: 'Bajo rodante', oct: 36, gate: 0.55, density: 0.85, desc: 'Semicorcheas que esquivan el bombo (2, 3 y 4 de cada tiempo).' },
  acid: { label: 'Acid (ligados y acentos)', oct: 36, gate: 0.6, density: 0.75, accent: 0.3, slide: 0.25, desc: 'Línea tipo 303: saltos de octava, acentos y notas ligadas.' },
  sub: { label: 'Sub largo', oct: 36, gate: 0.95, density: 0.3, desc: 'Notas largas para medir graves y cola.' },
  arp: { label: 'Arpegio', oct: 60, gate: 0.6, density: 1, desc: 'Notas del acorde; cada variación cambia modo (sube, baja, aleatorio, convergente…), acorde, progresión, rango y ritmo.' },
  stab: { label: 'Stabs de acorde', oct: 48, gate: 0.35, density: 0.4, desc: 'Acordes cortos sincopados; cambian ritmo, progresión e inversión.' },
  chords: { label: 'Progresión de acordes', oct: 48, gate: 0.9, density: 1, desc: 'Progresión en menor con ritmo e inversión que cambian en cada variación.' },
  pad: { label: 'Pad sostenido', oct: 48, gate: 1, density: 1, desc: 'Acordes largos para oír ataque, cola y movimiento; a veces con una nota de color arriba.' },
  lead: { label: 'Motivo melódico', oct: 60, gate: 0.7, density: 0.5, desc: 'Frase corta que se repite con variación.' },
  perc: { label: 'Golpes', oct: 48, gate: 0.25, density: 0.4, accent: 0.25, desc: 'Ritmo euclidiano sobre una nota.' },
  drone: { label: 'Drone / FX', oct: 48, gate: 1, density: 1, desc: 'Nota sostenida (sola, con quinta u octava, que se mueve o que repite): para FX, texturas y macros.' },
  random: { label: 'Aleatorio en escala', oct: 48, gate: 0.6, density: 0.5, desc: 'Notas al azar dentro de la escala.' }
};
export const STYLE_FOR_CAT = { bass: 'offbeat', lead: 'lead', pad: 'pad', chords: 'chords', keys: 'chords', stab: 'stab', pluck: 'arp', arp: 'arp', sequence: 'arp', perc: 'perc', fx: 'drone', drone: 'drone', transition: 'drone', brass: 'lead', strings: 'pad', bell: 'arp' };
export const MACRO_SHAPES = { none: 'Sin carril de macro', rise: 'Sube', fall: 'Baja', triangle: 'Sube y baja', sine: 'Onda (1 ciclo por compás)', random: 'Aleatoria por tiempo' };

// Progresiones (grados de la escala) típicas en menor; la semilla elige una.
const PROGS = [[0], [0, 5], [0, 3], [0, 5, 6, 4], [0, 6, 5, 6], [0, 2, 5, 4], [0, 3, 4, 0], [0, 5, 2, 6], [0, 0, 5, 6]];
export function arpOrder(tones, mode, r = Math.random) {
  const up = [...tones].sort((a, b) => a - b), down = [...up].reverse();
  switch (mode) {
    case 'down': return down;
    case 'updown': return up.length > 2 ? [...up, ...down.slice(1, -1)] : up;
    case 'downup': return down.length > 2 ? [...down, ...up.slice(1, -1)] : down;
    case 'random': { const a = [...up]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    case 'converge': { const out = []; let i = 0, j = up.length - 1; while (i <= j) { out.push(up[i++]); if (i <= j) out.push(up[j--]); } return out; }
    case 'pinky': return up.slice(1).flatMap((x) => [up[0], x]);
    case 'leap': return up.flatMap((x, i) => (i % 2 ? [x + 12] : [x]));
    default: return up;
  }
}
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function euclid(k, n, rot = 0) {
  const out = []; let b = 0;
  for (let i = 0; i < n; i++) { const prev = b; b = Math.floor(((i + 1) * k) / n); out.push(b > prev); }
  return out.map((_, i) => out[(i + rot + n) % n]);
}

export const DEFAULTS = { style: 'offbeat', root: 0, scale: 'minor', octave: null, steps: 16, tempo: 124, swing: 0, density: null, accent: null, slide: null, gate: null, seed: 1, vel: [88, 118], macro: { knob: -1, shape: 'none', lo: 0, hi: 127 } };

export function generatePattern(opts = {}) {
  const o = { ...DEFAULTS, ...opts, macro: { ...DEFAULTS.macro, ...(opts.macro || {}) } };
  const st = STYLES[o.style] || STYLES.offbeat;
  const dens = o.density ?? st.density, acc = o.accent ?? st.accent ?? 0.15, sl = o.slide ?? st.slide ?? 0, gate = o.gate ?? st.gate;
  const base = (o.octave ?? st.oct) + o.root, iv = (SCALES[o.scale] || SCALES.minor).iv, L = iv.length, N = o.steps, r = rng(o.seed);
  const deg = (d) => base + iv[((d % L) + L) % L] + 12 * Math.floor(d / L);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const vel = (a = false) => (a ? 127 : Math.round(o.vel[0] + r() * (o.vel[1] - o.vel[0]) * 0.6));
  const notes = [], add = (t, n, d, v, extra = {}) => { if (t < N && n >= 0 && n <= 127) notes.push({ t, n, d: Math.max(0.25, Math.min(d, N - t)), v, ...extra }); };
  const triad = (d, size = 3) => [0, 2, 4, 6].slice(0, size).map((x) => deg(d + x));
  // acorde por terceras de la escala, con inversión (la nota más grave sube una octava)
  const voicing = (d, size, inv) => { const ns = [0, 2, 4, 6].slice(0, size).map((x) => deg(d + x)); for (let i = 0; i < inv % size; i++) ns.push(ns.shift() + 12); return ns; };
  const fifth = Math.max(0, iv.indexOf(7)), seventh = L >= 7 ? 6 : L - 1;
  switch (o.style) {
    case 'offbeat': for (let t = 0; t < N; t++) { if (t % 4 === 2) add(t, r() < 0.8 ? deg(0) : pick([deg(L), deg(fifth)]), gate, vel(r() < acc)); else if (t % 4 !== 0 && r() < dens * 0.35) add(t, pick([deg(0), deg(0), deg(seventh - L), deg(L)]), gate * 0.8, vel()); } break;
    case 'rolling': for (let t = 0; t < N; t++) { if (t % 4 === 0) continue; if (r() < dens) add(t, r() < 0.75 ? deg(0) : pick([deg(L), deg(fifth), deg(2)]), gate, vel(t % 4 === 2 && r() < acc + 0.2)); } break;
    case 'acid': { let prev = null; for (let t = 0; t < N; t++) { if (r() > dens) { prev = null; continue; } const n = pick([0, 0, 0, 2, fifth, seventh, L].map(deg)) + (r() < 0.22 ? 12 : 0); const slide = prev !== null && r() < sl; if (slide) prev.d = 1.05, prev.slide = true; const e = { t, n, d: gate, v: vel(r() < acc) }; if (e.v === 127) e.acc = true; notes.push(e); prev = e; } break; }
    case 'sub': { let t = 0; while (t < N) { const len = r() < 0.6 ? 8 : 4; add(t, r() < 0.7 ? deg(0) : pick([deg(seventh - L), deg(fifth - L)]), len * gate, vel()); t += len; } break; }
    case 'arp': {
      // La semilla elige progresión, forma del acorde, modo del arpegio, rango, ritmo y acentos.
      const prog = pick(PROGS), shape = pick([[0, 2, 4], [0, 2, 4, 6], [0, 2, 4, L], [0, 4, L, L + 2], [0, 1, 4], [0, 2, 6]]);
      const mode = pick(['up', 'down', 'updown', 'downup', 'random', 'converge', 'pinky', 'leap']), span = pick([1, 1, 2, 2, 3]);
      const rate = pick([1, 1, 1, 2]), gaps = r() < 0.35 ? euclid(Math.max(3, Math.round(N / rate * (0.55 + dens * 0.35))), Math.ceil(N / rate), Math.floor(r() * 8)) : null;
      const accEvery = pick([3, 4, 4, 6, 8]);
      let k = 0;
      for (let t = 0; t < N; t += rate) {
        const chord = prog[Math.floor(t / 16) % prog.length];
        const tones = []; for (let o = 0; o < span; o++) for (const x of shape) tones.push(deg(chord + x + o * L));
        const seq = arpOrder(tones, mode, r);
        const on = gaps ? gaps[(t / rate) % gaps.length] : r() < Math.max(dens, 0.55);
        if (on) add(t, seq[k % seq.length], gate * rate, vel(k % accEvery === 0 && r() < acc + 0.5));
        k++;
      }
      break;
    }
    case 'stab': {
      const prog = pick(PROGS), k0 = Math.max(2, Math.round(dens * 8 * (N / 16)) + Math.floor(r() * 3) - 1), hits = euclid(k0, N, Math.floor(r() * N)), size = pick([3, 4]), inv = Math.floor(r() * 3);
      hits.forEach((h, t) => { if (h) voicing(prog[Math.floor(t / 16) % prog.length], size, inv).forEach((n) => add(t, n, gate * 2, vel(r() < acc))); });
      break;
    }
    case 'chords': {
      const prog = pick(PROGS), size = pick([3, 4, 4]), inv = Math.floor(r() * 3);
      const rhythm = pick([[[0, 16]], [[0, 8], [8, 8]], [[0, 6], [6, 4], [10, 6]], [[0, 3], [3, 5], [8, 8]], [[0, 12], [12, 4]]]);
      let ci = 0;
      for (let b = 0; b * 16 < N; b++) for (const [o, len] of rhythm) { const d = prog[ci++ % prog.length]; voicing(d, size, inv).forEach((n) => add(b * 16 + o, n, len * gate, 96)); }
      break;
    }
    case 'pad': {
      const prog = pick(PROGS), per = pick(N >= 32 ? [16, N / 2, N] : [8, 16]), size = pick([3, 4]), inv = Math.floor(r() * 3);
      for (let t = 0, i = 0; t < N; t += per, i++) voicing(prog[i % prog.length], size, inv).forEach((n) => add(t, n, per * gate, 88 + Math.floor(r() * 10)));
      if (r() < 0.5) { const top = deg(L + pick([4, 6, L])); add(Math.floor(N / 2), top, (N / 2) * gate, 80); } // nota de color arriba a mitad
      break;
    }
    case 'lead': { const motif = []; let t = 0; while (t < 8) { const len = pick([1, 1, 2, 2, 3]); motif.push({ t, d: pick([0, 2, 4, fifth, seventh, L, L + 2]), len }); t += len; } for (let rep = 0; rep * 8 < N; rep++) for (const m of motif) { const varied = rep % 2 === 1 && r() < 0.4 ? m.d + pick([-1, 1, 2]) : m.d; if (r() < 0.5 + dens / 2) add(rep * 8 + m.t, deg(varied), m.len * gate, vel(m.t === 0)); } break; }
    case 'perc': { const hits = euclid(Math.max(2, Math.round(dens * N * 0.6)), N, Math.floor(r() * N)); hits.forEach((h, t) => { if (h) add(t, r() < 0.8 ? deg(0) : deg(L), gate, vel(r() < acc)); }); break; }
    case 'drone': {
      const v = pick(['root', 'fifth', 'octave', 'move', 'pulse']);
      if (v === 'pulse') { const every = pick([4, 8, 16]); for (let t = 0; t < N; t += every) add(t, deg(0), every * 0.95, 100); }
      else if (v === 'move') { add(0, deg(0), N / 2, 100); add(N / 2, deg(pick([seventh - L, 5 - L, 2])), N / 2, 100); }
      else { add(0, deg(0), N, 100); if (v === 'fifth') add(0, deg(fifth), N, 90); if (v === 'octave') add(0, deg(L), N, 90); }
      break;
    }
    default: for (let t = 0; t < N; t++) if (r() < dens) add(t, deg(Math.floor(r() * L * 2)), gate, vel(r() < acc));
  }
  notes.sort((a, b) => a.t - b.t || a.n - b.n);
  const cc = macroLane(o.macro, N, r);
  return { v: 1, name: o.name || `${st.label} · ${NOTE_NAMES_ES[o.root]} ${(SCALES[o.scale] || SCALES.minor).label.toLowerCase()}`, style: o.style, root: o.root, scale: o.scale, octave: o.octave ?? st.oct, steps: N, tempo: o.tempo, swing: o.swing, seed: o.seed, density: dens, accent: acc, slide: sl, gate, macro: o.macro, notes, cc };
}

export function macroLane(m, N, r = Math.random) {
  if (!m || m.knob < 0 || m.shape === 'none') return [];
  const out = [], lo = Math.min(m.lo, m.hi), hi = Math.max(m.lo, m.hi), span = hi - lo;
  let hold = lo;
  for (let t = 0; t < N; t++) {
    const x = N > 1 ? t / (N - 1) : 0;
    let v = m.shape === 'rise' ? lo + span * x : m.shape === 'fall' ? hi - span * x : m.shape === 'triangle' ? lo + span * (1 - Math.abs(2 * x - 1)) : m.shape === 'sine' ? lo + span * (0.5 - 0.5 * Math.cos(2 * Math.PI * (t / 16))) : (t % 4 === 0 ? (hold = lo + span * r()) : hold);
    out.push({ t, num: 80 + m.knob, v: Math.round(v) });
  }
  return out;
}

// Cambia una celda de la rejilla: si hay nota que empieza en (t, n), la quita; si no, la añade.
export function toggleNote(pat, t, n, opts = {}) {
  const i = pat.notes.findIndex((e) => e.t === t && e.n === n);
  const notes = pat.notes.slice();
  if (i >= 0) {
    if (opts.accent) notes[i] = { ...notes[i], v: notes[i].v >= 120 ? 96 : 127, acc: !(notes[i].v >= 120) };
    else if (opts.slide) notes[i] = { ...notes[i], d: notes[i].slide ? pat.gate ?? 0.6 : 1.05, slide: !notes[i].slide };
    else notes.splice(i, 1);
  } else if (!opts.accent && !opts.slide) notes.push({ t, n, d: pat.gate ?? 0.6, v: 100 });
  notes.sort((a, b) => a.t - b.t || a.n - b.n);
  return { ...pat, notes, edited: true };
}

// Tiempo (en pasos) con swing aplicado a las semicorcheas pares (2.ª de cada corchea).
export const swungStep = (t, swing = 0) => t + (Math.floor(t) % 2 === 1 ? swing : 0);

// Frase reproducible por la sesión MIDI (mismo formato que las frases de prueba).
export function patternToPhrase(p) {
  return { label: p.name, base: 0, notes: p.notes, cc: p.cc || [], swing: p.swing || 0, steps: p.steps, tail: 600, custom: true, pattern: true };
}

// ---- MIDI estándar (SMF tipo 0) ----
const vlq = (n) => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
const str = (s) => [...new TextEncoder().encode(s)];
export function patternToMidi(p0, { channel = 0, ppq = 96, name, drumNotes } = {}) {
  const p = p0.kind === 'drum' ? { ...p0, notes: p0.notes.map((e) => ({ ...e, n: (drumNotes || DRUM_NOTES)[e.lane] })) } : p0;
  const q = ppq / 4, ev = [];
  const tick = (t) => Math.round(swungStep(t, p.swing || 0) * q);
  const sorted = [...p.notes].sort((a, b) => a.t - b.t || a.n - b.n);
  sorted.forEach((e, i) => {
    const on = tick(e.t); let off = Math.max(on + 1, Math.round(on + e.d * q));
    // una nota ligada a otra de la misma altura se corta justo donde empieza la siguiente (si no, el MIDI queda ambiguo)
    const nx = sorted.slice(i + 1).find((x) => x.n === e.n); if (nx) off = Math.min(off, tick(nx.t));
    ev.push([on, 1, [0x90 | channel, e.n, Math.max(1, Math.min(127, e.v ?? 100))]]); ev.push([Math.max(on + 1, off), 0, [0x80 | channel, e.n, 0]]);
  });
  for (const c of p.cc || []) ev.push([tick(c.t), 2, [0xb0 | channel, c.num, Math.max(0, Math.min(127, c.v))]]);
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const usPerQ = Math.round(60000000 / (p.tempo || 124));
  const track = [
    ...vlq(0), 0xff, 0x03, ...vlq(str(name || p.name).length), ...str(name || p.name),
    ...vlq(0), 0xff, 0x51, 0x03, (usPerQ >> 16) & 255, (usPerQ >> 8) & 255, usPerQ & 255,
    ...vlq(0), 0xff, 0x58, 0x04, 4, 2, 24, 8
  ];
  let last = 0;
  for (const [t, , bytes] of ev) { track.push(...vlq(t - last), ...bytes); last = t; }
  const endT = Math.max(last, p.steps * q);
  track.push(...vlq(endT - last), 0xff, 0x2f, 0x00);
  const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return new Uint8Array([0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, 0, 0, 1, (ppq >> 8) & 255, ppq & 255, 0x4d, 0x54, 0x72, 0x6b, ...u32(track.length), ...track]);
}

// Lectura mínima de un SMF (para pruebas y para reimportar un .mid exportado).
export function readMidiNotes(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.slice(0, 4)) !== 'MThd') throw new Error('No es un archivo MIDI');
  const ppq = dv.getUint16(12); let p = 14; const notes = [], cc = []; let tempo = 120;
  while (p < bytes.length) {
    const id = String.fromCharCode(...bytes.slice(p, p + 4)), len = dv.getUint32(p + 4); p += 8;
    if (id !== 'MTrk') { p += len; continue; }
    const end = p + len; let t = 0, rs = 0; const open = new Map();
    while (p < end) {
      let d = 0, b; do { b = bytes[p++]; d = (d << 7) | (b & 0x7f); } while (b & 0x80); t += d;
      let st = bytes[p]; if (st < 0x80) st = rs; else p++;
      if (st === 0xff) { const ty = bytes[p++]; let l = 0; do { b = bytes[p++]; l = (l << 7) | (b & 0x7f); } while (b & 0x80); if (ty === 0x51) tempo = Math.round(60000000 / ((bytes[p] << 16) | (bytes[p + 1] << 8) | bytes[p + 2])); p += l; continue; }
      rs = st; const hi = st & 0xf0, a = bytes[p++], c = hi === 0xc0 || hi === 0xd0 ? 0 : bytes[p++];
      if (hi === 0x90 && c > 0) open.set(a, { t, v: c });
      else if (hi === 0x80 || (hi === 0x90 && c === 0)) { const o = open.get(a); if (o) { notes.push({ tick: o.t, n: a, len: t - o.t, v: o.v }); open.delete(a); } }
      else if (hi === 0xb0) cc.push({ tick: t, num: a, v: c });
    }
  }
  return { ppq, tempo, notes: notes.sort((x, y) => x.tick - y.tick || x.n - y.n), cc };
}

// =====================================================================
// Destinos en el Circuit Tracks y batería
// Canales por defecto: Synth 1 → 1, Synth 2 → 2, MIDI 1 → 3, MIDI 2 → 4, las cuatro baterías → 10
// (se cambian en Setup View). Notas de batería según la guía de programación: Drum 1–4 = 60, 62, 64, 65.
// =====================================================================
export const DESTS = {
  synth1: { label: 'Synth 1', ch: 0, kind: 'synth' },
  synth2: { label: 'Synth 2', ch: 1, kind: 'synth' },
  midi1: { label: 'MIDI 1', ch: 2, kind: 'midi' },
  midi2: { label: 'MIDI 2', ch: 3, kind: 'midi' },
  drums: { label: 'Drum 1–4', ch: 9, kind: 'drum' }
};
export const DRUM_NOTES = [60, 62, 64, 65];
export const GM_DRUM_NOTES = [36, 38, 42, 46]; // para un Drum Rack / batería GM en Ableton
export const DRUM_ROLES = ['Bombo', 'Caja / palmas', 'Charles cerrado', 'Percusión / abierto'];

export const DRUM_STYLES = {
  techno: { label: 'Techno 4/4', tempo: 130, desc: 'Bombo a negras, charles en contratiempo, palmas opcionales y percusión euclidiana.' },
  rumble: { label: 'Techno oscuro (rumble)', tempo: 132, desc: 'Bombo a negras con golpes fantasma rodantes, charles en semicorcheas con acento.' },
  house: { label: 'House', tempo: 124, desc: 'Bombo a negras, palmas en 2 y 4, charles en semicorcheas y abierto en contratiempo.' },
  minimal: { label: 'Minimal', tempo: 126, desc: 'Bombo a negras seco, rimshots y percusión euclidiana escasos: mucho aire.' },
  breakbeat: { label: 'Breakbeat', tempo: 130, desc: 'Bombo sincopado, caja en 2 y 4 con fantasmas, charles a corcheas.' },
  electro: { label: 'Electro', tempo: 128, desc: 'Bombo sincopado tipo 808, caja en 2 y 4, charles en semicorcheas acentuadas.' },
  industrial: { label: 'Industrial / EBM', tempo: 128, desc: 'Bombo martilleante con empujes, caja pesada y percusión metálica 7/16.' },
  halftime: { label: 'Medio tiempo', tempo: 140, desc: 'Caja en el 3, bombo disperso: sensación lenta a tempo alto.' },
  euclid: { label: 'Euclidiano', tempo: 124, desc: 'Cada carril reparte sus golpes de forma euclidiana con rotación al azar.' }
};
export const DRUM_DEFAULTS = { style: 'techno', steps: 16, tempo: null, swing: 0, density: 0.5, fill: true, humanize: 0.15, seed: 1, lanes: [true, true, true, true] };

export function generateDrums(opts = {}) {
  const o = { ...DRUM_DEFAULTS, ...opts }, st = DRUM_STYLES[o.style] || DRUM_STYLES.techno, r = rng(o.seed), N = o.steps, dens = o.density;
  const hits = new Map(), vel = (base) => Math.max(1, Math.min(127, Math.round(base + (r() - 0.5) * 2 * o.humanize * 40)));
  const hit = (lane, t, v = 100) => { if (t >= 0 && t < N) hits.set(lane + ':' + t, { t, lane, n: DRUM_NOTES[lane], d: 0.5, v: vel(v) }); };
  const pick = (a) => a[Math.floor(r() * a.length)], P = (x) => r() < x;
  const kickVar = pick([0, 1, 2]), percK = 3 + Math.floor(r() * 3), percRot = Math.floor(r() * 16), hatVar = pick([0, 1, 2]);
  for (let bar = 0; bar * 16 < N; bar++) {
    const B = bar * 16, last = (bar + 1) * 16 >= N && o.fill && N >= 16;
    const each = (f) => { for (let i = 0; i < 16; i++) f(i, B + i); };
    switch (o.style) {
      case 'rumble':
        each((i, t) => { if (i % 4 === 0) hit(0, t, 120); else if (i % 4 !== 1 && P(0.35 + dens * 0.4)) hit(0, t, 45 + r() * 20); });
        each((i, t) => hit(2, t, i % 4 === 2 ? 110 : hatVar === 0 ? 55 : 70));
        each((i, t) => { if (i % 4 === 2 && P(0.3 + dens * 0.3)) hit(3, t, 85); });
        if (P(dens * 0.6)) { hit(1, B + 4, 90); hit(1, B + 12, 90); }
        break;
      case 'house':
        each((i, t) => { if (i % 4 === 0) hit(0, t, 118); });
        hit(1, B + 4, 112); hit(1, B + 12, 112); if (P(dens * 0.4)) hit(1, B + 15, 70);
        each((i, t) => { if (hatVar === 2 ? i % 2 === 0 : true) hit(2, t, i % 2 ? 72 : 96); });
        each((i, t) => { if (i % 4 === 2) hit(3, t, 100); });
        break;
      case 'minimal':
        each((i, t) => { if (i % 4 === 0) hit(0, t, i === 0 ? 120 : 108); }); if (P(dens * 0.4)) hit(0, B + pick([7, 11, 15]), 70); // minimal techno: 4/4 seco, el aire está en lo demás
        euclid(2 + Math.floor(dens * 3), 16, percRot).forEach((h, i) => { if (h) hit(1, B + i, 80); });
        each((i, t) => { if (i % 4 === 2 || (P(dens * 0.3) && i % 2 === 1)) hit(2, t, i % 4 === 2 ? 95 : 60); });
        euclid(percK + 2, 16, (percRot + 3) % 16).forEach((h, i) => { if (h && P(0.5 + dens / 2)) hit(3, B + i, 75); });
        break;
      case 'breakbeat': {
        const K = [[0, 10], [0, 6, 10], [0, 3, 10], [0, 7, 10, 13]][kickVar + (P(0.3) ? 1 : 0)] || [0, 10];
        K.forEach((t) => hit(0, B + t, 118)); hit(1, B + 4, 115); hit(1, B + 12, 115);
        [7, 9, 15].forEach((t) => { if (P(dens * 0.6)) hit(1, B + t, 50); });
        each((i, t) => { if (i % 2 === 0) hit(2, t, i % 4 === 0 ? 90 : 75); });
        if (P(dens)) hit(3, B + pick([2, 6, 14]), 90);
        break;
      }
      case 'electro': {
        const K = [[0, 6, 10], [0, 3, 6, 11], [0, 7, 10]][kickVar];
        K.forEach((t) => hit(0, B + t, 120)); hit(1, B + 4, 115); hit(1, B + 12, 115);
        each((i, t) => hit(2, t, i % 4 === 2 ? 108 : 62));
        euclid(percK, 16, percRot).forEach((h, i) => { if (h && P(0.5 + dens / 2)) hit(3, B + i, 88); });
        break;
      }
      case 'industrial':
        each((i, t) => { if (i % 4 === 0) hit(0, t, 125); });
        if (P(0.5 + dens / 2)) hit(0, B + 14, 100); if (P(dens)) hit(0, B + 15, 90);
        hit(1, B + 4, 125); hit(1, B + 12, 125);
        each((i, t) => { if (i % 2 === 0) hit(2, t, i % 4 === 2 ? 110 : 80); });
        euclid(7, 16, percRot).forEach((h, i) => { if (h) hit(3, B + i, 95); });
        break;
      case 'halftime':
        hit(0, B, 120); if (P(0.6)) hit(0, B + pick([10, 11, 14]), 105); if (P(dens * 0.5)) hit(0, B + 6, 90);
        hit(1, B + 8, 120);
        each((i, t) => { if (i % 2 === 0) hit(2, t, i % 4 === 0 ? 92 : 70); });
        if (P(dens)) hit(3, B + pick([3, 7, 13]), 85);
        break;
      case 'euclid':
        [[2, 6, 120], [1, 5, 105], [5, 12, 85], [2, 9, 85]].forEach(([lane, k, v], lane0) => { const kk = Math.max(1, Math.round(k * (0.5 + dens))); const e0 = euclid(Math.min(15, kk), 16, 0), rot = lane0 === 0 ? 0 : Math.floor(r() * 16); if (lane0 === 0 && !e0[0]) e0.unshift(e0.pop()); (lane0 === 0 ? e0 : euclid(Math.min(15, kk), 16, rot)).forEach((h, i) => { if (h) hit(lane0, B + i, v); }); });
        break;
      default: // techno
        each((i, t) => { if (i % 4 === 0) hit(0, t, 122); });
        if (P(0.4 + dens * 0.4)) { hit(1, B + 4, 105); hit(1, B + 12, 105); }
        each((i, t) => { if (i % 4 === 2) hit(2, t, 108); else if (hatVar && P(dens * 0.6) && i % 2 === 1) hit(2, t, 58); });
        euclid(percK, 16, percRot).forEach((h, i) => { if (h && P(0.4 + dens / 2)) hit(3, B + i, 82); });
    }
    if (last) { // remate en los últimos 4 pasos
      const f = pick(['roll', 'kick', 'open', 'none']);
      if (f === 'roll') for (let i = 12; i < 16; i++) hit(1, B + i, 60 + (i - 12) * 18);
      if (f === 'kick') { hit(0, B + 14, 100); hit(0, B + 15, 90); }
      if (f === 'open') hit(3, B + 14, 110);
    }
  }
  const notes = [...hits.values()].filter((e) => o.lanes[e.lane] !== false).sort((a, b) => a.t - b.t || a.lane - b.lane);
  return { v: 1, kind: 'drum', name: o.name || `${st.label} · ${N} pasos`, style: o.style, steps: N, tempo: o.tempo ?? st.tempo, swing: o.swing, seed: o.seed, density: dens, notes, cc: [] };
}
// Rejilla de batería: clic pone/quita; Mayús = acento; Alt = golpe fantasma.
export function toggleDrum(pat, lane, t, { accent = false, ghost = false } = {}) {
  const i = pat.notes.findIndex((e) => e.lane === lane && e.t === t), notes = pat.notes.slice();
  if (i >= 0) {
    if (accent) notes[i] = { ...notes[i], v: notes[i].v >= 120 ? 100 : 127 };
    else if (ghost) notes[i] = { ...notes[i], v: notes[i].v <= 60 ? 100 : 50 };
    else notes.splice(i, 1);
  } else notes.push({ t, lane, n: DRUM_NOTES[lane], d: 0.5, v: accent ? 127 : ghost ? 50 : 100 });
  notes.sort((a, b) => a.t - b.t || a.lane - b.lane);
  return { ...pat, notes, edited: true };
}
// Eventos listos para enviar: canal y nota según el destino (y el mapa de notas de batería que uses).
export function patternEvents(pat, { channel = 0, drumChannel = 9, drumNotes = DRUM_NOTES, lanes = [true, true, true, true], steps } = {}) {
  const N = steps ?? pat.steps;
  if (pat.kind === 'drum') return { events: pat.notes.filter((e) => lanes[e.lane] !== false && e.t < N).map((e) => ({ ...e, n: drumNotes[e.lane], ch: drumChannel })), ccs: [] };
  return { events: pat.notes.filter((e) => e.t < N).map((e) => ({ ...e, ch: channel })), ccs: (pat.cc || []).filter((c) => c.t < N).map((c) => ({ ...c, ch: channel })) };
}
// Recorta o repite un patrón para que ocupe exactamente N pasos (16 o 32 en el Circuit).
export function fitSteps(pat, N) {
  if (pat.steps === N) return pat;
  if (pat.steps > N) return { ...pat, steps: N, notes: pat.notes.filter((e) => e.t < N).map((e) => ({ ...e, d: Math.min(e.d, N - e.t) })), cc: (pat.cc || []).filter((c) => c.t < N) };
  const reps = Math.ceil(N / pat.steps), notes = [], cc = [];
  for (let k = 0; k < reps; k++) { for (const e of pat.notes) if (e.t + k * pat.steps < N) notes.push({ ...e, t: e.t + k * pat.steps }); for (const c of pat.cc || []) if (c.t + k * pat.steps < N) cc.push({ ...c, t: c.t + k * pat.steps }); }
  return { ...pat, steps: N, notes, cc };
}

// Notas del patrón que el Circuit movería si su proyecto está en esta escala y tónica.
export function outOfScale(pat, scale = pat.scale, root = pat.root) {
  if (pat.kind === 'drum') return [];
  const iv = (SCALES[scale] || SCALES.minor).iv;
  return pat.notes.filter((e) => !iv.includes((((e.n - root) % 12) + 12) % 12));
}
// Swing del Circuit (Tempo View, Macro 2: 20–80, 50 = recto). Aproximación: la semicorchea par se retrasa
// s pasos, así que cae en (1 + s) / 2 de la corchea.
export const circuitSwing = (s) => Math.max(20, Math.min(80, Math.round(50 + 50 * (s || 0))));
// Gate máximo que guarda un paso del Circuit: 16 pasos (96 sextos de paso).
export const MAX_GATE = 16;
// Variación de un patrón: mismo carácter, algunos cambios. Para rellenar los 8 patrones de una pista.
export function varyPattern(pat, { amount = 0.25, seed = 1 } = {}) {
  const r = rng(seed * 7919 + 13), N = pat.steps, a = Math.max(0, Math.min(1, amount));
  if (pat.kind === 'drum') {
    const hits = new Map(pat.notes.map((e) => [e.lane + ':' + e.t, e]));
    for (let lane = 1; lane < 4; lane++) for (let t = 0; t < N; t++) {
      const k = lane + ':' + t, e = hits.get(k);
      if (e && r() < a * 0.45) hits.delete(k);
      else if (!e && r() < a * (lane === 2 ? 0.22 : 0.12)) hits.set(k, { t, lane, n: DRUM_NOTES[lane], d: 0.5, v: 64 + Math.floor(r() * 50) });
    }
    if (r() < a * 0.5) { const t = N - 1 - Math.floor(r() * 3), k = '0:' + t; if (!hits.has(k)) hits.set(k, { t, lane: 0, n: DRUM_NOTES[0], d: 0.5, v: 96 }); }
    return { ...pat, name: pat.name.replace(/ · var \d+$/, '') + ' · var ' + seed, notes: [...hits.values()].sort((x, y) => x.t - y.t || x.lane - y.lane), edited: true };
  }
  const iv = (SCALES[pat.scale] || SCALES.minor).iv, root = pat.root ?? 0;
  const inS = (n) => iv.includes((((n - root) % 12) + 12) % 12);
  const stepTo = (n, dir) => { let m = n + dir; while (!inS(m)) m += dir; return m; };
  const used = new Set(pat.notes.map((e) => e.t));
  let notes = [];
  for (const e of pat.notes) {
    const x = r();
    if (x < a * 0.35) notes.push({ ...e, n: stepTo(e.n, r() < 0.5 ? -1 : 1) });
    else if (x < a * 0.55 && pat.notes.length > 4) continue;
    else if (x < a * 0.7 && !used.has(e.t + 1) && e.t + 1 < N) { used.delete(e.t); used.add(e.t + 1); notes.push({ ...e, t: e.t + 1, d: Math.min(e.d, N - e.t - 1) }); }
    else if (x < a * 0.8) notes.push({ ...e, n: e.n + (r() < 0.5 ? 12 : -12) });
    else notes.push({ ...e });
  }
  const adds = Math.round(pat.notes.length * a * 0.3);
  for (let k = 0; k < adds && pat.notes.length; k++) {
    const t = Math.floor(r() * N); if (used.has(t)) continue;
    const src = pat.notes[Math.floor(r() * pat.notes.length)]; used.add(t); notes.push({ ...src, t, d: Math.min(src.d, 1), slide: false });
  }
  notes = notes.filter((e) => e.n >= 0 && e.n <= 127).sort((x, y) => x.t - y.t || x.n - y.n);
  return { ...pat, name: pat.name.replace(/ · var \d+$/, '') + ' · var ' + seed, notes, edited: true };
}
