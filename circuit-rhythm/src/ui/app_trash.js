// ui/app_trash.js — v1.5: eliminar sin preguntar (Supr) con deshacer, papelera, atajos (?) y etiquetas rápidas (Alt+1…9).
// Eliminar saca el sample de la biblioteca y de los packs y lo recuerda para que no vuelva al releer la carpeta.
// Se recupera con Ctrl+Z o desde la papelera; al vaciarla se puede borrar también el archivo del disco.

const TRASH_DAYS = 30;
async function saveTrash() { await S.lib.kvSet('trash', S.trash); await S.lib.kvSet('excluded', S.excluded); }
const trashCount = () => (S.trash || []).reduce((a, e) => a + e.recs.length, 0);

async function trashSamples(ids) {
  const recs = ids.map((id) => S.byId[id]).filter(Boolean); if (!recs.length) return;
  const set = new Set(recs.map((r) => r.id));
  // en la biblioteca, se pasa al siguiente de la lista
  if (S.view === 'library' && set.has(S.sel)) { const l = filtered(); const i = l.findIndex((x) => x.id === S.sel); const nx = l.slice(i + 1).find((x) => !set.has(x.id)) || l.slice(0, Math.max(0, i)).reverse().find((x) => !set.has(x.id)); S.sel = nx ? nx.id : null; }
  const slots = [];
  for (const p of S.packs) { let ch = false; p.slots.forEach((x, i) => { if (set.has(x)) { slots.push([p.id, i, x]); p.slots[i] = null; ch = true; } }); if (ch) await savePack(p); }
  Player.stop();
  for (const r of recs) { await S.lib.del('samples', r.id); delete S.byId[r.id]; S.multi.delete(r.id); S.excluded[r.sha] = { name: r.name, at: Date.now(), root: r.src?.root || null, rel: r.src?.rel || null }; }
  S.samples = S.samples.filter((x) => !set.has(x.id));
  if (S.listen.queue.length) { const at = S.listen.i; const before = S.listen.queue.slice(0, at).filter((id) => set.has(id)).length; S.listen.queue = S.listen.queue.filter((id) => !set.has(id)); S.listen.i = Math.max(0, at - before); }
  S.trash = [{ id: 'tr_' + Date.now().toString(36), at: Date.now(), recs: recs.map(clean), slots }, ...(S.trash || [])];
  await saveTrash(); invalidateAll(); renderAll();
  const name = recs.length === 1 ? esc(recs[0].name) : t('{n} samples', { n: recs.length });
  toast(`${t('{n} a la papelera', { n: name })} <button class="btn small ghost" data-act="trash-undo">${t('Deshacer')} · Ctrl Z</button>`, 'ok', 8000);
  if (S.view === 'listen' && S.listen.auto && current()) play(current());
}
async function restoreTrash(entryId) {
  const e = (S.trash || []).find((x) => x.id === entryId); if (!e) return 0;
  const back = e.recs.filter((r) => !S.byId[r.id]);
  for (const r of back) { r.user = r.user || {}; S.samples.push(r); S.byId[r.id] = r; delete S.excluded[r.sha]; }
  await saveSamples(back);
  for (const [pid, i, id] of e.slots) { const p = S.packs.find((q) => q.id === pid); if (p && !p.slots[i] && S.byId[id]) { p.slots[i] = id; await savePack(p); } }
  S.trash = S.trash.filter((x) => x !== e); await saveTrash(); invalidateAll();
  if (S.view === 'listen' && back.length) { S.listen.queue.splice(S.listen.i, 0, ...back.map((r) => r.id)); }
  if (back.length === 1) S.sel = back[0].id;
  return back.length;
}
async function undoTrash() {
  const e = (S.trash || [])[0]; if (!e) { toast(t('Nada que deshacer'), 'warn', 2000); return; }
  const n = await restoreTrash(e.id); renderAll(); toast(t('Recuperados: {n}', { n }), 'ok', 2500);
}
// Vaciar: sin vuelta atrás. Los samples copiados al navegador se borran; los de carpetas enlazadas, si se pide, también del disco.
async function purgeTrash(entryIds, { files = false } = {}) {
  const list = (S.trash || []).filter((e) => !entryIds || entryIds.includes(e.id));
  let deleted = 0, failed = 0;
  for (const e of list) for (const r of e.recs) {
    if (r.src?.kind === 'blob' || !r.src) { try { await S.lib.del('blobs', r.sha); } catch {} }
    if (files && r.src?.kind === 'root') { const ok = await deleteFromDisk(r); ok ? deleted++ : failed++; }
  }
  S.trash = (S.trash || []).filter((e) => !list.includes(e)); await saveTrash();
  return { n: list.reduce((a, e) => a + e.recs.length, 0), deleted, failed };
}
async function deleteFromDisk(r) {
  const root = S.roots.get(r.src.root); if (!root) return false;
  try {
    if ((await root.handle.queryPermission?.({ mode: 'readwrite' })) !== 'granted' && (await root.handle.requestPermission?.({ mode: 'readwrite' })) !== 'granted') return false;
    const segs = r.src.rel.split('/'); let d = root.handle;
    for (const x of segs.slice(0, -1)) d = await d.getDirectoryHandle(x);
    await d.removeEntry(segs.at(-1));
    return true;
  } catch { return false; }
}
// al cargar: lo que lleva más de 30 días en la papelera se vacía solo (sin tocar el disco)
async function autoPurge() { const old = (S.trash || []).filter((e) => Date.now() - e.at > TRASH_DAYS * 864e5).map((e) => e.id); if (old.length) await purgeTrash(old); }

