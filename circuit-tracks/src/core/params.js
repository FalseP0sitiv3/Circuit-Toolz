// Mapa técnico del formato de patch de Circuit Tracks (340 bytes).
// Cada entrada lleva su nivel de evidencia:
//   'official'   → Circuit Tracks Programmer's Reference Guide v3 (Novation), tabla "Synth Patch Format".
//   'community'  → documentación comunitaria / herramientas de terceros, sin confirmación oficial.
//   'inferred'   → inferencia técnica propia (p. ej. interpretación de un rango).
//   'unknown'    → sin información fiable.

export const EVIDENCE = {
  official: 'Documentación oficial (Programmer’s Reference Guide v3)',
  verified: 'Verificado con archivos o pruebas',
  community: 'Documentación comunitaria, sin confirmación oficial',
  inferred: 'Inferencia técnica',
  unknown: 'Desconocido'
};

export const PAYLOAD_LENGTH = 340;
export const MESSAGE_LENGTH = 350;

export const OSC_WAVES = ['Sine', 'Triangle', 'Sawtooth', 'Saw 9:1 PW', 'Saw 8:2 PW', 'Saw 7:3 PW', 'Saw 6:4 PW', 'Saw 5:5 PW', 'Saw 4:6 PW', 'Saw 3:7 PW', 'Saw 2:8 PW', 'Saw 1:9 PW', 'Pulse width', 'Square', 'Sine table', 'Analogue pulse', 'Analogue sync', 'Triangle-saw blend', 'Digital nasty 1', 'Digital nasty 2', 'Digital saw-square', 'Digital vocal 1', 'Digital vocal 2', 'Digital vocal 3', 'Digital vocal 4', 'Digital vocal 5', 'Digital vocal 6', 'Random collection 1', 'Random collection 2', 'Random collection 3'];
export const LFO_WAVES = ['Sine', 'Triangle', 'Sawtooth', 'Square', 'Random S/H', 'Time S/H', 'Piano envelope', 'Sequence 1', 'Sequence 2', 'Sequence 3', 'Sequence 4', 'Sequence 5', 'Sequence 6', 'Sequence 7', 'Alternative 1', 'Alternative 2', 'Alternative 3', 'Alternative 4', 'Alternative 5', 'Alternative 6', 'Alternative 7', 'Alternative 8', 'Chromatic', 'Chromatic 16', 'Major', 'Major 7', 'Minor 7', 'Min arp 1', 'Min arp 2', 'Diminished', 'Dec minor', 'Minor 3rd', 'Pedal', '4ths', '4ths x12', '1625 maj', '1625 min', '2511'];
export const FILTER_TYPES = ['LP 12 dB', 'LP 24 dB', 'BP 6/6 dB', 'BP 12/12 dB', 'HP 12 dB', 'HP 24 dB'];
export const DRIVE_TYPES = ['Diode', 'Valve', 'Clipper', 'Cross-over', 'Rectifier', 'Bit reducer', 'Rate reducer'];
export const POLY_MODES = ['Mono', 'Mono auto-glide', 'Poly'];
// Rango 0–2 oficial. Las etiquetas proceden de la tabla de parámetros MIDI; tratarlas como 'community' hasta verificarlas.
export const FILTER_ROUTING = ['Normal', 'OSC 1 bypass', 'OSC 1+2 bypass'];
export const CHORUS_TYPES = ['Phaser', 'Chorus'];
export const LFO_FADE_MODES = ['Fade in', 'Fade out', 'Gate in', 'Gate out'];

// Fuentes de la matriz: oficial. 1–3 no están documentadas.
export const MOD_SOURCES = { 0: 'Direct', 4: 'Velocity', 5: 'Keyboard', 6: 'LFO 1 +', 7: 'LFO 1 ±', 8: 'LFO 2 +', 9: 'LFO 2 ±', 10: 'Env amp', 11: 'Env filter', 12: 'Env 3' };
export const MOD_DESTS = ['OSC 1+2 pitch', 'OSC 1 pitch', 'OSC 2 pitch', 'OSC 1 VSync', 'OSC 2 VSync', 'OSC 1 PW/index', 'OSC 2 PW/index', 'OSC 1 level', 'OSC 2 level', 'Noise level', 'Ring mod level', 'Filter drive', 'Filter frequency', 'Filter resonance', 'LFO 1 rate', 'LFO 2 rate', 'Amp env decay', 'Filter env decay'];

