// ui/app_events.js — acciones, teclado, arrastrar, reproducción e inicio
import { catByKey, learnFrom } from '../core/classify.js';
import { autoBuild, emptyPack, shortName, roleOf, SLOTS } from '../core/pack.js';

const TABS = () => [['library', '01', t('Biblioteca')], ['listen', '02', t('Escucha')], ['map', '03', t('Mapa')], ['packs', '04', t('Packs')], ['patterns', '05', t('Patrones')], ['songs', '06', t('Canciones')], ['device', '07', t('Equipo')], ['data', '08', t('Datos')]];

function go(view) { if (S.patPlaying) patStop(); S.view = view; Player.stop(); if (view === 'listen') { S.listen.built = false; S.listen.queue = []; } renderAll(); window.scrollTo(0, 0); }
function current() { return S.view === 'listen' ? S.byId[S.listen.queue[S.listen.i]] : S.byId[S.sel]; }

// ---------- reproducción ----------
let raf = 0;
async function play(s, fromSec = null, durSec = null, outOff = null) {
  if (!s) return;
  if (Player.playing && Player.key === s.id && fromSec == null && outOff == null) { Player.stop(); repaintTransport(); return; }
  const rate = Math.pow(2, S.tune / 12);
  try {
    const tv = trimView(s);
    if (S.set.play === 'orig') {
      const d = await decodedOf(s);
      Player.play(d.channels, d.sampleRate, { playbackRate: rate, key: s.id, offset: fromSec || 0, onEnd: repaintTransport });
      Player.map = (pos) => pos;
    } else {
      const r = await renderedOf(s);
      const off = outOff != null ? outOff : fromSec != null ? Math.max(0, fromSec - tv.st) : 0;
      Player.play([r.data], 48000, { playbackRate: rate, key: s.id, quant16: true, offset: off, duration: durSec, onEnd: repaintTransport });
      const rev = recipeOf(s).reverse;
      Player.map = keepMap(s) || ((pos) => (rev ? tv.st + r.data.length / 48000 - pos : tv.st + pos));
    }
    if (!s.user.heard) { s.user.heard = true; saveSample(s); }
    repaintTransport();
    cancelAnimationFrame(raf);
    const tick = () => {
      const cv = document.getElementById('wave');
      if (cv && Player.playing && Player.key === s.id) { drawWave(cv, s, Player.map(Player.position())); raf = requestAnimationFrame(tick); }
      else if (cv && current() === s) drawWave(cv, s);
    };
    raf = requestAnimationFrame(tick);
  } catch (e) { toast(esc(errT(e.message || String(e))), 'bad', 6000); }
}
function repaintTransport() {
  document.querySelectorAll('[data-act="play"]').forEach((b) => { b.firstChild.textContent = Player.playing ? '■ ' : '▶ '; });
}

// ---------- decisiones ----------
let learnTimer = 0;
async function decide(s, cat) {
  if (!s) return;
  const before = clsOf(s);
  const wasProp = !s.user.cat && before.cat === cat;
  keepOnDecide(s, s.user.cat || before.cat, cat);
  s.user.cat = cat; s.user.heard = true;
  learnFrom(S.learned, s, cat);
  clearTimeout(learnTimer); learnTimer = setTimeout(saveLearned, 800);
  invalidateAll();
  await saveSample(s);
  S.listen.stats.d++; if (wasProp) S.listen.stats.a++; else S.listen.stats.c++;
  afterChange(s, true);
}
function afterChange(s, advance = false) {
  if (S.view === 'listen') {
    if (advance) { Player.stop(); S.listen.i++; renderAll(); if (S.listen.auto) play(current()); }
    else renderListen(document.getElementById('view'));
  } else if (S.view === 'library') { renderHeader(); paintList(); renderDetail(); }
  else renderAll();
}
async function setUser(s, patch) { Object.assign(s.user, patch); S.ver++; await saveSample(s); afterChange(s); }

