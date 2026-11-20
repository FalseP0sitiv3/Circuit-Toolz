# v3.8: Laboratorio (mutar, cruzar, mezclar) con un Circuit Tracks simulado.
# Uso: python3 tests/lab_ui.py [Circuit_Tracks_Patch_Library_Editor.html]  (antes: node tests/make-fixtures.mjs)
import sys, os, re, threading, http.server, functools
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FAKE_MIDI = re.search(r'FAKE_MIDI = """(.*?)"""', open(os.path.join(ROOT, 'tests', 'browser_test.py')).read(), re.S).group(1)
FILE = sys.argv[1] if len(sys.argv) > 1 else 'Circuit_Tracks_Patch_Library_Editor.html'
EN = '_EN' in FILE
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8779), functools.partial(Q, directory=os.path.join(ROOT, 'dist'))); threading.Thread(target=srv.serve_forever, daemon=True).start()
res = []; errors = []
def ok(name, cond, extra=''): res.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name + (' · ' + str(extra) if extra != '' else ''))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1500, 'height': 1000}); ctx.add_init_script(FAKE_MIDI)
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
    pg.goto('http://127.0.0.1:8779/' + FILE); pg.wait_for_selector('.top .brand')
    pg.set_input_files('#dirIn', os.path.join(ROOT, 'tests', 'out')); pg.wait_for_selector('.modal', timeout=60000); pg.click('.modal .btn'); pg.wait_for_timeout(300)
    J = lambda js: pg.evaluate(js)
    total = J('window.__ctpl.lib.patches.length')
    # un patch original con categoría, y otro de la misma categoría
    pid = J("(() => { const L = window.__ctpl.lib; const c = {}; for (const p of L.patches) if (p.kind === 'original') { const k = p.meta.category || L.info(p).cls.category; if (k) (c[k] ||= []).push(p.id); } const k = Object.keys(c).sort((a, b) => c[b].length - c[a].length)[0]; return c[k][0]; })()")
    J(f"(() => {{ const {{ S }} = window.__ctpl; S.sel = '{pid}'; S.view = 'library'; S.ctab = 'lab'; window.__ctpl.A.goEdit?.({{ dataset: {{ t: 'lab' }} }}); }})()")
    pg.wait_for_timeout(300)
    ok('Pestaña «Laboratorio» en la ficha', pg.locator('.center .ctabs button', has_text='Lab' if EN else 'Laboratorio').count() >= 1 and pg.locator('.labo').count() == 1)
    ok('Sin equipo: avisa y deja generar', pg.locator('.labo .note').count() >= 1 and pg.locator('[data-act="labGen"]').is_enabled())
    # conectar el equipo simulado y volver
    pg.click('.tabs-main button[data-v="device"]'); pg.click('button[data-act="midiConnect"]'); pg.wait_for_timeout(300)
    J(f"(() => {{ const {{ S }} = window.__ctpl; S.sel = '{pid}'; S.view = 'library'; S.ctab = 'lab'; }})()"); pg.click('.tabs-main button[data-v="library"]'); pg.wait_for_timeout(300)
    if not pg.locator('.labo').count(): pg.click('.center .ctabs button >> nth=4'); pg.wait_for_timeout(200)
    # ---- mutar ----
    pg.click('[data-act="labAmt"][data-v="wild"]'); pg.wait_for_timeout(100)
    pg.click('[data-act="labGrp"][data-v="osc"]'); pg.wait_for_timeout(100)
    pg.click('[data-act="labGen"]'); pg.wait_for_timeout(300)
    cards = pg.locator('.labcard')
    ok('Mutar: 8 variaciones', cards.count() == 8)
    texts = cards.locator('.labch').all_inner_texts()
    ok('Cada una dice qué cambia', all(t.strip() for t in texts[:8]), texts[0])
    pcts = [int(t.split('%')[0]) for t in cards.locator('.labcard-h .dim').all_inner_texts()]
    ok('y cuánto se parece', all(0 < x < 100 for x in pcts), pcts)
    J('window.__midiSent.length = 0')
    pg.click('.labcard [data-act="labPlay"] >> nth=2'); pg.wait_for_timeout(400)
    sent = J('window.__midiSent')
    ok('▶ envía la variación a la RAM y toca la frase', any(a[0] == 0xF0 and len(a) == 350 and a[6] == 0 for a in sent) and any((a[0] & 0xF0) == 0x90 for a in sent))
    sx = next(a for a in sent if a[0] == 0xF0 and len(a) == 350)
    pg.click('.labcard [data-act="labSave"] >> nth=2'); pg.wait_for_timeout(600)
    newp = J(f"window.__ctpl.lib.patches.filter((p) => p.meta.lab).map((p) => ({{ id: p.id, name: p.name, kind: p.kind, folder: p.folderPath, op: p.meta.lab.op, from: p.meta.lab.from }}))")
    ok('Guardar crea un patch nuevo (no una variante)', len(newp) == 1 and newp[0]['kind'] == 'original' and J('window.__ctpl.lib.patches.length') == total + 1, newp)
    ok('en «Laboratorio/…», con nombre «… M3» y su origen', newp and newp[0]['folder'].startswith('Lab/' if EN else 'Laboratorio/') and newp[0]['name'].endswith('M3') and newp[0]['op'] == 'mutate' and newp[0]['from'] == [pid], newp and (newp[0]['folder'], newp[0]['name']))
    same = J(f"(() => {{ const q = window.__ctpl.lib.byId('{newp[0]['id']}'); return Array.from(q.payload.subarray(16)); }})()") if newp else []
    ok('Es exactamente lo que sonó', same == sx[-341 + 16:-1], 'bytes 16–339 (el nombre cambia: «… M3»)')
    ok('La tarjeta queda «Guardado»', pg.locator('.labcard.saved').count() == 1)
    ok('El origen lo muestra en «Nacidos de este patch»', pg.locator('.labkids [data-act="labGo"]').count() == 1)
    pg.click('[data-act="labGen"]'); pg.wait_for_timeout(300)
    ok('«Otros 8» da otras', pg.locator('.labcard.saved').count() == 0 and pg.locator('.labcard').count() == 8)
    # ---- cruzar ----
    pg.click('[data-act="labMode"][data-v="cross"]'); pg.wait_for_timeout(200)
    ok('Cruzar sin pareja: no deja generar', not pg.locator('[data-act="labGen"]').is_enabled())
    opts = pg.locator('#labB option').evaluate_all('(o) => o.map((x) => x.value)')
    bid = next(v for v in opts if v and v != '__cat')
    pg.select_option('#labB', bid); pg.wait_for_timeout(200)
    pg.click('[data-act="labGen"]'); pg.wait_for_timeout(300)
    ok('Cruzar con otro: 8 hijos que dicen qué toman de B', pg.locator('.labcard').count() == 8 and any(('from B' if EN else 'de B') in t for t in pg.locator('.labcard .labch.dim').all_inner_texts()))
    pg.click('.labcard [data-act="labSave"] >> nth=0'); pg.wait_for_timeout(600)
    x = J(f"window.__ctpl.lib.patches.filter((p) => p.meta.lab?.op === 'cross').map((p) => p.meta.lab.from)")
    ok('Guardar un cruce guarda sus dos padres', x == [[pid, bid]], x)
    pg.select_option('#labB', '__cat'); pg.wait_for_timeout(200)
    pg.click('[data-act="labGen"]'); pg.wait_for_timeout(300)
    ok('Con varios de su categoría', pg.locator('.labcard').count() == 8)
    # ---- mezclar ----
    pg.click('[data-act="labMode"][data-v="morph"]'); pg.wait_for_timeout(200)
    pg.select_option('#labB', bid); pg.wait_for_timeout(200)
    ok('Mezclar: control de A a B', pg.locator('#labT').count() == 1)
    J('window.__midiSent.length = 0')
    for v in ['10', '40', '70']:
        pg.locator('#labT').fill(v); pg.wait_for_timeout(120)
    sends = [a for a in J('window.__midiSent') if a[0] == 0xF0 and len(a) == 350]
    ok('Mover el control envía el sonido al equipo en directo', len(sends) >= 2, len(sends))
    ok('y dice qué cambia', pg.locator('#labMorphCh').inner_text().strip() != '' and pg.locator('#labTv').inner_text().startswith('70'))
    pg.locator('#labT').dispatch_event('change'); pg.wait_for_timeout(200)
    pg.click('[data-act="labSaveMorph"]'); pg.wait_for_timeout(600)
    mo = J("window.__ctpl.lib.patches.filter((p) => p.meta.lab?.op === 'morph').map((p) => p.name)")
    ok('Guardar este punto', len(mo) == 1 and mo[0].endswith('70%'), mo)
    # el patch nuevo dice de dónde viene y persiste al recargar
    J(f"(() => {{ const {{ S }} = window.__ctpl; S.sel = '{newp[0]['id']}'; }})()") if newp else None
    pg.reload(); pg.wait_for_selector('.top .brand'); pg.wait_for_timeout(600)
    n = J("window.__ctpl.lib.patches.filter((p) => p.meta.lab).length")
    ok('Los tres siguen ahí al recargar', n == 3, n)
    J(f"(() => {{ const {{ S }} = window.__ctpl; S.sel = '{newp[0]['id']}'; S.view = 'library'; S.ctab = 'lab'; }})()"); pg.click('.tabs-main button[data-v="library"]'); pg.wait_for_timeout(300)
    ok('Su ficha dice que nació en el Laboratorio', ('Born in the Lab' if EN else 'Nació en el Laboratorio') in pg.locator('.labo').inner_text())
    ok('Sin errores de JavaScript', not errors, ' | '.join(errors[:3]))
    b.close()
srv.shutdown()
print(f'{sum(res)}/{len(res)} comprobaciones superadas')
sys.exit(0 if all(res) else 1)