// Parámetros escalares documentados (offset, clave, etiqueta, grupo, min, max, defecto, centro bipolar opcional, tabla opcional).
const P = (off, key, label, group, min, max, def, opts = {}) => ({ off, key, label, group, min, max, def, ev: 'official', ...opts });
export const PARAMS = [
  P(32, 'voice.poly', 'Modo de voz', 'voice', 0, 2, 2, { enum: POLY_MODES }),
  P(33, 'voice.portamento', 'Portamento', 'voice', 0, 127, 0),
  P(34, 'voice.preglide', 'Pre-glide', 'voice', 52, 76, 64, { center: 64, unit: 'st' }),
  P(35, 'voice.octave', 'Octava de teclado', 'voice', 58, 69, 64, { center: 64, unit: 'oct' }),
  ...[1, 2].flatMap((n) => {
    const b = n === 1 ? 36 : 45, g = 'osc' + n;
    return [
      P(b, g + '.wave', 'Forma de onda', g, 0, 29, 2, { enum: OSC_WAVES }),
      P(b + 1, g + '.interp', 'Interpolación', g, 0, 127, 127),
      P(b + 2, g + '.pw', 'PW / index', g, 0, 127, 64, { center: 64 }),
      P(b + 3, g + '.vsync', 'Virtual sync', g, 0, 127, 0),
      P(b + 4, g + '.density', 'Density', g, 0, 127, 0),
      P(b + 5, g + '.detune', 'Density detune', g, 0, 127, 0),
      P(b + 6, g + '.semi', 'Semitonos', g, 0, 127, 64, { center: 64, unit: 'st' }),
      P(b + 7, g + '.cents', 'Cents', g, 0, 127, 64, { center: 64 }),
      P(b + 8, g + '.bend', 'Rango pitch bend', g, 52, 76, 76, { center: 64, unit: 'st' })
    ];
  }),
  P(54, 'mix.osc1', 'Nivel OSC 1', 'mixer', 0, 127, 127),
  P(55, 'mix.osc2', 'Nivel OSC 2', 'mixer', 0, 127, 0),
  P(56, 'mix.ring', 'Ring mod 1×2', 'mixer', 0, 127, 0),
  P(57, 'mix.noise', 'Ruido', 'mixer', 0, 127, 0),
  P(58, 'mix.prefx', 'Nivel pre-FX', 'mixer', 52, 82, 64, { center: 64 }),
  P(59, 'mix.postfx', 'Nivel post-FX', 'mixer', 52, 82, 64, { center: 64 }),
  P(60, 'filter.routing', 'Ruta del filtro', 'filter', 0, 2, 0, { enum: FILTER_ROUTING, enumEv: 'community' }),
  P(61, 'filter.drive', 'Drive', 'filter', 0, 127, 0),
  P(62, 'filter.drivetype', 'Tipo de drive', 'filter', 0, 6, 0, { enum: DRIVE_TYPES }),
  P(63, 'filter.type', 'Tipo de filtro', 'filter', 0, 5, 1, { enum: FILTER_TYPES }),
  P(64, 'filter.freq', 'Frecuencia', 'filter', 0, 127, 127),
  P(65, 'filter.track', 'Seguimiento de teclado', 'filter', 0, 127, 127),
  P(66, 'filter.res', 'Resonancia', 'filter', 0, 127, 0),
  P(67, 'filter.qnorm', 'Q normalise', 'filter', 0, 127, 64),
  P(68, 'filter.env2', 'Env 2 → frecuencia', 'filter', 0, 127, 64, { center: 64 }),
  P(69, 'env1.vel', 'Velocity', 'env1', 0, 127, 64, { center: 64 }),
  P(70, 'env1.a', 'Attack', 'env1', 0, 127, 2), P(71, 'env1.d', 'Decay', 'env1', 0, 127, 90),
  P(72, 'env1.s', 'Sustain', 'env1', 0, 127, 127), P(73, 'env1.r', 'Release', 'env1', 0, 127, 40),
  P(74, 'env2.vel', 'Velocity', 'env2', 0, 127, 64, { center: 64 }),
  P(75, 'env2.a', 'Attack', 'env2', 0, 127, 2), P(76, 'env2.d', 'Decay', 'env2', 0, 127, 75),
  P(77, 'env2.s', 'Sustain', 'env2', 0, 127, 35), P(78, 'env2.r', 'Release', 'env2', 0, 127, 45),
  P(79, 'env3.delay', 'Delay', 'env3', 0, 127, 0),
  P(80, 'env3.a', 'Attack', 'env3', 0, 127, 10), P(81, 'env3.d', 'Decay', 'env3', 0, 127, 70),
  P(82, 'env3.s', 'Sustain', 'env3', 0, 127, 64), P(83, 'env3.r', 'Release', 'env3', 0, 127, 40),
  ...[1, 2].flatMap((n) => {
    const b = n === 1 ? 84 : 92, g = 'lfo' + n;
    return [
      P(b, g + '.wave', 'Forma de onda', g, 0, 37, 0, { enum: LFO_WAVES }),
      P(b + 1, g + '.phase', 'Fase (×3°)', g, 0, 119, 0),
      P(b + 2, g + '.slew', 'Slew', g, 0, 127, 0),
      P(b + 3, g + '.delay', 'Delay', g, 0, 127, 0),
      P(b + 4, g + '.delaysync', 'Delay sync', g, 0, 35, 0),
      P(b + 5, g + '.rate', 'Rate', g, 0, 127, 68),
      P(b + 6, g + '.ratesync', 'Rate sync', g, 0, 35, 0),
      P(b + 7, g + '.flags', 'Flags', g, 0, 63, 0, { flags: true })
    ];
  }),
  P(100, 'fx.dist', 'Distorsión · nivel', 'fx', 0, 127, 0),
  P(102, 'fx.chorus', 'Chorus/phaser · nivel', 'fx', 0, 127, 0),
  P(105, 'eq.bassf', 'EQ graves · frecuencia', 'eq', 0, 127, 64),
  P(106, 'eq.bassl', 'EQ graves · nivel', 'eq', 0, 127, 64, { center: 64 }),
  P(107, 'eq.midf', 'EQ medios · frecuencia', 'eq', 0, 127, 64),
  P(108, 'eq.midl', 'EQ medios · nivel', 'eq', 0, 127, 64, { center: 64 }),
  P(109, 'eq.trebf', 'EQ agudos · frecuencia', 'eq', 0, 127, 125),
  P(110, 'eq.trebl', 'EQ agudos · nivel', 'eq', 0, 127, 64, { center: 64 }),
  P(116, 'fx.disttype', 'Distorsión · tipo', 'fx', 0, 6, 0, { enum: DRIVE_TYPES }),
  P(117, 'fx.distcomp', 'Distorsión · compensación', 'fx', 0, 127, 100),
  P(118, 'fx.chorustype', 'Chorus/phaser · tipo', 'fx', 0, 1, 1, { enum: CHORUS_TYPES }),
  P(119, 'fx.chorusrate', 'Chorus · rate', 'fx', 0, 127, 20),
  P(120, 'fx.chorussync', 'Chorus · rate sync', 'fx', 0, 35, 0),
  P(121, 'fx.chorusfb', 'Chorus · feedback', 'fx', 0, 127, 74, { center: 64 }),
  P(122, 'fx.chorusdepth', 'Chorus · mod depth', 'fx', 0, 127, 64),
  P(123, 'fx.chorusdelay', 'Chorus · delay', 'fx', 0, 127, 64)
];
export const PARAM_BY_OFFSET = new Map(PARAMS.map((p) => [p.off, p]));
export const RESERVED_RANGES = [[18, 31], [101, 101], [103, 104], [111, 115]];

