// Auditoría y edición de las 8 macros (8 × 17 bytes desde el offset 204).
// Estructura documentada oficialmente; el significado de los códigos de destino es comunitario.
import { macroDestInfo, MACRO_GROUP_LABELS } from './params.js';
import { decodePatch } from './patch.js';

export function auditMacros(payload) {
  const d = decodePatch(payload);
  const integrity = [], observations = [];
  const destUse = new Map();
  for (const m of d.macros) {
    const seenInKnob = new Set();
    for (const s of m.slots) {
      if (s.dest > 70) integrity.push({ knob: m.index, slot: s.slot, text: `M${m.index + 1}${'ABCD'[s.slot]}: destino ${s.dest} fuera del rango documentado 0–70` });
      if (s.state !== 'active') continue;
      if (s.dest === 70) observations.push({ knob: m.index, text: `M${m.index + 1}${'ABCD'[s.slot]}: código 70 sin significado conocido` });
      if (seenInKnob.has(s.dest)) observations.push({ knob: m.index, text: `M${m.index + 1}: el mismo destino (${s.info.label}) aparece en dos rutas` });
      seenInKnob.add(s.dest);
      if (!destUse.has(s.dest)) destUse.set(s.dest, new Set());
      destUse.get(s.dest).add(m.index);
      if (s.info.group === 'matrix') {
        const mi = s.dest - 50, route = d.matrix[mi];
        if (route && route.s1 === 0 && route.s2 === 0) observations.push({ knob: m.index, text: `M${m.index + 1}: controla la profundidad de la matriz ${mi + 1}, cuya fuente es «Direct» (desplazamiento fijo)` });
      }
    }
    if (!m.active) observations.push({ knob: m.index, text: `M${m.index + 1}: sin rutas con efecto (profundidad 0 o recorrido nulo)`, inactive: true });
  }
  const shared = [...destUse.entries()].filter(([, ks]) => ks.size > 1).map(([dest, ks]) => ({ dest, label: macroDestInfo(dest).label, knobs: [...ks] }));
  for (const s of shared) observations.push({ text: `Destino compartido: ${s.label} en ${s.knobs.map((k) => 'M' + (k + 1)).join(', ')}`, shared: true });
  const knobs = d.macros.map((m) => {
    const act = m.slots.filter((s) => s.state === 'active');
    const groups = [...new Set(act.map((s) => s.info.group))];
    return { ...m, activeCount: act.length, groups, mainGroup: groups[0] || null, summary: act.length ? act.map((s) => s.info.label).join(' · ') : 'Sin efecto' };
  });
  return { knobs, integrity, observations, shared };
}

// --- Operaciones (siempre devuelven una copia nueva) ---
export function swapKnobs(payload, a, b) {
  const out = new Uint8Array(payload);
  const A = payload.slice(204 + 17 * a, 221 + 17 * a), B = payload.slice(204 + 17 * b, 221 + 17 * b);
  out.set(B, 204 + 17 * a); out.set(A, 204 + 17 * b);
  return out;
}
export function permuteKnobs(payload, perm) { // perm[newIndex] = oldIndex
  if (perm.length !== 8 || new Set(perm).size !== 8) throw new Error('Permutación inválida');
  const out = new Uint8Array(payload);
  for (let k = 0; k < 8; k++) out.set(payload.slice(204 + 17 * perm[k], 221 + 17 * perm[k]), 204 + 17 * k);
  return out;
}
export function setSlot(payload, knob, slot, { dest, start, end, depth }) {
  const out = new Uint8Array(payload), o = 205 + 17 * knob + 4 * slot;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x | 0));
  if (dest !== undefined) out[o] = clamp(dest, 0, 70);
  if (start !== undefined) out[o + 1] = clamp(start, 0, 127);
  if (end !== undefined) out[o + 2] = clamp(end, 0, 127);
  if (depth !== undefined) out[o + 3] = clamp(depth, 0, 127);
  return out;
}
export function clearKnob(payload, knob) {
  const out = new Uint8Array(payload), base = 204 + 17 * knob;
  out[base] = 0;
  for (let j = 0; j < 4; j++) out.set([0, 0, 127, 64], base + 1 + 4 * j);
  return out;
}

