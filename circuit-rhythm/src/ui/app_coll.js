// ui/app_coll.js — v2.1, traído de la herramienta de Tracks:
//  · Colecciones: guardar el filtro actual de la biblioteca con un nombre y volver a él con un clic
//    (viven en los ajustes, así que viajan en la copia de seguridad)
//  · CSV de la lista filtrada: todo lo que sabes y lo que se mide de cada sample, para una hoja de cálculo
import { kindOf, sampleSeconds } from '../core/pack.js';
import { measuredChar } from '../core/map.js';

const COLL_KEYS = ['q', 'cat', 'cert', 'flag', 'sort', 'tag', 'sub', 'words', 'kind'];
const collOf = (f) => Object.fromEntries(COLL_KEYS.map((k) => [k, f[k] ?? (k === 'words' ? [] : '')]));
const collSame = (a, b) => JSON.stringify(collOf(a)) === JSON.stringify(collOf(b));
const colls = () => (Array.isArray(S.set.colls) ? S.set.colls : []);
function collActive() { return colls().find((c) => collSame(c.f, S.f)) || null; }
function collSelectHTML() {
  const act = collActive(), list = colls();
  return `<select id="fcoll" title="${t('Colecciones: filtros guardados con un nombre')}"><option value="">${act ? '' : t('Colecciones…')}</option>
    ${list.map((c) => `<option value="${esc(c.id)}" ${act && act.id === c.id ? 'selected' : ''}>★ ${esc(c.name)}</option>`).join('')}
    <option value="__save">＋ ${t('Guardar el filtro actual…')}</option>${act ? `<option value="__del">✕ ${t('Borrar «{n}»', { n: esc(act.name) })}</option>` : ''}</select>`;
}
async function collSave(name) {
  name = String(name || '').trim().slice(0, 40); if (!name) return;
  if (S.f.flag === 'sel') { toast(t('Una colección guarda filtros, no una selección: quita «Seleccionados» antes de guardarla.'), 'warn', 6000); return; }
  const list = colls().filter((c) => c.name.toLowerCase() !== name.toLowerCase());
  list.push({ id: 'c_' + Date.now().toString(36), name, f: collOf(S.f) });
  S.set.colls = list; await saveSettings(); renderView();
  toast(t('Colección «{n}» guardada.', { n: esc(name) }), 'ok', 3000);
}

// ---------- CSV de la lista filtrada ----------
function filteredCSV(list) {
  const q = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; };
  const rows = [['path', 'name', 'category', 'certainty', 'subfolder', 'type', 'tags', 'rating', 'favourite', 'seconds', 'note', 'bpm', 'measured', 'packs']];
  for (const s of list) {
    const c = clsOf(s), a = s.analysis || {}, u = s.user || {};
    rows.push([s.path, s.name, c.cat || '', c.cert, u.sub && c.cat ? subName(c.cat, u.sub) || '' : '', kindOf(s), (u.tags || []).map(tagName).join('; '), u.rating || '', u.fav ? 'yes' : '',
      a.activeDur != null ? sampleSeconds(s).toFixed(3) : '', a.f0conf > 0.6 ? a.note || '' : '', a.loopBpm ? a.loopBpm.toFixed(1) : '', measuredChar(a).map((x) => t(x)).join('; '),
      S.packs.filter((p) => p.slots.includes(s.id)).map((p) => p.name).join('; ')]);
  }
  return '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n');
}

document.addEventListener('change', async (ev) => {
  const el = ev.target; if (el.id !== 'fcoll') return;
  const v = el.value;
  if (v === '__save') {
    el.value = collActive()?.id || '';
    modal(`<h2>${t('Guardar el filtro actual')}</h2><p class="note">${t('Guarda la búsqueda, la categoría, la certeza, las etiquetas, las palabras, el tipo y el orden de la lista.')}</p>
      <input type="text" id="coll-name" maxlength="40" style="width:100%" placeholder="${t('p. ej. Kicks oscuros 4★')}">
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-act="modal-close">${t('Cancelar')}</button><button class="btn primary" data-act="coll-save">${t('Guardar')}</button></div>`);
    setTimeout(() => document.getElementById('coll-name')?.focus(), 30);
    return;
  }
  if (v === '__del') {
    const act = collActive(); if (!act) return;
    S.set.colls = colls().filter((c) => c.id !== act.id); await saveSettings(); renderView();
    toast(t('Colección «{n}» borrada (el filtro sigue puesto).', { n: esc(act.name) }), 'ok', 3500);
    return;
  }
  const c = colls().find((x) => x.id === v); if (!c) return;
  S.f = { ...S.f, ...collOf(c.f) }; S.libMode = 'list'; renderView();
});
document.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.id === 'coll-name') { ev.preventDefault(); ACT['coll-save'](); } });
Object.assign(ACT, {
  'coll-save': () => { const n = document.getElementById('coll-name')?.value; closeModal(); collSave(n); },
  'lib-csv': () => { const list = filtered(); download(filteredCSV(list), `Circuit Rhythm · ${list.length} samples.csv`, 'text/csv;charset=utf-8'); },
});
