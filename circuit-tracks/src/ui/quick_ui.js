// ui/quick_ui.js — v3.9: lo que se hace mientras se escucha, sin ir a otra sección.
//  · Octava rápida: −8va / +8va (Alt ↓ / Alt ↑) en Escucha, en la ficha y en el patch acoplado. Crea una versión
//    aceptada (la que se exporta y la que suena en el equipo) y las pulsaciones siguientes se suman en esa misma
//    versión. Si vuelve a quedar como el original, la versión se quita. Suena otra vez al momento.
//  · Portapapeles: copiar la carpeta y las etiquetas de un patch (Mayús V), pegarlas en el que escuchas (V) o en
//    la selección, y guardar conjuntos como grupos («Bajos / Sub + Wobble + Dark») para cargarlos con un clic.

// ---------- octava rápida ----------
// v3.10: se suma a la versión del sonido (una sola versión, con lo demás que hayas cambiado). meta.quickOct lleva la
// cuenta de las octavas movidas a mano; si el sonido vuelve a quedar como el original, la versión se quita.
function quickOctOf(p) { const v = p && faceOf(p); return v && v.kind === 'variant' && v.meta.quickOct ? v.meta.quickOct : 0; }
function octBtnsHTML(p) {
  if (!p) return '';
  const n = quickOctOf(p), lbl = n ? `${n > 0 ? '+' : '−'}${Math.abs(n / 12)} oct` : 'Octava';
  return html`<span class="octq" title="Bajar o subir una octava el patch (Alt ↓ / Alt ↑). Se suma a su versión: suena y se exporta así; el original sigue guardado.">
    <button class="btn small" data-act="qOct" data-n="-12" data-id="${p.id}">−8va</button><b class="mono ${n ? 'on' : ''}">${lbl}</b><button class="btn small" data-act="qOct" data-n="12" data-id="${p.id}">+8va</button></span>`;
}
async function quickOctave(p0, n) {
  if (!p0) return;
  const cv = faceOf(p0), root = lib.rootOf(p0);
  const t = transposeSemitones(cv.payload, n, regMethod(), {});
  if (!t || !t.payload) { toast('No se puede transponer este patch', 5000); return; }
  const total = (cv.kind === 'variant' ? cv.meta.quickOct || 0 : 0) + n;
  const now = await lib.editSound(cv, t.payload, 'register', `Octava ${fmtSemis(total / 12)} (a mano)`);
  if (now.kind === 'variant') await lib.updateMeta([now.id], { quickOct: total }, `Octava a mano: ${fmtSemis(total / 12)} oct`);
  if (S.sel) S.sel = faceOf(lib.byId(S.sel))?.id || now.id;
  S.rowsKey = ''; rerender();
  if (S.dev.session) quickPlay(root, faceOf(root).payload);
  toast(now.id === root.id && root.kind !== 'variant' ? `«${root.name}» vuelve a sonar como el original` : `«${root.name}»: ${fmtSemis(total / 12)} oct respecto al original${t.problems?.length ? ' · ' + t.problems[0] : ''}`, 4000);
}
// v3.11: la frase de su grupo sin colocar la octava, para que se oiga lo que ha cambiado
function quickPlay(p, payload) { playTest(p, payload, { mode: 'circuit' }); }

