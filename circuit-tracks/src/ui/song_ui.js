// Circuit Tracks · sección Canciones (v2.7). Se empaqueta después de app.js, en el mismo ámbito.
// De patrones sueltos a una canción entera: estrategia de arreglo, 8 patrones por pista, escucha en el equipo,
// grabación guiada patrón a patrón, hoja de ruta para montar las escenas y .mid de la canción para Ableton.
import { songFamily, arrange, songTimeline, songNotes, slotEvents, usedSlots, songToMidi, songRoadmap, songKeyName, SONG_TRACKS, SLOT_ROLES, SONG_SYNTH_STYLES, STRATEGY_IDS } from '../core/song.js';
import { STYLES, DRUM_STYLES, SCALES, NOTE_NAMES_ES, DRUM_NOTES } from '../core/patterns.js';

const SG_SEC = () => ({ intro: 'Intro', intro2: 'Intro 2', bassin: 'Entra el bajo', build: 'Build', drop: 'Drop', break: 'Break', drop2: 'Drop 2 (groove B)', outro: 'Outro', outro2: 'Outro 2',
  add: 'Suma', peak: 'Cumbre', sub: 'Resta', groove: 'Groove', base: 'Base', full: 'Completo', fullb: 'Completo B' });
const SG_STRAT = {
  dj: { name: 'De pista (DJ)', desc: 'Intro y outro solo con ritmo para mezclar, build, drop, break y un segundo drop con el groove B.',
    tips: ['Las intros y outros llevan solo bombo y charles: así se mezcla con otro tema sin choques de bajo.', 'El bajo (Synth 1) entra en la tercera sección: el oído ya está asentado y se nota más.', 'El segundo drop usa el groove B: misma energía, otra figura, el oyente no se cansa.'] },
  hypnotic: { name: 'Hipnótico', desc: 'Suma un elemento cada 8 compases y luego los va quitando. Sin grandes cortes: la tensión sale de la repetición.',
    tips: ['Mueve despacio una macro de filtro de Synth 1 durante toda una sección: es la variación que pide este estilo.', 'El único break es corto: en este estilo un corte largo rompe el trance.', 'Prueba la probabilidad de los pasos de Drum 3 y 4 en el Circuit: repetición sin monotonía.'] },
  peak: { name: 'Peak time', desc: 'Intro corta, drop pronto, break con build y dos drops seguidos. Para el momento álgido de una sesión.',
    tips: ['El build de 4 compases antes del último drop es un golpe de efecto: no lo alargues.', 'En el build, sube el filtro maestro del Circuit y suéltalo en el primer tiempo del drop.', 'Mete el envío a reverb en el último compás del break: el drop entra más seco y pega más.'] },
  melodic: { name: 'Techno melódico', desc: 'Groove largo, break de 32 compases con acordes y pad, build de 16 y drop final.',
    tips: ['En el break, Synth 2 toca acordes largos: elige un patch con ataque lento y cola larga.', 'Si tienes un sinte en MIDI 1, que sostenga el pad del break.', 'Un drop pega más cuanto más vacío y largo es el break que lo precede.'] },
  live: { name: 'Directo (escenas)', desc: 'Ocho escenas de 8 compases para lanzarlas a mano: base, groove, bajo, completo, B, break, build y drop.',
    tips: ['Lanza las escenas a mano: el orden lo decides tú en directo.', 'Silencia y vuelve a activar pistas en Mixer View para alargar cualquier escena.', 'La escena Build es corta a propósito: úsala solo antes de un Drop.'] },
};
const SG_TIPS = ['Repetición antes que variedad: cada pista repite su groove A y solo remata al final de la sección (A’ y fill). El cambio fuerte llega con la sección siguiente.',
  'El fill quita el bombo en el último tiempo antes de cambiar de sección: es lo que hace que el cambio se sienta.',
  'Contraste antes que volumen: un break sin bombo hace que el drop pegue más que subir el nivel.',
  'Elige los patches de Synth 1 y 2 aquí mismo: suenan al escuchar y se cargan antes de grabar (solo RAM).'];
const SG_SYNTH_CATS = [['bass'], ['lead', 'stab', 'arp', 'pluck', 'chords', 'keys', 'sequence'], ['pad', 'strings', 'chords'], ['drone', 'fx', 'transition']];

