// ui/app_parts.js — v2.7: las slices que eliges, como samples separados y relacionados.
// En «Acortar» eliges slices (p. ej. 1 y 2 de 4). «Al exportar» decide cómo salen: unidas en un sample (como
// hasta ahora) o cada slice por separado. Por separado, cada slice pasa a ser un sample de la biblioteca
// (Partes/<nombre>/<nombre> 1.wav…, con el formato del original), con la categoría, la subcarpeta y las
// etiquetas del original y un papel (Loop, Fill, Break…). Quedan relacionadas: user.rel = { of, i, n, slice, role, base }
// en cada parte y user.split = [ids] en el original. En los packs ocupan pads seguidos, así en la Rhythm están juntas.
import { slicesOriginal, originalFormat, encodeOriginal } from '../core/slices.js';
import { shortName, safeName } from '../core/pack.js';

const PART_ROLES = ['Loop', 'Fill', 'Break', 'Variación', 'Intro', 'Build', 'Outro'];
const partsOf = (s) => (s && Array.isArray(s.user?.split) ? s.user.split.map((id) => S.byId[id]).filter(Boolean) : []);
const relOf = (s) => (s && s.user?.rel && s.user.rel.of ? s.user.rel : null);
const parentOf = (s) => { const r = relOf(s); return r ? S.byId[r.of] || null : null; };
const siblingsOf = (s) => { const par = parentOf(s); return par ? partsOf(par) : []; };
const baseOf = (s) => String(s.name || '').replace(/\.(wav|aiff?|mp3|flac|ogg)$/i, '');
// nombre en el pack (y en la tarjeta): «Top Loop Fill» o «Top Loop 2»
function partLabel(p) {
  const r = relOf(p); if (!r) return shortName(p.name);
  const suf = ' ' + (r.role ? t(r.role) : String(r.i + 1));
  return safeName(shortName(r.base || baseOf(p)).slice(0, Math.max(4, 32 - suf.length)).trim() + suf, 32);
}
const slotName = (s) => (relOf(s) ? partLabel(s) : shortName(s.name));

