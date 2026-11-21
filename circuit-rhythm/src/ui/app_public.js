// ui/app_public.js — v1.2: lo necesario para publicarla en una web
// pie con aviso de no afiliación y enlaces, cambio de idioma, compatibilidad del navegador, Acerca de,
// informe de fallos, confirmación antes de escribir en la tarjeta y espacio ocupado.
const SITE = typeof __SITE__ !== 'undefined' ? __SITE__ : { brand: 'Circuit Tools', langFiles: {} };

// ---------- errores: se guardan para el informe (nunca se envían a ningún sitio) ----------
const ERRLOG = [];
let errToastShown = false;
function logError(msg) {
  ERRLOG.push({ t: new Date().toISOString(), m: String(msg).slice(0, 400) });
  if (ERRLOG.length > 30) ERRLOG.shift();
  if (!errToastShown && document.getElementById('toast')) {
    errToastShown = true;
    toast(t('Algo ha fallado. Si se repite, copia el informe en 07 Datos → Acerca de y envíamelo.'), 'warn', 8000);
  }
}
window.addEventListener('error', (e) => logError((e.message || 'error') + (e.filename ? ` @${String(e.filename).split('/').pop()}:${e.lineno}` : '')));
window.addEventListener('unhandledrejection', (e) => logError('promesa: ' + (e.reason && (e.reason.message || e.reason))));

// ---------- compatibilidad ----------
function compat() {
  const touchOnly = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
  return {
    secure: !!window.isSecureContext,
    midi: !!navigator.requestMIDIAccess,
    folders: !!window.showDirectoryPicker,
    idb: !!window.indexedDB,
    narrow: window.innerWidth < 900 || touchOnly,
  };
}
function compatIssues() {
  const c = compat(), out = [];
  if (!c.idb) out.push(t('Este navegador no guarda datos (¿modo privado?): la biblioteca se perderá al cerrar.'));
  if (!c.secure) out.push(t('La página no es segura (HTTPS): Web MIDI y las carpetas no funcionarán. Ábrela por https:// o como archivo descargado.'));
  else {
    if (!c.folders) out.push(t('Este navegador no puede enlazar carpetas ni escribir en la tarjeta SD: podrás copiar archivos y descargar ZIP. Para todo, usa Chrome o Edge de escritorio.'));
    if (!c.midi) out.push(t('Este navegador no tiene Web MIDI: no podrás escuchar en la Rhythm ni grabar patrones. Usa Chrome o Edge de escritorio.'));
  }
  if (c.narrow) out.push(t('Está pensada para ordenador: en pantallas pequeñas o táctiles funciona, pero incómoda.'));
  return out;
}
async function compatBanner() {
  const issues = compatIssues();
  if (!issues.length) return;
  const key = issues.join('|');
  try { if ((await S.lib?.kvGet('compatSeen')) === key) return; } catch {}
  const el = document.createElement('div');
  el.className = 'compat';
  el.innerHTML = `<b>${t('Tu navegador')}</b><ul>${issues.map((i) => `<li>${i}</li>`).join('')}</ul><button class="btn small" data-act="compat-ok">${t('Entendido')}</button>`;
  document.querySelector('main').prepend(el);
  S._compatKey = key;
}

// ---------- pie (todas las vistas) ----------
function otherLang() {
  const lf = SITE.langFiles || {};
  const to = LANG === 'es' ? 'en' : 'es';
  return lf[to] ? { href: lf[to], label: to === 'en' ? 'English' : 'Español' } : null;
}
// v2.1: selector de idioma visible (cabecera y pie): el actual marcado, el otro como enlace
function langSwitchHTML(cls = '') {
  const lf = SITE.langFiles || {}; if (!lf.es || !lf.en) return '';
  const item = (code) => (code === LANG ? `<span class="on" aria-current="true" lang="${code}">${code.toUpperCase()}</span>`
    : `<a href="${esc(lf[code])}" data-act="lang-switch" hreflang="${code}" lang="${code}" title="${code === 'en' ? 'English' : 'Español'}">${code.toUpperCase()}</a>`);
  return `<span class="langsw ${cls}" role="group" aria-label="Idioma · Language">${item('es')}${item('en')}</span>`;
}
function renderFooter() {
  const f = document.getElementById('foot'); if (!f) return;
  const ol = otherLang();
  const links = [
    SITE.siteUrl && `<a href="${esc(SITE.siteUrl)}" target="_blank" rel="noopener">${esc(SITE.brand)}</a>`,
    SITE.kofiUrl && `<a class="support" href="${esc(SITE.kofiUrl)}" target="_blank" rel="noopener">♥ ${t('Apoyar el proyecto')}</a>`,
    SITE.githubUrl && `<a href="${esc(SITE.githubUrl)}" target="_blank" rel="noopener">${t('Código')}</a>`,
    `<a href="#" data-act="about">${t('Acerca de')}</a>`,
  ].filter(Boolean);
  if (ol) links.push(langSwitchHTML());
  f.innerHTML = `<span>${t('Herramienta independiente, no afiliada a Novation ni a Focusrite.')} · v${APP_VERSION} · ${t('Todo se queda en tu navegador.')}${__ORIGIN__.author ? ` · © ${__ORIGIN__.year} ${esc(__ORIGIN__.author)}${__WM__}` : ''}</span><span class="foot-links">${links.join(' · ')}</span>`;
}