function sgState() {
  if (!S.song) {
    const sv = lib.settings.song;
    S.song = sv && sv.v === 1 ? sv : { v: 1, strategy: 'dj', style: 'techno', seed: 1, steps: 16, density: 0.5, root: 9, scale: 'minor', tempo: 130, styles: [...SONG_SYNTH_STYLES.techno], midi: [false, false], locked: [], reshuffle: 0, patches: ['', ''], recorded: {}, fam: null, sections: null, drumMap: 'circuit' };
  }
  return S.song;
}
const sgOff = () => { const s = sgState(); return new Set([2, 3].filter((t) => !s.midi[t - 2])); };
function sgRegen({ keepFam = false, keepSections = false } = {}) {
  const s = sgState();
  if (!keepFam || !s.fam) {
    s.fam = songFamily({ style: s.style, seed: s.seed, steps: s.steps, density: s.density, root: s.root, scale: s.scale, tempo: s.tempo, styles: s.styles, locked: new Set(s.locked), prev: s.fam && s.fam.steps === s.steps ? s.fam.tracks : null });
    s.recorded = {};
  }
  if (!keepSections || !s.sections) s.sections = arrange(s.strategy, s.seed, { reshuffle: s.reshuffle });
  sgSave();
}
let sgSaveT = 0;
function sgSave() { clearTimeout(sgSaveT); sgSaveT = setTimeout(() => { lib.settings.song = S.song; lib.store.putMany('settings', [{ id: 'song', value: S.song }]); }, 300); }
function sgTl() { const s = sgState(); if (!s.fam || !s.sections) sgRegen(); return songTimeline(s.sections, { off: sgOff(), steps: s.steps }); }
function sgChannels() { const D = S.dev; return [D.channels[0], D.channels[1], D.chMidi?.[0] ?? 2, D.chMidi?.[1] ?? 3]; }
function sgPatchList(t) {
  const want = SG_SYNTH_CATS[t];
  const all = lib.faces();
  const fit = all.filter((p) => want.includes(effCat(p))).sort((a, b) => (b.meta.fav ? 1 : 0) - (a.meta.fav ? 1 : 0) || (b.meta.rating || 0) - (a.meta.rating || 0) || a.name.localeCompare(b.name));
  return fit.slice(0, 250);
}

// Forma de energía de una estructura: tramos planos unidos por rampas cortas (en unidades de compás).
function sgShapePath(sections, w, h, pad = 2) {
  const total = sections.reduce((a, x) => a + x.bars, 0) || 1, k = w / total, ramp = Math.min(1.5, total / 80);
  const y = (e) => (pad + (1 - e) * (h - 2 * pad)).toFixed(2);
  let x = 0, d = '';
  sections.forEach((sc, i) => {
    const x0 = x * k, x1 = (x + sc.bars) * k, r = i ? ramp * k : 0;
    d += (i ? ` L${(x0 + r).toFixed(2)} ${y(sc.energy)}` : `M0 ${y(sc.energy)}`) + ` L${(x1 - (i < sections.length - 1 ? ramp * k : 0)).toFixed(2)} ${y(sc.energy)}`;
    x += sc.bars;
  });
  return { line: d, area: `${d} L${w} ${h} L0 ${h} Z` };
}
const sgMinutes = (sections, tempo) => (sections.reduce((a, x) => a + x.bars, 0) * 4) / tempo;

