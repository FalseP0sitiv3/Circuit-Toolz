// ui/app_short.js — acortar loops repetitivos por slices: en la ficha (01 Biblioteca y 02 Escucha) y en
// bloque (01 Biblioteca → Acortar loops). Ver core/shorten.js.
import { repetition, applyKeep, parseSel, selText, validKeep, keepIsIdentity, keepFraction, REPEAT_HIGH } from '../core/shorten.js';
import { regionMono, render, DEFAULT_RECIPE } from '../core/dsp.js';
import { sampleSeconds, rawSeconds, isLoopSample, MAX_TOTAL_S, budget } from '../core/pack.js';

const REP_V = 1;
function keepActive(s) { return !!keepOf(s); }
// zona de slices en la onda original (s): inicio y longitud (ajustada al compás si hace falta)
function sliceRegion(s) {
  const tv = trimView(s);
  return { st: tv.st, len: regionSec(s) };
}
// posición en lo exportado (s) → posición en el original, con slices elegidas
function keepMap(s) {
  const k = keepOf(s); if (!k) return null;
  const R = sliceRegion(s), w = R.len / k.n, rev = recipeOf(s).reverse, out = w * k.sel.length;
  return (pos) => { if (rev) pos = out - pos; const j = Math.max(0, Math.min(k.sel.length - 1, Math.floor(pos / w))); return R.st + k.sel[j] * w + (pos - j * w); };
}
const keepOf = (s) => (validKeep(s?.recipe?.keep) && !keepIsIdentity(s.recipe.keep) ? s.recipe.keep : null);
// ¿se ofrece acortar? loops, o cualquier sample con tempo medido y al menos ~1 s
function canShorten(s) {
  const a = s?.analysis || {};
  if (!s || a.error || a.silent) return false;
  return isLoopSample(s) || !!keepOf(s) || (a.loopBpm && (a.activeDur || 0) >= 1);
}
// segundos de la zona de slices (recortada y ajustada al compás, sin acortar ni tope)
function regionSec(s) { return rawSeconds({ ...s, recipe: { ...(s.recipe || {}), keep: null } }); }
const secNoKeep = (s) => sampleSeconds({ ...s, recipe: { ...(s.recipe || {}), keep: null } });
function repKey(s) { const r = recipeOf(s); return JSON.stringify([REP_V, r.mono, r.autoTrim, r.thresholdDb, r.trimStart ?? null, r.trimEnd ?? null, r.fitSec ?? null]); }
// tiempos del loop: BPM del nombre, del ajuste al compás o medido; solo si la duración encaja con tiempos enteros
function beatsOf(s, sec) {
  const a = s.analysis || {};
  const bpms = [s.info?.bpm, a.loopBpm && Math.abs(a.loopBpm - Math.round(a.loopBpm)) < 0.6 ? Math.round(a.loopBpm) : a.loopBpm].filter(Boolean);
  for (const bpm of bpms) {
    const b = (sec * bpm) / 60, rb = Math.round(b);
    if (rb >= 2 && Math.abs(b - rb) <= Math.max(0.06, rb * 0.015)) return { beats: rb, bpm };
  }
  return { beats: null, bpm: bpms[0] || null };
}

const REP_PENDING = new Map();
async function repOf(s) {
  const key = repKey(s);
  if (s.rep && s.rep.key === key) return s.rep;
  if (REP_PENDING.has(s.id + key)) return REP_PENDING.get(s.id + key);
  const job = (async () => {
    const reg = regionMono(await decodedOf(s), recipeOf(s));
    const sec = reg.x.length / reg.sr, bb = beatsOf(s, sec);
    const res = repetition(reg.x, reg.sr, { beats: bb.beats });
    s.rep = { key, sec, beats: bb.beats, bpm: bb.bpm, options: res.options, parts: res.parts };
    try { await S.lib.put('samples', clean(s)); } catch {}
    return s.rep;
  })();
  REP_PENDING.set(s.id + key, job);
  try { return await job; } finally { REP_PENDING.delete(s.id + key); }
}

