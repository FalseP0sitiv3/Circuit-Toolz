// core/patterns.js — patrones para las 8 pistas de la Circuit Rhythm: generador, grabación por reloj y .mid
// Determinista por semilla. Una pista de la Rhythm es monofónica: un carril por pista.

export const LANE_ROLES = ['kick', 'clap', 'hat', 'ohat', 'perc', 'bass', 'synth', 'fx'];
// slot por defecto de cada pista en la distribución «una página por instrumento» (página = pista)
export const DEFAULT_KIT = [0, 16, 32, 40, 48, 64, 80, 96];
export const STYLES = ['techno', 'rumble', 'minimal', 'house', 'breakbeat', 'electro', 'industrial', 'halftime', 'euclid'];
export const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11], minorpent: [0, 3, 5, 7, 10], major: [0, 2, 4, 5, 7, 9, 11],
};

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export function euclid(k, n, rot = 0) {
  const base = Array.from({ length: n }, (_, i) => ((i * k) % n) < k);
  return Array.from({ length: n }, (_, i) => base[((i - rot) % n + n) % n]);
}
const hit = (v = 100) => ({ v });
function lane(n) { return Array(n).fill(null); }

// Genera un patrón de 16 pasos y, si se piden 32, una segunda vuelta con variación y remate.
export function generate({ style = 'techno', seed = 1, steps = 16, density = 0.5, velVar = 0.3, fill = true, root = 45, scale = 'minor', bassStyle = 'auto' } = {}) {
  const R = rng(seed * 7919 + STYLES.indexOf(style) * 104729 + 1);
  const L = LANE_ROLES.map(() => lane(16));
  const acc = (base) => Math.max(1, Math.min(127, Math.round(base * (1 - velVar * 0.5 + R() * velVar * 0.5))));
  const put = (li, i, v) => { L[li][i % 16] = hit(acc(v)); };
  const maybe = (p) => R() < p;
  const [K, C, H, O, P, B, S, F] = [0, 1, 2, 3, 4, 5, 6, 7];
  switch (style) {
    case 'techno':
      for (const i of [0, 4, 8, 12]) put(K, i, 120);
      if (maybe(0.5)) put(K, 14 + (maybe(0.5) ? 1 : 0), 70);
      for (const i of [4, 12]) put(C, i, 105);
      for (let i = 0; i < 16; i++) if (i % 4 === 2) put(O, i, 95); else if (maybe(0.35 + density * 0.6)) put(H, i, i % 2 ? 70 : 90);
      for (let i = 0; i < 16; i++) if (i % 4 && maybe(density * 0.35)) put(P, i, 80);
      break;
    case 'rumble':
      for (const i of [0, 4, 8, 12]) put(K, i, 125);
      for (const i of [4, 12]) if (maybe(0.7)) put(C, i, 95);
      for (let i = 0; i < 16; i++) put(H, i, i % 4 === 2 ? 100 : 60);
      for (let i = 0; i < 16; i++) if (i % 4 === 3 && maybe(density)) put(P, i, 75);
      break;
    case 'minimal':
      for (const i of [0, 4, 8, 12]) put(K, i, 115);
      if (maybe(0.6)) put(C, 12, 90);
      for (let i = 2; i < 16; i += 4) put(H, i, 85);
      for (let i = 0; i < 16; i++) if (maybe(density * 0.3)) put(P, i, 65 + R() * 30);
      if (maybe(0.5)) put(O, 10, 70);
      break;
    case 'house':
      for (const i of [0, 4, 8, 12]) put(K, i, 118);
      for (const i of [4, 12]) put(C, i, 108);
      for (let i = 2; i < 16; i += 4) put(O, i, 92);
      for (let i = 0; i < 16; i += 2) if (i % 4) continue; else if (maybe(0.5 + density * 0.4)) put(H, i + 1, 70);
      for (let i = 0; i < 16; i++) if (maybe(density * 0.25)) put(P, i, 70);
      break;
    case 'breakbeat':
      for (const i of [0, 10]) put(K, i, 120); if (maybe(0.6)) put(K, 7, 90);
      for (const i of [4, 12]) put(C, i, 112); if (maybe(0.5)) put(C, 15, 60);
      for (let i = 0; i < 16; i += 2) put(H, i, i % 4 ? 70 : 90);
      if (maybe(density)) put(O, 14, 80);
      break;
    case 'electro':
      for (const i of [0, 6, 10]) put(K, i, 120); if (maybe(0.5)) put(K, 13, 90);
      for (const i of [4, 12]) put(C, i, 110);
      for (let i = 0; i < 16; i++) if (maybe(0.4 + density * 0.4)) put(H, i, i % 2 ? 65 : 95);
      for (let i = 0; i < 16; i++) if (maybe(density * 0.3)) put(P, i, 80);
      break;
    case 'industrial':
      for (const i of [0, 4, 8, 12]) put(K, i, 127);
      for (let i = 0; i < 16; i++) if (i % 4 && maybe(density * 0.4)) put(K, i, 80);
      for (const i of [4, 12]) put(C, i, 115); if (maybe(0.5)) put(C, 14, 90);
      for (let i = 0; i < 16; i++) put(H, i, i % 2 ? 80 : 110);
      for (let i = 0; i < 16; i++) if (maybe(0.3 + density * 0.4)) put(P, i, 90 + R() * 30);
      break;
    case 'halftime':
      put(K, 0, 125); if (maybe(0.6)) put(K, 3, 90); if (maybe(0.5)) put(K, 11, 85);
      put(C, 8, 115);
      for (let i = 0; i < 16; i += 2) put(H, i, i % 4 ? 70 : 95);
      if (maybe(density)) put(O, 6, 80);
      break;
    case 'euclid': {
      const ks = [4, 2 + Math.floor(R() * 2), 5 + Math.floor(R() * 6 * density), 2 + Math.floor(R() * 3), 3 + Math.floor(R() * 5 * density)];
      [K, C, H, O, P].forEach((li, j) => {
        const e = euclid(ks[j], 16, li === K ? 0 : Math.floor(R() * 16));
        e.forEach((on, i) => { if (on) put(li, i, [120, 105, 85, 90, 80][j]); });
      });
      break;
    }
  }
  // bajo (nota relativa a la tónica, en grados de la escala)
  const sc = SCALES[scale] || SCALES.minor;
  const deg = (d) => sc[((d % sc.length) + sc.length) % sc.length] + 12 * Math.floor(d / sc.length);
  const bs = bassStyle === 'auto' ? (style === 'rumble' ? 'rolling' : style === 'house' || style === 'minimal' ? 'offbeat' : style === 'techno' || style === 'industrial' ? (R() < 0.5 ? 'rolling' : 'offbeat') : 'syncopated') : bassStyle;
  for (let i = 0; i < 16; i++) {
    const kick = !!L[K][i];
    let on = false;
    if (bs === 'offbeat') on = i % 4 === 2;
    else if (bs === 'rolling') on = !kick;
    else on = !kick && R() < 0.3 + density * 0.3;
    if (!on) continue;
    let n = 0;
    if (R() < 0.25 + density * 0.2) n = deg([0, 0, 2, 4, -3, 6, 7][Math.floor(R() * 7)]);
    L[B][i] = { v: acc(i % 4 === 2 ? 105 : 85), n };
  }
  // synth: stabs escasos con grados de acorde
  const stabs = [3, 6, 10, 14].filter(() => R() < 0.25 + density * 0.3);
  for (const i of stabs) L[S][i] = { v: acc(95), n: deg([0, 2, 4][Math.floor(R() * 3)]) };
  // fx: golpe o crash al principio
  if (R() < 0.6) L[F][0] = hit(100);
  // 32 pasos: segunda vuelta con variación y remate final
  let lanes = L;
  if (steps === 32) {
    lanes = L.map((ln, li) => {
      const b = ln.map((x) => (x ? { ...x } : null));
      if (li === H || li === P) for (let i = 0; i < 16; i++) if (R() < 0.15) b[i] = b[i] ? null : hit(acc(70));
      return [...ln, ...b];
    });
  }
  if (fill) {
    const n = lanes[0].length;
    for (let i = n - 4; i < n; i++) if (R() < 0.5 + density * 0.4) lanes[C][i] = hit(acc(60 + (i - n + 4) * 15));
    if (R() < 0.5) lanes[O][n - 2] = hit(acc(90));
  }
  return { style, seed, steps, root, scale, lanes: lanes.map((steps, i) => ({ role: LANE_ROLES[i], track: i, melodic: i === B || i === S, steps })) };
}