const sceneRange = (tl, x) => { const sc = tl.scenes.filter((y) => y.sec === x.index); return sc.length ? (sc.length > 1 ? `esc. ${sc[0].n}–${sc.at(-1).n}` : `esc. ${sc[0].n}`) : '—'; };
function viewSongs() {
  const s = sgState(), tl = sgTl(), L = SG_SEC(), st = SG_STRAT[s.strategy], live = !!S.dev.session;
  const W = 100 / tl.bars, off = sgOff(), used = usedSlots(tl), rm = songRoadmap(s.fam, tl, s.tempo);
  const sel = (k, opts, v, extra = '') => html`<select class="field" data-act="sgSet" data-k="${k}" ${raw(extra)}>${opts.map(([val, l]) => html`<option value="${val}" ${String(v) === String(val) ? 'selected' : ''}>${l}</option>`)}</select>`;
  const synthOpts = Object.entries(STYLES).map(([k, x]) => [k, x.label]);
  const shape = sgShapePath(tl.sections, 1000, 34);
  const lanes = SONG_TRACKS.map((tr, t) => {
    const isOff = off.has(t), locked = s.locked.includes(t);
    return html`<div class="sg-lane ${isOff ? 'off' : ''}"><span class="sg-lh"><button class="sg-lock ${locked ? 'on' : ''}" data-act="sgLock" data-i="${t}" title="Conservar los patrones de esta pista" aria-pressed="${locked}">${raw(locked ? IC.lockOn : IC.lockOff)}</button><b>${tr.label}</b><small>${t === tl.timer ? 'reloj de escenas' : isOff ? 'desactivada' : tr.role}</small></span>
      <div class="sg-cells">${tl.sections.map((x) => { const k = x.tracks[t].key; return html`<i class="sg-c k-${k} ${tr.kind}" style="width:${x.bars * W}%" title="${L[x.id] || x.id} · ${k === 'timer' ? 'patrones vacíos 1–' + (x.tracks[t].to + 1) + ': marcan que la escena dura ' + x.L + ' compases' : k === 'off' ? 'patrón 8 (silencio)' : 'patrones ' + (x.tracks[t].from + 1) + (x.tracks[t].to > x.tracks[t].from ? '–' + (x.tracks[t].to + 1) : '')}"></i>`; })}</div></div>`;
  });
  const patchSel = (t) => { const list = sgPatchList(t), v = s.patches[t]; return html`<label class="lab">${SONG_TRACKS[t].label}<select class="field" data-act="sgSet" data-k="patch${t}"><option value="">El que tenga el Circuit</option>${list.map((p) => html`<option value="${p.id}" ${v === p.id ? 'selected' : ''}>${p.meta.fav ? '★ ' : ''}${p.name}</option>`)}${v && !list.some((p) => p.id === v) && lib.byId(v) ? html`<option value="${v}" selected>${lib.byId(v).name}</option>` : ''}</select></label>`; };
  const strat = (id) => {
    const secs = arrange(id, 1), sh = sgShapePath(secs, 120, 22), on = s.strategy === id;
    return html`<button class="sg-strat ${on ? 'on' : ''}" role="radio" aria-checked="${on}" data-act="sgStrat" data-v="${id}"><span class="sg-sn"><kbd>${STRATEGY_IDS.indexOf(id) + 1}</kbd>${SG_STRAT[id].name}</span><svg class="sg-shape" viewBox="0 0 120 22" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="${sh.area}"/><path class="l" d="${sh.line}"/></svg><span class="sg-sm">${secs.reduce((a, x) => a + x.bars, 0)} c · ${sgMinutes(secs, s.tempo).toFixed(1)} min</span></button>`;
  };
  const more = S.sgMore;
  return html`<div class="pad"><div class="ptitle"><h2>Canciones</h2><p>De patrones sueltos a un tema entero: elige una estrategia de arreglo y la herramienta escribe 8 patrones por pista (intro, groove A, A’, B, fill, build, break y silencio), los reparte en escenas y te guía para grabarlos en el Circuit Tracks. También sale el .mid de la canción completa para Ableton.</p></div>
  <div class="sg-grid">
    <div class="box sg-ctl">
      <h3>Estrategia</h3>
      <div class="sg-strats" role="radiogroup" aria-label="Estrategia">${STRATEGY_IDS.map(strat)}</div>
      <p class="note sg-desc">${st.desc}</p>
      <h3 class="sg-h">Material</h3>
      <div class="grid2">
        <label class="lab">Batería${sel('style', Object.entries(DRUM_STYLES).map(([k, x]) => [k, x.label]), s.style)}</label>
        <label class="lab">Tempo<input class="field" type="number" min="40" max="240" value="${s.tempo}" data-act="sgSet" data-k="tempo"></label>
        <label class="lab">Tónica${sel('root', NOTE_NAMES_ES.map((x, i) => [i, x]), s.root)}</label>
        <label class="lab">Escala${sel('scale', Object.entries(SCALES).map(([k, x]) => [k, x.label]), s.scale)}</label>
        <label class="lab">Synth 1${sel('st0', synthOpts, s.styles[0])}</label>
        <label class="lab">Synth 2${sel('st1', synthOpts, s.styles[1])}</label>
      </div>
      <h3 class="sg-h">Patches</h3>
      <div class="sg-patches">${patchSel(0)}${patchSel(1)}</div>
      <button class="sg-more" data-act="sgMore" aria-expanded="${!!more}"><span>${more ? '−' : '+'} Más ajustes</span> <small>${s.steps} pasos · ${Math.round(s.density * 100)} %${s.midi[0] || s.midi[1] ? ' · MIDI ' + [0, 1].filter((m) => s.midi[m]).map((m) => m + 1).join('+') : ''}</small></button>
      ${more ? html`<div class="grid2">
        <label class="lab">Pasos por patrón${sel('steps', [[16, '16 (1 compás) · recomendado'], [32, '32 (2 compases) · hay que alargar cada patrón']], s.steps)}</label>
        <label class="lab">Densidad <b>${Math.round(s.density * 100)} %</b><input type="range" min="0" max="1" step="0.05" value="${s.density}" data-act="sgSet" data-k="density"></label></div>
        <div class="sg-midi">${[0, 1].map((m) => html`<label class="note"><input type="checkbox" class="chk" data-act="sgSet" data-k="midi${m}" ${s.midi[m] ? 'checked' : ''}> Usar MIDI ${m + 1} (${m ? 'drone / FX' : 'pad / acordes'}) para otro sinte</label>${s.midi[m] ? sel('st' + (m + 2), synthOpts, s.styles[m + 2]) : ''}`)}</div>` : ''}
    </div>
    <div>
      <div class="box sg-arr">
        <div class="sg-bar">
          <button class="btn ${S.sgPlaying ? 'on' : ''}" data-act="${S.sgPlaying ? 'sgStop' : 'sgPlay'}" data-from="0" ${live ? '' : 'disabled'} title="Espacio">${raw(S.sgPlaying ? IC.stop : IC.play)}${S.sgPlaying ? 'Parar' : 'Escuchar en el Circuit'}</button>
          <span class="sg-sep"></span>
          <button class="btn accent" data-act="sgNew" title="N">Otra canción</button><button class="btn" data-act="sgPats" title="P">Otros patrones</button><button class="btn" data-act="sgStruct" title="E">Otra estructura</button>
          <span class="sp"></span><span class="note mono">semilla ${s.seed}</span>
        </div>
        <h3>Arreglo · ${st.name}<small>${tl.bars} compases · ${tl.scenes.length} escenas · ${sgMinutes(tl.sections, s.tempo).toFixed(1)} min a ${s.tempo} BPM · ${songKeyName(s.root, s.scale)}</small></h3>
        ${tl.changed.length || tl.cut.length ? html`<p class="note warnc" style="margin:-4px 0 8px">Ajustado para que el Circuit lo toque igual que aquí (16 escenas como mucho): ${[...tl.changed.map((c) => `${L[c.id] || c.id} ${c.from}→${c.to} c.`), ...tl.cut.map((c) => `${L[c] || c} fuera`)].join(' · ')}.</p>` : ''}
        ${tl.timer == null ? html`<p class="note warnc" style="margin:-4px 0 8px">Usas MIDI 1 y MIDI 2: no queda pista libre para marcar la duración de las escenas, así que cada escena dura su cadena más larga y hacen falta más escenas.</p>` : ''}
        <div class="sg-tl" id="sgTl">
          <div class="sg-lane sg-head"><span class="sg-lh"></span><div class="sg-cells">${tl.sections.map((x) => html`<button class="sg-sec" style="width:${x.bars * W}%" data-act="sgPlay" data-from="${x.index}" title="Escuchar desde aquí"><b>${L[x.id] || x.id}</b><small>${sceneRange(tl, x)} · ${x.bars}</small></button>`)}</div></div>
          <div class="sg-lane sg-energy"><span class="sg-lh"><small>Energía</small></span><svg class="sg-curve" viewBox="0 0 1000 34" preserveAspectRatio="none" aria-hidden="true">${tl.sections.slice(1).map((x) => html`<line x1="${(x.start * 1000) / tl.bars}" x2="${(x.start * 1000) / tl.bars}" y1="0" y2="34"/>`)}<path class="a" d="${shape.area}"/><path class="l" d="${shape.line}"/></svg></div>
          ${lanes}
          <div class="sg-line" id="sgLine" hidden></div>
        </div>
        <div class="sg-foot"><p class="note sg-legend"><i class="sg-c k-light"></i>intro <i class="sg-c k-groove"></i>groove A … A’ · fill <i class="sg-c k-alt"></i>groove B <i class="sg-c k-fillbuild"></i>A’ · fill <i class="sg-c k-break"></i>break <i class="sg-c k-off"></i>silencio</p><span class="note" id="sgPos"></span></div>
        ${live ? '' : html`<p class="note" style="margin-top:6px">Conecta el Circuit Tracks por USB en <a href="#" data-act="view" data-v="device">Equipo</a> para escuchar y grabar. Sin equipo puedes generar y exportar el .mid.</p>`}
        <p class="note sg-keys"><kbd>Espacio</kbd> escuchar / parar · <kbd>N</kbd> otra canción · <kbd>P</kbd> otros patrones · <kbd>E</kbd> otra estructura · <kbd>1</kbd>–<kbd>5</kbd> estrategia · clic en una sección: escuchar desde ahí</p>
      </div>
      <div class="sg-two">
        <div class="box sg-rec"><h3>Llevarla al Circuit Tracks</h3>
          <p class="note">El Circuit no recibe patrones por SysEx, así que la herramienta los graba como en «Patrones», pero de uno en uno y en todas las pistas a la vez: tú eliges el patrón 1 en cada pista y pulsas REC, la herramienta lo graba; luego el 2, y así. Son ${used.length} pasadas de ${s.steps} pasos.${s.steps === 32 ? html` <b>Con 32 pasos hay que poner antes cada patrón a 32 pasos en el Circuit</b> (si no, la segunda mitad se graba encima de la primera); con 16 no hace falta preparar nada.` : ''}</p>
          <div class="sg-slots">${used.map((k) => html`<span class="sg-slot ${s.recorded[k] ? 'done' : ''}"><b>${k + 1}</b>${SLOT_ROLES[k]}</span>`)}<span class="sg-slot sg-empty"><b>8</b>${SLOT_ROLES[7]}</span></div>
          <div class="row2" style="margin-top:10px;flex-wrap:wrap;gap:6px"><button class="btn rec" data-act="sgRec" ${live && !S.recording ? '' : 'disabled'}>● Grabar los patrones en el Circuit</button><span class="sp"></span><button class="btn" data-act="sgSheet">Descargar hoja de ruta</button><button class="btn" data-act="sgMidi">Exportar .mid de la canción</button>${sel('drumMap', [['circuit', 'Batería: notas del Circuit'], ['gm', 'Batería: Drum Rack (36/38/42/46)']], s.drumMap)}</div>
          <h4 class="mlabel" style="margin-top:14px">Hoja de ruta: ${tl.scenes.length} escenas</h4>
          <ol class="steps note">
            <li>Para cada escena <b>nueva</b>: en Patterns View pon a cada pista su cadena (mantén el primer patrón y pulsa el último; 8 = patrón vacío). Después, en Mixer View, mantén <b>Shift</b> y pulsa el pad de la escena.</li>
            <li>Las escenas marcadas «= N» son copias: mantén <b>Duplicate</b>, pulsa la escena N y luego la de destino.</li>
            ${tl.timer != null ? html`<li><b>${SONG_TRACKS[tl.timer].label}</b> no suena: su cadena de patrones vacíos (⏱) solo marca cuánto dura la escena. Sin ella, la escena duraría lo que la cadena más corta de la batería.</li>` : ''}
            <li>Encadena las escenas: mantén la <b>1</b> y pulsa la <b>${tl.scenes.length}</b>. Cada escena suena una vez y pasa a la siguiente.</li></ol>
          <div class="sg-rmw"><table class="t sg-rm"><tr><th>Esc.</th><th>Sección</th><th>Comp.</th>${SONG_TRACKS.map((tr, t) => (off.has(t) && t !== tl.timer ? '' : html`<th>${tr.label}</th>`))}</tr>
            ${rm.map((r) => html`<tr class="${r.same ? 'dup' : ''}"><td class="mono">${r.scene}</td><td>${L[r.id] || r.id}${r.of > 1 ? html` <span class="dimc">${r.copy + 1}/${r.of}</span>` : ''}${r.end ? html` <span class="dimc" title="Última escena de la sección: el groove remata con A’ y fill">· remate</span>` : ''}</td><td class="mono">${r.bars}</td>${r.same ? html`<td class="mono dimc" colspan="${r.chains.filter((c, t) => !off.has(t) || t === tl.timer).length}">= ${r.same} (Duplicate)</td>` : r.chains.map((c, t) => (off.has(t) && t !== tl.timer ? '' : html`<td class="mono ${c ? '' : 'dimc'}">${c || '8'}</td>`))}</tr>`)}</table></div>
        </div>
        <div class="box sg-tips"><h3>Para que impacte</h3><h4 class="mlabel">${st.name}</h4><ul class="hints">${st.tips.map((x) => html`<li>${x}</li>`)}</ul><h4 class="mlabel" style="margin-top:12px">Siempre</h4><ul class="hints">${SG_TIPS.map((x) => html`<li>${x}</li>`)}</ul></div>
      </div>
    </div>
  </div></div>`;
}

