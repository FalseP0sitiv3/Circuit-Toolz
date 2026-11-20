// ui/app_tagclip.js — v2.4: portapapeles de etiquetas, como en la herramienta de Tracks (3.9).
// Copiar las etiquetas de un sample (Alt Mayús V), pegarlas en el que escuchas o en la selección (Alt V; la V sola
// ya es «Vox» al decidir) y guardar conjuntos como grupos para cargarlos con un clic. Viven en los ajustes
// (S.set.tagClip, S.set.tagGroups), así que viajan en la copia de seguridad.
const clipList = () => (Array.isArray(S.set.tagClip) ? S.set.tagClip : []);
const clipGroups = () => (Array.isArray(S.set.tagGroups) ? S.set.tagGroups : []);
async function clipSet(tags) { S.set.tagClip = [...new Set(tags.map((x) => String(x).trim().slice(0, 24)).filter(Boolean))].slice(0, 12); await saveSettings(); }
function clipTargetsOf(s) { return S.view === 'library' && S.multi.size > 1 ? [...S.multi].map((id) => S.byId[id]).filter(Boolean) : s ? [s] : []; }
function tagClipHTML(s) {
  const c = clipList(), g = clipGroups(), has = s ? tagsOf(s) : [], multi = S.view === 'library' && S.multi.size > 1;
  const pending = c.filter((x) => !has.includes(x)).length;
  return `<div class="orow tclip"><span class="lbl">${t('Portapapeles')}</span><div>
    <span class="chips">${c.map((x) => `<span class="chip2 on clip">${esc(tagName(x))}<button data-act="clip-del" data-v="${esc(x)}" aria-label="${t('Quitar')}">✕</button></span>`).join('')}
      <input type="text" class="clipin" placeholder="${c.length ? t('Añadir…') : t('Escribe una etiqueta, o copia las de un sample')}" maxlength="24" list="o-taglist"></span>
    <div class="row" style="gap:5px;margin-top:5px;flex-wrap:wrap">
      <button class="btn small" data-act="clip-copy" data-id="${s ? s.id : ''}" ${s && has.length ? '' : 'disabled'} title="${t('Las etiquetas de este sample al portapapeles')} (Alt ${t('Mayús')} V)">${t('Copiar de este')}</button>
      <button class="btn small ${c.length && (pending || multi) ? 'primary' : ''}" data-act="clip-paste" data-id="${s ? s.id : ''}" ${c.length && s ? '' : 'disabled'} title="${t('Añadir las del portapapeles')} (Alt V)">${multi ? t('Pegar en {n}', { n: S.multi.size }) : pending || !c.length ? t('Pegar en este') : '✓ ' + t('Ya las tiene')}</button>
      ${c.length ? `<button class="btn small ghost" data-act="clip-group" title="${t('Guardar este conjunto para cargarlo con un clic')}">${t('Guardar como grupo')}</button><button class="btn small ghost" data-act="clip-clear">${t('Vaciar')}</button>` : ''}
      <span class="muted" style="font-size:12px"><span class="kbd">Alt V</span> ${t('pegar')} · <span class="kbd">Alt ${t('Mayús')} V</span> ${t('copiar')}</span></div>
    ${g.length ? `<div class="chips" style="margin-top:5px">${g.map((x, i) => `<span class="tgrp"><button class="chip2" data-act="clip-load" data-i="${i}" title="${t('Cargar en el portapapeles')}">${x.map((y) => esc(tagName(y))).join(' + ')}</button><button class="btn small ghost" data-act="clip-group-del" data-i="${i}" aria-label="${t('Quitar el grupo')}">✕</button></span>`).join('')}</div>` : ''}
  </div></div>`;
}
async function clipPaste(s) {
  const c = clipList(), list = clipTargetsOf(s); if (!c.length || !list.length) return;
  await addTags(list, c); refresh();
  toast(`${c.map(tagName).map(esc).join(', ')} → ${list.length === 1 ? '«' + esc(list[0].name) + '»' : t('{n} samples', { n: list.length })}`, 'ok', 2500);
}
async function clipCopy(s) {
  const tg = s ? tagsOf(s) : []; if (!tg.length) { toast(t('Este sample no tiene etiquetas'), 'warn', 2500); return; }
  await clipSet(tg); refresh(); toast(t('Copiadas: {t}', { t: tg.map(tagName).map(esc).join(', ') }), 'ok', 2500);
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
Object.assign(ACT, {
  'clip-copy': (el) => clipCopy(sOf(el) || current()),
  'clip-paste': (el) => clipPaste(sOf(el) || current()),
  'clip-del': async (el) => { await clipSet(clipList().filter((x) => x !== el.dataset.v)); refresh(); },
  'clip-clear': async () => { await clipSet([]); refresh(); },
  'clip-group': async () => { const c = clipList(); if (!c.length) return; S.set.tagGroups = [c, ...clipGroups().filter((x) => x.join('|') !== c.join('|'))].slice(0, 12); await saveSettings(); refresh(); },
  'clip-load': async (el) => { const g = clipGroups()[+el.dataset.i]; if (g) { await clipSet(g); refresh(); } },
  'clip-group-del': async (el) => { const g = clipGroups().slice(); g.splice(+el.dataset.i, 1); S.set.tagGroups = g; await saveSettings(); refresh(); },
});
