# v3.2: patch actual desde cualquier sección (barra superior, tecla «.», ficha acoplada) y paleta de acciones (Ctrl K).
import sys, os, re, threading, http.server, functools
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FAKE_MIDI = re.search(r'FAKE_MIDI = """(.*?)"""', open(os.path.join(ROOT, 'tests', 'browser_test.py')).read(), re.S).group(1)
FILE = sys.argv[1] if len(sys.argv) > 1 else 'Circuit_Tracks_Patch_Library_Editor.html'
EN = '_EN' in FILE
SHOTS = os.path.join(ROOT, 'tests', 'shots')
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8775), functools.partial(Q, directory=os.path.join(ROOT, 'dist'))); threading.Thread(target=srv.serve_forever, daemon=True).start()
res = []; errors = []
def ok(name, cond, extra=''): res.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name + (' · ' + str(extra) if extra != '' else ''))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1500, 'height': 1000}); ctx.add_init_script(FAKE_MIDI)
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
    E = pg.evaluate
    pg.goto('http://127.0.0.1:8775/' + FILE); pg.wait_for_selector('.top .brand')
    pg.set_input_files('#dirIn', os.path.join(ROOT, 'tests', 'out')); pg.wait_for_selector('.modal', timeout=60000); pg.click('.modal .btn'); pg.wait_for_timeout(300)
    pg.click('.tabs-main button[data-v="device"]'); pg.click('button[data-act="midiConnect"]'); pg.wait_for_timeout(300)
    pid = E("window.__ctpl.lib.patches.find(p => p.name === 'Old Reese').id")
    E(f"window.__ctpl.S.sel = '{pid}'"); pg.click('.tabs-main button[data-v="songs"]'); pg.wait_for_timeout(200)
    ok('El patch actual se ve arriba en cualquier sección', 'reese' in pg.inner_text('.curpill').lower())
    pg.keyboard.press('.'); pg.wait_for_selector('.dock .insp')
    ok('Tecla «.» abre la ficha acoplada sin salir de Canciones', E("window.__ctpl.S.view") == 'songs' and pg.locator('.dock .tagpal').count() == 1)
    pg.click('.dock .tq[data-t="Delay"]'); pg.wait_for_timeout(200)
    ok('Se etiqueta desde la ficha acoplada', 'Delay' in E(f"window.__ctpl.lib.byId('{pid}').meta.tags"))
    pg.screenshot(path=SHOTS + '/27_ficha_acoplada.png')
    pg.click('.dock button[data-act="goEdit"][data-t="macros"]'); pg.wait_for_timeout(200)
    ok('Ir a Macros del patch desde la ficha', E("window.__ctpl.S.view") == 'library' and E("window.__ctpl.S.ctab") == 'macros')
    # paleta
    pg.click('.tabs-main button[data-v="organize"]'); pg.wait_for_timeout(200)
    pg.keyboard.press('Control+k'); pg.wait_for_selector('#pal input')
    ok('Ctrl K abre la paleta con acciones del patch', pg.locator('.pal-i').count() >= 8)
    pg.keyboard.type('up one oct' if EN else 'subir una oct'); pg.wait_for_timeout(100); pg.screenshot(path=SHOTS + '/28_paleta.png')
    pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
    ok('Paleta: subir una octava crea la variante aceptada', E(f"(() => {{ const L = window.__ctpl.lib, v = L.currentVersion(L.byId('{pid}')); return v.id !== '{pid}' && v.payload[42] === L.byId('{pid}').payload[42] + 12 }})()"))
    ok('…sin salir de la sección', E("window.__ctpl.S.view") == 'organize')
    pg.keyboard.press('Control+k'); pg.keyboard.type('reverb'); pg.wait_for_timeout(100); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    cv = E(f"window.__ctpl.lib.currentVersion(window.__ctpl.lib.byId('{pid}')).id")
    ok('Paleta: etiqueta Reverb', 'Reverb' in E(f"(window.__ctpl.lib.byId(window.__ctpl.S.sel).meta.tags || [])"), E("window.__ctpl.S.sel"))
    pg.keyboard.press('Control+k'); pg.keyboard.type('bass subs'); pg.wait_for_timeout(100); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    ok('Paleta: carpeta Bass / Subs', E("(() => { const p = window.__ctpl.lib.byId(window.__ctpl.S.sel); return p.meta.category === 'bass' && p.meta.subtype === 'sub' })()"))
    pg.keyboard.press('Control+k'); pg.keyboard.type('dark pad'); pg.wait_for_timeout(100)
    ok('Paleta: buscar un patch por nombre', pg.locator('.pal-i', has_text='Dark Pad').count() >= 1)
    pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    ok('…lo abre como patch actual, acoplado, sin salir', E("window.__ctpl.lib.byId(window.__ctpl.S.sel).name") == 'Dark Pad' and E("window.__ctpl.S.view") == 'organize' and pg.locator('.dock .insp').count() == 1)
    pg.keyboard.press('Control+k'); pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
    ok('Escape cierra la paleta', pg.locator('#pal').count() == 0)
    # pick en otras secciones: abre acoplado
    E("window.__ctpl.S.orgTab='register'; window.__ctpl.S.regView='detail'; window.__ctpl.S.regCat='bass'; window.__ctpl.A.view({dataset:{v:'organize'}})"); pg.wait_for_timeout(300)
    lk = pg.locator('#full a[data-act="pick"]').first; nm = lk.inner_text(); lk.click(); pg.wait_for_timeout(200)
    ok('Pulsar un patch en Organizar lo abre acoplado sin cambiar de sección', E("window.__ctpl.S.view") == 'organize' and pg.locator('.dock').count() == 1 and nm.strip()[:8].lower() in pg.inner_text('.curpill').lower(), nm)
    # Escucha: el patch actual es el de la cola
    E("window.__ctpl.A.view({dataset:{v:'audition'}})"); pg.wait_for_timeout(300)
    qn = E("window.__ctpl.lib.byId(window.__ctpl.S.queue[window.__ctpl.S.qi])?.name")
    ok('En Escucha, el patch actual es el que suena', qn and qn[:8].lower() in pg.inner_text('.curpill').lower(), qn)
    ok('Sin errores JavaScript', not errors, errors[:3])
    b.close()
print(f'{sum(res)}/{len(res)} comprobaciones superadas'); srv.shutdown(); sys.exit(0 if all(res) else 1)