// ---------- escucha en el equipo ----------
let sgTimer = 0, sgRaf = 0;
async function sgLoadPatches() {
  const s = sgState(), ss = S.dev.session; let wait = 0;
  for (const t of [0, 1]) { const p = s.patches[t] && lib.byId(s.patches[t]); if (p && ss) { const v = lib.replacementOf?.(p) || p; ss.sendPatch(v.payload, t); wait = (S.dev.patchDelay ?? 80) + 60; } }
  if (wait) await waitMs(wait);
}
function sgStopNow() {
  clearInterval(sgTimer); cancelAnimationFrame(sgRaf); S.sgPlaying = false;
  const ss = S.dev.session; if (ss) ss.stopChannels([...new Set([...sgChannels(), S.dev.chDrum ?? 9])]);
  const ln = $('#sgLine'); if (ln) ln.hidden = true;
}
async function sgPlay(fromSection = 0) {
  const ss = S.dev.session; if (!ss) return;
  sgStopNow();
  const s = sgState(), tl = sgTl(), sec = tl.sections.find((x) => x.index === +fromSection) || tl.sections[0], fromBar = sec.start;
  const ch = sgChannels(), dch = S.dev.chDrum ?? 9, step = 60000 / s.tempo / 4;
  await sgLoadPatches();
  const notes = songNotes(s.fam, tl, { fromBar }), t0 = ss.clock() + 150, base = fromBar * 16;
  const msgs = notes.map((e, i) => {
    const tr = SONG_TRACKS[e.track], c = tr.kind === 'drum' ? dch : ch[e.track], n = tr.kind === 'drum' ? DRUM_NOTES[tr.lane] : e.n;
    const on = t0 + (e.t - base) * step; let offT = on + Math.max(15, Math.min(e.d, 16) * step - 3);
    for (let j = i + 1; j < notes.length && notes[j].t < e.t + e.d; j++) if (notes[j].track === e.track && notes[j].n === e.n) { offT = Math.min(offT, t0 + (notes[j].t - base) * step - 1); break; }
    return { on, off: Math.max(on + 5, offT), c, n, v: Math.max(1, Math.min(127, e.v)) };
  });
  let k = 0; S.sgPlaying = true;
  const pump = () => { const until = ss.clock() + 1500; while (k < msgs.length && msgs[k].on < until) { const m = msgs[k++]; ss.raw([0x90 | m.c, m.n, m.v], m.on); ss.raw([0x80 | m.c, m.n, 0], m.off); } };
  pump(); sgTimer = setInterval(pump, 400);
  const total = tl.bars * 16;
  const tick = () => {
    if (!S.sgPlaying) return;
    const pos = base + (ss.clock() - t0) / step;
    if (pos >= total) { sgStopNow(); rerender(); return; }
    const ln = $('#sgLine'), lbl = $('#sgPos');
    if (ln) { ln.hidden = false; ln.style.left = `calc(132px + (100% - 132px) * ${Math.max(0, pos) / total})`; }
    if (lbl) lbl.textContent = `compás ${Math.max(1, Math.floor(pos / 16) + 1)} de ${tl.bars}`;
    sgRaf = requestAnimationFrame(tick);
  };
  rerender(); tick();
}