// ---------- textos ----------
function partName(n, beats) {
  const pb = beats ? beats / n : null;
  if (pb && pb % 4 === 0) return { bars: pb / 4, total: beats / 4 };
  return null;
}
function optLabel(o, beats) {
  const n = o.keep.n, B = partName(n, beats);
  if (o.kind === 'fill') {
    if (B) return B.bars === 1 ? t('el compás 1 y el último de {t} (con su remate)', { t: B.total }) : t('los compases 1–{a} y los {a} últimos de {t} (con su remate)', { a: B.bars, t: B.total });
    return t('la 1.ª parte y la última de {n} (con su remate)', { n });
  }
  if (B) return B.bars === 1 ? t('el compás 1 de {t}', { t: B.total }) : t('los compases 1–{a} de {t}', { a: B.bars, t: B.total });
  return { 2: t('la 1.ª mitad'), 4: t('el 1.er cuarto'), 8: t('el 1.er octavo') }[n] || t('slice 1 de {n}', { n });
}
function simLabel(o) {
  const p = nf(o.sim * 100, 0);
  if (o.identical) return `<span class="ok">${t('idénticas')}</span>`;
  if (o.sim >= REPEAT_HIGH) return `<span class="ok">${t('se repite')}</span> <span class="dim mono">${p} %</span>`;
  return `<span class="warn">${t('parecidas, con variaciones')}</span> <span class="dim mono">${p} %</span>`;
}
const keyOf = (k) => (k ? k.n + ':' + k.sel.join('.') : 'orig');
const sameKeep = (a, b) => keyOf(a) === keyOf(b);

// ---------- escucha en bucle ----------
async function playLoop(s, keep) {
  const key = 'sh|' + s.id + '|' + keyOf(keep);
  if (Player.playing && Player.key === key) { Player.stop(); paintShort(); return; }
  try {
    const rec = { ...recipeOf(s), keep: keep || null };
    const ck = s.id + '|' + JSON.stringify(rec);
    let r = S.renCache.get(ck);
    if (!r) { r = render(await decodedOf(s), rec); lru(S.renCache, ck, r, 40); }
    Player.play([r.data], 48000, { key, quant16: true, loop: true, playbackRate: Math.pow(2, (S.tune || 0) / 12), onEnd: paintShort });
    Player.map = null;
    paintShort();
  } catch (e) { toast(esc(errT(e.message)), 'bad'); }
}
const playingKey = (s, keep) => Player.playing && Player.key === 'sh|' + s.id + '|' + keyOf(keep);
const loopBtn = (s, keep, label, extra = '') => `<button class="btn small ${playingKey(s, keep) ? 'on' : ''}" data-act="sh-loop" data-id="${s.id}" data-k="${keyOf(keep)}" ${extra}>${playingKey(s, keep) ? '■' : '⟳'} ${label}</button>`;
const parseK = (v) => { if (!v || v === 'orig') return null; const [n, sel] = v.split(':'); return { n: +n, sel: sel.split('.').map(Number) }; };

