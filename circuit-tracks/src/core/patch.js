// Modelo decodificado de un patch y análisis técnico de su configuración.
import { PARAMS, RESERVED_RANGES, MOD_SOURCES, MOD_DESTS, OSC_WAVES, FILTER_TYPES, POLY_MODES, decodeLfoFlags, macroDestInfo, approxSeconds, fmtSeconds } from './params.js';
import { readName } from './sysex.js';

export function decodePatch(payload) {
  const b = payload, v = {};
  for (const p of PARAMS) v[p.key] = b[p.off];
  const nm = readName(b);
  const matrix = Array.from({ length: 20 }, (_, i) => {
    const o = 124 + 4 * i, s1 = b[o], s2 = b[o + 1], depth = b[o + 2], dest = b[o + 3];
    return { index: i, offset: o, s1, s2, depth, dest, active: depth !== 64, s1Name: MOD_SOURCES[s1] ?? ('? ' + s1), s2Name: MOD_SOURCES[s2] ?? ('? ' + s2), destName: MOD_DESTS[dest] ?? ('? ' + dest) };
  });
  const macros = Array.from({ length: 8 }, (_, k) => {
    const base = 204 + 17 * k;
    const slots = Array.from({ length: 4 }, (_, j) => {
      const o = base + 1 + 4 * j, dest = b[o], start = b[o + 1], end = b[o + 2], depth = b[o + 3];
      const info = macroDestInfo(dest);
      let state = 'active';
      if (depth === 64) state = start === 0 && end === 127 && dest === 0 ? 'empty' : 'zero-depth';
      else if (start === end) state = 'zero-range';
      return { slot: j, offset: o, dest, start, end, depth, depthSigned: depth - 64, state, info };
    });
    return { index: k, base, position: b[base], slots, active: slots.some((s) => s.state === 'active') };
  });
  return {
    name: nm.name, nameNonPrintable: nm.nonPrintable, category: b[16], genre: b[17], v, matrix, macros,
    lfoFlags: [decodeLfoFlags(b[91]), decodeLfoFlags(b[99])]
  };
}

// Anomalías de integridad (fuera de rango documentado, reservados no nulos…).
export function integrityCheck(payload) {
  const issues = [];
  if (payload.length !== 340) return [{ level: 'error', text: 'La carga no tiene 340 bytes' }];
  for (const p of PARAMS) {
    const x = payload[p.off];
    if (x < p.min || x > p.max) issues.push({ level: 'warn', off: p.off, text: `${p.label} (${p.group}) = ${x}, fuera del rango documentado ${p.min}–${p.max}` });
  }
  if (payload[16] > 14) issues.push({ level: 'warn', off: 16, text: `Categoría ${payload[16]} fuera de 0–14` });
  if (payload[17] > 9) issues.push({ level: 'warn', off: 17, text: `Género ${payload[17]} fuera de 0–9` });
  for (const [a, z] of RESERVED_RANGES) for (let o = a; o <= z; o++) if (payload[o] !== 0) issues.push({ level: 'info', off: o, text: `Byte reservado ${o} = ${payload[o]} (la guía indica 0)` });
  for (let i = 0; i < 20; i++) {
    const o = 124 + 4 * i;
    if (!(payload[o] in MOD_SOURCES) || !(payload[o + 1] in MOD_SOURCES)) issues.push({ level: 'warn', off: o, text: `Matriz ${i + 1}: código de fuente no documentado (${payload[o]}/${payload[o + 1]})` });
    if (payload[o + 3] > 17) issues.push({ level: 'warn', off: o + 3, text: `Matriz ${i + 1}: destino ${payload[o + 3]} fuera de 0–17` });
  }
  for (let k = 0; k < 8; k++) for (let j = 0; j < 4; j++) {
    const o = 205 + 17 * k + 4 * j;
    if (payload[o] > 70) issues.push({ level: 'warn', off: o, text: `Macro ${k + 1} ruta ${'ABCD'[j]}: destino ${payload[o]} fuera de 0–70` });
  }
  const nm = readName(payload);
  if (nm.nonPrintable) issues.push({ level: 'info', off: 0, text: `Nombre interno con ${nm.nonPrintable} carácter(es) no imprimibles` });
  if (payload.every((x) => x === 0)) issues.push({ level: 'error', text: 'Carga completamente a cero' });
  return issues;
}

// Rasgos técnicos: describen la CONFIGURACIÓN, no el sonido percibido.
// Umbrales: heurísticos y documentados aquí para poder calibrarlos.
export const T = {
  percAttack: 8, percSustain: 24, percDecayMax: 80,
  slowAttack: 48, longRelease: 72, longDecay: 90, shortDecay: 50,
  lowCutoff: 40, highCutoff: 105, highRes: 80, drive: 50, dist: 40
};