// Varía un patrón conservando el carácter (bombo intacto)
export function vary(pat, seed) {
  const R = rng(seed * 31 + 5);
  const lanes = pat.lanes.map((ln, li) => {
    if (li === 0) return { ...ln, steps: ln.steps.map((x) => (x ? { ...x } : null)) };
    const st = ln.steps.map((x) => (x ? { ...x } : null));
    for (let i = 0; i < st.length; i++) {
      if (R() < 0.12) st[i] = st[i] ? null : { v: 70 + Math.floor(R() * 40), ...(ln.melodic ? { n: 0 } : {}) };
      else if (st[i] && R() < 0.2) st[i].v = Math.max(30, Math.min(127, st[i].v + Math.round((R() - 0.5) * 40)));
    }
    return { ...ln, steps: st };
  });
  return { ...pat, seed, lanes };
}

// Nota MIDI que hay que enviar a la pista para que el sample suene en la altura deseada.
// La Rhythm toca el sample a su altura original con la nota 60.
export function noteFor(semiFromRoot, root, sampleMidi) {
  if (sampleMidi == null || !Number.isFinite(sampleMidi)) return 60 + semiFromRoot;
  let target = root + semiFromRoot;
  let n = 60 + Math.round(target - sampleMidi);
  // dentro del teclado de la Rhythm (±3 octavas): se mueve por octavas
  while (n > 96) n -= 12;
  while (n < 24) n += 12;
  return n;
}

