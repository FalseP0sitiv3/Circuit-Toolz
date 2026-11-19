// Circuit Tracks · lo necesario para publicarla en una web (v2.7): pie con aviso de no afiliación y enlaces,
// cambio de idioma, aviso de compatibilidad del navegador, Acerca de (privacidad, licencias) e informe de fallos.
// Se empaqueta después de app.js. Los enlaces salen de src/site.json; los vacíos no se muestran.
const SITE = typeof __SITE__ !== 'undefined' ? __SITE__ : { brand: 'Circuit Tools', license: 'GPL-3.0', langFiles: {} };
const PUB_LANG = () => (document.documentElement.lang === 'en' ? 'en' : 'es');

// ---------- errores: se guardan para el informe (nunca se envían a ningún sitio) ----------
const ERRLOG = [];
let pubErrShown = false;
function pubLogError(msg) {
  ERRLOG.push({ t: new Date().toISOString(), m: String(msg).slice(0, 400) });
  if (ERRLOG.length > 30) ERRLOG.shift();
  if (!pubErrShown && document.querySelector('.top')) { pubErrShown = true; toast('Algo ha fallado. Si se repite, copia el informe en Datos → Acerca de y envíamelo.', 8000); }
}
window.addEventListener('error', (e) => pubLogError((e.message || 'error') + (e.filename ? ` @${String(e.filename).split('/').pop()}:${e.lineno}` : '')));
window.addEventListener('unhandledrejection', (e) => pubLogError('promesa: ' + (e.reason && (e.reason.message || e.reason))));

// ---------- compatibilidad ----------
function pubCompat() {
  return { secure: !!window.isSecureContext, midi: !!navigator.requestMIDIAccess, folders: !!window.showDirectoryPicker, idb: !!window.indexedDB,
    touch: matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches };
}
function pubIssues() {
  const c = pubCompat(), out = [];
  if (!c.idb) out.push('Este navegador no guarda datos (¿modo privado?): la biblioteca se perderá al cerrar.');
  if (!c.secure) out.push('La página no es segura (HTTPS): Web MIDI no funcionará. Ábrela por https:// o como archivo descargado.');
  else if (!c.midi) out.push('Este navegador no tiene Web MIDI: no podrás escuchar en el Circuit, leer sus patches ni grabar patrones. Usa Chrome o Edge de escritorio.');
  if (c.secure && !c.folders) out.push('Este navegador no puede escribir en carpetas: «Organizar en disco» saldrá como ZIP.');
  if (c.touch) out.push('En un móvil o una tableta puedes consultar tu biblioteca, pero el Circuit se conecta por USB a un ordenador.');
  return out;
}
function pubCompatHTML() {
  const issues = pubIssues(), key = issues.join('|');
  if (!issues.length || lib.settings.compatSeen === key) return '';
  S.pubCompatKey = key;
  return html`<div class="compat"><b>Tu navegador</b><ul>${issues.map((x) => html`<li>${x}</li>`)}</ul><button class="btn small" data-act="compatOk">Entendido</button></div>`;
}

// ---------- pie ----------
function pubOtherLang() {
  const to = PUB_LANG() === 'es' ? 'en' : 'es', f = SITE.langFiles?.[to];
  return f ? { href: f, label: to === 'en' ? 'English' : 'Español' } : null;
}
// v3.6: selector de idioma visible (cabecera y pie): el actual marcado, el otro como enlace
function pubLangSwitch(cls = '') {
  const lf = SITE.langFiles || {}; if (!lf.es || !lf.en) return '';
  const cur = PUB_LANG();
  const item = (code) => (code === cur ? html`<span class="on" aria-current="true" lang="${code}">${code.toUpperCase()}</span>`
    : html`<a href="${lf[code]}" hreflang="${code}" lang="${code}" title="${code === 'en' ? 'English' : 'Español'}">${code.toUpperCase()}</a>`);
  return html`<span class="langsw ${cls}" role="group" aria-label="Idioma · Language">${item('es')}${item('en')}</span>`;
}
function pubFooter() {
  const ol = pubOtherLang();
  const links = [
    SITE.siteUrl && html`<a href="${SITE.siteUrl}" target="_blank" rel="noopener">${SITE.brand}</a>`,
    SITE.kofiUrl && html`<a class="support" href="${SITE.kofiUrl}" target="_blank" rel="noopener">♥ Apoyar el proyecto</a>`,
    SITE.githubUrl && html`<a href="${SITE.githubUrl}" target="_blank" rel="noopener">Código</a>`,
    html`<a href="#" data-act="about">Acerca de</a>`,
    ol && pubLangSwitch(),
  ].filter(Boolean);
  return html`<footer class="foot" id="foot"><span>Herramienta independiente, no afiliada a Novation ni a Focusrite. · v${APP_VERSION} · Todo se queda en tu navegador.${__ORIGIN__.author ? html` · © ${__ORIGIN__.year} ${__ORIGIN__.author}${raw(__WM__)}` : ''}</span><span class="foot-links">${links.map((l, i) => html`${i ? ' · ' : ''}${l}`)}</span></footer>`;
}