// ---------- separar y volver a unir ----------
async function splitSample(s, roles = null) {
  const k = keepOf(s); if (!s || !k) return false;
  const order = [...new Set(k.sel)];
  if (order.length < 2) { toast(t('Elige al menos dos slices para separarlas.'), 'warn', 4000); return false; }
  const prev = partsOf(s).map((x) => relOf(x)?.role || '');
  if (partsOf(s).length) await unsplit(s, { quiet: true });
  roles = roles || prev;
  let d; try { d = await decodedOf(s); } catch (e) { toast(esc(e.message || e), 'bad', 6000); return false; }
  const of = originalFormat(d), all = slicesOriginal(d, { ...recipeOf(s), keep: null }, k.n);
  const base = baseOf(s), folder = t('Partes') + '/' + base;
  const entries = order.map((idx, j) => {
    const name = `${base} ${j + 1}.wav`, u8 = encodeOriginal(all[idx], of);
    return { name, path: `${folder}/${name}`, getFile: async () => new File([u8], name) };
  });
  // si alguna parte se eliminó antes, se vuelve a admitir: la estás creando a propósito
  for (const e of entries) { const sha = await sha256hex(new Uint8Array(await (await e.getFile()).arrayBuffer())); delete S.excluded[sha]; }
  const res = await importEntries(entries, t('Separando slices'));
  const recs = entries.map((e) => S.samples.find((x) => x.path === e.path || (x.paths || []).includes(e.path)) || null);
  if (recs.some((r) => !r)) { toast(t('No se pudieron separar las slices.') + (res.failed[0] ? ' ' + esc(res.failed[0].why) : ''), 'bad', 6000); return false; }
  const cat = s.user?.cat || catFor(s) || clsOf(s).cat || null;
  const sub = cat ? s.user?.sub || propsOf(s).sub?.id || null : null;
  const rc = { ...(s.recipe || {}) }; for (const x of ['keep', 'trimStart', 'trimEnd', 'fitSec']) delete rc[x]; rc.autoTrim = false;
  recs.forEach((r, j) => {
    r.user = { ...(r.user || {}), kind: 'loop', ...(cat ? { cat } : {}), ...(sub ? { sub } : {}), ...(tagsOf(s).length ? { tags: tagsOf(s).slice() } : {}),
      rel: { of: s.id, i: j, n: recs.length, slice: order[j] + 1, role: roles[j] || '', base } };
    r.recipe = { ...rc };
  });
  s.user.split = recs.map((r) => r.id);
  await saveSamples([...recs, s]);
  // en los packs donde estaba el original, sus partes en pads seguidos
  let moved = 0, out = 0;
  for (const p of S.packs) {
    const i = p.slots.indexOf(s.id); if (i < 0) continue;
    p.slots[i] = null; p.names[i] = '';
    const r = placeGroup(p, recs.map((x) => x.id), i); moved++; out += r.left;
    await savePack(p);
  }
  invalidateAll();
  toast(t('{n} samples relacionados en «{f}».', { n: recs.length, f: esc(folder) }) + (moved ? ' ' + t('En el pack ocupan pads seguidos.') : '') + (out ? ` <span class="warn">${t('{n} no caben: pack lleno', { n: out })}</span>` : ''), out ? 'warn' : 'ok', 6000);
  return true;
}
// coloca un grupo en pads seguidos: desde «at» si está libre, si no en el primer hueco con sitio para todos
function placeGroup(p, ids, at = null) {
  const n = ids.length, free = (i) => i >= 0 && i < p.slots.length && !p.slots[i];
  const fits = (i) => { for (let k = 0; k < n; k++) if (!free(i + k)) return false; return true; };
  let st = at != null && fits(at) ? at : -1;
  if (st < 0) { const pg = at != null ? Math.floor(at / 16) * 16 : 0; for (let i = pg; i < p.slots.length && st < 0; i++) if (fits(i)) st = i; }
  if (st < 0) for (let i = 0; i < p.slots.length && st < 0; i++) if (fits(i)) st = i;
  let left = 0;
  ids.forEach((id, k) => {
    let i = st >= 0 ? st + k : (at != null && free(at) ? at : p.slots.findIndex((x) => !x));
    if (i < 0) { left++; return; }
    p.slots[i] = id; p.names[i] = slotName(S.byId[id]);
  });
  return { left, at: st };
}
async function unsplit(s, { quiet = false } = {}) {
  const parts = partsOf(s); if (!s) return;
  const ids = new Set(parts.map((x) => x.id));
  for (const p of S.packs) {
    const first = p.slots.findIndex((x) => ids.has(x)); if (first < 0) continue;
    p.slots.forEach((x, i) => { if (ids.has(x)) { p.slots[i] = null; p.names[i] = ''; } });
    if (!p.slots.includes(s.id)) { p.slots[first] = s.id; p.names[first] = shortName(s.name); }
    await savePack(p);
  }
  // las partes se pueden volver a crear: se borran del todo (no van a la papelera ni se excluyen)
  for (const x of parts) { await S.lib.del('samples', x.id); try { await S.lib.del('blobs', x.sha); } catch {} delete S.byId[x.id]; S.multi.delete(x.id); }
  S.samples = S.samples.filter((x) => !ids.has(x.id));
  if (S.listen.queue.length) S.listen.queue = S.listen.queue.filter((id) => !ids.has(id));
  if (ids.has(S.sel)) S.sel = s.id;
  delete s.user.split; await saveSample(s); invalidateAll();
  if (!quiet) toast(t('Vuelven a ser un solo sample.'), 'ok', 3000);
}
// al cambiar las slices elegidas de un sample separado: se vuelven a separar (o se unen si queda una)
async function afterKeepChange(s) {
  if (!partsOf(s).length) return;
  const k = keepOf(s);
  if (k && new Set(k.sel).size >= 2) await splitSample(s); else await unsplit(s);
}
async function setRole(p, role) {
  const r = relOf(p); if (!r) return;
  r.role = PART_ROLES.includes(role) ? role : ''; await saveSample(p);
  for (const pk of S.packs) { let ch = false; pk.slots.forEach((x, i) => { if (x === p.id) { pk.names[i] = partLabel(p); ch = true; } }); if (ch) await savePack(pk); }
  invalidateAll();
}