// Swing de la Rhythm: 50 = recto; los pasos impares se retrasan (swing − 50) / 50 de paso
export function swingOffset(step, swing) { return step % 2 === 1 ? Math.max(0, Math.min(25, swing - 50)) / 50 : 0; }

// Eventos con tiempo absoluto (ms) para grabar en la Rhythm haciendo de reloj maestro.
// opts: { bpm, channels[8], kit[8]|null, sampleMidi[8], tracks:Set, gate (fracción de paso), loops, delay }
export function recordEvents(pat, opts = {}) {
  const o = { bpm: 128, channels: [1, 2, 3, 4, 5, 6, 7, 8], kit: null, sampleMidi: [], tracks: null, gate: 0.5, loops: 1, delay: 2, transport: true, swing: 50, lead: 60, ...opts };
  const ev = [];
  const stepMs = 60000 / o.bpm / 4, clockMs = stepMs / 6;
  const ch = (t) => (o.channels[t] || t + 1) - 1;
  let t0 = 0;
  if (o.kit) {
    o.kit.forEach((slot, t) => { if (slot != null && (!o.tracks || o.tracks.has(t))) ev.push({ t: 0, bytes: [0xb0 | ch(t), 8, slot & 127] }); });
    t0 = o.lead;
  }
  const n = pat.lanes[0].steps.length * o.loops;
  if (o.transport) {
    ev.push({ t: t0, bytes: [0xfc] }, { t: t0, bytes: [0xf2, 0, 0] }, { t: t0 + 1, bytes: [0xfa] });
    for (let c = 0; c < n * 6; c++) ev.push({ t: t0 + 1 + c * clockMs, bytes: [0xf8] });
  }
  const start = t0 + 1;
  pat.lanes.forEach((ln, t) => {
    if (o.tracks && !o.tracks.has(t)) return;
    const L = ln.steps.length;
    for (let k = 0; k < n; k++) {
      const s = ln.steps[k % L];
      if (!s) continue;
      const sw = o.transport ? 0 : swingOffset(k, o.swing) * stepMs; // grabando: recto (el swing se pone en la Rhythm)
      const at = start + k * stepMs + o.delay + sw;
      const note = ln.melodic ? noteFor(s.n || 0, pat.root, o.sampleMidi[t]) : 60;
      ev.push({ t: at, bytes: [0x90 | ch(t), note, Math.max(1, Math.min(127, s.v))] });
      ev.push({ t: at + Math.max(5, stepMs * o.gate) - o.delay, bytes: [0x80 | ch(t), note, 0] });
    }
  });
  if (o.transport) ev.push({ t: start + n * stepMs - 0.5, bytes: [0xfc] });
  ev.forEach((e, i) => (e.i = i));
  ev.sort((a, b) => a.t - b.t || a.i - b.i);
  ev.forEach((e) => delete e.i);
  return ev;
}

// ---------- MIDI estándar (SMF tipo 0) ----------
const GM = [36, 39, 42, 46, 37, null, null, 49]; // Drum Rack: kick, clap, CH, OH, rim/perc, —, —, crash
function vlq(n) { const b = [n & 127]; while ((n >>= 7)) b.unshift((n & 127) | 128); return b; }
export function toMidi(pat, { bpm = 128, mode = 'rhythm', sampleMidi = [], channels = [1, 2, 3, 4, 5, 6, 7, 8], swing = 50, ppq = 96 } = {}) {
  const evs = [];
  const step = ppq / 4;
  pat.lanes.forEach((ln, t) => {
    ln.steps.forEach((s, k) => {
      if (!s) return;
      const at = Math.round(k * step + swingOffset(k, swing) * step);
      let chn = (channels[t] || t + 1) - 1, note;
      if (ln.melodic) note = noteFor(s.n || 0, pat.root, sampleMidi[t]);
      else if (mode === 'drumrack' && GM[t] != null) { chn = 9; note = GM[t]; }
      else note = 60;
      if (mode === 'drumrack' && ln.melodic) note = pat.root + (s.n || 0); // en Ableton: altura real
      evs.push({ at, b: [0x90 | chn, note, s.v] }, { at: at + Math.round(step / 2), b: [0x80 | chn, note, 0] });
    });
  });
  evs.sort((a, b) => a.at - b.at || (a.b[0] & 0xf0) - (b.b[0] & 0xf0));
  const tr = [];
  const us = Math.round(60000000 / bpm);
  tr.push(0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255);
  tr.push(0, 0xff, 0x58, 4, 4, 2, 24, 8);
  let last = 0;
  for (const e of evs) { tr.push(...vlq(e.at - last), ...e.b); last = e.at; }
  const end = pat.lanes[0].steps.length * step;
  tr.push(...vlq(Math.max(0, end - last)), 0xff, 0x2f, 0);
  const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (ppq >> 8) & 255, ppq & 255];
  const len = tr.length;
  return new Uint8Array([...head, 0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 255, (len >> 16) & 255, (len >> 8) & 255, len & 255, ...tr]);
}