function trashHTML() {
  const list = S.trash || [], n = trashCount(), linked = list.some((e) => e.recs.some((r) => r.src?.kind === 'root'));
  const when = (at) => new Date(at).toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `<section class="panel"><h2>${t('Papelera')} <span class="muted mono">${n}</span></h2>
    <p class="note" style="margin-top:0">${t('Lo que eliminas con Supr (en Escucha o en la biblioteca) viene aquí: sale de la biblioteca y de los packs, y no vuelve aunque releas la carpeta. Se recupera con su sitio en los packs. A los {d} días se vacía sola.', { d: TRASH_DAYS })}</p>
    ${list.length ? `<table class="t otab">${list.map((e) => `<tr><td class="mono muted">${when(e.at)}</td><td class="nmc">${e.recs.slice(0, 5).map((r) => esc(r.name)).join(' · ')}${e.recs.length > 5 ? ` <span class="muted">${t('… y {n} más', { n: e.recs.length - 5 })}</span>` : ''}</td>
      <td class="acts"><button class="btn small" data-act="trash-restore" data-id="${e.id}">${t('Recuperar')}</button><button class="btn small danger" data-act="trash-purge" data-id="${e.id}">${t('Eliminar definitivamente')}</button></td></tr>`).join('')}</table>
      <div class="row" style="margin-top:10px"><span class="grow"></span><button class="btn danger" data-act="trash-empty">${t('Vaciar la papelera ({n})', { n })}</button></div>
      ${linked ? `<p class="note">${t('Al eliminar definitivamente puedes borrar también los archivos de tus carpetas enlazadas (el navegador pedirá permiso de escritura). Si no, siguen en tu disco y la herramienta los ignora al releer la carpeta.')}</p>` : ''}`
      : `<div class="empty"><p class="muted">${t('La papelera está vacía. Pulsa Supr mientras escuchas para quitar de en medio los samples que no quieras.')}</p></div>`}
    ${Object.keys(S.excluded || {}).length ? `<div class="sep"></div><p class="note">${t('{n} archivos ignorados al leer tus carpetas (eliminados antes).', { n: Object.keys(S.excluded).length })} <button class="btn small ghost" data-act="trash-unexclude">${t('Volver a admitirlos')}</button></p>` : ''}
  </section>`;
}
function purgeAsk(ids) {
  const list = (S.trash || []).filter((e) => !ids || ids.includes(e.id)), n = list.reduce((a, e) => a + e.recs.length, 0);
  const linked = list.reduce((a, e) => a + e.recs.filter((r) => r.src?.kind === 'root').length, 0);
  modal(`<h2>${t('Eliminar definitivamente {n} samples', { n })}</h2><p class="note">${t('Ya no se podrán recuperar desde la herramienta.')}</p>
    ${linked ? `<label class="inl"><input type="checkbox" id="purge-files"> ${t('Borrar también {n} archivos de tus carpetas enlazadas (no se puede deshacer)', { n: linked })}</label>` : ''}
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-act="modal-close">${t('Cancelar')}</button><button class="btn danger" data-act="trash-purge-ok" data-ids="${ids ? ids.join(',') : ''}">${t('Eliminar')}</button></div>`);
}

