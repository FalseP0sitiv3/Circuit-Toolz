// ui/lab_ui.js — v3.8: pestaña «Laboratorio» de la ficha. Sonidos nuevos a partir de los tuyos:
//  · Mutar: 8 variaciones de este patch, con la intensidad y las partes que elijas
//  · Cruzar: 8 hijos de este patch y otro (o de varios de la misma categoría), bloque a bloque
//  · Mezclar: un punto entre este patch y otro, que se oye en el equipo mientras mueves el control
// Lo que guardas entra como patch nuevo (en «Laboratorio/<patch>»), no como variante: un sonido nuevo no
// sustituye a su origen al exportar. Guarda de dónde viene (meta.lab).
import { labMutate, labCross, labMorph, labChanges, labCloseness, LAB_GROUP_IDS } from '../core/lab.js';
import { encodeName, readName } from '../core/sysex.js';

const LAB_GROUP_LABEL = { osc: 'Osciladores', filter: 'Filtro', env: 'Envolventes', mod: 'LFO', fx: 'Efectos' };
const LAB_BLOCK_LABEL = { osc1: 'oscilador 1', osc2: 'oscilador 2', mixer: 'mezcla', filter: 'filtro', env1: 'env. 1', env2: 'env. 2', env3: 'env. 3', lfo1: 'LFO 1', lfo2: 'LFO 2', fx: 'efectos', eq: 'EQ', matrix: 'matriz' };
const LB = { forId: null, mode: 'mutate', amount: 'medium', groups: ['filter', 'env', 'mod', 'fx'], seed: 1, cands: null, bId: null, multi: false, t: 50, saved: {} };

function labPartners(p) {
  const v = lib.vecOf(p), out = [];
  for (const q of lib.patches) {
    if (q.id === p.id || q.kind === 'variant' || q.rootId === p.id) continue;
    const w = lib.vecOf(q); let d = 0; for (let i = 0; i < v.length; i++) d += (v[i] - w[i]) ** 2;
    out.push({ q, d });
  }
  out.sort((a, b) => a.d - b.d);
  const list = out.slice(0, 40).map((x) => x.q);
  const cmp = S.cmpB && lib.byId(S.cmpB);
  if (cmp && cmp.id !== p.id && !list.includes(cmp)) list.unshift(cmp);
  return list;
}
function labB(p) { const b = LB.bId && lib.byId(LB.bId); return b && b.id !== p.id ? b : null; }
function labSameCat(p, n = 3) {
  const c = effCat(p); if (!c) return [];
  const pool = lib.patches.filter((q) => q.id !== p.id && q.kind !== 'variant' && effCat(q) === c);
  const r = labRngUI(LB.seed * 13 + pool.length), out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}
function labRngUI(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296); }

function labGenerate(p) {
  LB.forId = p.id; LB.saved = {};
  if (LB.mode === 'mutate') {
    LB.cands = Array.from({ length: 8 }, (_, i) => ({ payload: labMutate(p.payload, { amount: LB.amount, groups: LB.groups, seed: LB.seed * 100 + i + 1 }) }));
  } else if (LB.mode === 'cross') {
    const b = labB(p), others = LB.multi ? labSameCat(p) : b ? [b] : [];
    if (!others.length) { LB.cands = null; return; }
    const parents = [p, ...others];
    LB.cands = Array.from({ length: 8 }, (_, i) => { const c = labCross(parents.map((x) => x.payload), { seed: LB.seed * 100 + i + 1 }); return { payload: c.payload, from: c.from, parents: parents.map((x) => x.id) }; });
  }
  for (const c of LB.cands || []) { c.changes = labChanges(p.payload, c.payload, 3); c.close = labCloseness(p.payload, c.payload); }
}
// «Decay» o «Delay» no dicen de dónde son: se antepone el bloque (Env 1, LFO 2, OSC 1…)
const LAB_GROUP_SHORT = { osc1: 'OSC 1', osc2: 'OSC 2', env1: 'Env 1', env2: 'Env 2', env3: 'Env 3', lfo1: 'LFO 1', lfo2: 'LFO 2' };
function labChangeText(c) {
  const lbl = (LAB_GROUP_SHORT[c.group] ? LAB_GROUP_SHORT[c.group] + ' ' : '') + c.label;
  return c.discrete ? `${lbl}: ${formatValue(c.p, c.to)}` : `${lbl} ${c.d > 0 ? '+' : '−'}${Math.abs(c.d)}`;
}
function labFromText(cand) {
  if (!cand.from) return '';
  if (cand.parents.length > 2) return `de ${new Set(Object.values(cand.from)).size} patches`;
  const bl = Object.entries(cand.from).filter(([, i]) => i === 1).map(([k]) => LAB_BLOCK_LABEL[k]);
  return bl.length ? `de B: ${bl.join(', ')}` : '';
}

