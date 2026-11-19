// ui/app_views.js — vistas
import { CATS, compatible } from '../core/classify.js';
import { isLoopSample, kindOf, LAYOUTS, roleOf, budget, sampleSeconds, rawSeconds, beatMatch, MAX_TOTAL_S, MAX_SAMPLE_S, SLOTS, PAGE, featureDistance, LAYOUT_IDS } from '../core/pack.js';
import { CC } from '../core/midi.js';

const $ = (q, el = document) => el.querySelector(q);
const $$ = (q, el = document) => [...el.querySelectorAll(q)];
const ROW_H = 30;

const SOUND_WHY = {
  kickLow: () => t('mucho grave, ataque inmediato y caída corta'),
  bassTonal: (a) => t('nota grave estable ({n})', { n: a.note || '—' }),
  bassLow: () => t('grave sostenido'),
  clapBursts: () => t('varias ráfagas de ruido al principio'),
  snareBody: () => t('ruido con cuerpo en medios'),
  hatShort: () => t('agudos y muy corto'),
  hatOpen: () => t('agudos con cola media'), hatOpenAlt: () => t('agudos con cola'), cymAlt: () => t('agudos con cola'),
  cymLong: () => t('agudos con cola larga'),
  tomPitch: () => t('golpe con tono en graves-medios'),
  padSlow: () => t('nota con entrada lenta y larga'),
  synthTonal: (a) => t('nota clara ({n})', { n: a.note || '—' }),
  riser: () => t('el brillo sube a lo largo del sonido'),
  downer: () => t('el brillo baja a lo largo del sonido'),
  longSustain: () => t('largo y sostenido'),
  noiseLong: () => t('ruido largo'),
  percShort: () => t('golpe corto sin rasgos de otra familia'),
  loopPerc: (a) => t('ataques regulares: {b} tiempos a {bpm} BPM', { b: a.loopBeats || '?', bpm: a.loopBpm ? nf(a.loopBpm, 1) : '?' }),
  loopTonal: (a) => t('ataques regulares con tono ({b} tiempos a {bpm} BPM)', { b: a.loopBeats || '?', bpm: a.loopBpm ? nf(a.loopBpm, 1) : '?' }),
  loopAlt: () => '',
};
const ROLE_LABEL = () => ({ kick: 'Kick', snare: 'Snare/Clap', hat: 'Closed hat', ohat: 'Open hat', perc: 'Perc', mel: t('Melódico'), bass: 'Bass', synth: 'Synth', tex: 'Atmos/FX/Vox', dloop: 'Drum loop', mloop: 'Melodic loop', clap: 'Clap/Snare', ptom: 'Perc/Tom/Cymbal', any: t('Libre') });

// ---------- cabecera ----------
function renderHeader() {
  const n = S.samples.length;
  const lock = [...S.roots.values()].filter((r) => r.perm !== 'granted').length;
  const noBackup = n && (!S.lastBackup || (S.changes > 0 && Date.now() - S.lastBackup > 3 * 864e5));
  const doubts = S.samples.filter((s) => !s.user?.discard && ['doubt', 'none'].includes(clsOf(s).cert)).length;
  $('#status').innerHTML = `
    <span class="chip" id="cnt">${t('{n} samples', { n: n.toLocaleString(LOCALE) })}</span>
    ${doubts ? `<button class="chip warn" data-act="goto-listen">● ${t('{n} por escuchar', { n: doubts })}</button>` : n ? `<span class="chip ok">✓ ${t('todo revisado')}</span>` : ''}
    ${lock ? `<button class="chip warn" data-act="reconnect">⟳ ${t('Reconectar {n} carpetas', { n: lock })}</button>` : ''}
    <button class="chip ${S.midiOn && S.midi.out ? 'ok' : ''}" data-act="goto-device">${S.midiOn && S.midi.out ? '● ' + esc(S.midi.out.name) : t('Sin equipo')}</button>
    ${noBackup ? `<button class="chip warn" data-act="backup">${t('Sin copia reciente')}</button>` : ''}
    <button class="chip kbtn" data-act="palette" title="${t('Paleta de órdenes: ir a, hacer o buscar un sample')}">Ctrl K</button><button class="chip kbtn" data-act="keys-help" title="${t('Atajos de teclado')} (?)">?</button>${langSwitchHTML('hdr')}`;
  $$('.tab').forEach((b) => b.classList.toggle('on', b.dataset.view === S.view));
}
function refreshCounts() { const c = $('#cnt'); if (c) c.textContent = t('{n} samples', { n: S.samples.length.toLocaleString(LOCALE) }); }
function paintBusy() {
  let el = $('#busy');
  if (!S.busy) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'busy'; el.className = 'busy'; document.body.appendChild(el); }
  const b = S.busy;
  const pct = b.total ? Math.round((b.i / b.total) * 100) : 0;
  el.innerHTML = `<div class="row"><b class="grow">${esc(b.label)}</b><button class="btn small" data-act="busy-cancel">${t('Detener')}</button></div>
    <div class="muted mono" style="margin:4px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:320px">${esc(b.what || '')}</div>
    ${b.total ? `<div class="progress"><i style="width:${pct}%"></i></div><div class="muted" style="font-size:12.5px;margin-top:3px">${b.i} / ${b.total}</div>` : ''}`;
}
function renderAll() { renderHeader(); renderView(); }
function renderView() {
  const v = $('#view');
  if (S.view === 'library') { if ((S.libMode || 'list') === 'list') renderLibrary(v); else renderOrg(v); }
  else if (S.view === 'listen') renderListen(v);
  else if (S.view === 'packs') renderPacks(v);
  else if (S.view === 'map') renderMap(v);
  else if (S.view === 'patterns') renderPatterns(v);
  else if (S.view === 'songs') renderSong(v);
  else if (S.view === 'device') renderDevice(v);
  else renderData(v);
  paintDock();
}

