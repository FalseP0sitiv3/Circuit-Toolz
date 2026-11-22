// ui/quick_ui.js — v3.9: lo que se hace mientras se escucha, sin ir a otra sección.
//  · Octava rápida: −8va / +8va (Alt ↓ / Alt ↑) en Escucha, en la ficha y en el patch acoplado. Crea una versión
//    aceptada (la que se exporta y la que suena en el equipo) y las pulsaciones siguientes se suman en esa misma
//    versión. Si vuelve a quedar como el original, la versión se quita. Suena otra vez al momento.
//  · Portapapeles de etiquetas: copiar las de un patch (Mayús V), pegarlas en el que escuchas (V) o en la
//    selección, y guardar conjuntos como grupos («Wobble + Dark») para cargarlos con un clic.

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
function quickPlay(p, payload) { playTest(p, payload); }

// ---------- portapapeles de etiquetas ----------
const clipTags = () => lib.settings.tagClip || [];
const tagGroups = () => lib.settings.tagGroups || [];
async function setClip(tags) { await lib.setSetting('tagClip', [...new Set(tags.map((x) => String(x).trim()).filter(Boolean))].slice(0, 12)); }
function clipTargets() {
  if (S.view === 'library' && S.multi.size > 1) return [...S.multi];
  const p = cur(); return p ? [p.id] : [];
}
function tagClipHTML() {
  const c = clipTags(), g = tagGroups(), p = cur(), has = p ? (p.meta.tags || []) : [], multi = S.view === 'library' && S.multi.size > 1;
  const pending = c.filter((x) => !has.includes(x)).length;
  return html`<div class="tclip"><div class="mlabel"><span>Portapapeles de etiquetas</span><span class="kbdh"><kbd>V</kbd> pegar · <kbd>Mayús</kbd><kbd>V</kbd> copiar</span></div>
    <div class="tagbox">${c.map((t) => html`<span class="tagp clip">${t}<button data-act="clipDel" data-t="${t}" aria-label="Quitar ${t}">×</button></span>`)}<input class="tagin" id="clipIn" list="tagList" placeholder="${c.length ? 'Añadir…' : 'Escribe una etiqueta, o copia las de un patch'}"></div>
    <div class="row2" style="gap:5px;flex-wrap:wrap;margin-top:5px">
      <button class="btn small" data-act="clipCopy" ${p && has.length ? '' : 'disabled'} title="Las etiquetas de este patch al portapapeles (Mayús V)">Copiar de este</button>
      <button class="btn small ${c.length && (pending || multi) ? 'primary' : ''}" data-act="clipPaste" ${c.length && p ? '' : 'disabled'} title="Añadir las del portapapeles (V)">${multi ? `Pegar en ${S.multi.size}` : pending || !c.length ? 'Pegar en este' : '✓ Ya las tiene'}</button>
      ${c.length ? html`<button class="btn small" data-act="clipGroup" title="Guardar este conjunto para cargarlo con un clic">Guardar como grupo</button><button class="btn small" data-act="clipClear">Vaciar</button>` : ''}</div>
    ${g.length ? html`<div class="chips" style="margin-top:6px">${g.map((x, i) => html`<span class="tgrp"><button class="tq" data-act="clipLoad" data-i="${i}" title="Cargar en el portapapeles: ${x.join(', ')}">${x.join(' + ')}</button><button class="lk" data-act="clipGroupDel" data-i="${i}" aria-label="Quitar el grupo">×</button></span>`)}</div>` : ''}</div>`;
}
async function clipPaste() {
  const c = clipTags(), ids = clipTargets(); if (!c.length || !ids.length) return;
  await lib.addTags(ids, c);
  rerender(); toast(`${c.join(', ')} → ${ids.length === 1 ? '«' + lib.byId(ids[0]).name + '»' : ids.length + ' patches'}`, 2500);
}
async function clipCopy() {
  const p = cur(), t = p ? p.meta.tags || [] : []; if (!t.length) { toast('Este patch no tiene etiquetas'); return; }
  await setClip(t); rerender(); toast('Copiadas: ' + t.join(', '), 2500);
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
  clipClear: async () => { await setClip([]); rerender(); },
  clipGroup: async () => { const c = clipTags(); if (!c.length) return; const g = tagGroups().filter((x) => x.join('|') !== c.join('|')); await lib.setSetting('tagGroups', [c, ...g].slice(0, 12)); rerender(); },
  clipLoad: async (el) => { const g = tagGroups()[+el.dataset.i]; if (g) { await setClip(g); rerender(); } },
  clipGroupDel: async (el) => { const g = tagGroups().slice(); g.splice(+el.dataset.i, 1); await lib.setSetting('tagGroups', g); rerender(); },
});
