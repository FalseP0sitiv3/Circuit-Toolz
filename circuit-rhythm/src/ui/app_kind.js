// ui/app_kind.js — v1.7: loop / one-shot en cualquier categoría, conservar lo detectado al decidir,
// reanalizar un sample y exportarlo suelto. v1.8: exportar entero o en slices, para la Rhythm o como el original.
import { kindOf, autoKindOf, tooShortForLoop, safeName } from '../core/pack.js';
import { slicesOriginal, slicesRhythm, originalFormat, encodeOriginal, encodeRhythm, sliceName } from '../core/slices.js';
import { taxonomy, subLabelOf } from '../core/taxonomy.js';

// ---------- loop / one-shot ----------
function kindWhy(s) {
  const c = clsOf(s);
  if (s.user?.kind) return t('lo marcaste tú');
  if (['dloop', 'mloop'].includes(c.cat)) return t('por la categoría');
  if (autoKindOf(s) === 'loop') return t('el nombre o la carpeta dicen «loop»');
  if (c.textLoop && !c.oneshotHint && tooShortForLoop(s)) return t('dura menos de 1 s: demasiado corto para ser un loop');
  if (c.oneshotHint) return t('el nombre o la carpeta dicen «one shot»');
  if (c.soundLoop) return t('suena a loop, pero el texto no lo dice: márcalo si lo es');
  return t('por defecto');
}
function kindHTML(s) {
  const k = kindOf(s), u = s.user?.kind;
  return `<div class="orow kindrow"><span class="lbl">${t('Tipo')}</span><div class="row" style="gap:8px">
    <span class="seg"><button class="${k === 'oneshot' ? 'on' : ''}" data-act="kind" data-v="oneshot" data-id="${s.id}">${t('One-shot')}</button><button class="${k === 'loop' ? 'on' : ''}" data-act="kind" data-v="loop" data-id="${s.id}">${t('Loop')}</button></span>
    <span class="kbd" title="${t('Cambiar entre loop y one-shot')}">W</span>
    <span class="muted">${u ? '' : t('Automático') + ': '}${kindWhy(s)}</span>
    ${u ? `<button class="btn small ghost" data-act="kind-auto" data-id="${s.id}">${t('Volver a automático')}</button>` : ''}</div></div>`;
}
async function setKind(s, kind) {
  if (!s) return;
  if (kind) s.user.kind = kind; else delete s.user.kind;
  invalidateAll(); await saveSample(s);
  refresh();
}

// ---------- al decidir la categoría: conservar lo detectado ----------
// Se llama desde decide() antes de cambiar la categoría. Con la opción activada (por defecto), las etiquetas
// detectadas pasan a ser tuyas y la subcarpeta se lleva a la nueva categoría si allí hay una con el mismo nombre.
function keepOnDecide(s, oldCat, newCat) {
  if (S.set.keepDet !== false) {
    const det = propsOf(s).tags.map((x) => x.tag);
    if (det.length) s.user.tags = [...new Set([...tagsOf(s), ...det])];
  }
  const sub = s.user.sub;
  if (sub && oldCat !== newCat && !taxonomy(S.set.tax, newCat).some((x) => x.id === sub)) {
    const label = String(subLabelOf(S.set.tax, oldCat, sub) || '').toLowerCase();
    const same = label && taxonomy(S.set.tax, newCat).find((x) => String(x.label).toLowerCase() === label);
    if (same) s.user.sub = same.id; else delete s.user.sub;
  }
}

