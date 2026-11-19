# v3.0: plan de octava por grupos, corregir todo, revisión rápida, «está bien», transponer en bloque,
# etiquetas rápidas (efectos), etiquetar efectos detectados y filtro por palabras del nombre. Equipo SIMULADO.
import sys, os, re, threading, http.server, functools
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FAKE_MIDI = re.search(r'FAKE_MIDI = """(.*?)"""', open(os.path.join(ROOT, 'tests', 'browser_test.py')).read(), re.S).group(1)
FILE = sys.argv[1] if len(sys.argv) > 1 else 'Circuit_Tracks_Patch_Library_Editor.html'
SHOTS = os.path.join(ROOT, 'tests', 'shots')
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8774), functools.partial(Q, directory=os.path.join(ROOT, 'dist'))); threading.Thread(target=srv.serve_forever, daemon=True).start()
res = []; errors = []
def ok(name, cond, extra=''): res.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name + (' · ' + str(extra) if extra != '' else ''))
E = lambda js: pg.evaluate(js)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1500, 'height': 1000}); ctx.add_init_script(FAKE_MIDI)
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto('http://127.0.0.1:8774/' + FILE); pg.wait_for_selector('.top .brand')
    pg.set_input_files('#dirIn', os.path.join(ROOT, 'tests', 'out')); pg.wait_for_selector('.modal', timeout=60000); pg.click('.modal .btn'); pg.wait_for_timeout(300)
    pg.click('.tabs-main button[data-v="device"]'); pg.click('button[data-act="midiConnect"]'); pg.wait_for_timeout(300)
    # ---- plan de octava ----
    E("window.__ctpl.S.orgTab='register'"); pg.click('.tabs-main button[data-v="organize"]'); pg.wait_for_selector('.regrows')
    ok('Plan: una fila por categoría con objetivo y modo', pg.locator('.regrow:not(.hd)').count() >= 4 and pg.locator('select[data-f="target"]').count() >= 4)
    pg.click('button[data-act="regBySub"][data-v="1"]'); pg.wait_for_timeout(200)
    ok('Plan por categoría / subcarpeta', pg.locator('.regrow:not(.hd) b', has_text='/').count() >= 1)
    pg.click('button[data-act="regBySub"][data-v="0"]'); pg.wait_for_timeout(200)
    pg.select_option('select[data-g="pad"][data-f="target"]', 'skip'); pg.wait_for_timeout(200)
    ok('«No corregir este grupo» se guarda', E("window.__ctpl.lib.settings.regPlan.pad.target") == 'skip' and pg.locator('.regrow.skip').count() == 1)
    pg.select_option('select[data-k="regAdopt"]', 'none'); pg.wait_for_timeout(200)
    pg.click('button[data-act="regFixPlan"]'); pg.wait_for_selector('.modal'); pg.click('.modal .btn.primary'); pg.wait_for_function("window.__ctpl.lib.patches.some(p => p.origin === 'register')", timeout=20000); pg.wait_for_selector('.modal')
    made = E("window.__ctpl.lib.patches.filter(p => p.kind === 'variant' && p.origin === 'register').length")
    ok('Corregir todo crea las variantes de todos los grupos (salvo los excluidos)', made > 0 and E("window.__ctpl.lib.patches.filter(p => p.origin === 'register').every(v => window.__ctpl.lib.byId(v.parentId).meta.category !== 'pad' && window.__ctpl.lib.info(window.__ctpl.lib.byId(v.parentId)).cls.category !== 'pad')"), made)
    drafts = E("window.__ctpl.lib.patches.filter(p => p.origin === 'register' && window.__ctpl.lib.changeState(p) === 'draft').length")
    if pg.locator('.modal .btn:has-text("Revisión rápida"), .modal .btn:has-text("Quick review")').count(): pg.locator('.modal .btn:has-text("Revisión rápida"), .modal .btn:has-text("Quick review")').first.click()
    else: pg.click('.modal .btn >> nth=-1'); E("window.__ctpl.A.regView({dataset:{v:'review'}})")
    pg.wait_for_timeout(300)
    if drafts:
        ok('Revisión rápida abierta con las dudosas', pg.locator('.regrev').count() == 1, drafts)
        E('window.__midiSent.length = 0'); pg.keyboard.press('1'); pg.wait_for_timeout(300)
        ok('Tecla 1 toca el original en el equipo', any((a[0] & 0xF0) == 0x90 for a in E('window.__midiSent')))
        pg.screenshot(path=SHOTS + '/23_revision_rapida.png')
        pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
        ok('Intro acepta y pasa a la siguiente', E("window.__ctpl.lib.patches.filter(p => p.origin === 'register' && window.__ctpl.lib.changeState(p) === 'draft').length") == drafts - 1)
        if drafts > 1:
            pid = E("(() => { const L = window.__ctpl.lib; const q = L.patches.filter(p => p.origin === 'register' && L.changeState(p) === 'draft'); return q[0].parentId })()")
            pg.keyboard.press('k'); pg.wait_for_timeout(300)
            ok('K: «estaba bien» descarta la corrección y no vuelve a proponerlo', E(f"window.__ctpl.lib.byId('{pid}').meta.regKeep") == True)
    else:
        ok('Sin dudosas: todas aceptadas', True)
    # ---- transponer en bloque ----
    ids = E("window.__ctpl.lib.patches.filter(p => /^Arp B/.test(p.name)).slice(0, 3).map(p => p.id)")
    E(f"window.__ctpl.S.multi = new Set({ids}); window.__ctpl.A.view({{dataset:{{v:'library'}}}})"); pg.wait_for_timeout(200)
    pg.select_option('select[data-act="bulkOct"]', '-12'); pg.wait_for_timeout(500)
    ok('Octava −1 en bloque: variantes aceptadas', E(f"{ids}.every(id => {{ const L = window.__ctpl.lib, v = L.currentVersion(L.byId(id)); return v.id !== id && v.payload[35] === L.byId(id).payload[35] && (v.payload[42] === L.byId(id).payload[42] - 12) }})"))
    E("window.__ctpl.S.multi = new Set()")
    # ---- etiquetas rápidas ----
    pid = E("window.__ctpl.lib.patches.find(p => p.name === 'Dark Pad').id")
    E(f"window.__ctpl.S.sel = '{pid}'; window.__ctpl.A.view({{dataset:{{v:'library'}}}})"); pg.wait_for_selector('.tagpal')
    pg.click('.tq[data-t="Reverb"]'); pg.wait_for_timeout(200)
    ok('Etiqueta rápida Reverb con un clic', 'Reverb' in E(f"window.__ctpl.lib.byId('{pid}').meta.tags"))
    pg.click('.tq[data-t="Reverb"]'); pg.wait_for_timeout(200)
    ok('Otro clic la quita', 'Reverb' not in E(f"window.__ctpl.lib.byId('{pid}').meta.tags"))
    pg.locator('.insp').screenshot(path=SHOTS + '/24_etiquetas_rapidas.png')
    # efecto en el nombre
    fx = E("(() => { const L = window.__ctpl.lib; return L.patches.map(p => L.fxOf(p).map(x => x.t)).flat() })()")
    E("window.__ctpl.S.orgTab='folders'"); pg.click('.tabs-main button[data-v="organize"]'); pg.wait_for_selector('.palrows')
    pg.fill('input[data-act="palTags"][data-i="0"]', 'Delay, Reverb, Chorus, Phaser, Distortion, EQ, Sidechain'); pg.press('input[data-act="palTags"][data-i="0"]', 'Tab'); pg.wait_for_timeout(200)
    ok('Editar la paleta: añadir «Sidechain» a Efectos', 'Sidechain' in E("window.__ctpl.lib.tagPalette[0].tags"))
    if fx:
        pg.click('button[data-act="fxAutoTag"]'); pg.wait_for_selector('.modal'); pg.click('.modal .btn.primary'); pg.wait_for_timeout(500)
        ok('Etiquetar efectos detectados', E("window.__ctpl.lib.patches.some(p => (p.meta.tags || []).some(t => ['Chorus','Phaser','Distortion','EQ','Delay','Reverb'].includes(t)))"), sorted(set(fx)))
    # ---- palabras del nombre ----
    E("window.__ctpl.A.view({dataset:{v:'library'}})"); pg.click('button[data-act="toggleWords"]'); pg.wait_for_selector('.wordsbar')
    ok('Palabras del nombre como filtros', pg.locator('.wq[data-w="acid"]').count() == 1 or pg.locator('.wq').count() > 3)
    w = 'bass' if pg.locator('.wq[data-w="bass"]').count() else E("document.querySelector('.wq').dataset.w")
    pg.click(f'.wq[data-w="{w}"]'); pg.wait_for_timeout(200)
    n = E("window.__ctpl.S.rowsAll.length")
    ok(f'Filtrar por «{w}»', n >= 2 and E(f"window.__ctpl.S.rowsAll.every(p => window.__ctpl.lib.wordsOf(p).includes('{w}'))"), n)
    pg.screenshot(path=SHOTS + '/25_palabras.png')
    pg.click('button[data-act="wordToTag"]'); pg.wait_for_selector('.modal'); pg.click('.modal .btn.primary'); pg.wait_for_timeout(400)
    W = w[0].upper() + w[1:]
    ok('Etiquetar por palabra', E(f"window.__ctpl.S.rowsAll.every(p => (p.meta.tags || []).includes('{W}'))"))
    pg.click(f'.wq.tg[data-t="{W}"]'); pg.wait_for_timeout(200)
    ok('Filtrar por etiqueta', E("window.__ctpl.S.q.tags.length") == 1)
    # ---- v3.1: reanalizar ----
    ok('Sin código de barras decorativo', pg.locator('.barcode').count() == 0 and E("getComputedStyle(document.querySelector('.label') || document.body, '::after').content") in ('none', 'normal', '""', None))
    E("(async () => { const L = window.__ctpl.lib; const b = L.patches.filter(p => /^Bass B/.test(p.name)).slice(0, 6), q = L.patches.filter(p => /^Pad B/.test(p.name)).slice(0, 6); await L.setCategory(b.map(p => p.id), 'bass', 'rolling'); await L.setCategory(q.map(p => p.id), 'pad', 'warm'); })()"); pg.wait_for_timeout(300)
    E("window.__ctpl.S.orgTab='rean'"); pg.click('.tabs-main button[data-v="organize"]'); pg.wait_for_selector('button[data-act="reanRun"]')
    pg.click('button[data-act="reanRun"]'); pg.wait_for_selector('.reanopts', timeout=20000)
    r = E("({ cat: window.__ctpl.S.rean.cat.length, nn: window.__ctpl.S.rean.nn.length, sub: window.__ctpl.S.rean.sub.length, none: window.__ctpl.S.rean.none.length + window.__ctpl.S.rean.weak.length })")
    ok('Reanalizar: propuestas por nombre, por parecido y subcarpetas', r['cat'] + r['nn'] > 0 and r['sub'] >= 0, r)
    pg.click('button[data-act="reanTab"][data-t="nn"]'); pg.wait_for_timeout(200); pg.screenshot(path=SHOTS + '/26_reanalizar.png', full_page=True)
    before = E("window.__ctpl.lib.patches.filter(p => p.meta.category).length")
    pg.click('button[data-act="reanApply"]'); pg.wait_for_selector('.modal'); pg.click('.modal .btn.primary'); pg.wait_for_timeout(800)
    ok('Aplicar el reanálisis guarda categorías', E("window.__ctpl.lib.patches.filter(p => p.meta.category).length") > before)
    unk = E("(() => { const L = window.__ctpl.lib; const p = L.patches.find(p => !p.meta.category && L.neighbourGuess(p)?.share >= .5); return p ? p.id : null })()")
    if unk:
        E(f"window.__ctpl.S.sel = '{unk}'; window.__ctpl.A.view({{dataset:{{v:'library'}}}})"); pg.wait_for_selector('.nnhint')
        pg.click('.nnhint button[data-act="nnUse"]'); pg.wait_for_timeout(200)
        ok('Ficha: «Se parece a tus…» y Usar', E(f"!!window.__ctpl.lib.byId('{unk}').meta.category"))
    ok('Sin errores JavaScript', not errors, errors[:3])
    b.close()
print(f'{sum(res)}/{len(res)} comprobaciones superadas'); srv.shutdown(); sys.exit(0 if all(res) else 1)
