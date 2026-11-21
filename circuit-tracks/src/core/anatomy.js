// Anatomía de un patch: bloques del flujo de señal, rutas de modulación (matriz y macros) y una
// «receta» en lenguaje llano. Flujo según Novation («Synth Engine Explained»):
// OSC 1/2 + ruido + ring → mezcla → pre-FX → drive → filtro → distorsión → chorus/phaser → EQ → post-FX.
import { OSC_WAVES, LFO_WAVES, FILTER_TYPES, DRIVE_TYPES, POLY_MODES, MOD_SOURCES, MOD_DESTS, approxSeconds, fmtSeconds, decodeLfoFlags, macroDestInfo } from './params.js';
import { decodePatch } from './patch.js';

const sgn = (v) => (v > 0 ? '+' : '') + v;
const pct = (v) => Math.round(v / 127 * 100) + ' %';
// Bloque del flujo al que afecta cada destino de la matriz.
const MOD_TARGET_BLOCK = ['osc1', 'osc1', 'osc2', 'osc1', 'osc2', 'osc1', 'osc2', 'osc1', 'osc2', 'noise', 'ring', 'drive', 'filter', 'filter', 'lfo1', 'lfo2', 'env1', 'env2'];
const SRC_BLOCK = { 4: 'vel', 5: 'key', 6: 'lfo1', 7: 'lfo1', 8: 'lfo2', 9: 'lfo2', 10: 'env1', 11: 'env2', 12: 'env3', 0: 'direct' };
const MACRO_GROUP_BLOCK = { osc: 'osc', mixer: 'mix', filter: 'filter', env: 'env', lfo: 'lfo', fx: 'fx', matrix: 'matrix', voice: 'voice' };

export function macroTargetBlock(code) {
  const d = macroDestInfo(code), o = d.off;
  if (o === null || o === undefined) return 'unknown';
  if (o === 33) return 'voice'; if (o === 59) return 'out';
  if (o >= 37 && o <= 43) return 'osc1'; if (o >= 46 && o <= 52) return 'osc2';
  if (o === 54 || o === 55) return o === 54 ? 'osc1' : 'osc2'; if (o === 56) return 'ring'; if (o === 57) return 'noise';
  if (o === 61) return 'drive'; if (o >= 64 && o <= 68) return 'filter';
  if (o >= 70 && o <= 73) return 'env1'; if (o >= 75 && o <= 78) return 'env2'; if (o >= 79 && o <= 83) return 'env3';
  if (o >= 86 && o <= 90) return 'lfo1'; if (o >= 94 && o <= 98) return 'lfo2';
  if (o === 100) return 'dist'; if (o >= 102 && o <= 123) return 'chorus';
  if (o >= 126 && o <= 203) return 'matrix';
  return MACRO_GROUP_BLOCK[d.group] || 'unknown';
}

