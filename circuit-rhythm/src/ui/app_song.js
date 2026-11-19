// ui/app_song.js — v1.3: 06 Canciones. Una canción completa a partir de una estrategia de arreglo:
// 8 patrones por pista, escenas por sección, escucha con tus samples, proyecto para el pack, .mid y audio.
import { songFamily, arrange, timeline, songEvents, writeProject, roadmap, mixEvents, STRATEGY_IDS } from '../core/song.js';
import { STYLES, SCALES, noteFor, toMidi } from '../core/patterns.js';
import { encodeWav16, quantize16 } from '../core/wav.js';
import { inflateRaw, zipWrite } from '../core/zip.js';

const SEC_LABEL = () => ({ intro: 'Intro', intro2: t('Intro 2'), bassin: t('Entra el bajo'), build: 'Build', drop: 'Drop', break: 'Break', drop2: t('Drop 2 (groove B)'),
  outro: 'Outro', outro2: t('Outro 2'), add: t('Suma'), peak: t('Cumbre'), sub: t('Resta'), groove: 'Groove', base: t('Base'), full: t('Completo'), fullb: t('Completo B') });
const RANGE_LABEL = { light: 'intro', groove: "A … A'·fill", groove2: 'A', alt: 'B', fillbuild: "A'·fill", build: 'build', break: 'break', off: '' };
const STRAT = () => ({
  dj: { name: t('De pista (DJ)'), desc: t('Intro y outro solo con ritmo para mezclar, build, drop, break y un segundo drop con el groove B.'),
    tips: [t('Las intros y outros llevan solo bombo y hats: así se mezcla con otro tema sin choques de bajo.'), t('El bajo entra en la tercera sección: el oído ya está asentado y se nota más.'), t('El segundo drop usa el groove B: misma energía, otra figura, el oyente no se cansa.')] },
  hypnotic: { name: t('Hipnótico'), desc: t('Suma un elemento cada 8 compases y luego los va quitando. Sin grandes cortes: la tensión sale de la repetición.'),
    tips: [t('Deja que la probabilidad de los hats y la percusión cambie cada vuelta: repetición sin monotonía.'), t('Mueve despacio el macro de filtro de una pista durante toda una sección.'), t('El único break es corto: en este estilo un corte largo rompe el trance.')] },
  peak: { name: 'Peak time', desc: t('Intro corta, drop pronto, break con build y dos drops seguidos. Para el momento álgido de una sesión.'),
    tips: [t('El build de 4 compases antes del último drop es un golpe de efecto: no lo alargues.'), t('En el build, sube el filtro maestro y suelta en el primer tiempo del drop.'), t('Usa Beat Repeat (Grid FX) en el último compás de cada build.')] },
  melodic: { name: t('Techno melódico'), desc: t('Groove largo, break de 32 compases con synth y atmósfera, build de 16 y drop final.'),
    tips: [t('En el break el bajo toca notas largas de la escala: elige bien la tónica, el sample se transpone solo.'), t('Pon en la pista 8 una atmósfera o un pad largo: es el que sostiene el break.'), t('Un drop pega más cuanto más vacío y largo es el break que lo precede.')] },
  live: { name: t('Directo (escenas)'), desc: t('Ocho escenas de 8 compases para lanzarlas a mano: base, groove, bajo, completo, B, break, build y drop.'),
    tips: [t('Lanza las escenas con Shift + pads de escena en la Rhythm: el orden lo decides tú en directo.'), t('Silencia y vuelve a activar pistas en Mixer View para alargar cualquier escena.'), t('La escena Build es corta a propósito: úsala solo antes de un Drop.')] },
});
const GENERAL_TIPS = () => [
  t('Repetición antes que variedad: cada pista repite su groove A y solo remata al final de la sección (A’ y fill). El cambio fuerte llega con la sección siguiente.'),
  t('El fill quita el bombo en el último tiempo antes de cambiar de sección: es lo que hace que el cambio se sienta.'),
  t('Contraste antes que volumen: un break sin bombo hace que el drop pegue más que subir el nivel.'),
  t('La pista 5 alterna varios sonidos de percusión (sample flip): pon en su página samples que combinen.'),
];
const LANE_NAME = ['Kick', 'Clap', 'Closed hat', 'Open hat', 'Perc', 'Bass', 'Synth', 'FX / Atmos'];
const LANE_CAT = ['kick', 'clap', 'hat', 'ohat', 'perc', 'bass', 'synth', 'atmos'];

