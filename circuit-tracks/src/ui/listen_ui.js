// ui/listen_ui.js — v3.10: lo que se escucha es lo mismo en toda la herramienta, y se ve qué notas suenan.
//  · Una sola regla para la frase de prueba (testPlan): el patrón adjunto al sonido; si no tiene, el patrón generado
//    para él (estilo según su subcarpeta o categoría). La tocan Escucha, la ficha, el patch acoplado, Cambios (A/B),
//    la revisión de octavas, la octava rápida y el Laboratorio. En Escucha se puede elegir otra frase a mano.
//  · Se ve qué se toca («Tónica Do1 · notas Do1–Do2») y cómo suena con la transposición del propio patch
//    (octava de teclado y osciladores): «suena Do0, el patch baja 12 st».
//  · La octava de la frase se cambia ahí mismo (◀ ▶, teclas < y >) sin tocar el patch y se recuerda por
//    categoría / subcarpeta. Con un patrón adjunto, ◀ ▶ mueven el propio patrón (es lo que se exporta como .mid).
// v3.11 · la octava se coloca sola (core/organize.js · soundOffset, offsetNorms, normFor, placePhrase).
//  · Cada sonido se compara con lo habitual de su grupo (categoría / subcarpeta): la moda de lo que mueven los
//    demás, o el objetivo de «Octava y tono» si lo fijaste. Se cuenta en octavas enteras.
//  · «En su registro» (por defecto): la frase sube o baja esas octavas y cada patch suena donde los de su grupo.
//    «Como en el Circuit»: la frase de su grupo para todos; el que está fuera de octava se oye fuera.
//  · El recuadro avisa de lo que se aparta («1 oct más grave que tus Bajos») y lo arregla con un clic (octava
//    rápida). Al comparar octavas (A/B, revisión, −8va / +8va) se toca tal cual, para que se oiga el cambio.
//  · Los patrones (adjunto o elegido) y las frases capturadas se tocan con sus notas: son música, no una prueba.
//  · Repetir: la frase vuelve a empezar hasta Esc o hasta pasar a otro patch (el envío justo a tiempo lo corta).

// Grupo (categoría / subcarpeta, la tuya o la propuesta) cuya octava de frase se recuerda.
function phraseGroupOf(p) {
  // tu carpeta; si no tienes subcarpeta y la propuesta es de tu misma categoría, su subcarpeta (afina el estilo de la frase)
  const r = lib.rootOf(p), inf = lib.info(r), saved = !!r.meta.category, cat = r.meta.category || inf.cls.category || null;
  const sub = (saved ? r.meta.subtype || (inf.cls.category === cat ? inf.cls.subtype : null) : inf.cls.subtype) || null;
  return { cat, sub, key: cat ? cat + (sub ? '/' + sub : '') : '', label: cat ? catName(cat, sub) : 'los patches sin categoría' };
}
function phraseShiftOf(g) { const m = lib.settings.phraseOct || {}; return m[g.key] ?? (g.sub ? m[g.cat] : undefined) ?? 0; }
async function setPhraseShift(g, v) { const m = { ...(lib.settings.phraseOct || {}) }; m[g.key] = Math.max(-36, Math.min(36, v)); await lib.setSetting('phraseOct', m); }
const phraseMode = () => (lib.settings.phraseMode === 'circuit' ? 'circuit' : 'fit');
// Cuánto mueve el patch la nota que recibe: medido (si la medición es de esa carga) o por sus parámetros.
// load: la carga que se va a tocar (una propuesta, el original de un A/B…); por defecto, la versión del sonido.
function soundOff(p, load = null) {
  const r = lib.rootOf(p), f = faceOf(r), x = load ? [f, r].find((q) => q.payload === load) : f;
  return soundOffset(x || { payload: load }, load || f.payload, { ignoreKbd: kbdMode() === 'no' });
}
// Lo habitual de cada grupo (se recalcula cuando cambia la biblioteca, el plan de octava o la octava de teclado).
let _nm = null;
function phraseNorms() {
  const k = S.version + '|' + kbdMode() + '|' + JSON.stringify(lib.settings.regPlan || {});
  if (_nm?.k === k) return _nm.m;
  const items = lib.faces().map((f) => { const g = phraseGroupOf(f); return { cat: g.cat, sub: g.sub, semis: soundOff(f).semis }; });
  _nm = { k, m: offsetNorms(items, { targets: lib.settings.regPlan || {} }) }; return _nm.m;
}
const phraseNormOf = (g) => normFor(phraseNorms(), g.cat, g.sub);
const LETTERS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const letterName = (n) => `${LETTERS[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 2}`;
const noteLbl = (n) => (n === null || n === undefined ? '—' : noteName(n));
// Nota como en Ableton (Do1 = C1 = MIDI 36). En español, también con letra, que es como la muestra Ableton.
const noteHTML = (n) => (n === null || n === undefined ? '—' : html`${noteName(n)}${noteName(n) !== letterName(n) ? html`<span class="lt">${letterName(n)}</span>` : ''}`);

