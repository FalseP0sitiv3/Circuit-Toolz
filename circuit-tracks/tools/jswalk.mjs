// Recorre JS y aplica fn() al texto de cada literal (comillas y trozos de plantillas). Mantiene el código intacto.
export function walkLiterals(src, fn) {
  let out = '', i = 0; const n = src.length; let prev = '';// último carácter significativo
  const regexOK = () => !prev || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev) || /\b(return|typeof|case|in|of|else|do)$/.test(out.slice(-8));
  const tpl = () => { // i apunta tras el `
    let buf = '';
    while (i < n) {
      const c = src[i];
      if (c === '\\') { buf += c + src[i + 1]; i += 2; continue; }
      if (c === '`') { out += fn(buf, 'tpl', '`') + '`'; i++; return; }
      if (c === '$' && src[i + 1] === '{') { out += fn(buf, 'tpl', '`') + '${'; buf = ''; i += 2; code(1); continue; }
      buf += c; i++;
    }
  };
  const code = (depth) => { // hasta cerrar la llave de nivel depth
    while (i < n) {
      const c = src[i];
      if (c === '/' && src[i + 1] === '/') { const j = src.indexOf('\n', i); const e = j < 0 ? n : j; out += src.slice(i, e); i = e; continue; }
      if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2) + 2; out += src.slice(i, e); i = e; continue; }
      if (c === '/' && regexOK()) { // literal regex
        let j = i + 1, cls = false;
        while (j < n) { const d = src[j]; if (d === '\\') { j += 2; continue; } if (d === '[') cls = true; else if (d === ']') cls = false; else if (d === '/' && !cls) break; else if (d === '\n') break; j++; }
        j++; while (/[a-z]/.test(src[j])) j++;
        out += src.slice(i, j); i = j; prev = '/x'; prev = 'x'; continue;
      }
      if (c === '"' || c === "'") {
        let j = i + 1, buf = '';
        while (j < n && src[j] !== c) { if (src[j] === '\\') { buf += src[j] + src[j + 1]; j += 2; continue; } buf += src[j]; j++; }
        out += c + fn(buf, 'str', c) + c; i = j + 1; prev = 'x'; continue;
      }
      if (c === '`') { out += '`'; i++; tpl(); prev = 'x'; continue; }
      if (c === '{') depth && depth++;
      if (c === '}' && depth) { depth--; if (depth === 0) { out += '}'; i++; return; } }
      out += c; i++; if (!/\s/.test(c)) prev = c;
      if (/[a-zA-Z_$0-9]/.test(c)) prev = 'x';
      if (/[a-z]/.test(c)) { const m = /(return|typeof|case|in|of|else|do)$/.exec(out.slice(-7)); if (m && !/[\w$]/.test(src[i])) prev = '('; }
    }
  };
  code(0);
  return out;
}
// Divide un literal en tramos de texto visible (entre etiquetas) y valores de atributos visibles.
const ATTR = /\b(title|placeholder|aria-label|alt|label)="([^"<>]*)("|$)/g;
export const junk = (core) => /="|^"|^[^A-Za-zÁ-úñÑ]*$/.test(core);
export function mapText(text, tr) {
  return text.replace(/^([^<>"=]*[A-Za-zÁ-úñÑ][^<>"=]*)(?="[^<>]*>)/, (run) => mapRun(run, tr)).replace(/(^|>)([^<>]+)(?=<|$)/g, (m, a, run) => a + (junk(run.trim()) ? run.replace(ATTR, (mm, k, v, q) => `${k}="${mapRun(v, tr)}${q}`) : mapRun(run, tr)))
    .replace(/<[^<>]*(>|$)|^[^<>]*>/g, (tag) => tag.replace(ATTR, (mm, k, v, q) => `${k}="${mapRun(v, tr)}${q}`));
}
function mapRun(run, tr) {
  const lead = run.match(/^\s*/)[0], trail = run.match(/\s*$/)[0], core = run.trim();
  if (!core) return run;
  const t = tr(core); return t == null ? run : lead + t + trail;
}
