# v3.5: seleccionar en el mapa (resaltar, zona arrastrando, más parecidos, ver en la biblioteca) y Ko-fi.
# Uso: python3 tests/mapsel_ui.py [Circuit_Tracks_Patch_Library_Editor.html]  (antes: node tests/make-fixtures.mjs)
import sys, os, re, threading, http.server, functools
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FAKE_MIDI = re.search(r'FAKE_MIDI = """(.*?)"""', open(os.path.join(ROOT, 'tests', 'browser_test.py')).read(), re.S).group(1)
FILE = sys.argv[1] if len(sys.argv) > 1 else 'Circuit_Tracks_Patch_Library_Editor.html'
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8776), functools.partial(Q, directory=os.path.join(ROOT, 'dist'))); threading.Thread(target=srv.serve_forever, daemon=True).start()
res = []; errors = []
def ok(name, cond, extra=''): res.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name + (' · ' + str(extra) if extra != '' else ''))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1500, 'height': 1000}); ctx.add_init_script(FAKE_MIDI)
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
    pg.goto('http://127.0.0.1:8776/' + FILE); pg.wait_for_selector('.top .brand')
    pg.set_input_files('#dirIn', os.path.join(ROOT, 'tests', 'out')); pg.wait_for_selector('.modal', timeout=60000); pg.click('.modal .btn'); pg.wait_for_timeout(300)
    J = lambda js: pg.evaluate(js)
    multi = lambda: J('[...window.__ctpl.S.multi]')
    total = J('window.__ctpl.lib.patches.length')
    pg.click('.tabs-main button[data-v="analyze"]'); pg.wait_for_selector('#mapCanvas'); pg.wait_for_timeout(300)
    ok('El mapa tiene el panel «Seleccionar»', pg.locator('.mapsel').count() == 1)
    opts = pg.locator('#mapHL option').evaluate_all('(o) => o.map((x) => x.value)')
    ok('Resaltar por carácter de los ajustes, categoría, valoración', any(v.startswith('char:') for v in opts) and any(v.startswith('cat:') for v in opts) and 'fav:1' in opts, len(opts))
    ch = next(v for v in opts if v.startswith('char:'))
    pg.select_option('#mapHL', ch); pg.wait_for_timeout(300)
    n = int(pg.locator('#mapHlAct .mono').inner_text().split()[0])
    pg.click('button[data-act="mapHlSet"]'); pg.wait_for_timeout(200)
    ok(f'«{ch[5:]}»: seleccionarlos', n >= 1 and len(multi()) == n, f'{n} → {len(multi())}')
    cat = next(v for v in opts if v.startswith('cat:'))
    pg.select_option('#mapHL', cat); pg.wait_for_timeout(300)
    nc = int(pg.locator('#mapHlAct .mono').inner_text().split()[0])
    pg.click('button[data-act="mapHlAdd"]'); pg.wait_for_timeout(200)
    ok('Añadir a la selección los de una categoría', max(n, nc) <= len(multi()) <= n + nc, f'{nc} → {len(multi())}')
    pg.select_option('#mapHL', ''); pg.wait_for_timeout(200)
    word = J("window.__ctpl.lib.patches[0].name.split(/\\s+/)[0].toLowerCase()")
    pg.fill('#mapWord', word); pg.wait_for_timeout(300)
    nw = int(pg.locator('#mapHlAct .mono').inner_text().split()[0])
    ok(f'Una palabra del nombre («{word}») resalta sin recargar', nw >= 1, nw)
    pg.fill('#mapWord', ''); pg.wait_for_timeout(200)

    # zona arrastrando
    pg.click('button[data-act="mapClear"]'); pg.wait_for_timeout(200)
    box = pg.locator('#mapCanvas').bounding_box()
    def drag(x0, y0, x1, y1, mod=None):
        if mod: pg.keyboard.down(mod)
        pg.mouse.move(box['x'] + x0 * box['width'], box['y'] + y0 * box['height']); pg.mouse.down()
        pg.mouse.move(box['x'] + (x0 + x1) / 2 * box['width'], box['y'] + (y0 + y1) / 2 * box['height'], steps=4)
        pg.mouse.move(box['x'] + x1 * box['width'], box['y'] + y1 * box['height'], steps=4); pg.mouse.up()
        if mod: pg.keyboard.up(mod)
        pg.wait_for_timeout(300)
    visible = J('window.__ctpl.S.mapPts.length')
    drag(0.005, 0.005, 0.995, 0.995)
    ok(f'Arrastrar sobre todo el mapa selecciona los {visible} puntos', len(multi()) == visible, len(multi()))
    drag(0.005, 0.005, 0.5, 0.995, 'Alt'); left = len(multi())
    ok('Alt quita una zona', 0 < left < visible, f'{left} de {visible}')
    drag(0.005, 0.005, 0.5, 0.995, 'Shift')
    ok('Mayús la vuelve a añadir', len(multi()) == visible)
    sel0 = J('window.__ctpl.S.sel')
    drag(0.5, 0.005, 0.995, 0.995)
    ok('Sin tecla sustituye la selección, y el arrastre no elige un punto', len(multi()) == left and J('window.__ctpl.S.sel') == sel0)

    # más parecidos
    pid = J('window.__ctpl.lib.patches[0].id')
    J(f"(() => {{ const c = window.__ctpl; c.S.sel = '{pid}'; c.S.multi.clear(); }})()")
    pg.click('.tabs-main button[data-v="library"]'); pg.click('.tabs-main button[data-v="analyze"]'); pg.wait_for_selector('#mapCanvas')
    pg.select_option('#mapN', '10'); pg.click('button[data-act="mapNearOne"]'); pg.wait_for_timeout(200)
    m = multi()
    ok('«a este patch»: él y sus 10 más parecidos', len(m) == min(11, total) and pid in m, len(m))
    pg.click('button[data-act="mapNearSel"]'); pg.wait_for_timeout(200)
    ok('«a la selección» añade más', len(multi()) > len(m) or len(m) == total, len(multi()))

    # ver en la biblioteca
    k = len(multi())
    pg.click('button[data-act="mapToLib"]'); pg.wait_for_timeout(300)
    shown = J('window.__ctpl.S.q.ids ? window.__ctpl.S.q.ids.length : -1')
    ok('La biblioteca muestra solo la selección, con sus acciones', J('window.__ctpl.S.view') == 'library' and shown == k and pg.locator('button[data-act="bulkTags"]').count() >= 1, f'{shown} de {k}')

    # Ko-fi
    ok('Enlace a Ko-fi en el pie', pg.locator('#foot a[href*="ko-fi.com/falsepositive"]').count() == 1)
    pg.click('#foot [data-act="about"]'); pg.wait_for_selector('.modal')
    ok('y en «Acerca de»', pg.locator('.modal a[href*="ko-fi.com/falsepositive"]').count() >= 1)
    ok('Sin errores de JavaScript', not errors, ' | '.join(errors[:3]))
    b.close()
print(f'{sum(res)}/{len(res)} comprobaciones superadas')
srv.shutdown()
sys.exit(0 if all(res) else 1)