// ---------- atajos ----------
const KEYS_HELP = () => [
  [t('Siempre'), [['Ctrl K', t('paleta: ir a, hacer o buscar un sample')], ['.', t('abrir o cerrar «Sample actual»')], ['/', t('buscar')], ['Ctrl Z', t('deshacer la última eliminación (en Packs, el último cambio del pack)')], ['?', t('esta ayuda')]]],
  [t('Escucha y biblioteca'), [[t('Espacio'), t('escuchar')], ['Alt V', t('pegar las etiquetas del portapapeles')], ['Alt ' + t('Mayús') + ' V', t('copiar las etiquetas del sample')], ['← → ↑ ↓', t('anterior / siguiente')], ['K S C H O Y T E', t('baterías (en un loop: Drum loop › ese instrumento)')], ['B L P X V', t('bajo, synth, atmos, FX y voz')], ['D M', t('loops de batería o melódicos de varios instrumentos')], ['W', t('loop / one-shot: la carpeta cambia con el tipo')], [t('Intro'), t('aceptar la propuesta')], ['G', t('subcarpeta propuesta')], ['1–5 · 0', t('valorar / quitar valoración')], ['F', t('favorito')], [t('Supr'), t('eliminar (a la papelera) y pasar al siguiente')], [t('Mayús') + ' ' + t('Supr'), t('marcar «Descartado» sin eliminar')], ['Alt 1–9', t('poner o quitar una etiqueta rápida')], ['R', t('original / como en la Rhythm')], ['Tab', 'A/B'], [t('Mayús') + ' 1–8', t('barrer una macro')]]],
  [t('Packs'), [['← → ↑ ↓', t('moverse por los slots')], [t('Espacio'), t('escuchar')], [t('Supr'), t('vaciar el slot')], ['Ctrl Z', t('deshacer')]]],
  [t('Canciones'), [[t('Espacio'), t('escuchar / parar')], ['N', t('otra canción')], ['P', t('otros patrones')], ['E', t('otra estructura')], ['1–5', t('estrategia')]]],
];
function showKeys() {
  modal(`<h2>${t('Atajos de teclado')}</h2><div class="keyshelp">${KEYS_HELP().map(([g, l]) => `<div><h4>${g}</h4><dl>${l.map(([k, d]) => `<dt>${k.split(' ').map((x) => `<kbd>${esc(x)}</kbd>`).join('')}</dt><dd>${d}</dd>`).join('')}</dl></div>`).join('')}</div>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-act="modal-close">${t('Cerrar')}</button></div>`);
}
// etiquetas rápidas: las 9 primeras de la paleta
const quickTags = () => { const p = palette(); return PALETTE_GROUPS.flatMap((g) => p[g]).slice(0, 9); };

Object.assign(ACT, {
  'trash-undo': () => undoTrash(),
  'trash-del': () => trashSamples(S.multi.size && S.view === 'library' ? [...S.multi] : [current()?.id].filter(Boolean)),
  'trash-restore': async (el) => { const n = await restoreTrash(el.dataset.id); toast(t('Recuperados: {n}', { n })); renderAll(); },
  'trash-purge': (el) => purgeAsk([el.dataset.id]),
  'trash-empty': () => purgeAsk(null),
  'trash-purge-ok': async (el) => {
    const files = document.getElementById('purge-files')?.checked || false; const ids = el.dataset.ids ? el.dataset.ids.split(',') : null; closeModal();
    const r = await purgeTrash(ids, { files });
    toast(t('{n} samples eliminados definitivamente.', { n: r.n }) + (files ? ' ' + t('Archivos borrados del disco: {d}.', { d: r.deleted }) + (r.failed ? ` <span class="warn">${t('{f} no se pudieron borrar (permiso o archivo movido).', { f: r.failed })}</span>` : '') : ''), r.failed ? 'warn' : 'ok', 7000);
    renderAll();
  },
  'trash-unexclude': async () => { S.excluded = {}; await saveTrash(); toast(t('Se volverán a importar al releer tus carpetas.')); renderAll(); },
  'keys-help': () => showKeys(),
});

document.addEventListener('keydown', (ev) => {
  if (ev.target.matches?.('input,textarea,select') && !['checkbox', 'radio', 'range'].includes(ev.target.type)) return;
  if (document.getElementById('modal').classList.contains('on') || document.getElementById('cpal')?.classList.contains('on')) return;
  if (ev.key === '?') { ev.preventDefault(); ev.stopPropagation(); showKeys(); return; }
  const lib = S.view === 'library' && (S.libMode || 'list') === 'list', lis = S.view === 'listen';
  if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === 'z' && S.view !== 'packs') { ev.preventDefault(); ev.stopPropagation(); undoTrash(); return; }
  if (!lib && !lis) return;
  if ((ev.key === 'Delete' || ev.key === 'Backspace') && !ev.ctrlKey && !ev.metaKey) {
    ev.preventDefault(); ev.stopPropagation();
    if (ev.shiftKey) { if (current()) ACT.discard(); return; }
    ACT['trash-del'](); return;
  }
  if (ev.altKey && /^Digit[1-9]$/.test(ev.code)) {
    const tag = quickTags()[+ev.code.slice(5) - 1], s = current(); if (!tag || !s) return;
    ev.preventDefault(); ev.stopPropagation();
    const on = tagsOf(s).includes(tag);
    (on ? removeTag([s], tag) : addTags([s], [tag])).then(() => { toast(`${on ? t('Quitada') : t('Etiqueta')}: ${esc(tagName(tag))}`, 'ok', 1400); refresh(); });
  }
}, true);