// ---------- grabación guiada ----------
async function sgRecord() {
  const ss = S.dev.session; if (!ss || S.recording) return;
  const s = sgState(), tl = sgTl(), off = sgOff(), slots = usedSlots(tl), on = SONG_TRACKS.filter((_, t) => !off.has(t)).map((x) => x.label);
  const ok = await modal('Grabar la canción en el Circuit Tracks', html`<ol class="steps">
    <li>Abre un <b>proyecto vacío</b> en el Circuit: la grabación se suma a lo que haya.</li>
    <li>Pon la escala del proyecto en <b>${songKeyName(s.root, s.scale)}</b> (Scale View) o en <b>Chromatic</b>, y el tempo en <b>${s.tempo} BPM</b>.</li>
    ${s.steps === 32 ? html`<li><b>32 pasos:</b> en cada pasada la herramienta te recordará alargar el patrón a 32 pasos en cada pista antes de grabar. Si no, el Circuit lo toca de 16 y la segunda mitad se graba encima de la primera.</li>` : html`<li>Patrones de <b>16 pasos</b>: no hay que preparar nada (es la longitud del proyecto vacío).</li>`}
    <li>Deja las pistas sin cadenas (un solo patrón elegido en cada una) mientras grabas.</li>
    <li>Comprueba que <b>Clock Rx</b> está activado (Setup View; viene activado de fábrica).</li>
    <li>Después, para cada patrón, la herramienta te pedirá que lo elijas en todas las pistas (${on.join(', ')}) en Patterns View y que pulses <b>REC</b> (sin Play).</li>
    ${s.patches.some(Boolean) ? html`<li>Antes de empezar se cargan los patches elegidos en Synth 1 y 2 (solo RAM: guarda el proyecto con Save al acabar).</li>` : ''}</ol>`,
  [{ label: 'Cancelar', value: false }, { label: 'Empezar', primary: true, value: true }]);
  if (!ok) return;
  sgStopNow(); patStopNow();
  await sgLoadPatches();
  const chans = sgChannels(), dch = S.dev.chDrum ?? 9;
  for (let i = 0; i < slots.length; i++) {
    const k = slots[i];
    const go = await modal(`Patrón ${k + 1} · ${SLOT_ROLES[k]}`, html`<p class="note">Pasada ${i + 1} de ${slots.length}.</p><ol class="steps">
      <li>En Patterns View, elige el <b>patrón ${k + 1}</b> en cada pista: ${on.join(', ')}.</li>
      ${s.steps === 32 ? html`<li>En cada una de esas pistas (con su patrón ${k + 1} a la vista), mantén <b>Duplicate</b> y pulsa <b>Step Page</b>: el patrón pasa a 32 pasos (está vacío, no copia nada). Si Step Page ya alterna azul y naranja, ya mide 32.</li>` : ''}
      <li>Pulsa <b>REC</b> en el Circuit (sin Play).</li>
      <li>Pulsa «Grabar patrón ${k + 1}».</li></ol>
      ${k === 2 ? html`<p class="note">El patrón 3 es igual que el 2 (así el groove repite A). Puedes grabarlo igual o, más rápido, copiarlo en el Circuit: en Patterns View, mantén <b>Duplicate</b>, pulsa el patrón 2 y después el 3 en cada pista, y salta esta pasada.</p>` : ''}`,
    [{ label: 'Terminar aquí', value: 'stop' }, { label: 'Saltar', value: 'skip' }, { label: `● Grabar patrón ${k + 1}`, primary: true, value: 'rec' }]);
    if (!go || go === 'stop') break;
    if (go === 'skip') continue;
    const events = slotEvents(s.fam, k, { channels: chans, drumChannel: dch, off });
    const r = ss.recordPattern(events, { tempo: s.tempo, steps: s.steps, swing: 0, lead: 250 });
    S.recording = true; rerender();
    toast(`● Grabando el patrón ${k + 1} (${s.steps} pasos)…`, Math.max(1500, r.end - performance.now()));
    await waitMs(Math.max(0, r.end - performance.now() + 150));
    S.recording = false; s.recorded[k] = true; sgSave(); rerender();
  }
  const done = slots.filter((k) => s.recorded[k]).length;
  if (done) await modal('Patrones grabados', html`<p>${done} de ${slots.length} patrones grabados. Ahora monta las escenas con la hoja de ruta (la tienes en la sección y en «Descargar hoja de ruta») y guarda el proyecto con <b>Save</b>.</p>`);
}