export function anatomy(payload) {
  const d = decodePatch(payload), v = d.v;
  const lvl1 = v['mix.osc1'], lvl2 = v['mix.osc2'];
  const blocks = {
    osc1: { on: lvl1 > 0, title: 'OSC 1', line: `${OSC_WAVES[v['osc1.wave']]} · ${pct(lvl1)}` },
    osc2: { on: lvl2 > 0, title: 'OSC 2', line: `${OSC_WAVES[v['osc2.wave']]} · ${pct(lvl2)}` },
    noise: { on: v['mix.noise'] > 0, title: 'Ruido', line: pct(v['mix.noise']) },
    ring: { on: v['mix.ring'] > 0, title: 'Ring', line: pct(v['mix.ring']) },
    drive: { on: v['filter.drive'] > 0, title: 'Drive', line: `${DRIVE_TYPES[v['filter.drivetype']]} · ${v['filter.drive']}` },
    filter: { on: true, title: 'Filtro', line: `${FILTER_TYPES[v['filter.type']]} · ${v['filter.freq']} / Q ${v['filter.res']}` },
    dist: { on: v['fx.dist'] > 0, title: 'Distorsión', line: `${DRIVE_TYPES[v['fx.disttype']]} · ${v['fx.dist']}` },
    chorus: { on: v['fx.chorus'] > 0, title: v['fx.chorustype'] ? 'Chorus' : 'Phaser', line: pct(v['fx.chorus']) },
    eq: { on: [106, 108, 110].some((o) => payload[o] !== 64), title: 'EQ', line: [106, 108, 110].map((o) => sgn(payload[o] - 64)).join(' / ') },
    out: { on: true, title: 'Salida', line: `post ${sgn(v['mix.postfx'] - 64)}` },
    env1: { on: true, title: 'Env 1 · amp', line: `A ${fmtSeconds(approxSeconds(v['env1.a']))} · S ${pct(v['env1.s'])}` },
    env2: { on: Math.abs(v['filter.env2'] - 64) > 0 || d.matrix.some((m) => m.active && (m.s1 === 11 || m.s2 === 11)), title: 'Env 2 · filtro', line: `A ${fmtSeconds(approxSeconds(v['env2.a']))} · D ${fmtSeconds(approxSeconds(v['env2.d']))}` },
    env3: { on: d.matrix.some((m) => m.active && (m.s1 === 12 || m.s2 === 12)), title: 'Env 3', line: `D ${fmtSeconds(approxSeconds(v['env3.d']))}` },
    lfo1: { on: d.matrix.some((m) => m.active && [6, 7].includes(m.s1) || m.active && [6, 7].includes(m.s2)), title: 'LFO 1', line: `${LFO_WAVES[v['lfo1.wave']]} · ${v['lfo1.ratesync'] ? 'sync ' + v['lfo1.ratesync'] : 'rate ' + v['lfo1.rate']}` },
    lfo2: { on: d.matrix.some((m) => m.active && [8, 9].includes(m.s1) || m.active && [8, 9].includes(m.s2)), title: 'LFO 2', line: `${LFO_WAVES[v['lfo2.wave']]} · ${v['lfo2.ratesync'] ? 'sync ' + v['lfo2.ratesync'] : 'rate ' + v['lfo2.rate']}` }
  };
  // Rutas: envolvente 2 fija al filtro, matriz, macros.
  const routes = [];
  if (v['filter.env2'] !== 64) routes.push({ from: 'env2', to: 'filter', via: 'fixed', depth: v['filter.env2'] - 64, label: `Env 2 → frecuencia ${sgn(v['filter.env2'] - 64)}` });
  for (const m of d.matrix) if (m.active) {
    const from = SRC_BLOCK[m.s1] ?? 'direct', from2 = m.s2 ? SRC_BLOCK[m.s2] : null;
    routes.push({ from, from2, to: MOD_TARGET_BLOCK[m.dest] || 'unknown', via: 'matrix', slot: m.index, depth: m.depth - 64, label: `${MOD_SOURCES[m.s1] ?? '?'}${m.s2 ? ' × ' + (MOD_SOURCES[m.s2] ?? '?') : ''} → ${MOD_DESTS[m.dest] ?? '?'} ${sgn(m.depth - 64)}` });
  }
  for (const k of d.macros) for (const s of k.slots) if (s.state === 'active') routes.push({ from: 'm' + (k.index + 1), to: macroTargetBlock(s.dest), via: 'macro', knob: k.index, depth: s.depthSigned, label: `M${k.index + 1} → ${s.info.label} ${sgn(s.depthSigned)} (${s.start}–${s.end})` });
  for (const r of routes) if (blocks[r.to]) blocks[r.to].modulated = true;
  return { blocks, routes, recipe: recipe(payload, d), decoded: d };
}