function songState() {
  if (!S.song) S.song = { strategy: 'dj', style: 'techno', seed: 1, steps: 32, density: 0.5, root: 33, scale: 'minor', prob: true, flip: true, reshuffle: 0, locked: [], fam: null };
  return S.song;
}
function flipSlots() {
  if (!S.pack) return null;
  const pg = 48, out = [];
  for (let i = pg; i < pg + 16 && out.length < 3; i++) if (S.pack.slots[i]) out.push(i);
  return out.length > 1 ? { 4: out } : null;
}
function regenSong({ keepFam = false } = {}) {
  const s = songState();
  if (!keepFam || !s.fam) s.fam = songFamily({ style: s.style, seed: s.seed, steps: s.steps, density: s.density, root: s.root, scale: s.scale, prob: s.prob, flip: s.flip ? flipSlots() : null, locked: new Set(s.locked), prev: s.fam && s.fam.steps === s.steps ? s.fam.tracks : null });
  s.sections = arrange(s.strategy, s.seed, { reshuffle: s.reshuffle });
  saveSong();
}
let songTimer = 0;
function saveSong() { clearTimeout(songTimer); songTimer = setTimeout(() => S.lib.kvSet('song', S.song), 300); }
function curTimeline() { const s = songState(); if (!s.fam || !s.sections) regenSong(); return timeline(s.fam, s.sections); }
const songBpm = () => S.pack?.bpm || S.set.bpm;