// ---------- interfaz ----------
function roleSelect(p) {
  const r = relOf(p);
  return `<select class="prole" data-part="${p.id}" title="${t('Papel de esta parte')}"><option value="">${t('Parte {i}', { i: r.i + 1 })}</option>${PART_ROLES.map((x) => `<option value="${x}" ${r.role === x ? 'selected' : ''}>${t(x)}</option>`).join('')}</select>`;
}
// bloque «Al exportar» dentro de «Acortar» (solo con slices elegidas)
function splitHTML(s) {
  const k = keepOf(s); if (!k) return '';
  const parts = partsOf(s), n = new Set(k.sel).size, on = parts.length > 0;
  const list = on ? `<div class="splist">${parts.map((p) => `<span class="sppart"><b>${relOf(p).i + 1}</b> <span class="dim">${t('slice {i}', { i: relOf(p).slice })}</span> ${roleSelect(p)}
      <button class="btn small ghost" data-act="play" data-id="${p.id}" title="${t('Escuchar')}">▶</button><button class="btn small ghost" data-act="sel" data-id="${p.id}">${t('Ver')}</button></span>`).join('')}</div>
    <p class="note">${t('Son samples de la biblioteca, en «{f}», con la categoría, la subcarpeta y las etiquetas de este. En los packs van en pads seguidos y se exportan cada uno con su nombre: «{a}», «{b}»…', { f: esc(t('Partes') + '/' + baseOf(s)), a: esc(partLabel(parts[0])), b: esc(partLabel(parts[1])) })}</p>` : '';
  return `<div class="shsplit"><span class="lbl">${t('Al exportar')}</span>
    <span class="seg"><button class="${on ? '' : 'on'}" data-act="sp-join" data-id="${s.id}">${t('Unidas en un sample')}</button><button class="${on ? 'on' : ''}" data-act="sp-split" data-id="${s.id}" ${n < 2 ? 'disabled' : ''}>${t('Cada slice por separado ({n})', { n })}</button></span>
    <span class="dim">${on ? t('Relacionadas: el papel de cada una le da nombre.') : n < 2 ? t('Con una sola slice no hay nada que separar.') : t('Por separado, cada slice será un sample (p. ej. el loop y el loop con fill), juntas en el pack.')}</span>
    ${list}</div>`;
}
// en la ficha de una parte: de dónde sale y sus hermanas
function relHTML(s) {
  const r = relOf(s); if (!r) return '';
  const par = parentOf(s), sib = siblingsOf(s);
  return ` · ${t('parte {i} de {n} de', { i: r.i + 1, n: r.n })} ${par ? `<button class="btn small ghost" data-act="sel" data-id="${par.id}">«${esc(baseOf(par))}»</button>` : `«${esc(r.base || '')}»`}
    ${sib.filter((x) => x.id !== s.id).map((x) => `<button class="btn small ghost" data-act="sel" data-id="${x.id}" title="${esc(partLabel(x))}">${relOf(x).i + 1}${relOf(x).role ? ' · ' + esc(t(relOf(x).role)) : ''}</button>`).join('')} ${roleSelect(s)}`;
}
// en el pad del pack
function padLinkHTML(s) { const r = relOf(s); return r ? `<span class="plink" title="${esc(t('parte {i} de {n} de', { i: r.i + 1, n: r.n }) + ' «' + (r.base || '') + '»')}">⛓ ${r.i + 1}/${r.n}</span>` : ''; }

document.addEventListener('change', (ev) => {
  const el = ev.target; if (!el.classList?.contains('prole')) return;
  const p = S.byId[el.dataset.part]; if (!p) return;
  setRole(p, el.value).then(() => { if (S.view === 'packs') renderAll(); else renderDetail(); });
});
Object.assign(ACT, {
  'sp-split': async (el) => { const s = S.byId[el.dataset.id]; if (s && !partsOf(s).length && await splitSample(s)) renderAll(); },
  'sp-join': async (el) => { const s = S.byId[el.dataset.id]; if (s && partsOf(s).length) { await unsplit(s); renderAll(); } },
});