function recipe(payload, d) {
  const v = d.v, out = [];
  // Voz
  const oct = v['voice.octave'] - 64;
  let voice = POLY_MODES[v['voice.poly']] === 'Poly' ? 'Polifónico (hasta 6 voces)' : v['voice.poly'] === 1 ? 'Monofónico con glide solo en legato' : 'Monofónico';
  if (v['voice.portamento']) voice += `, portamento ${v['voice.portamento']}`;
  if (v['voice.preglide'] !== 64) voice += `, pre-glide ${sgn(v['voice.preglide'] - 64)} st`;
  if (oct) voice += `, octava de teclado ${sgn(oct)}`;
  out.push({ k: 'Voz', t: voice + '.' });
  // Osciladores
  const oscTxt = (n) => {
    const b = 'osc' + n, parts = [OSC_WAVES[v[b + '.wave']].toLowerCase()];
    const semi = v[b + '.semi'] - 64, cents = v[b + '.cents'] - 64;
    if (semi) parts.push(semi % 12 === 0 ? `${sgn(semi / 12)} oct` : `${sgn(semi)} st`);
    if (cents) parts.push(`${sgn(cents)} cents`);
    if (v[b + '.density']) parts.push(`density ${v[b + '.density']}${v[b + '.detune'] ? ' con detune ' + v[b + '.detune'] : ''}`);
    if (v[b + '.vsync']) parts.push(`vsync ${v[b + '.vsync']}`);
    if (v[b + '.wave'] >= 12 && v[b + '.pw'] !== 64) parts.push(`índice ${sgn(v[b + '.pw'] - 64)}`);
    return `OSC ${n}: ${parts.join(', ')} al ${pct(v['mix.osc' + n])}`;
  };
  const oscs = [v['mix.osc1'] > 0 && oscTxt(1), v['mix.osc2'] > 0 && oscTxt(2)].filter(Boolean);
  if (v['mix.noise']) oscs.push(`ruido al ${pct(v['mix.noise'])}`);
  if (v['mix.ring']) oscs.push(`ring mod 1×2 al ${pct(v['mix.ring'])}`);
  out.push({ k: 'Fuentes', t: (oscs.join('; ') || 'Sin fuentes audibles (niveles a 0)') + '.' });
  // Filtro
  const ft = FILTER_TYPES[v['filter.type']], env2 = v['filter.env2'] - 64;
  let f = `${ft}, frecuencia ${v['filter.freq']}, resonancia ${v['filter.res']}`;
  if (v['filter.drive']) f += `, drive ${DRIVE_TYPES[v['filter.drivetype']].toLowerCase()} ${v['filter.drive']}`;
  if (env2) f += `. La envolvente 2 ${env2 > 0 ? 'lo abre' : 'lo cierra'} ${sgn(env2)} (ataque ${fmtSeconds(approxSeconds(v['env2.a']))}, decay ${fmtSeconds(approxSeconds(v['env2.d']))}, sustain ${pct(v['env2.s'])})`;
  if (v['filter.routing'] === 1) f += '. OSC 1 no pasa por el filtro';
  if (v['filter.routing'] === 2) f += '. Los osciladores no pasan por el filtro (solo el ruido)';
  if (v['filter.track'] < 127) f += `. Seguimiento de teclado ${v['filter.track']}`;
  out.push({ k: 'Filtro', t: f + '.' });
  // Amplitud
  const A = v['env1.a'], D = v['env1.d'], S = v['env1.s'], R = v['env1.r'];
  const shape = S <= 24 && A <= 8 ? 'percusiva' : A >= 48 ? 'de entrada lenta' : S >= 100 ? 'sostenida' : 'intermedia';
  out.push({ k: 'Amplitud', t: `Envolvente ${shape}: ataque ${fmtSeconds(approxSeconds(A))}, decay ${fmtSeconds(approxSeconds(D))}, sustain ${pct(S)}, release ${fmtSeconds(approxSeconds(R))}${v['env1.vel'] !== 64 ? `, velocidad ${sgn(v['env1.vel'] - 64)}` : ''}. Tiempos aproximados.` });
  // Modulación
  const mods = d.matrix.filter((m) => m.active).map((m) => {
    let src = MOD_SOURCES[m.s1] ?? '?';
    const lfoN = [6, 7].includes(m.s1) ? 1 : [8, 9].includes(m.s1) ? 2 : 0;
    if (lfoN) { const w = LFO_WAVES[v[`lfo${lfoN}.wave`]].toLowerCase(), sy = v[`lfo${lfoN}.ratesync`]; src += ` (${w}, ${sy ? 'sincronizado ' + sy : 'rate ' + v[`lfo${lfoN}.rate`]}${decodeLfoFlags(payload[lfoN === 1 ? 91 : 99]).keySync ? ', key sync' : ''})`; }
    return `${src}${m.s2 ? ' × ' + (MOD_SOURCES[m.s2] ?? '?') : ''} → ${MOD_DESTS[m.dest] ?? '?'} ${sgn(m.depth - 64)}`;
  });
  out.push({ k: 'Modulación', t: mods.length ? mods.join('; ') + '.' : 'Sin rutas activas en la matriz: el timbre solo se mueve con las envolventes y las macros.' });
  // Efectos
  const fx = [];
  if (v['fx.dist']) fx.push(`distorsión ${DRIVE_TYPES[v['fx.disttype']].toLowerCase()} ${v['fx.dist']}`);
  if (v['fx.chorus']) fx.push(`${v['fx.chorustype'] ? 'chorus' : 'phaser'} ${v['fx.chorus']} (rate ${v['fx.chorusrate']}, feedback ${sgn(v['fx.chorusfb'] - 64)})`);
  const eq = [[106, 'graves'], [108, 'medios'], [110, 'agudos']].filter(([o]) => payload[o] !== 64).map(([o, n]) => `${n} ${sgn(payload[o] - 64)}`);
  if (eq.length) fx.push('EQ ' + eq.join(', '));
  out.push({ k: 'Efectos', t: fx.length ? fx.join('; ') + '.' : 'Sin efectos de patch activos.' });
  // Macros
  const mac = d.macros.filter((k) => k.active).map((k) => `M${k.index + 1}: ${k.slots.filter((s) => s.state === 'active').map((s) => `${s.info.label} ${sgn(s.depthSigned)}`).join(' + ')}`);
  out.push({ k: 'Macros', t: mac.length ? mac.join(' · ') + '.' : 'Ninguna macro tiene efecto.' });
  return out;
}
