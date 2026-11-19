// Sesión con Circuit Tracks por Web MIDI.
// Protocolo según la Programmer's Reference Guide v3:
//  · Synth 1 canal 1, Synth 2 canal 2 · macros CC 80–87 · patch por Program Change 0–63.
//  · SysEx: ≥ 20 ms entre mensajes · respuestas solo por USB · PGM → esperar ~10 ms → Dump Request.
// Las salidas/entradas se inyectan (MIDIOutput/MIDIInput o simulacros) para poder probarlo sin hardware.
import { buildReplaceCurrent, buildDumpRequest, parseMessage } from './sysex.js';
import { MIDI_MAP } from './params.js';

export class CircuitSession {
  // channels: canales MIDI (0-15) de Synth 1 y Synth 2. Por defecto 1 y 2, pero se cambian en Setup View del equipo.
  constructor(output, input, clock = () => performance.now(), channels = MIDI_MAP.synthChannels) {
    this.out = output; this.in = input; this.clock = clock; this.channels = [...channels];
    this.nextSysex = 0; this.waiters = []; this.log = [];
    this.ticks = []; this.running = false; this.macroPos = [new Array(8).fill(null), new Array(8).fill(null)]; this.capture = null;
    if (input) {
      this.listener = (e) => this.onMessage(e.data, e.timeStamp || this.clock());
      if (input.addEventListener) input.addEventListener('midimessage', this.listener); else input.onmidimessage = this.listener;
    }
  }
  dispose() { if (this.in?.removeEventListener) this.in.removeEventListener('midimessage', this.listener); this.stopAll(); }
  get name() { return this.out?.name || 'salida MIDI'; }

  // --- envío con planificación por timestamp (Web MIDI admite send(data, timestamp)) ---
  raw(bytes, at) { this.out.send(bytes, at); this.log.push({ at: at ?? this.clock(), bytes: Array.from(bytes) }); if (this.log.length > 500) this.log.shift(); }
  sysex(bytes) {
    const t = Math.max(this.clock(), this.nextSysex);
    this.raw(bytes, t); this.nextSysex = t + MIDI_MAP.sysexGapMs + 5;
    return t;
  }
  // Sustituye el patch en RAM (no escribe en flash). Devuelve el instante en que se envía.
  sendPatch(payload, synth = 0) { return this.sysex(buildReplaceCurrent(payload, synth, 0x64)); }
  note(synth, note, vel, at, dur) {
    const ch = this.channels[synth];
    this.raw([0x90 | ch, note & 127, vel & 127], at); this.raw([0x80 | ch, note & 127, 0], at + dur);
  }
  cc(synth, num, value, at) { this.raw([0xB0 | this.channels[synth], num, Math.max(0, Math.min(127, value | 0))], at); }
  stopAll() {
    try { this.out?.clear?.(); } catch { /* algunas implementaciones no tienen clear */ }
    for (const ch of this.channels) { this.raw([0xB0 | ch, 123, 0]); }
  }

