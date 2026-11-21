// ui/app_tagclip.js — v2.4: portapapeles de etiquetas, como en la herramienta de Tracks (3.9).
// v2.5: también copia la categoría, el tipo (loop / one-shot) y la subcarpeta. Cada campo se puede apagar
// para pegar solo lo que quieras. Copiar un sample (Alt Mayús V) y pegarlo en el que escuchas o en la
// selección (Alt V; la V sola ya es «Vox» al decidir). Los grupos guardan un conjunto para cargarlo con un clic.
// Vive en los ajustes: S.set.tagClip (etiquetas, como en 2.4), S.set.clipF ({ cat, kind, sub, off: [] }) y S.set.tagGroups.
const clipList = () => (Array.isArray(S.set.tagClip) ? S.set.tagClip : []);
const clipF = () => (S.set.clipF && typeof S.set.clipF === 'object' ? S.set.clipF : {});
const clipOn = (k) => !(clipF().off || []).includes(k);
// un grupo de 2.4 era una lista de etiquetas; desde 2.5 es { tags, cat, kind, sub }
const groupOf = (g) => (Array.isArray(g) ? { tags: g } : g && typeof g === 'object' ? { tags: Array.isArray(g.tags) ? g.tags : [], cat: g.cat, kind: g.kind, sub: g.sub } : { tags: [] });
const clipGroups = () => (Array.isArray(S.set.tagGroups) ? S.set.tagGroups : []).map(groupOf);
const cleanTags = (tags) => [...new Set(tags.map((x) => String(x).trim().slice(0, 24)).filter(Boolean))].slice(0, 12);
async function clipSet(tags) { S.set.tagClip = cleanTags(tags); await saveSettings(); }
async function clipSetAll({ tags = [], cat = null, kind = null, sub = null }) {
  S.set.tagClip = cleanTags(tags);
  S.set.clipF = { ...(cat ? { cat } : {}), ...(kind ? { kind } : {}), ...(cat && sub ? { sub } : {}), off: clipF().off || [] };
  await saveSettings();
}
const clipEmpty = () => !clipList().length && !clipF().cat && !clipF().kind;
function clipTargetsOf(s) { return S.view === 'library' && S.multi.size > 1 ? [...S.multi].map((id) => S.byId[id]).filter(Boolean) : s ? [s] : []; }
const subLabel = (cat, id) => { const l = subLabelOf(S.set.tax, cat, id) || defaultSubLabel(cat, id); return l ? t(l) : id; };
const kindLabel = (k) => (k === 'loop' ? t('Loop') : t('One-shot'));
// lo que se copia de un sample: lo que ves en su ficha (tu decisión o, si no hay, la propuesta)
function fieldsOf(s) {
  const cat = catFor(s) || clsOf(s).cat || null;
  const sub = cat ? s.user?.sub || propsOf(s).sub?.id || null : null;
  return { tags: tagsOf(s), cat, kind: kindOf(s), sub };
}
// la subcarpeta del portapapeles en la categoría que acabará teniendo el sample: el mismo id si es la misma
// categoría; si no, una con el mismo nombre; si no hay, nada
function subFor(fromCat, sub, toCat) {
  if (!sub || !toCat) return null;
  if (fromCat === toCat) return sub;
  const l = String(subLabelOf(S.set.tax, fromCat, sub) || defaultSubLabel(fromCat, sub) || '').toLowerCase();
  const x = l && taxonomy(S.set.tax, toCat).find((y) => String(y.label).toLowerCase() === l);
  return x ? x.id : null;
}
function pendingIn(s) {
  const f = clipF(), cur = fieldsOf(s);
  if (clipOn('cat') && f.cat && s.user?.cat !== f.cat) return true;
  if (clipOn('kind') && f.kind && s.user?.kind !== f.kind && cur.kind !== f.kind) return true;
  const to = clipOn('cat') && f.cat ? f.cat : cur.cat, sb = clipOn('sub') ? subFor(f.cat, f.sub, to) : null;
  if (sb && s.user?.sub !== sb) return true;
  return clipOn('tags') && clipList().some((x) => !tagsOf(s).includes(x));
}
function groupLabel(g) {
  return [g.cat ? catLabel(g.cat) + (g.sub ? ' › ' + subLabel(g.cat, g.sub) : '') : '', g.kind ? kindLabel(g.kind) : '', ...g.tags.map(tagName)].filter(Boolean).map(esc).join(' + ');
}
function tagClipHTML(s) {
  const c = clipList(), f = clipF(), g = clipGroups(), multi = S.view === 'library' && S.multi.size > 1;
  const pending = s ? pendingIn(s) : false, empty = clipEmpty();
  const field = (k, lbl, val) => `<span class="chip2 on cf ${clipOn(k) ? '' : 'off'}"><button data-act="clip-tog" data-v="${k}" title="${clipOn(k) ? t('No pegar esto') : t('Pegar también esto')}" style="all:unset;cursor:pointer;display:inline-flex;gap:6px;align-items:center"><b>${lbl}</b>${val}</button><button data-act="clip-fdel" data-v="${k}" aria-label="${t('Quitar')}">✕</button></span>`;
  const fields = [f.cat ? field('cat', t('Categoría'), `<span style="color:${catVar(f.cat)}">${catLabel(f.cat)}</span>`) : '',
    f.kind ? field('kind', t('Tipo'), kindLabel(f.kind)) : '',
    f.cat && f.sub ? field('sub', t('Subcarpeta'), esc(subLabel(f.cat, f.sub))) : ''].join('');
  const tagsOff = c.length && !clipOn('tags');
  return `<div class="orow tclip"><span class="lbl">${t('Portapapeles')}</span><div>
    <span class="chips">${fields}${c.map((x) => `<span class="chip2 on clip ${tagsOff ? 'cf off' : ''}">${esc(tagName(x))}<button data-act="clip-del" data-v="${esc(x)}" aria-label="${t('Quitar')}">✕</button></span>`).join('')}
      ${c.length ? `<button class="btn small ghost" data-act="clip-tog" data-v="tags" title="${t('Pegar o no las etiquetas')}">${clipOn('tags') ? t('Sin etiquetas') : t('Con etiquetas')}</button>` : ''}
      <input type="text" class="clipin" placeholder="${empty ? t('Escribe una etiqueta, o copia un sample') : t('Añadir…')}" maxlength="24" list="o-taglist"></span>
    <div class="row" style="gap:5px;margin-top:5px;flex-wrap:wrap">
      <button class="btn small" data-act="clip-copy" data-id="${s ? s.id : ''}" ${s ? '' : 'disabled'} title="${t('Categoría, tipo, subcarpeta y etiquetas de este sample al portapapeles')} (Alt ${t('Mayús')} V)">${t('Copiar de este')}</button>
      <button class="btn small ${!empty && (pending || multi) ? 'primary' : ''}" data-act="clip-paste" data-id="${s ? s.id : ''}" ${!empty && s ? '' : 'disabled'} title="${t('Pegar lo que está encendido en el portapapeles')} (Alt V)">${multi ? t('Pegar en {n}', { n: S.multi.size }) : pending || empty ? t('Pegar en este') : '✓ ' + t('Ya lo tiene')}</button>
      ${!empty ? `<button class="btn small ghost" data-act="clip-group" title="${t('Guardar este conjunto para cargarlo con un clic')}">${t('Guardar como grupo')}</button><button class="btn small ghost" data-act="clip-clear">${t('Vaciar')}</button>` : ''}
      <span class="muted" style="font-size:12px"><span class="kbd">Alt V</span> ${t('pegar')} · <span class="kbd">Alt ${t('Mayús')} V</span> ${t('copiar')}</span></div>
    ${g.length ? `<div class="chips" style="margin-top:5px">${g.map((x, i) => `<span class="tgrp"><button class="chip2" data-act="clip-load" data-i="${i}" title="${t('Cargar en el portapapeles')}">${groupLabel(x)}</button><button class="btn small ghost" data-act="clip-group-del" data-i="${i}" aria-label="${t('Quitar el grupo')}">✕</button></span>`).join('')}</div>` : ''}
  </div></div>`;
}
async function clipPaste(s) {
  const list = clipTargetsOf(s); if (clipEmpty() || !list.length) return;
  const f = clipF(), tags = clipOn('tags') ? clipList() : [], parts = [];
  let noSub = 0, ensured = false;
  for (const x of list) {
    if (clipOn('cat') && f.cat) setCatQuiet(x, f.cat);
    if (clipOn('kind') && f.kind) x.user.kind = f.kind;
    if (clipOn('sub') && f.cat && f.sub) {
      const to = x.user.cat || catFor(x) || clsOf(x).cat;
      let sb = subFor(f.cat, f.sub, to);
      if (!sb && to === f.cat) { ensured = ensureSub(f.cat, f.sub) || ensured; sb = f.sub; }
      if (sb) x.user.sub = sb; else noSub++;
    }
    if (tags.length) x.user.tags = [...new Set([...tagsOf(x), ...tags])];
  }
  if (ensured) await saveSettings();
  invalidateAll(); await saveSamples(list); refresh();
  if (clipOn('cat') && f.cat) parts.push(catLabel(f.cat));
  if (clipOn('sub') && f.cat && f.sub) parts.push(subLabel(f.cat, f.sub));
  if (clipOn('kind') && f.kind) parts.push(kindLabel(f.kind));
  parts.push(...tags.map(tagName));
  toast(`${parts.map(esc).join(', ')} → ${list.length === 1 ? '«' + esc(list[0].name) + '»' : t('{n} samples', { n: list.length })}${noSub ? ' · ' + t('{n} sin esa subcarpeta en su categoría', { n: noSub }) : ''}`, noSub ? 'warn' : 'ok', 3000);
}
async function clipCopy(s) {
  if (!s) return;
  const fl = fieldsOf(s); await clipSetAll(fl); refresh();
  const parts = [fl.cat ? catLabel(fl.cat) + (fl.sub ? ' › ' + subLabel(fl.cat, fl.sub) : '') : '', kindLabel(fl.kind), ...fl.tags.map(tagName)].filter(Boolean);
  toast(t('Copiado: {t}', { t: parts.map(esc).join(', ') }), 'ok', 2500);
}
document.addEventListener('keydown', (ev) => {
  if (ev.target.classList?.contains('clipin') && ev.key === 'Enter') {
    ev.preventDefault(); const v = ev.target.value.trim(); if (!v) return;
    clipSet([...clipList(), ...v.split(',')]).then(() => { refresh(); setTimeout(() => document.querySelector('.clipin')?.focus(), 0); });
    return;
  }
  if (!ev.altKey || ev.code !== 'KeyV' || ev.ctrlKey || ev.metaKey || ev.target.matches?.('input,textarea,select') || document.querySelector('#modal.on')) return;
  const s = current(); if (!s) return;
  ev.preventDefault(); ev.stopImmediatePropagation();
  if (ev.shiftKey) clipCopy(s); else clipPaste(s);
}, true);
async function clipFieldsSet(patch) { S.set.clipF = { ...clipF(), ...patch }; await saveSettings(); refresh(); }
Object.assign(ACT, {
  'clip-copy': (el) => clipCopy(sOf(el) || current()),
  'clip-paste': (el) => clipPaste(sOf(el) || current()),
  'clip-del': async (el) => { await clipSet(clipList().filter((x) => x !== el.dataset.v)); refresh(); },
  'clip-tog': (el) => { const k = el.dataset.v, off = new Set(clipF().off || []); if (off.has(k)) off.delete(k); else off.add(k); return clipFieldsSet({ off: [...off] }); },
  'clip-fdel': (el) => { const f = { ...clipF() }, k = el.dataset.v; delete f[k]; if (k === 'cat') delete f.sub; S.set.clipF = f; return saveSettings().then(refresh); },
  'clip-clear': async () => { S.set.tagClip = []; S.set.clipF = { off: clipF().off || [] }; await saveSettings(); refresh(); },
  'clip-group': async () => {
    if (clipEmpty()) return; const f = clipF();
    const g = { tags: clipList(), ...(f.cat ? { cat: f.cat } : {}), ...(f.kind ? { kind: f.kind } : {}), ...(f.cat && f.sub ? { sub: f.sub } : {}) };
    const key = JSON.stringify(g);
    S.set.tagGroups = [g, ...clipGroups().filter((x) => JSON.stringify(x) !== key)].slice(0, 12); await saveSettings(); refresh();
  },
  'clip-load': async (el) => { const g = clipGroups()[+el.dataset.i]; if (g) { await clipSetAll(g); refresh(); } },
  'clip-group-del': async (el) => { const g = clipGroups(); g.splice(+el.dataset.i, 1); S.set.tagGroups = g; await saveSettings(); refresh(); },
});
