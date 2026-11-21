// Análisis por patch (compatibilidad, comprobaciones, carácter) y de la biblioteca (franja de análisis, clustering).
import { approxSeconds } from './params.js';
import { profileFit } from './macros.js';
import { vectorize } from './families.js';
import { CAT_LABEL } from './classify.js';

// Estado de compatibilidad para la lista: native · legacy · converted · duplicate.
// lib: Library (usa families(), byId(), info()).
export function compatibility(p, lib) {
  const inf = lib.info(p), fam = lib.families().of.get(p.id);
  const root = p.rootId ? lib.byId(p.rootId) : p.parentId ? lib.byId(p.parentId) : null;
  const legacyOrigin = p.header.product === 0x60 || root?.header?.product === 0x60;
  const me = fam?.members.find((m) => m.id === p.id);
  const dupOf = me?.rel && (me.rel.level === 'payload' || me.rel.level === 'synth') ? fam.head : null;
  let status = 'native';
  if (legacyOrigin) status = p.kind === 'variant' ? 'converted' : 'legacy';
  if (dupOf) status = 'duplicate';
  const warn = inf.integrity.filter((x) => x.level !== 'info'), reserved = inf.integrity.filter((x) => /reservado/i.test(x.text));
  const macroBad = inf.macros.integrity, unknown70 = inf.macros.knobs.some((k) => k.slots.some((s) => s.state === 'active' && s.dest === 70));
  const checks = [
    p.header.product === 0x64 ? { level: 'ok', text: 'Cabecera Circuit Tracks (0x64)' } : { level: 'info', text: 'Cabecera del Circuit original (0x60): Components la acepta; se exporta con cabecera de Circuit Tracks.' },
    warn.length ? { level: 'warn', text: `${warn.length} valor(es) fuera del rango documentado` } : { level: 'ok', text: 'Parámetros dentro del rango documentado' },
    reserved.length ? { level: 'info', text: `${reserved.length} byte(s) reservados distintos de 0` } : { level: 'ok', text: 'Bytes reservados a 0' },
    macroBad.length ? { level: 'warn', text: `${macroBad.length} destino(s) de macro fuera de 0–70` } : { level: 'ok', text: 'Destinos de macro dentro de 0–70' },
    unknown70 ? { level: 'info', text: 'Alguna macro usa el código 70 (significado desconocido)' } : { level: 'ok', text: 'Sin códigos de macro desconocidos' },
    ...(p.repaired?.length ? [{ level: 'info', text: 'Recuperado de un archivo con cabecera no estándar (' + p.repaired.map((r) => r === 'location' ? 'número de patch 0xFF' : 'sin F7 final').join(', ') + '). Los 340 bytes del patch están intactos; al exportar se escribe una cabecera válida.' }] : []),
    inf.an.decoded.nameNonPrintable ? { level: 'info', text: 'Nombre con caracteres no imprimibles' } : { level: 'ok', text: 'Nombre ASCII legible' },
    dupOf ? { level: 'warn', text: `Duplicado de «${lib.byId(dupOf)?.name}»` } : { level: 'ok', text: fam ? 'Pertenece a una familia, sin duplicado exacto' : 'Sin duplicados' }
  ];
  return { status, checks, dupOf };
}
export const COMPAT_LABEL = { native: 'Tracks', legacy: 'Circuit OG', converted: 'Convertido', duplicate: 'Duplicado' };