// ---------- portapapeles (v3.11: también la carpeta, como en la herramienta de la Rhythm 2.5) ----------
// Copia la carpeta (categoría y subcarpeta: la tuya o, si no hay, la propuesta que ves en la ficha) y las etiquetas
// de un patch. Cada parte se puede apagar para pegar solo lo que quieras. Los grupos guardan el conjunto entero.
// Vive en los ajustes: tagClip (etiquetas, como en 3.9), clipF ({ cat, sub, off: [] }) y tagGroups.
const clipTags = () => lib.settings.tagClip || [];
const clipF = () => (lib.settings.clipF && typeof lib.settings.clipF === 'object' ? lib.settings.clipF : {});
const clipOn = (k) => !(clipF().off || []).includes(k);
// un grupo de 3.9 era una lista de etiquetas; desde 3.11 es { tags, cat, sub }
const clipGroupOf = (g) => (Array.isArray(g) ? { tags: g } : g && typeof g === 'object' ? { tags: Array.isArray(g.tags) ? g.tags : [], cat: g.cat || null, sub: g.sub || null } : { tags: [] });
const tagGroups = () => (lib.settings.tagGroups || []).map(clipGroupOf);
const cleanTags = (tags) => [...new Set(tags.map((x) => String(x).trim()).filter(Boolean))].slice(0, 12);
async function setClip(tags) { await lib.setSetting('tagClip', cleanTags(tags)); }
async function setClipFolder(cat, sub) { await lib.setSetting('clipF', { ...(cat ? { cat } : {}), ...(cat && sub ? { sub } : {}), off: clipF().off || [] }); }
const clipFolderLbl = (f = clipF()) => (f.cat ? catName(f.cat, f.sub && lib.subLabel(f.cat, f.sub) ? f.sub : null) : '');
const clipEmpty = () => !clipTags().length && !clipF().cat;
// lo que se copia de un patch: lo que ves en su ficha (tu carpeta o, si no hay, la propuesta) y sus etiquetas
function clipFieldsOf(p) {
  const m = p.meta, c = lib.info(p).cls, cat = m.category || c.category || null;
  return { tags: m.tags || [], cat, sub: cat ? (m.category ? m.subtype : c.subtype) || null : null };
}
function clipTargets() {
  if (S.view === 'library' && S.multi.size > 1) return [...S.multi];
  const p = cur(); return p ? [p.id] : [];
}
// ¿Ya tiene lo que se pegaría?
function clipHas(p) {
  const f = clipF(), m = p.meta;
  const tagsOk = !clipOn('tags') || clipTags().every((x) => (m.tags || []).includes(x));
  const catOk = !clipOn('cat') || !f.cat || (m.category === f.cat && (!f.sub || m.subtype === f.sub));
  return tagsOk && catOk;
}
function tagClipHTML() {
  const c = clipTags(), f = clipF(), g = tagGroups(), p = cur(), multi = S.view === 'library' && S.multi.size > 1;
  const empty = clipEmpty(), has = p && !empty && clipHas(p), src = p && clipFieldsOf(p), canCopy = src && (src.tags.length || src.cat);
  const tog = (k, label) => html`<button class="clipk ${clipOn(k) ? 'on' : ''}" data-act="clipTog" data-k="${k}" aria-pressed="${clipOn(k)}" title="${clipOn(k) ? 'Se pega (clic para no pegarlo)' : 'No se pega (clic para pegarlo)'}">${label}</button>`;
  const glabel = (x) => [x.cat ? clipFolderLbl(x) : '', ...x.tags].filter(Boolean).join(' + ');
  return html`<div class="tclip"><div class="mlabel"><span>Portapapeles</span><span class="kbdh"><kbd>V</kbd> pegar · <kbd>Mayús</kbd><kbd>V</kbd> copiar</span></div>
    <div class="clipf">${f.cat ? html`${tog('cat', html`Carpeta <b>${clipFolderLbl()}</b>`)}<button class="lk" data-act="clipFolderDel" aria-label="Quitar la carpeta del portapapeles">×</button>` : html`<span class="note">Sin carpeta: «Copiar de este» copia la del patch</span>`}${c.length ? tog('tags', 'Etiquetas') : ''}</div>
    <div class="tagbox">${c.map((t) => html`<span class="tagp clip ${clipOn('tags') ? '' : 'off'}">${t}<button data-act="clipDel" data-t="${t}" aria-label="Quitar ${t}">×</button></span>`)}<input class="tagin" id="clipIn" list="tagList" placeholder="${c.length ? 'Añadir…' : 'Escribe una etiqueta, o copia las de un patch'}"></div>
    <div class="row2" style="gap:5px;flex-wrap:wrap;margin-top:5px">
      <button class="btn small" data-act="clipCopy" ${canCopy ? '' : 'disabled'} title="La carpeta y las etiquetas de este patch al portapapeles (Mayús V)">Copiar de este</button>
      <button class="btn small ${!empty && (!has || multi) ? 'primary' : ''}" data-act="clipPaste" ${!empty && p ? '' : 'disabled'} title="Pegar lo que está encendido en el portapapeles (V)">${multi ? `Pegar en ${S.multi.size}` : has ? '✓ Ya lo tiene' : 'Pegar en este'}</button>
      ${!empty ? html`<button class="btn small" data-act="clipGroup" title="Guardar este conjunto para cargarlo con un clic">Guardar como grupo</button><button class="btn small" data-act="clipClear">Vaciar</button>` : ''}</div>
    ${g.length ? html`<div class="chips" style="margin-top:6px">${g.map((x, i) => html`<span class="tgrp"><button class="tq" data-act="clipLoad" data-i="${i}" title="Cargar en el portapapeles: ${glabel(x)}">${glabel(x)}</button><button class="lk" data-act="clipGroupDel" data-i="${i}" aria-label="Quitar el grupo">×</button></span>`)}</div>` : ''}</div>`;
}
async function clipPaste() {
  const c = clipTags(), f = clipF(), ids = clipTargets(); if (!ids.length || clipEmpty()) return;
  const done = [];
  if (clipOn('cat') && f.cat) {
    const sub = f.sub && (lib.tax[f.cat] || []).some((x) => x.id === f.sub) ? f.sub : null; // la subcarpeta puede haberse borrado
    await lib.setCategory(ids, f.cat, sub); done.push(catName(f.cat, sub));
  }
  if (clipOn('tags') && c.length) { await lib.addTags(ids, c); done.push(c.join(', ')); }
  if (!done.length) { toast('Todo está apagado en el portapapeles: enciende Carpeta o Etiquetas'); return; }
  S.rowsKey = ''; rerender(); toast(`${done.join(' · ')} → ${ids.length === 1 ? '«' + lib.byId(ids[0]).name + '»' : ids.length + ' patches'}`, 2500);
}
async function clipCopy() {
  const p = cur(); if (!p) return;
  const x = clipFieldsOf(p); if (!x.tags.length && !x.cat) { toast('Este patch no tiene carpeta ni etiquetas'); return; }
  await setClip(x.tags); await setClipFolder(x.cat, x.sub); rerender();
  toast('Copiado: ' + [x.cat ? catName(x.cat, x.sub) : '', ...x.tags].filter(Boolean).join(' + '), 2500);
}

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input,textarea,select') || document.querySelector('.modal') || e.ctrlKey || e.metaKey) return;
  if (!['audition', 'library'].includes(S.view)) return;
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); e.stopImmediatePropagation(); quickOctave(cur(), e.key === 'ArrowUp' ? 12 : -12); return; }
  if (!e.altKey && e.key.toLowerCase() === 'v') { e.preventDefault(); e.stopImmediatePropagation(); if (e.shiftKey) clipCopy(); else clipPaste(); }
}, true);
document.addEventListener('keydown', async (e) => {
  if (e.target.id !== 'clipIn' || e.key !== 'Enter') return;
  e.preventDefault(); const v = e.target.value.trim(); if (!v) return;
  await setClip([...clipTags(), ...v.split(',')]); rerender(); setTimeout(() => document.getElementById('clipIn')?.focus(), 0);
});
Object.assign(A, {
  qOct: (el) => quickOctave(lib.byId(el.dataset.id) || cur(), +el.dataset.n),
  clipCopy: () => clipCopy(),
  clipPaste: () => clipPaste(),
  clipDel: async (el) => { await setClip(clipTags().filter((x) => x !== el.dataset.t)); rerender(); },
  clipFolderDel: async () => { await setClipFolder(null, null); rerender(); },
  clipTog: async (el) => { const k = el.dataset.k, off = new Set(clipF().off || []); off.has(k) ? off.delete(k) : off.add(k); await lib.setSetting('clipF', { ...clipF(), off: [...off] }); rerender(); },
  clipClear: async () => { await setClip([]); await setClipFolder(null, null); rerender(); },
  clipGroup: async () => {
    if (clipEmpty()) return; const f = clipF(), cur0 = { tags: clipTags(), cat: f.cat || null, sub: f.sub || null }, key = (x) => [x.cat, x.sub, ...x.tags].join('|');
    await lib.setSetting('tagGroups', [cur0, ...tagGroups().filter((x) => key(x) !== key(cur0))].slice(0, 12)); rerender();
  },
  clipLoad: async (el) => { const g = tagGroups()[+el.dataset.i]; if (g) { await setClip(g.tags); await setClipFolder(g.cat, g.sub); rerender(); } },
  clipGroupDel: async (el) => { const g = (lib.settings.tagGroups || []).slice(); g.splice(+el.dataset.i, 1); await lib.setSetting('tagGroups', g); rerender(); },
});