export function analyze(payload) {
  const d = decodePatch(payload), v = d.v, f = [];
  const add = (id, label, basis, kind = 'config') => f.push({ id, label, basis, kind });
  // Voz
  if (v['voice.poly'] === 2) add('poly', 'Polifónico', 'Modo de voz = Poly');
  else if (v['voice.poly'] <= 1) add('mono', 'Monofónico', 'Modo de voz = ' + POLY_MODES[v['voice.poly']]);
  if (v['voice.portamento'] > 0) add('glide', 'Glide / portamento', 'Portamento = ' + v['voice.portamento']);
  const oct = v['voice.octave'] - 64;
  const semis = [v['osc1.semi'] - 64, v['osc2.semi'] - 64];
  const audible = [v['mix.osc1'] > 10, v['mix.osc2'] > 10];
  const lowestSemi = Math.min(...semis.filter((_, i) => audible[i]), 99);
  const transpose = oct * 12 + (lowestSemi === 99 ? 0 : lowestSemi);
  if (transpose <= -12) add('low-register', 'Transpuesto a registro grave', `Octava ${oct}, semitonos ${semis.join('/')}`);
  // Una octava abajo es habitual también en leads, arps y keys de tu colección; dos o más ya es territorio de bajo.
  if (transpose <= -24) add('deep-register', 'Dos octavas o más por debajo', `Octava ${oct}, semitonos ${semis.join('/')}`);
  if (transpose >= 12) add('high-register', 'Transpuesto a registro agudo', `Octava ${oct}, semitonos ${semis.join('/')}`);
  // Envolvente de amplitud
  const A = v['env1.a'], D = v['env1.d'], S = v['env1.s'], R = v['env1.r'];
  if (A <= T.percAttack && S <= T.percSustain && D <= T.percDecayMax) add('percussive', 'Envolvente percusiva', `A ${A} · D ${D} · S ${S}`);
  else if (S >= 90 && A <= T.percAttack) add('sustained', 'Sostenido con ataque rápido', `A ${A} · S ${S}`);
  if (A >= T.slowAttack) add('slow-attack', 'Ataque lento', `Env amp attack = ${A} (${fmtSeconds(approxSeconds(A))}, escala inferida)`);
  if (A <= T.percAttack) add('fast-attack', 'Ataque rápido', 'Env amp attack = ' + A);
  if (S <= T.percSustain && D <= T.shortDecay) add('short-decay', 'Decaimiento breve', `D ${D} · S ${S}`);
  if (D >= T.longDecay && S <= T.percSustain) add('long-decay', 'Decaimiento largo', `D ${D} · S ${S}`);
  if (R >= T.longRelease) add('long-release', 'Release largo', `Env amp release = ${R} (${fmtSeconds(approxSeconds(R))}, escala inferida)`);
  // Filtro
  const ft = v['filter.type'], fq = v['filter.freq'], res = v['filter.res'], routing = v['filter.routing'];
  const lp = ft <= 1, filtered = routing !== 2;
  add('filter-' + (lp ? 'lp' : ft <= 3 ? 'bp' : 'hp'), 'Filtro ' + FILTER_TYPES[ft], 'Tipo de filtro = ' + ft);
  if (routing > 0) add('filter-bypass', routing === 2 ? 'Filtro sin osciladores (bypass 1+2)' : 'OSC 1 sin filtrar', 'Ruta del filtro = ' + routing);
  if (filtered && lp && fq <= T.lowCutoff) add('low-cutoff', 'Cutoff LP bajo', 'Frecuencia = ' + fq);
  if (filtered && lp && fq >= T.highCutoff) add('open-filter', 'Filtro LP abierto', 'Frecuencia = ' + fq);
  if (res >= T.highRes) add('high-res', 'Resonancia alta', 'Resonancia = ' + res);
  const env2amt = v['filter.env2'] - 64;
  if (Math.abs(env2amt) >= 16) add('filter-env', 'Envolvente sobre el filtro', 'Env 2 → frecuencia = ' + (env2amt > 0 ? '+' : '') + env2amt);
  if (Math.abs(env2amt) >= 16 && v['env2.s'] <= 30 && v['env2.d'] <= 70 && res >= 50) add('acid-like', 'Configuración tipo acid (resonancia + env corta al filtro)', `Res ${res} · env2 ${env2amt} · D ${v['env2.d']}`, 'hypothesis');
  // Saturación
  if (v['filter.drive'] >= T.drive) add('filter-drive', 'Drive de filtro alto', 'Drive = ' + v['filter.drive']);
  if (v['fx.dist'] >= T.dist) add('distortion', 'Distorsión configurada', 'Nivel ' + v['fx.dist']);
  // Osciladores
  const waves = [v['osc1.wave'], v['osc2.wave']];
  if (waves.some((w, i) => audible[i] && w >= 14)) add('wavetable', 'Ondas digitales / tabla', waves.map((w) => OSC_WAVES[w]).join(' + '));
  if (audible[0] && audible[1]) add('dual-osc', 'Dos osciladores audibles', `Niveles ${v['mix.osc1']}/${v['mix.osc2']}`);
  const centsDiff = Math.abs(v['osc1.cents'] - v['osc2.cents']);
  if (audible[0] && audible[1] && centsDiff >= 6 && semis[0] === semis[1]) add('detuned', 'Osciladores desafinados', 'Diferencia de cents = ' + centsDiff);
  if (v['osc1.density'] > 20 || v['osc2.density'] > 20) add('density', 'Density (unísono interno)', `Density ${v['osc1.density']}/${v['osc2.density']}, detune ${v['osc1.detune']}/${v['osc2.detune']}`);
  if (v['mix.ring'] >= 30) add('ringmod', 'Ring modulation', 'Nivel ' + v['mix.ring']);
  if (v['osc1.vsync'] > 20 || v['osc2.vsync'] > 20) add('vsync', 'Virtual sync', `VSync ${v['osc1.vsync']}/${v['osc2.vsync']}`);
  if (v['mix.noise'] >= 30) add('noise', 'Ruido destacado', 'Nivel ' + v['mix.noise']);
  if (waves.every((w, i) => !audible[i] || w <= 1) && (lp ? fq <= 80 : true)) add('pure-waves', 'Ondas simples (seno/triángulo)', waves.map((w) => OSC_WAVES[w]).join(' + '));
  // Modulación
  const routes = d.matrix.filter((m) => m.active);
  const lfoRoutes = routes.filter((m) => [6, 7, 8, 9].includes(m.s1) || [6, 7, 8, 9].includes(m.s2));
  if (lfoRoutes.length) add('lfo-mod', 'Modulación por LFO', lfoRoutes.map((m) => `${m.s1Name}→${m.destName}`).join(', '));
  const pitchLfo = lfoRoutes.filter((m) => m.dest <= 2);
  if (pitchLfo.length) add('vibrato', 'LFO sobre afinación', pitchLfo.map((m) => m.destName).join(', '));
  const filterLfo = lfoRoutes.filter((m) => m.dest === 12);
  if (filterLfo.length) {
    add('filter-lfo', 'LFO sobre el filtro', filterLfo.map((m) => m.s1Name).join(', '));
    const lfoIdx = [6, 7].includes(filterLfo[0].s1) ? 1 : 2, rate = v[`lfo${lfoIdx}.rate`], sync = v[`lfo${lfoIdx}.ratesync`];
    if (sync > 0 || (rate >= 40 && rate <= 90)) add('wobble-like', 'LFO rítmico sobre el filtro', `LFO ${lfoIdx} rate ${rate} · sync ${sync}`, 'hypothesis');
  }
  const envRoutes = routes.filter((m) => [10, 11, 12].includes(m.s1));
  if (envRoutes.some((m) => m.dest <= 2)) add('pitch-env', 'Envolvente sobre afinación', envRoutes.filter((m) => m.dest <= 2).map((m) => m.s1Name + '→' + m.destName).join(', '));
  if (routes.length >= 4) add('mod-rich', 'Matriz de modulación densa', routes.length + ' rutas activas');
  if (v['fx.chorus'] >= 40) add('chorus', v['fx.chorustype'] === 0 ? 'Phaser' : 'Chorus', 'Nivel ' + v['fx.chorus']);
  const activeMacros = d.macros.filter((m) => m.active).length;
  return { decoded: d, features: f, routes, activeMacros, transpose };
}

export function hasFeature(an, id) { return an.features.some((x) => x.id === id); }

// Resumen numérico para similitud técnica (0–1 por dimensión).
export function featureVector(payload) {
  const vec = [];
  for (const p of PARAMS) {
    if (p.flags || p.group === 'eq') continue;
    if (p.enum) { vec.push({ k: p.key, cat: payload[p.off], w: p.group === 'voice' || p.key === 'filter.type' ? 2 : 1 }); continue; }
    vec.push({ k: p.key, x: (payload[p.off] - p.min) / Math.max(1, p.max - p.min), w: /env1|filter\.(freq|res)/.test(p.key) ? 2 : 1 });
  }
  return vec;
}
