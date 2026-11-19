// ui/mapsel_ui.js — v3.5: seleccionar en el mapa, como en la herramienta de la Rhythm. La selección es la misma que
// la de la biblioteca (S.multi): se escucha, se etiqueta o se lleva a la biblioteca con las acciones de siempre.
//  · arrastrar en el mapa: elegir una zona (Mayús añade, Alt quita)
//  · resaltar por carácter (ajustes y nombre), categoría, tus etiquetas, efectos o una palabra del nombre
//  · los N más parecidos a un patch o a toda la selección (parámetros normalizados)
import { zScoreMap, nearestByZ, rectIds } from '../core/mapsel.js';
import { paramDescriptors } from '../core/classify.js';

let _mz = { key: '', z: null };
function mapZ() {
  const key = lib.patches.length + '|' + (lib.history?.length || 0);
  if (_mz.key !== key) _mz = { key, z: zScoreMap(lib.patches.map((p) => [p.id, lib.vecOf(p)])) };
  return _mz.z;
}
// carácter de un patch: lo que se lee en sus ajustes y lo que dice su nombre
function charsOf(p) { const i = lib.info(p); return [...new Set([...paramDescriptors(i.an).map((d) => d.label), ...(i.cls.descriptors || []).map((d) => d.label)])]; }

// ---------- resaltar ----------
function mapCrit(p, crit) {
  const k = crit.slice(0, crit.indexOf(':')), v = crit.slice(crit.indexOf(':') + 1);
  if (k === 'char') return charsOf(p).includes(v);
  if (k === 'cat') return (effCat(p) || 'none') === v;
  if (k === 'tag') return (p.meta.tags || []).includes(v);
  if (k === 'fx') return (p.meta.tags || []).includes(v) || lib.fxOf(p).some((x) => x.t === v);
  if (k === 'fav') return !!p.meta.fav || (p.meta.rating || 0) >= 4;
  return true;
}
let _mhl = { key: '', set: null };
function mapHLSet() {
  const crit = S.mapHL || '', word = (S.mapWord || '').trim().toLowerCase();
  if (!crit && !word) return null;
  const key = lib.patches.length + '|' + (lib.history?.length || 0) + '|' + crit + '|' + word;
  if (_mhl.key !== key) {
    const set = new Set();
    for (const p of lib.patches) {
      if (crit && !mapCrit(p, crit)) continue;
      if (word && !(`${p.name} ${p.fileName || ''} ${(p.meta.tags || []).join(' ')}`.toLowerCase().includes(word))) continue;
      set.add(p.id);
    }
    _mhl = { key, set };
  }
  return _mhl.set;
}
function mapCount(list) { const m = new Map(); for (const x of list) m.set(x, (m.get(x) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))); }
function mapHLSelect() {
  const cur = S.mapHL || '', o = (v, l) => html`<option value="${v}" ${cur === v ? raw('selected') : ''}>${l}</option>`;
  const chars = mapCount(lib.patches.flatMap(charsOf)), cats = mapCount(lib.patches.map((p) => effCat(p) || 'none'));
  const tags = mapCount(lib.patches.flatMap((p) => p.meta.tags || [])), fx = mapCount(lib.patches.flatMap((p) => lib.fxOf(p).map((x) => x.t)));
  return html`<select id="mapHL" class="sel" aria-label="Resaltar en el mapa"><option value="">Nada</option>
    ${chars.length ? html`<optgroup label="Carácter (ajustes y nombre)">${chars.map(([c, n]) => o('char:' + c, `${c} (${n})`))}</optgroup>` : ''}
    <optgroup label="Categoría">${cats.map(([c, n]) => o('cat:' + c, `${c === 'none' ? 'Sin categoría' : CAT_LABEL[c] || c} (${n})`))}</optgroup>
    <optgroup label="Valoración">${o('fav:1', 'Favoritos y 4–5 estrellas')}</optgroup>
    ${tags.length ? html`<optgroup label="Tus etiquetas">${tags.map(([x, n]) => o('tag:' + x, `${x} (${n})`))}</optgroup>` : ''}
    ${fx.length ? html`<optgroup label="Efectos detectados">${fx.map(([x, n]) => o('fx:' + x, `${x} (${n})`))}</optgroup>` : ''}
  </select>`;
}
function mapHLAct() {
  const hl = mapHLSet();
  if (!hl) return html`<span class="note">Elige un carácter, una etiqueta o escribe una palabra: el resto del mapa se apaga.</span>`;
  return html`<span class="mono">${hl.size} coinciden</span>${hl.size ? html`<button class="btn small" data-act="mapHlSet">Seleccionarlos</button><button class="btn small" data-act="mapHlAdd">Añadir a la selección</button>` : ''}`;
}

