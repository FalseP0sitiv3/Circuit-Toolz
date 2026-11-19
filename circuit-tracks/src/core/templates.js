// Plantillas de macros: el bloque completo de 8 macros (offsets 204–339) como objeto reutilizable.
// Se pueden crear desde cualquier patch, desde los perfiles o a mano, y aplicarse sobre copias.
import { decodePatch } from './patch.js';
import { PROFILES } from './macros.js';
import { macroDestInfo } from './params.js';

export function extractTemplate(payload, name, note = '') {
  return { name, note, created: new Date().toISOString(), knobs: Array.from({ length: 8 }, (_, k) => Array.from(payload.slice(204 + 17 * k, 221 + 17 * k))) };
}
// Perfiles integrados convertidos en plantillas: una ruta por macro, recorrido completo, profundidad +32.
export function profileTemplates() {
  return Object.entries(PROFILES).map(([id, pr]) => ({ id: 'profile:' + id, builtin: true, name: pr.title, note: 'Perfil integrado: una ruta por macro, profundidad +32 (punto de partida editable).', knobs: pr.knobs.map((k) => [0, k.dests[0], 0, 127, 96, 0, 0, 127, 64, 0, 0, 127, 64, 0, 0, 127, 64]) }));
}
export function templateSummary(t) {
  return t.knobs.map((kb, k) => {
    const routes = [0, 1, 2, 3].map((j) => ({ dest: kb[1 + 4 * j], start: kb[2 + 4 * j], end: kb[3 + 4 * j], depth: kb[4 + 4 * j] })).filter((r) => r.depth !== 64 && r.start !== r.end);
    return { knob: k, routes, label: routes.map((r) => macroDestInfo(r.dest).label).join(' + ') || '—' };
  });
}

// Aplica una plantilla. mode: 'replace' (las 8), 'empty' (solo macros sin efecto), o lista de índices.
// keepPositions: conserva las posiciones guardadas del patch destino.
export function applyTemplate(payload, tpl, { mode = 'replace', knobs = null, keepPositions = true } = {}) {
  const out = new Uint8Array(payload), d = decodePatch(payload), applied = [], warnings = [];
  const which = knobs || (mode === 'empty' ? d.macros.filter((k) => !k.active).map((k) => k.index) : [0, 1, 2, 3, 4, 5, 6, 7]);
  for (const k of which) {
    const block = tpl.knobs[k]; if (!block || block.length !== 17) continue;
    const base = 204 + 17 * k, pos = out[base];
    out.set(block.map((x) => Math.max(0, Math.min(127, x | 0))), base);
    for (let j = 0; j < 4; j++) if (out[base + 1 + 4 * j] > 70) { out[base + 1 + 4 * j] = 0; out[base + 4 + 4 * j] = 64; warnings.push(`M${k + 1}: destino fuera de rango anulado`); }
    if (keepPositions) out[base] = pos;
    applied.push(k);
  }
  // Una macro que controla la profundidad de una ruta de matriz vacía no tendrá efecto.
  const after = decodePatch(out);
  for (const k of applied) for (const s of after.macros[k].slots) if (s.state === 'active' && s.info.group === 'matrix') {
    const mi = s.dest - 50, route = after.matrix[mi];
    if (route && route.s1 === 0 && route.s2 === 0 && route.dest === 0) warnings.push(`M${k + 1} controla la profundidad de la matriz ${mi + 1}, que no tiene fuente ni destino en este patch: probablemente no tendrá efecto`);
  }
  return { payload: out, applied, warnings };
}