// ---------- packs ----------
function pushHist() { S.history.push(JSON.stringify({ id: S.pack.id, slots: S.pack.slots, names: S.pack.names })); if (S.history.length > 40) S.history.shift(); }
async function undoPack() {
  const h = S.history.pop(); if (!h) return;
  const o = JSON.parse(h); const p = S.packs.find((q) => q.id === o.id); if (!p) return;
  p.slots = o.slots; p.names = o.names; S.pack = p; await savePack(p); renderAll();
}
async function place(i, id) {
  const p = S.pack, s = S.byId[id]; if (!p || !s || i == null) return;
  pushHist();
  const old = p.slots.indexOf(id);
  if (old >= 0 && old !== i) { p.slots[old] = p.slots[i]; p.names[old] = p.slots[i] ? p.names[i] : ''; }
  p.slots[i] = id; p.names[i] = shortName(s.name);
  S.packSel = i;
  await savePack(p); renderAll();
}
async function swapSlots(a, b) {
  const p = S.pack; if (a === b) return;
  pushHist();
  [p.slots[a], p.slots[b]] = [p.slots[b], p.slots[a]]; [p.names[a], p.names[b]] = [p.names[b], p.names[a]];
  S.packSel = b; await savePack(p); renderAll();
}
async function clearSlot(i) { const p = S.pack; if (!p || i == null || !p.slots[i]) return; pushHist(); p.slots[i] = null; p.names[i] = ''; await savePack(p); renderAll(); }
function freeSlotFor(s) {
  const p = S.pack; const cat = clsOf(s).cat;
  for (let i = 0; i < SLOTS; i++) { const r = roleOf(p.layout, i); if (!p.slots[i] && r.cats && r.cats.includes(cat)) return i; }
  for (let i = 0; i < SLOTS; i++) if (!p.slots[i] && !roleOf(p.layout, i).cats) return i;
  for (let i = 0; i < SLOTS; i++) if (!p.slots[i]) return i;
  return -1;
}
async function addToPack(ids) {
  if (!S.pack) await newPack();
  const p = S.pack; pushHist();
  let n = 0, already = 0, full = 0;
  for (const id of ids) {
    const s = S.byId[id]; if (!s) continue;
    if (p.slots.includes(id)) { already++; continue; }
    const i = freeSlotFor(s); if (i < 0) { full++; continue; }
    p.slots[i] = id; p.names[i] = shortName(s.name); n++;
  }
  await savePack(p);
  toast(t('{n} añadidos a «{p}»', { n, p: esc(p.name) }) + (already ? ' · ' + t('{n} ya estaban', { n: already }) : '') + (full ? ` · <span class="warn">${t('{n} no caben: pack lleno', { n: full })}</span>` : ''), full ? 'warn' : 'ok');
  renderAll();
}
async function newPack() {
  const p = emptyPack(t('Pack {n}', { n: S.packs.length + 1 }), S.set.layout);
  p.bpm = S.set.bpm;
  S.packs.push(p); S.pack = p; S.packSel = null; S.history = [];
  await savePack(p); await S.lib.kvSet('packId', p.id);
  return p;
}
async function runAutoBuild() {
  const p = S.pack;
  S.set.minCert = document.getElementById('ab-cert').value;
  S.set.loopMax = +document.getElementById('ab-loop').value || 8;
  const keep = document.getElementById('ab-keep').checked;
  saveSettings();
  const pool = S.samples.filter((s) => !s.analysis?.error && !s.missing).map((s) => ({ ...s, cls: clsOf(s), rating: s.user?.rating, fav: s.user?.fav, discard: s.user?.discard }));
  const { slots, report } = autoBuild(pool, { layout: p.layout, minCert: S.set.minCert, loopMaxSec: S.set.loopMax, bpm: p.bpm || S.set.bpm, keep: keep ? p.slots : null });
  pushHist();
  slots.forEach((id, i) => { if (id !== p.slots[i]) { p.slots[i] = id; p.names[i] = id ? shortName(S.byId[id].name) : ''; } });
  await savePack(p);
  const empty = Object.entries(report.emptyNoCandidates).map(([r, n]) => `${ROLE_LABEL()[r]} ×${n}`).join(', ');
  toast(t('{n} slots rellenados · {s} s usados.', { n: report.placed, s: nf(report.total) }) + (empty ? '<br>' + t('Sin candidatos con esa certeza: {l}. Escucha más samples o baja la certeza mínima.', { l: empty }) : '') + (report.emptyBudget ? '<br>' + t('{n} slots vacíos por el límite de tiempo.', { n: report.emptyBudget }) : '') + (report.emptySimilar ? '<br>' + t('{n} slots vacíos: los candidatos que quedan son casi idénticos a otros ya elegidos.', { n: report.emptySimilar }) : '') + (report.skippedLong ? '<br>' + t('{n} loops descartados por largos (más de {s} s).', { n: report.skippedLong, s: S.set.loopMax }) : ''), empty || report.emptyBudget || report.emptySimilar ? 'warn' : 'ok', 10000);
  renderAll();
}
let walkTimer = 0;
function walkPack() {
  if (walkTimer) { clearInterval(walkTimer); walkTimer = 0; toast(t('Recorrido detenido')); return; }
  const filled = S.pack.slots.map((id, i) => (id ? i : -1)).filter((i) => i >= 0);
  let k = 0;
  walkTimer = setInterval(() => {
    if (k >= filled.length) { clearInterval(walkTimer); walkTimer = 0; return; }
    const i = filled[k++]; S.packSel = i;
    try { S.midi.audition(S.set.track, i); } catch (e) { clearInterval(walkTimer); walkTimer = 0; toast(esc(errT(e.message)), 'bad'); }
    document.querySelectorAll('.pad.sel').forEach((el) => el.classList.remove('sel'));
    document.querySelector(`.pad[data-i="${i}"]`)?.classList.add('sel');
  }, 750);
  toast(t('Recorriendo {n} slots en la pista {t}. Pulsa otra vez para parar.', { n: filled.length, t: S.set.track + 1 }));
}

