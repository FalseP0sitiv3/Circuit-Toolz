// ui/app_dock.js — v1.4: «Sample actual» siempre a mano y paleta de órdenes (Ctrl K), como en la herramienta de Tracks.
// El dock muestra el sample elegido en cualquier vista (packs, mapa, patrones, canciones…) sin tener que volver a
// 01 Biblioteca: escuchar, categoría, subcarpeta, etiquetas, valoración y al pack. «.» lo abre y lo cierra.

function dockSample() {
  if (S.view === 'listen') return current();
  return S.byId[S.sel] || null;
}
function paintDock() {
  let el = document.getElementById('dock');
  const show = S.dock && S.view !== 'library' && S.view !== 'listen' && S.samples.length;
  document.body.classList.toggle('docked', !!show);
  if (!show) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('aside'); el.id = 'dock'; el.className = 'dock'; el.setAttribute('aria-label', t('Sample actual')); document.body.appendChild(el); }
  const s = dockSample();
  if (!s) { el.innerHTML = `<div class="row"><b class="grow">${t('Sample actual')}</b><button class="btn small ghost" data-act="dock-close" aria-label="${t('Cerrar')}">✕</button></div><p class="muted">${t('Elige un sample (en el mapa, un slot del pack, Ctrl K…).')}</p>`; return; }
  const c = clsOf(s), u = s.user || {}, a = s.analysis || {};
  el.innerHTML = `<div class="row"><span class="lbl">${t('Sample actual')}</span><span class="grow"></span><button class="btn small ghost" data-act="dock-full" title="${t('Abrir su ficha en 01 Biblioteca')}">${t('Ficha')}</button><button class="btn small ghost" data-act="dock-close" aria-label="${t('Cerrar')}" title=".">✕</button></div>
    <div class="dnm">${esc(s.name.replace(/\.(wav|aiff?|mp3|flac|ogg)$/i, ''))}</div>
    <div class="row dmeta"><button class="btn small primary" data-act="dock-play">${Player.playing ? '■' : '▶'}</button><span class="mono">${fmtDur(sampleSeconds(s))}</span>${a.note && a.f0conf > 0.6 ? `<span class="mono">${a.note}</span>` : ''}<span class="grow"></span>${rateHTML(s).replaceAll('data-act="rate"', `data-act="dock-rate" data-id="${s.id}"`)}<button class="btn small ${u.fav ? 'on' : ''}" data-act="dock-fav">♥</button></div>
    <div class="row"><span class="lbl">${t('Categoría')}</span><select id="dock-cat"><option value="">${c.cat ? `${catLabel(c.cat)} · ${t('propuesta')}` : t('Sin categoría')}</option>${CATS.map((k) => `<option value="${k.id}" ${u.cat === k.id ? 'selected' : ''}>${catLabel(k.id)}</option>`).join('')}</select><span class="cert ${c.cert}">${CERT_LABEL()[c.cert]}</span></div>
    ${orgDetailHTML(s, { compact: true })}
    <div class="row" style="margin-top:6px">${S.pack ? `<button class="btn small" data-act="dock-pack">${t('Añadir a «{p}»', { p: esc(S.pack.name) })}</button>` : ''}<span class="grow"></span><span class="dim">.  ·  Ctrl K</span></div>`;
}
Object.assign(ACT, {
  'dock-close': () => { S.dock = false; paintDock(); },
  'dock-full': () => { const s = dockSample(); if (!s) return; S.sel = s.id; S.dock = false; S.libMode = 'list'; go('library'); },
  'dock-play': () => { const s = dockSample(); if (s) { play(s); setTimeout(paintDock, 50); } },
  'dock-rate': async (el) => { const s = S.byId[el.dataset.id]; const v = +el.dataset.v; s.user.rating = s.user.rating === v ? 0 : v; S.ver++; await saveSample(s); paintDock(); },
  'dock-fav': async () => { const s = dockSample(); s.user.fav = !s.user.fav; S.ver++; await saveSample(s); paintDock(); },
  palette: () => openPalette(),
  'dock-pack': () => { const s = dockSample(); if (s) addToPack([s.id]); },
});
document.addEventListener('change', async (ev) => {
  if (ev.target.id !== 'dock-cat') return;
  const s = dockSample(); if (!s) return;
  if (ev.target.value) { assignCat(s, ev.target.value); s.user.heard = true; delete s.user.via; saveLearned(); } else { delete s.user.cat; delete s.user.via; }
  invalidateAll(); await saveSample(s); renderHeader(); paintDock();
});
// Elegir un sample fuera de la biblioteca lo abre en el dock, en el sitio
function pickInPlace(id) { S.sel = id; if (S.view !== 'library' && S.view !== 'listen') { S.dock = true; paintDock(); } }