function centerLab(p) {
  if (LB.forId !== p.id) { LB.cands = null; LB.saved = {}; LB.forId = p.id; if (LB.bId === p.id) LB.bId = null; }
  const dev = !!S.dev.session, b = labB(p);
  const born = p.meta.lab, kids = lib.patches.filter((q) => q.meta.lab?.from?.includes(p.id));
  const modes = [['mutate', 'Mutar'], ['cross', 'Cruzar'], ['morph', 'Mezclar']];
  const partnerSel = (withCat) => html`<select id="labB"><option value="">Elige el otro patch…</option>${withCat ? html`<option value="__cat" ${LB.multi ? 'selected' : ''}>Varios de su categoría (3 al azar)</option>` : ''}${labPartners(p).map((q) => html`<option value="${q.id}" ${!LB.multi && LB.bId === q.id ? 'selected' : ''}>${q.name}${q.id === S.cmpB ? ' · el de Comparar' : ''}</option>`)}</select>`;
  let body = '';
  if (LB.mode === 'mutate') {
    body = html`<div class="labopts"><span class="mlabel">Intensidad</span>${[['subtle', 'Sutil'], ['medium', 'Media'], ['wild', 'Salvaje']].map(([k, l]) => html`<button class="tq ${LB.amount === k ? 'on' : ''}" data-act="labAmt" data-v="${k}">${l}</button>`)}
      <span class="mlabel">Qué variar</span>${LAB_GROUP_IDS.map((g) => html`<button class="tq ${LB.groups.includes(g) ? 'on' : ''}" data-act="labGrp" data-v="${g}">${LAB_GROUP_LABEL[g]}</button>`)}</div>
      <p class="note">Las ondas y los tipos (filtro, distorsión…) solo cambian en «Media» y «Salvaje». Nunca cambian el nombre, la afinación, la voz ni las macros, y ningún resultado queda mudo.</p>`;
  } else if (LB.mode === 'cross') {
    body = html`<div class="labopts"><span class="mlabel">Con</span>${partnerSel(true)}</div>
      <p class="note">Cada hijo toma cada bloque entero (osciladores, filtro, envolventes, LFO, efectos, matriz) de uno de los padres, con una variación sutil. Las macros son las de este patch, así los knobs siguen haciendo lo mismo.</p>`;
  } else {
    const m = b ? labMorph(p.payload, b.payload, LB.t / 100) : null, ch = m ? labChanges(p.payload, m, 4) : [];
    body = html`<div class="labopts"><span class="mlabel">Hacia</span>${partnerSel(false)}</div>
      ${b ? html`<div class="labmorph"><span class="mono">A</span><input type="range" id="labT" min="0" max="100" step="1" value="${LB.t}"><span class="mono">B</span><b class="mono" id="labTv">${LB.t} %</b></div>
        <div class="labch" id="labMorphCh">${ch.length ? ch.map((c) => labChangeText(c)).join(' · ') : 'igual que A'}</div>
        <div class="row2" style="gap:8px;margin-top:8px"><button class="btn small" data-act="labPlayMorph" ${dev ? '' : 'disabled'}>${raw(IC.play)}Escuchar</button><button class="btn small primary" data-act="labSaveMorph">Guardar este punto</button></div>
        <p class="note">Los valores continuos van de A a B; las ondas, los tipos y las rutas distintas de la matriz cambian a mitad. Con el equipo conectado, cada movimiento se envía a su RAM: suena mientras mueves el control.</p>` : html`<p class="note">Elige el otro patch. Puedes elegirlo también en «Comparar».</p>`}`;
  }
  const cards = LB.mode !== 'morph' && LB.cands ? html`<div class="labgrid">${LB.cands.map((c, i) => html`<div class="labcard ${LB.saved[i] ? 'saved' : ''}">
      <div class="labcard-h"><b class="mono">${i + 1}</b><span class="dim">${Math.round(c.close * 100)} % como este</span></div>
      <div class="labch">${c.changes.length ? c.changes.map((x) => labChangeText(x)).join(' · ') : 'casi igual'}</div>
      ${c.from ? html`<div class="labch dim">${labFromText(c)}</div>` : ''}
      <div class="row2" style="gap:6px;margin-top:6px"><button class="btn small" data-act="labPlay" data-i="${i}" ${dev ? '' : 'disabled'} title="Enviarlo a la RAM y tocar la frase de prueba">${raw(IC.play)}</button>
        <button class="btn small ${LB.saved[i] ? '' : 'primary'}" data-act="labSave" data-i="${i}" ${LB.saved[i] ? 'disabled' : ''}>${LB.saved[i] ? '✓ Guardado' : 'Guardar'}</button></div></div>`)}</div>` : '';
  return html`<div class="labo">
    <div class="row2" style="gap:8px;align-items:center;flex-wrap:wrap"><div class="ctabs" style="border:0;padding:0">${modes.map(([k, l]) => html`<button class="${LB.mode === k ? 'on' : ''}" data-act="labMode" data-v="${k}">${l}</button>`)}</div>
      <span class="sp"></span>${LB.mode !== 'morph' ? html`<button class="btn small primary" data-act="labGen" ${LB.mode === 'cross' && !b && !LB.multi ? 'disabled' : ''}>${LB.cands ? 'Otros 8' : 'Generar 8'}</button>` : ''}</div>
    ${born ? html`<p class="note">Nació en el Laboratorio: ${born.text}${born.from?.length ? html` · ${born.from.map((id) => lib.byId(id)).filter(Boolean).map((q) => html`<button class="lk" data-act="labGo" data-id="${q.id}">${q.name}</button>`)}` : ''}</p>` : ''}
    ${!dev ? html`<p class="note">Conecta el Circuit Tracks en Equipo para escuchar los resultados. Sin equipo se pueden generar y guardar igual.</p>` : ''}
    ${body}${cards}
    ${kids.length ? html`<div class="labkids"><span class="mlabel">Nacidos de este patch (${kids.length})</span>${kids.slice(-12).map((q) => html`<button class="lk" data-act="labGo" data-id="${q.id}">${q.name}</button>`)}</div>` : ''}
  </div>`;
}

