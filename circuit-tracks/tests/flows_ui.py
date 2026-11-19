"""Flujos completos que el recorrido automático no puede probar a ciegas (borran, escriben en disco o restauran).
Colección real + Circuit Tracks SIMULADO + carpeta de disco SIMULADA (File System Access en memoria).
No valida hardware ni sonido. Uso: python3 tests/flows_ui.py CARPETA"""
import sys, os, re, threading, http.server, functools, json, tempfile
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FAKE_MIDI = re.search(r'FAKE_MIDI = """(.*?)"""', open(os.path.join(ROOT, 'tests', 'browser_test.py')).read(), re.S).group(1)
FAKE_FS = """(() => {
  const mk = (name) => ({ kind: 'directory', name, dirs: {}, files: {},
    async getDirectoryHandle(n, o) { if (!this.dirs[n]) { if (!o?.create) throw new DOMException('no', 'NotFoundError'); this.dirs[n] = mk(n); } return this.dirs[n]; },
    async getFileHandle(n, o) { const self = this; if (!(n in self.files) && !o?.create) throw new DOMException('no', 'NotFoundError'); if (!(n in self.files)) self.files[n] = null;
      return { kind: 'file', name: n, async createWritable() { const parts = []; return { async write(d) { parts.push(d); }, async close() { const b = new Blob(parts.map((x) => x instanceof Uint8Array ? x : typeof x === 'string' ? x : new Uint8Array(x))); self.files[n] = new Uint8Array(await b.arrayBuffer()); } }; } }; } });
  window.__fsRoot = mk('Elegida');
  window.showDirectoryPicker = async () => window.__fsRoot;
  window.__fsList = () => { const out = []; const walk = (d, p) => { for (const [n, b] of Object.entries(d.files)) out.push({ path: p + n, size: b ? b.length : -1, head: b ? [...b.slice(0, 6)] : [] }); for (const [n, s] of Object.entries(d.dirs)) walk(s, p + n + '/'); }; walk(window.__fsRoot, ''); return out; };
})();"""
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8773), functools.partial(Q, directory=os.path.join(ROOT, 'dist'))); threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:8773/' + os.environ.get('CT_HTML', 'Circuit_Tracks_Patch_Library_Editor.html')
res = []; errors = []
def ok(name, cond, extra=''): res.append((bool(cond), name, extra)); print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if extra else ''))
E = lambda pg, js: pg.evaluate(js)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1500, 'height': 980}, accept_downloads=True); ctx.add_init_script(FAKE_MIDI); ctx.add_init_script(FAKE_FS)
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)[:300]))
    pg.goto(URL); pg.wait_for_timeout(400)
    pg.set_input_files('#dirIn', sys.argv[1]); pg.wait_for_selector('.modal', timeout=60000); pg.click('.modal .btn'); pg.wait_for_timeout(300)
    n0 = E(pg, "window.__ctpl.lib.patches.length")
    view = lambda v: (E(pg, f"window.__ctpl.A.view({{dataset:{{v:'{v}'}}}})"), pg.wait_for_timeout(250))
    # --- A · octavas → cambios ---
    view('organize'); pg.click('[data-act="orgTab"][data-t="register"]'); pg.wait_for_timeout(300)
    pg.select_option('select[data-k="regAdopt"]', 'none'); pg.wait_for_timeout(200)
    nfix = E(pg, "document.querySelector('[data-act=\"regFixPlan\"]:not([disabled])') ? 1 : 0")
    pg.click('[data-act="regFixPlan"]'); pg.click('.modal .btn.primary'); pg.wait_for_selector('.modal h3 >> text=/creada|created/i')
    drafts = E(pg, "window.__ctpl.lib.patches.filter(p=>p.kind==='variant'&&window.__ctpl.lib.changeState(p)==='draft').length")
    ok('Octavas en modo «borrador»: crea variantes sin aceptar ninguna', nfix and drafts > 0, f'{drafts} borradores')
    pg.click('.modal .btn.primary'); pg.wait_for_timeout(300)
    ok('El aviso lleva a la revisión rápida', E(pg, "window.__ctpl.S.view") == 'organize' and E(pg, "window.__ctpl.S.regView") == 'review' and pg.locator('.regrev').count() == 1)
    E(pg, "window.__ctpl.S.regView = 'plan'")
    # repetir no duplica
    view('organize'); pg.click('[data-act="orgTab"][data-t="register"]'); pg.wait_for_timeout(200)
    ok('Repetir la corrección no duplica: los que tienen borrador no se vuelven a ofrecer', pg.locator('[data-act="regFixPlan"]:not([disabled])').count() == 0 or E(pg, "window.__ctpl.lib.patches.filter(p=>p.kind==='variant').length") == drafts)
    view('changes')
    first = E(pg, "window.__ctpl.lib.patches.find(p=>p.kind==='variant').id")
    pg.locator(f'[data-act="chgDrop"][data-id="{first}"]').click(); pg.click('.modal .btn.primary'); pg.wait_for_timeout(300)
    ok('Descartar una variante la borra y el original queda intacto', E(pg, f"!window.__ctpl.lib.byId('{first}')") and E(pg, "window.__ctpl.lib.patches.filter(p=>p.kind!=='variant').length") == n0)
    pg.click('[data-act="chgAdoptAll"]'); pg.click('.modal .btn.primary'); pg.wait_for_timeout(400)
    adopted = E(pg, "window.__ctpl.lib.patches.filter(p=>window.__ctpl.lib.changeState(p)==='adopted').length")
    ok('Aceptar todos: cada borrador pasa a aceptado y su original a sustituido', adopted == drafts - 1 and E(pg, "window.__ctpl.lib.patches.filter(p=>window.__ctpl.lib.changeState(p)==='superseded').length") == adopted, f'{adopted}')
    # --- B · patrón adjunto + ordenar en disco (carpeta simulada) ---
    E(pg, "(()=>{const L=window.__ctpl.lib,S=window.__ctpl.S; const v=L.patches.find(p=>L.changeState(p)==='adopted'); S.sel=v.parentId; window.__orig=v.parentId; window.__ad=v.id;})()")
    view('patterns'); pg.click('[data-act="patAttach"]'); pg.wait_for_selector('#patNm'); pg.fill('#patNm', 'Bajo prueba'); pg.click('.modal .btn.primary'); pg.wait_for_timeout(300)
    view('organize'); pg.click('[data-act="orgTab"][data-t="disk"]'); pg.wait_for_timeout(300)
    plan = E(pg, "(()=>{const o=window.__ctpl.S.plan; return null})()")
    pg.click('[data-act="planWrite"]'); pg.wait_for_timeout(1500)
    files = E(pg, "window.__fsList()")
    syx = [f for f in files if f['path'].endswith('.syx')]; mid = [f for f in files if f['path'].endswith('.mid')]; csv = [f for f in files if f['path'].endswith('.csv')]
    expect = E(pg, "window.__ctpl.lib.patches.filter(p=>['original','adopted'].includes(window.__ctpl.lib.changeState(p)) && p.meta.review!=='discard').length")
    ok('Ordenar en disco escribe un .syx por versión vigente (originales + aceptadas, sin sustituidos)', len(syx) == expect, f'{len(syx)} de {expect}')
    ok('Todos los .syx escritos son SysEx de Circuit válidos (F0 00 20 29 01 …)', syx and all(f['head'][:5] == [0xF0, 0, 0x20, 0x29, 1] for f in syx))
    adname = E(pg, "window.__ctpl.lib.byId(window.__orig).name")
    ok('La variante aceptada lleva el nombre de su original y su .mid al lado', any(adname in f['path'] for f in syx) and len(mid) >= 1 and any(m['path'][:-4] == s['path'][:-4] for m in mid for s in syx), f'{len(mid)} .mid')
    ok('Se escribe el manifiesto CSV en una subcarpeta con fecha', csv and all(f['path'].count('/') >= 1 for f in files))
    # --- C · Datos › escribir por categoría ---
    E(pg, "window.__fsRoot.dirs={};window.__fsRoot.files={}"); view('data')
    pg.locator('[data-act="goDisk"]').click(); pg.wait_for_timeout(300)
    ok('Datos › Organizar en disco lleva al mismo plan (una sola forma de escribir)', E(pg, "window.__ctpl.S.view") == 'organize' and E(pg, "window.__ctpl.S.orgTab") == 'disk')
    view('data')
    # --- D · copia → biblioteca nueva → restaurar ---
    before = E(pg, "(()=>{const L=window.__ctpl.lib; return {n:L.patches.length, ad:L.patches.filter(p=>L.changeState(p)==='adopted').length, pats:(L.settings.patterns||[]).length, att:L.patches.filter(p=>p.meta.patternId).length}})()")
    with pg.expect_download() as d: pg.locator('[data-act="backup"]').first.click()
    bpath = os.path.join(tempfile.gettempdir(), 'ctpl_backup_test.json'); d.value.save_as(bpath)
    pg.click('[data-act="resetLib"]'); pg.fill('#rsConfirm', 'DELETE' if '_EN' in URL else 'BORRAR'); pg.click('.modal .btn.danger'); pg.wait_for_timeout(600)
    ok('Biblioteca nueva: queda vacía y conserva patrones', E(pg, "window.__ctpl.lib.patches.length") == 0 and E(pg, "(window.__ctpl.lib.settings.patterns||[]).length") == before['pats'])
    pg.reload(); pg.wait_for_timeout(600)
    ok('Tras recargar sigue vacía (el borrado es persistente)', E(pg, "window.__ctpl.lib.patches.length") == 0)
    pg.set_input_files('#fileIn', bpath); pg.wait_for_timeout(400)
    if pg.locator('.modal').count(): pg.locator('.modal .btn.primary').first.click(); pg.wait_for_timeout(800)
    if pg.locator('.modal').count(): pg.locator('.modal .btn').first.click(); pg.wait_for_timeout(300)
    after = E(pg, "(()=>{const L=window.__ctpl.lib; return {n:L.patches.length, ad:L.patches.filter(p=>L.changeState(p)==='adopted').length, pats:(L.settings.patterns||[]).length, att:L.patches.filter(p=>p.meta.patternId).length}})()")
    ok('Restaurar la copia recupera patches, variantes aceptadas, patrones y adjuntos', after == before, f'{before} → {after}')
    # --- E · borrar, deshacer, packs, reglas, patrones ---
    E(pg, "(()=>{const L=window.__ctpl.lib,S=window.__ctpl.S; S.sel=L.patches.find(p=>p.kind!=='variant'&&L.changeState(p)==='original').id; window.__del=S.sel;})()"); view('library')
    pg.click('[data-act="deleteOne"]'); pg.wait_for_timeout(400)
    ok('Eliminar un patch (sin preguntar, a la papelera)', E(pg, "!window.__ctpl.lib.byId(window.__del) && window.__ctpl.lib.trashCount() >= 1"))
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(400)
    ok('Ctrl Z lo recupera', E(pg, "!!window.__ctpl.lib.byId(window.__del)"))
    pg.click('[data-act="deleteOne"]'); pg.wait_for_timeout(400)
    view('banks'); nb = E(pg, "window.__ctpl.lib.banks.length"); pg.click('[data-act="bankNew"]'); pg.wait_for_timeout(300)
    ok('Crear pack', E(pg, "window.__ctpl.lib.banks.length") == nb + 1)
    pg.click('[data-act="bankDel"]'); pg.locator('.modal .btn.danger').click(); pg.wait_for_timeout(300)
    ok('Eliminar pack', E(pg, "window.__ctpl.lib.banks.length") == nb)
    view('patterns'); pid = E(pg, "(window.__ctpl.lib.settings.patterns||[])[0]?.id")
    pg.locator(f'[data-act="patDel"][data-id="{pid}"]').click(); pg.click('.modal .btn.primary'); pg.wait_for_timeout(300)
    ok('Borrar patrón lo desadjunta de sus patches', E(pg, "!(window.__ctpl.lib.settings.patterns||[]).length && !window.__ctpl.lib.patches.some(p=>p.meta.patternId)"))
    # deshacer una edición de ficha desde el historial
    E(pg, "(async()=>{const L=window.__ctpl.lib; const p=L.patches[0]; window.__u=p.id; await L.updateMeta([p.id],{rating:5},'Valoración 5');})()"); pg.wait_for_timeout(200)
    hid = E(pg, "window.__ctpl.lib.history.filter(h=>h.undoable!==false).slice(-1)[0]?.id")
    if hid: E(pg, f"window.__ctpl.A.undo({{dataset:{{id:'{hid}'}}}})"); pg.wait_for_timeout(300)
    ok('Deshacer desde el historial', E(pg, "!window.__ctpl.lib.byId(window.__u).meta.rating"))
    ok('Sin errores de JavaScript en todos los flujos', not errors, '; '.join(errors[:3]))
    b.close()
print(f"\n{sum(1 for r in res if r[0])}/{len(res)} flujos correctos")