// ---------- paleta de órdenes ----------
const Pal = { q: '', i: 0, items: [] };
function paletteItems(q) {
  const T = TABS();
  const cmd = [
    ...T.map(([v, n, l]) => ({ k: 'go', label: `${n} ${l}`, hint: t('ir'), run: () => go(v) })),
    { label: t('Biblioteca: Reanalizar (categoría por parecido, subcarpetas, efectos)'), run: () => { S.libMode = 'rean'; go('library'); } },
    { label: t('Biblioteca: Carpetas y etiquetas'), run: () => { S.libMode = 'tax'; go('library'); } },
    { label: t('Acortar loops que se repiten (ahorrar tiempo del pack)'), run: () => { S.libMode = 'short'; go('library'); } },
    { label: t('Escuchar los dudosos'), run: () => { S.listen.src = 'doubt'; go('listen'); } },
    { label: S.dock ? t('Cerrar «Sample actual»') : t('Abrir «Sample actual»'), hint: '.', run: () => { S.dock = !S.dock; paintDock(); } },
    { label: t('Nuevo pack'), run: async () => { await newPack(); go('packs'); } },
    ...(S.pack ? [{ label: t('Exportar «{p}» para Components', { p: S.pack.name }), run: () => ACT['exp-components']() }] : []),
    { label: t('Enlazar carpeta de samples'), run: () => ACT.link() },
    { label: t('Descargar copia de seguridad'), run: () => ACT.backup() },
    { label: t('Canción: otra canción'), run: () => { go('songs'); ACT['sg-new'](); } },
    ...allTags().slice(0, 30).map(([x, n]) => ({ label: t('Filtrar por etiqueta «{t}»', { t: tagName(x) }), hint: String(n), run: () => { S.libMode = 'list'; S.f = { ...S.f, tag: x }; go('library'); } })),
    ...CATS.map((c) => ({ label: t('Ver {c} en la biblioteca', { c: catLabel(c.id) }), run: () => { S.libMode = 'list'; S.f = { ...S.f, cat: c.id, sub: '' }; go('library'); } })),
  ];
  const norm = (x) => translit(String(x)).toLowerCase();
  const qs = norm(q).split(/\s+/).filter(Boolean);
  const match = (l) => qs.every((w) => norm(l).includes(w));
  const out = cmd.filter((c) => !qs.length || match(c.label)).slice(0, qs.length ? 12 : 14);
  if (qs.length && q.trim().length >= 2) {
    const hits = [];
    for (const s of S.samples) { if (match(s.name + ' ' + (s.user?.tags || []).join(' '))) { hits.push(s); if (hits.length >= 10) break; } }
    out.push(...hits.map((s) => ({ k: 'sample', label: s.name, hint: catLabel(clsOf(s).cat), run: () => { if (S.view === 'library' || S.view === 'listen') { S.libMode = 'list'; S.sel = s.id; go('library'); } else { pickInPlace(s.id); play(s); } } })));
  }
  return out;
}
function openPalette() {
  Pal.q = ''; Pal.i = 0;
  let el = document.getElementById('cpal');
  if (!el) { el = document.createElement('div'); el.id = 'cpal'; el.className = 'cpal'; el.innerHTML = `<div class="cbox" role="dialog" aria-label="${t('Paleta de órdenes')}"><input id="cpal-q" type="text" autocomplete="off" placeholder="${t('Ir a, hacer o buscar un sample…')}"><div id="cpal-l" role="listbox"></div></div>`; document.body.appendChild(el); }
  el.classList.add('on'); const inp = document.getElementById('cpal-q'); inp.value = ''; paintPalette(); inp.focus();
}
function closePalette() { document.getElementById('cpal')?.classList.remove('on'); document.getElementById('cpal-q')?.blur(); }
function paintPalette() {
  Pal.items = paletteItems(Pal.q); Pal.i = Math.min(Pal.i, Math.max(0, Pal.items.length - 1));
  const l = document.getElementById('cpal-l'); if (!l) return;
  l.innerHTML = Pal.items.length ? Pal.items.map((x, i) => `<button class="citem ${i === Pal.i ? 'on' : ''} ${x.k === 'sample' ? 'smp' : ''}" data-pi="${i}" role="option" aria-selected="${i === Pal.i}"><span>${esc(x.label)}</span>${x.hint ? `<span class="dim">${esc(x.hint)}</span>` : ''}</button>`).join('') : `<p class="muted" style="padding:8px 12px">${t('Nada con eso.')}</p>`;
  l.querySelector('.citem.on')?.scrollIntoView({ block: 'nearest' });
}
async function runPalette(i) { const x = Pal.items[i]; closePalette(); if (x) await x.run(); }
document.addEventListener('input', (ev) => { if (ev.target.id === 'cpal-q') { Pal.q = ev.target.value; Pal.i = 0; paintPalette(); } });
document.addEventListener('click', (ev) => {
  const it = ev.target.closest?.('.citem'); if (it) { ev.stopPropagation(); runPalette(+it.dataset.pi); return; }
  if (ev.target.id === 'cpal') closePalette();
}, true);
document.addEventListener('keydown', (ev) => {
  const open = document.getElementById('cpal')?.classList.contains('on');
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); ev.stopPropagation(); open ? closePalette() : openPalette(); return; }
  if (open) {
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closePalette(); }
    else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); ev.stopPropagation(); Pal.i = Math.max(0, Math.min(Pal.items.length - 1, Pal.i + (ev.key === 'ArrowDown' ? 1 : -1))); paintPalette(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); runPalette(Pal.i); }
    else ev.stopPropagation();
    return;
  }
  if (ev.key === '.' && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !ev.target.matches?.('input,textarea,select') && !document.getElementById('modal').classList.contains('on')) {
    if (S.view === 'library' || S.view === 'listen') return;
    ev.preventDefault(); S.dock = !S.dock; paintDock();
  }
}, true);