// ---------- reanalizar y exportar un sample ----------
function sampleToolsHTML(s) {
  return `<span class="stools"><button class="btn small ghost" data-act="s-reanalyze" data-id="${s.id}" title="${t('Vuelve a medir el audio y a proponer categoría, subcarpeta y etiquetas')}">↻ ${t('Reanalizar')}</button>
    <button class="btn small ghost" data-act="s-exp" data-id="${s.id}" title="${t('Entero o en slices, para la Rhythm o con las propiedades del original')}">⤓ ${t('Exportar…')}</button></span>`;
}
async function reanalyze(s) {
  if (!s) return;
  let u8;
  try { u8 = await bytesOf(s); } catch (e) { toast(esc(e.message || e), 'bad', 7000); return; }
  const had = new Set(propsOf(s).tags.map((x) => x.tag));
  S.decCache.delete(s.id);
  await analyzeInto(s, u8);
  delete s.rep; delete s._cls; delete s._clsKey;
  s.info = nameInfo(s.name);
  invalidateAll();
  await saveSample(s);
  const c = clsOf(s), p = propsOf(s);
  const fresh = p.tags.filter((x) => !had.has(x.tag)).length;
  if (s.analysis?.error) toast(t('No se pudo medir: {e}', { e: esc(s.analysis.error) }), 'bad', 7000);
  else toast(t('Reanalizado. La herramienta propone {c}; {n} etiquetas detectadas ({f} nuevas).', { c: `<b>${catLabel(c.auto?.cat ?? c.cat)}</b>`, n: p.tags.length, f: fresh }), 'ok', 6000);
  refresh();
}
// ---------- exportar: entero o en slices, formato Rhythm u original (v1.8) ----------
function origDesc(s) {
  const a = s.analysis || {};
  const ch = a.ch === 1 ? t('mono') : a.ch === 2 ? t('estéreo') : t('{n} canales', { n: a.ch || '?' });
  const bits = a.format === 'float' ? '32 bit float' : a.bits ? `${a.bits === 8 ? 16 : a.bits === 32 ? 24 : a.bits} bit` : '24 bit';
  return `${nf((a.sr || 48000) / 1000, a.sr % 1000 ? 1 : 0)} kHz · ${ch} · ${bits}${!a.bits && a.format !== 'float' ? ' · ' + t('WAV (el original está comprimido)') : ''}`;
}
function expState() { const x = S.set.exp || {}; return { fmt: x.fmt === 'orig' ? 'orig' : 'rhythm', n: [1, 2, 4, 8, 16].includes(x.n) ? x.n : 1 }; }
function exportModal(s, pick = null) {
  if (!s) return;
  const x = expState(), n = pick || (S.slices && x.n === 1 ? S.slices : x.n), base = safeName(s.name, 60);
  const files = n > 1 ? `${base} (${n} slices).zip → ${sliceName(base, 0, n)}.wav … ${sliceName(base, n - 1, n)}.wav` : `${base}${x.fmt === 'rhythm' ? ' (48k mono)' : ''}.wav`;
  modal(`<h2>${t('Exportar «{n}»', { n: esc(base) })}</h2>
    <div class="expo">
      <span class="lbl">${t('Formato')}</span>
      <div><label class="exopt"><input type="radio" name="exfmt" value="rhythm" ${x.fmt === 'rhythm' ? 'checked' : ''}><span><b>${t('Para la Rhythm')}</b><span class="muted">48 kHz · mono · 16 bit, ${t('con su preparación (nivel, mono, recorte, ajuste al compás)')}</span></span></label>
        <label class="exopt"><input type="radio" name="exfmt" value="orig" ${x.fmt === 'orig' ? 'checked' : ''}><span><b>${t('Como el original')}</b><span class="muted">${origDesc(s)} · ${t('solo se recorta y se parte: sin cambiar frecuencia, canales, bits ni nivel')}</span></span></label></div>
      <span class="lbl">${t('Partes')}</span>
      <div class="seg">${[1, 2, 4, 8, 16].map((k) => `<button class="${n === k ? 'on' : ''}" data-act="s-exp-n" data-v="${k}" data-id="${s.id}">${k === 1 ? t('Entero') : k}</button>`).join('')}</div>
      <span class="lbl">${t('Archivos')}</span><div class="mono muted" style="font-size:12.5px">${esc(files)}</div>
    </div>
    <p class="note">${t('Las slices son partes iguales de lo que se exporta (recortado y ajustado al compás), como la rejilla de Slices de la Rhythm. Cada corte lleva un fundido de 2 ms para que no haga clic.')}${keepActive(s) ? ' ' + t('Este loop está acortado: «Para la Rhythm» entero sale acortado; las slices se cuentan sobre el loop completo.') : ''}${recipeOf(s).reverse ? ' ' + t('El reverse solo se aplica al sample entero para la Rhythm.') : ''}</p>
    <div class="row" style="justify-content:space-between;margin-top:12px"><button class="btn ghost" data-act="s-exp-orig" data-id="${s.id}" title="${t('El archivo original, tal cual, sin recortar')}">⤓ ${t('Archivo original tal cual')}</button>
      <span class="row"><button class="btn" data-act="modal-close">${t('Cancelar')}</button><button class="btn primary" data-act="s-exp-go" data-id="${s.id}">⤓ ${t('Exportar')}</button></span></div>`);
  S._expN = n;
}
async function exportRun(s) {
  if (!s) return;
  const fmt = document.querySelector('input[name="exfmt"]:checked')?.value === 'orig' ? 'orig' : 'rhythm', n = S._expN || 1;
  S.set.exp = { fmt, n }; saveSettings(); closeModal();
  const base = safeName(s.name, 60);
  try {
    // entero para la Rhythm: exactamente lo que va al pack (con acortar y reverse)
    if (fmt === 'rhythm' && n === 1) { download(await wavOf(s), `${base} (48k mono).wav`, 'audio/wav'); return; }
    const d = await decodedOf(s), r = recipeOf(s);
    const parts = fmt === 'rhythm' ? slicesRhythm(d, r, n) : slicesOriginal(d, r, n);
    const of = originalFormat(d), enc = (p) => (fmt === 'rhythm' ? encodeRhythm(p) : encodeOriginal(p, of));
    if (n === 1) { download(enc(parts[0]), `${base}.wav`, 'audio/wav'); return; }
    const files = parts.map((p, i) => ({ name: `${sliceName(base, i, n)}.wav`, data: enc(p) }));
    download(await zipWrite(files, { compress: false }), `${base} (${n} slices${fmt === 'rhythm' ? ', 48k mono' : ''}).zip`, 'application/zip');
    const capped = parts.filter((p) => p.capped).length;
    toast(t('{n} slices exportadas.', { n }) + (capped ? ` <span class="warn">${t('{n} duraban más de 30 s y se han recortado.', { n: capped })}</span>` : ''), capped ? 'warn' : 'ok', 5000);
  } catch (e) { toast(esc(e.message || e), 'bad', 7000); }
}
async function exportOriginal(s) {
  if (!s) return;
  closeModal();
  try { download(await bytesOf(s), s.name); } catch (e) { toast(esc(e.message || e), 'bad', 7000); }
}

Object.assign(ACT, {
  kind: (el) => setKind(sOf(el), el.dataset.v),
  'kind-auto': (el) => setKind(sOf(el), null),
  'kind-toggle': () => { const s = current(); if (s) setKind(s, kindOf(s) === 'loop' ? 'oneshot' : 'loop'); },
  's-reanalyze': (el) => reanalyze(sOf(el)),
  's-exp': (el) => exportModal(sOf(el)),
  's-exp-n': (el) => { S._expN = +el.dataset.v; const s = sOf(el), fmt = document.querySelector('input[name="exfmt"]:checked')?.value; S.set.exp = { fmt: fmt === 'orig' ? 'orig' : 'rhythm', n: S._expN }; exportModal(s, S._expN); },
  's-exp-go': (el) => exportRun(sOf(el)),
  's-exp-orig': (el) => exportOriginal(sOf(el)),
});