function renderSong(v) {
  const s = songState();
  const tl = curTimeline();
  const ST = STRAT(), L = SEC_LABEL();
  const kit = typeof packKit === 'function' ? packKit() : [];
  const minutes = (tl.bars * 4) / songBpm();
  const W = 100 / tl.bars, eshape = shapePath(tl.sections, 1000, 34);
  const songsIn = S.pack?.songs ? Object.keys(S.pack.songs).map(Number) : [];
  const occupied = new Set([...(S.pack?.extra?.projects || []).map((p) => p.i), ...songsIn]);
  v.innerHTML = `<div class="songw">
  <section class="panel"><h2>${t('Estrategia')}</h2>
    <div class="strats" role="radiogroup" aria-label="${t('Estrategia')}">${STRATEGY_IDS.map((id, i) => { const secs = arrange(id, 1), sh = shapePath(secs, 120, 22), on = s.strategy === id; return `<button class="strat ${on ? 'on' : ''}" role="radio" aria-checked="${on}" data-act="sg-strat" data-v="${id}"><span class="sn"><kbd>${i + 1}</kbd>${ST[id].name}</span><svg class="shape" viewBox="0 0 120 22" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="${sh.area}"/><path class="l" d="${sh.line}"/></svg><span class="sm mono">${secs.reduce((a, x) => a + x.bars, 0)} c · ${nf((secs.reduce((a, x) => a + x.bars, 0) * 4) / songBpm(), 1)} min</span></button>`; }).join('')}</div>
    <p class="note sdesc">${ST[s.strategy].desc}</p>
    <div class="sep"></div>
    <div class="prep">
      <span class="lbl">${t('Estilo')}</span><select id="sg-style">${STYLES.map((x) => `<option value="${x}" ${s.style === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <span class="lbl">${t('Patrones de')}</span><span class="seg"><button class="${s.steps === 16 ? 'on' : ''}" data-act="sg-steps" data-v="16">1 ${t('compás')}</button><button class="${s.steps === 32 ? 'on' : ''}" data-act="sg-steps" data-v="32">2 ${t('compases')}</button></span>
      <span class="lbl">${t('Densidad')}</span><input type="range" id="sg-density" min="0" max="1" step="0.05" value="${s.density}">
      <span class="lbl">${t('Tónica')}</span><select id="sg-root">${[...Array(36).keys()].map((k) => 24 + k).map((m) => `<option value="${m}" ${s.root === m ? 'selected' : ''}>${noteLabel(m)}</option>`).join('')}</select>
      <span class="lbl">${t('Escala')}</span><select id="sg-scale">${Object.keys(SCALES).map((k) => `<option value="${k}" ${s.scale === k ? 'selected' : ''}>${k}</option>`).join('')}</select>
      <span class="lbl">${t('Variación viva')}</span><label class="inl"><input type="checkbox" id="sg-prob" ${s.prob ? 'checked' : ''}> ${t('probabilidad en golpes suaves')}<span class="tag-unv">${t('sin verificar')}</span></label>
      <span class="lbl">Sample flip</span><label class="inl"><input type="checkbox" id="sg-flip" ${s.flip ? 'checked' : ''}> ${t('varios sonidos en la percusión (página 4)')}</label>
    </div>
    <p class="note">${t('Los candados de cada pista conservan sus patrones al pedir otra canción u otros patrones.')}</p>
  </section>
  <section class="panel arr"><div class="sgbar"><button class="btn" data-act="sg-play" title="${t('Espacio')}">${S.songPlaying ? '■ ' + t('Parar') : '▶ ' + t('Escuchar la canción')}</button><span class="vsep"></span><button class="btn primary" data-act="sg-new" title="N">${t('Otra canción')}</button><button class="btn" data-act="sg-pats" title="P">${t('Otros patrones')}</button><button class="btn" data-act="sg-struct" title="E">${t('Otra estructura')}</button><span class="grow"></span><span class="mono muted">${t('semilla')} ${s.seed}</span></div>
    <div class="row"><h2 class="grow" style="margin:0">${t('Arreglo')} · ${ST[s.strategy].name}</h2><span class="muted">${t('{b} compases · {m} min a {bpm} BPM', { b: tl.bars, m: nf(minutes, 1), bpm: songBpm() })}</span></div>
    <div class="arrgrid">
      <div class="arrhead"><span></span><div class="arrsecs">${tl.sections.map((x) => `<button class="arrsec" style="width:${x.bars * W}%" data-act="sg-play-from" data-i="${x.index}" title="${t('Escuchar desde aquí')}"><b>${esc(L[x.id] || x.id)}</b><span class="mono">${sceneRange(tl, x)} · ${x.bars}</span></button>`).join('')}</div></div>
      <div class="arrlane energy"><span class="muted">${t('Energía')}</span><svg class="curve" viewBox="0 0 1000 34" preserveAspectRatio="none" aria-hidden="true">${tl.sections.slice(1).map((x) => `<line x1="${(x.start * 1000) / tl.bars}" x2="${(x.start * 1000) / tl.bars}" y1="0" y2="34"/>`).join('')}<path class="a" d="${eshape.area}"/><path class="l" d="${eshape.line}"/></svg></div>
      ${LANE_NAME.map((nm, tr) => { const sid = kit[tr] != null && S.pack ? S.pack.slots[kit[tr]] : null; return `<div class="arrlane"><span class="lanehd"><button class="lock ${s.locked.includes(tr) ? 'on' : ''}" data-act="sg-lock" data-i="${tr}" title="${t('Conservar los patrones de esta pista')}">${s.locked.includes(tr) ? LOCK_ON : LOCK_OFF}</button><span style="color:${catVar(LANE_CAT[tr])}">${tr + 1} ${nm}</span><small>${sid && S.byId[sid] ? esc(S.pack.names[kit[tr]] || S.byId[sid].name) : t('sin sample')}</small></span><div class="arrsecs">${tl.sections.map((x) => { const k = x.tracks[tr].key; return `<div class="acell r-${k}" style="width:${x.bars * W}%;--c:${catVar(LANE_CAT[tr])}">${RANGE_LABEL[k]}</div>`; }).join('')}</div></div>`; }).join('')}
      <div class="playline" id="sg-line"></div>
    </div>
    <div class="row" style="margin-top:8px"><span class="muted" id="sg-pos"></span></div>
    ${planWarn(tl, L)}
    <p class="note sgkeys"><kbd>${t('Espacio')}</kbd> ${t('escuchar / parar')} · <kbd>N</kbd> ${t('otra canción')} · <kbd>P</kbd> ${t('otros patrones')} · <kbd>E</kbd> ${t('otra estructura')} · <kbd>1</kbd>–<kbd>5</kbd> ${t('estrategia')}</p>
    <div class="grid2" style="margin-top:12px"><div><h3>${t('Estrategia')}: ${ST[s.strategy].name}</h3><ul class="tips">${ST[s.strategy].tips.map((x) => `<li>${x}</li>`).join('')}</ul></div>
      <div><h3>${t('Para que impacte')}</h3><ul class="tips">${GENERAL_TIPS().map((x) => `<li>${x}</li>`).join('')}</ul></div></div>
  </section>
  <aside class="panel"><h2>${t('Llevarla al equipo')}</h2>
    <h3>${t('Proyecto dentro del pack')}</h3>
    <p class="note" style="margin-top:0">${t('Escribe la canción como proyecto de la Rhythm: 8 patrones por pista, {n} escenas (las secciones largas son varias escenas iguales seguidas) y la cadena de escenas en orden. Viaja en el .circuitrhythmpack (04 Packs → Para Components).', { n: tl.scenes.length })}<span class="tag-unv">${t('experimental · sin verificar en tu equipo')}</span></p>
    ${S.pack ? `<div class="row"><label class="inl">${t('Proyecto')} <select id="sg-slot">${[...Array(64).keys()].map((i) => `<option value="${i}" ${(S._songSlot ?? 1) === i ? 'selected' : ''}>${i + 1}${occupied.has(i) ? ' ●' : ''}</option>`).join('')}</select></label><button class="btn" data-act="sg-topack">${t('Guardar en «{p}»', { p: esc(S.pack.name) })}</button></div>
      ${songsIn.length ? `<p class="note">${t('Canciones en este pack: proyectos {l}.', { l: songsIn.map((i) => i + 1).join(', ') })} <button class="btn small ghost" data-act="sg-clearpack">${t('Quitarlas')}</button></p>` : ''}` : `<p class="muted">${t('Crea un pack en 04 Packs: el kit de la canción sale de sus slots.')}</p>`}
    <div class="sep"></div>
    <h3>${t('Para Ableton u otro DAW')}</h3>
    <div class="row"><select id="sg-midmode"><option value="rhythm">${t('.mid: canales de la Rhythm')}</option><option value="drumrack">${t('.mid: Drum Rack (canal 10)')}</option></select><button class="btn" data-act="sg-mid">${t('Exportar .mid')}</button></div>
    <div class="row" style="margin-top:8px"><button class="btn" data-act="sg-audio">${t('Audio de la canción (WAV)')}</button><label class="inl"><input type="checkbox" id="sg-stems"> ${t('con pistas separadas')}</label></div>
    <p class="note">${t('El audio se calcula con tus samples preparados (sin los efectos ni el mezclador de la Rhythm): sirve de maqueta o de base para producir. Va en un ZIP con el .mid y la hoja de ruta.')}</p>
    <div class="sep"></div>
    <h3>${t('Hoja de ruta')}</h3>
    <table class="t rm"><tr class="muted"><td>${t('Esc.')}</td><td>${t('Sección')}</td><td>${t('Comp.')}</td><td>${t('Pistas')}</td></tr>${roadmap(s.fam, tl, L, songBpm()).map((r) => `<tr class="${r.same ? 'dup' : ''}"><td class="mono">${r.scene}</td><td>${r.same ? `<span class="muted">= ${r.same}</span>` : esc(r.label)}${r.of > 1 && !r.same ? ` <span class="muted mono">×${r.of}</span>` : ''}${r.end ? ` <span class="muted" title="${t('Última escena de la sección: el groove remata con A\' y fill')}">· ${t('remate')}</span>` : ''}</td><td class="mono">${r.bars}</td><td class="mono muted">${r.tracks}</td></tr>`).join('')}</table>
    <p class="note">${t('Más repetición, como en la pista: en cada sección el groove repite A y las escenas del medio tocan solo A; la última escena remata con A\' (un cambio sutil en el último tiempo) y el fill.')}</p>
    ${tl.timers ? `<p class="note">${t('Las pistas en silencio tocan el patrón 8, vacío y alargado ({b} compases): marca cuánto dura cada escena aunque las demás cadenas sean más cortas.', { b: [...new Set(tl.timers)].sort((a, b) => a - b).join(' / ') })}<span class="tag-unv">${t('sin verificar')}</span></p>` : ''}
    <button class="btn small" data-act="sg-sheet" style="margin-top:6px">${t('Descargar hoja de ruta')}</button>
  </aside></div>`;
}

const LOCK_ON = '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>';
const LOCK_OFF = '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V7a4 4 0 017.5-2"/></svg>';
// Forma de energía: tramos planos unidos por rampas cortas, en unidades de compás
function shapePath(sections, w, h, pad = 2) {
  const total = sections.reduce((a, x) => a + x.bars, 0) || 1, k = w / total, ramp = Math.min(1.5, total / 80);
  const y = (e) => (pad + (1 - e) * (h - 2 * pad)).toFixed(2);
  let x = 0, d = '';
  sections.forEach((sc, i) => {
    const x0 = x * k, x1 = (x + sc.bars) * k;
    d += (i ? ` L${(x0 + ramp * k).toFixed(2)} ${y(sc.energy)}` : `M0 ${y(sc.energy)}`) + ` L${(x1 - (i < sections.length - 1 ? ramp * k : 0)).toFixed(2)} ${y(sc.energy)}`;
    x += sc.bars;
  });
  return { line: d, area: `${d} L${w} ${h} L0 ${h} Z` };
}

// Escenas que ocupa una sección («esc. 3–6»)
function sceneRange(tl, x) {
  const sc = tl.scenes.filter((y) => y.sec === x.index); if (!sc.length) return '—';
  return sc.length === 1 ? t('esc. {n}', { n: sc[0].n }) : t('esc. {a}–{b}', { a: sc[0].n, b: sc[sc.length - 1].n });
}
// Avisos del plan: secciones que cambian de largo para encajar o que no caben en 16 escenas
function planWarn(tl, L) {
  const out = [];
  if (tl.changed.length) out.push(t('Para que la Rhythm lo toque tal cual: {l}.', { l: tl.changed.map((x) => `${esc(L[x.id] || x.id)} ${x.from} → ${x.to} ${t('comp.')}`).join(', ') }));
  if (tl.cut.length) out.push(t('No caben en 16 escenas y se quedan fuera: {l}. Prueba otra estructura (E).', { l: tl.cut.map((x) => esc(L[x] || x)).join(', ') }));
  return out.length ? `<p class="note warnline">${out.join(' ')}</p>` : '';
}

// ---------- audio: escucha y render ----------
async function slotBuffers(ctx, slots) {
  const out = new Map();
  for (const sl of slots) {
    if (sl == null || out.has(sl)) continue;
    const id = S.pack?.slots[sl]; const sm = id && S.byId[id];
    if (!sm) continue;
    try { const r = await renderedOf(sm); const b = ctx.createBuffer(1, r.data.length, 48000); b.copyToChannel(r.data, 0); out.set(sl, b); } catch {}
  }
  return out;
}
function songKit() { const kit = packKit(); return { kit, midi: kit.map(sampleMidiOf) }; }
function allSlotsOf(ev, kit) { const set = new Set(kit.filter((x) => x != null)); for (const e of ev) if (e.sl != null) set.add(e.sl); return [...set]; }
// programa eventos en un contexto (en vivo u offline); pistas monofónicas como en la Rhythm
function scheduleSong(ctx, dest, ev, bufs, kit, midi, t0, stepSec, last, fromStep = 0, swing = 50) {
  const s = songState();
  for (const e of ev) {
    if (e.step < fromStep) continue;
    const slot = e.sl != null ? e.sl : kit[e.t];
    const b = bufs.get(slot); if (!b) continue;
    const at = t0 + (e.step - fromStep) * stepSec + (e.step % 2 ? Math.max(0, swing - 50) / 50 * stepSec : 0);
    if (last[e.t]) try { last[e.t].stop(at); } catch {}
    const src = ctx.createBufferSource(); src.buffer = b;
    if (e.n != null && (e.t === 5 || e.t === 6)) src.playbackRate.value = Math.pow(2, (noteFor(e.n, s.fam.root, midi[e.t]) - 60) / 12);
    const g = ctx.createGain(); g.gain.value = 0.75 * Math.pow(e.v / 127, 1.4);
    src.connect(g).connect(dest); src.start(at); last[e.t] = src;
  }
}
const SongPlay = { srcs: [], t0: 0, from: 0, raf: 0 };
async function playSong(fromSection = 0) {
  if (S.songPlaying) { stopSong(); renderView(); return; }
  const s = songState(); const tl = curTimeline(); const { kit, midi } = songKit();
  const ev = songEvents(s.fam, tl);
  const ctx = Player.ensure();
  const bufs = await slotBuffers(ctx, allSlotsOf(ev, kit));
  if (!bufs.size) { toast(t('El kit no tiene samples: elige uno por pista en 05 Patrones o crea un pack.'), 'warn'); return; }
  const stepSec = 60 / songBpm() / 4;
  const from = (tl.sections.find((x) => x.index === fromSection) || tl.sections[0]).start * 16;
  const master = ctx.createGain(); master.connect(ctx.destination);
  const last = []; SongPlay.master = master;
  SongPlay.t0 = ctx.currentTime + 0.1; SongPlay.from = from; SongPlay.total = tl.bars * 16;
  // por tramos para no crear miles de nodos de golpe
  let next = from;
  const chunk = () => {
    if (!S.songPlaying) return;
    const until = from + Math.floor((ctx.currentTime - SongPlay.t0 + 6) / stepSec);
    if (next < Math.min(until, SongPlay.total)) {
      scheduleSong(ctx, master, ev.filter((e) => e.step >= next && e.step < until), bufs, kit, midi, SongPlay.t0 + (next - from) * stepSec, stepSec, last, next, s.fam ? S.pat?.swing || 50 : 50);
      next = until;
    }
  };
  S.songPlaying = true; chunk(); SongPlay.timer = setInterval(chunk, 1000);
  const tick = () => {
    if (!S.songPlaying) return;
    const step = from + (ctx.currentTime - SongPlay.t0) / stepSec;
    if (step >= SongPlay.total) { stopSong(); renderView(); return; }
    const line = document.getElementById('sg-line'), pos = document.getElementById('sg-pos');
    if (line) line.style.left = `calc(170px + (100% - 170px) * ${Math.max(0, step) / SongPlay.total})`;
    if (pos) pos.textContent = t('compás {b} de {n}', { b: Math.max(1, Math.floor(step / 16) + 1), n: tl.bars });
    SongPlay.raf = requestAnimationFrame(tick);
  };
  renderView(); tick();
}
function stopSong() {
  S.songPlaying = false; clearInterval(SongPlay.timer); cancelAnimationFrame(SongPlay.raf);
  try { SongPlay.master && SongPlay.master.disconnect(); } catch {}
}
async function renderSongAudio(withStems) {
  const s = songState(); const tl = curTimeline(); const { kit, midi } = songKit();
  const stepSec = 60 / songBpm() / 4;
  const len = Math.ceil((tl.bars * 16 * stepSec + 4) * 48000);
  const busy = startBusy(t('Calculando el audio de la canción'), withStems ? 9 : 1);
  const files = [];
  try {
    const evAll = songEvents(s.fam, tl);
    const data = new Map();
    for (const sl of allSlotsOf(evAll, kit)) {
      const id = S.pack?.slots[sl]; const sm = id && S.byId[id];
      if (sm) try { data.set(sl, (await renderedOf(sm)).data); } catch {}
    }
    if (!data.size) { toast(t('El kit no tiene samples: elige uno por pista en 05 Patrones o crea un pack.'), 'warn'); return null; }
    const one = async (onlyTrack) => { await yieldUI(); return mixEvents(evAll, (sl) => data.get(sl), { kit, midi, root: s.fam.root, stepSec, swing: S.pat?.swing || 50, len, onlyTrack }); };
    busy.step(0, t('mezcla'));
    const mix = await one(null);
    let pk = 0; for (let i = 0; i < mix.length; i++) pk = Math.max(pk, Math.abs(mix[i]));
    const gain = pk > 0 ? Math.pow(10, -1 / 20) / pk : 1; // −1 dBFS, la misma ganancia para todo
    const norm = (x) => { const y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) y[i] = x[i] * gain; return y; };
    const name = safeName(`${STRAT()[s.strategy].name} ${s.style} ${s.seed}`);
    files.push({ name: `${name}/${name} (mix).wav`, data: encodeWav16(quantize16(norm(mix)), 48000) });
    if (withStems) for (let tr = 0; tr < 8; tr++) {
      if (busy.cancel) break;
      busy.step(tr + 1, LANE_NAME[tr]);
      const x = await one(tr);
      if (!x.some((v) => v !== 0)) continue;
      files.push({ name: `${name}/stems/${tr + 1} ${LANE_NAME[tr].replace('/', '-')}.wav`, data: encodeWav16(quantize16(norm(x)), 48000) });
    }
    files.push({ name: `${name}/${name}.mid`, data: songMidi() });
    files.push({ name: `${name}/${t('hoja de ruta')}.txt`, data: sheetText() });
    return { name, zip: await zipWrite(files, { compress: false }) };
  } finally { busy.done(); }
}

// ---------- .mid de la canción y hoja de ruta ----------
function songMidi(mode = 'rhythm') {
  const s = songState(); const tl = curTimeline(); const { midi } = songKit();
  const ev = songEvents(s.fam, tl);
  // una pista ficticia por carril con todos los pasos de la canción, para reutilizar toMidi
  const steps = tl.bars * 16;
  const lanes = Array.from({ length: 8 }, (_, tr) => ({ role: LANE_CAT[tr], track: tr, melodic: tr === 5 || tr === 6, steps: Array(steps).fill(null) }));
  for (const e of ev) lanes[e.t].steps[e.step] = { v: e.v, n: e.n };
  return toMidi({ root: s.fam.root, lanes }, { bpm: songBpm(), mode, sampleMidi: midi, channels: S.set.channels, swing: S.pat?.swing || 50 });
}
function sheetText() {
  const s = songState(); const tl = curTimeline(); const L = SEC_LABEL(); const ST = STRAT();
  const rows = roadmap(s.fam, tl, L, songBpm());
  const head = [`${ST[s.strategy].name} · ${s.style} · ${t('semilla')} ${s.seed} · ${songBpm()} BPM · ${t('{b} compases', { b: tl.bars })} · ${t('{n} escenas', { n: tl.scenes.length })}`, '',
    t('La canción ya va escrita en el proyecto: esto es para entenderla o rehacerla a mano.'),
    t('Escena · sección · compases · segundos · cadena de patrones de cada pista (K C H O P B S F; 8⏱ = patrón 8, reloj de la escena)'), ''];
  const body = rows.map((r) => `${String(r.scene).padStart(2)} · ${(r.same ? '= ' + r.same + ' (Duplicate)' : r.label).padEnd(20)} · ${String(r.bars).padStart(2)} ${t('comp.')} · ${String(r.sec).padStart(3)} s · ${r.chains.map((c) => (c || '·').padEnd(4)).join(' ')}`);
  const warn = tl.changed.length || tl.cut.length ? ['', ...[tl.changed.length ? t('Para que la Rhythm lo toque tal cual: {l}.', { l: tl.changed.map((x) => `${L[x.id] || x.id} ${x.from} → ${x.to}`).join(', ') }) : '', tl.cut.length ? t('No caben en 16 escenas y se quedan fuera: {l}. Prueba otra estructura (E).', { l: tl.cut.map((x) => L[x] || x).join(', ') }) : ''].filter(Boolean)] : [];
  const how = ['', t('En la Rhythm'), '- ' + t('Cadena de escenas: mantén pulsada la primera escena y pulsa la última (ya viene hecha en el proyecto).'),
    '- ' + t('Copiar una escena: mantén Duplicate, pulsa la escena de origen y luego la de destino.'),
    '- ' + t('Cada escena suena una vez y dura lo que su cadena más larga; las cadenas cortas dan vueltas dentro.')];
  const tips = ['', t('Consejos'), ...ST[s.strategy].tips.map((x) => '- ' + x), ...GENERAL_TIPS().map((x) => '- ' + x)];
  return [...head, ...body, ...warn, ...how, ...tips].join('\n');
}

// ---------- acciones ----------
Object.assign(ACT, {
  'sg-strat': (el) => { const st = songState(); st.strategy = el.dataset.v; st.reshuffle = 0; regenSong({ keepFam: true }); if (S.songPlaying) stopSong(); renderView(); },
  'sg-new': () => { const s = songState(); s.seed++; s.reshuffle = 0; regenSong(); renderView(); },
  'sg-pats': () => { const s = songState(); s.seed++; const sec = s.sections; regenSong(); s.sections = sec; saveSong(); renderView(); },
  'sg-struct': () => { const s = songState(); s.reshuffle++; regenSong({ keepFam: true }); renderView(); },
  'sg-steps': (el) => { const s = songState(); s.steps = +el.dataset.v; s.locked = []; regenSong(); renderView(); },
  'sg-lock': (el) => { const s = songState(), i = +el.dataset.i; s.locked = s.locked.includes(i) ? s.locked.filter((x) => x !== i) : [...s.locked, i]; saveSong(); renderView(); },
  'sg-play': () => playSong(0),
  'sg-play-from': (el) => { if (S.songPlaying) stopSong(); playSong(+el.dataset.i); },
  'sg-mid': () => { const s = songState(); download(songMidi(document.getElementById('sg-midmode').value), `${safeName(STRAT()[s.strategy].name + ' ' + s.style + ' ' + s.seed)}.mid`, 'audio/midi'); },
  'sg-sheet': () => { const s = songState(); download(sheetText(), `${safeName(t('hoja de ruta') + ' ' + s.style + ' ' + s.seed)}.txt`, 'text/plain'); },
  'sg-audio': async () => {
    try { const r = await renderSongAudio(document.getElementById('sg-stems').checked); if (r) { download(r.zip, r.name + '.zip', 'application/zip'); toast(t('Audio listo: mezcla, .mid y hoja de ruta en un ZIP.')); } }
    catch (e) { toast(esc(errT(e.message)), 'bad'); }
  },
  'sg-topack': async () => {
    if (!S.pack) return;
    const s = songState(); const tl = curTimeline(); const { kit, midi } = songKit();
    const slot = S._songSlot ?? +document.getElementById('sg-slot').value;
    try {
      const tpl = await songTemplate();
      const name = `${STRAT()[s.strategy].name} ${s.seed}`.slice(0, 32);
      const data = writeProject(tpl, s.fam, tl, { name, tempo: songBpm(), swing: S.pat?.swing || 50, kit, sampleMidi: midi });
      S.pack.songs = { ...(S.pack.songs || {}), [slot]: { name, data } };
      await savePack(S.pack);
      const over = (S.pack.extra?.projects || []).some((p) => p.i === slot);
      toast(t('Canción guardada como proyecto {n} de «{p}». Exporta el pack para Components (04 Packs) y envíalo a la Rhythm.', { n: slot + 1, p: esc(S.pack.name) }) + (over ? `<br><span class="warn">${t('Sustituye al proyecto {n} que traía el pack importado.', { n: slot + 1 })}</span>` : ''), over ? 'warn' : 'ok', 10000);
      renderView();
    } catch (e) { toast(esc(errT(e.message)), 'bad'); }
  },
  'sg-clearpack': async () => { if (!S.pack) return; delete S.pack.songs; await savePack(S.pack); renderView(); },
});
async function songTemplate() {
  if (S._ncsTpl) return S._ncsTpl;
  const b64 = typeof __NCS_TPL__ !== 'undefined' ? __NCS_TPL__ : '';
  if (!b64) throw new Error('falta la plantilla de proyecto');
  const u8 = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  S._ncsTpl = await inflateRaw(u8);
  return S._ncsTpl;
}
document.addEventListener('change', (ev) => {
  const el = ev.target; if (!(el.id || '').startsWith('sg-')) return;
  const st = songState();
  if (el.id === 'sg-style') { st.style = el.value; regenSong(); }
  else if (el.id === 'sg-density') { st.density = +el.value; regenSong(); }
  else if (el.id === 'sg-root') { st.root = +el.value; if (st.fam) st.fam.root = st.root; saveSong(); }
  else if (el.id === 'sg-scale') { st.scale = el.value; regenSong(); }
  else if (el.id === 'sg-prob') { st.prob = el.checked; regenSong(); }
  else if (el.id === 'sg-flip') { st.flip = el.checked; regenSong(); }
  else if (el.id === 'sg-slot') { S._songSlot = +el.value; return; }
  else return;
  if (S.songPlaying) stopSong();
  renderView();
});

// Teclado en 06 Canciones
document.addEventListener('keydown', (e) => {
  if (S.view !== 'songs' || e.ctrlKey || e.metaKey || e.altKey || e.target.matches?.('input,textarea,select') || document.querySelector('.modal,.busy')) return;
  const k = e.key.toLowerCase();
  const go = (f) => { e.preventDefault(); e.stopPropagation(); f(); };
  if (e.code === 'Space') go(() => playSong(0));
  else if (k === 'n') go(ACT['sg-new']); else if (k === 'p') go(ACT['sg-pats']); else if (k === 'e') go(ACT['sg-struct']);
  else if (/^[1-5]$/.test(k) && STRATEGY_IDS[+k - 1]) go(() => ACT['sg-strat']({ dataset: { v: STRATEGY_IDS[+k - 1] } }));
}, true);
