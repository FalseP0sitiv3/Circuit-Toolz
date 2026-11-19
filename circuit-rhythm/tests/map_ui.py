"""v2.0: seleccionar en el mapa (resaltar por carácter, zona arrastrando, más parecidos, ver en la biblioteca) y Ko-fi.
Uso: python3 tests/map_ui.py dist/Circuit_Rhythm_Sample_Library.html /tmp/crsl_fixture"""
import base64, os, sys, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from browser_test import MOCK, wait_idle

HTML = os.path.abspath(sys.argv[1]); FIX = sys.argv[2]
EN = '_EN' in HTML
checks = []
def ok(c, m): checks.append((bool(c), m)); print(('  ✓ ' if c else '  ✗ ') + m)
files = {}
root = os.path.join(FIX, 'Samples')
for d, _, fs in os.walk(root):
    for f in fs:
        p = os.path.join(d, f); files[os.path.relpath(p, root)] = base64.b64encode(open(p, 'rb').read()).decode()
errors = []
with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required'])
    ctx = br.new_context(viewport={'width': 1440, 'height': 1000}); ctx.add_init_script(MOCK)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    page.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
    page.goto('file://' + HTML); page.wait_for_selector('.tab')
    page.evaluate('([f]) => window.__pickQueue.push(window.__mkFS("Samples", f))', [files])
    page.click('[data-act="link"] >> nth=0'); time.sleep(0.5); wait_idle(page, 120)
    J = lambda js, *a: page.evaluate(js, *a)
    multi = lambda: J('() => [...window.__crsl.S.multi]')
    page.click('.tab[data-view="map"]'); time.sleep(0.4)
    npts = J('() => document.querySelectorAll("#mapcv").length')
    ok(npts == 1 and page.locator('.mapsel').count() == 1, 'el mapa tiene el panel «Seleccionar»')
    total = J('() => window.__crsl.S.samples.filter((s) => s.analysis && s.analysis.bands && !s.user.discard).length')

    # 1. resaltar por carácter medido y seleccionarlos
    opts = page.locator('#maphl option').evaluate_all('(o) => o.map((x) => x.value)')
    ok(any(v.startswith('ch:') for v in opts) and any(v.startswith('cat:') for v in opts) and 'kind:loop' in opts, f'resaltar por carácter, categoría y tipo ({len(opts)} opciones)')
    page.select_option('#maphl', 'ch:Corto'); time.sleep(0.3)
    n = int(page.locator('#maphlact .mono').inner_text().split()[0])
    ok(n >= 1, f'«Corto» resalta {n} samples')
    page.click('[data-act="map-hl-set"]'); time.sleep(0.3)
    ok(len(multi()) == n, f'«Seleccionarlos» los selecciona ({len(multi())})')
    page.select_option('#maphl', 'kind:loop'); time.sleep(0.3)
    nl = int(page.locator('#maphlact .mono').inner_text().split()[0])
    page.click('[data-act="map-hl-add"]'); time.sleep(0.3)
    ok(len(multi()) >= max(n, nl) and len(multi()) <= n + nl, f'«Añadir a la selección» suma los loops ({nl}) → {len(multi())}')
    page.select_option('#maphl', ''); time.sleep(0.2)
    page.fill('#mapword', 'loop'); time.sleep(0.3)
    nw = int(page.locator('#maphlact .mono').inner_text().split()[0])
    ok(nw >= 2, f'una palabra del nombre resalta sin recargar ({nw})')
    page.fill('#mapword', ''); time.sleep(0.2)

    # 2. zona arrastrando: todo, Mayús añade, Alt quita
    page.click('[data-act="map-clear"]'); time.sleep(0.2)
    box = page.locator('#mapcv').bounding_box()
    def drag(x0, y0, x1, y1, mod=None):
        if mod: page.keyboard.down(mod)
        page.mouse.move(box['x'] + x0 * box['width'], box['y'] + y0 * box['height']); page.mouse.down()
        page.mouse.move(box['x'] + (x0 + x1) / 2 * box['width'], box['y'] + (y0 + y1) / 2 * box['height'], steps=4)
        page.mouse.move(box['x'] + x1 * box['width'], box['y'] + y1 * box['height'], steps=4); page.mouse.up()
        if mod: page.keyboard.up(mod)
        time.sleep(0.4)
    drag(0.01, 0.01, 0.99, 0.99)
    ok(len(multi()) == total, f'arrastrar sobre todo el mapa selecciona los {total}')
    ok(J('() => window.__crsl.S.view') == 'map' and not J('() => window.__crsl.S._mdragDone'), 'el arrastre no cuenta como clic')
    drag(0.01, 0.01, 0.5, 0.99, 'Alt')
    left = len(multi())
    ok(0 < left < total, f'Alt quita una mitad ({left} de {total})')
    drag(0.01, 0.01, 0.5, 0.99, 'Shift')
    ok(len(multi()) == total, 'Mayús la vuelve a añadir')
    drag(0.5, 0.01, 0.99, 0.99)
    ok(len(multi()) == left, 'sin tecla, sustituye la selección')

    # 3. los más parecidos a un sample
    J('() => { const c = window.__crsl; c.S.sel = c.S.samples.find((s) => /BD Dark 01/.test(s.name)).id; c.S.multi.clear(); c.renderAll(); }'); time.sleep(0.3)
    page.select_option('#mapn', '10'); page.click('[data-act="map-near-one"]'); time.sleep(0.3)
    m = multi(); sel = J('() => window.__crsl.S.sel')
    ok(len(m) == min(11, total) and sel in m, f'«a BD Dark 01»: él y sus 10 más parecidos ({len(m)})')
    names = J('() => [...window.__crsl.S.multi].map((id) => window.__crsl.S.byId[id].name)')
    ok(any(x.startswith('BD') or 'Kick' in x for x in names if 'BD Dark 01' not in x), 'entre ellos, otro bombo: ' + ', '.join(names[:5]))
    page.click('[data-act="map-near-sel"]'); time.sleep(0.3)
    ok(len(multi()) > len(m) or len(m) == total, f'«a la selección» añade más ({len(multi())})')

    # 4. ver en la biblioteca: solo la selección, con las acciones de siempre
    k = len(multi())
    page.click('[data-act="map-to-lib"]'); time.sleep(0.4)
    rows = page.locator('.li').count()
    ok(J('() => window.__crsl.S.view') == 'library' and rows == k, f'la biblioteca muestra solo los {k} seleccionados ({rows})')
    ok(page.locator('[data-act="multi-pack"]').count() + page.locator('[data-act="multi-org"]').count() >= 1, 'con las acciones de la selección')

    # 5. Ko-fi
    foot = page.locator('#foot a[href*="ko-fi.com/falsepositive"]')
    ok(foot.count() == 1, 'enlace a Ko-fi en el pie: ' + (foot.first.inner_text() if foot.count() else '—'))
    page.click('#foot [data-act="about"]'); page.wait_for_selector('#bugrep')
    ok(page.locator('#modal a[href*="ko-fi.com/falsepositive"]').count() >= 1, 'y en «Acerca de»')

    bad = [e for e in errors if 'favicon' not in e]
    ok(not bad, 'sin errores en la consola' + (': ' + ' | '.join(bad[:3]) if bad else ''))
    br.close()
n = sum(1 for c, _ in checks if c)
print(f'\n{n} de {len(checks)} comprobaciones')
sys.exit(0 if n == len(checks) else 1)
