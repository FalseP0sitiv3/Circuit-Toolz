// ui/app_mapsel.js — v2.0: seleccionar en el mapa. La selección es la misma que la de la biblioteca (S.multi),
// así lo elegido aquí se escucha, va al pack o se etiqueta con las acciones de siempre.
//  · arrastrar en el mapa: elegir una zona (Mayús añade, Alt quita)
//  · resaltar por categoría, loop / one-shot, carácter medido, tus etiquetas, lo detectado o una palabra del nombre
//  · los N más parecidos a un sample o a toda la selección (rasgos medidos normalizados)
import { zVectors, nearestIds, measuredChar, inRect, MEASURED_CHARS, kmeansGroups } from '../core/map.js';
import { kindOf } from '../core/pack.js';
import { CATS } from '../core/classify.js';

let _mz = { key: '', z: null };
function mapZ() {
  const key = S.ver + '|' + S.samples.length;
  if (_mz.key !== key) _mz = { key, z: zVectors(S.samples.filter((s) => s.analysis?.bands && !s.user?.discard).map((s) => ({ id: s.id, analysis: s.analysis }))) };
  return _mz.z;
}

// ---------- resaltar ----------
function hlMatch(s, crit) {
  const [k, v] = [crit.slice(0, crit.indexOf(':')), crit.slice(crit.indexOf(':') + 1)];
  if (k === 'cat') return clsOf(s).cat === v;
  if (k === 'kind') return kindOf(s) === v;
  if (k === 'ch') return measuredChar(s.analysis).includes(v);
  if (k === 'tag') return (s.user?.tags || []).includes(v);
  if (k === 'det') return (s.user?.tags || []).includes(v) || propsOf(s).tags.some((x) => x.tag === v);
  if (k === 'fav') return !!s.user?.fav || (s.user?.rating || 0) >= 4;
  return true;
}
let _hl = { key: '', set: null };
function mapHLSet() {
  const crit = S.mapHL || '', word = (S.mapWord || '').trim().toLowerCase();
  if (!crit && !word) return null;
  const key = S.ver + '|' + S.learnVer + '|' + crit + '|' + word;
  if (_hl.key !== key) {
    const set = new Set();
    for (const p of mapPoints()) {
      const s = S.byId[p.id]; if (!s) continue;
      if (crit && !hlMatch(s, crit)) continue;
      if (word && !(s.name.toLowerCase().includes(word) || (s.user?.tags || []).some((x) => x.toLowerCase().includes(word)))) continue;
      set.add(p.id);
    }
    _hl = { key, set };
  }
  return _hl.set;
}
function hlSelectHTML() {
  const cur = S.mapHL || '', o = (v, l) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`;
  const det = new Map(); for (const s of S.samples) if (!s.user?.discard) for (const x of propsOf(s).tags) det.set(x.tag, (det.get(x.tag) || 0) + 1);
  const mine = allTags();
  return `<select id="maphl" title="${t('Resaltar en el mapa')}"><option value="">${t('Nada')}</option>
    <optgroup label="${t('Carácter medido')}">${MEASURED_CHARS.map((c) => o('ch:' + c, t(c))).join('')}</optgroup>
    <optgroup label="${t('Categoría')}">${CATS.map((c) => o('cat:' + c.id, catLabel(c.id))).join('')}</optgroup>
    <optgroup label="${t('Tipo')}">${o('kind:loop', t('Loops'))}${o('kind:oneshot', t('One-shots'))}${o('fav:1', t('Favoritos y 4–5 estrellas'))}</optgroup>
    ${mine.length ? `<optgroup label="${t('Tus etiquetas')}">${mine.map(([x, n]) => o('tag:' + x, `${tagName(x)} (${n})`)).join('')}</optgroup>` : ''}
    ${det.size ? `<optgroup label="${t('Detectado (nombre y sonido)')}">${[...det].sort((a, b) => b[1] - a[1]).map(([x, n]) => o('det:' + x, `${tagName(x)} (${n})`)).join('')}</optgroup>` : ''}
  </select>`;
}
function hlActHTML() {
  const hl = mapHLSet();
  if (!hl) return `<span class="muted">${t('Elige un carácter, una etiqueta o escribe una palabra: el resto del mapa se apaga.')}</span>`;
  return `<span class="mono">${t('{n} coinciden', { n: hl.size })}</span>${hl.size ? `<button class="btn small" data-act="map-hl-set">${t('Seleccionarlos')}</button><button class="btn small ghost" data-act="map-hl-add">${t('Añadir a la selección')}</button>` : ''}`;
}

// ---------- panel ----------
function mapSelHTML() {
  const sel = S.byId[S.sel], n = S.mapN || 25, ids = [...S.multi].filter((id) => S.byId[id]);
  const list = ids.slice(0, 10).map((id) => { const s = S.byId[id]; return `<button data-act="map-pick" data-id="${id}"><span style="color:${catVar(clsOf(s).cat)}">■</span> ${esc(s.name)}</button>`; }).join('');
  return `<div class="panel mapsel"><h2>${t('Seleccionar')}</h2>
    <p class="note" style="margin-top:0">${t('Arrastra en el mapa para elegir una zona: Mayús añade, Alt quita. Lo seleccionado es lo mismo que en la Biblioteca.')}</p>
    <div class="mrow"><span class="lbl">${t('Resaltar')}</span><div>${hlSelectHTML()} <input type="search" id="mapword" placeholder="${t('palabra del nombre')}" value="${esc(S.mapWord || '')}" style="width:150px"></div></div>
    <div class="mrow"><span></span><div class="row" id="maphlact">${hlActHTML()}</div></div>
    <div class="mrow"><span class="lbl">${t('Parecidos')}</span><div class="row"><select id="mapn">${[10, 25, 50, 100].map((k) => `<option value="${k}" ${n === k ? 'selected' : ''}>${k}</option>`).join('')}</select>
      ${sel ? `<button class="btn small" data-act="map-near-one" title="${t('Selecciona este sample y los más parecidos por lo medido')}">${t('a «{n}»', { n: esc(sel.name.replace(/\.\w+$/, '').slice(0, 24)) })}</button>` : ''}
      ${ids.length ? `<button class="btn small ghost" data-act="map-near-sel" title="${t('Añade los más parecidos a cualquiera de los seleccionados')}">${t('a la selección')}</button>` : ''}
      ${!sel && !ids.length ? `<span class="muted">${t('Pulsa un punto primero.')}</span>` : ''}</div></div>
    <h3 style="margin:12px 0 6px">${t('Selección')} · <span class="mono">${ids.length}</span></h3>
    ${ids.length ? `<div class="sim">${list}</div>${ids.length > 10 ? `<p class="muted" style="margin:4px 0">${t('…y {n} más', { n: ids.length - 10 })}</p>` : ''}
      <div class="row" style="margin-top:8px;flex-wrap:wrap"><button class="btn small primary" data-act="multi-listen">▶ ${t('Escuchar')}</button><button class="btn small" data-act="map-to-lib">${t('Ver en la biblioteca')}</button>${S.pack ? `<button class="btn small" data-act="multi-pack">${t('Al pack')}</button>` : ''}<button class="btn small" data-act="multi-org">${t('Carpeta y etiquetas')}</button><button class="btn small ghost" data-act="map-clear">✕ ${t('Quitar selección')}</button></div>`
      : `<p class="muted">${t('Nada seleccionado.')}</p>`}
  </div>`;
}
function mapRefresh() { if (S.view === 'map') renderView(); }

// ---------- v2.1: grupos de sonidos parecidos (como los clusters de la herramienta de Tracks) ----------
const GROUP_COLORS = ['#ff7a1a', '#e8336d', '#7a4dff', '#4aa3e8', '#34f0e6', '#3ecf8e', '#f0b232', '#c9a27a', '#ff4f8b', '#5b5fd0', '#a7c9a0', '#d99fc0'];
let _mg = { key: '', r: null };
function mapGroups() {
  const z = mapZ();
  if (_mg.key !== _mz.key) {
    const r = kmeansGroups(z);
    for (const g of r.groups) {
      const ss = g.ids.map((id) => S.byId[id]).filter(Boolean), n = ss.length;
      const cats = new Map(); for (const s of ss) { const c = clsOf(s).cat || 'none'; cats.set(c, (cats.get(c) || 0) + 1); }
      const [cat, cn] = [...cats].sort((a, b) => b[1] - a[1])[0] || ['none', 0];
      const ch = new Map(); for (const s of ss) for (const c of measuredChar(s.analysis)) ch.set(c, (ch.get(c) || 0) + 1);
      g.cat = cat; g.share = n ? cn / n : 0;
      g.chars = [...ch].filter(([, k]) => k / n >= 0.5).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);
    }
    _mg = { key: _mz.key, r };
  }
  return _mg.r;
}
function groupColorOf(id) { const g = mapGroups().of.get(id); return g == null ? '#3a3a40' : GROUP_COLORS[g % GROUP_COLORS.length]; }
function mapGroupsHTML() {
  const r = mapGroups(); if (!r.k) return '';
  return `<div class="panel mapgroups"><h2>${t('Grupos de sonidos parecidos')}</h2>
    <p class="note" style="margin-top:0">${t('La herramienta agrupa tu colección por lo que mide. Pulsa un grupo para seleccionarlo; con «Color: Grupo» se ven en el mapa.')}</p>
    <div class="sim">${r.groups.map((g) => `<button data-act="map-group" data-v="${g.id}"><span style="color:${GROUP_COLORS[g.id % GROUP_COLORS.length]}">●</span> <b>${g.cat === 'none' ? t('Sin categoría') : catLabel(g.cat)}</b>${g.share < 0.999 ? ` <span class="dim">${Math.round(g.share * 100)} %</span>` : ''} · <span class="mono">${g.ids.length}</span>${g.chars.length ? ` <span class="dim">· ${g.chars.map((c) => t(c)).join(', ')}</span>` : ''}</button>`).join('')}</div></div>`;
}

// ---------- arrastrar para seleccionar ----------
function mapToXY(ev) {
  const cv = document.getElementById('mapcv'), rc = cv.getBoundingClientRect(), { W, H, sc } = _map.box;
  const px = (ev.clientX - rc.left) * devicePixelRatio, py = (ev.clientY - rc.top) * devicePixelRatio;
  return { px, py, x: (px - W / 2) / sc, y: (H / 2 - py) / sc };
}
document.addEventListener('pointerdown', (ev) => {
  if (S.view !== 'map' || ev.button !== 0 || !ev.target.closest('#mapcv') || !_map.box) return;
  const a = mapToXY(ev);
  S._mdrag = { a, b: a, moved: false, mode: ev.shiftKey ? 'add' : ev.altKey ? 'sub' : 'set' };
});
document.addEventListener('pointermove', (ev) => {
  const d = S._mdrag; if (!d || S.view !== 'map') return;
  d.b = mapToXY(ev);
  if (!d.moved && Math.hypot(d.b.px - d.a.px, d.b.py - d.a.py) > 6 * devicePixelRatio) d.moved = true;
  if (d.moved) drawMap();
});
document.addEventListener('pointerup', () => {
  const d = S._mdrag; if (!d) return;
  if (!d.moved) { S._mdrag = null; return; }
  const ids = inRect(mapPoints(), d.a.x, d.a.y, d.b.x, d.b.y);
  if (d.mode === 'set') S.multi = new Set(ids);
  else if (d.mode === 'add') ids.forEach((id) => S.multi.add(id));
  else ids.forEach((id) => S.multi.delete(id));
  // el clic que pueda llegar tras soltar no elige un punto; si no llega, la marca caduca sola
  S._mdragDone = true; S._mdrag = null; setTimeout(() => { S._mdragDone = false; }, 60);
  mapRefresh();
});
// rectángulo mientras se arrastra (lo llama drawMap)
function drawMapDrag(g) {
  const d = S._mdrag; if (!d || !d.moved) return;
  const x = Math.min(d.a.px, d.b.px), y = Math.min(d.a.py, d.b.py), w = Math.abs(d.b.px - d.a.px), h = Math.abs(d.b.py - d.a.py);
  g.fillStyle = d.mode === 'sub' ? '#ff5a5a18' : '#ebe8e314'; g.fillRect(x, y, w, h);
  g.strokeStyle = d.mode === 'sub' ? '#ff5a5a' : '#ebe8e3'; g.lineWidth = devicePixelRatio; g.setLineDash([5 * devicePixelRatio, 4 * devicePixelRatio]); g.strokeRect(x, y, w, h); g.setLineDash([]);
}

// ---------- eventos ----------
document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.id === 'maphl') { S.mapHL = el.value; mapRefresh(); }
  else if (el.id === 'mapn') { S.mapN = +el.value; }
});
document.addEventListener('input', (ev) => {
  if (ev.target.id !== 'mapword') return;
  S.mapWord = ev.target.value; drawMap();
  const a = document.getElementById('maphlact'); if (a) a.innerHTML = hlActHTML();
});
Object.assign(ACT, {
  'map-hl-set': () => { const hl = mapHLSet(); if (hl) { S.multi = new Set(hl); mapRefresh(); } },
  'map-hl-add': () => { const hl = mapHLSet(); if (hl) { hl.forEach((id) => S.multi.add(id)); mapRefresh(); } },
  'map-near-one': () => { const s = S.byId[S.sel]; if (!s) return; S.multi = new Set([s.id, ...nearestIds(mapZ(), new Set([s.id]), S.mapN || 25).map((x) => x.id)]); mapRefresh(); },
  'map-near-sel': () => { const near = nearestIds(mapZ(), new Set(S.multi), S.mapN || 25); near.forEach((x) => S.multi.add(x.id)); toast(t('Añadidos {n} parecidos.', { n: near.length }), 'ok', 2500); mapRefresh(); },
  'map-clear': () => { S.multi.clear(); mapRefresh(); },
  'map-group': (el) => { const g = mapGroups().groups.find((x) => x.id === +el.dataset.v); if (g) { S.multi = new Set(g.ids); mapRefresh(); } },
  'map-to-lib': () => { S.libMode = 'list'; S.f = { ...S.f, q: '', cat: 'all', cert: 'all', flag: 'sel', tag: '', sub: '', words: [], kind: '' }; go('library'); },
});
