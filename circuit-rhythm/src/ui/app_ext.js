// ui/app_ext.js — versión 1.1: mapa, patrones y kit, controles de pista, cifras, revisión, calibración,
// A/B, barridos de macro, Ordenar en disco, lectura de la tarjeta SD y ajuste de loops al compás.
import { generate, vary, recordEvents, toMidi, noteFor, STYLES, SCALES, DEFAULT_KIT, LANE_ROLES } from '../core/patterns.js';
import { pca, nearYourFavourites } from '../core/map.js';
import { organizePlan, manifestCSV } from '../core/organize.js';
import { fitToBeats, sampleSeconds, rawSeconds, isLoopSample, kindOf } from '../core/pack.js';
import { CC, MACRO_DEFAULTS } from '../core/midi.js';

const MACRO_NAMES = ['Tune', 'Start', 'Length', 'Slope', 'Distortion', 'HP Filter', 'LP Filter', 'Resonance'];
const KPI_COLS = ['#ff7a1a', '#ff5a3c', '#ff4f8b', '#e8336d', '#7a4dff', '#5b5bd6']; // tonos planos del espectro, como en Tracks
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ---------- cifras (fila de KPIs filtrables) ----------
function revision(s) {
  const a = s.analysis || {}, r = recipeOf(s);
  const checks = [
    [t('Se puede leer'), !a.error && !s.missing],
    [t('30 s como máximo'), !(rawSeconds(s) > 30)],
    [t('Sin silencio inicial (o se quita)'), (a.leadMs || 0) <= 2 || r.autoTrim || r.trimStart != null],
    [t('Sin saturación'), !a.clipRuns],
    [t('Sin desplazamiento DC'), Math.abs(a.dc || 0) <= 0.01],
    [t('En mono no se cancela (o se repara)'), !(monoCancels(a) && r.mono === 'sum')],
    [t('Nivel suficiente (pico > −24 dBFS)'), (a.peakChDb ?? a.peakDb ?? -99) > -24],
  ];
  return { ok: checks.filter((c) => c[1]).length, checks, fails: checks.filter((c) => !c[1]) };
}
function kpisHTML() {
  if (!S.samples.length) return '';
  const used = new Set(S.packs.flatMap((p) => p.slots.filter(Boolean)));
  let review = 0, conf = 0, inpack = 0, dups = 0, warn = 0;
  for (const s of S.samples) {
    const c = clsOf(s);
    if (!s.user?.discard && ['doubt', 'none'].includes(c.cert)) review++;
    if (c.cert === 'confirmed' || c.cert === 'user') conf++;
    if (used.has(s.id)) inpack++;
    if ((s.paths || []).length > 1) dups++;
    if (revision(s).fails.length) warn++;
  }
  const k = [['all', t('Samples'), S.samples.length], ['review', t('Por escuchar'), review], ['confirmed', t('Confirmados o tuyos'), conf], ['anypack', t('En algún pack'), inpack], ['dups', t('Con copias idénticas'), dups], ['warnings', t('Con avisos'), warn]];
  return `<div class="kpis">${k.map(([f, l, v], i) => `<button class="kpi ${S.f.flag === f && f !== 'all' ? 'on' : ''}" style="--kc:${KPI_COLS[i]}" data-act="kpi" data-v="${f}"><div class="v">${v.toLocaleString(LOCALE)}</div><div class="l">${l}</div></button>`).join('')}</div>`;
}
function revisionHTML(s) {
  const r = revision(s);
  return `<div class="rev"><b class="${r.ok === 7 ? 'ok' : 'warn'}">${t('Revisión: {n} de 7', { n: r.ok })}</b> ${r.checks.map(([l, okv]) => `<span class="${okv ? 'ok' : 'warn'}">${okv ? '✓' : '⚠'} ${l}</span>`).join('')}</div>`;
}

// ---------- calibración: ¿aciertan las propuestas con lo que tú decides? ----------
function calibration() {
  const rows = {}; let tot = 0, hit = 0;
  for (const s of S.samples) {
    if (!s.user?.cat) continue;
    const c = classify({ ...s, user: {} }, S.learned);
    const k = c.cert;
    rows[k] ||= { n: 0, h: 0 }; rows[k].n++; tot++;
    if (c.cat === s.user.cat) { rows[k].h++; hit++; }
  }
  return { tot, hit, rows };
}
function calibrationHTML() {
  const c = calibration();
  if (!c.tot) return `<p class="muted">${t('Todavía no has decidido ninguno: decide en 02 Escucha y aquí verás cuánto aciertan las propuestas.')}</p>`;
  const cl = CERT_LABEL();
  return `<p>${t('Las propuestas coinciden con tu decisión en {p} % de {n} samples.', { p: Math.round((c.hit / c.tot) * 100), n: c.tot })}</p>
    <table class="t"><tr><th>${t('Certeza de la propuesta')}</th><th>${t('Decididos')}</th><th>${t('Acierto')}</th></tr>${['confirmed', 'onehint', 'sound', 'doubt', 'none'].filter((k) => c.rows[k]).map((k) => `<tr><td>${cl[k]}</td><td class="mono">${c.rows[k].n}</td><td class="mono ${c.rows[k].h / c.rows[k].n >= 0.8 ? 'ok' : 'warn'}">${Math.round((c.rows[k].h / c.rows[k].n) * 100)} %</td></tr>`).join('')}</table>
    <p class="note">${t('Si «Por el sonido» acierta poco con tu colección, sube la certeza mínima del constructor de packs.')}</p>`;
}

// ---------- A/B ----------
function abHTML(s) {
  if (!S.abB || !S.byId[S.abB] || S.abB === s.id) return '';
  return `<span class="chip ok">A/B ${t('con')} «${esc(S.byId[S.abB].name)}» · <span class="kbd">Tab</span> ${S.abSide === 'B' ? 'B' : 'A'}</span> <button class="btn small ghost" data-act="ab-off">✕</button>`;
}

// ---------- barrido de macro en el equipo (Mayús+1…8, como en Tracks) ----------
let sweepTimer = 0;
function sweepMacro(i, slot) {
  if (!S.midiOn || !S.midi.out) { toast(t('Conecta la Rhythm en 06 Equipo para barrer macros.'), 'warn'); return; }
  if (slot == null || slot < 0) { toast(t('Este sample no está en el pack actual: no sé en qué slot de la Rhythm está.'), 'warn'); return; }
  const tr = S.set.track, bpm = S.pack?.bpm || S.set.bpm, step = 60000 / bpm / 2; // corcheas
  const dur = 3000, now = performance.now() + 40;
  try {
    S.midi.selectSlot(tr, slot);
    for (let tt = 0; tt < dur; tt += step) S.midi.send([0x90 | S.midi.ch(tr), 60, 100], now + tt), S.midi.send([0x80 | S.midi.ch(tr), 60, 0], now + tt + step * 0.8);
    for (let k = 0; k <= 60; k++) { const x = k / 60, v = Math.round(127 * (x < 0.5 ? x * 2 : 2 - x * 2)); S.midi.send([0xb0 | S.midi.ch(tr), CC.macros[i], v], now + x * dur); }
    S.midi.send([0xb0 | S.midi.ch(tr), CC.macros[i], MACRO_DEFAULTS[i]], now + dur + 20);
    toast(t('Barriendo {m} (CC {c}) 0 → 127 → 0 en la pista {t}; vuelve a su valor por defecto.', { m: MACRO_NAMES[i], c: CC.macros[i], t: tr + 1 }), 'ok', 3500);
  } catch (e) { toast(esc(errT(e.message)), 'bad'); }
}