// ---------- hoja de ruta y .mid ----------
function sgSheet() {
  const s = sgState(), tl = sgTl(), L = SG_SEC(), off = sgOff(), st = SG_STRAT[s.strategy];
  const cols = SONG_TRACKS.map((tr, t) => (off.has(t) ? null : tr.label)), w = 9;
  const keep = (t) => !off.has(t) || t === tl.timer;
  const rows = songRoadmap(s.fam, tl, s.tempo).map((r) => [String(r.scene).padStart(3), ((L[r.id] || r.id) + (r.of > 1 ? ` ${r.copy + 1}/${r.of}` : '') + (r.end ? ' ' + '· remate' : '')).padEnd(18), String(r.bars).padStart(4), ...(r.same ? [`= escena ${r.same} (Duplicate)`] : r.chains.map((c, t) => (keep(t) ? (c || '8').padEnd(w) : null)))].filter((x) => x != null).join('  '));
  const head = ['Esc.', 'Sección'.padEnd(18), 'Comp.', ...SONG_TRACKS.map((tr, t) => (keep(t) ? tr.label.padEnd(w) : null)).filter(Boolean)].join('  ');
  const slots = usedSlots(tl).map((k) => `  ${k + 1}  ${SLOT_ROLES[k]}`);
  const txt = [`${st.name} · ${DRUM_STYLES[s.style]?.label || s.style} · ${songKeyName(s.root, s.scale)} · ${s.tempo} BPM · ${tl.bars} compases · semilla ${s.seed}`, '',
    'Patrones de cada pista (los graba la herramienta):', ...slots, '  8  Silencio (vacío)', '',
    'Escenas (cadena de patrones de cada pista; 8 = silencio; ⏱ = patrones vacíos que marcan la duración):', head, ...rows, '',
    `Encadena las escenas 1–${tl.scenes.length}: mantén la 1 y pulsa la ${tl.scenes.length}. Cada escena suena una vez.`, '', 'Consejos', ...st.tips.map((x) => '- ' + x), ...SG_TIPS.map((x) => '- ' + x)].join('\n');
  download(`Hoja de ruta - ${safeFile(st.name + ' ' + s.seed)}.txt`, txt, 'text/plain');
}
function sgMidi() {
  const s = sgState(), tl = sgTl(), st = SG_STRAT[s.strategy];
  const bytes = songToMidi(s.fam, tl, { tempo: s.tempo, channels: sgChannels(), drumChannel: S.dev.chDrum ?? 9, drumMap: s.drumMap, name: st.name, off: sgOff() });
  download(`${safeFile(st.name + ' ' + (DRUM_STYLES[s.style]?.label || s.style) + ' ' + s.seed)}.mid`, bytes, 'audio/midi');
}

