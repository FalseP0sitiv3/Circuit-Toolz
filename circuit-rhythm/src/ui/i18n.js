// ui/i18n.js — el texto se escribe en español; la versión inglesa sustituye por diccionario al generar.
const LANG = typeof __LANG__ !== 'undefined' ? __LANG__ : 'es';
const DICT = typeof __DICT__ !== 'undefined' ? __DICT__ : {};
function t(s, p) {
  let r = LANG === 'es' ? s : (DICT[s] != null ? DICT[s] : s);
  if (p) r = r.replace(/\{(\w+)\}/g, (_, k) => (p[k] != null ? p[k] : ''));
  return r;
}
const LOCALE = LANG === 'es' ? 'es-ES' : 'en-GB';
function nf(n, d = 1) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d });
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Mensajes de error del núcleo (lectura de audio, ZIP, MIDI)
const ERR_EN = [
  [/^archivo demasiado corto$/, 'file too short'], [/^no es WAV ni AIFF$/, 'not a WAV or AIFF file'], [/^RIFF sin WAVE$/, 'RIFF without WAVE'],
  [/^WAV sin bloque fmt$/, 'WAV without a fmt chunk'], [/^WAV sin datos$/, 'WAV without data'], [/^WAV comprimido \(formato (\d+)\)$/, 'compressed WAV (format $1)'],
  [/^profundidad (\d+)$/, 'unsupported bit depth $1'], [/^FORM sin AIFF$/, 'FORM without AIFF'], [/^AIFF incompleto$/, 'incomplete AIFF'],
  [/^AIFC comprimido \((.*)\)$/, 'compressed AIFC ($1)'], [/^ZIP sin directorio central$/, 'ZIP without a central directory'], [/^ZIP64 no admitido$/, 'ZIP64 not supported'],
  [/^ZIP dañado$/, 'damaged ZIP'], [/^cabecera local dañada$/, 'damaged local header'], [/^ZIP cifrado$/, 'encrypted ZIP'], [/^método ZIP (\d+)$/, 'ZIP method $1'],
  [/^sin salida MIDI$/, 'no MIDI output'], [/^falta la plantilla de proyecto$/, 'project template missing'],
];
function errT(m) {
  m = String(m == null ? '' : m);
  if (LANG === 'es') return m;
  for (const [rx, en] of ERR_EN) if (rx.test(m)) return m.replace(rx, en);
  return DICT[m] != null ? DICT[m] : m;
}
