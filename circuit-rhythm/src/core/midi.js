// core/midi.js — sesión MIDI con la Circuit Rhythm (Programmer's Reference, Sampler Parts 1–8).
// Por MIDI no se pueden enviar samples: sirve para elegir slot (CC 8), tocar y mover macros.

export const CC = {
  sample: 8, playback: 12, reverse: 14, choke: 15, slice: 16, slices: 17,
  macros: [21, 22, 23, 24, 25, 26, 27, 28], // Tune, Start, Length, Slope, Distortion, HPF, LPF, Resonance
  level: 29, pan: 30, reverb: 31, delay: 32,
};
export const MACRO_DEFAULTS = [64, 0, 127, 64, 0, 0, 127, 0];
export const ROOT_NOTE = 60; // el sample suena a su altura original

export class RhythmMidi {
  constructor() {
    this.access = null; this.out = null; this.inp = null;
    this.channels = [1, 2, 3, 4, 5, 6, 7, 8];
    this.log = [];
    this.onState = () => {}; this.onClock = () => {};
    this._clock = []; this.bpm = 0;
    this.timers = new Set();
  }
  get supported() { return typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess; }
  async connect() {
    this.access = await navigator.requestMIDIAccess({ sysex: false });
    this.access.onstatechange = () => this.onState();
    this.autoPick();
    return this;
  }
  ports() {
    if (!this.access) return { outs: [], ins: [] };
    return { outs: [...this.access.outputs.values()], ins: [...this.access.inputs.values()] };
  }
  autoPick() {
    const { outs, ins } = this.ports();
    const rx = /circuit\s*rhythm/i;
    if (!this.out || this.out.state === 'disconnected') this.out = outs.find((p) => rx.test(p.name)) || null;
    const ni = ins.find((p) => rx.test(p.name)) || null;
    if (ni !== this.inp) this.setInput(ni);
  }
  setOutput(id) { this.out = this.ports().outs.find((p) => p.id === id) || null; }
  setInput(p) {
    if (this.inp) this.inp.onmidimessage = null;
    this.inp = typeof p === 'string' ? this.ports().ins.find((q) => q.id === p) || null : p;
    if (this.inp) this.inp.onmidimessage = (e) => this._in(e);
  }
  _in(e) {
    const d = e.data;
    if (d[0] === 0xf8) {
      const t = e.timeStamp; this._clock.push(t);
      if (this._clock.length > 49) this._clock.shift();
      if (this._clock.length >= 25) {
        const span = this._clock[this._clock.length - 1] - this._clock[0];
        const bpm = 60000 / (span / (this._clock.length - 1) * 24);
        if (Math.abs(bpm - this.bpm) > 0.2) { this.bpm = Math.round(bpm * 10) / 10; this.onClock(this.bpm); }
      }
    } else if (d[0] === 0xfc) { this._clock = []; }
  }
  send(bytes, at) {
    if (!this.out) throw new Error('sin salida MIDI');
    this.out.send(bytes, at);
    this.log.push({ t: Date.now(), bytes: Array.from(bytes) });
    if (this.log.length > 300) this.log.shift();
  }
  ch(track) { return (this.channels[track] || track + 1) - 1; }
  cc(track, num, val, at) { this.send([0xb0 | this.ch(track), num & 127, Math.max(0, Math.min(127, Math.round(val)))], at); }
  selectSlot(track, slot) { this.cc(track, CC.sample, slot); }
  note(track, note = ROOT_NOTE, vel = 100, ms = 400) {
    const now = performance.now();
    this.send([0x90 | this.ch(track), note, vel], now);
    this.send([0x80 | this.ch(track), note, 0], now + ms);
  }
  // elige el slot y lo toca (pequeña espera para que el cambio de sample llegue antes que la nota)
  audition(track, slot, { note = ROOT_NOTE, vel = 100, ms = 450, wait = 25 } = {}) {
    this.selectSlot(track, slot);
    const t = setTimeout(() => { this.timers.delete(t); try { this.note(track, note, vel, ms); } catch {} }, wait);
    this.timers.add(t);
  }
  macro(track, i, val) { this.cc(track, CC.macros[i], val); }
  resetMacros(track) { MACRO_DEFAULTS.forEach((v, i) => this.macro(track, i, v)); }
  panic() {
    for (const t of this.timers) clearTimeout(t); this.timers.clear();
    if (!this.out) return;
    for (let c = 0; c < 16; c++) this.send([0xb0 | c, 123, 0]);
  }
}