export const GROUP_LABELS = {
  meta: 'Metadatos', voice: 'Voz', osc1: 'Oscilador 1', osc2: 'Oscilador 2', mixer: 'Mezclador', filter: 'Filtro',
  env1: 'Envolvente 1 · amplitud', env2: 'Envolvente 2 · filtro', env3: 'Envolvente 3', lfo1: 'LFO 1', lfo2: 'LFO 2',
  fx: 'Efectos', eq: 'Ecualizador', matrix: 'Matriz de modulación', macros: 'Macros', reserved: 'Reservado'
};

// ---------------------------------------------------------------------------
// Destinos de macro 0–70. La guía oficial solo documenta el rango 0–70, NO el
// significado de cada código. Esta tabla es comunitaria y
// debe confirmarse en hardware. Cada código indica el offset del parámetro que
// presuntamente controla y su grupo funcional.
// ---------------------------------------------------------------------------
const MD = (label, group, off) => ({ label, group, off, ev: 'community' });
export const MACRO_DESTS = [
  MD('Portamento', 'voice', 33), MD('Nivel post-FX', 'mixer', 59),
  MD('OSC 1 interpolación', 'osc', 37), MD('OSC 1 PW/index', 'osc', 38), MD('OSC 1 VSync', 'osc', 39), MD('OSC 1 density', 'osc', 40), MD('OSC 1 density detune', 'osc', 41), MD('OSC 1 semitonos', 'osc', 42), MD('OSC 1 cents', 'osc', 43),
  MD('OSC 2 interpolación', 'osc', 46), MD('OSC 2 PW/index', 'osc', 47), MD('OSC 2 VSync', 'osc', 48), MD('OSC 2 density', 'osc', 49), MD('OSC 2 density detune', 'osc', 50), MD('OSC 2 semitonos', 'osc', 51), MD('OSC 2 cents', 'osc', 52),
  MD('Nivel OSC 1', 'mixer', 54), MD('Nivel OSC 2', 'mixer', 55), MD('Nivel ring mod', 'mixer', 56), MD('Nivel ruido', 'mixer', 57),
  MD('Filtro frecuencia', 'filter', 64), MD('Filtro resonancia', 'filter', 66), MD('Filtro drive', 'filter', 61), MD('Filtro tracking', 'filter', 65), MD('Env 2 → frecuencia', 'filter', 68),
  MD('Env amp attack', 'env', 70), MD('Env amp decay', 'env', 71), MD('Env amp sustain', 'env', 72), MD('Env amp release', 'env', 73),
  MD('Env filtro attack', 'env', 75), MD('Env filtro decay', 'env', 76), MD('Env filtro sustain', 'env', 77), MD('Env filtro release', 'env', 78),
  MD('Env 3 delay', 'env', 79), MD('Env 3 attack', 'env', 80), MD('Env 3 decay', 'env', 81), MD('Env 3 sustain', 'env', 82), MD('Env 3 release', 'env', 83),
  MD('LFO 1 rate', 'lfo', 89), MD('LFO 1 rate sync', 'lfo', 90), MD('LFO 1 slew', 'lfo', 86), MD('LFO 2 rate', 'lfo', 97), MD('LFO 2 rate sync', 'lfo', 98), MD('LFO 2 slew', 'lfo', 94),
  MD('Distorsión nivel', 'fx', 100), MD('Chorus nivel', 'fx', 102), MD('Chorus rate', 'fx', 119), MD('Chorus feedback', 'fx', 121), MD('Chorus mod depth', 'fx', 122), MD('Chorus delay', 'fx', 123),
  ...Array.from({ length: 20 }, (_, i) => MD('Matriz ' + (i + 1) + ' profundidad', 'matrix', 126 + 4 * i)),
  { label: 'Código 70 · sin identificar', group: 'unknown', off: null, ev: 'unknown' }
];
export const MACRO_GROUP_LABELS = { osc: 'Oscilador', mixer: 'Mezcla', filter: 'Filtro', env: 'Envolvente', lfo: 'LFO', fx: 'Efectos', matrix: 'Matriz', voice: 'Voz', unknown: 'Desconocido' };

