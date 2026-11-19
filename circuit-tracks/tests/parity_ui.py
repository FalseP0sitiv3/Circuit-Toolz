# v3.6: lo traído de la herramienta de la Rhythm (bienvenida, manifiesto completo) y el apoyo y el idioma visibles.
# Uso: python3 tests/parity_ui.py [Circuit_Tracks_Patch_Library_Editor.html]  (antes: node tests/make-fixtures.mjs)
import sys, os, re, csv, io, threading, http.server, functools
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FAKE_MIDI = re.search(r'FAKE_MIDI = """(.*?)"""', open(os.path.join(ROOT, 'tests', 'browser_test.py')).read(), re.S).group(1)
FILE = sys.argv[1] if len(sys.argv) > 1 else 'Circuit_Tracks_Patch_Library_Editor.html'
EN = '_EN' in FILE
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8777), functools.partial(Q, directory=os.path.join(ROOT, 'dist'))); threading.Thread(target=srv.serve_forever, daemon=True).start()
res = []; errors = []
def ok(name, cond, extra=''): res.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name + (' · ' + str(extra) if extra != '' else ''))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1500, 'height': 1000}, accept_downloads=True); ctx.add_init_script(FAKE_MIDI)
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
    pg.goto('http://127.0.0.1:8777/' + FILE); pg.wait_for_selector('.top .brand')
    # bienvenida con la biblioteca vacía
    w = pg.locator('.empty.welcome')
    ok('Bienvenida con los tres pasos y la nota de privacidad', w.count() == 1 and w.locator('.steps li').count() == 3 and w.locator('[data-act="import"]').count() == 1)
    # idioma y apoyo, visibles
    cur, other = ('EN', 'ES') if EN else ('ES', 'EN')
    sw = pg.locator('header.top .langsw.hdr')
    ok('Selector de idioma en la cabecera', sw.count() == 1 and sw.locator('.on').inner_text() == cur and sw.locator('a').inner_text() == other, f'{cur} marcado')
    ok('El enlace lleva al otro archivo', sw.locator('a').get_attribute('href').endswith('_EN.html') != EN, sw.locator('a').get_attribute('href'))
    sup = pg.locator('#foot a.support')
    fs = sup.evaluate('(e) => parseFloat(getComputedStyle(e).fontSize)') if sup.count() else 0
    ok('«Apoyar el proyecto» como botón grande', sup.count() == 1 and fs >= 15 and 'ko-fi.com/falsepositive' in sup.get_attribute('href'), f'{fs:.0f} px')
    ok('Selector de idioma también en el pie', pg.locator('#foot .langsw').count() == 1)
    # autoría: © en el pie, huella en Acerca de, cabecera y marca invisible coherentes
    org = pg.evaluate('() => window.__ctpl.origin')
    head = pg.evaluate('() => ([...document.childNodes].find((n) => n.nodeType === 8) || {}).data || ""')
    ok('© FalsePositive en el pie', '© 2026 FalsePositive' in pg.locator('#foot').inner_text() and org['author'] == 'FalsePositive')
    ok('Comentario de cabecera con la huella', ('fingerprint ' + org['fp']) in head and 'GPL-3.0' in head, org['fp'])
    ok('Marca invisible en el texto de la página', pg.evaluate('() => /\u2060[\u200b\u200c]{64,}\u2060/.test(document.body.textContent)'))
    pg.click('#foot [data-act="about"]'); pg.wait_for_selector('#fp')
    ok('Acerca de muestra la misma huella', pg.locator('#fp').inner_text() == org['fp'])
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    if pg.locator('#fp').count(): pg.evaluate('() => document.querySelector("#fp").closest(".modal, .ov, dialog, .overlay, .mback")?.remove()')
    # manifiesto de Ordenar en disco con subcarpeta, etiquetas, valoración y favorito
    pg.set_input_files('#dirIn', os.path.join(ROOT, 'tests', 'out')); pg.wait_for_selector('.modal', timeout=60000); pg.click('.modal .btn'); pg.wait_for_timeout(300)
    pid = pg.evaluate("window.__ctpl.lib.patches[0].id")
    pg.evaluate(f"(async () => {{ const L = window.__ctpl.lib; await L.updateMeta(['{pid}'], {{ tags: ['Dark', 'Techno'], rating: 5, fav: true }}); }})()"); pg.wait_for_timeout(200)
    pg.evaluate("(() => { const c = window.__ctpl; c.S.view = 'organize'; c.S.orgTab = 'disk'; })()")
    pg.click('.tabs-main button[data-v="library"]'); pg.click('.tabs-main button[data-v="organize"]'); pg.wait_for_timeout(300)
    if pg.locator('[data-act="planCsv"]').count() == 0: pg.evaluate("(() => { window.__ctpl.S.orgTab = 'disk'; })()"); pg.click('.tabs-main button[data-v="library"]'); pg.click('.tabs-main button[data-v="organize"]'); pg.wait_for_timeout(300)
    with pg.expect_download() as d: pg.click('[data-act="planCsv"]')
    rows = list(csv.reader(io.StringIO(open(d.value.path(), encoding='utf-8-sig').read()), delimiter=';'))
    ok('Manifiesto con subcarpeta, etiquetas, valoración y favorito', rows[0] == (['action', 'source', 'destination', 'category', 'subfolder', 'name', 'tags', 'rating', 'favourite', 'reason'] if EN else ['accion', 'origen', 'destino', 'categoria', 'subcarpeta', 'nombre', 'etiquetas', 'valoracion', 'favorito', 'motivo']), rows[0])
    name = pg.evaluate(f"window.__ctpl.lib.byId('{pid}').name")
    row = next((r for r in rows[1:] if r[5] == name), None)
    ok('Y la fila del patch lleva lo que marcaste', row is not None and row[6] == 'Dark, Techno' and row[7] == '5' and row[8] in ('sí', 'yes'), row)
    ok('Sin errores de JavaScript', not errors, ' | '.join(errors[:3]))
    b.close()
print(f'{sum(res)}/{len(res)} comprobaciones superadas')
srv.shutdown()
sys.exit(0 if all(res) else 1)