// ---------- selectores de archivo ----------
function pickFiles({ dir = false, accept = '' } = {}) {
  return new Promise((res) => {
    const i = document.createElement('input'); i.type = 'file'; i.multiple = !accept.includes('.json'); if (dir) i.webkitdirectory = true; if (accept) i.accept = accept;
    i.onchange = () => res([...i.files]); i.click();
  });
}
async function chooseSdNumber(used, onPick) {
  const free = [...Array(31).keys()].filter((n) => !used.has(n));
  modal(`<h2>${t('Posición del pack en la tarjeta')}</h2>
    <p class="note">${t('La Rhythm tiene 1 pack interno y hasta 31 en la tarjeta. La carpeta Rhythm/0 es el segundo pack del equipo, Rhythm/1 el tercero…')}</p>
    ${used.size ? `<p class="muted">${t('Ocupadas: {l}', { l: [...used].sort((a, b) => a - b).join(', ') })}</p>` : ''}
    <div class="row"><select id="sdnum">${free.map((n) => `<option value="${n}">${n} · ${t('pack {k} del equipo', { k: n + 2 })}</option>`).join('')}</select>
    <span class="grow"></span><button class="btn" data-act="modal-close">${t('Cancelar')}</button><button class="btn primary" id="sdgo">${t('Exportar')}</button></div>
    <p class="note">${t('Formato: 48 kHz · 16 bit · mono, carpetas meta/ y Sessions/ vacías (la Rhythm crea los proyectos). Tarjeta en FAT32 y firmware al día.')}</p>`);
  document.getElementById('sdgo').onclick = () => { const n = +document.getElementById('sdnum').value; closeModal(); onPick(n); };
}