// ---------- Acerca de, privacidad, informe ----------
async function storageInfo() {
  try {
    const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
    const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
    return { used: est?.usage, quota: est?.quota, persisted };
  } catch { return {}; }
}
function bugReport() {
  const c = compat();
  const lines = [
    `Circuit Rhythm · Sample Library ${APP_VERSION} (${LANG})`,
    `${new Date().toISOString()}`,
    `${navigator.userAgent}`,
    `secure=${c.secure} midi=${c.midi} folders=${c.folders} idb=${c.idb} screen=${window.innerWidth}x${window.innerHeight}`,
    `samples=${S.samples.length} packs=${S.packs.length} roots=${S.roots.size} errores_lectura=${S.samples.filter((s) => s.analysis?.error).length}`,
    `midi_conectado=${!!(S.midiOn && S.midi.out)} salida=${S.midi.out ? S.midi.out.name : '-'}`,
    '--- errores ---',
    ...(ERRLOG.length ? ERRLOG.map((e) => `${e.t} ${e.m}`) : ['(ninguno)']),
  ];
  return lines.join('\n');
}
async function aboutHTML() {
  const st = await storageInfo();
  const mb = (b) => (b == null ? '—' : nf(b / 1048576, 0) + ' MB');
  return `<h2>${t('Acerca de')}</h2>
    <p><b>Circuit Rhythm · Sample Library ${APP_VERSION}</b>${SITE.brand ? ` · ${esc(SITE.brand)}` : ''}</p>
    <p class="note">${t('Herramienta independiente, no afiliada a Novation ni a Focusrite. Novation, Circuit Rhythm, Circuit Tracks y Components son marcas de Focusrite Audio Engineering Ltd.')}</p>
    ${SITE.kofiUrl ? `<h3>${t('Apoyar el proyecto')}</h3><p class="note">${t('Es gratis y lo seguirá siendo. Si te ahorra tiempo, puedes invitarme a un café en Ko-fi: ayuda a seguir mejorándola.')} <a class="btn small" href="${esc(SITE.kofiUrl)}" target="_blank" rel="noopener">♥ Ko-fi</a></p>` : ''}
    <h3>${t('Autoría y licencia')}</h3>
    <p class="note">© ${__ORIGIN__.year} ${esc(__ORIGIN__.author || SITE.brand || '')}. ${t('Código bajo licencia {l}: puedes usarlo, estudiarlo y modificarlo, pero cualquier versión que publiques debe conservar este aviso de autoría, mantener la misma licencia y publicar su código.', { l: esc(__ORIGIN__.license || 'GPL-3.0') })}</p>
    <p class="note">${t('Huella de esta versión')}: <b class="mono" id="fp">${__ORIGIN__.fp}</b>${__ORIGIN__.url ? ` · ${t('versión original en {u}', { u: `<a href="${esc(__ORIGIN__.url)}" target="_blank" rel="noopener">${esc(__ORIGIN__.url.replace(/^https?:\/\//, ''))}</a>` })}` : ''}</p>
    <h3>${t('Privacidad')}</h3>
    <p class="note">${t('No hay cuentas, servidores ni seguimiento. Tus samples, fichas y packs se guardan solo en este navegador; las carpetas enlazadas se leen de tu disco y no se copian. Nada se envía a ningún sitio, tampoco el informe de fallos: lo copias tú si quieres.')}</p>
    <p class="note">${t('Espacio usado en este navegador: {u} de {q}.', { u: mb(st.used), q: mb(st.quota) })} ${st.persisted ? `<span class="ok">${t('Almacenamiento persistente concedido.')}</span>` : `<span class="warn">${t('El navegador podría borrar los datos si le falta espacio: descarga copias de seguridad.')}</span>`}</p>
    <h3>${t('Sin garantía')}</h3>
    <p class="note">${t('Se ofrece tal cual, sin garantía. Antes de escribir en la microSD por primera vez, haz una copia de la tarjeta.')}</p>
    <h3>${t('Créditos y licencias')}</h3>
    <p class="note">${t('Código bajo licencia {l}. Formato de pack y de proyecto basado en el trabajo abierto del proyecto CircuitGM (plantilla de proyecto vacío con licencia MPL-2.0). Fuentes Archivo, Barlow Condensed y JetBrains Mono (SIL Open Font License).', { l: esc(SITE.license || 'GPL-3.0') })}</p>
    <h3>${t('Informar de un fallo')}</h3>
    <p class="note">${t('Copia este informe (versión, navegador y últimos errores, sin ningún dato de tus samples) y pégalo al describir el problema.')}</p>
    <textarea id="bugrep" readonly rows="7" style="width:100%;font-family:var(--f-mono);font-size:11.5px;background:#121215;border:1px solid var(--line2);border-radius:6px;color:var(--muted)">${esc(bugReport())}</textarea>
    <div class="row" style="justify-content:flex-end;margin-top:8px">${SITE.issuesUrl ? `<a class="btn" href="${esc(SITE.issuesUrl)}" target="_blank" rel="noopener">${t('Abrir la página de fallos')}</a>` : ''}<button class="btn" data-act="bug-copy">${t('Copiar informe')}</button><button class="btn primary" data-act="modal-close">${t('Cerrar')}</button></div>`;
}