  // --- grabar un patrón en el secuenciador del Circuit Tracks (la herramienta hace de reloj maestro) ---
  // No hay forma documentada de enviar patrones por SysEx; lo que sí está documentado es que el equipo sigue
  // Start/Stop/Clock/Song Position externos (con Clock Rx activo) y graba las notas que recibe con REC activado.
  // Secuencia: Stop → posición 0 → Start + 6 pulsos de reloj por paso → notas en el canal de destino → Stop exacto.
  // events: [{ t (paso), n, d (pasos), v, ch (0-15) }] · ccs: [{ t, num, v, ch }]
  recordPattern(events, { tempo = 120, steps = 16, swing = 0, lead = 200, ccs = [], noteGap = 3 } = {}) {
    const step = 60000 / tempo / 4, tick = step / 6, t0 = this.clock() + lead, end = t0 + steps * step;
    const at = (t) => t0 + (t + (Number.isInteger(t) && t % 2 === 1 ? swing : 0)) * step;
    this.raw([0xFC], t0 - lead + 5); // por si estaba en marcha
    this.raw([0xF2, 0, 0], t0 - 20); // Song Position Pointer = inicio del patrón
    this.raw([0xFA], t0);
    for (let i = 0; i < steps * 6; i++) this.raw([0xF8], t0 + i * tick);
    const sorted = [...events].filter((e) => e.t >= 0 && e.t < steps).sort((a, b) => a.t - b.t);
    sorted.forEach((e, i) => {
      const on = at(e.t) + 2; // justo después del pulso: el equipo lo coloca en su paso
      let off = Math.min(on + Math.max(15, Math.min(e.d, 16) * step - noteGap), end - 4); // el Circuit guarda gates de hasta 16 pasos
      const nx = sorted.slice(i + 1).find((x) => x.n === e.n && x.ch === e.ch); if (nx) off = Math.min(off, at(nx.t) - 1);
      this.raw([0x90 | e.ch, e.n & 127, Math.max(1, Math.min(127, e.v ?? 100))], on);
      this.raw([0x80 | e.ch, e.n & 127, 0], Math.max(on + 5, off));
    });
    for (const c of ccs) if (c.t < steps) this.raw([0xB0 | c.ch, c.num, Math.max(0, Math.min(127, c.v | 0))], at(c.t) + 1);
    this.raw([0xFC], end);
    return { start: t0, end };
  }
  // Tocar el patrón en el destino sin arrancar el secuenciador del equipo (para escucharlo antes de grabar).
  playEvents(events, { tempo = 120, steps = 16, swing = 0, start, ccs = [] } = {}) {
    const step = 60000 / tempo / 4, t0 = start ?? this.clock() + 60, at = (t) => t0 + (t + (Number.isInteger(t) && t % 2 === 1 ? swing : 0)) * step;
    const sorted = [...events].sort((a, b) => a.t - b.t);
    sorted.forEach((e, i) => { const on = at(e.t); let off = on + Math.max(15, e.d * step - 3); const nx = sorted.slice(i + 1).find((x) => x.n === e.n && x.ch === e.ch); if (nx) off = Math.min(off, at(nx.t) - 1); this.raw([0x90 | e.ch, e.n & 127, Math.max(1, Math.min(127, e.v ?? 100))], on); this.raw([0x80 | e.ch, e.n & 127, 0], Math.max(on + 5, off)); });
    for (const c of ccs) this.raw([0xB0 | c.ch, c.num, c.v], at(c.t));
    return { start: t0, end: t0 + steps * step, loopEnd: t0 + steps * step };
  }
  stopChannels(chs) { try { this.out?.clear?.(); } catch { /* sin clear */ } for (const ch of chs) this.raw([0xB0 | ch, 123, 0]); }

  // --- recepción ---
  onMessage(data, at = this.clock()) {
    const st = data[0];
    if (st === 0xF8) { this.ticks.push(at); if (this.ticks.length > 49) this.ticks.shift(); return; }
    if (st === 0xFA || st === 0xFB) { this.running = true; this.onTransport?.(true); return; }
    if (st === 0xFC) { this.running = false; this.onTransport?.(false); return; }
    if (st !== 0xF0) {
      const type = st & 0xF0, ch = st & 0x0F;
      if (type === 0xB0 && data[1] >= 80 && data[1] <= 87) { const synth = this.channels.indexOf(ch); if (synth >= 0) { this.macroPos[synth][data[1] - 80] = data[2]; this.onMacro?.(synth, data[1] - 80, data[2]); } }
      if (this.capture && (type === 0x90 || type === 0x80)) this.capture.events.push({ at, on: type === 0x90 && data[2] > 0, n: data[1], v: data[2], ch });
      return;
    }
    const r = parseMessage(Uint8Array.from(data));
    for (const w of [...this.waiters]) if (w.match(r)) { this.waiters.splice(this.waiters.indexOf(w), 1); clearTimeout(w.timer); w.resolve(r); }
    this.onPatch?.(r, Uint8Array.from(data));
  }
  // Tempo a partir del reloj MIDI del equipo (24 pulsos por negra). null si no llega reloj.
  clockTempo() {
    const t = this.ticks; if (t.length < 25 || this.clock() - t.at(-1) > 500) return null;
    const span = t.at(-1) - t[0], beats = (t.length - 1) / 24;
    return Math.round((60000 * beats / span) * 10) / 10;
  }
  // Captura de una frase tocada en los pads del equipo (requiere Note Tx activo, por defecto sí).
  startCapture() { this.capture = { events: [], start: this.clock() }; }
  stopCapture(tempo = 124, label = 'Frase capturada') {
    const c = this.capture; this.capture = null;
    return c ? eventsToPhrase(c.events, tempo, label) : null;
  }
  waitFor(match, timeout) {
    return new Promise((resolve, reject) => {
      const w = { match, resolve, timer: setTimeout(() => { this.waiters.splice(this.waiters.indexOf(w), 1); reject(new Error('Sin respuesta del equipo (¿cable USB? las respuestas SysEx solo salen por USB)')); }, timeout) };
      this.waiters.push(w);
    });
  }
  // Pide el patch activo de Synth 1/2.
  async requestCurrent(synth = 0, timeout = 1500) {
    const p = this.waitFor((r) => r.kind === 'patch' && r.command === 0 && r.location === synth && r.payload, timeout);
    this.sysex(buildDumpRequest(synth, 0x64));
    return (await p).payload;
  }
  // Lee patches guardados: PGM n → ~10 ms → dump. Cambia el patch activo de esa pista.
  async readStored(numbers, synth = 0, onProgress, isCancelled = () => false) {
    const out = [];
    let saved = null; try { saved = await this.requestCurrent(synth); } catch { /* sin respuesta: no se podrá restaurar */ }
    let fails = 0;
    for (const n of numbers) {
      if (isCancelled()) break;
      if (fails >= 3 && !out.some((x) => x.payload)) { out.aborted = 'El equipo no responde a las peticiones de volcado (¿cable USB, PGM Rx desactivado o puerto equivocado?)'; break; }
      const t = Math.max(this.clock(), this.nextSysex);
      this.raw([0xC0 | this.channels[synth], n & 127], t);
      this.nextSysex = t + MIDI_MAP.pgmToDumpMs + 15;
      try { out.push({ n, payload: await this.requestCurrent(synth) }); fails = 0; } catch (e) { out.push({ n, error: e.message }); fails++; }
      onProgress?.(n, out.at(-1));
      await sleep(40);
    }
    // Devuelve a la pista el sonido que tenía antes de la lectura (solo RAM).
    if (saved) this.sendPatch(saved, synth);
    out.restored = !!saved;
    return out;
  }