// ---------- acciones ----------
const ACT = {
  'goto-listen': () => { S.listen.src = 'doubt'; go('listen'); },
  'goto-device': () => go('device'),
  reconnect: reconnectRoots,
  backup: backupJSON,
  'busy-cancel': () => { if (S.busy) S.busy.cancel = true; },
  'modal-close': closeModal,
  fcat: (el) => { S.f.cat = el.dataset.v; S.f.sub = ''; renderView(); },
  sel: (el, ev) => {
    const id = el.dataset.id;
    if (ev.shiftKey && S.anchor) { const l = filtered(); const a = l.findIndex((s) => s.id === S.anchor), b = l.findIndex((s) => s.id === id); for (let i = Math.min(a, b); i <= Math.max(a, b); i++) S.multi.add(l[i].id); renderView(); return; }
    if (ev.metaKey || ev.ctrlKey) { S.multi.has(id) ? S.multi.delete(id) : S.multi.add(id); S.anchor = id; renderView(); return; }
    if (S.view !== 'library' && S.view !== 'listen') { pickInPlace(id); return; }
    if (S.view !== 'library') S.view = 'library';
    Player.stop(); S.sel = id; S.anchor = id; S.slices = 0; S.tune = 0;
    if (document.getElementById('list')) { paintList(); renderDetail(); renderHeader(); scrollToSel(); } else renderAll();
  },
  'multi-clear': () => { S.multi.clear(); renderView(); },
  'multi-pack': () => addToPack([...S.multi]),
  'multi-listen': () => { S.listen.src = 'sel'; go('listen'); },
  play: () => play(current()),
  playmode: (el) => { S.set.play = el.dataset.v; saveSettings(); Player.stop(); renderView(); },
  decide: (el) => decide(current(), el.dataset.v),
  accept: () => { const s = current(); const c = clsOf(s); if (c.cat) decide(s, c.cat); },
  undecide: () => { const s = current(); delete s.user.cat; delete s.user.via; invalidateAll(); saveSample(s).then(() => afterChange(s)); },
  rate: (el) => { const s = current(); const v = +el.dataset.v; setUser(s, { rating: s.user.rating === v ? 0 : v }); },
  fav: () => { const s = current(); setUser(s, { fav: !s.user.fav }); },
  discard: () => { const s = current(); setUser(s, { discard: !s.user.discard }); },
  'recipe-reset': () => { const s = current(); s.recipe = {}; saveSample(s).then(() => renderDetail()); },
  'add-to-pack': () => addToPack([S.sel]),
  'goto-slot': (el) => { const p = S.packs.find((q) => q.id === el.dataset.p); if (p) { S.pack = p; S.packSel = +el.dataset.i; go('packs'); } },
  'dev-play-sample': () => { const i = S.pack?.slots.indexOf(S.sel); if (i == null || i < 0) { toast(t('Este sample no está en el pack actual: no sé en qué slot de la Rhythm está.'), 'warn'); return; } try { S.midi.audition(S.set.track, i); } catch (e) { toast(esc(errT(e.message)), 'bad'); } },
  lrebuild: () => { buildQueue(); renderView(); },
  // packs
  'pack-new': async () => { await newPack(); renderAll(); },
  'pack-dup': async () => { const q = JSON.parse(JSON.stringify({ ...S.pack, extra: undefined })); q.id = 'pk_' + Math.random().toString(36).slice(2, 10); q.name = (S.pack.name + ' 2').slice(0, 32); q.created = Date.now(); q.extra = S.pack.extra; S.packs.push(q); S.pack = q; await savePack(q); renderAll(); },
  'pack-del': () => {
    modal(`<h2>${t('¿Borrar el pack «{n}»?', { n: esc(S.pack.name) })}</h2><p class="note">${t('Solo se borra la distribución; los samples siguen en la biblioteca.')}</p><div class="row" style="justify-content:flex-end"><button class="btn" data-act="modal-close">${t('Cancelar')}</button><button class="btn danger" data-act="pack-del-ok">${t('Borrar')}</button></div>`);
  },
  'pack-del-ok': async () => { closeModal(); await S.lib.del('packs', S.pack.id); S.packs = S.packs.filter((p) => p !== S.pack); S.pack = S.packs[0] || null; S.packSel = null; renderAll(); },
  slot: (el) => { const i = +el.dataset.i; if (S.pack.slots[i]) S.sel = S.pack.slots[i]; if (S.packSel === i && S.pack.slots[i]) { play(S.byId[S.pack.slots[i]]); return; } S.packSel = i; renderView(); },
  cand: (el) => { const s = S.byId[el.dataset.id]; S.set.play = S.set.play || 'rhythm'; play(s); S.sel = s.id; paintDock(); },
  'slot-play': () => play(S.byId[S.pack.slots[S.packSel]]),
  'slot-dev': () => { try { S.midi.audition(S.set.track, S.packSel); } catch (e) { toast(esc(errT(e.message)), 'bad'); } },
  'slot-open': () => { S.sel = S.pack.slots[S.packSel]; S.f = { ...S.f, q: '', cat: 'all', cert: 'all', flag: 'all' }; go('library'); },
  'slot-clear': () => clearSlot(S.packSel),
  autobuild: runAutoBuild,
  'pack-undo': undoPack,
  'exp-components': () => exportComponents(S.pack).catch((e) => toast(esc(errT(e.message)), 'bad', 8000)),
  'exp-sdzip': () => chooseSdNumber(new Set(), (n) => exportSdZip(S.pack, n).catch((e) => toast(esc(errT(e.message)), 'bad', 8000))),
  'exp-sd': async () => {
    if (!window.showDirectoryPicker) { toast(t('Este navegador no puede escribir en carpetas. Usa «ZIP para la SD».'), 'warn'); return; }
    let dir; try { dir = await window.showDirectoryPicker({ id: 'crsl-sd', mode: 'readwrite' }); } catch { return; }
    const { used } = await sdFreeNumbers(dir);
    chooseSdNumber(used, (n) => exportSdFolder(S.pack, n, dir).catch((e) => toast(esc(errT(e.message)), 'bad', 8000)));
  },
  'exp-wav': () => exportWavZip(S.pack).catch((e) => toast(esc(errT(e.message)), 'bad', 8000)),
  'pack-walk': walkPack,
  // equipo
  'midi-connect': async () => {
    try {
      await S.midi.connect(); S.midiOn = true; S.midiErr = null;
      S.midi.onState = () => { S.midi.autoPick(); renderHeader(); if (S.view === 'device') renderView(); };
      S.midi.onClock = () => { if (S.view === 'device') renderView(); };
      toast(S.midi.out ? t('Conectado a {n}', { n: esc(S.midi.out.name) }) : t('MIDI activo, pero no veo la Circuit Rhythm. Elige la salida a mano.'), S.midi.out ? 'ok' : 'warn');
    } catch (e) { S.midiErr = String(e.message || e); }
    renderAll();
  },
  'midi-bpm': async () => { S.pack.bpm = Math.round(S.midi.bpm); await savePack(S.pack); toast(t('BPM del pack: {b}', { b: S.pack.bpm })); renderView(); },
  'dev-audition': () => { try { S.midi.audition(S.set.track, (+document.getElementById('dev-slot').value || 1) - 1); setTimeout(() => renderView(), 600); } catch (e) { toast(esc(errT(e.message)), 'bad'); } },
  'dev-note': () => { try { S.midi.note(S.set.track); setTimeout(() => renderView(), 600); } catch (e) { toast(esc(errT(e.message)), 'bad'); } },
  'dev-panic': () => S.midi.panic(),
  'dev-macro-reset': () => { S.midi.resetMacros(S.set.track); renderView(); },
  // datos
  link: linkFolder,
  'pick-files': async () => importFiles(await pickFiles({ accept: '.wav,.wave,.aif,.aiff,.aifc,.mp3,.flac,.ogg,.zip,.circuitrhythmpack' })),
  'pick-dir': async () => importFiles(await pickFiles({ dir: true })),
  'pick-pack': async () => { for (const f of await pickFiles({ accept: '.circuitrhythmpack' })) await importComponentsPack(f); renderAll(); },
  rescan: async (el) => { const r = S.roots.get(el.dataset.r); if (r.perm !== 'granted') await reconnectRoots(); if (r.perm === 'granted') await scanRoot(r); },
  unlink: (el) => {
    const r = S.roots.get(el.dataset.r); const n = S.samples.filter((s) => s.src?.root === r.id).length;
    modal(`<h2>${t('¿Quitar la carpeta «{n}»?', { n: esc(r.name) })}</h2><p class="note">${t('Se quitan de la biblioteca sus {n} samples y sus fichas (descarga antes una copia si quieres conservarlas). Tus archivos no se tocan.', { n })}</p><div class="row" style="justify-content:flex-end"><button class="btn" data-act="modal-close">${t('Cancelar')}</button><button class="btn danger" data-act="unlink-ok" data-r="${r.id}">${t('Quitar')}</button></div>`);
  },
  'unlink-ok': async (el) => {
    closeModal();
    const id = el.dataset.r;
    const gone = S.samples.filter((s) => s.src?.root === id);
    for (const s of gone) { await S.lib.del('samples', s.id); delete S.byId[s.id]; }
    S.samples = S.samples.filter((s) => s.src?.root !== id);
    S.roots.delete(id); await S.lib.del('roots', id); S.ver++; renderAll();
  },
  restore: async () => { const [f] = await pickFiles({ accept: '.json' }); if (!f) return; try { await restoreJSON(f); } catch (e) { toast(esc(errT(e.message)), 'bad'); } renderAll(); },
  'rule-del': async (el) => { delete S.learned[el.dataset.tok]; await saveLearned(); invalidateAll(); renderAll(); },
  wipe: async () => {
    if (document.getElementById('wipe-word').value.trim().toUpperCase() !== t('BORRAR')) { toast(t('Escribe BORRAR para confirmar.'), 'warn'); return; }
    const keep = document.getElementById('wipe-keep').checked;
    Player.stop();
    await S.lib.wipe(keep ? ['kv'] : []);
    if (keep) { await S.lib.del('kv', 'pending'); await S.lib.del('kv', 'packId'); await S.lib.del('kv', 'lastBackup'); }
    S.samples = []; S.byId = {}; S.packs = []; S.pack = null; S.roots = new Map(); S.pending = {}; S.multi.clear(); S.sel = null; S.history = [];
    S.trash = []; S.excluded = {}; await S.lib.del('kv', 'trash'); await S.lib.del('kv', 'excluded');
    if (!keep) { S.learned = {}; }
    S.decCache.clear(); S.renCache.clear(); invalidateAll();
    toast(t('Biblioteca vacía. Tus archivos del disco siguen intactos.'));
    go('data');
  },
};

