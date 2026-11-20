// ui/app_org.js — v1.4: carpetas y subcarpetas, etiquetas, efectos detectados, palabras del nombre y reanálisis
// «por parecido». Vive dentro de 01 Biblioteca (Muestras · Reanalizar · Carpetas y etiquetas) y en la ficha del sample.
import { taxonomy, addSubfolder, renameSubfolder, moveSubfolder, removeSubfolder, resetTax, subLabelOf, proposeSub, detectTags, wordIndex, wordsOf, neighbourGuess, vecDist, TAG_PALETTE, PALETTE_GROUPS } from '../core/taxonomy.js';
import { featureVec } from '../core/map.js';
import { CATS } from '../core/classify.js';

const GROUP_LABEL = () => ({ fx: t('Efectos'), char: t('Carácter'), use: t('Uso') });
const taxOf = (cat) => taxonomy(S.set.tax, cat);
const subName = (cat, id) => { const l = subLabelOf(S.set.tax, cat, id); return l == null ? null : t(l); };
const tagName = (tag) => t(tag);
const tagsOf = (s) => (s.user && Array.isArray(s.user.tags) ? s.user.tags : []);
function palette() { const p = S.set.tagPal; return Object.fromEntries(PALETTE_GROUPS.map((g) => [g, p && Array.isArray(p[g]) ? p[g] : TAG_PALETTE[g]])); }
function allTags() {
  const n = new Map();
  for (const s of S.samples) for (const x of tagsOf(s)) n.set(x, (n.get(x) || 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
// categoría con la que se archiva un sample: la tuya o la propuesta con alguna pista
function catFor(s) { const c = clsOf(s); return s.user?.cat || (['confirmed', 'onehint', 'sound'].includes(c.cert) ? c.cat : null); }
let _pk = '', _pc = new Map();
function propsOf(s) {
  const k = S.ver + '|' + S.learnVer + '|' + JSON.stringify(S.set.tax || null);
  if (k !== _pk) { _pk = k; _pc = new Map(); }
  let p = _pc.get(s.id);
  if (!p) {
    const cat = catFor(s) || clsOf(s).cat, auto = clsOf(s).auto?.cat;
    // v1.7: si cambiaste la categoría, también se ofrece lo detectado con la que proponía la herramienta
    const det = detectTags(s, cat); if (auto && auto !== cat) for (const x of detectTags(s, auto)) if (!det.some((y) => y.tag === x.tag)) det.push(x);
    p = { cat, sub: proposeSub(s, cat, S.set.tax), tags: det.filter((x) => !tagsOf(s).includes(x.tag)) }; _pc.set(s.id, p);
  }
  return p;
}
const whyOf = (x) => (x.src === 'name' ? t('por el nombre {w}', { w: esc(x.why) }) : t('por el sonido: {w}', { w: t(x.why) }));

// ---------- cambios ----------
async function setSub(list, sub) {
  for (const s of list) { if (sub) s.user.sub = sub; else delete s.user.sub; }
  invalidateAll(); await saveSamples(list);
}
async function addTags(list, tags) {
  const ch = [];
  for (const s of list) { const cur = tagsOf(s); const nx = [...new Set([...cur, ...tags])]; if (nx.length !== cur.length) { s.user.tags = nx; ch.push(s); } }
  if (ch.length) { invalidateAll(); await saveSamples(ch); }
  return ch.length;
}
async function removeTag(list, tag) {
  const ch = list.filter((s) => tagsOf(s).includes(tag));
  for (const s of ch) { s.user.tags = tagsOf(s).filter((x) => x !== tag); if (!s.user.tags.length) delete s.user.tags; }
  if (ch.length) { invalidateAll(); await saveSamples(ch); }
  return ch.length;
}
async function saveTax(tax) { S.set.tax = tax; await saveSettings(); invalidateAll(); }
let _tagKey = '';
function refresh() { if (S.view === 'library' && (S.libMode || 'list') === 'list' && allTags().map((x) => x[0]).join('|') === _tagKey) { renderHeader(); paintList(); renderDetail(); } else renderView(); if (typeof paintDock === 'function') paintDock(); }

// ---------- ficha: carpeta y etiquetas ----------
function orgDetailHTML(s, { compact = false } = {}) {
  const cat = catFor(s) || clsOf(s).cat;
  const p = propsOf(s), u = s.user || {}, tags = tagsOf(s), pal = palette(), GL = GROUP_LABEL();
  const subs = cat ? taxOf(cat) : [];
  const subRow = !cat ? `<span class="muted">${t('Elige primero la categoría.')}</span>`
    : `<span class="chips">${subs.map((x) => `<button class="chip2 ${u.sub === x.id ? 'on' : ''} ${!u.sub && p.sub?.id === x.id ? 'prop' : ''}" data-act="o-sub" data-v="${x.id}" data-id="${s.id}">${esc(t(x.label))}</button>`).join('')}<button class="chip2 add" data-act="o-sub-new" data-id="${s.id}" title="${t('Nueva subcarpeta en {c}', { c: catLabel(cat) })}">＋</button></span>`;
  const propLine = cat && !u.sub && p.sub ? `<div class="oprop">${t('Propuesta')}: <b>${esc(subName(cat, p.sub.id))}</b> <span class="muted">${whyOf(p.sub)}</span> <button class="btn small" data-act="o-sub-accept" data-id="${s.id}">${t('Aceptar')} <span class="kbd">G</span></button></div>` : '';
  const det = p.tags.length ? `<div class="oprop">${t('Detectado')}: ${p.tags.map((x) => `<button class="chip2 prop" data-act="o-tag-add" data-v="${esc(x.tag)}" data-id="${s.id}" title="${esc(whyOf(x).replace(/<[^>]+>/g, ''))}">＋ ${esc(tagName(x.tag))}</button>`).join('')}${p.tags.length > 1 ? `<button class="btn small ghost" data-act="o-tag-det" data-id="${s.id}">${t('Añadir todas')}</button>` : ''}</div>` : '';
  const mine = tags.length ? tags.map((x) => `<span class="chip2 on">${esc(tagName(x))}<button data-act="o-tag-del" data-v="${esc(x)}" data-id="${s.id}" aria-label="${t('Quitar')}">✕</button></span>`).join('') : `<span class="muted">${t('Sin etiquetas.')}</span>`;
  const qt = quickTags();
  const palHTML = PALETTE_GROUPS.map((g) => `<div class="palg"><span class="lbl">${GL[g]}</span>${pal[g].map((x) => { const qn = qt.indexOf(x); return `<button class="chip2 ${tags.includes(x) ? 'on' : ''}" data-act="o-tag-tog" data-v="${esc(x)}" data-id="${s.id}" ${qn >= 0 ? `title="Alt+${qn + 1}"` : ''}>${esc(tagName(x))}${qn >= 0 ? `<sup>${qn + 1}</sup>` : ''}</button>`; }).join('')}</div>`).join('');
  const quick = `<div class="quick"><span class="lbl">${t('Etiquetas rápidas')}</span>${qt.map((x, i) => `<button class="chip2 ${tags.includes(x) ? 'on' : ''}" data-act="o-tag-tog" data-v="${esc(x)}" data-id="${s.id}" title="Alt+${i + 1}">${esc(tagName(x))}<sup>${i + 1}</sup></button>`).join('')}</div>`;
  return `<div class="orgd ${compact ? 'compact' : ''}">
    ${kindHTML(s)}
    <div class="orow"><span class="lbl">${t('Subcarpeta')}</span><div>${subRow}${propLine}</div></div>
    <div class="orow"><span class="lbl">${t('Etiquetas')}</span><div><span class="chips">${mine}</span>${det}
      ${compact ? quick : `<div class="pal">${palHTML}</div>`}
      <input type="text" class="otag" data-id="${s.id}" placeholder="${t('Otra etiqueta y Intro')}" maxlength="24" list="o-taglist"><datalist id="o-taglist">${allTags().slice(0, 60).map(([x]) => `<option value="${esc(x)}">`).join('')}</datalist></div></div>
    ${tagClipHTML(s)}
  </div>`;
}
function orgPanelHTML(s) { return `<div class="panel" style="margin-top:12px"><h2>${t('Carpeta y etiquetas')}</h2>${orgDetailHTML(s)}</div>`; }

// ---------- filtros de la biblioteca ----------
function orgFilterOK(s) {
  const f = S.f;
  if (f.tag && !tagsOf(s).includes(f.tag)) return false;
  if (f.sub) { if (f.sub === 'none' ? s.user?.sub : s.user?.sub !== f.sub) return false; }
  if (f.words && f.words.length) { const w = wordsOf(s); if (!f.words.every((x) => w.has(x))) return false; }
  return true;
}
function orgFiltersHTML(list) {
  const tags = allTags(), cat = CATS.find((c) => c.id === S.f.cat) ? S.f.cat : null;
  _tagKey = tags.map((x) => x[0]).join('|');
  const words = wordIndex(list, 22), on = S.f.words || [];
  const sel = `${tags.length ? `<select id="ftag" title="${t('Etiqueta')}"><option value="">${t('Cualquier etiqueta')}</option>${tags.map(([x, n]) => `<option value="${esc(x)}" ${S.f.tag === x ? 'selected' : ''}>${esc(tagName(x))} (${n})</option>`).join('')}</select>` : ''}
    ${cat ? `<select id="fsub" title="${t('Subcarpeta')}"><option value="">${t('Cualquier subcarpeta')}</option>${taxOf(cat).map((x) => `<option value="${x.id}" ${S.f.sub === x.id ? 'selected' : ''}>${esc(t(x.label))}</option>`).join('')}<option value="none" ${S.f.sub === 'none' ? 'selected' : ''}>${t('Sin subcarpeta')}</option></select>` : ''}`;
  const wbar = words.length || on.length ? `<div class="words" aria-label="${t('Palabras del nombre')}"><span class="lbl">${t('En el nombre')}</span>${on.map((x) => `<button class="chip2 on" data-act="o-word" data-v="${esc(x)}">${esc(x)} ✕</button>`).join('')}${words.filter(([x]) => !on.includes(x)).map(([x, n]) => `<button class="chip2" data-act="o-word" data-v="${esc(x)}">${esc(x)} <span class="n">${n}</span></button>`).join('')}</div>` : '';
  return { sel, wbar };
}
function libModesHTML() {
  const m = S.libMode || 'list';
  return `<div class="libmodes seg" role="tablist">${[['list', t('Muestras')], ['rean', t('Reanalizar')], ['short', t('Acortar loops')], ['tax', t('Carpetas y etiquetas')], ['trash', t('Papelera') + (trashCount() ? ` (${trashCount()})` : '')]].map(([k, l]) => `<button role="tab" class="${m === k ? 'on' : ''}" data-act="o-mode" data-v="${k}">${l}</button>`).join('')}</div>`;
}

// ---------- Reanalizar ----------
let _kk = '', _kv = null;
// vectores normalizados (z) de lo medido; se recalculan solo si cambia algo
function knnData() {
  const k = S.ver + '|' + S.samples.length;
  if (k === _kk) return _kv;
  const rows = S.samples.map((s) => ({ s, v: featureVec(s.analysis) })).filter((r) => r.v);
  const d = rows[0]?.v.length || 0, mu = Array(d).fill(0), sd = Array(d).fill(0);
  for (const r of rows) r.v.forEach((x, i) => { mu[i] += x / rows.length; });
  for (const r of rows) r.v.forEach((x, i) => { sd[i] += (x - mu[i]) ** 2 / rows.length; });
  for (const r of rows) r.v = r.v.map((x, i) => (x - mu[i]) / (Math.sqrt(sd[i]) || 1));
  const labeled = rows.filter((r) => r.s.user?.cat && r.s.user.via !== 'similar' && !r.s.user.discard).map((r) => ({ id: r.s.id, cat: r.s.user.cat, sub: r.s.user.sub, v: r.v }));
  const guesses = [];
  if (labeled.length >= 12) for (const r of rows) {
    const s = r.s; if (s.user?.cat || s.user?.discard) continue;
    const g = neighbourGuess({ id: s.id, v: r.v }, labeled, { k: 7, dist: vecDist }); if (!g) continue;
    const c = clsOf(s);
    if (s.user?.knnNo === g.cat) continue;
    const differs = g.cat !== c.cat, weak = ['doubt', 'none', 'sound'].includes(c.cert);
    if ((differs && c.cert !== 'confirmed') || (weak && !differs)) guesses.push({ id: s.id, g, cur: c, differs });
  }
  guesses.sort((a, b) => b.g.conf - a.g.conf || a.g.near - b.g.near);
  _kk = k; _kv = { labeled: labeled.length, guesses };
  return _kv;
}
function subPlan() {
  const by = {};
  for (const s of S.samples) {
    if (s.user?.discard || s.user?.sub) continue;
    const cat = catFor(s); if (!cat) continue;
    const p = propsOf(s); if (!p.sub) continue;
    const o = (by[cat] ||= { n: 0, subs: {} }); o.n++; (o.subs[p.sub.id] ||= []).push(s.id);
  }
  return by;
}
function tagPlan() {
  const by = {};
  for (const s of S.samples) {
    if (s.user?.discard) continue;
    for (const x of propsOf(s).tags) { const o = (by[x.tag] ||= { ids: [], name: 0, sound: 0 }); o.ids.push(s.id); o[x.src]++; }
  }
  return Object.entries(by).sort((a, b) => b[1].ids.length - a[1].ids.length);
}
function reanHTML() {
  const K = knnData(), th = S._knnTh ?? 0.8;
  const strong = K.guesses.filter((x) => x.g.conf >= th);
  const sp = subPlan(), tp = tagPlan();
  const totalSub = Object.values(sp).reduce((a, x) => a + x.n, 0);
  const row = (x) => { const s = S.byId[x.id]; return `<tr><td><button class="btn small ghost" data-act="o-play" data-id="${s.id}" aria-label="${t('Escuchar')}">▶</button></td><td class="nmc"><button class="lnk" data-act="o-open" data-id="${s.id}">${esc(s.name)}</button></td>
    <td>${x.cur.cat ? `<span style="color:${catVar(x.cur.cat)}">${catLabel(x.cur.cat)}</span>` : '—'} <span class="dim">${CERT_LABEL()[x.cur.cert]}</span></td><td>→</td>
    <td><b style="color:${catVar(x.g.cat)}">${catLabel(x.g.cat)}</b> <span class="mono">${nf(x.g.conf * 100, 0)} %</span> <span class="dim">${t('{n} de 7 vecinos', { n: x.g.n })}</span></td>
    <td class="acts"><button class="btn small" data-act="o-kn-ok" data-id="${s.id}" data-v="${x.g.cat}">✓</button><button class="btn small ghost" data-act="o-kn-no" data-id="${s.id}" data-v="${x.g.cat}" title="${t('No volver a proponerlo')}">✕</button></td></tr>`; };
  return `<div class="rean">
  <section class="panel"><h2>${t('Categoría por parecido')}</h2>
    <p class="note" style="margin-top:0">${t('Compara lo medido de cada sample con los que ya has decidido tú (los 7 más parecidos) y propone su categoría. No necesita escuchar nada ni el nombre: sirve para los que se llaman «sample_07». Cuanto más decides, mejor acierta.')}</p>
    ${K.labeled < 12 ? `<p class="warnline note">${t('Decide al menos 12 samples en 02 Escucha para tener referencias (llevas {n}).', { n: K.labeled })}</p>` : `
    <div class="row"><span class="muted">${t('{n} propuestas · referencias: {r} decididos por ti', { n: K.guesses.length, r: K.labeled })}</span><span class="grow"></span>
      <label class="inl">${t('Seguridad mínima')} <select id="o-knn-th">${[0.6, 0.7, 0.8, 0.9].map((v) => `<option value="${v}" ${th === v ? 'selected' : ''}>${v * 100} %</option>`).join('')}</select></label>
      <button class="btn primary" data-act="o-kn-all" ${strong.length ? '' : 'disabled'}>${t('Aplicar {n} seguras', { n: strong.length })}</button>
      <button class="btn" data-act="o-kn-listen" ${K.guesses.length ? '' : 'disabled'}>${t('Revisarlas escuchando')}</button></div>
    ${K.guesses.length ? `<table class="t otab">${K.guesses.slice(0, 150).map(row).join('')}</table>${K.guesses.length > 150 ? `<p class="muted">${t('… y {n} más', { n: K.guesses.length - 150 })}</p>` : ''}` : `<p class="muted">${t('Nada que proponer: lo medido coincide con lo que ya hay.')}</p>`}`}
  </section>
  <section class="panel"><h2>${t('Subcarpetas propuestas')}</h2>
    <p class="note" style="margin-top:0">${t('Para cada sample sin subcarpeta: lo que dice su nombre y, si no dice nada, lo medido (cola, ruido, tono, ataque…).')}</p>
    ${totalSub ? `<div class="row"><span class="muted">${t('{n} samples sin subcarpeta con propuesta', { n: totalSub })}</span><span class="grow"></span><button class="btn primary" data-act="o-sub-allcats">${t('Aceptar todas')}</button></div>
    <div class="subplan">${CATS.filter((c) => sp[c.id]).map((c) => `<div class="spc"><div class="row"><b style="color:${catVar(c.id)}">${catLabel(c.id)}</b><span class="muted">${sp[c.id].n}</span><span class="grow"></span><button class="btn small" data-act="o-sub-cat" data-v="${c.id}">${t('Aceptar')}</button></div>
      <div class="chips">${Object.entries(sp[c.id].subs).sort((a, b) => b[1].length - a[1].length).map(([id, ids]) => `<button class="chip2" data-act="o-sub-peek" data-c="${c.id}" data-v="${id}" title="${t('Ver en la lista')}">${esc(subName(c.id, id))} <span class="n">${ids.length}</span></button>`).join('')}</div></div>`).join('')}</div>` : `<p class="muted">${t('Todos los samples con categoría tienen subcarpeta, o no hay propuestas.')}</p>`}
  </section>
  <section class="panel"><h2>${t('Efectos y carácter detectados')}</h2>
    <p class="note" style="margin-top:0">${t('Del nombre (reverb, dly, dist, lofi…) y de lo medido (colas largas en percusión, ataques al revés, suciedad en bombos y bajos).')}</p>
    ${tp.length ? `<div class="chips">${tp.map(([tag, o]) => `<button class="chip2" data-act="o-dt-add" data-v="${esc(tag)}">＋ ${esc(tagName(tag))} <span class="n">${o.ids.length}</span> <span class="dim">${o.name ? t('{n} por nombre', { n: o.name }) : ''}${o.name && o.sound ? ' · ' : ''}${o.sound ? t('{n} por sonido', { n: o.sound }) : ''}</span></button>`).join('')}</div>
      <p class="note">${t('Cada botón añade la etiqueta a todos esos samples. Puedes quitarla luego desde la ficha o en Carpetas y etiquetas.')}</p>` : `<p class="muted">${t('Nada nuevo detectado.')}</p>`}
  </section></div>`;
}

// ---------- Carpetas y etiquetas ----------
function taxHTML() {
  const cnt = {};
  for (const s of S.samples) { const c = catFor(s); if (!c) continue; const k = c + '|' + (s.user?.sub || ''); cnt[k] = (cnt[k] || 0) + 1; }
  const pal = palette(), GL = GROUP_LABEL(), tags = allTags();
  return `<div class="taxw">
  <section class="panel"><h2>${t('Carpetas y subcarpetas')}</h2>
    <p class="note" style="margin-top:0">${t('Cada categoría es una carpeta; dentro, tus subcarpetas. «Ordenar en disco» (08 Datos) copia la colección con esta estructura.')}</p>
    <div class="taxgrid">${CATS.map((c) => { const subs = taxOf(c.id), custom = Array.isArray(S.set.tax?.[c.id]); return `<div class="taxc"><div class="row"><b style="color:${catVar(c.id)}">${catLabel(c.id)}</b><span class="muted mono">${Object.entries(cnt).filter(([k]) => k.startsWith(c.id + '|')).reduce((a, [, n]) => a + n, 0)}</span><span class="grow"></span>${custom ? `<button class="btn small ghost" data-act="o-tax-reset" data-c="${c.id}" title="${t('Volver a las de fábrica')}">↺</button>` : ''}</div>
      <ul class="taxl">${subs.map((x, i) => `<li><input class="otax" data-c="${c.id}" data-v="${x.id}" value="${esc(t(x.label))}" maxlength="32" aria-label="${t('Nombre de la subcarpeta')}"><span class="mono muted">${cnt[c.id + '|' + x.id] || 0}</span>
        <button class="btn small ghost" data-act="o-tax-up" data-c="${c.id}" data-v="${x.id}" ${i ? '' : 'disabled'} aria-label="${t('Subir')}">↑</button><button class="btn small ghost" data-act="o-tax-down" data-c="${c.id}" data-v="${x.id}" ${i < subs.length - 1 ? '' : 'disabled'} aria-label="${t('Bajar')}">↓</button><button class="btn small ghost" data-act="o-tax-del" data-c="${c.id}" data-v="${x.id}" aria-label="${t('Quitar')}">✕</button></li>`).join('')}
        <li class="muted">${t('sin subcarpeta')} <span class="mono">${cnt[c.id + '|'] || 0}</span></li></ul>
      <input class="otaxnew" data-c="${c.id}" placeholder="${t('Nueva subcarpeta y Intro')}" maxlength="32"></div>`; }).join('')}</div>
  </section>
  <section class="panel"><h2>${t('Paleta de etiquetas')}</h2>
    <p class="note" style="margin-top:0">${t('Las etiquetas que aparecen a mano en cada ficha y en la selección múltiple. Añade las que uses a menudo.')}</p>
    ${PALETTE_GROUPS.map((g) => `<div class="palg"><span class="lbl">${GL[g]}</span>${pal[g].map((x) => `<span class="chip2">${esc(tagName(x))}<button data-act="o-pal-del" data-g="${g}" data-v="${esc(x)}" aria-label="${t('Quitar')}">✕</button></span>`).join('')}<input class="opalnew" data-g="${g}" placeholder="${t('Añadir y Intro')}" maxlength="24"></div>`).join('')}
    ${S.set.tagPal ? `<button class="btn small ghost" data-act="o-pal-reset">${t('Restablecer la paleta')}</button>` : ''}
    <div class="sep"></div>
    <h3>${t('Tus etiquetas')}</h3>
    ${tags.length ? `<div class="chips">${tags.map(([x, n]) => `<span class="chip2"><button class="lnk" data-act="o-tag-filter" data-v="${esc(x)}">${esc(tagName(x))}</button> <span class="n">${n}</span><button data-act="o-tag-purge" data-v="${esc(x)}" title="${t('Quitarla de todos los samples')}">✕</button></span>`).join('')}</div>` : `<p class="muted">${t('Todavía no has puesto etiquetas.')}</p>`}
  </section></div>`;
}
function renderOrg(v) {
  const m = S.libMode;
  v.innerHTML = `${libModesHTML()}${m === 'rean' ? reanHTML() : m === 'trash' ? trashHTML() : m === 'short' ? shortModeHTML() : taxHTML()}`;
}

// ---------- selección múltiple ----------
function bulkHTML() {
  const list = [...S.multi].map((id) => S.byId[id]).filter(Boolean);
  const cats = [...new Set(list.map(catFor).filter(Boolean))];
  const pal = palette(), GL = GROUP_LABEL();
  const present = [...new Set(list.flatMap(tagsOf))];
  const props = list.filter((s) => !s.user?.sub && propsOf(s).sub).length;
  return `<h2>${t('{n} seleccionados', { n: list.length })}</h2>
    <h3>${t('Subcarpeta')}</h3>
    ${cats.length === 1 ? `<div class="chips">${taxOf(cats[0]).map((x) => `<button class="chip2" data-act="o-bulk-sub" data-v="${x.id}">${esc(t(x.label))}</button>`).join('')}<button class="chip2" data-act="o-bulk-sub" data-v="">${t('Sin subcarpeta')}</button></div>`
      : `<p class="muted">${cats.length ? t('Hay varias categorías ({l}): filtra por una para elegir subcarpeta.', { l: cats.map(catLabel).join(', ') }) : t('Ninguno tiene categoría todavía.')}</p>`}
    ${props ? `<button class="btn small" data-act="o-bulk-prop">${t('Aceptar las {n} subcarpetas propuestas', { n: props })}</button>` : ''}
    <h3>${t('Añadir etiqueta')}</h3>
    ${PALETTE_GROUPS.map((g) => `<div class="palg"><span class="lbl">${GL[g]}</span>${pal[g].map((x) => `<button class="chip2" data-act="o-bulk-tag" data-v="${esc(x)}">${esc(tagName(x))}</button>`).join('')}</div>`).join('')}
    <input type="text" class="obulknew" placeholder="${t('Otra etiqueta y Intro')}" maxlength="24">
    ${present.length ? `<h3>${t('Quitar etiqueta')}</h3><div class="chips">${present.map((x) => `<button class="chip2 on" data-act="o-bulk-untag" data-v="${esc(x)}">${esc(tagName(x))} ✕</button>`).join('')}</div>` : ''}
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-act="modal-close">${t('Cerrar')}</button></div>`;
}
const selList = () => [...S.multi].map((id) => S.byId[id]).filter(Boolean);
function rebulk(msg) { if (msg) toast(msg, 'ok', 2200); modal(bulkHTML()); paintList(); }

// ---------- acciones ----------
const sOf = (el) => S.byId[el.dataset.id] || current();
async function tagAdd(s, tag) { tag = String(tag || '').trim().slice(0, 24); if (!s || !tag) return; await addTags([s], [tag]); refresh(); }
Object.assign(ACT, {
  'o-mode': (el) => { S.libMode = el.dataset.v; Player.stop(); renderView(); },
  'o-sub': async (el) => { const s = sOf(el); await setSub([s], s.user.sub === el.dataset.v ? null : el.dataset.v); refresh(); },
  'o-sub-accept': async (el) => { const s = sOf(el); const p = s && propsOf(s); if (p?.sub) { await setSub([s], p.sub.id); refresh(); } },
  'o-sub-new': (el) => {
    const s = sOf(el); const cat = catFor(s) || clsOf(s).cat; if (!cat) return;
    modal(`<h2>${t('Nueva subcarpeta en {c}', { c: catLabel(cat) })}</h2><input type="text" id="o-newsub" maxlength="32" style="width:100%" placeholder="${t('p. ej. Subs, Groovys, Drones…')}"><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-act="modal-close">${t('Cancelar')}</button><button class="btn primary" data-act="o-sub-new-ok" data-id="${s.id}" data-c="${cat}">${t('Crear y asignar')}</button></div>`);
    setTimeout(() => document.getElementById('o-newsub')?.focus(), 30);
  },
  'o-sub-new-ok': async (el) => {
    const name = document.getElementById('o-newsub')?.value; const r = addSubfolder(S.set.tax, el.dataset.c, name); closeModal();
    if (!r.id) return; await saveTax(r.tax); const s = S.byId[el.dataset.id]; if (s) await setSub([s], r.id); refresh();
  },
  'o-tag-add': (el) => tagAdd(sOf(el), el.dataset.v),
  'o-tag-tog': async (el) => { const s = sOf(el); if (tagsOf(s).includes(el.dataset.v)) await removeTag([s], el.dataset.v); else await addTags([s], [el.dataset.v]); refresh(); },
  'o-tag-del': async (el) => { await removeTag([sOf(el)], el.dataset.v); refresh(); },
  'o-tag-det': async (el) => { const s = sOf(el); await addTags([s], propsOf(s).tags.map((x) => x.tag)); refresh(); },
  'o-word': (el) => { const w = el.dataset.v, on = S.f.words || []; S.f.words = on.includes(w) ? on.filter((x) => x !== w) : [...on, w]; renderView(); },
  'o-play': (el) => play(S.byId[el.dataset.id]),
  'o-open': (el) => { S.sel = el.dataset.id; S.libMode = 'list'; S.f = { ...S.f, q: '', cat: 'all', cert: 'all', flag: 'all', tag: '', sub: '', words: [] }; renderView(); },
  'o-kn-ok': async (el) => { const s = S.byId[el.dataset.id]; s.user.cat = el.dataset.v; s.user.via = 'similar'; invalidateAll(); await saveSample(s); renderView(); },
  'o-kn-no': async (el) => { const s = S.byId[el.dataset.id]; s.user.knnNo = el.dataset.v; S.ver++; await saveSample(s); renderView(); },
  'o-kn-all': async () => {
    const th = S._knnTh ?? 0.8, list = knnData().guesses.filter((x) => x.g.conf >= th);
    const ch = list.map((x) => { const s = S.byId[x.id]; s.user.cat = x.g.cat; s.user.via = 'similar'; return s; });
    invalidateAll(); await saveSamples(ch);
    toast(t('{n} categorías aplicadas por parecido. Puedes deshacer cada una con «Quitar mi decisión» en su ficha.', { n: ch.length }), 'ok', 6000); renderView();
  },
  'o-kn-listen': () => { S.multi = new Set(knnData().guesses.map((x) => x.id)); S.listen.src = 'sel'; go('listen'); },
  'o-sub-cat': async (el) => { const sp = subPlan()[el.dataset.v]; if (!sp) return; let n = 0; for (const [id, ids] of Object.entries(sp.subs)) { await setSub(ids.map((x) => S.byId[x]), id); n += ids.length; } toast(t('{n} samples en su subcarpeta.', { n })); renderView(); },
  'o-sub-allcats': async () => { const sp = subPlan(); let n = 0; for (const o of Object.values(sp)) for (const [id, ids] of Object.entries(o.subs)) { await setSub(ids.map((x) => S.byId[x]), id); n += ids.length; } toast(t('{n} samples en su subcarpeta.', { n })); renderView(); },
  'o-sub-peek': (el) => { S.libMode = 'list'; S.f = { ...S.f, q: '', cat: el.dataset.c, cert: 'all', flag: 'all', tag: '', sub: 'none', words: [] }; renderView(); },
  'o-dt-add': async (el) => { const o = tagPlan().find(([x]) => x === el.dataset.v); if (!o) return; const n = await addTags(o[1].ids.map((x) => S.byId[x]), [el.dataset.v]); toast(t('«{t}» en {n} samples.', { t: esc(tagName(el.dataset.v)), n })); renderView(); },
  'o-tax-up': async (el) => { await saveTax(moveSubfolder(S.set.tax, el.dataset.c, el.dataset.v, -1)); renderView(); },
  'o-tax-down': async (el) => { await saveTax(moveSubfolder(S.set.tax, el.dataset.c, el.dataset.v, 1)); renderView(); },
  'o-tax-del': async (el) => {
    const c = el.dataset.c, id = el.dataset.v, used = S.samples.filter((s) => s.user?.sub === id && catFor(s) === c);
    await saveTax(removeSubfolder(S.set.tax, c, id)); if (used.length) await setSub(used, null);
    toast(used.length ? t('Subcarpeta quitada; {n} samples quedan sin subcarpeta.', { n: used.length }) : t('Subcarpeta quitada.')); renderView();
  },
  'o-tax-reset': async (el) => { await saveTax(resetTax(S.set.tax, el.dataset.c)); renderView(); },
  'o-pal-del': async (el) => { const p = palette(); p[el.dataset.g] = p[el.dataset.g].filter((x) => x !== el.dataset.v); S.set.tagPal = p; await saveSettings(); renderView(); },
  'o-pal-reset': async () => { delete S.set.tagPal; await saveSettings(); renderView(); },
  'o-tag-filter': (el) => { S.libMode = 'list'; S.f = { ...S.f, tag: el.dataset.v }; renderView(); },
  'o-tag-purge': async (el) => { const n = await removeTag(S.samples, el.dataset.v); if (S.f.tag === el.dataset.v) S.f.tag = ''; toast(t('«{t}» quitada de {n} samples.', { t: esc(tagName(el.dataset.v)), n })); renderView(); },
  'multi-org': () => modal(bulkHTML()),
  'o-bulk-sub': async (el) => { const l = selList(); await setSub(l, el.dataset.v || null); rebulk(t('{n} samples en su subcarpeta.', { n: l.length })); },
  'o-bulk-prop': async () => { const l = selList().filter((s) => !s.user?.sub && propsOf(s).sub); for (const s of l) s.user.sub = propsOf(s).sub.id; invalidateAll(); await saveSamples(l); rebulk(t('{n} samples en su subcarpeta.', { n: l.length })); },
  'o-bulk-tag': async (el) => { const n = await addTags(selList(), [el.dataset.v]); rebulk(t('«{t}» en {n} samples.', { t: esc(tagName(el.dataset.v)), n })); },
  'o-bulk-untag': async (el) => { const n = await removeTag(selList(), el.dataset.v); rebulk(t('«{t}» quitada de {n} samples.', { t: esc(tagName(el.dataset.v)), n })); },
});

// campos de texto: Intro crea; cambiar el nombre de una subcarpeta al salir del campo
document.addEventListener('keydown', async (ev) => {
  const el = ev.target; if (ev.key !== 'Enter' || !el.classList) return;
  const v = String(el.value || '').trim();
  if (el.classList.contains('otag')) { ev.preventDefault(); ev.stopPropagation(); if (v) await tagAdd(S.byId[el.dataset.id], v); }
  else if (el.classList.contains('obulknew')) { ev.preventDefault(); ev.stopPropagation(); if (v) { const n = await addTags(selList(), [v]); rebulk(t('«{t}» en {n} samples.', { t: esc(v), n })); } }
  else if (el.classList.contains('otaxnew')) { ev.preventDefault(); ev.stopPropagation(); if (v) { const r = addSubfolder(S.set.tax, el.dataset.c, v); await saveTax(r.tax); renderView(); } }
  else if (el.classList.contains('opalnew')) { ev.preventDefault(); ev.stopPropagation(); if (v) { const p = palette(); if (!p[el.dataset.g].includes(v)) p[el.dataset.g] = [...p[el.dataset.g], v.slice(0, 24)]; S.set.tagPal = p; await saveSettings(); renderView(); } }
  else if (el.id === 'o-newsub') { ev.preventDefault(); ev.stopPropagation(); document.querySelector('[data-act="o-sub-new-ok"]')?.click(); }
  else if (el.classList.contains('otax')) { ev.preventDefault(); el.blur(); }
}, true);
document.addEventListener('change', async (ev) => {
  const el = ev.target;
  if (el.classList?.contains('otax')) { const v = el.value.trim(); if (v && v !== t(subLabelOf(S.set.tax, el.dataset.c, el.dataset.v) || '')) { await saveTax(renameSubfolder(S.set.tax, el.dataset.c, el.dataset.v, v)); renderView(); } }
  else if (el.id === 'ftag') { S.f.tag = el.value; renderView(); }
  else if (el.id === 'fsub') { S.f.sub = el.value; renderView(); }
  else if (el.id === 'o-knn-th') { S._knnTh = +el.value; renderView(); }
});
// G: acepta la subcarpeta propuesta del sample actual (biblioteca y escucha)
document.addEventListener('keydown', (ev) => {
  if (ev.key.toLowerCase() !== 'g' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (ev.target.matches?.('input,textarea,select') || document.getElementById('modal').classList.contains('on')) return;
  if (!['library', 'listen'].includes(S.view) || (S.view === 'library' && (S.libMode || 'list') !== 'list')) return;
  const s = current(); if (!s) return;
  ev.preventDefault(); ACT['o-sub-accept']({ dataset: { id: s.id } });
}, true);