// Comprobaciones de revisión: se informa «N de M», no una puntuación inventada.
export function auditChecks(p, lib, profileId) {
  const inf = lib.info(p), m = p.meta, compat = compatibility(p, lib);
  const fit = profileFit(p.payload, profileId), fitN = fit.filter((f) => f.status === 'match' || f.status === 'group').length;
  const items = [
    { group: 'Datos', level: compat.checks.some((c) => c.level === 'warn' && !/Duplicado/.test(c.text)) ? 'warn' : 'ok', text: compat.checks.some((c) => c.level === 'warn' && !/Duplicado/.test(c.text)) ? 'Hay valores fuera de rango' : 'Parámetros y macros dentro de rango' },
    { group: 'Duplicado', level: compat.dupOf ? 'warn' : 'ok', text: compat.dupOf ? 'Duplicado de otro patch' : 'Sin duplicado exacto' },
    { group: 'Macros', level: inf.macros.knobs.every((k) => k.activeCount) ? 'ok' : 'info', text: `${inf.macros.knobs.filter((k) => k.activeCount).length}/8 macros con efecto · ${fitN}/8 encajan en tu perfil` },
    { group: 'Clasificación', level: m.category ? 'ok' : 'warn', text: m.category ? 'Categoría guardada' : 'Sin categoría guardada (solo propuesta)' },
    { group: 'Coherencia', level: inf.cls.contradictions.length ? 'warn' : 'ok', text: inf.cls.contradictions.length ? `${inf.cls.contradictions.length} contradicción(es)` : 'Sin contradicciones' },
    { group: 'Escucha', level: ['listened', 'keep'].includes(m.review) || m.auditions ? 'ok' : 'warn', text: ['listened', 'keep'].includes(m.review) || m.auditions ? 'Escuchado' : 'Sin escuchar' },
    { group: 'Medición', level: p.acoustic && !p.acoustic.desc.silent ? 'ok' : 'info', text: p.acoustic ? (p.acoustic.desc.silent ? 'Medición sin señal' : 'Medido acústicamente') : 'Sin medir (opcional)' }
  ];
  return { items, passed: items.filter((x) => x.level === 'ok').length, total: items.length };
}

// Carácter («mood»): medido > declarado en el nombre > indicio de parámetros. Siempre con su origen.
export function mood(p, lib) {
  const mf = p.acoustic?.features || [], H = (id) => mf.some((f) => f.id === id);
  if (mf.length && !H('m-silent')) {
    if (H('m-dark')) return { label: 'Dark', source: 'measured' };
    if (H('m-bright')) return { label: 'Bright', source: 'measured' };
    if (H('m-noisy')) return { label: 'Noisy', source: 'measured' };
    if (H('m-moving')) return { label: 'Moving', source: 'measured' };
  }
  if (p.meta.descriptors?.length) return { label: p.meta.descriptors[0], source: 'user' };
  const d = lib.info(p).cls.descriptors.find((x) => x.declared); if (d) return { label: d.label, source: 'name' };
  const f = lib.info(p).an.features, F = (id) => f.some((x) => x.id === id);
  if (F('acid-like')) return { label: 'Acid', source: 'params' };
  if (F('distortion') || F('filter-drive')) return { label: 'Driven', source: 'params' };
  if (F('low-cutoff')) return { label: 'Closed', source: 'params' };
  if (F('open-filter')) return { label: 'Open', source: 'params' };
  if (F('lfo-mod')) return { label: 'Moving', source: 'params' };
  return null;
}
export const MOOD_SOURCE = { measured: 'medido', user: 'tu etiqueta', name: 'del nombre', params: 'indicio de parámetros' };

// Brillo estimado por parámetros (0–10): filtro LP + cutoff + envolvente, ondas, ruido. Es una ESTIMACIÓN.
export function brightnessEstimate(payload) {
  const ft = payload[63], fq = payload[64], env = Math.max(0, payload[68] - 64), res = payload[66], routing = payload[60];
  let b = ft <= 1 ? fq / 127 * 7 + env / 63 * 1.5 : ft <= 3 ? 6 : 8;
  if (routing === 2) b = 8;
  if (payload[36] >= 14 || payload[45] >= 14) b += 0.5;
  if (payload[36] <= 1 && (payload[55] < 10 || payload[45] <= 1)) b -= 1.5;
  b += res / 127 * 0.8 + payload[57] / 127 * 1.2 + payload[100] / 127 * 1;
  return Math.max(0, Math.min(10, b));
}