// Qué se va a tocar para este patch y en qué notas.
//  sel: 'auto' (la regla de toda la herramienta) o lo elegido en Escucha · mode: 'fit' | 'circuit' (por defecto, el
//  tuyo) · load: la carga que se tocará (por defecto, la versión del sonido); cuenta para «Suena» y para la octava.
function testPlan(p, sel = S.view === 'audition' ? S.phrase : 'auto', mode = phraseMode(), load = null) {
  const r = lib.rootOf(p), g = phraseGroupOf(r), shift = phraseShiftOf(g), so = soundOff(r, load), nm = phraseNormOf(g);
  let ph, root = 0, src, label, tonic = null, pat = null, place = null;
  if (!sel || sel === 'auto') {
    const att = patternOf(r);
    if (att) { ph = patternToPhrase(att); pat = att; src = 'att'; label = att.name; }
    else { place = placePhrase(testOctave(autoStyleFor(r), g.cat, g.sub) + shift, so.semis, nm.norm, mode); pat = autoPat(r, place.played); ph = patternToPhrase(pat); src = 'gen'; label = STYLES[pat.style]?.label || pat.style; tonic = pat.octave + pat.root; }
  } else if (sel.startsWith('pat:')) { pat = findPattern(sel.slice(4)); ph = pat ? patternToPhrase(pat) : PHRASES.test; src = pat ? 'pat' : 'fixed'; label = pat?.name || PHRASES.test.label; }
  else {
    const f = PHRASES[sel] || S.customPhrases[sel] || PHRASES.test;
    if (f.custom) { ph = f; src = 'cap'; label = f.label; }
    else { place = placePhrase((f.base || 0) + shift, so.semis, nm.norm, mode); ph = { ...f, base: place.played }; root = S.dev.root || 0; src = 'fixed'; label = f.label; tonic = ph.base + root; }
  }
  const rg = phraseRange(ph, root);
  // si la octava compensada se sale del teclado MIDI, se toca sin compensar
  if (place?.comp && (rg.lo < 0 || rg.hi > 127)) return testPlan(p, sel, 'circuit', load);
  if (tonic === null && pat && pat.octave !== undefined && pat.octave !== null) tonic = pat.octave + (pat.root || 0);
  if (tonic === null) tonic = rg.lo;
  // fuera de octava respecto a lo habitual de su grupo: es del patch, no depende del modo
  const dev = placePhrase(0, so.semis, nm.norm).dev;
  return { ph, root, src, label, tonic, lo: rg.lo, hi: rg.hi, off: so.semis, so, nm, dev, comp: place?.comp || 0, mode, shift, group: g, sound: r, pat, steps: ph.steps || Math.max(16, ...ph.notes.map((x) => Math.ceil(x.t + x.d))) };
}
// Envía el patch a la RAM (o la carga que se indique, p. ej. una propuesta o un resultado del Laboratorio) y toca su frase.
//  mode: 'circuit' al comparar octavas (que se oiga el cambio) · loop: repetir hasta Esc o el siguiente patch.
function playTest(p, payload, { mode, loop = false } = {}) {
  const s = S.dev.session; if (!s || !p) return null;
  s.stopAll();
  const load = payload || faceOf(p).payload, tp = testPlan(p, undefined, mode, load), t = s.sendPatch(load, S.dev.synth);
  return s.playPhrase(loop ? { ...tp.ph, steps: tp.steps } : tp.ph, S.dev.synth, { tempo: tempoNow(), root: tp.root, start: t + (S.dev.patchDelay ?? 80), loop });
}
// ◀ ▶: la frase una octava abajo o arriba (sin tocar el patch). Con patrón adjunto, se mueve el patrón.
async function shiftPhrase(p, d) {
  if (!p) return;
  const tp = testPlan(p);
  if (tp.src === 'cap') { toast('Frase capturada del equipo: se toca tal cual la tocaste'); return; }
  if (tp.lo + d < 0 || tp.hi + d > 127) { toast('No cabe más ' + (d < 0 ? 'abajo' : 'arriba')); return; }
  if (tp.src === 'att' || tp.src === 'pat') {
    const moved = transposePattern(tp.pat, d); if (!moved) return;
    await lib.setSetting('patterns', (lib.settings.patterns || []).map((x) => (x.id === tp.pat.id ? { ...moved, opts: { ...(x.opts || {}), octave: moved.octave } } : x)));
    toast(`Patrón «${tp.pat.name}»: ${noteLbl(tp.tonic + d)}${tp.src === 'att' ? ' (también su .mid)' : ''}`);
  } else { await setPhraseShift(tp.group, tp.shift + d); toast(`${tp.group.cat ? tp.group.label : 'Sin categoría'} · suena en ${noteLbl(tp.tonic + d + tp.off)}`, 2600); }
  rerender(); if (S.dev.session) audPlay(p);
}
// Si el patch se aparta de su grupo: el aviso, con el arreglo a un clic (va en su propia línea).
function phraseDev(tp, p) {
  if (!tp.dev) return '';
  const n = Math.abs(tp.dev), grp = tp.group.label, ref = tp.nm.source === 'objetivo' ? 'el objetivo de «Octava y tono»' : 'lo habitual en tu colección';
  return html`<p class="note phdev">${tp.dev < 0 ? html`Este patch suena <b>${n} oct más grave</b> que tus ${grp}` : html`Este patch suena <b>${n} oct más agudo</b> que tus ${grp}`} (${ref}). <button class="btn small" data-act="phFix" data-id="${p.id}" data-n="${-tp.dev * 12}" title="Sube o baja el patch para que suene como los de su grupo. Se suma a su versión; el original sigue guardado.">${tp.dev < 0 ? '+' : '−'}${n} oct al patch</button></p>`;
}
// Cómo se coloca la frase.
function phraseWhy(tp) {
  const g = tp.group, c = Math.abs(tp.comp / 12);
  if (tp.src === 'att') return 'Con un patrón adjunto se tocan sus notas: ◀ ▶ mueven el propio patrón (también su .mid).';
  if (tp.src === 'cap') return 'La frase capturada se toca tal cual.';
  if (tp.src === 'pat') return 'Tu patrón se toca con sus notas.';
  const moved = !tp.comp ? '' : tp.comp > 0 ? html`La frase sube ${c} oct para que este patch suene en su registro. ` : html`La frase baja ${c} oct para que este patch suene en su registro. `;
  const same = !tp.dev && g.cat && tp.nm.source !== 'pocos' ? html`Suena como tus ${g.label}. ` : '';
  return html`${moved}${same}La octava de la frase se recuerda para <b>${g.label}</b>; no cambia el patch.`;
}
// Recuadro de la frase de prueba: rejilla, de dónde sale, qué notas se tocan, cómo suenan y la octava.
function testBox(p, where = 'aud') {
  const tp = testPlan(p, where === 'aud' ? S.phrase : 'auto'), live = !!S.dev.session, auto = where !== 'aud' || S.phrase === 'auto';
  const roll = { steps: tp.steps, notes: tp.ph.notes.map((x) => ({ ...x, n: x.n + (tp.ph.base || 0) + tp.root })) };
  const why = tp.src === 'att' ? (lib.rootOf(p).meta.patternId ? 'patrón adjunto' : 'patrón del original') : tp.src === 'gen' ? `generado para ${tp.group.cat ? tp.group.label : 'un patch sin categoría'}` : tp.src === 'pat' ? 'tu patrón' : tp.src === 'cap' ? 'frase capturada' : 'frase fija';
  const heard = tp.tonic + tp.off, att = tp.src === 'att';
  const range = tp.lo === tp.hi ? noteLbl(tp.lo) : `${noteLbl(tp.lo)}–${noteLbl(tp.hi)}`;
  return html`<div class="tbox"><div class="mlabel"><span>Frase de prueba</span><span>${why}</span></div>
    <button class="mroll-w ${att ? 'att' : ''}" data-act="${att ? 'patOpenFor' : tp.src === 'gen' ? 'autoOpen' : 'noop'}" data-id="${p.id}" title="${tp.src === 'gen' || att ? 'Abrir en Patrones para editarlo' : ''}">${miniRoll(roll)}</button>
    <p class="note tlabel"><b>${tp.label}</b>${tp.src === 'gen' ? html` · ${NOTE_NAMES_ES[tp.pat.root]} menor · ${tp.pat.steps} pasos` : ''}</p>
    <div class="tnotes"><span class="tn" title="MIDI ${tp.tonic}"><i>Tónica</i><b class="mono">${noteHTML(tp.tonic)}</b></span>
      ${tp.src === 'cap' ? '' : html`<span class="octq"><button class="btn small" data-act="phOct" data-d="-12" data-id="${p.id}" title="Toca la frase una octava más abajo (tecla ${LT}). No cambia el patch.">◀ 8va</button><button class="btn small" data-act="phOct" data-d="12" data-id="${p.id}" title="Toca la frase una octava más arriba (Mayús ${LT}). No cambia el patch.">8va ▶</button></span>`}
      <span class="tn" title="MIDI ${tp.lo}–${tp.hi}"><i>Notas</i><b class="mono">${range}</b></span>
      <span class="tn ${tp.dev ? 'moved' : ''}" title="${tp.so.source === 'medido' ? 'La nota que suena al tocar la tónica, medida con tu equipo' : 'La nota que suena al tocar la tónica, con la octava de teclado y los semitonos de este patch'}"><i>Suena</i><b class="mono">${noteHTML(heard)}</b>${tp.off ? html`<small>el patch ${fmtSemis(tp.off)} st${tp.so.source === 'medido' ? ' · medido' : ''}</small>` : tp.so.source === 'medido' ? html`<small>medido</small>` : ''}</span></div>
    ${tp.src === 'gen' || tp.src === 'fixed' ? html`<div class="phmode" role="group" aria-label="Octava de la frase"><button class="${tp.mode === 'fit' ? 'on' : ''}" data-act="phMode" data-m="fit" aria-pressed="${tp.mode === 'fit'}" title="La frase sube o baja octavas enteras para que cada patch suene en el registro de su grupo">En su registro</button><button class="${tp.mode === 'circuit' ? 'on' : ''}" data-act="phMode" data-m="circuit" aria-pressed="${tp.mode === 'circuit'}" title="La frase de su grupo para todos: un patch fuera de octava suena fuera, como con tus patrones en el equipo">Como en el Circuit</button></div>` : ''}
    ${phraseDev(tp, p)}<p class="note phwhy">${phraseWhy(tp)}</p>
    ${auto ? html`<div class="row2" style="margin-top:6px;flex-wrap:wrap;gap:5px"><button class="btn small" data-act="listenSel" ${live ? '' : 'disabled'} title="${live ? 'Espacio' : 'Conecta el equipo en Equipo'}">${raw(IC.play)}Escuchar</button>
      ${att ? html`${lib.rootOf(p).meta.patternId ? html`<button class="btn small" data-act="autoDetach">Quitar</button>` : ''}<button class="btn small" data-act="patOpenFor" data-id="${p.id}">Editar</button>` : tp.src === 'gen' ? html`<button class="btn small" data-act="autoNext" title="Otra variación${where === 'aud' ? '' : ' (G)'}">Otro</button><button class="btn small accent" data-act="autoAttach" title="${where === 'aud' ? '' : 'A'}">Adjuntar al patch</button>` : ''}</div>
    ${tp.src === 'gen' && where !== 'aud' ? html`<p class="note" style="margin-top:6px">Si te convence cómo suena, adjúntalo: se guarda en tus patrones, sonará siempre con este patch y «Ordenar en disco» pondrá su .mid al lado del .syx.</p>` : ''}` : ''}</div>`;
}