// ---------- ficha: panel «Acortar» ----------
function editOf(s) {
  if (S.kEdit?.id === s.id) return S.kEdit;
  const k = keepOf(s);
  const best = s.rep?.options?.[0];
  const n = k ? k.n : best ? best.keep.n : S.slices || 4;
  S.kEdit = { id: s.id, n, sel: k ? k.sel.slice() : Array.from({ length: n }, (_, i) => i) };
  return S.kEdit;
}
function shortHTML(s) {
  if (!canShorten(s)) return '';
  return `<div class="panel shortp" id="shortp" style="margin-top:12px">${shortInner(s)}</div>`;
}
function shortInner(s) {
  const k = keepOf(s), rep = s.rep && s.rep.key === repKey(s) ? s.rep : null;
  const now = secNoKeep(s);
  const head = `<h2>${t('Acortar')} <span class="dim" style="font-weight:400">${t('para que ocupe menos de los 228 s del pack')}</span></h2>`;
  let cur = '';
  if (k) {
    const d = sampleSeconds(s);
    cur = `<div class="shcur"><b>${t('Acortado')}:</b> ${t('slices {s} de {n}', { s: selText(k.sel), n: k.n })} · ${fmtDur(d)} <span class="dim">${t('(antes {d})', { d: fmtDur(now) })}</span> · <span class="ok">${t('ahorra {s} s', { s: nf(now - d, 2) })}</span>
      ${loopBtn(s, k, t('Escuchar en bucle'))} <button class="btn small ghost" data-act="sh-off" data-id="${s.id}">${t('Quitar')}</button></div>`;
  }
  let props;
  if (!rep) props = `<p class="muted" id="sh-wait">${t('Mirando si se repite…')}</p>`;
  else if (!rep.options.length) props = `<p class="muted">${t('No se repite lo bastante para acortarlo sin cambiar el loop. Puedes elegir slices a mano.')}</p>`;
  else {
    props = `<table class="t shopts">${rep.options.slice(0, 4).map((o, i) => {
      const d = now * o.frac, on = sameKeep(k, o.keep);
      return `<tr class="${on ? 'on' : ''}"><td>${t('Quedarse con {p}', { p: optLabel(o, rep.beats) })}</td><td>${simLabel(o)}</td>
        <td class="mono">${fmtDur(d)}</td><td class="ok mono">−${nf(now - d, 2)} s</td>
        <td class="acts">${loopBtn(s, o.keep, t('Escuchar'))}${on ? `<span class="ok">✓</span>` : `<button class="btn small ${i === 0 && o.sim >= REPEAT_HIGH ? 'primary' : ''}" data-act="sh-use" data-id="${s.id}" data-k="${keyOf(o.keep)}">${t('Usar')}</button>`}</td></tr>`;
    }).join('')}</table>
    ${rep.options[0].kind === 'fill' ? `<p class="note">${t('El último compás cambia (un remate o fill): se conserva al final, así el loop sigue cerrando igual.')}</p>` : ''}`;
  }
  const E = editOf(s);
  const P = rep?.parts?.[E.n];
  const chips = Array.from({ length: E.n }, (_, i) => {
    const sim = P ? (i === 0 ? null : P.toFirst[i - 1]) : null;
    const pos = E.sel.map((v, j) => (v === i ? j + 1 : null)).filter(Boolean);
    return `<button class="shchip ${pos.length ? 'on' : ''}" data-act="sh-chip" data-i="${i}" title="${t('Slice {i}', { i: i + 1 })}${sim != null ? ' · ' + t('parecido con la 1: {p} %', { p: nf(sim * 100, 0) }) : ''}">${i + 1}${sim != null ? `<small class="${sim >= REPEAT_HIGH ? 'ok' : sim >= 0.8 ? '' : 'dim'}">${nf(sim * 100, 0)}</small>` : ''}</button>`;
  }).join('');
  const valid = validKeep({ n: E.n, sel: E.sel }), ident = valid && keepIsIdentity({ n: E.n, sel: E.sel });
  const ed = valid ? { n: E.n, sel: E.sel.slice() } : null;
  const manual = `<div class="shman"><span class="lbl">${t('A mano')}</span>
    <label class="inl">${t('Dividir en')} <select data-sh="n">${[2, 4, 8, 16].map((n) => `<option value="${n}" ${E.n === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <span class="shchips">${chips}</span>
    <label class="inl">${t('Orden')} <input type="text" data-sh="txt" value="${esc(E.txt ?? selText(E.sel))}" style="width:120px" placeholder="1-4, 7 8" spellcheck="false"></label>
    ${ed && !ident ? `${loopBtn(s, ed, t('Escuchar'))}<button class="btn small" data-act="sh-apply" data-id="${s.id}" ${sameKeep(k, ed) ? 'disabled' : ''}>${t('Usar estas slices')}</button> <span class="dim">${fmtDur(now * E.sel.length / E.n)}</span>` : `<span class="dim">${valid ? t('todas las slices: queda igual') : t('elige al menos una slice')}</span>`}</div>`;
  return `${head}${cur}${splitHTML(s)}${props}${manual}
    <p class="note" style="margin-bottom:0">${t('Las slices se cuentan sobre la zona útil del loop, como en la Rhythm. En cada unión y al volver al principio hay un fundido cruzado de 2–3 ms para que no haga clic. El original no se toca: se aplica al exportar.')} ${k && rep?.bpm ? t('En la Rhythm, el Beat Match pasa a {s} pasos.', { s: Math.round((sampleSeconds(s) * rep.bpm) / 15) }) : ''}</p>
    ${loopBtn(s, null, t('Original en bucle'), 'style="margin-top:6px"')}`;
}
function paintShort() {
  const el = document.getElementById('shortp'), s = current();
  if (el && s && canShorten(s)) { el.innerHTML = shortInner(s); }
  if (S.view === 'library' && S.libMode === 'short') paintShortMode();
}
// llamado tras pintar la ficha
function afterDetail(s) {
  if (s) monoEnsure(s);
  if (!s || !canShorten(s)) return;
  if (s.rep && s.rep.key === repKey(s)) return;
  repOf(s).then(() => { if (current() === s) { if (S.kEdit?.id === s.id && !keepOf(s)) S.kEdit = null; paintShort(); } }).catch((e) => {
    const w = document.getElementById('sh-wait'); if (w) w.textContent = errT(e.message);
  });
}
async function setKeep(s, keep) {
  s.recipe = { ...(s.recipe || {}) };
  if (keep && validKeep(keep) && !keepIsIdentity(keep)) s.recipe.keep = { n: keep.n, sel: keep.sel.slice() }; else delete s.recipe.keep;
  S.kEdit = null; Player.stop();
  await saveSample(s);
  await afterKeepChange(s);
  if (S.view === 'library' && (S.libMode || 'list') === 'list' && typeof paintList === 'function') paintList();
}

// ---------- en bloque: 01 Biblioteca → Acortar loops ----------
function shortScope() {
  const sc = S.shortScope || (S.pack ? 'pack' : 'filter');
  let list;
  if (sc === 'pack' && S.pack) list = [...new Set(S.pack.slots.filter(Boolean))].map((id) => S.byId[id]).filter(Boolean);
  else if (sc === 'sel') list = [...S.multi].map((id) => S.byId[id]).filter(Boolean);
  else if (sc === 'all') list = S.samples;
  else list = filtered();
  return { sc, list: list.filter((s) => canShorten(s) && !s.user?.discard) };
}
function shortModeHTML() {
  const { sc, list } = shortScope(), R = S.shortRun;
  const scopes = [...(S.pack ? [['pack', t('Loops del pack «{p}»', { p: esc(S.pack.name) })]] : []), ['filter', t('Lista filtrada')], ...(S.multi.size ? [['sel', t('Selección ({n})', { n: S.multi.size })]] : []), ['all', t('Toda la biblioteca')]];
  const rows = list.map((s) => ({ s, rep: s.rep && s.rep.key === repKey(s) ? s.rep : null }));
  const done = rows.filter((r) => r.rep), withOpt = done.filter((r) => r.rep.options.length);
  const pick = S.shortPick || (S.shortPick = {});
  const chosen = (r) => { const p = pick[r.s.id]; if (p === 'none') return null; if (p) return parseK(p); const o = r.rep.options[0]; return o && o.sim >= REPEAT_HIGH && !keepOf(r.s) ? o.keep : null; };
  // ahorro respecto a como está ahora (si ya estaba acortado, cuenta la diferencia)
  const save = withOpt.reduce((a, r) => { const k = chosen(r); if (!k || sameKeep(k, keepOf(r.s))) return a; return a + (sampleSeconds(r.s) - Math.min(30, secNoKeep(r.s) * keepFraction(k))); }, 0);
  const nApply = withOpt.filter((r) => { const k = chosen(r); return k && !sameKeep(k, keepOf(r.s)); }).length;
  let packLine = '';
  if (sc === 'pack' && S.pack) { const b = budget(S.pack, S.byId); packLine = `<span class="muted">${t('El pack ocupa {a} s de {m} s', { a: nf(b.total, 1), m: MAX_TOTAL_S })}${save > 0 ? ` → <b class="ok">${nf(b.total - save, 1)} s</b>` : ''}</span>`; }
  const tr = (r) => {
    const s = r.s, k = keepOf(s), now = sampleSeconds(s), base = secNoKeep(s);
    const opts = r.rep ? r.rep.options : [];
    const ck = r.rep ? chosen(r) : null;
    const sel = r.rep && opts.length ? `<select data-sh="pick" data-id="${s.id}"><option value="none" ${!ck ? 'selected' : ''}>${k ? t('dejarlo como está') : t('no acortar')}</option>${opts.slice(0, 4).map((o) => `<option value="${keyOf(o.keep)}" ${ck && sameKeep(ck, o.keep) ? 'selected' : ''}>${esc(optLabel(o, r.rep.beats))} · ${o.identical ? t('idénticas') : nf(o.sim * 100, 0) + ' %'}</option>`).join('')}</select>` : '';
    const after = ck ? Math.min(30, base * keepFraction(ck)) : now;
    const o = ck && opts.find((x) => sameKeep(x.keep, ck));
    return `<tr class="${ck && !sameKeep(ck, k) ? 'on' : ''}"><td class="nmc"><button class="lnk" data-act="o-open" data-id="${s.id}">${esc(s.name)}</button>${k ? ` <span class="dim">✂ ${esc(selText(k.sel))}/${k.n}</span>` : ''}</td>
      <td class="mono">${fmtDur(now)}</td>
      <td>${!r.rep ? `<span class="dim">${R ? t('en cola') : t('sin analizar')}</span>` : opts.length ? sel : `<span class="dim">${t('no se repite')}</span>`}</td>
      <td>${o ? simLabel(o) : ''}</td>
      <td class="mono">${ck && !sameKeep(ck, k) ? `${fmtDur(after)} <span class="ok">−${nf(now - after, 2)}</span>` : ''}</td>
      <td class="acts">${ck ? loopBtn(s, ck, t('Escuchar')) : ''}${loopBtn(s, null, t('original'))}</td></tr>`;
  };
  const shown = rows.slice().sort((a, b) => (b.rep?.options.length ? 1 : 0) - (a.rep?.options.length ? 1 : 0) || a.s.name.localeCompare(b.s.name)).slice(0, 300);
  return `<div class="rean shortmode"><section class="panel"><h2>${t('Acortar loops')}</h2>
    <p class="note" style="margin-top:0">${t('Busca loops que se repiten (las dos mitades, o los cuatro compases, suenan igual) y propone quedarse con una parte: suenan igual en la Rhythm y ocupan la mitad o menos de los 228 s del pack. Si el último compás trae un remate, se conserva. Nada se aplica sin que lo elijas, y el original no se toca.')}</p>
    <div class="row"><span class="seg">${scopes.map(([k, l]) => `<button class="${sc === k ? 'on' : ''}" data-act="sh-scope" data-v="${k}">${l}</button>`).join('')}</span><span class="grow"></span>
      ${R ? `<span class="muted">${t('Analizando {i} de {n}…', { i: R.i, n: R.n })}</span> <button class="btn small" data-act="sh-cancel">${t('Parar')}</button>` : `<button class="btn" data-act="sh-scan" ${list.length && done.length < list.length ? '' : 'disabled'}>${done.length && done.length < list.length ? t('Analizar los {n} que faltan', { n: list.length - done.length }) : t('Analizar {n} loops', { n: list.length })}</button>`}</div>
    <div class="row" style="margin-top:8px"><span class="muted">${t('{n} loops · {a} analizados · {r} se pueden acortar', { n: list.length, a: done.length, r: withOpt.length })}</span><span class="grow"></span>${packLine}
      <button class="btn primary" data-act="sh-apply-all" ${nApply ? '' : 'disabled'}>${nApply ? t('Acortar {n} · ahorra {s} s', { n: nApply, s: nf(save, 1) }) : t('Nada que acortar')}</button>
      ${S.shortUndo?.length ? `<button class="btn small" data-act="sh-undo">${t('Deshacer')}</button>` : ''}</div>
    ${list.length ? `<table class="t otab shtab"><tr class="th"><th>${t('Loop')}</th><th>${t('Ahora')}</th><th>${t('Propuesta')}</th><th>${t('Parecido')}</th><th>${t('Después')}</th><th></th></tr>${shown.map(tr).join('')}</table>${rows.length > 300 ? `<p class="muted">${t('… y {n} más', { n: rows.length - 300 })}</p>` : ''}` : `<p class="muted">${t('No hay loops aquí. Los loops son los de categoría Drum loop o Melodic loop, o los que tienen tempo medido.')}</p>`}
  </section></div>`;
}
function paintShortMode() {
  const box = document.querySelector('.shortmode'); if (!box) return;
  const y = window.scrollY; box.outerHTML = shortModeHTML(); window.scrollTo(0, y);
}
async function shortScan() {
  const { list } = shortScope();
  const todo = list.filter((s) => !(s.rep && s.rep.key === repKey(s)));
  if (!todo.length) return;
  const R = (S.shortRun = { i: 0, n: todo.length, cancel: false, err: 0 });
  paintShortMode();
  for (const s of todo) {
    if (R.cancel) break;
    R.i++;
    try { await repOf(s); } catch { R.err++; }
    if (R.i % 3 === 0 || R.i === R.n) paintShortMode();
    await new Promise((r) => setTimeout(r, 0));
  }
  S.shortRun = null; paintShortMode();
  if (R.err) toast(t('{n} no se pudieron leer (¿carpeta sin reconectar?)', { n: R.err }), 'warn');
}

Object.assign(ACT, {
  'sh-from-pack': () => { S.shortScope = 'pack'; S.libMode = 'short'; go('library'); },
  'sh-loop': (el) => { const s = S.byId[el.dataset.id]; if (s) playLoop(s, parseK(el.dataset.k)); },
  'sh-use': async (el) => { const s = S.byId[el.dataset.id]; if (!s) return; await setKeep(s, parseK(el.dataset.k)); renderDetail(); toast(t('Acortado: {d} (ahorra {s} s)', { d: fmtDur(sampleSeconds(s)), s: nf(secNoKeep(s) - sampleSeconds(s), 2) })); },
  'sh-off': async (el) => { const s = S.byId[el.dataset.id]; if (!s) return; await setKeep(s, null); renderDetail(); },
  'sh-chip': (el) => {
    const s = current(); if (!s) return; const E = editOf(s), i = +el.dataset.i;
    E.sel = E.sel.includes(i) ? E.sel.filter((v) => v !== i) : [...E.sel, i].sort((a, b) => a - b);
    E.txt = null; paintShort();
  },
  'sh-apply': async (el) => {
    const s = S.byId[el.dataset.id]; if (!s) return; const E = editOf(s);
    if (!validKeep({ n: E.n, sel: E.sel })) return;
    await setKeep(s, { n: E.n, sel: E.sel }); renderDetail();
  },
  'sh-scope': (el) => { S.shortScope = el.dataset.v; Player.stop(); paintShortMode(); },
  'sh-scan': () => shortScan(),
  'sh-cancel': () => { if (S.shortRun) S.shortRun.cancel = true; },
  'sh-apply-all': async () => {
    const { list } = shortScope(), pick = S.shortPick || {};
    const changes = [];
    for (const s of list) {
      if (!(s.rep && s.rep.key === repKey(s)) || !s.rep.options.length) continue;
      const p = pick[s.id];
      const k = p === 'none' ? null : p ? parseK(p) : (s.rep.options[0].sim >= REPEAT_HIGH && !keepOf(s) ? s.rep.options[0].keep : null);
      if (!k || sameKeep(k, keepOf(s))) continue;
      changes.push({ s, prev: keepOf(s), k });
    }
    if (!changes.length) return;
    const before = changes.reduce((a, c) => a + sampleSeconds(c.s), 0);
    for (const c of changes) { c.s.recipe = { ...(c.s.recipe || {}), keep: { n: c.k.n, sel: c.k.sel.slice() } }; }
    await saveSamples(changes.map((c) => c.s));
    const after = changes.reduce((a, c) => a + sampleSeconds(c.s), 0);
    S.shortUndo = changes.map((c) => ({ id: c.s.id, prev: c.prev }));
    S.shortPick = {}; Player.stop(); paintShortMode();
    toast(`${t('{n} loops acortados: ahorras {s} s', { n: changes.length, s: nf(before - after, 1) })} <button class="btn small ghost" data-act="sh-undo">${t('Deshacer')}</button>`, 'ok', 8000);
  },
  'sh-undo': async () => {
    const u = S.shortUndo; if (!u?.length) return;
    const list = [];
    for (const x of u) { const s = S.byId[x.id]; if (!s) continue; s.recipe = { ...(s.recipe || {}) }; if (x.prev) s.recipe.keep = x.prev; else delete s.recipe.keep; list.push(s); }
    await saveSamples(list); S.shortUndo = null;
    if (S.view === 'library' && S.libMode === 'short') paintShortMode(); else renderView();
    toast(t('Deshecho: {n} loops como estaban', { n: list.length }));
  },
});
document.addEventListener('change', (ev) => {
  const el = ev.target; const k = el.dataset?.sh; if (!k) return;
  if (k === 'pick') { (S.shortPick ||= {})[el.dataset.id] = el.value; paintShortMode(); return; }
  const s = current(); if (!s) return; const E = editOf(s);
  if (k === 'n') { E.n = +el.value; E.sel = Array.from({ length: E.n }, (_, i) => i); E.txt = null; paintShort(); }
  else if (k === 'txt') { const sel = parseSel(el.value, E.n); if (sel) { E.sel = sel; E.txt = null; } else { E.txt = el.value; toast(t('Escribe números de slice del 1 al {n}, p. ej. «1-4» o «1 2 1 3»', { n: E.n }), 'warn'); } paintShort(); }
});