// --- Perfiles ---
// Cada perfil indica, por macro, un grupo funcional y destinos candidatos por prioridad.
// No son un estándar de Novation; son distribuciones de trabajo opcionales.
const K = (group, label, dests) => ({ group, label, dests });
const OSC = K('osc', 'Timbre OSC', [3, 10, 2, 9]);
const CUT = K('filter', 'Cutoff', [20]);
const RES = K('filter', 'Resonancia', [21]);
export const PROFILES = {
  techno: { title: 'Techno / groove', knobs: [OSC, K('osc', 'Density', [5, 12, 6]), K('env', 'Decay amp', [26]), K('filter', 'Env → filtro', [24, 30]), CUT, RES, K('matrix', 'Prof. matriz / LFO', [50, 51, 38, 41]), K('fx', 'Distorsión', [44, 22])] },
  panel: { title: 'Panel Circuit Tracks', knobs: [OSC, K('osc', 'Modulación OSC', [4, 11, 5]), K('env', 'Release amp', [28]), K('filter', 'Env → filtro', [24]), CUT, RES, K('lfo', 'Movimiento', [50, 38]), K('fx', 'Chorus / FX', [45, 44])], note: 'Inspirado en las serigrafías del panel; Novation no fija destinos obligatorios.' },
  darkbass: { title: 'Bajo oscuro', knobs: [OSC, K('osc', 'Density', [5]), K('env', 'Decay amp', [26]), K('filter', 'Env → filtro', [24]), CUT, RES, K('lfo', 'Movimiento', [50, 38]), K('filter', 'Drive', [22, 44])] },
  rolling: { title: 'Rolling bass', knobs: [OSC, K('osc', 'Density', [5]), K('env', 'Decay amp', [26]), K('env', 'Decay filtro', [30]), CUT, RES, K('lfo', 'LFO sync', [39, 38]), K('filter', 'Drive', [22])] },
  subbass: { title: 'Sub bass', knobs: [K('mixer', 'Nivel OSC 1', [16]), K('mixer', 'Nivel OSC 2', [17]), K('env', 'Decay amp', [26]), K('env', 'Release amp', [28]), CUT, K('voice', 'Glide', [0]), K('osc', 'Afinación fina', [8]), K('filter', 'Drive', [22])] },
  reese: { title: 'Reese / detune', knobs: [OSC, K('osc', 'Density detune', [6, 13]), K('osc', 'Cents OSC 2', [15]), K('filter', 'Env → filtro', [24]), CUT, RES, K('lfo', 'LFO 2 rate', [41]), K('fx', 'Distorsión', [44])] },
  acid: { title: 'Acid', knobs: [OSC, K('voice', 'Glide', [0]), K('env', 'Decay amp', [26]), K('env', 'Decay filtro', [30]), CUT, RES, K('filter', 'Env → filtro', [24]), K('filter', 'Drive', [22])] },
  wobble: { title: 'Wobble', knobs: [OSC, K('osc', 'Density', [5]), K('lfo', 'LFO 1 rate', [38]), K('lfo', 'LFO 1 sync', [39]), CUT, RES, K('matrix', 'Prof. matriz 1–2', [50, 51]), K('fx', 'Distorsión', [44])] },
  lead: { title: 'Lead expresivo', knobs: [OSC, K('osc', 'VSync', [4, 11]), K('env', 'Release amp', [28]), K('filter', 'Env → filtro', [24]), CUT, RES, K('lfo', 'Vibrato / LFO', [50, 38]), K('voice', 'Glide', [0])] },
  noirlead: { title: 'Lead oscuro', knobs: [OSC, K('osc', 'VSync', [11, 4]), K('env', 'Release amp', [28]), K('filter', 'Env → filtro', [24]), CUT, RES, K('lfo', 'LFO 1 rate', [38]), K('filter', 'Drive', [22])] },
  pluck: { title: 'Pluck', knobs: [OSC, K('osc', 'VSync', [4]), K('env', 'Decay amp', [26]), K('env', 'Decay filtro', [30]), CUT, RES, K('lfo', 'LFO 2 rate', [41]), K('fx', 'Chorus', [45])] },
  stab: { title: 'Stab minimal', knobs: [OSC, K('osc', 'VSync', [11]), K('env', 'Decay amp', [26]), K('env', 'Decay filtro', [30]), CUT, RES, K('env', 'Release amp', [28]), K('fx', 'Distorsión', [44, 22])] },
  dubchord: { title: 'Dub chord', knobs: [OSC, K('osc', 'Density', [12, 5]), K('env', 'Release amp', [28]), K('filter', 'Env → filtro', [24]), CUT, RES, K('lfo', 'LFO 2 rate', [41]), K('fx', 'Chorus / phaser', [45])] },
  keys: { title: 'Keys / poly', knobs: [OSC, K('osc', 'Density', [5]), K('env', 'Attack amp', [25]), K('env', 'Release amp', [28]), CUT, RES, K('lfo', 'Vibrato', [50, 38]), K('fx', 'Chorus', [45])] },
  pad: { title: 'Pad / evolución', knobs: [OSC, K('osc', 'Density', [5]), K('env', 'Attack amp', [25]), K('env', 'Release amp', [28]), CUT, RES, K('lfo', 'LFO 2 rate', [41]), K('fx', 'Chorus', [45])] },
  synthwave: { title: 'Synthwave poly', knobs: [OSC, K('osc', 'Density', [5]), K('env', 'Release amp', [28]), K('env', 'Release filtro', [32]), CUT, RES, K('lfo', 'LFO 1 sync', [39]), K('fx', 'Chorus', [45])] },
  drone: { title: 'Drone / textura', knobs: [OSC, K('osc', 'Index OSC 2', [10]), K('env', 'Release amp', [28]), K('env', 'Release filtro', [32]), CUT, RES, K('lfo', 'LFO 2 rate', [41]), K('fx', 'Chorus', [45])] },
  arp: { title: 'Arp percusivo', knobs: [OSC, K('osc', 'VSync OSC 2', [11]), K('env', 'Decay amp', [26]), K('filter', 'Env → filtro', [24]), CUT, RES, K('lfo', 'LFO 1 sync', [39]), K('fx', 'Chorus', [45])] },
  arphyp: { title: 'Arp hipnótico', knobs: [OSC, K('osc', 'Density', [5]), K('env', 'Decay amp', [26]), K('env', 'Decay filtro', [30]), CUT, RES, K('lfo', 'LFO 2 sync', [42]), K('fx', 'Chorus', [45])] },
  glassarp: { title: 'Arp digital', knobs: [OSC, K('osc', 'Index OSC 2', [10]), K('env', 'Decay amp', [26]), K('env', 'Decay filtro', [30]), CUT, RES, K('lfo', 'LFO 2 sync', [42]), K('fx', 'Chorus', [45])] },
  seq: { title: 'Secuencia', knobs: [OSC, K('osc', 'VSync', [4]), K('env', 'Decay amp', [26]), K('env', 'Decay filtro', [30]), CUT, RES, K('lfo', 'LFO 1 sync', [39]), K('fx', 'Distorsión', [44])] },
  perc: { title: 'Perc / synth hit', knobs: [OSC, K('mixer', 'Ruido', [19]), K('env', 'Decay amp', [26]), K('env', 'Decay filtro', [30]), CUT, RES, K('matrix', 'Prof. matriz 1', [50]), K('fx', 'Distorsión', [44])] },
  industrial: { title: 'Industrial / ruido', knobs: [OSC, K('mixer', 'Ring mod', [18]), K('env', 'Decay amp', [26]), K('filter', 'Env → filtro', [24]), CUT, RES, K('mixer', 'Ruido', [19]), K('fx', 'Distorsión', [44])] },
  fx: { title: 'FX / movimiento', knobs: [OSC, K('osc', 'VSync', [4]), K('env', 'Release amp', [28]), K('env', 'Sustain filtro', [31]), CUT, RES, K('lfo', 'Movimiento', [50, 51, 38]), K('fx', 'Distorsión', [44])] }
};

