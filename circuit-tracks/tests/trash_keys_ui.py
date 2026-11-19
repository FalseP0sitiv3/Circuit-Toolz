# v3.3: eliminar con Supr (a la papelera) y deshacer, papelera, atajos (?), etiquetas rápidas Alt+1–9 y migas en Octava.
import sys, os, re, threading, http.server, functools
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FAKE_MIDI = re.search(r'FAKE_MIDI = """(.*?)"""', open(os.path.join(ROOT, 'tests', 'browser_test.py')).read(), re.S).group(1)
FILE = sys.argv[1] if len(sys.argv) > 1 else 'Circuit_Tracks_Patch_Library_Editor.html'
EN = '_EN' in FILE
SHOTS = os.path.join(ROOT, 'tests', 'shots')
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8776), functools.partial(Q, directory=os.path.join(ROOT, 'dist'))); threading.Thread(target=srv.serve_forever, daemon=True).start()
res = []; errors = []
def ok(name, cond, extra=''): res.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name + (' · ' + str(extra) if extra != '' else ''))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1500, 'height': 1000}); ctx.add_init_script(FAKE_MIDI)
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
    E = pg.evaluate
    pg.goto('http://127.0.0.1:8776/' + FILE); pg.wait_for_selector('.top .brand')
    pg.set_input_files('#dirIn', os.path.join(ROOT, 'tests', 'out')); pg.wait_for_selector('.modal', timeout=60000); pg.click('.modal .btn'); pg.wait_for_timeout(300)
    n0 = E("window.__ctpl.lib.patches.length")
    # Escucha: Supr elimina y pasa al siguiente
    pg.click('.tabs-main button[data-v="audition"]'); pg.wait_for_timeout(300)
    E("(() => { const S = window.__ctpl.S; S.qsrc = 'all'; })()"); pg.select_option('select[data-act="qsrc"]', 'all'); pg.wait_for_timeout(300)
    first = E("window.__ctpl.S.queue[window.__ctpl.S.qi]"); second = E("window.__ctpl.S.queue[window.__ctpl.S.qi + 1]")
    pg.keyboard.press('Delete'); pg.wait_for_timeout(300)
    ok('Supr en Escucha elimina sin preguntar', E("window.__ctpl.lib.patches.length") == n0 - 1 and pg.locator('.modal').count() == 0)
    ok('…y pasa al siguiente', E("window.__ctpl.S.queue[window.__ctpl.S.qi]") == second)
    ok('Aviso con «Deshacer»', pg.locator('.toast.act button').count() == 1)
    pg.screenshot(path=SHOTS + '/30_eliminar_deshacer.png')
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(300)
    ok('Ctrl Z lo recupera y vuelve a la cola en su sitio', E("window.__ctpl.lib.patches.length") == n0 and E("window.__ctpl.S.queue[window.__ctpl.S.qi]") == first)
    pg.keyboard.press('Shift+Delete'); pg.wait_for_timeout(300)
    ok('Mayús Supr solo marca «Descartar»', E("window.__ctpl.lib.patches.length") == n0 and E(f"window.__ctpl.lib.byId('{first}').meta.review") == 'discard')
    # etiquetas rápidas
    pg.keyboard.press('ArrowLeft'); pg.wait_for_timeout(200)
    cur = E("window.__ctpl.S.queue[window.__ctpl.S.qi]"); qt = E("window.__ctpl.lib.tagPalette.flatMap(g => g.tags)[0]")
    pg.keyboard.press('Alt+1'); pg.wait_for_timeout(300)
    ok('Alt+1 pone la primera etiqueta rápida', qt in (E(f"window.__ctpl.lib.byId('{cur}').meta.tags") or []), qt)
    ok('Las etiquetas rápidas se ven en Escucha', pg.locator('.qtags .tq').count() == 9)
    pg.keyboard.press('Delete'); pg.wait_for_timeout(200); pg.keyboard.press('Delete'); pg.wait_for_timeout(300)
    # biblioteca: Supr sobre la selección
    pg.click('.tabs-main button[data-v="library"]'); pg.wait_for_timeout(300)
    E("(() => { const S = window.__ctpl.S, L = window.__ctpl.lib; S.multi = new Set(L.patches.slice(0, 3).map(p => p.id)); })()")
    pg.keyboard.press('Delete'); pg.wait_for_timeout(300)
    ok('Supr en la biblioteca elimina la selección', E("window.__ctpl.lib.patches.length") == n0 - 5 and E("window.__ctpl.lib.trashCount()") == 5)
    # papelera
    pg.click('.tabs-main button[data-v="organize"]'); pg.click('button[data-act="orgTab"][data-t="trash"]'); pg.wait_for_timeout(200)
    ok('Organizar → Papelera con cada eliminación', pg.locator('button[data-act="trashRestore"]').count() == 3)
    pg.screenshot(path=SHOTS + '/31_papelera.png')
    pg.click('button[data-act="trashRestore"] >> nth=0'); pg.wait_for_timeout(300)
    ok('Recuperar desde la papelera', E("window.__ctpl.lib.trashCount()") == 2)
    pg.click('button[data-act="trashEmpty"]'); pg.wait_for_selector('.modal'); pg.click('.modal .btn.danger'); pg.wait_for_timeout(300)
    ok('Vaciar la papelera', E("window.__ctpl.lib.trashCount()") == 0 and E("window.__ctpl.lib.patches.length") == n0 - 2)
    # atajos
    pg.keyboard.press('?'); pg.wait_for_selector('.modal .keyshelp')
    ok('? muestra los atajos', pg.locator('.keyshelp h4').count() == 4)
    pg.screenshot(path=SHOTS + '/32_atajos.png'); pg.keyboard.press('Escape'); pg.click('.modal .btn') if pg.locator('.modal').count() else None
    # octava: migas y Esc
    pg.click('button[data-act="orgTab"][data-t="register"]'); pg.wait_for_timeout(300)
    pg.click('.regrow:not(.hd) a[data-act="regOpen"] >> nth=0'); pg.wait_for_timeout(300)
    ok('Detalle de octava con «Volver al plan» arriba', pg.locator('.crumbs .btn.back').count() == 1)
    pg.mouse.wheel(0, 2500); pg.wait_for_timeout(300)
    bb = pg.locator('.crumbs').bounding_box()
    ok('…que sigue a la vista al bajar', bb and 0 <= bb['y'] < 200, bb)
    pg.screenshot(path=SHOTS + '/33_octava_migas.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    ok('Esc vuelve al plan', E("window.__ctpl.S.regView") == 'plan' and pg.locator('.regplan').count() == 1)
    ok('Sin errores', not errors, errors[:2])
    b.close()
srv.shutdown()
print(f'{sum(res)}/{len(res)}'); sys.exit(0 if all(res) else 1)