function labPlayPayload(p, payload) {
  const s = S.dev.session; if (!s) return;
  s.stopAll();
  const ph = S.phrase === 'auto' ? phraseKeyFor(p) : S.phrase, t = s.sendPatch(payload, S.dev.synth);
  s.playPhrase(phraseObj(ph), S.dev.synth, { tempo: tempoNow(), root: phraseObj(ph).custom ? 0 : S.dev.root, start: t + (S.dev.patchDelay ?? 80) });
}
let labLiveAt = 0, labLiveTimer = 0;
function labLiveSend(payload) {
  const s = S.dev.session; if (!s) return;
  const go = () => { labLiveAt = performance.now(); s.sendPatch(payload, S.dev.synth); };
  clearTimeout(labLiveTimer);
  if (performance.now() - labLiveAt > 80) go(); else labLiveTimer = setTimeout(go, 80);
}
function labName(p, suffix) {
  const base = (p.name || readName(p.payload).name || 'Patch').trim();
  return (base.slice(0, Math.max(1, 16 - suffix.length)).trimEnd() + suffix).slice(0, 16);
}
// Guardar como patch nuevo: entra por la importación (huella, clasificación, duplicados) en «Laboratorio/<patch>»
async function labSavePayload(p, payload, name, lab) {
  const pl = new Uint8Array(payload); pl.set(encodeName(name), 0);
  const before = new Set(lib.patches.map((x) => x.id));
  const rep = await lib.importInputs([{ name: name.replace(/[\\/:*?"<>|]/g, '_') + '.syx', path: 'Laboratorio/' + (p.name || 'Patch').replace(/[\\/:*?"<>|]/g, '_'), bytes: lib.exportSyx({ payload: pl }) }]);
  const np = lib.patches.find((x) => !before.has(x.id));
  if (!np) { toast(rep.duplicatesPatch?.length ? 'Ya está en tu biblioteca: es idéntico a otro patch' : 'No se pudo guardar', 5000); return null; }
  await lib.updateMeta([np.id], { lab }, 'Laboratorio: ' + lab.text);
  S.rowsKey = ''; buildQueue();
  toastAct(`Guardado como patch nuevo «${np.name}» en Laboratorio/${p.name}`, 'Abrirlo', () => { S.sel = np.id; S.view = 'library'; S.ctab = 'lab'; rerender(); });
  return np;
}
const LAB_AMOUNT_TEXT = { subtle: 'sutil', medium: 'media', wild: 'salvaje' };

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'labB') { LB.multi = el.value === '__cat'; LB.bId = LB.multi ? null : el.value || null; LB.cands = null; rerender(); }
  else if (el.id === 'labT') { LB.t = +el.value; rerender(); }
});
document.addEventListener('input', (e) => {
  const el = e.target; if (el.id !== 'labT') return;
  const p = cur(), b = p && labB(p); if (!b) return;
  LB.t = +el.value; const m = labMorph(p.payload, b.payload, LB.t / 100);
  const v = document.getElementById('labTv'); if (v) v.textContent = LB.t + ' %';
  const ch = document.getElementById('labMorphCh'); if (ch) { const c = labChanges(p.payload, m, 4); ch.textContent = c.length ? c.map((x) => labChangeText(x)).join(' · ') : 'igual que A'; }
  labLiveSend(m);
});
Object.assign(A, {
  labMode: (el) => { LB.mode = el.dataset.v; LB.cands = null; rerender(); },
  labAmt: (el) => { LB.amount = el.dataset.v; LB.cands = null; rerender(); },
  labGrp: (el) => { const g = el.dataset.v; LB.groups = LB.groups.includes(g) ? LB.groups.filter((x) => x !== g) : [...LB.groups, g]; if (!LB.groups.length) LB.groups = [g]; LB.cands = null; rerender(); },
  labGen: () => { const p = cur(); if (!p) return; if (LB.cands) LB.seed++; labGenerate(p); rerender(); },
  labPlay: (el) => { const p = cur(), c = LB.cands?.[+el.dataset.i]; if (p && c) labPlayPayload(p, c.payload); },
  labSave: async (el) => {
    const p = cur(), i = +el.dataset.i, c = LB.cands?.[i]; if (!p || !c) return;
    const lab = LB.mode === 'mutate'
      ? { op: 'mutate', from: [p.id], text: `variación ${LAB_AMOUNT_TEXT[LB.amount]} (${LB.groups.map((g) => LAB_GROUP_LABEL[g].toLowerCase()).join(', ')}) de «${p.name}»` }
      : { op: 'cross', from: c.parents, text: c.parents.length > 2 ? `cruce de «${p.name}» con ${c.parents.length - 1} patches de su categoría` : `cruce de «${p.name}» y «${lib.byId(c.parents[1])?.name || '?'}»` };
    const np = await labSavePayload(p, c.payload, labName(p, LB.mode === 'mutate' ? ` M${i + 1}` : ` X${i + 1}`), lab);
    if (np) { LB.saved[i] = np.id; rerender(); }
  },
  labPlayMorph: () => { const p = cur(), b = p && labB(p); if (b) labPlayPayload(p, labMorph(p.payload, b.payload, LB.t / 100)); },
  labSaveMorph: async () => {
    const p = cur(), b = p && labB(p); if (!b) return;
    await labSavePayload(p, labMorph(p.payload, b.payload, LB.t / 100), labName(p, ` ${LB.t}%`), { op: 'morph', from: [p.id, b.id], text: `mezcla de «${p.name}» y «${b.name}» al ${LB.t} %` });
    rerender();
  },
  labGo: (el) => { S.sel = el.dataset.id; S.view = 'library'; rerender(); },
});