// Compatibilidad de un patch con un perfil (diferencia de preferencia, NO error de integridad).
export function profileFit(payload, profileId) {
  const prof = PROFILES[profileId], a = auditMacros(payload);
  return prof.knobs.map((want, k) => {
    const knob = a.knobs[k];
    const exact = knob.slots.some((s) => s.state === 'active' && want.dests.includes(s.dest));
    const group = knob.groups.includes(want.group);
    return { knob: k, want, have: knob.summary, status: exact ? 'match' : group ? 'group' : knob.activeCount ? 'differs' : 'empty' };
  });
}

// Reordena macros completas (con todas sus rutas) para acercarse al perfil. Conserva todas las rutas.
export function reorderToProfile(payload, profileId) {
  const prof = PROFILES[profileId], a = auditMacros(payload);
  const score = (old, k) => { const knob = a.knobs[old], want = prof.knobs[k]; if (!knob.activeCount) return 0; if (knob.slots.some((s) => s.state === 'active' && want.dests.includes(s.dest))) return 3; return knob.groups.includes(want.group) ? 1 : 0; };
  // Asignación óptima por programación dinámica sobre subconjuntos (8! evitado: 2^8 estados).
  const N = 256, dp = new Array(N).fill(-1), par = new Array(N).fill(null); dp[0] = 0;
  for (let mask = 0; mask < N; mask++) {
    if (dp[mask] < 0) continue;
    const k = popcount(mask); if (k >= 8) continue;
    for (let old = 0; old < 8; old++) {
      if (mask & (1 << old)) continue;
      const nm = mask | (1 << old), s = dp[mask] + score(old, k) + (old === k ? 0.01 : 0); // ligera preferencia por no mover
      if (s > dp[nm]) { dp[nm] = s; par[nm] = { mask, old }; }
    }
  }
  const perm = new Array(8); let mask = N - 1;
  for (let k = 7; k >= 0; k--) { const p = par[mask]; perm[k] = p.old; mask = p.mask; }
  const before = Array.from({ length: 8 }, (_, k) => score(k, k)).reduce((x, y) => x + y, 0);
  const after = perm.reduce((acc, old, k) => acc + score(old, k), 0);
  return { perm, changed: perm.some((o, k) => o !== k), before, after, payload: permuteKnobs(payload, perm) };
}
function popcount(n) { let c = 0; while (n) { c += n & 1; n >>= 1; } return c; }

