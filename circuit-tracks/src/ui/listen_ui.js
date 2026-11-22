// ui/listen_ui.js — v3.10: lo que se escucha es lo mismo en toda la herramienta, y se ve qué notas suenan.
//  · Una sola regla para la frase de prueba (testPlan): el patrón adjunto al sonido; si no tiene, el patrón generado
//    para él (estilo según su subcarpeta o categoría). La tocan Escucha, la ficha, el patch acoplado, Cambios (A/B),
//    la revisión de octavas, la octava rápida y el Laboratorio. En Escucha se puede elegir otra frase a mano.
//  · Se ve qué se toca («Tónica Do1 · notas Do1–Do2») y cómo suena con la transposición del propio patch
//    (octava de teclado y osciladores): «suena Do0, el patch baja 12 st».
//  · La octava de la frase se cambia ahí mismo (◀ ▶, teclas < y >) sin tocar el patch y se recuerda por
//    categoría / subcarpeta. Con un patrón adjunto, ◀ ▶ mueven el propio patrón (es lo que se exporta como .mid).

// Grupo (categoría / subcarpeta, la tuya o la propuesta) cuya octava de frase se recuerda.
function phraseGroupOf(p) {
  // tu carpeta; si no tienes subcarpeta y la propuesta es de tu misma categoría, su subcarpeta (afina el estilo de la frase)
  const r = lib.rootOf(p), inf = lib.info(r), saved = !!r.meta.category, cat = r.meta.category || inf.cls.category || null;
  const sub = (saved ? r.meta.subtype || (inf.cls.category === cat ? inf.cls.subtype : null) : inf.cls.subtype) || null;
  return { cat, sub, key: cat ? cat + (sub ? '/' + sub : '') : '', label: cat ? catName(cat, sub) : 'los patches sin categoría' };
}
function phraseShiftOf(g) { const m = lib.settings.phraseOct || {}; return m[g.key] ?? (g.sub ? m[g.cat] : undefined) ?? 0; }
async function setPhraseShift(g, v) { const m = { ...(lib.settings.phraseOct || {}) }; m[g.key] = Math.max(-36, Math.min(36, v)); await lib.setSetting('phraseOct', m); }
// Cuánto mueve el patch la nota que recibe (octava de teclado × 12 + semitonos del oscilador que manda).
function heardOffset(payload) { const r = register(payload); return kbdMode() === 'no' ? r.lowestSemis : r.effective; }
const LETTERS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const letterName = (n) => `${LETTERS[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 2}`;
const noteLbl = (n) => (n === null || n === undefined ? '—' : noteName(n));
// Nota como en Ableton (Do1 = C1 = MIDI 36). En español, también con letra, que es como la muestra Ableton.
const noteHTML = (n) => (n === null || n === undefined ? '—' : html`${noteName(n)}${noteName(n) !== letterName(n) ? html`<span class="lt">${letterName(n)}</span>` : ''}`);

// Qué se va a tocar para este patch y en qué notas.
function testPlan(p, sel = S.phrase) {
  const r = lib.rootOf(p), g = phraseGroupOf(r), shift = phraseShiftOf(g);
  let ph, root = 0, src, label, tonic = null, pat = null;
  if (!sel || sel === 'auto') {
    const att = patternOf(r);
    if (att) { ph = patternToPhrase(att); pat = att; src = 'att'; label = att.name; }
    else { pat = autoPat(r); ph = patternToPhrase(pat); src = 'gen'; label = STYLES[pat.style]?.label || pat.style; tonic = pat.octave + pat.root; }
  } else if (sel.startsWith('pat:')) { pat = findPattern(sel.slice(4)); ph = pat ? patternToPhrase(pat) : PHRASES.test; src = pat ? 'pat' : 'fixed'; label = pat?.name || PHRASES.test.label; }
  else {
    const f = PHRASES[sel] || S.customPhrases[sel] || PHRASES.test;
    if (f.custom) { ph = f; src = 'cap'; label = f.label; }
    else { ph = { ...f, base: (f.base || 0) + shift }; root = S.dev.root || 0; src = 'fixed'; label = f.label; tonic = ph.base + root; }
  }
  const rg = phraseRange(ph, root);
  if (tonic === null && pat && pat.octave !== undefined && pat.octave !== null) tonic = pat.octave + (pat.root || 0);
  if (tonic === null) tonic = rg.lo;
  const v = lib.currentVersion(r), off = heardOffset(v.payload);
  return { ph, root, src, label, tonic, lo: rg.lo, hi: rg.hi, off, shift, group: g, sound: r, pat, steps: ph.steps || Math.max(16, ...ph.notes.map((x) => Math.ceil(x.t + x.d))) };
}
// Envía el patch a la RAM (o la carga que se indique, p. ej. una propuesta o un resultado del Laboratorio) y toca su frase.
function playTest(p, payload) {
  const s = S.dev.session; if (!s || !p) return null;
  s.stopAll();
  const tp = testPlan(p), t = s.sendPatch(payload || lib.currentVersion(lib.rootOf(p)).payload, S.dev.synth);
  return s.playPhrase(tp.ph, S.dev.synth, { tempo: tempoNow(), root: tp.root, start: t + (S.dev.patchDelay ?? 80) });
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
  } else { await setPhraseShift(tp.group, tp.shift + d); toast(`Frase de ${tp.group.label}: tónica en ${noteLbl(tp.tonic + d)}`, 2600); }
  rerender(); if (S.dev.session) audPlay(p);
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
      <span class="tn ${tp.off ? 'moved' : ''}" title="La nota que suena al tocar la tónica, con la octava de teclado y los semitonos de este patch"><i>Suena</i><b class="mono">${noteHTML(heard)}</b>${tp.off ? html`<small>el patch ${fmtSemis(tp.off)} st</small>` : ''}</span></div>
    <p class="note" style="margin-top:4px">${att ? 'Con un patrón adjunto se tocan sus notas: ◀ ▶ mueven el propio patrón (también su .mid).' : tp.src === 'cap' ? 'La frase capturada se toca tal cual.' : html`La octava de la frase se recuerda para <b>${tp.group.label}</b>; no cambia el patch${tp.off && Math.abs(tp.off) >= 12 ? html` (para cambiar el patch: −8va / +8va)` : ''}.`}</p>
    ${auto ? html`<div class="row2" style="margin-top:6px;flex-wrap:wrap;gap:5px"><button class="btn small" data-act="listenSel" ${live ? '' : 'disabled'} title="${live ? 'Espacio' : 'Conecta el equipo en Equipo'}">${raw(IC.play)}Escuchar</button>
      ${att ? html`${lib.rootOf(p).meta.patternId ? html`<button class="btn small" data-act="autoDetach">Quitar</button>` : ''}<button class="btn small" data-act="patOpenFor" data-id="${p.id}">Editar</button>` : tp.src === 'gen' ? html`<button class="btn small" data-act="autoNext" title="Otra variación${where === 'aud' ? '' : ' (G)'}">Otro</button><button class="btn small accent" data-act="autoAttach" title="${where === 'aud' ? '' : 'A'}">Adjuntar al patch</button>` : ''}</div>
    ${tp.src === 'gen' && where !== 'aud' ? html`<p class="note" style="margin-top:6px">Si te convence cómo suena, adjúntalo: se guarda en tus patrones, sonará siempre con este patch y «Ordenar en disco» pondrá su .mid al lado del .syx.</p>` : ''}` : ''}</div>`;
}