// ---------- biblioteca ----------
let _fKey = '', _fList = [];
function inPackSet() { return new Set((S.pack?.slots || []).filter(Boolean)); }
function filtered() {
  const key = S.ver + '|' + S.learnVer + '|' + JSON.stringify(S.f) + '|' + (S.pack?.id || '') + '|' + (S.pack?.updated || '') + (S.f.flag === 'sel' ? '|' + [...S.multi].join(',') : '');
  if (key === _fKey) return _fList;
  const q = S.f.q.trim().toLowerCase();
  const terms = q ? q.split(/\s+/) : [];
  const inPack = inPackSet();
  let list = S.samples.filter((s) => {
    const c = clsOf(s);
    if (S.f.cat !== 'all' && (S.f.cat === 'none' ? c.cat : c.cat !== S.f.cat)) return false;
    if (S.f.cert !== 'all' && c.cert !== S.f.cert) return false;
    if (S.f.kind && kindOf(s) !== S.f.kind) return false;
    const a = s.analysis || {};
    switch (S.f.flag) {
      case 'fav': if (!s.user?.fav) return false; break;
      case 'unheard': if (s.user?.heard || s.user?.cat) return false; break;
      case 'review': if (!['doubt', 'none'].includes(c.cert)) return false; break;
      case 'inpack': if (!inPack.has(s.id)) return false; break;
      case 'discard': if (!s.user?.discard) return false; break;
      case 'long': if (!(rawSeconds(s) > MAX_SAMPLE_S)) return false; break;
      case 'phase': if (!(a.stereo && a.corr < 0)) return false; break;
      case 'problems': if (!(a.error || s.missing || a.clipRuns > 0 || Math.abs(a.dc || 0) > 0.01)) return false; break;
      case 'rated': if (!(s.user?.rating >= 4)) return false; break;
      case 'confirmed': if (!['confirmed', 'user'].includes(c.cert)) return false; break;
      case 'anypack': if (!S.packs.some((p) => p.slots.includes(s.id))) return false; break;
      case 'dups': if (!((s.paths || []).length > 1)) return false; break;
      case 'warnings': if (!revision(s).fails.length) return false; break;
      case 'sel': if (!S.multi.has(s.id)) return false; break;
    }
    if (S.f.flag !== 'discard' && S.f.flag !== 'all' && s.user?.discard && S.f.flag !== 'problems') return false;
    if (!orgFilterOK(s)) return false;
    if (terms.length) {
      const hay = (s.path + ' ' + (s.user?.note || '') + ' ' + catLabel(c.cat) + ' ' + (a.note || '') + ' ' + (s.user?.tags || []).join(' ')).toLowerCase();
      if (!terms.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  const by = {
    folder: (a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }),
    name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
    dur: (a, b) => (a.analysis?.activeDur || 0) - (b.analysis?.activeDur || 0),
    rating: (a, b) => (b.user?.rating || 0) - (a.user?.rating || 0) || (b.user?.fav ? 1 : 0) - (a.user?.fav ? 1 : 0),
    cat: (a, b) => String(clsOf(a).cat).localeCompare(String(clsOf(b).cat)) || a.path.localeCompare(b.path),
    added: (a, b) => b.added - a.added,
  }[S.f.sort] || (() => 0);
  list.sort(by);
  _fKey = key; _fList = list;
  return list;
}
function catCounts() {
  const n = {}; for (const s of S.samples) { const c = clsOf(s).cat || 'none'; n[c] = (n[c] || 0) + 1; } return n;
}

function renderLibrary(v) {
  if (!S.samples.length) { v.innerHTML = emptyLibrary(); return; }
  const cc = catCounts();
  const list = filtered();
  if (!S.sel || !S.byId[S.sel]) S.sel = list[0]?.id || null;
  const of = orgFiltersHTML(list);
  v.innerHTML = `${libModesHTML()}${kpisHTML()}<div class="lib">
    <section class="panel listpanel">
      <div class="filters">
        <div class="row"><input type="search" id="q" class="grow" placeholder="${t('Buscar en nombre, carpeta, nota…  ( / )')}" value="${esc(S.f.q)}">
          <select id="fsort" title="${t('Orden')}">${[['folder', t('Por carpeta')], ['name', t('Por nombre')], ['cat', t('Por categoría')], ['dur', t('Por duración')], ['rating', t('Mejor valorados')], ['added', t('Recientes')]].map(([k, l]) => `<option value="${k}" ${S.f.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>${collSelectHTML()}</div>
        <div class="cats"><button class="cat ${S.f.cat === 'all' ? 'on' : ''}" data-act="fcat" data-v="all" style="--c:#888">${t('Todo')} <span class="n">${S.samples.length}</span></button>
          ${CATS.map((c) => `<button class="cat ${S.f.cat === c.id ? 'on' : ''}" data-act="fcat" data-v="${c.id}" style="--c:${catVar(c.id)}">${catLabel(c.id)} <span class="n">${cc[c.id] || 0}</span></button>`).join('')}
          <button class="cat ${S.f.cat === 'none' ? 'on' : ''}" data-act="fcat" data-v="none">${t('Sin categoría')} <span class="n">${cc.none || 0}</span></button></div>
        <div class="row">
          <select id="fflag">${[['all', t('Todos')], ['review', t('Por revisar (dudosos y sin pistas)')], ['unheard', t('Sin escuchar')], ['fav', t('Favoritos')], ['rated', t('4–5 estrellas')], ['inpack', t('En el pack actual')], ['long', t('Más de 30 s')], ['phase', t('Estéreo que se cancela en mono')], ['problems', t('Con problemas')], ['confirmed', t('Confirmados o tuyos')], ['anypack', t('En algún pack')], ['dups', t('Con copias idénticas')], ['warnings', t('Con avisos')], ['discard', t('Descartados')], ['sel', t('Seleccionados ({n})', { n: S.multi.size })]].map(([k, l]) => `<option value="${k}" ${S.f.flag === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <select id="fcert">${[['all', t('Cualquier certeza')], ...Object.entries(CERT_LABEL())].map(([k, l]) => `<option value="${k}" ${S.f.cert === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <select id="fkind" title="${t('Tipo')}">${[['', t('Loops y one-shots')], ['loop', t('Solo loops')], ['oneshot', t('Solo one-shots')]].map(([k, l]) => `<option value="${k}" ${(S.f.kind || '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          ${of.sel}
        </div>
        ${of.wbar}
      </div>
      <div class="list" id="list"><div class="spacer" style="height:${list.length * ROW_H}px"></div></div>
      <div class="listfoot"><span>${t('{n} de {m}', { n: list.length.toLocaleString(LOCALE), m: S.samples.length.toLocaleString(LOCALE) })}</span>
        ${S.multi.size ? `<b>${t('{n} seleccionados', { n: S.multi.size })}</b><button class="btn small" data-act="multi-pack">${t('Al pack')}</button><button class="btn small" data-act="multi-listen">${t('Escuchar')}</button><button class="btn small" data-act="multi-org">${t('Carpeta y etiquetas')}</button><button class="btn small" data-act="multi-clear">✕</button>` : `<span class="dim">${t('Mayús/Ctrl+clic para elegir varios')}</span>`}<button class="btn small ghost" data-act="lib-csv" title="${t('La lista filtrada en una hoja de cálculo: ruta, categoría, subcarpeta, tipo, etiquetas, valoración, lo medido y en qué packs está')}">CSV</button></div>
    </section>
    <section id="detail"></section></div>`;
  paintList();
  renderDetail();
  const li = $('#list');
  li.addEventListener('scroll', paintList);
  scrollToSel();
}
function emptyLibrary() {
  const issues = compatIssues();
  return `<div class="panel empty welcome"><h2>${t('Tu biblioteca de samples está vacía')}</h2>
    <ol class="steps"><li><b>${t('Enlaza tu carpeta de samples')}</b> ${t('— se miden y se clasifican sin copiarlos.')}</li><li><b>${t('Escucha y decide')}</b> ${t('— una tecla por categoría en 02 Escucha.')}</li><li><b>${t('Monta un pack de 128')}</b> ${t('— y llévalo a la Rhythm con Components o la microSD.')}</li></ol>
    <p class="note">${t('Nada sale de tu ordenador: no hay cuentas ni servidores.')}</p>
    ${issues.length ? `<ul class="warnlist" style="text-align:left;display:inline-block">${issues.map((i) => `<li class="warn">${i}</li>`).join('')}</ul>` : ''}
    <div class="row" style="justify-content:center;margin-top:14px">
      <button class="btn primary" data-act="link">${t('Enlazar carpeta')}</button>
      <button class="btn" data-act="pick-files">${t('Copiar archivos')}</button>
      <button class="btn" data-act="pick-dir">${t('Copiar carpeta')}</button>
      <button class="btn" data-act="pick-pack">${t('Importar .circuitrhythmpack')}</button></div>
    <p class="note" style="margin-top:14px">${t('También puedes arrastrar archivos, carpetas o ZIP a esta ventana. Formatos: WAV, AIFF, MP3, FLAC, OGG.')}</p></div>`;
}
function rowHTML(s, i, inPack) {
  const c = clsOf(s), a = s.analysis || {}, u = s.user || {};
  const bl = BASIS_LABEL();
  const why = c.cert === 'doubt' ? `<span class="warn">${t('Dudoso')}</span>` : c.cert === 'none' ? `<span class="dim">${t('Sin pistas')}</span>` : esc(bl[c.basis] || '');
  const flags = [u.fav ? '<span style="color:var(--m)">♥</span>' : '', inPack.has(s.id) ? '<span class="ok">●</span>' : '',
    a.error || s.missing ? '<span class="bad">!</span>' : '', rawSeconds(s) > MAX_SAMPLE_S ? '<span class="warn">30s</span>' : '', keepActive(s) ? `<span class="dim" title="${t('Acortado')}">✂</span>` : '', kindOf(s) === 'loop' ? `<span class="dim" title="${t('Loop')}">⟳</span>` : '',
    a.stereo && a.corr < 0 ? '<span class="warn">Φ</span>' : ''].join(' ');
  return `<div class="li ${S.sel === s.id ? 'sel' : ''} ${S.multi.has(s.id) ? 'multi' : ''} ${u.discard ? 'discard' : ''}" style="top:${i * ROW_H}px;--c:${catVar(c.cat)}" data-id="${s.id}" data-act="sel" draggable="true">
    <span class="bar"></span><span class="nm">${esc(s.name.replace(/\.(wav|aiff?|mp3|flac|ogg)$/i, ''))}<small>${esc(folderOf(s.path).split('/').slice(-1)[0])}</small></span>
    <span class="why">${c.cat ? `<span style="color:${catVar(c.cat)}">${catLabel(c.cat)}</span>${u.sub ? `<span class="dim"> / ${esc(subName(c.cat, u.sub) || '')}</span>` : ''} · ` : ''}${why}${u.tags?.length ? ` <span class="dim">#${u.tags.length}</span>` : ''}</span>
    <span class="dur">${a.activeDur != null ? fmtDur(sampleSeconds(s)) : a.error ? '—' : '…'}</span>
    <span class="stars">${'★'.repeat(u.rating || 0)}</span><span class="fl">${flags}</span></div>`;
}
function paintList() {
  const li = $('#list'); if (!li) return;
  const list = filtered();
  const top = li.scrollTop, h = li.clientHeight || 600;
  const a = Math.max(0, Math.floor(top / ROW_H) - 10), b = Math.min(list.length, Math.ceil((top + h) / ROW_H) + 10);
  const inPack = inPackSet();
  let html = '';
  for (let i = a; i < b; i++) html += rowHTML(list[i], i, inPack);
  $('.spacer', li).innerHTML = html;
}
function scrollToSel() {
  const li = $('#list'); if (!li || !S.sel) return;
  const i = filtered().findIndex((s) => s.id === S.sel);
  if (i < 0) return;
  const y = i * ROW_H;
  if (y < li.scrollTop || y > li.scrollTop + li.clientHeight - ROW_H) li.scrollTop = Math.max(0, y - li.clientHeight / 2);
  paintList();
}

function whyHTML(s, c) {
  const a = s.analysis || {};
  const name = c.reasons.filter((r) => r.src === 'name');
  const fold = c.reasons.filter((r) => r.src === 'folder');
  const snd = c.reasons.filter((r) => r.src === 'sound' && SOUND_WHY[r.tok] && SOUND_WHY[r.tok](a));
  const line = (lbl, items) => `<li><b>${lbl}</b> ${items}</li>`;
  const tokens = (arr) => arr.map((r) => `«${esc(r.tok)}» → <span style="color:${catVar(r.cat)}">${catLabel(r.cat)}</span>${r.why === 'learned' ? ` <span class="dim">(${t('regla aprendida')})</span>` : ''}`).join(', ');
  let html = '<ul class="why-list">';
  if (c.cert === 'user') html += line(t('Tú'), t('lo decidiste al escuchar') + (c.auto?.cat && c.auto.cat !== c.cat ? ` · <span class="dim">${t('la herramienta proponía {c}', { c: `<span style="color:${catVar(c.auto.cat)}">${catLabel(c.auto.cat)}</span>` })}</span>` : ''));
  html += line(t('Nombre'), name.length ? tokens(name) : `<span class="dim">${t('nada reconocible')}</span>`);
  html += line(t('Carpeta'), fold.length ? tokens(fold) : `<span class="dim">${t('nada reconocible')}</span>`);
  html += line(t('Sonido'), a.error ? `<span class="bad">${t('no se pudo medir')}</span>` : snd.length ? snd.slice(0, 3).map((r) => `<span style="color:${catVar(r.cat)}">${catLabel(r.cat)}</span>: ${SOUND_WHY[r.tok](a)}`).join(' · ') : `<span class="dim">${t('sin rasgos claros')}</span>`);
  html += '</ul>';
  if (c.conflict) html += `<div class="conflict">⚠ ${t('El texto dice {a} y suena a {b}. Escúchalo y decide.', { a: `<b>${catLabel(c.conflict.said)}</b>`, b: `<b>${catLabel(c.conflict.heard)}</b>` })}</div>`;
  return html;
}
const CERT_EXPLAIN = () => ({
  user: t('Lo decidiste tú: manda sobre todo lo demás.'),
  confirmed: t('Dos fuentes independientes coinciden: lo que dice el texto y lo que se mide en el audio.'),
  onehint: t('Solo lo dice el texto (nombre o carpeta). El sonido no lo confirma ni lo contradice.'),
  sound: t('Solo lo dice la medición del audio. Conviene escucharlo.'),
  doubt: t('Las pistas se contradicen o son débiles. Escúchalo y decide.'),
  none: t('No hay pistas. Escúchalo y decide.'),
});

function keysHTML(c, s) {
  return `<div class="keys">${CATS.map((k) => `<button class="kbtn ${s.user?.cat === k.id ? 'on' : ''} ${!s.user?.cat && c.cat === k.id ? 'prop-hint' : ''}" style="--c:${catVar(k.id)}" data-act="decide" data-v="${k.id}"><span class="k">${k.key}</span>${catLabel(k.id)}</button>`).join('')}</div>`;
}
function rateHTML(s) {
  const r = s.user?.rating || 0;
  return `<span class="rate">${[1, 2, 3, 4, 5].map((n) => `<button class="${n <= r ? 'on' : ''}" data-act="rate" data-v="${n}" title="${n}">★</button>`).join('')}</span>`;
}
function measHTML(s) {
  const a = s.analysis || {};
  if (a.error) return `<p class="bad">${t('No se pudo leer: {e}', { e: esc(errT(a.error)) })}</p>`;
  const bm = a.activeDur ? beatMatch(sampleSeconds(s), S.pack?.bpm || S.set.bpm) : null;
  const isLoop = isLoopSample(s) || a.loopBpm;
  const bands = a.bands ? Object.entries(a.bands).map(([k, v]) => `<span title="${k}" style="display:inline-block;width:${Math.max(2, v * 60)}px;height:8px;background:var(--o);opacity:${0.35 + v * 0.65};margin-right:2px;vertical-align:middle"></span>`).join('') : '';
  const rows = [
    [t('Duración útil'), `${fmtDur(sampleSeconds(s))} <span class="dim">${t('de {d}', { d: fmtDur(a.dur) })}</span>${isLoopSample(s) && !s.recipe?.autoTrim ? ` <span class="dim">· ${t('los loops no se recortan: su silencio final es parte del compás')}</span>` : ''}`],
    [t('Silencio inicial'), a.leadMs > 2 ? `<span class="warn">${nf(a.leadMs, 0)} ms</span> <span class="dim">${t('(se quita al preparar)')}</span>` : `${nf(a.leadMs || 0, 0)} ms`],
    [t('Nivel'), `${t('pico')} ${nf(a.peakDb, 1)} dBFS · RMS ${nf(a.rmsDb, 1)} dB${a.clipRuns ? ` · <span class="bad">${t('{n} saturaciones', { n: a.clipRuns })}</span>` : ''}${Math.abs(a.dc || 0) > 0.01 ? ` · <span class="warn">DC ${nf(a.dc * 100, 1)} %</span>` : ''}`],
    [t('Ataque'), `${nf(a.attackMs, 0)} ms`],
    [t('Caída'), a.t20 != null ? `−20 dB ${t('en')} ${nf(a.t20, 0)} ms${a.t40 != null ? ` · −40 dB ${t('en')} ${nf(a.t40, 0)} ms` : ''}` : t('sostenido')],
    [t('Tono'), a.f0conf > 0.6 ? `${a.note} ${a.cents ? `<span class="dim">${a.cents > 0 ? '+' : ''}${a.cents} ct</span>` : ''} <span class="dim">· ${nf(a.f0, 1)} Hz · ${t('confianza')} ${nf(a.f0conf * 100, 0)} %</span>` : `<span class="dim">${t('sin tono claro')}</span>`],
    [t('Brillo'), `${nf(a.centroid / 1000, 1)} kHz <span class="dim">· ${t('ruido')} ${nf((a.flatness || 0) * 100, 0)} %</span>`],
    [t('Bandas'), `${bands} <span class="dim mono">sub·low·lmid·mid·high·air</span>`],
    [t('Estéreo'), !a.stereo ? t('mono') : a.identicalLR ? t('estéreo con canales idénticos') : `${t('correlación')} ${nf(a.corr, 2)} · ${a.corr < 0 ? `<span class="bad">${t('se cancela en mono')}</span>` : t('en mono pierde {d} dB', { d: nf(a.monoLossDb, 1) })}`],
    [t('Formato'), `${(a.format || s.ext || '').toUpperCase()} · ${nf(a.sr / 1000, 1)} kHz · ${a.bits ? a.bits + ' bit · ' : ''}${a.ch === 1 ? 'mono' : t('{n} canales', { n: a.ch })}`],
  ];
  if (isLoop || a.loopBpm) rows.push([t('Tempo'), `${a.loopBpm ? `${nf(a.loopBpm, 1)} BPM · ${t('{n} tiempos', { n: a.loopBeats })}` : '—'}${s.info?.bpm ? ` · ${t('el nombre dice {b}', { b: s.info.bpm })}` : ''}`]);
  if (isLoop && bm) rows.push(['Beat Match', bm.steps ? `${t('a {b} BPM: {s} pasos', { b: S.pack?.bpm || S.set.bpm, s: bm.steps })} · ${Math.abs(bm.semis) < 0.05 ? `<span class="ok">${t('sin cambio de tono')}</span>` : `<span class="${Math.abs(bm.semis) > 1 ? 'warn' : ''}">${bm.semis > 0 ? '+' : ''}${nf(bm.semis, 2)} ${t('semitonos')}</span>`}` : `<span class="warn">${t('fuera de rango (4–128 pasos)')}</span>`]);
  if (s.info?.key) rows.push([t('Tonalidad (nombre)'), esc(s.info.key)]);
  return `${revisionHTML(s)}<dl class="meas">${rows.map(([k, val]) => `<dt>${k}</dt><dd>${val}</dd>`).join('')}</dl>`;
}
function prepHTML(s) {
  const r = recipeOf(s), a = s.analysis || {};
  const sec = sampleSeconds(s);
  const capped = rawSeconds(s) > MAX_SAMPLE_S;
  const mono = !a.stereo ? 'mono' : r.mono === 'auto' ? (a.identicalLR ? t('canal izquierdo (son iguales)') : a.corr < 0 ? t('el canal más fuerte (la suma se cancela)') : t('suma L+R')) : { sum: t('suma L+R'), left: t('canal izquierdo'), right: t('canal derecho') }[r.mono];
  return `<div class="prep">
    <span class="lbl">${t('Recorte')}</span><span class="row"><label class="inl"><input type="checkbox" data-rc="autoTrim" ${r.autoTrim ? 'checked' : ''}> ${t('quitar silencio y cola bajo')}</label>
      <input type="number" data-rc="thresholdDb" value="${r.thresholdDb}" step="6" min="-90" max="-24" style="width:64px"> dB</span>
    <span class="lbl">${t('Inicio / fin')}</span><span class="row"><input type="number" data-rc="trimStart" placeholder="${t('auto')}" value="${s.recipe?.trimStart ?? ''}" step="0.001" min="0" style="width:86px"> – <input type="number" data-rc="trimEnd" placeholder="${t('auto')}" value="${s.recipe?.trimEnd ?? ''}" step="0.001" min="0" style="width:86px"> s <span class="dim">${t('(o arrastra en la onda)')}</span></span>
    <span class="lbl">${t('Fundidos')}</span><span class="row">${t('entrada')} <input type="number" data-rc="fadeInMs" value="${r.fadeInMs}" min="0" step="1" style="width:64px"> ms · ${t('salida')} <input type="number" data-rc="fadeOutMs" value="${r.fadeOutMs}" min="0" step="5" style="width:64px"> ms</span>
    <span class="lbl">${t('Nivel')}</span><span class="row"><select data-rc="normalize"><option value="peak" ${r.normalize === 'peak' ? 'selected' : ''}>${t('normalizar pico a')}</option><option value="none" ${r.normalize === 'none' ? 'selected' : ''}>${t('ganancia fija')}</option></select>
      ${r.normalize === 'peak' ? `<input type="number" data-rc="targetDb" value="${r.targetDb}" step="0.5" max="0" min="-24" style="width:64px"> dBFS` : `<input type="number" data-rc="gainDb" value="${r.gainDb || 0}" step="0.5" min="-24" max="24" style="width:64px"> dB`}</span>
    <span class="lbl">${t('A mono')}</span><span class="row"><select data-rc="mono">${[['auto', t('automático')], ['sum', t('suma L+R')], ['left', t('canal izquierdo')], ['right', t('canal derecho')]].map(([k, l]) => `<option value="${k}" ${r.mono === k ? 'selected' : ''}>${l}</option>`).join('')}</select> <span class="muted">${esc(mono)}</span></span>
    ${fitHTML(s)}
    <span class="lbl">${t('Reverse')}</span><span><label class="inl"><input type="checkbox" data-rc="reverse" ${r.reverse ? 'checked' : ''}> ${t('guardar al revés')}</label></span>
  </div>
  <div class="result ${capped || (a.stereo && a.corr < 0 && r.mono === 'sum') ? 'warn' : ''}">${t('En la Rhythm: 48 kHz · mono · 16 bit · {d}', { d: fmtDur(sec) })}${capped ? ' · ' + t('recortado a 30 s') : ''}${a.stereo && a.corr < 0 && r.mono === 'sum' ? ' · ' + t('⚠ la suma se cancela') : ''}
    ${Object.keys(s.recipe || {}).length ? ` · <button class="btn small ghost" data-act="recipe-reset">${t('Restablecer')}</button>` : ''}</div>`;
}
function renderDetail() {
  const d = $('#detail'); if (!d) return;
  const s = S.byId[S.sel];
  if (!s) { d.innerHTML = `<div class="panel empty">${t('Elige un sample de la lista.')}</div>`; return; }
  const c = clsOf(s), a = s.analysis || {}, u = s.user || {};
  const packsWith = S.packs.flatMap((p) => p.slots.map((id, i) => (id === s.id ? { p, i } : null)).filter(Boolean));
  const sims = similarTo(s, 6);
  const cl = CERT_LABEL();
  d.innerHTML = `
    <div class="label"><div class="nm">${esc(s.name.replace(/\.(wav|aiff?|mp3|flac|ogg)$/i, ''))}</div>
      <div class="path">${esc(s.path)}${s.paths?.length > 1 ? ` <b>+${s.paths.length - 1}</b> ${t('copias idénticas')}` : ''}${s.missing ? ` · <b style="color:#b3261e">${t('no encontrado')}</b>` : ''}</div>
      <div class="meta"><span>${fmtDur(sampleSeconds(s))}</span>${a.note && a.f0conf > 0.6 && !['dloop', 'mloop'].includes(c.cat) ? `<span>${a.note}</span>` : ''}${a.loopBpm && isLoopSample(s) ? `<span>${nf(a.loopBpm, 1)} BPM</span>` : ''}${isLoopSample(s) ? `<span>${t('Loop')}</span>` : ''}${s.info?.key ? `<span>${esc(s.info.key)}</span>` : ''}<span>${s.src?.kind === 'root' ? t('enlazado') : t('copiado en el navegador')}</span></div></div>
    <div class="panel" style="margin-top:12px">
      <canvas class="wave" id="wave" width="900" height="200"></canvas>
      <div class="transport">
        <button class="btn primary" data-act="play">${Player.playing ? '■' : '▶'} <span class="kbd">${t('Espacio')}</span></button>
        <span class="seg"><button class="${S.set.play === 'rhythm' ? 'on' : ''}" data-act="playmode" data-v="rhythm">${t('Como en la Rhythm')}</button><button class="${S.set.play === 'orig' ? 'on' : ''}" data-act="playmode" data-v="orig">${t('Original')}</button></span>
        <span class="kbd">R</span>
        <label class="inl" title="${t('Solo para escuchar: equivale al macro Tune de la Rhythm')}">${t('Tune')} <input type="range" id="tune" min="-24" max="24" step="1" value="${S.tune}" style="width:110px"> <span class="mono" id="tunev">${S.tune > 0 ? '+' : ''}${S.tune}</span></label>
        ${isLoopSample(s) || a.loopBpm ? `<label class="inl" ${keepActive(s) ? `title="${t('Acortado: las slices elegidas se ven en la onda')}"` : ''}>${t('Slices')} <select id="slices" ${keepActive(s) ? 'disabled' : ''}>${[0, 4, 8, 16].map((n) => `<option value="${n}" ${S.slices === n ? 'selected' : ''}>${n || '—'}</option>`).join('')}</select></label>` : ''}
        ${abHTML(s)}
        <span class="grow"></span>${sampleToolsHTML(s)}
        ${S.midiOn && S.midi.out ? `<button class="btn small" data-act="dev-play-sample" title="${t('Solo si este sample ya está en la Rhythm, en el slot del pack actual')}">${t('Tocar en la Rhythm')}</button>` : ''}
      </div>
    </div>
    ${shortHTML(s)}
    <div class="panel" style="margin-top:12px"><div class="cls">
      <div class="prop"><span class="big-cat" style="--c:${catVar(c.cat)}">${catLabel(c.cat)}</span><span class="cert ${c.cert}">${cl[c.cert]}</span>
        <span class="muted" style="font-size:13.5px">${CERT_EXPLAIN()[c.cert]}</span></div>
      ${whyHTML(s, c)}
      ${keysHTML(c, s)}
      <div class="row">${c.cat && !u.cat ? `<button class="btn small" data-act="accept">${t('Aceptar propuesta')} <span class="kbd">Intro</span></button>` : ''}
        ${u.cat ? `<button class="btn small ghost" data-act="undecide">${t('Quitar mi decisión')}</button>` : ''}
        <span class="grow"></span>${rateHTML(s)}
        <button class="btn small ${u.fav ? 'on' : ''}" data-act="fav">♥ <span class="kbd">F</span></button>
        <button class="btn small ${u.discard ? 'on' : ''}" data-act="discard" title="${t('Se queda en la biblioteca, pero no entra en los packs')}">${u.discard ? t('Descartado') : t('Descartar')} <span class="kbd">${t('Mayús')} ${t('Supr')}</span></button><button class="btn small danger" data-act="trash-del" title="${t('Fuera de la biblioteca (a la papelera; Ctrl Z deshace)')}">${t('Eliminar')} <span class="kbd">${t('Supr')}</span></button></div>
    </div></div>
    ${orgPanelHTML(s)}
    <div class="grid2" style="margin-top:12px">
      <div class="panel"><h2>${t('Medición')}</h2>${measHTML(s)}</div>
      <div class="panel"><h2>${t('Preparación')}</h2><p class="note" style="margin-top:0">${t('El archivo original no se toca. Esto se aplica al exportar el pack.')}</p>${prepHTML(s)}</div>
    </div>
    <div class="grid2" style="margin-top:12px">
      <div class="panel"><h2>${t('En packs')}</h2>${packsWith.length ? packsWith.map(({ p, i }) => `<div><button class="btn small ghost" data-act="goto-slot" data-p="${p.id}" data-i="${i}">${esc(p.name)} · slot ${i + 1}</button></div>`).join('') : `<p class="muted">${t('Todavía en ningún pack.')}</p>`}
        ${S.pack ? `<button class="btn small" data-act="add-to-pack">${t('Añadir a «{p}»', { p: esc(S.pack.name) })}</button>` : ''}</div>
      <div class="panel"><h2>${t('Parecidos')}</h2>${sims.length ? `<div class="sim">${sims.map((x) => `<div class="row" style="gap:4px;flex-wrap:nowrap"><button data-act="sel" data-id="${x.s.id}" class="grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><span style="color:${catVar(clsOf(x.s).cat)}">■</span> ${esc(x.s.name)} <span class="dim mono">${nf(x.d, 2)}</span></button><button class="btn small ghost" data-act="ab" data-id="${x.s.id}" title="${t('Comparar: Tab alterna entre este y el seleccionado')}">A/B</button></div>`).join('')}</div>` : `<p class="muted">${t('Sin medición para comparar.')}</p>`}</div>
    </div>`;
  drawWave($('#wave'), s);
  afterDetail(s);
}
function similarTo(s, n) {
  if (!s.analysis?.bands) return [];
  const out = [];
  for (const x of S.samples) {
    if (x.id === s.id || !x.analysis?.bands) continue;
    const d = featureDistance(s.analysis, x.analysis);
    if (out.length < n || d < out[out.length - 1].d) { out.push({ s: x, d }); out.sort((p, q) => p.d - q.d); if (out.length > n) out.pop(); }
  }
  return out;
}

// forma de onda: zona útil, asas de recorte, slices y cursor
function trimView(s) {
  const a = s.analysis || {}, r = recipeOf(s);
  const dur = a.dur || 0;
  let st = r.autoTrim && a.leadMs != null ? a.leadMs / 1000 : 0;
  let en = r.autoTrim && a.activeDur != null ? st + a.activeDur : dur;
  if (s.recipe?.trimStart != null) st = s.recipe.trimStart;
  if (s.recipe?.trimEnd != null) en = s.recipe.trimEnd;
  en = Math.min(en, st + MAX_SAMPLE_S);
  return { dur, st, en };
}
function drawWave(cv, s, playPos = null) {
  if (!cv) return;
  const W = cv.width = Math.max(300, Math.round(cv.clientWidth * devicePixelRatio)), H = cv.height = Math.round(cv.clientHeight * devicePixelRatio || 200);
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  const ov = s.ov;
  const { dur, st, en } = trimView(s);
  if (!ov || !dur) { g.fillStyle = '#5f5d59'; g.font = `${14 * devicePixelRatio}px sans-serif`; g.fillText(s.analysis?.error ? t('No se pudo leer el audio') : '…', 12, H / 2); return; }
  const cols = ov.length / 2;
  let mx = 0; for (let i = 0; i < ov.length; i++) mx = Math.max(mx, Math.abs(ov[i]));
  const k = mx > 0 ? (H * 0.46) / mx : 1;
  const x0 = (st / dur) * W, x1 = (en / dur) * W;
  // degradado de la Rhythm (violeta → azul → cian), el mismo que franja, pestaña y fila
  const grad = g.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, '#5b25a6'); grad.addColorStop(0.35, '#5b5fd0'); grad.addColorStop(0.68, '#4aa3e8'); grad.addColorStop(1, '#34f0e6');
  for (let c = 0; c < cols; c++) {
    const x = (c / cols) * W, w = Math.max(1, W / cols - 0.5);
    const inside = x + w >= x0 && x <= x1;
    g.fillStyle = inside ? grad : '#3a3a40';
    const y0 = H / 2 - ov[c * 2 + 1] * k, y1 = H / 2 - ov[c * 2] * k;
    g.fillRect(x, y0, w, Math.max(1, y1 - y0));
  }
  g.fillStyle = '#00000088'; g.fillRect(0, 0, x0, H); g.fillRect(x1, 0, W - x1, H);
  g.fillStyle = '#ebe8e3'; g.fillRect(x0 - 1, 0, 2, H); g.fillRect(x1 - 1, 0, 2, H);
  g.fillRect(x0 - 5, 0, 10, 6); g.fillRect(x1 - 5, H - 6, 10, 6);
  const kp = keepOf(s);
  if (kp) {
    // acortado: slices que se quedan (con su orden) y las que se quitan, sombreadas
    const R = sliceRegion(s), w = (R.len / kp.n / dur) * W, xs = (R.st / dur) * W;
    for (let i = 0; i < kp.n; i++) {
      const x = xs + i * w, pos = kp.sel.map((v, j) => (v === i ? j + 1 : 0)).filter(Boolean);
      if (!pos.length) { g.fillStyle = '#000000b0'; g.fillRect(x, 0, w, H); }
      g.strokeStyle = '#f0b232cc'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
      g.fillStyle = pos.length ? '#f0b232' : '#8e8b86'; g.font = `${11 * devicePixelRatio}px monospace`;
      g.fillText(pos.length ? pos.join('·') : '×', x + 4 * devicePixelRatio, H - 22 * devicePixelRatio);
    }
  } else if (S.slices) {
    // slices iguales sobre lo que se exporta (ajustado al compás si lo está), como en la Rhythm
    const R = sliceRegion(s), xs = (R.st / dur) * W, xe = Math.min(W, ((R.st + R.len) / dur) * W);
    g.strokeStyle = '#f0b232aa'; g.lineWidth = 1;
    for (let i = 1; i < S.slices; i++) { const x = xs + ((xe - xs) * i) / S.slices; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  }
  if (playPos != null) { g.fillStyle = '#3ecf8e'; g.fillRect((playPos / dur) * W, 0, 2, H); }
  g.fillStyle = '#8e8b86'; g.font = `${11 * devicePixelRatio}px monospace`;
  g.fillText(`${nf(st, 3)} s`, Math.min(W - 70 * devicePixelRatio, x0 + 6), 14 * devicePixelRatio);
  g.fillText(`${nf(en, 3)} s`, Math.max(4, x1 - 62 * devicePixelRatio), H - 8 * devicePixelRatio);
}

// ---------- escucha ----------
function buildQueue() {
  const L = S.listen;
  let list;
  if (L.src === 'filter') list = filtered().slice();
  else if (L.src === 'sel') list = [...S.multi].map((id) => S.byId[id]).filter(Boolean);
  else list = S.samples.filter((s) => {
    if (s.user?.discard || s.analysis?.error) return false;
    const c = clsOf(s);
    if (L.src === 'doubt') return ['doubt', 'none'].includes(c.cert);
    if (L.src === 'unheard') return !s.user?.heard && !s.user?.cat;
    if (L.src === 'sound') return c.cert === 'sound';
    if (L.src === 'onehint') return c.cert === 'onehint';
    return true;
  });
  if (L.cat !== 'all') list = list.filter((s) => clsOf(s).cat === L.cat);
  // una sola escucha por archivo idéntico ya está garantizada (huella SHA-256)
  if (L.order === 'random') { let seed = 7; list.sort(() => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5); }
  else if (L.order === 'cat') list.sort((a, b) => String(clsOf(a).cat).localeCompare(String(clsOf(b).cat)) || a.path.localeCompare(b.path));
  else list.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
  L.queue = list.map((s) => s.id); L.i = 0;
}
function renderListen(v) {
  const L = S.listen;
  if (!L.queue.length && !L.built) { buildQueue(); L.built = true; }
  const s = S.byId[L.queue[L.i]];
  const counts = { doubt: 0, unheard: 0, sound: 0, onehint: 0 };
  for (const x of S.samples) { if (x.user?.discard) continue; const c = clsOf(x).cert; if (c === 'doubt' || c === 'none') counts.doubt++; if (c === 'sound') counts.sound++; if (c === 'onehint') counts.onehint++; if (!x.user?.heard && !x.user?.cat) counts.unheard++; }
  const srcs = [['doubt', t('Dudosos y sin pistas'), counts.doubt], ['unheard', t('Sin escuchar'), counts.unheard], ['sound', t('Solo por el sonido'), counts.sound], ['onehint', t('Solo por el texto'), counts.onehint], ['filter', t('Filtro de la biblioteca'), filtered().length], ['sel', t('Selección'), S.multi.size], ['all', t('Todo'), S.samples.length]];
  const c = s ? clsOf(s) : null;
  v.innerHTML = `<div class="listen">
    <section class="panel"><h2>${t('Cola de escucha')}</h2>
      <div style="display:flex;flex-direction:column;gap:4px">${srcs.map(([k, l, n]) => `<label class="inl" style="color:var(--ink)"><input type="radio" name="lsrc" value="${k}" ${L.src === k ? 'checked' : ''}> ${l} <span class="dim mono">${n}</span></label>`).join('')}</div>
      <h3>${t('Categoría propuesta')}</h3><select id="lcat"><option value="all">${t('Todas')}</option>${CATS.map((k) => `<option value="${k.id}" ${L.cat === k.id ? 'selected' : ''}>${catLabel(k.id)}</option>`).join('')}</select>
      <h3>${t('Orden')}</h3><select id="lorder">${[['folder', t('Por carpeta')], ['cat', t('Por propuesta')], ['random', t('Aleatorio')]].map(([k, l]) => `<option value="${k}" ${L.order === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <div class="sep"></div>
      <label class="inl"><input type="checkbox" id="lauto" ${L.auto ? 'checked' : ''}> ${t('Sonar al llegar a cada sample')}</label>
      <label class="inl" title="${t('Si cambias la categoría, las etiquetas que había detectado la herramienta pasan a ser tuyas en lugar de perderse')}"><input type="checkbox" id="lkeep" ${S.set.keepDet !== false ? 'checked' : ''}> ${t('Al decidir, conservar las etiquetas detectadas')}</label>
      <div class="sep"></div>
      <h3>${t('Esta sesión')}</h3><p class="muted" style="margin:0">${t('{d} decididos · {a} propuestas aceptadas · {c} corregidas', { d: L.stats.d, a: L.stats.a, c: L.stats.c })}</p>
      <p class="note">${t('Cada corrección enseña a la herramienta: las palabras de tus nombres y carpetas que se repiten pasan a ser reglas.')}</p>
    </section>
    <section>${s ? `
      <div class="panel lcard">
        <div class="row"><span class="mono muted">${L.i + 1} / ${L.queue.length}</span><span class="grow"><div class="progress"><i style="width:${((L.i + 1) / L.queue.length) * 100}%"></i></div></span></div>
        <div class="nm" style="margin-top:10px">${esc(s.name.replace(/\.(wav|aiff?|mp3|flac|ogg)$/i, ''))}</div>
        <div class="mono muted" style="margin-bottom:10px">${esc(s.path)}</div>
        <canvas class="wave" id="wave" style="height:140px"></canvas>
        <div class="transport"><button class="btn primary" data-act="play">${Player.playing ? '■' : '▶'} <span class="kbd">${t('Espacio')}</span></button>
          <span class="seg"><button class="${S.set.play === 'rhythm' ? 'on' : ''}" data-act="playmode" data-v="rhythm">${t('Como en la Rhythm')}</button><button class="${S.set.play === 'orig' ? 'on' : ''}" data-act="playmode" data-v="orig">${t('Original')}</button></span>
          <span class="muted">${fmtDur(sampleSeconds(s))}${s.analysis?.note && s.analysis.f0conf > 0.6 ? ' · ' + s.analysis.note : ''}${s.analysis?.loopBpm ? ' · ' + nf(s.analysis.loopBpm, 1) + ' BPM' : ''}</span>${sampleToolsHTML(s)}<span class="grow"></span><button class="btn danger" data-act="trash-del" title="${t('Fuera de la biblioteca (a la papelera; Ctrl Z deshace)')}">${t('Eliminar')} <span class="kbd">${t('Supr')}</span></button></div>
        <div class="prop" style="margin:12px 0 6px"><span class="muted">${t('Propuesta')}</span><span class="big-cat" style="--c:${catVar(c.cat)}">${catLabel(c.cat)}</span><span class="cert ${c.cert}">${CERT_LABEL()[c.cert]}</span>${rateHTML(s)}${s.user?.fav ? '<span style="color:var(--m)">♥</span>' : ''}</div>
        ${whyHTML(s, c)}
        <div style="margin-top:10px">${keysHTML(c, s)}</div>
        <div class="sep"></div>${orgDetailHTML(s, { compact: true })}
      </div>
      ${shortHTML(s)}
      <div class="panel" style="margin-top:12px"><div class="legend">
        <span><span class="kbd">${t('Espacio')}</span> ${t('escuchar')}</span><span><span class="kbd">${t('Intro')}</span> ${t('aceptar propuesta')}</span><span><span class="kbd">K S C H O Y T E</span> ${t('baterías')}</span><span><span class="kbd">B L P X V</span> ${t('bajo, lead/synth, pad/atmos, FX, voz')}</span>
        <span><span class="kbd">D M</span> ${t('loops')}</span><span><span class="kbd">W</span> ${t('loop / one-shot')}</span><span><span class="kbd">1–5</span> ${t('valorar')}</span><span><span class="kbd">F</span> ${t('favorito')}</span><span><span class="kbd">${t('Supr')}</span> ${t('eliminar')}</span><span><span class="kbd">${t('Mayús')} ${t('Supr')}</span> ${t('descartar')}</span><span><span class="kbd">Alt 1–9</span> ${t('etiqueta rápida')}</span><span><span class="kbd">?</span> ${t('todos los atajos')}</span><span><span class="kbd">← →</span> ${t('anterior / siguiente')}</span><span><span class="kbd">R</span> ${t('original / Rhythm')}</span><span><span class="kbd">G</span> ${t('subcarpeta propuesta')}</span></div></div>`
      : `<div class="panel empty"><h2>${t('Nada que escuchar aquí')}</h2><p>${L.queue.length ? t('Has llegado al final de la cola.') : t('La cola está vacía con esta selección.')}</p><button class="btn" data-act="lrebuild">${t('Volver a montar la cola')}</button></div>`}</section></div>`;
  if (s) { drawWave($('#wave'), s); afterDetail(s); }
}

// ---------- packs ----------
function renderPacks(v) {
  if (S.pack) for (const id of S.pack.slots) if (id && S.byId[id]) clsOf(S.byId[id]);
  if (!S.pack) {
    v.innerHTML = `<div class="panel empty"><h2>${t('Todavía no hay packs')}</h2><p>${t('Un pack son los 128 samples que carga la Rhythm (8 páginas de 16). Límite: {t} s en total y 30 s por sample.', { t: MAX_TOTAL_S })}</p>
      <button class="btn primary" data-act="pack-new">${t('Nuevo pack')}</button></div>`;
    return;
  }
  const p = S.pack;
  const b = budget(p, S.byId);
  const roles = ROLE_LABEL();
  const layout = LAYOUTS[p.layout] || LAYOUTS.free;
  const pageNames = { instrument: ['Kicks', 'Snares · Claps', 'Hats', 'Perc · Toms · Cymbals', 'Bass', 'Synth', 'Atmos · FX · Vox', 'Loops'], novation: ['Kit 1', 'Kit 2', 'Kit 3', 'Kit 4', 'Kit 5', 'Kit 6', t('Melódicos'), t('Loops + breaks')] }[p.layout] || [];
  const pageCols = ['#ff7a1a', '#ff5a4a', '#ff4f8b', '#e8336d', '#c23aa8', '#9a46d6', '#7a4dff', '#5b5bd6'];
  const sel = S.packSel;
  const selId = sel != null ? p.slots[sel] : null;
  const selS = selId ? S.byId[selId] : null;
  const role = sel != null ? roleOf(p.layout, sel) : null;
  const cands = packCandidates(role);
  const chk = packChecks(p);
  const usage = p.usage || {};
  v.innerHTML = `<div class="packs"><section>
    <div class="panel"><div class="row">
      <select id="packsel">${S.packs.map((q) => `<option value="${q.id}" ${q.id === p.id ? 'selected' : ''}>${esc(q.name)}</option>`).join('')}</select>
      <input type="text" id="packname" value="${esc(p.name)}" maxlength="32" style="width:200px" title="${t('Nombre del pack')}">
      <button class="btn small" data-act="pack-new">${t('Nuevo')}</button><button class="btn small" data-act="pack-dup">${t('Duplicar')}</button><button class="btn small danger" data-act="pack-del">${t('Borrar')}</button>
      <span class="grow"></span>
      <label class="inl">${t('Distribución')} <select id="packlayout">${LAYOUT_IDS.map((k) => `<option value="${k}" ${p.layout === k ? 'selected' : ''}>${{ instrument: t('Una página por instrumento'), novation: t('Como el pack de fábrica'), free: t('Libre') }[k]}</option>`).join('')}</select></label>
      <label class="inl">BPM <input type="number" id="packbpm" value="${p.bpm || S.set.bpm}" min="40" max="240" style="width:64px" title="${t('Tempo de tus proyectos: sirve para comprobar el Beat Match de los loops')}"></label>
    </div>
    <div class="budget"><div class="bbar">${b.pages.map((sec, i) => `<i style="width:${(sec / Math.max(MAX_TOTAL_S, b.total)) * 100}%;background:${pageCols[i]}" title="${t('Página {n}', { n: i + 1 })}: ${nf(sec)} s"></i>`).join('')}${b.total > MAX_TOTAL_S ? `<span class="lim" style="left:${(MAX_TOTAL_S / b.total) * 100}%"></span>` : ''}</div>
      <div class="btext"><span><b class="${b.over ? 'bad' : ''}">${nf(b.total)} s</b> ${t('de {m} s', { m: MAX_TOTAL_S })} · ${b.over ? `<b class="bad">${t('te pasas {x} s', { x: nf(-b.free) })}</b>` : t('quedan {x} s', { x: nf(b.free) })}</span><span>${t('{n} de 128 slots', { n: b.used })}</span><button class="btn small" data-act="sh-from-pack" title="${t('Loops que se repiten: quedarse con una parte para ahorrar tiempo')}">✂ ${t('Acortar loops')}</button>
        <span>${p.source ? t('Importado de {f}', { f: esc(p.source.file) }) : ''}</span></div></div>
    ${chk.issues.length ? `<ul class="warnlist">${chk.issues.map((i) => `<li class="${i.k}">${i.m}</li>`).join('')}</ul>` : ''}
    </div>
    <div class="pages" style="margin-top:12px">${[...Array(8).keys()].map((pg) => `<div class="page"><div class="ph"><span><b>${t('Página {n}', { n: pg + 1 })}</b> ${pageNames[pg] ? '· ' + esc(pageNames[pg]) : ''}</span><span class="mono">${nf(b.pages[pg])} s · ${t('pista')} ${pg + 1} ▼▲</span></div>
      <div class="pads">${[...Array(PAGE).keys()].map((k) => { const i = pg * PAGE + k; return padHTML(p, i, layout[i], roles, usage); }).join('')}</div></div>`).join('')}</div>
  </section>
  <aside class="side">
    <div class="panel">${sel == null ? `<h2>${t('Slot')}</h2><p class="muted">${t('Pulsa un slot para elegir qué va en él. Arrastra samples desde la lista o entre slots; Supr lo vacía.')}</p>` : `
      <h2>${t('Slot {n}', { n: sel + 1 })} <span class="muted mono" style="font-weight:400">· SD ${sel < 10 ? '0' + sel : sel} · ${t('página {p}, pad {k}', { p: Math.floor(sel / 16) + 1, k: (sel % 16) + 1 })}</span></h2>
      <p class="muted" style="margin:0 0 8px">${t('Papel')}: ${roles[role.id]}${usage[sel] ? ` · <span class="ok">${t('lo usan {n} proyectos', { n: usage[sel].length })}</span>` : ''}</p>
      ${selS ? `<div class="row"><b class="grow" style="color:${catVar(clsOf(selS).cat)}">${esc(selS.name)}</b></div>
        <label class="inl" style="margin:6px 0">${t('Nombre en el equipo')} <input type="text" id="slotname" value="${esc(p.names[sel])}" maxlength="32" style="width:170px"></label>
        <p class="muted" style="margin:4px 0">${fmtDur(sampleSeconds(selS))}${['dloop', 'mloop'].includes(clsOf(selS).cat) ? ' · ' + beatText(selS, p) : ''}</p>
        <div class="row"><button class="btn small" data-act="slot-play">▶ ${t('Escuchar')}</button>${S.midiOn && S.midi.out ? `<button class="btn small" data-act="slot-dev">${t('En la Rhythm')}</button>` : ''}<button class="btn small" data-act="slot-open">${t('Ficha')}</button><button class="btn small danger" data-act="slot-clear">${t('Quitar')}</button></div>` : `<p class="muted">${t('Vacío.')}</p>`}`}
    </div>
    <div class="panel"><div class="row"><h2 class="grow" style="margin:0">${t('Candidatos')}</h2>
      <select id="packcat"><option value="role" ${S.packCat === 'role' ? 'selected' : ''}>${t('Según el papel del slot')}</option><option value="all" ${S.packCat === 'all' ? 'selected' : ''}>${t('Todas las categorías')}</option>${CATS.map((k) => `<option value="${k.id}" ${S.packCat === k.id ? 'selected' : ''}>${catLabel(k.id)}</option>`).join('')}</select></div>
      <input type="search" id="packq" placeholder="${t('Buscar…')}" value="${esc(S.packQ)}" style="width:100%;margin:8px 0">
      <div class="mini">${cands.slice(0, 300).map((s) => `<div class="mi" draggable="true" data-id="${s.id}" data-act="cand" style="--c:${catVar(clsOf(s).cat)}" title="${esc(s.path)}"><span class="bar"></span><span class="nm">${s.user?.fav ? '♥ ' : ''}${esc(s.name)}</span><span class="mono muted">${fmtDur(sampleSeconds(s))}</span></div>`).join('') || `<p class="muted" style="padding:8px">${t('Sin candidatos.')}</p>`}</div>
      <p class="note">${t('Clic: escuchar · doble clic: poner en el slot elegido · arrastrar: a cualquier slot.')}</p>
    </div>
    <div class="panel"><h2>${t('Construir automáticamente')}</h2>
      <div class="prep"><span class="lbl">${t('Certeza mínima')}</span><select id="ab-cert">${[['user', t('Decidido por ti')], ['confirmed', t('Confirmado o más')], ['onehint', t('Una pista o más')], ['any', t('Cualquiera')]].map(([k, l]) => `<option value="${k}" ${S.set.minCert === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <span class="lbl">${t('Loops de hasta')}</span><span><input type="number" id="ab-loop" value="${S.set.loopMax}" min="1" max="30" style="width:60px"> s</span>
        <span class="lbl">${t('Slots ocupados')}</span><label class="inl"><input type="checkbox" id="ab-keep" checked> ${t('conservar')}</label></div>
      <p class="note">${t('Elige por valoración, favoritos y certeza; evita copias y sonidos casi idénticos; prioriza baterías (cortas) y deja los loops para el final para no agotar los {t} s.', { t: MAX_TOTAL_S })}</p>
      <button class="btn primary" data-act="autobuild">${t('Rellenar el pack')}</button> ${S.history.length ? `<button class="btn small" data-act="pack-undo">${t('Deshacer')} <span class="kbd">Ctrl+Z</span></button>` : ''}
    </div>
    <div class="panel"><h2>${t('Exportar')}</h2>
      <div class="export">
        <button class="btn primary" data-act="exp-components">${t('Para Components')}</button>
        <button class="btn" data-act="exp-sd">${t('A la tarjeta SD')}</button>
        <button class="btn" data-act="exp-sdzip">${t('ZIP para la SD')}</button>
        <button class="btn" data-act="exp-wav">${t('WAV numerados + CSV')}</button></div>
      <p class="note"><b>Components</b>: ${t('archivo .circuitrhythmpack para abrir en Components y enviarlo a la Rhythm.')} ${p.extra?.projects?.length ? t('Incluye los {n} proyectos del pack original.', { n: p.extra.projects.length }) : t('Con proyectos vacíos.')}<br>
        <b>${t('Tarjeta SD')}</b>: ${t('escribe Rhythm/<n>/PCM directamente en la microSD (Chrome/Edge). No sobrescribe packs existentes.')}<span class="tag-unv">${t('sin verificar en tu equipo')}</span></p>
      ${S.midiOn && S.midi.out ? `<div class="sep"></div><button class="btn" data-act="pack-walk">${t('Recorrer el pack en la Rhythm')}</button> <span class="note">${t('Pista {n}, CC 8 + nota', { n: S.set.track + 1 })}</span>` : ''}
    </div>
  </aside></div>`;
}
function beatText(s, p) {
  const bm = beatMatch(sampleSeconds(s), p.bpm || S.set.bpm);
  if (!bm || !bm.steps) return `<span class="warn">${t('Beat Match fuera de rango')}</span>`;
  return `Beat Match ${bm.steps} ${t('pasos')} · ${Math.abs(bm.semis) < 0.05 ? `<span class="ok">0 st</span>` : `<span class="${Math.abs(bm.semis) > 1 ? 'warn' : ''}">${bm.semis > 0 ? '+' : ''}${nf(bm.semis, 2)} st</span>`}`;
}
function padHTML(p, i, role, roles, usage) {
  const id = p.slots[i];
  const s = id ? S.byId[id] : null;
  const sel = S.packSel === i ? 'sel' : '';
  if (!id) return `<div class="pad emptyslot ${sel}" data-act="slot" data-i="${i}"><span class="no">${i + 1}</span><span class="pn">${role.id === 'any' ? '' : esc(roles[role.id])}</span></div>`;
  if (!s) return `<div class="pad filled ${sel}" data-act="slot" data-i="${i}" draggable="true" style="--c:var(--bad)"><span class="no">${i + 1}</span><span class="pn bad">${t('falta')}</span><span class="pn">${esc(p.names[i])}</span></div>`;
  const c = clsOf(s);
  const sec = sampleSeconds(s);
  const off = role.cats && c.cat && !role.cats.includes(c.cat);
  const warn = rawSeconds(s) > MAX_SAMPLE_S ? '<span class="warn">30s</span>' : off ? `<span class="dim" title="${t('No coincide con el papel del slot')}">≠</span>` : '';
  return `<div class="pad filled ${sel} ${usage[i] ? 'used' : ''}" data-act="slot" data-i="${i}" draggable="true" style="--c:${catVar(c.cat)}" title="${esc(s.name)}"><span class="no">${i + 1}</span><span class="ps">${nf(sec, sec < 10 ? 2 : 1)}</span><span class="pn">${esc(p.names[i] || s.name)}</span><span class="pw">${warn}</span></div>`;
}
function packCandidates(role) {
  const q = S.packQ.trim().toLowerCase();
  const used = new Set(S.pack.slots.filter(Boolean));
  const cats = S.packCat === 'role' ? (role && role.cats) : S.packCat === 'all' ? null : [S.packCat];
  return S.samples.filter((s) => !s.user?.discard && !used.has(s.id) && !s.analysis?.error && (!cats || cats.includes(clsOf(s).cat)) && (!q || s.path.toLowerCase().includes(q)))
    .sort((a, b) => (b.user?.fav ? 1 : 0) - (a.user?.fav ? 1 : 0) || (b.user?.rating || 0) - (a.user?.rating || 0) || a.path.localeCompare(b.path));
}
function showChecks(c, title) {
  modal(`<h2>${title}</h2><ul class="warnlist">${c.issues.map((i) => `<li class="${i.k}">${i.m}</li>`).join('')}</ul><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-act="modal-close">${t('Entendido')}</button></div>`);
}
function modal(html) { const m = $('#modal'); m.innerHTML = `<div class="box">${html}</div>`; m.classList.add('on'); }
function closeModal() { $('#modal').classList.remove('on'); $('#modal').innerHTML = ''; }

// ---------- equipo ----------
function renderDevice(v) {
  const m = S.midi;
  const { outs, ins } = m.ports();
  const names = ['Tune', 'Start', 'Length', 'Slope', 'Distortion', 'HP Filter', 'LP Filter', 'Resonance'];
  v.innerHTML = `<div class="cols">
    <section class="panel"><h2>${t('Conexión')}</h2>
      ${!m.supported ? `<p class="bad">${t('Este navegador no tiene Web MIDI. Usa Chrome o Edge.')}</p>` : !S.midiOn ? `<p class="muted">${t('Conecta la Circuit Rhythm por USB y pulsa Conectar.')}</p><button class="btn primary" data-act="midi-connect">${t('Conectar')}</button>${S.midiErr ? `<p class="bad">${esc(S.midiErr)}</p>` : ''}` : `
      <div class="prep"><span class="lbl">${t('Salida')}</span><select id="midi-out"><option value="">—</option>${outs.map((o) => `<option value="${o.id}" ${m.out?.id === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>
        <span class="lbl">${t('Entrada')}</span><select id="midi-in"><option value="">—</option>${ins.map((o) => `<option value="${o.id}" ${m.inp?.id === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>
        <span class="lbl">${t('Tempo del equipo')}</span><span>${m.bpm ? `<b>${nf(m.bpm, 1)} BPM</b> ${S.pack ? `<button class="btn small" data-act="midi-bpm">${t('Usar en el pack')}</button>` : ''}` : `<span class="muted">${t('pulsa Play en la Rhythm para leerlo')}</span>`}</span></div>`}
      <div class="sep"></div>
      <h3>${t('Canales de las pistas')}</h3><p class="note">${t('Deben coincidir con Setup View de la Rhythm (por defecto, pista N en el canal N).')}</p>
      <div class="knobs">${S.set.channels.map((ch, i) => `<label class="knob">${t('Pista {n}', { n: i + 1 })}<select data-chan="${i}">${[...Array(16).keys()].map((c) => `<option value="${c + 1}" ${ch === c + 1 ? 'selected' : ''}>${c + 1}</option>`).join('')}</select></label>`).join('')}</div>
      <h3>${t('Pista para escuchar')}</h3><select id="dev-track">${[...Array(8).keys()].map((i) => `<option value="${i}" ${S.set.track === i ? 'selected' : ''}>${t('Pista {n}', { n: i + 1 })}</option>`).join('')}</select>
    </section>
    <section class="panel"><h2>${t('Probar en la Rhythm')}</h2>
      <p class="note">${t('Por MIDI no se pueden enviar samples (eso lo hace Components o la tarjeta SD). Lo que sí se puede: elegir el slot de una pista (CC 8, 0–127), tocarlo (nota 60 = su altura original) y mover sus macros (CC 21–28).')}</p>
      <div class="row"><label class="inl">${t('Slot')} <input type="number" id="dev-slot" min="1" max="128" value="1" style="width:70px"></label>
        <button class="btn" data-act="dev-audition" ${S.midiOn && m.out ? '' : 'disabled'}>${t('Elegir y tocar')}</button>
        <button class="btn" data-act="dev-note" ${S.midiOn && m.out ? '' : 'disabled'}>${t('Solo nota')}</button>
        <button class="btn" data-act="dev-panic" ${S.midiOn && m.out ? '' : 'disabled'}>${t('Silenciar')}</button></div>
      <h3>${t('Macros de la pista')} <span class="muted" style="text-transform:none;letter-spacing:0">${t('(la pista elegida en Conexión)')}</span></h3>
      <div class="knobs">${names.map((n, i) => `<label class="knob">${n} <span class="mono">CC ${CC.macros[i]}</span><input type="range" min="0" max="127" value="${[64, 0, 127, 64, 0, 0, 127, 0][i]}" data-macro="${i}" ${S.midiOn && m.out ? '' : 'disabled'}></label>`).join('')}</div>
      <button class="btn small" data-act="dev-macro-reset" ${S.midiOn && m.out ? '' : 'disabled'}>${t('Macros a su valor por defecto')}</button>
      <p class="note">${t('Sin verificar en tu equipo')}: ${t('que el CC 8 cambie el sample activo de la pista y el tiempo que necesita antes de la nota (25 ms).')}</p>
    </section>
    ${trackPanelHTML()}
    <section class="panel"><h2>${t('Registro MIDI')}</h2><div class="log">${m.log.slice(-24).map((l) => new Date(l.t).toLocaleTimeString(LOCALE) + '  ' + l.bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ')).join('\n') || t('Nada enviado todavía.')}</div></section>
  </div>`;
}

// ---------- datos ----------
function renderData(v) {
  const blobs = S.samples.filter((s) => s.src?.kind === 'blob').length;
  const missing = S.samples.filter((s) => s.missing).length;
  const errors = S.samples.filter((s) => s.analysis?.error).length;
  const rules = Object.entries(S.learned).map(([tok, c]) => { const tot = Object.values(c).reduce((a, b) => a + b, 0); const [cat, n] = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; return { tok, cat, n, tot, active: tot >= 3 && n / tot >= 0.8 }; }).filter((r) => r.tot >= 2).sort((a, b) => b.active - a.active || b.tot - a.tot);
  v.innerHTML = `<div class="cols">
    <section class="panel"><h2>${t('Importar')}</h2>
      <div class="row"><button class="btn primary" data-act="link">${t('Enlazar carpeta')}</button><button class="btn" data-act="pick-files">${t('Copiar archivos')}</button><button class="btn" data-act="pick-dir">${t('Copiar carpeta')}</button><button class="btn" data-act="pick-pack">${t('Importar .circuitrhythmpack')}</button></div>
      <p class="note"><b>${t('Enlazar')}</b> (Chrome/Edge): ${t('no copia nada; lee de tu disco cuando hace falta. Al volver a abrir la herramienta hay que pulsar «Reconectar».')}<br><b>${t('Copiar')}</b>: ${t('guarda el audio dentro del navegador. Útil para pocos archivos o fuera de Chrome.')}</p>
      <h3>${t('Carpetas enlazadas')}</h3>
      ${S.roots.size ? `<table class="t"><tr><th>${t('Carpeta')}</th><th>${t('Samples')}</th><th>${t('Estado')}</th><th></th></tr>${[...S.roots.values()].map((r) => `<tr><td>${esc(r.name)}</td><td class="mono">${S.samples.filter((s) => s.src?.root === r.id).length}</td><td>${r.perm === 'granted' ? `<span class="ok">${t('conectada')}</span>` : `<span class="warn">${t('reconectar')}</span>`}</td><td><button class="btn small" data-act="rescan" data-r="${r.id}">${t('Volver a leer')}</button> <button class="btn small danger" data-act="unlink" data-r="${r.id}">${t('Quitar')}</button></td></tr>`).join('')}</table>` : `<p class="muted">${t('Ninguna.')}</p>`}
      <p class="note">${t('{b} samples copiados en el navegador · {m} no encontrados en disco · {e} que no se pudieron leer', { b: blobs, m: missing, e: errors })}</p>
    </section>
    <section class="panel"><h2>${t('Copia de seguridad')}</h2>
      <p class="note">${t('Guarda tus decisiones, valoraciones, preparaciones, packs y reglas (no el audio: tus archivos siguen en tu disco). Al restaurar, cada ficha vuelve a su sample por la huella SHA-256 del archivo, aunque lo hayas movido.')}</p>
      <div class="row"><button class="btn primary" data-act="backup">${t('Descargar copia')}</button><button class="btn" data-act="restore">${t('Restaurar copia')}</button></div>
      <p class="muted">${S.lastBackup ? t('Última copia: {d}', { d: new Date(S.lastBackup).toLocaleString(LOCALE) }) : t('Nunca has hecho copia.')}</p>
      <div class="sep"></div>
      <h2>${t('Ajustes')}</h2>
      <div class="prep">
        <span class="lbl">${t('Pico al normalizar')}</span><span><input type="number" id="set-target" value="${S.set.targetDb}" step="0.5" max="0" min="-24" style="width:70px"> dBFS</span>
        <span class="lbl">${t('Umbral de recorte')}</span><span><input type="number" id="set-thr" value="${S.set.thresholdDb}" step="6" max="-24" min="-90" style="width:70px"> dB</span>
        <span class="lbl">${t('BPM por defecto')}</span><span><input type="number" id="set-bpm" value="${S.set.bpm}" min="40" max="240" style="width:70px"></span>
        <span class="lbl">${t('Nombres en la SD')}</span><span><select id="set-sep"><option value="__" ${S.set.sep === '__' ? 'selected' : ''}>00__Kick.wav</option><option value="_" ${S.set.sep === '_' ? 'selected' : ''}>00_Kick.wav</option></select> <span class="tag-unv">${t('Novation escribe «__» y pone de ejemplo «_»')}</span></span>
      </div>
    </section>
    <section class="panel"><h2>${t('Ordenar en disco')}</h2>${organizeHTML()}</section>
    <section class="panel"><h2>${t('Leer la tarjeta SD')}</h2>${sdHTML()}</section>
    <section class="panel"><h2>${t('Calibración')}</h2>${calibrationHTML()}</section>
    <section class="panel"><h2>${t('Reglas aprendidas')}</h2>
      <p class="note">${t('Palabras de tus nombres y carpetas que has decidido al menos 3 veces con la misma categoría (80 % o más).')}</p>
      ${rules.length ? `<table class="t"><tr><th>${t('Palabra')}</th><th>${t('Categoría')}</th><th>${t('Veces')}</th><th></th></tr>${rules.slice(0, 60).map((r) => `<tr><td class="mono">${esc(r.tok)}</td><td style="color:${catVar(r.cat)}">${catLabel(r.cat)}</td><td class="mono">${r.n}/${r.tot}${r.active ? ' <span class="ok">✓</span>' : ''}</td><td><button class="btn small ghost" data-act="rule-del" data-tok="${esc(r.tok)}">✕</button></td></tr>`).join('')}</table>` : `<p class="muted">${t('Todavía ninguna.')}</p>`}
    </section>
    <section class="panel"><h2>${t('Empezar una biblioteca nueva')}</h2>
      <p class="note">${t('Borra de este navegador samples, packs y fichas. Tus archivos del disco no se tocan.')}</p>
      <label class="inl"><input type="checkbox" id="wipe-keep" checked> ${t('conservar reglas aprendidas y ajustes')}</label>
      <div class="row" style="margin-top:8px"><input type="text" id="wipe-word" placeholder="${t('escribe BORRAR')}" style="width:160px"><button class="btn danger" data-act="wipe">${t('Borrar biblioteca')}</button></div>
      <div class="sep"></div><p class="note">Circuit Rhythm · Sample Library ${APP_VERSION} · ${t('local, sin servidores ni cuentas')} · <a href="#" data-act="about">${t('Acerca de, privacidad e informe de fallos')}</a></p>
    </section></div>`;
}