// Rellena SOLO las macros sin rutas activas con el primer destino del perfil.
// Profundidad +32 (96) y recorrido completo: valor de partida elegido por nosotros, no por Novation.
export function fillEmptyFromProfile(payload, profileId, depth = 96) {
  const prof = PROFILES[profileId], a = auditMacros(payload);
  let out = new Uint8Array(payload); const filled = [];
  const used = new Set(a.knobs.flatMap((k) => k.slots.filter((s) => s.state === 'active').map((s) => s.dest)));
  for (let k = 0; k < 8; k++) {
    if (a.knobs[k].activeCount) continue;
    const dest = prof.knobs[k].dests.find((x) => !used.has(x));
    if (dest === undefined) continue;
    out = clearKnob(out, k);
    out = setSlot(out, k, 0, { dest, start: 0, end: 127, depth });
    used.add(dest); filled.push({ knob: k, dest });
  }
  return { payload: out, filled };
}

// Reconstrucción completa según perfil (descarta TODAS las rutas actuales). Solo sobre copias.
export function rebuildFromProfile(payload, profileId, depth = 96) {
  const prof = PROFILES[profileId]; let out = new Uint8Array(payload);
  for (let k = 0; k < 8; k++) { out = clearKnob(out, k); out = setSlot(out, k, 0, { dest: prof.knobs[k].dests[0], start: 0, end: 127, depth }); }
  return out;
}

export function macroGroupLabel(g) { return MACRO_GROUP_LABELS[g] || g; }

// Valor que alcanza un destino con la macro en `pos` (0–127).
// ESTIMACIÓN: Novation no publica la fórmula. Modelo: la ruta actúa solo entre inicio y fin del recorrido del knob;
// dentro de ese tramo suma de forma lineal hasta depth/64 × rango del parámetro (inicio > fin = tramo invertido).
export function macroReach(slot, pos, base, min = 0, max = 127) {
  const lo = Math.min(slot.start, slot.end), hi = Math.max(slot.start, slot.end), span = max - min;
  const clamp = (v) => Math.max(min, Math.min(max, Math.round(v)));
  const fAt = (x) => { if (hi === lo) return 0; let f = Math.max(0, Math.min(1, (x - lo) / (hi - lo))); if (slot.start > slot.end) f = 1 - f; return f; };
  const amt = (slot.depthSigned / 64) * span;
  const f = fAt(pos), ends = [clamp(base + amt * fAt(0)), clamp(base + amt * fAt(127))];
  return { value: clamp(base + amt * f), f, from: Math.min(base, ...ends, clamp(base + amt)), to: Math.max(base, ...ends, clamp(base + amt)), atMin: ends[0], atMax: ends[1], clipped: base + amt > max || base + amt < min };
}
