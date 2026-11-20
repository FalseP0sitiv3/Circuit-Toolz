// core/tune.js — v2.3: afinar los samples al tono del pack.
// Se afina como lo hace un sampler: más rápido para subir y más lento para bajar, así que la duración cambia.
// Es lo que hace el macro Tune de la Rhythm, pero fijado en el sample: el pad suena ya en el tono del tema.
import { noteName } from './analyze.js';

export const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const TUNE_LIMIT = 12;                       // semitonos, arriba o abajo
export const ROOT_CATS = ['kick', 'tom', 'bass'];   // a la tónica por defecto: lo que hace de nota base
export const TUNE_MODES = ['root', 'allroot', 'cents'];
export const tuneRatio = (st) => Math.pow(2, (st || 0) / 12);
const rnd2 = (x) => Math.round(x * 100) / 100;

// La nota medida (MIDI con decimales) si es fiable; los acordes no tienen una nota.
export function measuredMidi(a) {
  return a && !a.error && !a.chordLike && a.f0conf > 0.6 && a.midi != null ? a.midi : null;
}
// La nota con la que sonará en la Rhythm (medida + afinación de la receta)
export function effectiveMidi(s) {
  const m = measuredMidi(s && s.analysis);
  return m == null ? null : m + ((s.recipe && s.recipe.tune) || 0);
}
// Desplazamiento más corto hasta una nota de esa clase (±6 semitonos; el tritono baja)
export function shiftToPc(midi, pc) {
  let d = (((pc - midi) % 12) + 12) % 12;
  if (d >= 6) d -= 12;
  return rnd2(d);
}
// Solo corregir los cents: al semitono más cercano
export const shiftToSemitone = (midi) => rnd2(Math.round(midi) - midi);

// «F1 −12 ct»
export function pitchLabel(midi) {
  if (midi == null) return '—';
  const n = Math.round(midi), c = Math.round((midi - n) * 100);
  return noteName(n) + (c ? ` ${c > 0 ? '+' : '−'}${Math.abs(c)} ct` : '');
}

// items: [{id, cat, midi (medido), loop, tune (actual)}] → propuesta por sample
//  mode 'root':    bombos, toms y bajos a la tónica; el resto, al semitono más cercano
//  mode 'allroot': todo lo que tiene nota, a la tónica
//  mode 'cents':   solo corregir los cents
export function tunePlan(items, { root = 5, mode = 'root' } = {}) {
  const out = [];
  for (const it of items) {
    if (it.midi == null) { out.push({ id: it.id, status: 'nopitch' }); continue; }
    if (it.loop) { out.push({ id: it.id, status: 'loop' }); continue; }
    const toRoot = mode === 'allroot' || (mode === 'root' && ROOT_CATS.includes(it.cat));
    let shift = toRoot ? shiftToPc(it.midi, root) : shiftToSemitone(it.midi);
    if (Math.abs(shift) < 0.05) shift = 0;
    const cur = it.tune || 0;
    const status = Math.abs(shift - cur) < 0.01 ? (shift === 0 ? 'ok' : 'same') : 'change';
    out.push({ id: it.id, status, toRoot, from: it.midi, shift, to: it.midi + shift, cur });
  }
  return out;
}