// ---------- panel ----------
function mapSelBox() {
  const p = S.sel && lib.byId(S.sel), n = S.mapN || 25, ids = [...S.multi].filter((id) => lib.byId(id));
  return html`<div class="box mapsel"><h3>Seleccionar <small>arrastra en el mapa: Mayús añade, Alt quita</small></h3>
    <div class="msrow"><span class="mlabel">Resaltar</span><div class="row2">${mapHLSelect()}<input id="mapWord" class="inp" type="search" placeholder="palabra del nombre" value="${S.mapWord || ''}" style="width:150px"></div></div>
    <div class="msrow"><span></span><div class="row2" id="mapHlAct">${mapHLAct()}</div></div>
    <div class="msrow"><span class="mlabel">Parecidos</span><div class="row2"><select id="mapN" class="sel" aria-label="Cuántos">${[10, 25, 50, 100].map((k) => html`<option value="${k}" ${n === k ? raw('selected') : ''}>${k}</option>`)}</select>
      ${p ? html`<button class="btn small" data-act="mapNearOne" title="${p.name}: lo selecciona con los más parecidos por sus ajustes">a este patch</button>` : ''}
      ${ids.length ? html`<button class="btn small" data-act="mapNearSel" title="Añade los más parecidos a cualquiera de los seleccionados">a la selección</button>` : ''}
      ${!p && !ids.length ? html`<span class="note">Pulsa un punto primero.</span>` : ''}</div></div>
    <div class="msrow"><span class="mlabel">Selección</span><div><b class="mono">${ids.length}</b> ${ids.length ? html`<span class="note">${ids.slice(0, 6).map((id) => lib.byId(id).name).join(' · ')}${ids.length > 6 ? ` · y ${ids.length - 6} más` : ''}</span>` : html`<span class="note">nada seleccionado</span>`}</div></div>
    ${ids.length ? html`<div class="row2" style="margin-top:6px"><button class="btn small accent" data-act="queueSel">▶ Escuchar</button><button class="btn small" data-act="mapToLib">Ver en la biblioteca</button><button class="btn small" data-act="bulkTags">Etiquetas…</button><button class="btn small" data-act="mapClear">✕ Quitar selección</button></div>` : ''}
  </div>`;
}

// ---------- arrastrar para seleccionar (lo instala drawMap en el lienzo) ----------
function mapSelInstall(cv) {
  const at = (e) => { const b = cv.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  cv.onpointerdown = (e) => { if (e.button !== 0) return; const a = at(e); S._mdrag = { a, b: a, moved: false, mode: e.shiftKey ? 'add' : e.altKey ? 'sub' : 'set' }; };
  cv.onpointermove = (e) => { const d = S._mdrag; if (!d) return; d.b = at(e); if (!d.moved && Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) > 6) d.moved = true; if (d.moved) drawMap(); };
  cv.onpointerup = () => {
    const d = S._mdrag; S._mdrag = null; if (!d || !d.moved) return;
    const ids = rectIds(S.mapPts || [], d.a.x, d.a.y, d.b.x, d.b.y);
    if (d.mode === 'set') S.multi = new Set(ids); else if (d.mode === 'add') ids.forEach((id) => S.multi.add(id)); else ids.forEach((id) => S.multi.delete(id));
    // el clic que pueda llegar tras soltar no elige un punto; si no llega, la marca caduca sola
    S._mdragDone = true; setTimeout(() => { S._mdragDone = false; }, 60);
    rerender();
  };
}
function mapSelDraw(g) {
  const d = S._mdrag; if (!d || !d.moved) return;
  const x = Math.min(d.a.x, d.b.x), y = Math.min(d.a.y, d.b.y), w = Math.abs(d.b.x - d.a.x), h = Math.abs(d.b.y - d.a.y);
  g.fillStyle = d.mode === 'sub' ? 'rgba(255,90,90,.09)' : 'rgba(235,232,227,.08)'; g.fillRect(x, y, w, h);
  g.strokeStyle = d.mode === 'sub' ? '#ff5a5a' : '#ebe8e3'; g.lineWidth = 1; g.setLineDash([5, 4]); g.strokeRect(x, y, w, h); g.setLineDash([]);
}

// ---------- eventos ----------
document.addEventListener('change', (e) => {
  if (e.target.id === 'mapHL') { S.mapHL = e.target.value; rerender(); }
  else if (e.target.id === 'mapN') S.mapN = +e.target.value;
});
document.addEventListener('input', (e) => {
  if (e.target.id !== 'mapWord') return;
  S.mapWord = e.target.value; drawMap();
  const a = $('#mapHlAct'); if (a) a.innerHTML = String(mapHLAct());
});
Object.assign(A, {
  mapHlSet: () => { const hl = mapHLSet(); if (hl) { S.multi = new Set(hl); rerender(); } },
  mapHlAdd: () => { const hl = mapHLSet(); if (hl) { hl.forEach((id) => S.multi.add(id)); rerender(); } },
  mapNearOne: () => { const p = S.sel && lib.byId(S.sel); if (!p) return; S.multi = new Set([p.id, ...nearestByZ(mapZ(), new Set([p.id]), S.mapN || 25).map((x) => x.id)]); rerender(); },
  mapNearSel: () => { const near = nearestByZ(mapZ(), new Set(S.multi), S.mapN || 25); near.forEach((x) => S.multi.add(x.id)); toast(`Añadidos ${near.length} parecidos`); rerender(); },
  mapClear: () => { S.multi.clear(); rerender(); },
  mapToLib: () => { S.q = { ...blankQ(), ids: [...S.multi] }; S.view = 'library'; rerender(); },
});