function onClick(ev) {
  const el = ev.target.closest('[data-act]');
  if (!el) { const tab = ev.target.closest('.tab'); if (tab) go(tab.dataset.view); return; }
  const a = ACT[el.dataset.act];
  if (a) { ev.preventDefault(); a(el, ev); }
}
function onDblClick(ev) {
  const c = ev.target.closest('[data-act="cand"]');
  if (c && S.pack) { const i = S.packSel != null && !S.pack.slots[S.packSel] ? S.packSel : S.packSel ?? freeSlotFor(S.byId[c.dataset.id]); if (i >= 0) place(i, c.dataset.id); }
}

let nameTimer = 0;
async function onChange(ev) {
  const el = ev.target;
  const s = current();
  if (el.id === 'fsort') { S.f.sort = el.value; renderView(); }
  else if (el.id === 'fflag') { S.f.flag = el.value; renderView(); }
  else if (el.id === 'fcert') { S.f.cert = el.value; renderView(); }
  else if (el.id === 'fkind') { S.f.kind = el.value; renderView(); }
  else if (el.id === 'lkeep') { S.set.keepDet = el.checked; saveSettings(); }
  else if (el.dataset.rc && s) {
    const k = el.dataset.rc;
    let v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? null : +el.value) : el.value;
    s.recipe = { ...(s.recipe || {}) };
    if (v === null) delete s.recipe[k]; else s.recipe[k] = v;
    await saveSample(s); renderDetail();
  }
  else if (el.id === 'slices') { S.slices = +el.value; drawWave(document.getElementById('wave'), s); }
  else if (el.name === 'lsrc') { S.listen.src = el.value; buildQueue(); renderView(); }
  else if (el.id === 'lcat') { S.listen.cat = el.value; buildQueue(); renderView(); }
  else if (el.id === 'lorder') { S.listen.order = el.value; buildQueue(); renderView(); }
  else if (el.id === 'lauto') { S.listen.auto = el.checked; }
  else if (el.id === 'packsel') { S.pack = S.packs.find((p) => p.id === el.value); S.packSel = null; S.history = []; await S.lib.kvSet('packId', S.pack.id); renderView(); }
  else if (el.id === 'packlayout') { S.pack.layout = el.value; S.set.layout = el.value; saveSettings(); await savePack(S.pack); renderView(); }
  else if (el.id === 'packbpm') { S.pack.bpm = Math.max(40, Math.min(240, +el.value || 128)); await savePack(S.pack); renderView(); }
  else if (el.id === 'packcat') { S.packCat = el.value; renderView(); }
  else if (el.id === 'midi-out') { S.midi.setOutput(el.value); renderAll(); }
  else if (el.id === 'midi-in') { S.midi.setInput(el.value || null); }
  else if (el.dataset.chan != null) { S.set.channels[+el.dataset.chan] = +el.value; S.midi.channels = S.set.channels.slice(); saveSettings(); }
  else if (el.id === 'dev-track') { S.set.track = +el.value; saveSettings(); }
  else if (el.id === 'set-target') { S.set.targetDb = Math.min(0, +el.value); saveSettings(); S.renCache.clear(); }
  else if (el.id === 'set-thr') { S.set.thresholdDb = +el.value; saveSettings(); S.renCache.clear(); }
  else if (el.id === 'set-bpm') { S.set.bpm = +el.value || 128; saveSettings(); }
  else if (el.id === 'set-sep') { S.set.sep = el.value; saveSettings(); }
}
function onInput(ev) {
  const el = ev.target;
  if (el.id === 'q') { S.f.q = el.value; const li = document.getElementById('list'); if (li) { li.scrollTop = 0; } const sp = document.querySelector('.spacer'); if (sp) sp.style.height = filtered().length * ROW_H + 'px'; paintList(); document.querySelector('.listfoot span').textContent = t('{n} de {m}', { n: filtered().length.toLocaleString(LOCALE), m: S.samples.length.toLocaleString(LOCALE) }); }
  else if (el.id === 'tune') { S.tune = +el.value; document.getElementById('tunev').textContent = (S.tune > 0 ? '+' : '') + S.tune; if (Player.playing) Player.src.playbackRate.value = Math.pow(2, S.tune / 12); }
  else if (el.id === 'packq') { S.packQ = el.value; clearTimeout(nameTimer); nameTimer = setTimeout(() => { renderView(); const q = document.getElementById('packq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250); }
  else if (el.id === 'packname') { S.pack.name = el.value.slice(0, 32); clearTimeout(nameTimer); nameTimer = setTimeout(() => { savePack(S.pack); const o = document.querySelector(`#packsel option[value="${S.pack.id}"]`); if (o) o.textContent = S.pack.name; }, 400); }
  else if (el.id === 'slotname') { S.pack.names[S.packSel] = el.value.slice(0, 32); clearTimeout(nameTimer); nameTimer = setTimeout(() => savePack(S.pack), 400); const pn = document.querySelector(`.pad[data-i="${S.packSel}"] .pn`); if (pn) pn.textContent = el.value; }
  else if (el.dataset.macro != null) { try { S.midi.macro(S.set.track, +el.dataset.macro, +el.value); } catch {} }
}

// forma de onda: arrastrar asas de recorte o clic para escuchar desde ahí
function onPointerDown(ev) {
  const cv = ev.target.closest('#wave'); if (!cv) return;
  const s = current(); if (!s || !s.analysis?.dur) return;
  const rect = cv.getBoundingClientRect();
  const tv = trimView(s);
  const toT = (x) => Math.max(0, Math.min(tv.dur, ((x - rect.left) / rect.width) * tv.dur));
  const xs = rect.left + (tv.st / tv.dur) * rect.width, xe = rect.left + (tv.en / tv.dur) * rect.width;
  const grab = Math.abs(ev.clientX - xs) < 8 ? 'trimStart' : Math.abs(ev.clientX - xe) < 8 ? 'trimEnd' : null;
  if (!grab || S.view !== 'library') {
    const at = toT(ev.clientX);
    // con slices: se escucha solo la slice pulsada, como en Slice Note View
    const kp = keepOf(s), R = sliceRegion(s);
    if (kp && at >= R.st && at <= R.st + R.len) {
      // acortado: una slice que se queda suena como en lo exportado; una que se quita, del original
      const w = R.len / kp.n, i = Math.min(kp.n - 1, Math.floor((at - R.st) / w)), j = kp.sel.indexOf(i);
      const prev = S.set.play;
      if (j >= 0 && !recipeOf(s).reverse) { S.set.play = 'rhythm'; play(s, null, w, j * w); } else { S.set.play = 'orig'; play(s, R.st + i * w, w); }
      S.set.play = prev; return;
    }
    if (S.slices && S.view === 'library' && at >= R.st && at <= R.st + R.len) {
      const w = R.len / S.slices, k = Math.min(S.slices - 1, Math.floor((at - R.st) / w));
      const prev = S.set.play; S.set.play = 'rhythm'; play(s, R.st + k * w, w); S.set.play = prev; return;
    }
    play(s, at); return;
  }
  cv.setPointerCapture(ev.pointerId);
  const move = (e) => {
    const v = Math.round(toT(e.clientX) * 1000) / 1000;
    s.recipe = { ...(s.recipe || {}) };
    if (grab === 'trimStart') s.recipe.trimStart = Math.min(v, tv.en - 0.005); else s.recipe.trimEnd = Math.max(v, tv.st + 0.005);
    drawWave(cv, s);
  };
  const up = async () => { cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); await saveSample(s); renderDetail(); };
  cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up);
}

// arrastrar: candidatos y slots
function onDragStart(ev) {
  const c = ev.target.closest('.mi[data-id], .li[data-id]');
  if (c) { ev.dataTransfer.setData('text/crsl-id', c.dataset.id); ev.dataTransfer.effectAllowed = 'copyMove'; return; }
  const p = ev.target.closest('.pad[data-i]');
  if (p) { ev.dataTransfer.setData('text/crsl-slot', p.dataset.i); ev.dataTransfer.effectAllowed = 'move'; }
}
function onDragOver(ev) {
  const types = [...(ev.dataTransfer?.types || [])];
  const pad = ev.target.closest('.pad');
  if (pad && (types.includes('text/crsl-id') || types.includes('text/crsl-slot'))) { ev.preventDefault(); document.querySelectorAll('.pad.drop').forEach((e) => e !== pad && e.classList.remove('drop')); pad.classList.add('drop'); return; }
  if (types.includes('Files')) ev.preventDefault();
}
async function onDrop(ev) {
  const types = [...(ev.dataTransfer?.types || [])];
  const pad = ev.target.closest('.pad');
  document.querySelectorAll('.pad.drop').forEach((e) => e.classList.remove('drop'));
  if (pad && types.includes('text/crsl-id')) { ev.preventDefault(); place(+pad.dataset.i, ev.dataTransfer.getData('text/crsl-id')); return; }
  if (pad && types.includes('text/crsl-slot')) { ev.preventDefault(); swapSlots(+ev.dataTransfer.getData('text/crsl-slot'), +pad.dataset.i); return; }
  if (types.includes('Files')) { ev.preventDefault(); const files = await filesFromDrop(ev.dataTransfer); await importFiles(files); }
}

// teclado
function onKey(ev) {
  const tag = (ev.target.tagName || '').toLowerCase();
  if (ev.key === 'Escape') { closeModal(); Player.stop(); repaintTransport(); if (tag === 'input') ev.target.blur(); return; }
  if (['input', 'select', 'textarea'].includes(tag) && !(ev.target.type === 'checkbox' || ev.target.type === 'radio' || ev.target.type === 'range')) return;
  if (document.getElementById('modal').classList.contains('on')) return;
  if (ev.metaKey || (ev.ctrlKey && ev.key.toLowerCase() !== 'z') || ev.altKey) return;
  const k = ev.key;
  if (S.view === 'packs') {
    if ((ev.ctrlKey || ev.metaKey) && k.toLowerCase() === 'z') { ev.preventDefault(); undoPack(); return; }
    if (S.packSel == null) return;
    if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); clearSlot(S.packSel); }
    else if (k === ' ') { ev.preventDefault(); const id = S.pack.slots[S.packSel]; if (id) play(S.byId[id]); }
    else if (k.startsWith('Arrow')) { ev.preventDefault(); const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 }[k]; S.packSel = Math.max(0, Math.min(SLOTS - 1, S.packSel + d)); renderView(); }
    return;
  }
  if (S.view !== 'library' && S.view !== 'listen') return;
  const s = current();
  if (k === '/' && S.view === 'library') { ev.preventDefault(); document.getElementById('q')?.focus(); return; }
  if (k === 'Tab' || (ev.shiftKey && /^Digit\d$/.test(ev.code))) return; // A/B y barridos: app_ext.js
  if (k === ' ') { ev.preventDefault(); play(s); return; }
  if (!s) return;
  if (k === 'Enter') { ev.preventDefault(); ACT.accept(); return; }
  if (k === 'ArrowDown' || k === 'ArrowUp' || (S.view === 'listen' && (k === 'ArrowLeft' || k === 'ArrowRight'))) {
    ev.preventDefault();
    const d = k === 'ArrowDown' || k === 'ArrowRight' ? 1 : -1;
    if (S.view === 'listen') { Player.stop(); S.listen.i = Math.max(0, Math.min(S.listen.queue.length, S.listen.i + d)); renderView(); if (S.listen.auto && current()) play(current()); }
    else { const l = filtered(); const i = l.findIndex((x) => x.id === S.sel); const n = l[Math.max(0, Math.min(l.length - 1, i + d))]; if (n) { Player.stop(); S.sel = n.id; S.anchor = n.id; paintList(); renderDetail(); scrollToSel(); } }
    return;
  }
  if (/^[1-5]$/.test(k)) { ACT.rate({ dataset: { v: k } }); return; }
  if (k === '0') { setUser(s, { rating: 0 }); return; }
  if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); ACT.discard(); return; }
  if (k.toLowerCase() === 'f') { ACT.fav(); return; }
  if (k.toLowerCase() === 'w') { ev.preventDefault(); ACT['kind-toggle'](); return; }
  if (k.toLowerCase() === 'r') { S.set.play = S.set.play === 'rhythm' ? 'orig' : 'rhythm'; saveSettings(); Player.stop(); renderView(); toast(S.set.play === 'rhythm' ? t('Escuchando como en la Rhythm (48 kHz · mono · 16 bit, con la preparación)') : t('Escuchando el archivo original'), 'ok', 1800); return; }
  const c = catByKey(k);
  if (c) { ev.preventDefault(); decide(s, c.id); }
}