export function macroDestInfo(code) {
  return MACRO_DESTS[code] || { label: 'Código ' + code + ' fuera de rango', group: 'unknown', off: null, ev: 'unknown', invalid: true };
}

// Descripción de cada offset (0–339), para el visor de diferencias.
export function describeOffset(o) {
  if (o < 16) return { group: 'meta', label: 'Nombre[' + o + ']', ev: 'official' };
  if (o === 16) return { group: 'meta', label: 'Categoría (código)', ev: 'official' };
  if (o === 17) return { group: 'meta', label: 'Género (código)', ev: 'official' };
  const p = PARAM_BY_OFFSET.get(o);
  if (p) return { group: p.group, label: GROUP_LABELS[p.group] + ' · ' + p.label, ev: p.ev, param: p };
  if (o >= 124 && o <= 203) {
    const i = Math.floor((o - 124) / 4), f = (o - 124) % 4;
    return { group: 'matrix', label: 'Matriz ' + (i + 1) + ' · ' + ['fuente 1', 'fuente 2', 'profundidad', 'destino'][f], ev: 'official' };
  }
  if (o >= 204 && o <= 339) {
    const k = Math.floor((o - 204) / 17), r = (o - 204) % 17;
    if (r === 0) return { group: 'macros', label: 'Macro ' + (k + 1) + ' · posición', ev: 'official' };
    const s = Math.floor((r - 1) / 4), f = (r - 1) % 4;
    return { group: 'macros', label: 'Macro ' + (k + 1) + ' · ruta ' + 'ABCD'[s] + ' · ' + ['destino', 'inicio', 'fin', 'profundidad'][f], ev: 'official' };
  }
  return { group: 'reserved', label: 'Reservado ' + o, ev: 'official' };
}

