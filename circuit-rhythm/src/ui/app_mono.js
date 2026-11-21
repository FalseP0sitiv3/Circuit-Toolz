// ui/app_mono.js — v2.8: mono reparado para la Rhythm (core/dsp.js · toMono / monoRepair).
// Solo cambia lo que va a la Rhythm (48 kHz · mono). El archivo y las exportaciones «como el original» siguen en estéreo.
import { toMono, render } from '../core/dsp.js';

// Las fichas analizadas antes de 2.8 no saben cómo se repara: se calcula al abrirlas, una vez, y se guarda.
const _monoBusy = new Set();
async function monoEnsure(s) {
  const a = s?.analysis;
  if (!a || a.error || !a.stereo || a.identicalLR || a.mono || _monoBusy.has(s.id)) return;
  _monoBusy.add(s.id);
  try {
    const d = await decodedOf(s), m = toMono(d.channels, 'auto', d.sampleRate);
    a.mono = { used: m.used, ...(m.fix ? { lossBefore: +m.fix.lossBefore.toFixed(2), lossAfter: +m.fix.lossAfter.toFixed(2), delayMs: +(m.fix.delayMs || 0).toFixed(2), flipped: !!m.fix.flipped, lead: m.fix.lead || null, worstDb: +(m.fix.worstDb || 0).toFixed(1), worstHz: Math.round(m.fix.worstHz || 0) } : {}) };
    await saveSample(s); invalidateAll();
    if (current() === s) renderDetail();
  } catch { /* sin audio a mano (carpeta sin reconectar): se queda como estaba */ }
  finally { _monoBusy.delete(s.id); }
}
// ▶ Suma / Reparado / L / R: lo que sonaría en la Rhythm con cada forma de pasar a mono
async function monoAB(s, mode) {
  if (!s) return;
  try {
    const d = await decodedOf(s), r = render(d, { ...recipeOf(s), mono: mode });
    Player.play([r.data], 48000, { key: s.id + '|mono|' + mode, playbackRate: Math.pow(2, S.tune / 12), onEnd: repaintTransport });
    document.querySelectorAll('[data-act="mono-ab"]').forEach((b) => b.classList.toggle('on', b.dataset.v === mode));
  } catch (e) { toast(esc(e.message || e), 'bad', 5000); }
}
Object.assign(ACT, { 'mono-ab': (el) => monoAB(S.byId[el.dataset.id], el.dataset.v) });