Object.assign(A, {
  sgStrat: (el) => { const s = sgState(); s.strategy = el.dataset.v; s.reshuffle = 0; sgRegen({ keepFam: true }); if (S.sgPlaying) sgStopNow(); rerender(); },
  sgNew: () => { const s = sgState(); s.seed++; s.reshuffle = 0; sgRegen(); rerender(); },
  sgPats: () => { const s = sgState(); s.seed++; sgRegen({ keepSections: true }); rerender(); },
  sgStruct: () => { const s = sgState(); s.reshuffle++; sgRegen({ keepFam: true }); rerender(); },
  sgLock: (el) => { const s = sgState(), i = +el.dataset.i; s.locked = s.locked.includes(i) ? s.locked.filter((x) => x !== i) : [...s.locked, i]; sgSave(); rerender(); },
  sgPlay: (el) => sgPlay(+(el.dataset.from || 0)),
  sgStop: () => { sgStopNow(); rerender(); },
  sgRec: () => sgRecord(),
  sgSheet: () => sgSheet(),
  sgMidi: () => sgMidi(),
  sgMore: () => { S.sgMore = !S.sgMore; rerender(); },
});
// Teclado en Canciones: Espacio escucha/para, N/P/E variantes, 1–5 estrategia
document.addEventListener('keydown', (e) => {
  if (S.view !== 'songs' || e.ctrlKey || e.metaKey || e.altKey || e.target.matches?.('input,textarea,select') || document.querySelector('.modal')) return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space') { e.preventDefault(); if (S.sgPlaying) { sgStopNow(); rerender(); } else if (S.dev.session) sgPlay(0); return; }
  if (k === 'n') A.sgNew(); else if (k === 'p') A.sgPats(); else if (k === 'e') A.sgStruct();
  else if (/^[1-5]$/.test(k) && STRATEGY_IDS[+k - 1]) A.sgStrat({ dataset: { v: STRATEGY_IDS[+k - 1] } });
});
document.addEventListener('change', (e) => {
  const el = e.target; if (el.dataset.act !== 'sgSet') return;
  const s = sgState(), k = el.dataset.k, v = el.value;
  if (k === 'style') { s.style = v; s.styles = [...(SONG_SYNTH_STYLES[v] || s.styles)]; if (!s.tempoTouched) s.tempo = DRUM_STYLES[v]?.tempo || s.tempo; sgRegen(); }
  else if (k === 'tempo') { s.tempo = Math.max(40, Math.min(240, +v || 128)); s.tempoTouched = true; if (s.fam) s.fam.tempo = s.tempo; sgSave(); }
  else if (k === 'root' || k === 'scale') { s[k] = k === 'root' ? +v : v; sgRegen(); }
  else if (k === 'steps') { s.steps = +v; s.locked = []; sgRegen(); }
  else if (k === 'density') { s.density = +v; sgRegen(); }
  else if (/^st\d$/.test(k)) { s.styles = [...s.styles]; s.styles[+k[2]] = v; s.locked = s.locked.filter((x) => x !== +k[2]); sgRegen({ keepSections: true }); }
  else if (/^midi\d$/.test(k)) { s.midi = [...s.midi]; s.midi[+k[4]] = el.checked; s.recorded = {}; sgSave(); }
  else if (/^patch\d$/.test(k)) { s.patches = [...s.patches]; s.patches[+k[5]] = v; sgSave(); }
  else if (k === 'drumMap') { s.drumMap = v; sgSave(); return; }
  else return;
  if (S.sgPlaying) sgStopNow();
  rerender();
});