async function init() {
  document.documentElement.lang = LANG;
  document.getElementById('tabs').innerHTML = TABS().map(([v, n, l]) => `<button class="tab" data-view="${v}"><b>${n}</b>${l}</button>`).join('');
  document.addEventListener('click', onClick);
  document.addEventListener('dblclick', onDblClick);
  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('dragstart', onDragStart);
  document.addEventListener('dragover', onDragOver);
  document.addEventListener('drop', onDrop);
  document.addEventListener('dragleave', (e) => { const p = e.target.closest?.('.pad'); if (p) p.classList.remove('drop'); });
  let rt = 0; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { const s = current(); if (s) drawWave(document.getElementById('wave'), s); paintList(); }, 120); });
  try { await loadAll(); }
  catch (e) { document.getElementById('view').innerHTML = `<div class="panel empty"><h2>${t('No se pudo abrir la biblioteca del navegador')}</h2><p class="bad">${esc(e.message || e)}</p><p>${t('Abre el archivo con Chrome o Edge. En modo privado el navegador puede no guardar nada.')}</p></div>`; return; }
  if (!S.samples.length) S.view = 'library';
  await autoPurge();
  renderAll();
  if (S.samples.length && navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  window.__crsl = { origin: __ORIGIN__, S, ACT, scanRoot, trashCount, curPat, packKit, recordEvents, revision, calibration, organizePlan, mapPoints, decide, place, play, renderAll, filtered, clsOf, packChecks, exportComponents, importFiles, importComponentsPack, Player, songState, curTimeline, readProject, songEvents, renderSongAudio, renderedOf, wavOf, budget, sampleSeconds, newPack, savePack, repOf };
}
init();