  // --- audición ---
  // Reproduce una frase: [{t, n, d, v}] en pasos de semicorchea; tempo en BPM.
  playPhrase(phrase, synth = 0, { tempo = 124, root = 0, start } = {}) {
    const step = 60000 / tempo / 4, t0 = start ?? this.clock() + 30;
    let end = t0;
    const sw = phrase.swing || 0, at = (t) => t0 + (t + (Math.floor(t) % 2 === 1 && Number.isInteger(t) ? sw : 0)) * step;
    const sorted = [...phrase.notes].sort((a, b) => a.t - b.t);
    sorted.forEach((e, i) => {
      let dur = Math.max(20, e.d * step - 5);
      const nx = sorted.slice(i + 1).find((x) => x.n === e.n); if (nx) dur = Math.min(dur, at(nx.t) - at(e.t) - 2); // misma altura ligada: cortar antes de la siguiente
      this.note(synth, e.n + root + (phrase.base || 0), e.v ?? 100, at(e.t), Math.max(10, dur)); end = Math.max(end, at(e.t) + dur);
    });
    for (const c of phrase.cc || []) this.cc(synth, c.num, c.v, at(c.t));
    if (phrase.steps) end = Math.max(end, t0 + phrase.steps * step);
    return { start: t0, end: end + (phrase.tail || 600), loopEnd: phrase.steps ? t0 + phrase.steps * step : null };
  }
  // Mantiene una nota y barre la macro k de 0 a 127 y vuelve; restaura la posición guardada al final.
  macroSweep(synth, knob, { note = 48, ms = 2400, restore = 0, start } = {}) {
    const t0 = start ?? this.clock() + 30, cc = MIDI_MAP.macroCC[knob], steps = 48;
    this.cc(synth, cc, 0, t0 - 5);
    this.note(synth, note, 100, t0, ms + 200);
    for (let i = 0; i <= steps; i++) { const x = i / steps, v = x < 0.5 ? x * 2 * 127 : (1 - x) * 2 * 127; this.cc(synth, cc, v, t0 + x * ms); }
    this.cc(synth, cc, restore, t0 + ms + 300);
    return { start: t0, end: t0 + ms + 600 };
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Frases de prueba (notas MIDI absolutas; Circuit usa la convención 60 = C central del teclado).
// Por defecto: modo menor, 124 BPM. 'base' desplaza la frase entera.
const seq = (arr, len = 1, v = 100) => arr.map((n, i) => (n === null ? null : { t: i * len, n, d: len * 0.8, v })).filter(Boolean);
export const PHRASES = {
  bass: { label: 'Línea de bajo (16 pasos)', base: 36, notes: seq([0, null, 0, 12, null, 0, 3, null, 0, null, 0, 7, null, 0, 10, 0]), tail: 500 },
  sub: { label: 'Sub sostenido', base: 36, notes: [{ t: 0, n: 0, d: 8 }, { t: 8, n: -2, d: 8 }], tail: 600 },
  acid: { label: 'Acid (con ligados)', base: 36, notes: [0, 0, 12, 0, 3, 0, 15, 0, 0, 10, 0, 12, 7, 0, 3, 5].map((n, i) => ({ t: i, n, d: i % 3 === 2 ? 1.3 : 0.6, v: i % 4 === 0 ? 120 : 90 })), tail: 500 },
  lead: { label: 'Motivo melódico', base: 60, notes: [{ t: 0, n: 0, d: 3 }, { t: 3, n: 3, d: 1 }, { t: 4, n: 7, d: 4 }, { t: 8, n: 10, d: 2 }, { t: 10, n: 7, d: 2 }, { t: 12, n: 3, d: 4 }], tail: 900 },
  pad: { label: 'Acorde sostenido (Cm9)', base: 48, notes: [0, 3, 7, 10, 14].map((n) => ({ t: 0, n, d: 16, v: 90 })), tail: 2500 },
  chords: { label: 'Progresión de acordes', base: 48, notes: [[0, 3, 7, 10], [-4, 0, 3, 7], [-2, 2, 5, 9], [-5, -2, 2, 5]].flatMap((ch, i) => ch.map((n) => ({ t: i * 4, n, d: 3.6, v: 95 }))), tail: 1200 },
  stab: { label: 'Stabs', base: 48, notes: [0, 3, 6, 10, 14].flatMap((s) => [0, 3, 7, 10].map((n) => ({ t: s, n, d: 0.5, v: 110 }))), tail: 900 },
  pluck: { label: 'Arpegio corto', base: 60, notes: seq([0, 7, 12, 15, 12, 7, 3, 7, 0, 7, 12, 15, 19, 15, 12, 7], 1, 105), tail: 900 },
  arp: { label: 'Arpegio (16 pasos)', base: 60, notes: seq([0, 3, 7, 12, 15, 12, 7, 3, 0, 3, 7, 12, 15, 12, 7, 3], 1, 100), tail: 900 },
  keys: { label: 'Acordes en negras', base: 60, notes: [[0, 3, 7], [0, 3, 7], [-2, 2, 5], [-4, 0, 3]].flatMap((ch, i) => ch.map((n) => ({ t: i * 4, n, d: 3, v: 95 }))), tail: 1500 },
  perc: { label: 'Golpes', base: 48, notes: seq([0, null, null, null, 0, null, 12, null, 0, null, null, null, 0, 0, null, null], 1, 120), tail: 500 },
  long: { label: 'Nota larga (FX / drone)', base: 48, notes: [{ t: 0, n: 0, d: 24, v: 100 }], tail: 3000 },
  test: { label: 'Nota de medición (C3, 1,5 s)', base: 48, notes: [{ t: 0, n: 0, d: 6, v: 100 }], tail: 1500 }
};
export function phraseFor(category, subtype) {
  if (category === 'bass') return subtype === 'sub' ? 'sub' : subtype === 'acid' ? 'acid' : 'bass';
  return { lead: 'lead', pad: 'pad', chords: 'chords', keys: 'keys', stab: 'stab', pluck: 'pluck', arp: 'arp', sequence: 'arp', perc: 'perc', fx: 'long', drone: 'long', transition: 'long', brass: 'lead', strings: 'pad', bell: 'pluck' }[category] || 'test';
}

// Localiza puertos de Circuit Tracks en un MIDIAccess.
// Convierte eventos de nota en una frase cuantizada a semicorcheas.
export function eventsToPhrase(events, tempo = 124, label = 'Frase capturada') {
  const step = 60000 / tempo / 4, open = new Map(), notes = [];
  const ons = events.filter((e) => e.on); if (!ons.length) return null;
  const t0 = ons[0].at;
  for (const e of events) {
    if (e.on) open.set(e.n, e);
    else if (open.has(e.n)) { const s = open.get(e.n); open.delete(e.n); notes.push({ t: Math.max(0, Math.round((s.at - t0) / step)), n: s.n, d: Math.max(0.5, Math.round((e.at - s.at) / step * 2) / 2), v: s.v }); }
  }
  for (const s of open.values()) notes.push({ t: Math.max(0, Math.round((s.at - t0) / step)), n: s.n, d: 1, v: s.v });
  notes.sort((a, b) => a.t - b.t);
  return { label, base: 0, notes: notes.slice(0, 256), tail: 800, custom: true };
}

export function findCircuitPorts(access) {
  const outs = [...access.outputs.values()], ins = [...access.inputs.values()];
  const re = /circuit\s*tracks/i;
  return { outputs: outs, inputs: ins, out: outs.find((o) => re.test(o.name)) || null, in: ins.find((i) => re.test(i.name)) || null };
}
