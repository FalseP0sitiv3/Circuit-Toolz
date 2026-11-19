// ui/audio.js — decodificación y reproducción local (Web Audio)
import { parseAudio, sniffAudio, quantize16 } from '../core/wav.js';

const Player = {
  ctx: null, src: null, t0: 0, dur: 0, rate: 1, onEnd: null, key: null,
  ensure() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  async decodeBytes(u8) {
    const kind = sniffAudio(u8.subarray(0, 16));
    if (kind === 'wav' || kind === 'aiff') {
      try { return parseAudio(u8); } catch (e) { if (!/comprimido|compressed/i.test(e.message)) throw e; }
    }
    const oc = new OfflineAudioContext(1, 1, 48000);
    const ab = await oc.decodeAudioData(u8.slice().buffer);
    const channels = [];
    for (let i = 0; i < ab.numberOfChannels; i++) channels.push(ab.getChannelData(i).slice());
    return { sampleRate: ab.sampleRate, channels, bits: 0, format: kind || '?', container: kind || '?', meta: {} };
  },
  // channels: [Float32Array]; quant16 simula la cuantización a 16 bit de la Rhythm
  play(channels, sampleRate, { playbackRate = 1, onEnd = null, key = null, quant16 = false, offset = 0, duration = null, loop = false } = {}) {
    this.stop();
    const ctx = this.ensure();
    const len = channels[0].length;
    if (!len) return;
    const buf = ctx.createBuffer(Math.min(2, channels.length), len, sampleRate);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      let d = channels[c];
      if (quant16) { const q = quantize16(d, false); d = new Float32Array(q.length); for (let i = 0; i < q.length; i++) d[i] = q[i] / 32768; }
      buf.copyToChannel(d instanceof Float32Array ? d : Float32Array.from(d), c);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.playbackRate.value = playbackRate; src.loop = !!loop;
    src.connect(ctx.destination);
    src.onended = () => { if (this.src === src) { this.src = null; this.key = null; if (onEnd) onEnd(); } };
    offset = Math.max(0, Math.min(offset, len / sampleRate - 0.001));
    if (duration) src.start(0, offset, duration); else src.start(0, offset);
    this.src = src; this.t0 = ctx.currentTime; this.off = offset; this.dur = len / sampleRate; this.rate = playbackRate; this.key = key; this.loop = !!loop;
  },
  stop() { if (this.src) { const s = this.src; this.src = null; this.key = null; try { s.stop(); } catch {} } },
  get playing() { return !!this.src; },
  position() { if (!this.src) return 0; const p = this.off + (this.ctx.currentTime - this.t0) * this.rate; return this.loop ? p % this.dur : Math.min(this.dur, p); },
};