export function formatValue(p, v) {
  if (!p) return String(v);
  if (p.enum) return p.enum[v] ?? ('? ' + v);
  if (p.flags) return decodeLfoFlags(v).text;
  if (p.center !== undefined) { const d = v - p.center; return (d > 0 ? '+' : '') + d + (p.unit ? ' ' + p.unit : ''); }
  return String(v);
}

export function decodeLfoFlags(v) {
  const f = { oneShot: !!(v & 1), keySync: !!(v & 2), commonSync: !!(v & 4), delayTrigger: !!(v & 8), fade: (v >> 4) & 3, extra: v & 0xC0 };
  const parts = [];
  if (f.oneShot) parts.push('one-shot'); if (f.keySync) parts.push('key sync'); if (f.commonSync) parts.push('common sync'); if (f.delayTrigger) parts.push('delay trig');
  parts.push(LFO_FADE_MODES[f.fade]);
  f.text = parts.join(' · ');
  return f;
}

// ---------------------------------------------------------------------------
// Control en vivo (guía oficial v3): Synth 1 = canal 1, Synth 2 = canal 2.
// Posición de macros por CC 80–87. Selección de patch por Program Change 0–63.
// ---------------------------------------------------------------------------
export const MIDI_MAP = { synthChannels: [0, 1], macroCC: [80, 81, 82, 83, 84, 85, 86, 87], programRange: [0, 63], sysexGapMs: 20, pgmToDumpMs: 10 };

// Escala de tiempo APROXIMADA (inferida). Novation indica para Env 3 Delay: 127 ≈ 10 s y ≈85 ≈ 1 s.
// Se asume una curva exponencial común a las envolventes. Solo para mostrar órdenes de magnitud.
export function approxSeconds(v) { return 0.0095 * Math.exp(0.0548 * v); }
export function fmtSeconds(s) { return s < 1 ? '≈' + Math.round(s * 1000) + ' ms' : '≈' + s.toFixed(s < 10 ? 1 : 0) + ' s'; }
// EQ (artículo «Synth Engine Explained»): graves 140–880 Hz, medios 440–2200 Hz, agudos 650–4400 Hz.
export const EQ_RANGES = { 105: [140, 880], 107: [440, 2200], 109: [650, 4400] };