// k-means (k-means++ determinista) sobre vectores de parámetros.
export function kmeans(rows, k = 8, iters = 25) {
  const n = rows.length; if (!n) return { assign: [], centers: [] };
  k = Math.min(k, n);
  const d2 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return s; };
  const centers = [rows[0].slice()];
  while (centers.length < k) {
    let best = -1, bi = 0;
    for (let i = 0; i < n; i++) { const d = Math.min(...centers.map((c) => d2(rows[i], c))); if (d > best) { best = d; bi = i; } }
    centers.push(rows[bi].slice());
  }
  const assign = new Array(n).fill(0);
  for (let it = 0; it < iters; it++) {
    let moved = false;
    for (let i = 0; i < n; i++) { let bj = 0, bd = Infinity; for (let j = 0; j < k; j++) { const d = d2(rows[i], centers[j]); if (d < bd) { bd = d; bj = j; } } if (assign[i] !== bj) { assign[i] = bj; moved = true; } }
    for (let j = 0; j < k; j++) { const mem = rows.filter((_, i) => assign[i] === j); if (!mem.length) continue; centers[j] = centers[j].map((_, d) => mem.reduce((s, r) => s + r[d], 0) / mem.length); }
    if (!moved && it) break;
  }
  return { assign, centers };
}

// Datos de la franja de análisis de la biblioteca.
export function libraryAnalysis(lib, profileId = 'techno', k = 8) {
  const ps = lib.patches, N = ps.length;
  const fam = lib.families(); let dup = 0;
  const dupIdsTmp = []; for (const f of fam.list) for (const m of f.members) if (m.rel && (m.rel.level === 'payload' || m.rel.level === 'synth')) { dup++; dupIdsTmp.push(m.id); }
  const tracks = ps.filter((p) => p.header.product === 0x64).length;
  const envBins = [0, 0, 0, 0, 0], envEdges = [0.1, 0.3, 1, 3];
  const briBins = new Array(10).fill(0), envIds = [[], [], [], [], []], briIds = Array.from({ length: 10 }, () => []); let mono = 0, consistent = 0, measuredBri = 0;
  for (const p of ps) {
    const len = approxSeconds(p.payload[73]) + (p.payload[72] < 30 ? approxSeconds(p.payload[71]) : 0);
    const eb = envEdges.findIndex((e) => len < e) === -1 ? 4 : envEdges.findIndex((e) => len < e); envBins[eb]++; envIds[eb].push(p.id);
    let b = brightnessEstimate(p.payload);
    const d = p.acoustic?.desc; if (d && !d.silent && d.f0 && d.centroid) { b = Math.max(0, Math.min(10, Math.log2(d.centroid / d.f0) * 2.5)); measuredBri++; }
    briBins[Math.min(9, Math.floor(b))]++; briIds[Math.min(9, Math.floor(b))].push(p.id);
    if (p.payload[32] <= 1) mono++;
    if (profileFit(p.payload, profileId).filter((f) => f.status === 'match' || f.status === 'group').length >= 6) consistent++;
  }
  let clusters = [];
  if (N >= 3) {
    const { assign } = kmeans(ps.map((p) => vectorize(p.payload)), Math.min(k, Math.max(2, Math.round(Math.sqrt(N / 2)))));
    const groups = new Map(); assign.forEach((c, i) => { if (!groups.has(c)) groups.set(c, []); groups.get(c).push(ps[i]); });
    clusters = [...groups.entries()].map(([c, members]) => {
      const counts = {}; for (const p of members) { const cat = p.meta.category || lib.info(p).cls.category || 'none'; counts[cat] = (counts[cat] || 0) + 1; }
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      return { id: c, ids: members.map((p) => p.id), size: members.length, label: top[0] === 'none' ? 'Sin categoría' : CAT_LABEL[top[0]], purity: top[1] / members.length };
    }).sort((a, b) => b.size - a.size);
  }
  return { dupIds: dupIdsTmp, envIds, briIds, N, dup, dupPct: N ? dup / N : 0, tracks, legacy: N - tracks, envBins, envLabels: ['<0,1 s', '0,1–0,3', '0,3–1', '1–3', '>3 s'], briBins, measuredBri, mono, poly: N - mono, consistent, consistentPct: N ? consistent / N : 0, clusters };
}