// ---------- confirmación antes de escribir en la tarjeta por primera vez ----------
function sdConfirm(then) {
  if (S.set.sdConfirmed) { then(); return; }
  modal(`<h2>${t('Antes de escribir en la tarjeta')}</h2>
    <p class="note" style="color:var(--ink)">${t('La herramienta solo crea un pack nuevo en una posición libre y nunca sobrescribe lo que hay. Aun así, haz antes una copia de la tarjeta.')}</p>
    <ul class="note" style="color:var(--ink)"><li>${t('Copia la carpeta Rhythm de la tarjeta a tu ordenador.')}</li><li>${t('La tarjeta debe estar en FAT32 y la Rhythm con el firmware al día.')}</li><li>${t('Expulsa la tarjeta desde el sistema antes de sacarla.')}</li></ul>
    <label class="inl" style="color:var(--ink)"><input type="checkbox" id="sd-ok"> ${t('He hecho una copia de la tarjeta')}</label>
    <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn" data-act="modal-close">${t('Cancelar')}</button><button class="btn primary" id="sd-go">${t('Continuar')}</button></div>`);
  document.getElementById('sd-go').onclick = () => {
    if (!document.getElementById('sd-ok').checked) { toast(t('Marca la casilla cuando tengas la copia.'), 'warn'); return; }
    S.set.sdConfirmed = true; saveSettings(); closeModal(); then();
  };
}

// ---------- acciones ----------
const _expSd = ACT['exp-sd'], _expSdZip = ACT['exp-sdzip'];
Object.assign(ACT, {
  'compat-ok': async (el) => { el.closest('.compat')?.remove(); try { await S.lib.kvSet('compatSeen', S._compatKey); } catch {} },
  about: async () => { modal(await aboutHTML()); },
  'bug-copy': async () => {
    const txt = bugReport();
    try { await navigator.clipboard.writeText(txt); toast(t('Informe copiado.')); }
    catch { const ta = document.getElementById('bugrep'); ta?.select(); document.execCommand?.('copy'); toast(t('Informe seleccionado: cópialo con Ctrl+C.')); }
  },
  'lang-switch': (el) => { location.href = el.getAttribute('href'); }, // misma carpeta o misma web: comparten biblioteca
  'exp-sd': () => sdConfirm(() => _expSd()),
  'exp-sdzip': () => sdConfirm(() => _expSdZip()),
});

// cada vez que se pinta la cabecera, se pinta también el pie
const _renderHeader = renderHeader;
let _compatDone = false;
renderHeader = function () { _renderHeader(); renderFooter(); if (!_compatDone && S.lib) { _compatDone = true; compatBanner(); } };
setTimeout(renderFooter, 0);

// v2.2: firma en la consola del navegador (la ve quien abra las herramientas de desarrollo)
try { console.info(`%c${__ORIGIN__.tool} ${__ORIGIN__.version} · © ${__ORIGIN__.year} ${__ORIGIN__.author} · ${__ORIGIN__.license}${__ORIGIN__.url ? ' · ' + __ORIGIN__.url : ''} · huella ${__ORIGIN__.fp}`, 'color:#4aa3e8'); } catch {}