// ---------- Acerca de e informe ----------
async function pubStorage() {
  try {
    const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
    const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
    return { used: est?.usage, quota: est?.quota, persisted };
  } catch { return {}; }
}
function bugReport() {
  const c = pubCompat(), d = S.dev;
  return [`Circuit Tracks · Patch Library / Editor ${APP_VERSION} (${PUB_LANG()})`, new Date().toISOString(), navigator.userAgent,
    `secure=${c.secure} midi=${c.midi} folders=${c.folders} idb=${c.idb} store=${storeKind} screen=${innerWidth}x${innerHeight}`,
    `patches=${lib.patches.length} variantes=${lib.patches.filter((p) => p.kind === 'variant').length} packs=${lib.banks.length} patrones=${(lib.settings.patterns || []).length}`,
    `equipo=${d.session ? 'conectado' : 'no'} canales=${(d.channels || []).map((x) => x + 1).join('/')} midi=${(d.chMidi || []).map((x) => x + 1).join('/')} bateria=${(d.chDrum ?? 9) + 1}`,
    '--- errores ---', ...(ERRLOG.length ? ERRLOG.map((e) => `${e.t} ${e.m}`) : ['(ninguno)'])].join('\n');
}
async function pubAbout() {
  const st = await pubStorage(), mb = (b) => (b == null ? '—' : Math.round(b / 1048576) + ' MB');
  const body = html`<p><b>Circuit Tracks · Patch Library / Editor ${APP_VERSION}</b>${SITE.brand ? ' · ' + SITE.brand : ''}</p>
    <p class="note">Herramienta independiente, no afiliada a Novation ni a Focusrite. Novation, Circuit Tracks, Circuit Rhythm y Components son marcas de Focusrite Audio Engineering Ltd.</p>
    ${SITE.kofiUrl ? html`<h4 class="mlabel">Apoyar el proyecto</h4><p class="note">Es gratis y lo seguirá siendo. Si te ahorra tiempo, puedes invitarme a un café en Ko-fi: ayuda a seguir mejorándola. <a class="btn small" href="${SITE.kofiUrl}" target="_blank" rel="noopener">♥ Ko-fi</a></p>` : ''}
    <h4 class="mlabel">Autoría y licencia</h4>
    <p class="note">© ${__ORIGIN__.year} ${__ORIGIN__.author || SITE.brand || ''}. Código bajo licencia ${__ORIGIN__.license || 'GPL-3.0'}: puedes usarlo, estudiarlo y modificarlo, pero cualquier versión que publiques debe conservar este aviso de autoría, mantener la misma licencia y publicar su código.</p>
    <p class="note">Huella de esta versión: <b class="mono" id="fp">${__ORIGIN__.fp}</b>${__ORIGIN__.url ? html` · versión original en <a href="${__ORIGIN__.url}" target="_blank" rel="noopener">${__ORIGIN__.url.replace(/^https?:\/\//, '')}</a>` : ''}</p>
    <h4 class="mlabel">Privacidad</h4>
    <p class="note">No hay cuentas, servidores ni seguimiento. Tus patches, patrones y packs se guardan solo en este navegador. Nada se envía a ningún sitio, tampoco el informe de fallos: lo copias tú si quieres.</p>
    <p class="note">Espacio usado en este navegador: ${mb(st.used)} de ${mb(st.quota)}. ${st.persisted ? html`<span class="okc">Almacenamiento persistente concedido.</span>` : html`<span class="warnc">El navegador podría borrar los datos si le falta espacio: descarga copias de seguridad.</span>`}</p>
    <h4 class="mlabel">Sin garantía</h4>
    <p class="note">Se ofrece tal cual, sin garantía. Los patches se envían solo a la RAM del equipo, nunca a su memoria flash. Las funciones marcadas «sin verificar» se basan en la documentación y aún no se han confirmado en todos los equipos.</p>
    <h4 class="mlabel">Créditos y licencias</h4>
    <p class="note">Código bajo licencia ${SITE.license || 'GPL-3.0'}. Protocolo según la Programmer's Reference de Novation. Fuentes Archivo, Barlow Condensed y JetBrains Mono (SIL Open Font License).</p>
    <h4 class="mlabel">Informar de un fallo</h4>
    <p class="note">Copia este informe (versión, navegador y últimos errores, sin datos de tus patches) y pégalo al describir el problema.</p>
    <textarea id="bugrep" class="field" readonly rows="7" style="width:100%;font:11.5px var(--fm)">${bugReport()}</textarea>
    ${SITE.issuesUrl ? html`<p style="margin-top:8px"><a href="${SITE.issuesUrl}" target="_blank" rel="noopener">Abrir la página de fallos</a></p>` : ''}`;
  const r = await modal('Acerca de', body, [{ label: 'Copiar informe', value: 'copy' }, { label: 'Cerrar', primary: true, value: null }]);
  if (r === 'copy') {
    const txt = bugReport();
    try { await navigator.clipboard.writeText(txt); toast('Informe copiado.'); } catch { toast('No se pudo copiar: ábrelo de nuevo y selecciónalo con Ctrl+A.'); }
  }
}
Object.assign(A, {
  about: () => pubAbout(),
  compatOk: async (el) => { el.closest('.compat')?.remove(); lib.settings.compatSeen = S.pubCompatKey; await lib.store.putMany('settings', [{ id: 'compatSeen', value: S.pubCompatKey }]); },
});

// v3.7: firma en la consola del navegador (la ve quien abra las herramientas de desarrollo)
try { console.info(`%c${__ORIGIN__.tool} ${__ORIGIN__.version} · © ${__ORIGIN__.year} ${__ORIGIN__.author} · ${__ORIGIN__.license}${__ORIGIN__.url ? ' · ' + __ORIGIN__.url : ''} · huella ${__ORIGIN__.fp}`, 'color:#ff7a1a'); } catch {}
