// ui/app_sound.js — v2.3: trabajar el sonido para tocar en directo.
//  · Sacar los golpes de un loop como one-shots (un break → un kit), agrupando los repetidos.
//  · Afinar al tono del pack: bombos, toms y bajos a la tónica; el resto, al semitono más cercano.
//  · Igualar el volumen percibido de cada página (pista): cambiar de sample en directo sin saltos de volumen.
import { findHits, describeHits, groupHits, hitAudio, hitBaseName } from '../core/hits.js';
import { tunePlan, measuredMidi, pitchLabel, shiftToPc, shiftToSemitone, PITCH_CLASSES, tuneRatio } from '../core/tune.js';
import { loudnessMax, matchGroup } from '../core/loud.js';
import { originalFormat, encodeOriginal } from '../core/slices.js';
import { CATS } from '../core/classify.js';
import { isLoopSample, sampleSeconds, PAGE } from '../core/pack.js';
import { render } from '../core/dsp.js';


const signed = (x, d = 2) => (x > 0 ? '+' : x < 0 ? '−' : '') + nf(Math.abs(x), d);
const cssColor = (v) => (String(v).startsWith('var(') ? getComputedStyle(document.body).getPropertyValue(v.slice(4, -1)).trim() || '#999' : v);

// ======================================================================
// Golpes
// ======================================================================
const HT = { id: null, sens: 'normal', group: true, data: null, off: {}, cats: {}, reps: {}, last: [] };
function hitsAvailable(s) {
  const a = s && s.analysis;
  return !!a && !a.error && !a.silent && (isLoopSample(s) || ((a.onsets || 0) >= 3 && (a.activeDur || 0) >= 0.6));
}
function hitsButtonHTML(s) {
  return hitsAvailable(s) ? `<button class="btn small ghost" data-act="hits-open" data-id="${s.id}" title="${t('Saca cada golpe de este loop como un one-shot: un break se convierte en un kit')}">✂ ${t('Golpes…')}</button>` : '';
}
function hitItems() {
  const D = HT.data; if (!D) return [];
  if (HT.group) return D.groups.map((g, gi) => { const key = 'g' + gi; return { key, cat: HT.cats[key] || g.cat, auto: g.cat, members: g.members, rep: D.hits[HT.reps[key] ?? g.rep.i] }; });
  return D.hits.map((h) => { const key = 'h' + h.i; return { key, cat: HT.cats[key] || h.cat, auto: h.cat, members: [h], rep: h }; });
}
async function hitsOpen(s) {
  if (!s) return;
  if (HT.id !== s.id) { HT.off = {}; HT.cats = {}; HT.reps = {}; }
  HT.id = s.id; HT.data = null;
  modal(`<div class="hitbox"><h2>${t('Golpes de «{n}»', { n: esc(hitBaseName(s.name)) })}</h2><p class="muted">${t('Buscando los golpes…')}</p></div>`);
  await yieldUI();
  try {
    const d = await decodedOf(s);
    const hits = describeHits(d, findHits(d, { sens: HT.sens }));
    HT.data = { hits, groups: groupHits(hits), len: d.channels[0].length, sr: d.sampleRate };
  } catch (e) { closeModal(); toast(esc(e.message || e), 'bad', 7000); return; }
  hitsPaint();
}
function hitsPaint() {
  const s = S.byId[HT.id], D = HT.data; if (!s || !D) return;
  const items = hitItems(), on = items.filter((it) => !HT.off[it.key]).length, base = hitBaseName(s.name);
  const catOpts = (sel) => CATS.filter((c) => c.id !== 'dloop' && c.id !== 'mloop').map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${catLabel(c.id)}</option>`).join('');
  const rows = items.map((it) => `<div class="hitrow ${HT.off[it.key] ? 'off' : ''}">
      <input type="checkbox" data-hk="${it.key}" ${HT.off[it.key] ? '' : 'checked'} title="${t('Añadir este golpe')}">
      <button class="btn small" data-act="hits-play" data-k="${it.key}" title="${t('Escuchar')}">▶</button>
      <span class="sw" style="background:${catVar(it.cat)}"></span>
      <select data-hcat="${it.key}">${catOpts(it.cat)}</select>
      ${it.members.length > 1 ? `<b class="mono">×${it.members.length}</b>` : ''}
      <span class="muted">${fmtDur(it.rep.dur)} · ${t('en {s}', { s: nf(it.rep.t, 2) + ' s' })}${it.rep.bleed ? ` · <span class="warn">${t('lleva la cola del golpe anterior')}</span>` : ''}</span>
      ${it.members.length > 1 ? `<span class="hvars" title="${t('Los golpes de este grupo: pulsa uno para escucharlo y quedarte con él')}">${it.members.slice(0, 24).map((m, j) => `<button class="hv ${m === it.rep ? 'on' : ''}" data-act="hits-rep" data-k="${it.key}" data-i="${m.i}" title="${nf(m.t, 2)} s${m.bleed ? ' · ' + t('lleva la cola del golpe anterior') : ''}">${j + 1}</button>`).join('')}</span>` : ''}
    </div>`).join('');
  modal(`<div class="hitbox"><h2>${t('Golpes de «{n}»', { n: esc(base) })}</h2>
    <canvas id="hitwave" class="hitwave" width="900" height="90"></canvas>
    <div class="row" style="gap:10px;margin:8px 0">
      <span class="lbl">${t('Sensibilidad')}</span><span class="seg">${[['low', t('Menos')], ['normal', t('Normal')], ['high', t('Más')]].map(([k, l]) => `<button class="${HT.sens === k ? 'on' : ''}" data-act="hits-sens" data-v="${k}">${l}</button>`).join('')}</span>
      <label class="inl"><input type="checkbox" id="hits-group" ${HT.group ? 'checked' : ''}> ${t('Agrupar los parecidos')}</label>
      <span class="grow"></span><span class="muted">${t('{n} golpes · {g} grupos', { n: D.hits.length, g: D.groups.length })}</span>
    </div>
    ${D.hits.length ? `<div class="hitlist">${rows}</div>` : `<p class="warn">${t('No he encontrado golpes. Prueba con más sensibilidad.')}</p>`}
    <p class="note">${t('Cada golpe va de su ataque al siguiente, sin la cola que queda por debajo de −50 dB. De cada grupo de golpes parecidos se queda el más completo; pulsa los números para escuchar los demás y elegir otro. Entran en la biblioteca como one-shots, con la categoría que ves (puedes cambiarla aquí o después) y con la frecuencia, los canales y los bits del original.')}</p>
    <div class="row" style="justify-content:space-between;margin-top:10px"><span class="muted">${t('Carpeta: «{f}»', { f: esc(t('Extraídos') + '/' + base) })}</span>
      <span class="row"><button class="btn" data-act="modal-close">${t('Cancelar')}</button><button class="btn primary" data-act="hits-add" ${on ? '' : 'disabled'}>${t('Añadir {n} a la biblioteca', { n: on })}</button></span></div></div>`);
  hitsDraw(s, items);
}
function hitsDraw(s, items) {
  const cv = document.getElementById('hitwave'), D = HT.data; if (!cv || !D) return;
  const g = cv.getContext('2d'), W = cv.width, Hh = cv.height, ov = s.ov;
  g.clearRect(0, 0, W, Hh);
  g.fillStyle = cssColor('var(--line)') || '#444';
  if (ov) { const n = ov.length / 2; for (let c = 0; c < n; c++) { const x = (c / n) * W, y0 = Hh / 2 - ov[c * 2 + 1] * Hh * 0.45, y1 = Hh / 2 - ov[c * 2] * Hh * 0.45; g.fillRect(x, y0, Math.max(1, W / n), Math.max(1, y1 - y0)); } }
  const catOf = new Map(); for (const it of items) for (const m of it.members) catOf.set(m.i, { cat: it.cat, rep: m === it.rep, off: HT.off[it.key] });
  for (const h of D.hits) {
    const c = catOf.get(h.i) || { cat: h.cat }, x = (h.a / D.len) * W;
    g.globalAlpha = c.off ? 0.25 : 1; g.fillStyle = cssColor(catVar(c.cat));
    g.fillRect(x, 0, c.rep ? 3 : 1.5, Hh);
    if (c.rep) g.fillRect(x, Hh - 5, Math.max(3, ((h.b - h.a) / D.len) * W), 5);
  }
  g.globalAlpha = 1;
}
async function hitsPlay(key, idx = null) {
  const s = S.byId[HT.id], it = hitItems().find((x) => x.key === key); if (!s || !it) return;
  const h = idx != null ? HT.data.hits[idx] : it.rep;
  const a = hitAudio(await decodedOf(s), h);
  Player.play(a.channels, a.sampleRate);
}
async function hitsAdd() {
  const s = S.byId[HT.id]; if (!s || !HT.data) return;
  const items = hitItems().filter((it) => !HT.off[it.key]); if (!items.length) return;
  const d = await decodedOf(s), of = originalFormat(d), base = hitBaseName(s.name), folder = t('Extraídos') + '/' + base;
  const entries = items.map((it, j) => {
    const name = `${base} ${String(j + 1).padStart(2, '0')}.wav`, u8 = encodeOriginal(hitAudio(d, it.rep), of);
    return { name, path: `${folder}/${name}`, getFile: async () => new File([u8], name), it };
  });
  closeModal();
  const res = await importEntries(entries, t('Añadiendo golpes'));
  const byPath = new Map(entries.map((e) => [e.path, e.it])), done = [];
  for (const rec of res.added) {
    const it = byPath.get(rec.path); if (!it) continue;
    rec.from = { id: s.id, at: Math.round(it.rep.t * 1000) / 1000 };
    rec.user = { ...(rec.user || {}), kind: 'oneshot', cat: it.cat };
    done.push(rec);
  }
  if (done.length) await saveSamples(done);
  invalidateAll();
  HT.last = done.map((x) => x.id);
  const dup = res.dup.length ? ' ' + t('{n} ya estaban en la biblioteca.', { n: res.dup.length }) : '';
  toast(t('{n} golpes añadidos a la biblioteca, en «{f}».', { n: done.length, f: esc(folder) }) + dup + (done.length ? ` <button class="btn small ghost" data-act="hits-show">${t('Verlos')}</button>` : ''), done.length ? 'ok' : 'warn', 9000);
  renderAll();
}
function hitsShow() {
  const ids = HT.last.filter((id) => S.byId[id]); if (!ids.length) return;
  S.multi = new Set(ids); S.f = { ...S.f, flag: 'sel' }; S.sel = ids[0]; S.view = 'library'; renderAll();
}
// En la ficha: de qué loop sale un golpe
function fromHTML(s) {
  const f = s && s.from, src = f && S.byId[f.id];
  if (!f) return '';
  return ` · ${t('golpe sacado de')} ${src ? `<button class="btn small ghost" data-act="sel" data-id="${src.id}">«${esc(hitBaseName(src.name))}»</button>` : t('un loop que ya no está')} <span class="dim">(${nf(f.at, 2)} s)</span>`;
}

// ======================================================================
// Afinar
// ======================================================================
function tuneRowHTML(s) {
  const r = s.recipe || {}, m = measuredMidi(s.analysis), tu = r.tune || 0, key = S.pack?.key, loop = isLoopSample(s);
  const parts = [`<input type="number" data-rc="tune" value="${tu ? rnd2(tu) : ''}" placeholder="0" step="0.01" min="-12" max="12" style="width:72px"> ${t('semitonos')}`];
  if (m != null) {
    parts.push(`<span class="muted">${pitchLabel(m)}${tu ? ` → <b>${pitchLabel(m + tu)}</b>` : ''}</span>`);
    if (Math.abs(shiftToSemitone(m)) >= 0.05 && Math.abs(tu - shiftToSemitone(m)) > 0.004) parts.push(`<button class="btn small ghost" data-act="tune-semi" title="${t('Corregir los cents: al semitono más cercano')}">${t('Al semitono')}</button>`);
    if (key != null && Math.abs(tu - shiftToPc(m, key)) > 0.004) parts.push(`<button class="btn small ghost" data-act="tune-root" title="${t('Al {k} más cercano (tono del pack)', { k: PITCH_CLASSES[key] })}">${t('A la tónica ({k})', { k: PITCH_CLASSES[key] })}</button>`);
  } else parts.push(`<span class="muted">${t('sin tono claro: se puede afinar a mano')}</span>`);
  if (tu) parts.push(`<span class="${loop ? 'warn' : 'dim'}">${loop ? t('en un loop también cambia el tempo') : t('como en un sampler: más agudo, más corto')}</span>`);
  return parts.join(' ');
}
async function tuneSample(s, how) {
  const m = measuredMidi(s && s.analysis); if (m == null) return;
  const v = how === 'root' ? (S.pack?.key != null ? shiftToPc(m, S.pack.key) : null) : shiftToSemitone(m);
  if (v == null) return;
  s.recipe = { ...(s.recipe || {}) };
  if (Math.abs(v) < 0.005) delete s.recipe.tune; else s.recipe.tune = v;
  await saveSample(s); renderDetail();
}
function packSoundHTML(p) {
  return `<label class="inl" title="${t('Tónica de los temas que harás con este pack: para afinar bombos, toms y bajos')}">${t('Tono')} <select id="packkey"><option value="">—</option>${PITCH_CLASSES.map((n, i) => `<option value="${i}" ${p.key === i ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <button class="btn small" data-act="snd-tune" title="${t('Afinar los samples del pack al tono')}">♪ ${t('Afinar…')}</button>
    <button class="btn small" data-act="snd-level" title="${t('Que todos los samples de cada página suenen igual de fuerte')}">≋ ${t('Igualar volumen…')}</button>`;
}
const TU = { root: null, mode: 'root', off: {}, undo: null };
function packItems() {
  const p = S.pack, seen = new Set(), out = [];
  if (!p) return out;
  p.slots.forEach((id, i) => { const s = id && S.byId[id]; if (!s || seen.has(id)) return; seen.add(id); out.push({ slot: i, s }); });
  return out;
}
function tuneModal() {
  const p = S.pack; if (!p) return;
  if (TU.root == null) TU.root = p.key ?? (S.pat?.opts?.root != null ? S.pat.opts.root % 12 : 5);
  const its = packItems(), plan = tunePlan(its.map(({ s }) => ({ id: s.id, cat: clsOf(s).cat, midi: measuredMidi(s.analysis), loop: isLoopSample(s), tune: s.recipe?.tune || 0 })), { root: TU.root, mode: TU.mode });
  const by = Object.fromEntries(plan.map((x) => [x.id, x])), cnt = (st) => plan.filter((x) => x.status === st).length;
  const rows = its.filter(({ s }) => by[s.id].status === 'change');
  const on = rows.filter(({ s }) => !TU.off[s.id]).length;
  modal(`<div class="hitbox"><h2>${t('Afinar «{p}»', { p: esc(p.name) })}</h2>
    <div class="row" style="gap:12px;margin-bottom:8px">
      <label class="inl">${t('Tónica')} <select id="tu-root">${PITCH_CLASSES.map((n, i) => `<option value="${i}" ${TU.root === i ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="inl">${t('Qué afinar')} <select id="tu-mode">${[['root', t('Bombos, toms y bajos a la tónica; el resto, al semitono')], ['allroot', t('Todo lo que tiene nota, a la tónica')], ['cents', t('Solo corregir los cents')]].map(([k, l]) => `<option value="${k}" ${TU.mode === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    ${rows.length ? `<div class="hitlist"><table class="tunet"><tr><th></th><th>${t('Slot')}</th><th>${t('Sample')}</th><th>${t('Categoría')}</th><th>${t('Nota')}</th><th>${t('Cambio')}</th><th>${t('Duración')}</th><th></th></tr>
      ${rows.map(({ slot, s }) => { const x = by[s.id], d0 = sampleSeconds({ ...s, recipe: { ...(s.recipe || {}), tune: 0 } }); return `<tr class="${TU.off[s.id] ? 'off' : ''}"><td><input type="checkbox" data-tk="${s.id}" ${TU.off[s.id] ? '' : 'checked'}></td><td class="mono">${slot + 1}</td><td>${esc(shortName(s.name))}</td><td><span style="color:${catVar(clsOf(s).cat)}">${catLabel(clsOf(s).cat)}</span></td>
        <td>${pitchLabel(x.from)} → <b>${pitchLabel(x.to)}</b></td><td class="mono">${signed(x.shift)} st</td><td class="mono dim">${fmtDur(d0 / tuneRatio(x.shift))}</td><td><button class="btn small" data-act="snd-tune-play" data-id="${s.id}" data-v="${x.shift}" title="${t('Escuchar afinado')}">▶</button></td></tr>`; }).join('')}</table></div>`
      : `<p class="ok">${t('Nada que afinar con esta tónica.')}</p>`}
    <p class="note">${[cnt('ok') + cnt('same') ? t('{n} ya están afinados', { n: cnt('ok') + cnt('same') }) : '', cnt('nopitch') ? t('{n} sin tono claro (charles, platos, ruido…)', { n: cnt('nopitch') }) : '', cnt('loop') ? t('{n} loops: no se afinan, cambiaría su tempo', { n: cnt('loop') }) : ''].filter(Boolean).join(' · ')}</p>
    <p class="note">${t('Se afina como en un sampler: más agudo es más rápido y más corto. Queda en la preparación de cada sample (Afinación) y se puede cambiar o quitar ahí. La tónica se guarda como tono del pack.')}</p>
    <div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn" data-act="modal-close">${t('Cancelar')}</button><button class="btn primary" data-act="snd-tune-go" ${on ? '' : 'disabled'}>${t('Afinar {n}', { n: on })}</button></div></div>`);
}
async function tuneApply() {
  const p = S.pack; if (!p) return;
  const its = packItems(), plan = tunePlan(its.map(({ s }) => ({ id: s.id, cat: clsOf(s).cat, midi: measuredMidi(s.analysis), loop: isLoopSample(s), tune: s.recipe?.tune || 0 })), { root: TU.root, mode: TU.mode });
  const prev = [], list = [];
  for (const x of plan) {
    if (x.status !== 'change' || TU.off[x.id]) continue;
    const s = S.byId[x.id]; prev.push([s.id, s.recipe?.tune]);
    s.recipe = { ...(s.recipe || {}) }; if (x.shift) s.recipe.tune = x.shift; else delete s.recipe.tune;
    list.push(s);
  }
  TU.undo = { prev, key: p.key };
  p.key = TU.root; await savePack(p);
  if (list.length) await saveSamples(list);
  closeModal(); invalidateAll(); renderAll();
  toast(t('{n} samples afinados a {k}.', { n: list.length, k: PITCH_CLASSES[TU.root] }) + ` <button class="btn small ghost" data-act="snd-undo">${t('Deshacer')}</button>`, 'ok', 9000);
}

// ======================================================================
// Igualar el volumen percibido (por página = por pista)
// ======================================================================
const LV = { pages: null, off: {}, undo: null };
async function levelModal() {
  const p = S.pack; if (!p) return;
  const its = packItems(); if (!its.length) { toast(t('El pack está vacío.'), 'warn'); return; }
  modal(`<div class="hitbox"><h2>${t('Igualar el volumen de «{p}»', { p: esc(p.name) })}</h2><p class="muted" id="lv-prog">${t('Midiendo…')}</p></div>`);
  const L = {};
  for (let i = 0; i < its.length; i++) {
    const s = its[i].s;
    try { const r = render(await decodedOf(s), { ...recipeOf(s), normalize: 'peak' }); L[s.id] = loudnessMax(r.data, r.rate); } catch { L[s.id] = -Infinity; }
    const el = document.getElementById('lv-prog'); if (el) el.textContent = t('Midiendo {i} de {n}…', { i: i + 1, n: its.length });
    if (i % 3 === 2) await yieldUI();
  }
  const pages = [];
  for (let pg = 0; pg < p.slots.length / PAGE; pg++) {
    const items = its.filter(({ slot }) => Math.floor(slot / PAGE) === pg).map(({ s }) => ({ id: s.id, lufs: L[s.id] }));
    if (items.length < 2) continue;
    const cats = {}; for (const { id } of items) { const c = clsOf(S.byId[id]).cat || ''; cats[c] = (cats[c] || 0) + 1; }
    const top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0][0];
    pages.push({ pg, cat: top, match: matchGroup(items) });
  }
  LV.pages = pages;
  levelPaint();
}
function levelPaint() {
  const p = S.pack; if (!p || !LV.pages) return;
  const on = LV.pages.filter((x) => !LV.off[x.pg] && x.match.target != null).length;
  const rows = LV.pages.map(({ pg, cat, match: m }) => {
    const down = m.items.filter((x) => x.cut > 0.25), low = m.items.filter((x) => x.low > 0.25);
    return `<div class="hitrow ${LV.off[pg] ? 'off' : ''}" style="flex-wrap:wrap">
      <input type="checkbox" data-lp="${pg}" ${LV.off[pg] ? '' : 'checked'}>
      <b>${t('Página {n}', { n: pg + 1 })}</b> <span style="color:${catVar(cat)}">${catLabel(cat)}</span>
      <span class="muted">${t('{n} samples', { n: m.items.length })} · ${m.target != null ? `${t('objetivo')} <b class="mono">${nf(m.target, 1)} LUFS</b> · ${down.length ? t('{n} bajan (hasta {d} dB)', { n: down.length, d: nf(Math.max(...down.map((x) => x.cut)), 1) }) : t('ya suenan igual')}` : '—'}</span>
      ${low.length ? `<span class="warn">${t('{n} se quedan más bajos: no pueden subir sin saturar', { n: low.length })}</span>` : ''}
      <details class="lvdet"><summary>${t('ver')}</summary><table class="tunet">${m.items.map((x) => `<tr><td>${esc(shortName(S.byId[x.id].name))}</td><td class="mono">${nf(x.from, 1)}</td><td class="mono">→ ${nf(x.to, 1)} LUFS</td><td class="mono ${x.low > 0.25 ? 'warn' : 'dim'}">${x.cut > 0.05 ? '−' + nf(x.cut, 1) + ' dB' : x.low > 0.25 ? t('{d} dB por debajo', { d: nf(x.low, 1) }) : ''}</td></tr>`).join('')}</table></details>
    </div>`;
  }).join('');
  modal(`<div class="hitbox"><h2>${t('Igualar el volumen de «{p}»', { p: esc(p.name) })}</h2>
    <p class="note" style="margin-top:0">${t('En la Rhythm cada página suele ser una pista. Si todos sus samples suenan igual de fuertes, puedes cambiar de sample en directo sin tocar el nivel. Se mide el volumen percibido (LUFS, el máximo en ventanas de 400 ms) y los más fuertes bajan hasta el más flojo; nada sube por encima de su pico.')}</p>
    ${LV.pages.length ? `<div class="hitlist">${rows}</div>` : `<p class="muted">${t('Hace falta al menos una página con dos samples.')}</p>`}
    <p class="note">${t('Queda en la preparación de cada sample (Nivel → volumen percibido) y vale para todos los packs donde esté.')}</p>
    <div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn" data-act="modal-close">${t('Cancelar')}</button><button class="btn primary" data-act="snd-level-go" ${on ? '' : 'disabled'}>${t('Igualar {n} páginas', { n: on })}</button></div></div>`);
}
async function levelApply() {
  if (!LV.pages) return;
  const prev = [], list = [];
  for (const { pg, match: m } of LV.pages) {
    if (LV.off[pg] || m.target == null) continue;
    for (const x of m.items) {
      const s = S.byId[x.id]; if (!s) continue;
      prev.push([s.id, s.recipe?.normalize, s.recipe?.targetLufs]);
      s.recipe = { ...(s.recipe || {}), normalize: 'loud', targetLufs: Math.round(m.target * 10) / 10 };
      list.push(s);
    }
  }
  LV.undo = prev; TU.undo = null;
  if (list.length) await saveSamples(list);
  closeModal(); invalidateAll(); renderAll();
  toast(t('Volumen igualado en {n} samples.', { n: list.length }) + ` <button class="btn small ghost" data-act="snd-undo">${t('Deshacer')}</button>`, 'ok', 9000);
}
async function soundUndo() {
  const list = [];
  if (TU.undo) {
    for (const [id, v] of TU.undo.prev) { const s = S.byId[id]; if (!s) continue; s.recipe = { ...(s.recipe || {}) }; if (v == null) delete s.recipe.tune; else s.recipe.tune = v; list.push(s); }
    if (S.pack) { if (TU.undo.key == null) delete S.pack.key; else S.pack.key = TU.undo.key; await savePack(S.pack); }
    TU.undo = null;
  } else if (LV.undo) {
    for (const [id, n, l] of LV.undo) { const s = S.byId[id]; if (!s) continue; s.recipe = { ...(s.recipe || {}) }; if (n == null) delete s.recipe.normalize; else s.recipe.normalize = n; if (l == null) delete s.recipe.targetLufs; else s.recipe.targetLufs = l; list.push(s); }
    LV.undo = null;
  }
  if (list.length) await saveSamples(list);
  invalidateAll(); renderAll(); toast(t('Deshecho.'), 'ok', 3000);
}

Object.assign(ACT, {
  'hits-open': (el) => hitsOpen(sOf(el)),
  'hits-sens': (el) => { HT.sens = el.dataset.v; HT.off = {}; HT.cats = {}; HT.reps = {}; hitsOpen(S.byId[HT.id]); },
  'hits-play': (el) => hitsPlay(el.dataset.k),
  'hits-rep': (el) => { HT.reps[el.dataset.k] = +el.dataset.i; hitsPaint(); hitsPlay(el.dataset.k, +el.dataset.i); },
  'hits-add': () => hitsAdd(),
  'hits-show': () => hitsShow(),
  'tune-semi': () => tuneSample(current(), 'semi'),
  'tune-root': () => tuneSample(current(), 'root'),
  'snd-tune': () => { TU.off = {}; TU.root = null; tuneModal(); },
  'snd-tune-play': async (el) => { const s = S.byId[el.dataset.id]; if (!s) return; const r = render(await decodedOf(s), { ...recipeOf(s), tune: +el.dataset.v }); Player.play([r.data], r.rate, { quant16: true }); },
  'snd-tune-go': () => tuneApply(),
  'snd-level': () => { LV.off = {}; levelModal(); },
  'snd-level-go': () => levelApply(),
  'snd-undo': () => soundUndo(),
});
document.addEventListener('change', async (ev) => {
  const el = ev.target;
  if (el.id === 'packkey' && S.pack) { if (el.value === '') delete S.pack.key; else S.pack.key = +el.value; await savePack(S.pack); renderAll(); }
  else if (el.id === 'tu-root') { TU.root = +el.value; tuneModal(); }
  else if (el.id === 'tu-mode') { TU.mode = el.value; tuneModal(); }
  else if (el.dataset.tk) { TU.off[el.dataset.tk] = !el.checked; tuneModal(); }
  else if (el.dataset.lp != null) { LV.off[+el.dataset.lp] = !el.checked; levelPaint(); }
  else if (el.id === 'hits-group') { HT.group = el.checked; hitsPaint(); }
  else if (el.dataset.hk) { HT.off[el.dataset.hk] = !el.checked; hitsPaint(); }
  else if (el.dataset.hcat) { HT.cats[el.dataset.hcat] = el.value; hitsPaint(); }
});