// ---------- mapa ----------
let _map = { key: '', pts: [], box: null };
function mapPoints() {
  const key = S.ver + '|' + S.samples.length;
  if (_map.key !== key) {
    const r = pca(S.samples.filter((s) => s.analysis?.bands && !s.user?.discard).map((s) => ({ id: s.id, analysis: s.analysis })));
    _map = { key, pts: r.points, box: null };
  }
  return _map.pts;
}
function renderMap(v) {
  const pts = mapPoints();
  if (pts.length < 3) { v.innerHTML = `<div class="panel empty"><h2>${t('Mapa')}</h2><p>${t('Hacen falta al menos 3 samples medidos.')}</p></div>`; return; }
  const refs = new Set(S.samples.filter((s) => s.user?.fav || s.user?.rating >= 4).map((s) => s.id));
  for (const p of S.packs) for (const id of p.slots) if (id) refs.add(id);
  const inPacks = new Set(S.packs.flatMap((p) => p.slots.filter(Boolean)));
  const near = nearYourFavourites(S.samples.filter((s) => s.analysis?.bands && !s.user?.discard), refs, inPacks, 24);
  const by = S.mapColor || 'cat';
  const sel = S.byId[S.sel];
  v.innerHTML = `<div class="mapw">
    <section class="panel"><div class="row"><h2 class="grow" style="margin:0">${t('Mapa de la colección')}</h2>
      <label class="inl">${t('Color')} <select id="mapcolor">${[['cat', t('Categoría')], ['group', t('Grupo')], ['cert', t('Certeza')], ['rating', t('Valoración')], ['pack', t('En packs')]].map(([k, l]) => `<option value="${k}" ${by === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <canvas id="mapcv" class="mapcv" width="1000" height="640"></canvas>
      <p class="note">${t('Cada punto es un sample, colocado según lo que se mide (duración, brillo, graves, agudos, ruido, ataque, tono, tempo). Lo que está cerca suena parecido. Clic: elegir y escuchar. Arrastrar: seleccionar una zona.')}</p></section>
    <aside class="side">${mapSelHTML()}${mapGroupsHTML()}<div class="panel"><h2>${t('Seleccionado')}</h2>${sel ? `<div style="color:${catVar(clsOf(sel).cat)}"><b>${esc(sel.name)}</b></div><div class="muted mono">${esc(sel.path)}</div><div class="row" style="margin-top:6px"><button class="btn small" data-act="play">▶</button><button class="btn small" data-act="sel" data-id="${sel.id}">${t('Ficha')}</button></div>` : `<p class="muted">${t('Pulsa un punto.')}</p>`}<div id="maphover" class="muted mono" style="min-height:18px;margin-top:6px"></div></div>
      <div class="panel"><h2>${t('Parecidos a lo que usas')}</h2><p class="note" style="margin-top:0">${t('Cercanos a tus favoritos, a los de 4–5 estrellas y a los que están en packs, y que aún no están en ninguno.')}</p>
        ${near.length ? `<div class="sim">${near.map((x) => `<button data-act="map-pick" data-id="${x.id}"><span style="color:${catVar(clsOf(S.byId[x.id]).cat)}">■</span> ${esc(S.byId[x.id].name)} <span class="dim">≈ ${esc(S.byId[x.ref]?.name || '')}</span></button>`).join('')}</div><button class="btn small" data-act="map-listen" style="margin-top:8px">${t('Mandar a la escucha')}</button>` : `<p class="muted">${t('Marca favoritos o valora con 4–5 estrellas para tener referencias.')}</p>`}</div></aside></div>`;
  S._near = near.map((x) => x.id);
  drawMap();
}
function mapColor(s) {
  const by = S.mapColor || 'cat';
  if (by === 'cert') return { user: '#ebe8e3', confirmed: '#3ecf8e', onehint: '#c9c3ba', sound: '#8e8b86', doubt: '#f0b232', none: '#4a4a50' }[clsOf(s).cert];
  if (by === 'rating') return ['#3a3a40', '#5b5bd6', '#7a4dff', '#e8336d', '#ff4f8b', '#ff7a1a'][s.user?.rating || 0];
  if (by === 'group') return groupColorOf(s.id);
  if (by === 'pack') return S.packs.some((p) => p.slots.includes(s.id)) ? '#3ecf8e' : '#3a3a40';
  return getComputedStyle(document.documentElement).getPropertyValue(`--c-${clsOf(s).cat || 'none'}`).trim();
}
function drawMap(hover = null) {
  const cv = document.getElementById('mapcv'); if (!cv) return;
  const W = cv.width = Math.round(cv.clientWidth * devicePixelRatio), H = cv.height = Math.round(cv.clientHeight * devicePixelRatio);
  const g = cv.getContext('2d'); g.clearRect(0, 0, W, H);
  const pts = mapPoints();
  let mx = 1e-9; for (const p of pts) mx = Math.max(mx, Math.abs(p.x), Math.abs(p.y));
  const sc = (Math.min(W, H) / 2 - 16 * devicePixelRatio) / mx; // escala común en los dos ejes
  _map.box = { W, H, sc };
  g.strokeStyle = '#2b2b30'; g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
  const r = 3.2 * devicePixelRatio;
  const hl = mapHLSet();
  for (const p of pts) {
    const s = S.byId[p.id]; if (!s) continue;
    g.fillStyle = mapColor(s); g.globalAlpha = hl ? (hl.has(p.id) ? 0.95 : 0.12) : 0.85;
    g.beginPath(); g.arc(W / 2 + p.x * sc, H / 2 - p.y * sc, hl && hl.has(p.id) ? r * 1.25 : r, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  // seleccionados (los mismos que en la biblioteca)
  if (S.multi.size) {
    g.strokeStyle = '#ebe8e3'; g.lineWidth = 1.4 * devicePixelRatio;
    for (const p of pts) if (S.multi.has(p.id)) { g.beginPath(); g.arc(W / 2 + p.x * sc, H / 2 - p.y * sc, r * 1.9, 0, 7); g.stroke(); }
  }
  drawMapDrag(g);
  for (const id of [S.sel, hover]) {
    const p = pts.find((q) => q.id === id); if (!p) continue;
    g.strokeStyle = '#fff'; g.lineWidth = 2 * devicePixelRatio; g.beginPath(); g.arc(W / 2 + p.x * sc, H / 2 - p.y * sc, r * 2.4, 0, 7); g.stroke();
  }
}
function mapHit(ev) {
  const cv = document.getElementById('mapcv'); if (!cv || !_map.box) return null;
  const rc = cv.getBoundingClientRect();
  const x = (ev.clientX - rc.left) * devicePixelRatio, y = (ev.clientY - rc.top) * devicePixelRatio;
  const { W, H, sc } = _map.box;
  let best = null, bd = 12 * devicePixelRatio;
  for (const p of mapPoints()) { const d = Math.hypot(W / 2 + p.x * sc - x, H / 2 - p.y * sc - y); if (d < bd) { bd = d; best = p.id; } }
  return best;
}

// ---------- patrones y kit ----------
function packKit() {
  if (!S.pack) return DEFAULT_KIT.map(() => null);
  if (!S.pack.kit) S.pack.kit = DEFAULT_KIT.map((sl) => (S.pack.slots[sl] ? sl : (() => { // si el slot por defecto está vacío, el primero ocupado de esa página
    const pg = Math.floor(sl / 16) * 16; for (let i = pg; i < pg + 16; i++) if (S.pack.slots[i]) return i; return null; })()));
  return S.pack.kit;
}
function sampleMidiOf(slot) {
  // v2.3: la nota con la que suena en la Rhythm (medida + afinación de la receta)
  const id = slot != null && S.pack ? S.pack.slots[slot] : null, m = id && S.byId[id] ? effectiveMidi(S.byId[id]) : null;
  return m == null ? null : Math.round(m);
}
function curPat() {
  if (!S.pat) S.pat = { name: '', ...generate({ style: 'techno', seed: 1, steps: 16, root: 33, scale: 'minor' }), opts: { style: 'techno', seed: 1, steps: 16, density: 0.5, velVar: 0.3, fill: true, root: 33, scale: 'minor', bassStyle: 'auto' }, swing: 50, mute: [] };
  return S.pat;
}
function regen() {
  const p = curPat();
  const g = generate(p.opts);
  S.pat = { ...p, ...g, lanes: g.lanes };
  savePat();
}
let patTimer = 0;
function savePat() { clearTimeout(patTimer); patTimer = setTimeout(() => S.lib.kvSet('pat', S.pat), 300); }
const noteLabel = (m) => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 2);
const ROLE_NAME = () => ({ kick: 'Kick', clap: 'Clap/Snare', hat: 'Closed hat', ohat: 'Open hat', perc: 'Perc', bass: 'Bass', synth: 'Synth', fx: 'FX' });
function renderPatterns(v) {
  const p = curPat(), o = p.opts, kit = packKit();
  const n = p.lanes[0].steps.length;
  const rn = ROLE_NAME();
  const slotOpts = (sel) => `<option value="">—</option>` + (S.pack ? S.pack.slots.map((id, i) => (id ? `<option value="${i}" ${sel === i ? 'selected' : ''}>${i + 1} · ${esc(S.pack.names[i] || S.byId[id]?.name || '')}</option>` : '')).join('') : '');
  v.innerHTML = `<div class="patw">
  <section class="panel"><h2>${t('Generador')}</h2>
    <div class="prep">
      <span class="lbl">${t('Estilo')}</span><select id="pt-style">${STYLES.map((s) => `<option value="${s}" ${o.style === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <span class="lbl">${t('Pasos')}</span><span class="seg"><button class="${n === 16 ? 'on' : ''}" data-act="pt-steps" data-v="16">16</button><button class="${n === 32 ? 'on' : ''}" data-act="pt-steps" data-v="32">32</button></span>
      <span class="lbl">${t('Densidad')}</span><input type="range" id="pt-density" min="0" max="1" step="0.05" value="${o.density}">
      <span class="lbl">${t('Variación de velocidad')}</span><input type="range" id="pt-vel" min="0" max="1" step="0.05" value="${o.velVar}">
      <span class="lbl">${t('Remate final')}</span><label class="inl"><input type="checkbox" id="pt-fill" ${o.fill ? 'checked' : ''}> ${t('sí')}</label>
      <span class="lbl">${t('Tónica')}</span><select id="pt-root">${[...Array(36).keys()].map((k) => 24 + k).map((m) => `<option value="${m}" ${o.root === m ? 'selected' : ''}>${noteLabel(m)}</option>`).join('')}</select>
      <span class="lbl">${t('Escala')}</span><select id="pt-scale">${Object.keys(SCALES).map((k) => `<option value="${k}" ${o.scale === k ? 'selected' : ''}>${k}</option>`).join('')}</select>
      <span class="lbl">${t('Bajo')}</span><select id="pt-bass">${[['auto', t('según el estilo')], ['offbeat', t('a contratiempo')], ['rolling', t('rodante')], ['syncopated', t('sincopado')]].map(([k, l]) => `<option value="${k}" ${o.bassStyle === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div class="row" style="margin-top:10px"><button class="btn primary" data-act="pt-seed">🎲 ${t('Otra variación')}</button><button class="btn" data-act="pt-vary">${t('Variar')}</button><span class="mono muted">${t('semilla')} ${o.seed}</span></div>
    <div class="sep"></div>
    <h3>${t('Patrones guardados')}</h3>
    <div class="row"><input type="text" id="pt-name" placeholder="${t('Nombre')}" value="${esc(p.name || '')}" style="width:150px"><button class="btn small" data-act="pt-save">${t('Guardar')}</button></div>
    <div class="sim" style="margin-top:6px">${(S.patterns || []).map((q, i) => `<div class="row"><button data-act="pt-load" data-i="${i}" class="grow" style="text-align:left;background:none;border:0;color:var(--ink);cursor:pointer">${esc(q.name)} <span class="dim mono">${q.opts.style} · ${q.lanes[0].steps.length}</span></button><button class="btn small ghost" data-act="pt-del" data-i="${i}">✕</button></div>`).join('') || `<p class="muted">${t('Ninguno.')}</p>`}</div>
  </section>
  <section class="panel"><div class="row"><h2 class="grow" style="margin:0">${t('Patrón')} · ${n} ${t('pasos')}</h2>
      <label class="inl">BPM <input type="number" id="pt-bpm" value="${S.pack?.bpm || S.set.bpm}" min="40" max="240" style="width:64px"></label>
      <label class="inl">Swing <input type="number" id="pt-swing" value="${p.swing}" min="50" max="75" style="width:56px" title="${t('Como el swing de la Rhythm: 50 = recto')}"></label></div>
    <div class="pgrid" style="--n:${n}">${p.lanes.map((ln, t2) => `
      <div class="plh ${p.mute.includes(t2) ? 'muted-lane' : ''}"><button class="btn small ghost" data-act="pt-mute" data-i="${t2}" title="${t('Incluir o no en la escucha y la grabación')}">${p.mute.includes(t2) ? '○' : '●'}</button><span style="color:${catVar({ kick: 'kick', clap: 'clap', hat: 'hat', ohat: 'ohat', perc: 'perc', bass: 'bass', synth: 'synth', fx: 'fx' }[ln.role])}">${t('Pista {n}', { n: t2 + 1 })}</span> <span class="muted">${rn[ln.role]}</span></div>
      <div class="prow">${ln.steps.map((s, k) => `<button class="pc ${s ? 'on' : ''} ${k % 4 === 0 ? 'beat' : ''}" data-act="pt-cell" data-l="${t2}" data-k="${k}" style="--c:${catVar({ kick: 'kick', clap: 'clap', hat: 'hat', ohat: 'ohat', perc: 'perc', bass: 'bass', synth: 'synth', fx: 'fx' }[ln.role])};${s ? `opacity:${0.45 + (s.v / 127) * 0.55}` : ''}" title="${s ? `vel ${s.v}${ln.melodic ? ' · ' + noteLabel(p.root + (s.n || 0)) : ''}` : ''}">${s && ln.melodic ? `<i>${noteLabel(p.root + (s.n || 0)).replace(/-?\\d+$/, '')}</i>` : ''}</button>`).join('')}</div>`).join('')}</div>
    <p class="note">${t('Clic: poner o quitar · Mayús+clic: acento · Alt+clic en Bass o Synth: sube un grado de la escala. Las pistas son monofónicas, como en la Rhythm.')}</p>
    <div class="row"><button class="btn primary" data-act="pt-preview">${S.patPlaying ? '■ ' + t('Parar') : '▶ ' + t('Escuchar aquí')}</button>
      <button class="btn" data-act="pt-dev" ${S.midiOn && S.midi.out ? '' : 'disabled'}>${t('Escuchar en la Rhythm')}</button>
      <button class="btn" data-act="pt-rec" ${S.midiOn && S.midi.out ? '' : 'disabled'}>● ${t('Grabar en la Rhythm')}</button>
      <span class="grow"></span>
      <select id="pt-midmode"><option value="rhythm">${t('.mid: canales de la Rhythm')}</option><option value="drumrack">${t('.mid: Drum Rack (canal 10)')}</option></select><button class="btn" data-act="pt-mid">${t('Exportar .mid')}</button></div>
  </section>
  <aside class="panel"><h2>${t('Kit')}</h2>
    <p class="note" style="margin-top:0">${S.pack ? t('El sample de cada pista sale del pack «{p}». En la Rhythm se elige con CC 8.', { p: esc(S.pack.name) }) : t('Crea un pack en 04 Packs para elegir el sample de cada pista.')}</p>
    ${kit.map((sl, t2) => { const pm = sampleMidiOf(sl); return `<label class="kitrow"><span>${t('Pista {n}', { n: t2 + 1 })}</span><select data-kit="${t2}">${slotOpts(sl)}</select>${pm != null && p.lanes[t2].melodic ? `<span class="mono muted" title="${t('Tono medido: el patrón se transpone para sonar en la tónica')}">${noteLabel(pm)}</span>` : '<span></span>'}</label>`; }).join('')}
    <div class="row" style="margin-top:8px"><button class="btn small" data-act="kit-default">${t('Kit por defecto (página = pista)')}</button><button class="btn small" data-act="kit-send" ${S.midiOn && S.midi.out ? '' : 'disabled'}>${t('Enviar kit a la Rhythm')}</button></div>
    <p class="note">${t('Escuchar aquí usa los samples preparados del kit (48 kHz · mono), sin el equipo. Bass y Synth se transponen según su tono medido.')}</p>
  </aside></div>`;
}

// escucha local del patrón con los samples del kit (Web Audio)
const Pat = { timer: 0, next: 0, step: 0, bufs: [], last: [] };
async function patBuffers() {
  const kit = packKit(); const ctx = Player.ensure();
  const out = [];
  for (let t2 = 0; t2 < 8; t2++) {
    const id = kit[t2] != null && S.pack ? S.pack.slots[kit[t2]] : null;
    if (!id || !S.byId[id]) { out.push(null); continue; }
    try { const r = await renderedOf(S.byId[id]); const b = ctx.createBuffer(1, r.data.length, 48000); b.copyToChannel(r.data, 0); out.push(b); } catch { out.push(null); }
  }
  return out;
}
async function patPreview() {
  if (S.patPlaying) { patStop(); renderView(); return; }
  const ctx = Player.ensure();
  Pat.bufs = await patBuffers();
  if (!Pat.bufs.some(Boolean)) { toast(t('El kit no tiene samples: elige uno por pista o crea un pack.'), 'warn'); return; }
  S.patPlaying = true; Pat.step = 0; Pat.next = ctx.currentTime + 0.08; Pat.last = [];
  const kit = packKit();
  const tick = () => {
    const p = curPat(); const bpm = S.pack?.bpm || S.set.bpm; const stepS = 60 / bpm / 4;
    while (Pat.next < ctx.currentTime + 0.15) {
      const n = p.lanes[0].steps.length, k = Pat.step % n;
      const at = Pat.next + (k % 2 ? Math.max(0, p.swing - 50) / 50 * stepS : 0);
      p.lanes.forEach((ln, t2) => {
        const s = ln.steps[k]; const b = Pat.bufs[t2];
        if (!s || !b || p.mute.includes(t2)) return;
        if (Pat.last[t2]) try { Pat.last[t2].stop(at); } catch {}
        const src = ctx.createBufferSource(); src.buffer = b;
        if (ln.melodic) src.playbackRate.value = Math.pow(2, (noteFor(s.n || 0, p.root, sampleMidiOf(kit[t2])) - 60) / 12);
        const gn = ctx.createGain(); gn.gain.value = Math.pow(s.v / 127, 1.4);
        src.connect(gn).connect(ctx.destination); src.start(at); Pat.last[t2] = src;
      });
      Pat.step++; Pat.next += stepS;
    }
  };
  tick(); Pat.timer = setInterval(tick, 40);
  renderView();
}
function patStop() { clearInterval(Pat.timer); Pat.timer = 0; S.patPlaying = false; for (const s of Pat.last) try { s && s.stop(); } catch {} Pat.last = []; }

function patEvents(transport) {
  const p = curPat(); const kit = packKit();
  const tracks = new Set([...Array(8).keys()].filter((i) => !p.mute.includes(i)));
  return recordEvents(p, { bpm: S.pack?.bpm || S.set.bpm, channels: S.set.channels, kit: kit.map((x) => (x == null ? null : x)), sampleMidi: kit.map(sampleMidiOf), tracks, transport, swing: p.swing, loops: transport ? 1 : 2 });
}
function sendEvents(ev) {
  const base = performance.now() + 120;
  for (const e of ev) S.midi.send(e.bytes, base + e.t);
  return base + (ev.length ? ev[ev.length - 1].t : 0) - performance.now();
}

// ---------- ordenar en disco ----------
function orgOpts() {
  return { by: document.getElementById('org-by')?.value || 'category', subs: S._orgSubs !== false, kinds: S._orgKinds !== false, tagsInName: !!S._orgTags, converted: document.getElementById('org-conv')?.checked || false, includeDiscarded: false, minCert: document.getElementById('org-cert')?.value || 'onehint', reviewDir: t('_Por revisar'), kindDir: { loop: t('Loops'), oneshot: t('One-shots') } };
}
function orgPlan() {
  return organizePlan(S.samples.filter((s) => !s.analysis?.error).map((s) => { const c = clsOf(s); return { id: s.id, name: s.name, path: s.path, ext: s.ext, cat: c.cat, cert: c.cert, discard: s.user?.discard, sub: c.cat && subForOrg(s, c.cat) ? subName(c.cat, subForOrg(s, c.cat)) : null, kind: kindOf(s), tags: (s.user?.tags || []).map(tagName), rating: s.user?.rating || 0, fav: !!s.user?.fav }; }), orgOpts());
}
function organizeHTML() {
  if (!S.samples.length) return `<p class="muted">${t('Importa samples primero.')}</p>`;
  const plan = orgPlan();
  return `<div class="prep"><span class="lbl">${t('Ordenar')}</span><select id="org-by"><option value="category">${t('por categoría')}</option><option value="folder" ${S._orgBy === 'folder' ? 'selected' : ''}>${t('por carpeta de origen')}</option></select>
    <span class="lbl">${t('Certeza mínima')}</span><select id="org-cert">${[['user', t('Decidido por ti')], ['confirmed', t('Confirmado o más')], ['onehint', t('Una pista o más')], ['any', t('Cualquiera')]].map(([k, l]) => `<option value="${k}" ${(S._orgCert || 'onehint') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <span class="lbl">${t('Subcarpetas')}</span><label class="inl"><input type="checkbox" id="org-subs" ${S._orgSubs !== false ? 'checked' : ''}> ${t('dentro de cada categoría: la que marcaste o, si no, la propuesta')}</label>
    <span class="lbl">${t('Loops')}</span><label class="inl"><input type="checkbox" id="org-kinds" ${S._orgKinds !== false ? 'checked' : ''}> ${t('separar Loops y One-shots dentro de cada categoría')}</label>
    <span class="lbl">${t('Etiquetas')}</span><label class="inl"><input type="checkbox" id="org-tags" ${S._orgTags ? 'checked' : ''}> ${t('añadirlas al nombre del archivo: «Nombre [Oscuro, Analógico].wav»')}</label>
    <span class="lbl">${t('Formato')}</span><label class="inl"><input type="checkbox" id="org-conv" ${S._orgConv ? 'checked' : ''}> ${t('convertidos a 48 kHz · mono · 16 bit (con su preparación)')}</label></div>
    <p class="note">${t('Cada sample va a Categoría / Tipo / Subcarpeta, como ves en su ficha («Se guarda en»). Las etiquetas no crean carpetas.')}</p>
    <p class="note">${t('{n} archivos en {f} carpetas', { n: plan.items.length, f: Object.keys(plan.folders).length })} · ${Object.entries(plan.folders).slice(0, 8).map(([k, n]) => `${esc(k)} <span class="mono">${n}</span>`).join(' · ')}${plan.skipped.discard ? ' · ' + t('{n} descartados no se copian', { n: plan.skipped.discard }) : ''}</p>
    <div class="row"><button class="btn primary" data-act="org-dir">${t('Escribir en una carpeta')}</button><button class="btn" data-act="org-zip">${t('Descargar ZIP')}</button></div>
    <p class="note">${t('Siempre en una subcarpeta nueva con fecha. El manifiesto CSV lleva la ruta antigua y la nueva, la categoría, la subcarpeta, loop o one-shot, las etiquetas, la valoración y los favoritos. Tus archivos originales no se tocan.')}</p>`;
}
async function organizeRun(toDir) {
  const plan = orgPlan(); const opts = orgOpts();
  const root = `Circuit Rhythm Library ${new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '')}`;
  let dir = null;
  if (toDir) { if (!window.showDirectoryPicker) { toast(t('Este navegador no puede escribir en carpetas. Usa «Descargar ZIP».'), 'warn'); return; } try { dir = await window.showDirectoryPicker({ id: 'crsl-org', mode: 'readwrite' }); } catch { return; } }
  const files = [];
  const busy = startBusy(t('Ordenando en disco'), plan.items.length);
  let failed = 0;
  try {
    for (let k = 0; k < plan.items.length; k++) {
      if (busy.cancel) break;
      const it = plan.items[k]; busy.step(k, it.dest);
      let data;
      try { data = opts.converted ? await wavOf(S.byId[it.id]) : await bytesOf(S.byId[it.id]); } catch { failed++; continue; }
      if (dir) { await writePath(dir, root + '/' + it.dest, data); } else files.push({ name: root + '/' + it.dest, data });
      if (k % 5 === 0) await yieldUI();
    }
    const man = manifestCSV(plan, root);
    if (dir) await writePath(dir, root + '/manifest.csv', man); else files.push({ name: root + '/manifest.csv', data: man });
  } finally { busy.done(); }
  if (!dir) download(await zipWrite(files, { compress: false }), root + '.zip', 'application/zip');
  toast(t('Ordenados {n} archivos en «{r}».', { n: plan.items.length - failed, r: esc(root) }) + (failed ? ` <span class="warn">${t('{n} no se pudieron leer (¿carpeta sin reconectar?)', { n: failed })}</span>` : ''), failed ? 'warn' : 'ok', 9000);
}
async function writePath(dir, path, data) {
  const segs = path.split('/'); let d = dir;
  for (let i = 0; i < segs.length - 1; i++) d = await d.getDirectoryHandle(segs[i], { create: true });
  const fh = await d.getFileHandle(segs[segs.length - 1], { create: true });
  const w = await fh.createWritable(); await w.write(data); await w.close();
}

// ---------- leer la tarjeta SD ----------
async function readSdCard() {
  if (!window.showDirectoryPicker) { toast(t('Este navegador no puede leer carpetas. Usa Chrome o Edge.'), 'warn'); return; }
  let dir; try { dir = await window.showDirectoryPicker({ id: 'crsl-sdread', mode: 'read' }); } catch { return; }
  let rh = null;
  try { rh = await dir.getDirectoryHandle('Rhythm'); } catch { if (dir.name === 'Rhythm') rh = dir; }
  if (!rh) { toast(t('No hay carpeta Rhythm en esa ubicación. Elige la raíz de la microSD.'), 'warn', 7000); return; }
  const packs = [];
  for await (const [name, h] of rh.entries()) {
    if (h.kind !== 'directory') continue;
    let pcm = null; try { pcm = await h.getDirectoryHandle('PCM'); } catch {}
    const files = [];
    if (pcm) for await (const [fn, fh] of pcm.entries()) { const m = fn.match(/^(\d{1,3})_{1,2}(.*)\.wav$/i); if (fh.kind === 'file' && m) { const f = await fh.getFile(); files.push({ slot: +m[1], name: m[2], size: f.size, get: () => f }); } }
    let sessions = 0; try { const ss = await h.getDirectoryHandle('Sessions'); for await (const [fn] of ss.entries()) if (/\.ncs$/i.test(fn)) sessions++; } catch {}
    files.sort((a, b) => a.slot - b.slot);
    packs.push({ name, files, sessions, sec: files.reduce((s, f) => s + Math.max(0, f.size - 44) / 96000, 0) });
  }
  packs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  S.sdPacks = packs; renderView();
}
function sdHTML() {
  if (!S.sdPacks) return `<p class="note">${t('Elige la raíz de la microSD: verás cada pack de la tarjeta, cuántos samples tiene y cuánto tiempo ocupa, y podrás importarlo para editarlo.')}</p><button class="btn" data-act="sd-read">${t('Leer la tarjeta')}</button>`;
  if (!S.sdPacks.length) return `<p class="muted">${t('La carpeta Rhythm está vacía.')}</p><button class="btn" data-act="sd-read">${t('Leer otra vez')}</button>`;
  return `<table class="t"><tr><th>${t('Carpeta')}</th><th>${t('Samples')}</th><th>${t('Tiempo')}</th><th>${t('Proyectos')}</th><th></th></tr>${S.sdPacks.map((p, i) => `<tr><td class="mono">Rhythm/${esc(p.name)}</td><td class="mono">${p.files.length}</td><td class="mono ${p.sec > 228 ? 'bad' : ''}">${nf(p.sec)} s</td><td class="mono">${p.sessions}</td><td><button class="btn small" data-act="sd-import" data-i="${i}" ${p.files.length ? '' : 'disabled'}>${t('Importar')}</button></td></tr>`).join('')}</table>
    <p class="note">${t('El tiempo se calcula por el tamaño de cada WAV (48 kHz · 16 bit · mono). La posición en el equipo es el número de la carpeta + 2.')}</p><button class="btn small" data-act="sd-read">${t('Leer otra vez')}</button>`;
}
async function importSdPack(p) {
  const pack = emptyPack(t('Tarjeta {n}', { n: p.name }), 'free');
  pack.source = { kind: 'sd', file: 'Rhythm/' + p.name };
  const busy = startBusy(t('Importando el pack «{n}»', { n: 'Rhythm/' + p.name }), p.files.length);
  const batch = [];
  try {
    for (let k = 0; k < p.files.length; k++) {
      const f = p.files[k]; if (f.slot > 127) continue;
      busy.step(k, f.name);
      const u8 = new Uint8Array(await f.get().arrayBuffer());
      const sha = await sha256hex(u8);
      let rec = S.byId[sha] || preparedTwin(f.name, u8);
      if (!rec) {
        rec = makeRecord(sha, f.name + '.wav', `SD/Rhythm ${p.name}/${String(f.slot + 1).padStart(3, '0')} ${f.name}.wav`, u8.length, { kind: 'blob' });
        await S.lib.put('blobs', { sha, blob: new Blob([u8]) });
        await analyzeInto(rec, u8);
        S.byId[sha] = rec; S.samples.push(rec); batch.push(rec);
      }
      pack.slots[f.slot] = rec.id; pack.names[f.slot] = f.name;
    }
  } finally { busy.done(); }
  await saveSamples(batch);
  pack.origSlots = pack.slots.slice();
  S.packs.push(pack); S.pack = pack; await savePack(pack); await S.lib.kvSet('packId', pack.id);
  toast(t('Pack de la tarjeta importado: {n} samples ({m} nuevos en la biblioteca).', { n: pack.slots.filter(Boolean).length, m: batch.length }), 'ok', 7000);
  S.view = 'packs'; renderAll();
}

// ---------- loops: ajustar al compás ----------
function loopFit(s) {
  if (!isLoopSample(s)) return null;
  const a = s.analysis || {};
  let bpm = s.info?.bpm;
  let src = 'name';
  if (!bpm && a.loopBpm) { bpm = Math.abs(a.loopBpm - Math.round(a.loopBpm)) < 0.6 ? Math.round(a.loopBpm) : a.loopBpm; src = 'sound'; }
  if (!bpm) return null;
  const raw = sampleSeconds({ ...s, recipe: { ...(s.recipe || {}), fitSec: null, keep: null } });
  const f = fitToBeats(raw, bpm);
  return f && { ...f, bpm, src, raw };
}
function fitHTML(s) {
  const f = loopFit(s); if (!f) return '';
  const on = !!s.recipe?.fitSec;
  if (!on && Math.abs(f.diff) < 0.002) return `<span class="lbl">${t('Compás')}</span><span class="ok">${t('ya mide {b} tiempos exactos a {bpm} BPM', { b: f.beats, bpm: nf(f.bpm, f.bpm % 1 ? 1 : 0) })}</span>`;
  return `<span class="lbl">${t('Compás')}</span><span>${on ? `<span class="ok">${t('ajustado a {b} tiempos ({s} s)', { b: f.beats, s: nf(s.recipe.fitSec, 3) })}</span> <button class="btn small ghost" data-act="fit-off">${t('Quitar')}</button>` : `<button class="btn small" data-act="fit-on">${t('Ajustar a {b} tiempos a {bpm} BPM ({d} ms)', { b: f.beats, bpm: nf(f.bpm, f.bpm % 1 ? 1 : 0), d: (f.diff > 0 ? '+' : '') + nf(f.diff * 1000, 0) })}</button> <span class="dim">${f.src === 'name' ? t('BPM del nombre') : t('BPM medido')}</span>`}</span>`;
}

// ---------- controles de pista en el equipo ----------
function trackPanelHTML() {
  const dis = S.midiOn && S.midi.out ? '' : 'disabled';
  const tp = (S.trackParams ||= {});
  const v = (k, d) => (tp[k] != null ? tp[k] : d);
  return `<section class="panel"><h2>${t('Pista {n} en la Rhythm', { n: S.set.track + 1 })}</h2>
    <div class="prep">
      <span class="lbl">${t('Reproducción')}</span><select data-tcc="12" ${dis}>${[[0, 'One shot'], [1, 'Gated'], [2, 'Loop']].map(([k, l]) => `<option value="${k}" ${v(12, 0) == k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <span class="lbl">Reverse</span><label class="inl"><input type="checkbox" data-tcc="14" ${v(14, 0) ? 'checked' : ''} ${dis}> CC 14</label>
      <span class="lbl">Choke</span><label class="inl"><input type="checkbox" data-tcc="15" ${v(15, 0) ? 'checked' : ''} ${dis}> CC 15</label>
      <span class="lbl">Slice</span><span class="row"><label class="inl"><input type="checkbox" data-tcc="16" ${v(16, 0) ? 'checked' : ''} ${dis}> CC 16</label><select data-tcc="17" ${dis}>${[4, 8, 16].map((k) => `<option value="${k}" ${v(17, 16) == k ? 'selected' : ''}>${k}</option>`).join('')}</select></span>
      <span class="lbl">${t('Nivel')}</span><input type="range" data-tcc="29" min="0" max="127" value="${v(29, 100)}" ${dis}>
      <span class="lbl">${t('Panorama')}</span><input type="range" data-tcc="30" min="0" max="127" value="${v(30, 64)}" ${dis}>
      <span class="lbl">${t('Envío a reverb')}</span><input type="range" data-tcc="31" min="0" max="127" value="${v(31, 0)}" ${dis}>
      <span class="lbl">${t('Envío a delay')}</span><input type="range" data-tcc="32" min="0" max="127" value="${v(32, 0)}" ${dis}>
    </div>
    <h3>${t('Barrer macros')} <span class="kbd">${t('Mayús')}+1…8</span></h3>
    <div class="row">${MACRO_NAMES.map((m, i) => `<button class="btn small" data-act="sweep" data-i="${i}" ${dis}>${i + 1} ${m}</button>`).join('')}</div>
    <p class="note">${t('Toca el slot elegido en corcheas mientras la macro va de 0 a 127 y vuelve; al acabar, la devuelve a su valor por defecto. Mayús+1…8 hace lo mismo con el sample seleccionado en la biblioteca o en la escucha, si está en el pack actual.')}</p></section>`;
}

// ---------- acciones ----------
Object.assign(ACT, {
  kpi: (el) => { const v = el.dataset.v; S.f.flag = v === 'all' ? 'all' : S.f.flag === v ? 'all' : v; if (v === 'confirmed') S.f.flag = S.f.flag; renderView(); },
  ab: (el) => { S.abB = el.dataset.id; S.abSide = 'B'; play(S.byId[S.abB]); renderDetail(); },
  'ab-off': () => { S.abB = null; renderDetail(); },
  'map-pick': (el) => { S.sel = el.dataset.id; play(S.byId[S.sel]); renderView(); },
  'map-listen': () => { S.multi = new Set(S._near || []); S.listen.src = 'sel'; go('listen'); },
  'pt-steps': (el) => { curPat().opts.steps = +el.dataset.v; regen(); renderView(); },
  'pt-seed': () => { curPat().opts.seed++; regen(); renderView(); },
  'pt-vary': () => { const p = curPat(); const vv = vary(p, p.opts.seed + 1000 + Math.floor(Math.random() * 1000)); S.pat = { ...p, lanes: vv.lanes }; savePat(); renderView(); },
  'pt-cell': (el, ev) => {
    const p = curPat(), l = +el.dataset.l, k = +el.dataset.k, ln = p.lanes[l];
    const sc = SCALES[p.opts.scale] || SCALES.minor;
    const cur = ln.steps[k];
    if (ev.altKey && ln.melodic && cur) { const degs = [...sc, ...sc.map((x) => x + 12), 24]; const i = degs.indexOf(cur.n || 0); cur.n = degs[(i + 1) % degs.length]; }
    else if (ev.shiftKey) ln.steps[k] = { ...(cur || {}), v: cur && cur.v >= 115 ? 90 : 120, ...(ln.melodic ? { n: cur?.n || 0 } : {}) };
    else ln.steps[k] = cur ? null : { v: 100, ...(ln.melodic ? { n: 0 } : {}) };
    savePat(); renderView();
  },
  'pt-mute': (el) => { const p = curPat(), i = +el.dataset.i; p.mute = p.mute.includes(i) ? p.mute.filter((x) => x !== i) : [...p.mute, i]; savePat(); renderView(); },
  'pt-save': async () => { const p = curPat(); p.name = (document.getElementById('pt-name').value || `${p.opts.style} ${p.opts.seed}`).slice(0, 40); S.patterns = [...(S.patterns || []).filter((q) => q.name !== p.name), JSON.parse(JSON.stringify(p))]; await S.lib.kvSet('patterns', S.patterns); toast(t('Patrón «{n}» guardado.', { n: esc(p.name) })); renderView(); },
  'pt-load': (el) => { S.pat = JSON.parse(JSON.stringify(S.patterns[+el.dataset.i])); savePat(); renderView(); },
  'pt-del': async (el) => { S.patterns.splice(+el.dataset.i, 1); await S.lib.kvSet('patterns', S.patterns); renderView(); },
  'pt-preview': () => patPreview(),
  'pt-dev': () => { try { const ms = sendEvents(patEvents(false)); toast(t('Sonando en la Rhythm (dos vueltas, sin transporte: no graba nada).'), 'ok', Math.min(8000, ms)); } catch (e) { toast(esc(errT(e.message)), 'bad'); } },
  'pt-rec': () => {
    const p = curPat(), n = p.lanes[0].steps.length;
    modal(`<h2>${t('Grabar en la Rhythm')}</h2>
      <ol class="note" style="color:var(--ink)"><li>${t('El pack de esta herramienta tiene que estar cargado en la Rhythm (los slots del kit tienen que coincidir).')}</li>
      <li>${t('Abre un proyecto vacío, o patrones vacíos en las pistas que vas a grabar.')}</li>
      ${n === 32 ? `<li>${t('Pon en 32 pasos cada pista que vayas a grabar (botón Step Page, 17-32).')}</li>` : ''}
      <li>${t('Pulsa Record en la Rhythm, sin Play.')}</li>
      <li>${t('Clock Rx activado en Setup View (de fábrica lo está).')}</li>
      ${p.swing > 50 ? `<li>${t('Graba recto. Después pon el swing de la Rhythm en {s} (Tempo/Swing).', { s: p.swing })}</li>` : ''}</ol>
      <p class="note">${t('La herramienta elige el sample de cada pista (CC 8), hace de reloj maestro (Stop, posición 0, Start y 24 pulsos por negra), toca las notas en el canal de cada pista y para al acabar. La Rhythm graba encima de lo que haya.')}</p>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-act="modal-close">${t('Cancelar')}</button><button class="btn primary" data-act="pt-rec-go">● ${t('Grabar ahora')}</button></div>`);
  },
  'pt-rec-go': () => { closeModal(); try { const ms = sendEvents(patEvents(true)); toast(t('Grabando… ({s} s)', { s: nf(ms / 1000, 1) }), 'ok', ms + 500); } catch (e) { toast(esc(errT(e.message)), 'bad'); } },
  'pt-mid': () => {
    const p = curPat(), kit = packKit();
    const mode = document.getElementById('pt-midmode').value;
    download(toMidi(p, { bpm: S.pack?.bpm || S.set.bpm, mode, sampleMidi: kit.map(sampleMidiOf), channels: S.set.channels, swing: p.swing }), `${safeName(p.name || p.opts.style + ' ' + p.opts.seed)}.mid`, 'audio/midi');
  },
  'kit-default': async () => { if (!S.pack) return; S.pack.kit = null; packKit(); await savePack(S.pack); renderView(); },
  'kit-send': () => { try { packKit().forEach((sl, i) => { if (sl != null) S.midi.selectSlot(i, sl); }); toast(t('Kit enviado: cada pista elige su slot con CC 8.')); } catch (e) { toast(esc(errT(e.message)), 'bad'); } },
  sweep: (el) => sweepMacro(+el.dataset.i, (+document.getElementById('dev-slot')?.value || 1) - 1),
  'org-dir': () => organizeRun(true).catch((e) => toast(esc(errT(e.message)), 'bad')),
  'org-zip': () => organizeRun(false).catch((e) => toast(esc(errT(e.message)), 'bad')),
  'sd-read': () => readSdCard().catch((e) => toast(esc(errT(e.message)), 'bad')),
  'sd-import': (el) => importSdPack(S.sdPacks[+el.dataset.i]).catch((e) => toast(esc(errT(e.message)), 'bad')),
  'fit-on': async () => { const s = current(); const f = loopFit(s); if (!f) return; s.recipe = { ...(s.recipe || {}), fitSec: f.sec }; await saveSample(s); renderDetail(); },
  'fit-off': async () => { const s = current(); s.recipe = { ...(s.recipe || {}) }; delete s.recipe.fitSec; await saveSample(s); renderDetail(); },
});

// eventos propios de las vistas nuevas
document.addEventListener('change', async (ev) => {
  const el = ev.target;
  if (el.id === 'mapcolor') { S.mapColor = el.value; drawMap(); }
  else if (el.id && el.id.startsWith('pt-') && curPat()) {
    const p = curPat(), o = p.opts;
    if (el.id === 'pt-style') { o.style = el.value; regen(); }
    else if (el.id === 'pt-fill') { o.fill = el.checked; regen(); }
    else if (el.id === 'pt-root') { o.root = +el.value; p.root = o.root; savePat(); }
    else if (el.id === 'pt-scale') { o.scale = el.value; regen(); }
    else if (el.id === 'pt-bass') { o.bassStyle = el.value; regen(); }
    else if (el.id === 'pt-density') { o.density = +el.value; regen(); }
    else if (el.id === 'pt-vel') { o.velVar = +el.value; regen(); }
    else if (el.id === 'pt-swing') { p.swing = Math.max(50, Math.min(75, +el.value || 50)); savePat(); }
    else if (el.id === 'pt-bpm' && S.pack) { S.pack.bpm = Math.max(40, Math.min(240, +el.value || 128)); await savePack(S.pack); }
    else return;
    if (el.id !== 'pt-midmode') renderView();
  } else if (el.dataset.kit != null && S.pack) { packKit()[+el.dataset.kit] = el.value === '' ? null : +el.value; await savePack(S.pack); renderView(); }
  else if (el.dataset.tcc != null) {
    const cc = +el.dataset.tcc, val = el.type === 'checkbox' ? (el.checked ? 1 : 0) : +el.value;
    (S.trackParams ||= {})[cc] = val;
    try { S.midi.cc(S.set.track, cc, val); } catch (e) { toast(esc(errT(e.message)), 'bad'); }
  } else if (el.id === 'org-by' || el.id === 'org-cert' || el.id === 'org-conv' || el.id === 'org-subs' || el.id === 'org-kinds' || el.id === 'org-tags') { S._orgSubs = document.getElementById('org-subs').checked; S._orgKinds = document.getElementById('org-kinds').checked; S._orgTags = document.getElementById('org-tags').checked; S._orgBy = document.getElementById('org-by').value; S._orgCert = document.getElementById('org-cert').value; S._orgConv = document.getElementById('org-conv').checked; renderView(); }
});
document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.dataset.tcc != null && el.type === 'range') { (S.trackParams ||= {})[+el.dataset.tcc] = +el.value; try { S.midi.cc(S.set.track, +el.dataset.tcc, +el.value); } catch {} }
});
document.addEventListener('mousemove', (ev) => {
  if (S.view !== 'map' || !ev.target.closest('#mapcv') || S._mdrag?.moved) return;
  const id = mapHit(ev); const h = document.getElementById('maphover');
  if (h) h.textContent = id ? `${S.byId[id].name} · ${catLabel(clsOf(S.byId[id]).cat)}` : '';
  drawMap(id);
});
document.addEventListener('click', (ev) => {
  if (S.view !== 'map' || !ev.target.closest('#mapcv')) return;
  if (S._mdragDone) { S._mdragDone = false; return; } // fin de un arrastre, no un clic
  const id = mapHit(ev); if (!id) return;
  S.sel = id; play(S.byId[id]); renderView();
});
document.addEventListener('keydown', (ev) => {
  const tag = (ev.target.tagName || '').toLowerCase();
  if (['input', 'select', 'textarea'].includes(tag) && !['checkbox', 'radio', 'range'].includes(ev.target.type)) return;
  if (document.getElementById('modal').classList.contains('on')) return;
  // búsqueda global, como en Tracks
  if (ev.key === '/' && S.view !== 'library') { ev.preventDefault(); S.view = 'library'; renderAll(); document.getElementById('q')?.focus(); return; }
  if (S.view !== 'library' && S.view !== 'listen' && S.view !== 'map') return;
  const s = current();
  if (ev.key === 'Tab' && S.abB && s && S.view === 'library') {
    ev.preventDefault(); S.abSide = S.abSide === 'B' ? 'A' : 'B';
    Player.stop(); play(S.abSide === 'B' ? S.byId[S.abB] : s); renderDetail(); return;
  }
  if (ev.shiftKey && /^Digit[1-8]$/.test(ev.code) && s) { ev.preventDefault(); sweepMacro(+ev.code.slice(5) - 1, S.pack ? S.pack.slots.indexOf(s.id) : -1); }
});
window.addEventListener('resize', () => { if (S.view === 'map') drawMap(); });
