# v3.11: envío justo a tiempo (Esc y el patch siguiente cortan de verdad, repetir, A/B cancelable), octava de la
# frase colocada para cada patch (en su registro / como en el Circuit, aviso y arreglo de un clic), y lo traído de
# la Rhythm (portapapeles con carpeta, «Se guarda en», ordenar en disco solo la selección). Equipo SIMULADO.
# Uso: python3 tests/phrase_ui.py [html de dist/]
import sys, os, re, threading, http.server, functools, json
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FAKE_MIDI = re.search(r'FAKE_MIDI = """(.*?)"""', open(os.path.join(ROOT, 'tests', 'browser_test.py')).read(), re.S).group(1)
# además de los datos, la marca de tiempo pedida y el instante en que llegó a la salida
FAKE_MIDI = FAKE_MIDI.replace("send(d) { const a = Array.from(d); sent.push(a);", "send(d, ts) { const a = Array.from(d); sent.push(a); (window.__midiTs = window.__midiTs || []).push([a, ts ?? performance.now(), performance.now()]);")
assert '__midiTs' in FAKE_MIDI
FILE = sys.argv[1] if len(sys.argv) > 1 else 'Circuit_Tracks_Patch_Library_Editor.html'
EN = FILE.endswith('_EN.html')
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8781), functools.partial(Q, directory=os.path.join(ROOT, 'dist'))); threading.Thread(target=srv.serve_forever, daemon=True).start()
res = []; errors = []
def ok(name, cond, extra=''): res.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name + (' · ' + str(extra) if extra != '' else ''))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1500, 'height': 900}); ctx.add_init_script(FAKE_MIDI)
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
    E = pg.evaluate
    pg.goto('http://127.0.0.1:8781/' + FILE); pg.wait_for_selector('.top .brand')
    pg.set_input_files('#dirIn', os.path.join(ROOT, 'tests', 'out')); pg.wait_for_selector('.modal', timeout=60000); pg.click('.modal .btn'); pg.wait_for_timeout(300)
    pg.click('.tabs-main button[data-v="device"]'); pg.click('button[data-act="midiConnect"]'); pg.wait_for_timeout(300)
    now = lambda: E('performance.now()')
    T = lambda: E('window.__midiTs || []')
    ons_after = lambda t0: [x for x in T() if x[2] > t0 and (x[0][0] & 0xF0) == 0x90 and x[0][2] > 0]

    # ---------- grupo de prueba: cuatro bajos, uno de ellos una octava más grave ----------
    # los «Bass B…» del banco son de la misma familia (en Escucha sale uno): sirven para «lo habitual»; Lead Bass y
    # «Thing 7» (Glass Pluck.syx) van solos en la cola
    bassB = E("window.__ctpl.lib.faces().filter(p => p.name.startsWith('Bass B')).map(p => p.id)")
    by = lambda n: E(f"window.__ctpl.lib.faces().find(p => p.name === '{n}').id")
    ids = [bassB[0], by('Thing 7'), bassB[1], by('Lead Bass')]
    E(f"window.__ctpl.lib.setCategory({json.dumps(bassB + ids[1::2])}, 'bass', null)"); pg.wait_for_timeout(200)
    ok('Punto de partida: los del grupo suenan igual', all(E(f"window.__ctpl.testPlan('{i}', 'auto').dev") == 0 for i in ids), [E(f"window.__ctpl.testPlan('{i}', 'auto').dev") for i in ids])
    low = ids[3]
    pg.click('.tabs-main button[data-v="audition"]'); pg.wait_for_timeout(200)
    pg.select_option('select[data-act="qsrc"]', 'all'); pg.wait_for_timeout(200)
    go = lambda pid: (E(f"window.__ctpl.S.qi = window.__ctpl.S.queue.indexOf('{pid}'); window.__ctpl.A.view({{dataset:{{v:'audition'}}}})"), pg.wait_for_timeout(200))
    go(low); pg.locator('body').click(position={'x': 5, 'y': 400})
    pg.keyboard.press('Alt+ArrowDown'); pg.wait_for_timeout(500)
    E('window.__ctpl.A.audStop()')
    tp = lambda pid, mode='fit': E(f"(() => {{ const t = window.__ctpl.testPlan(window.__ctpl.lib.byId('{pid}').id, 'auto', '{mode}'); return {{ dev: t.dev, comp: t.comp, tonic: t.tonic, off: t.off, src: t.src, norm: t.nm.norm, nsrc: t.nm.source }}; }})()")
    a, d = tp(ids[0]), tp(low)
    ok('Lo habitual del grupo sale de la colección', a['nsrc'] == 'coleccion' and a['dev'] == 0 and a['comp'] == 0, a)
    ok('El que se ha bajado una octava: 1 oct más grave que su grupo', d['dev'] == -1, d)
    ok('En su registro: la frase sube una octava y suena donde los demás', d['comp'] == 12 and d['tonic'] + d['off'] == a['tonic'] + a['off'], (d, a))
    c = tp(low, 'circuit')
    ok('Como en el Circuit: la misma frase que el grupo (suena una octava abajo)', c['comp'] == 0 and c['tonic'] == a['tonic'] and c['tonic'] + c['off'] == a['tonic'] + a['off'] - 12, c)
    go(low)
    box = pg.locator('.stage .tbox').first
    ok('El recuadro avisa: «1 oct más grave que tus Bajos»', ('1 oct lower' if EN else '1 oct más grave') in box.inner_text(), box.inner_text()[:300])
    ok('…y dice que la frase sube para compensarlo', ('the phrase goes up 1 oct' if EN else 'la frase sube 1 oct') in box.inner_text().lower())
    ok('Botones En su registro / Como en el Circuit', pg.locator('.stage .phmode button').count() == 2 and pg.locator('.stage .phmode button.on[data-m="fit"]').count() == 1)
    # tocar en su registro: la primera nota que sale es la de la frase colocada
    E('window.__midiTs = []'); pg.keyboard.press('Space'); pg.wait_for_timeout(250)
    first = E(f"(() => {{ const t = window.__ctpl.testPlan('{low}', 'auto'); const n = [...t.ph.notes].sort((a, b) => a.t - b.t)[0]; return n.n + (t.ph.base || 0) + t.root; }})()")
    got = [x[0][1] for x in T() if (x[0][0] & 0xF0) == 0x90 and x[0][2] > 0]
    ok('Espacio toca la frase compensada', got and got[0] == first, (got[:3], first))
    ok('La frase no sale de golpe: el resto espera en la cola', 0 < len(got) < len(E(f"window.__ctpl.testPlan('{low}', 'auto').ph.notes")))
    # Esc corta de verdad
    # el instante de Esc es el del All Notes Off que manda: después no debe salir ninguna nota
    t0 = now(); pg.keyboard.press('Escape'); pg.wait_for_timeout(1500)
    off = [x[2] for x in T() if x[0][0] & 0xF0 == 0xB0 and x[0][1] == 123 and x[2] >= t0]
    ok('Esc: All Notes Off y nada encendido', off and E('window.__ctpl.S.dev.session.sounding.size') == 0)
    ok('Esc: no sale ninguna nota más', off and not ons_after(off[0]), len(ons_after(off[0])) if off else '')
    # el patch siguiente corta la frase anterior
    E('window.__ctpl.S.autoPlay = true'); E('window.__midiTs = []')
    qa = E('window.__ctpl.S.qi'); pg.keyboard.press('Space'); pg.wait_for_timeout(300); t_sw = now(); pg.keyboard.press('ArrowRight' if qa == 0 else 'ArrowLeft'); pg.wait_for_timeout(1500)
    sx = [x for x in T() if x[0][0] == 0xF0 and len(x[0]) == 350 and x[2] >= t_sw]
    late = [x for x in ons_after(t_sw) if sx and x[1] < sx[-1][1]]
    ok('Al pasar al siguiente no sigue sonando la frase del anterior', sx and not late, (len(sx), len(late)))
    E('window.__ctpl.S.autoPlay = false'); E('window.__ctpl.A.audStop()')
    # arreglar con un clic
    go(low); pg.click('.stage .tbox [data-act="phFix"]'); pg.wait_for_timeout(600); E('window.__ctpl.A.audStop()')
    ok('«+1 oct al patch» lo deja como los demás (vuelve a ser el original)', tp(low)['dev'] == 0 and E(f"window.__ctpl.lib.currentVersion(window.__ctpl.lib.byId('{low}')).id") == low)
    # modo como en el Circuit, para toda la herramienta y al recargar
    pg.click('.stage .phmode button[data-m="circuit"]'); pg.wait_for_timeout(300)
    ok('«Como en el Circuit» se guarda', E("window.__ctpl.lib.settings.phraseMode") == 'circuit' and pg.locator('.stage .phmode button.on[data-m="circuit"]').count() == 1)
    pg.reload(); pg.wait_for_selector('.top .brand'); pg.wait_for_timeout(500)
    ok('…y sigue al recargar', E("window.__ctpl.lib.settings.phraseMode") == 'circuit')
    E("window.__ctpl.lib.setSetting('phraseMode', 'fit')")
    if not E('!!window.__ctpl.S.dev.session'): pg.click('.tabs-main button[data-v="device"]'); pg.click('button[data-act="midiConnect"]'); pg.wait_for_timeout(300)
    pg.click('.tabs-main button[data-v="audition"]'); pg.wait_for_timeout(200); pg.select_option('select[data-act="qsrc"]', 'all'); pg.wait_for_timeout(200)

    # ---------- −8va se oye tal cual (sin compensar) ----------
    go(ids[1]); pg.locator('body').click(position={'x': 5, 'y': 400})
    circ = E(f"(() => {{ const t = window.__ctpl.testPlan('{ids[1]}', 'auto', 'circuit'); const n = [...t.ph.notes].sort((a, b) => a.t - b.t)[0]; return n.n + (t.ph.base || 0) + t.root; }})()")
    E('window.__midiTs = []'); pg.keyboard.press('Alt+ArrowDown'); pg.wait_for_timeout(500); E('window.__ctpl.A.audStop()')
    got = [x[0][1] for x in T() if (x[0][0] & 0xF0) == 0x90 and x[0][2] > 0]
    ok('Alt ↓ se oye con la frase de su grupo, sin compensar: se nota el cambio', got and got[0] == circ, (got[:2], circ))
    ok('…y después el recuadro avisa de que está 1 oct más grave', tp(ids[1])['dev'] == -1)

    # ---------- A/B en Cambios: Esc cancela B ----------
    E('window.__midiTs = []'); E(f"window.__ctpl.A.chgAB({{dataset:{{id: window.__ctpl.lib.currentVersion(window.__ctpl.lib.byId('{ids[1]}')).id}}}})"); pg.wait_for_timeout(300)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(3500)
    ok('A/B: Esc entre A y B y B ya no llega', len([x for x in T() if x[0][0] == 0xF0 and len(x[0]) == 350]) == 1, len([x for x in T() if x[0][0] == 0xF0]))
    E('window.__midiTs = []'); E(f"window.__ctpl.A.chgAB({{dataset:{{id: window.__ctpl.lib.currentVersion(window.__ctpl.lib.byId('{ids[1]}')).id}}}})"); pg.wait_for_timeout(5500)
    sx = [x for x in T() if x[0][0] == 0xF0 and len(x[0]) == 350]
    ok('A/B sin parar: A y después B, con la misma frase', len(sx) == 2 and sx[0][0] != sx[1][0], len(sx))
    E('window.__ctpl.A.audStop()')

    # ---------- barrido de macro: la versión que suena y en la tónica de su frase ----------
    go(ids[1]); E('window.__midiTs = []'); pg.keyboard.press('Shift+Digit1'); pg.wait_for_timeout(500)
    cv = E(f"Array.from(window.__ctpl.lib.currentVersion(window.__ctpl.lib.byId('{ids[1]}')).payload)")
    sx = [x[0] for x in T() if x[0][0] == 0xF0 and len(x[0]) == 350]
    nt = [x[0][1] for x in T() if (x[0][0] & 0xF0) == 0x90]
    ok('Mayús+1: el barrido usa la versión (no el original)', sx and sx[0][9:349] == cv)
    ok('…y la tónica de su frase', nt and nt[0] == E(f"window.__ctpl.testPlan('{ids[1]}', 'auto').tonic"), (nt[:1], E(f"window.__ctpl.testPlan('{ids[1]}', 'auto').tonic")))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    ok('Esc a mitad del barrido devuelve la macro a su sitio', [x[0][2] for x in T() if x[0][0] == 0xB0 and x[0][1] == 80][-1] == cv[204])

    # ---------- repetir ----------
    E('window.__ctpl.S.autoPlay = false'); pg.check('[data-act="opt"][data-k="loopPhrase"]'); pg.wait_for_timeout(100)
    ok('Casilla «repetir»', pg.locator('label:has([data-k="loopPhrase"])').inner_text().strip() == ('loop' if EN else 'repetir'), pg.locator('label:has([data-k="loopPhrase"])').inner_text())
    go(ids[1]); n_ph = len(E(f"window.__ctpl.testPlan('{ids[1]}', 'auto').ph.notes"))
    E('window.__midiTs = []'); pg.keyboard.press('Space'); pg.wait_for_timeout(4300)
    n1 = len([x for x in T() if (x[0][0] & 0xF0) == 0x90 and x[0][2] > 0])
    ok('Repetir: la frase vuelve a empezar', n1 > n_ph and E('window.__ctpl.S.looping') is not None, (n1, n_ph))
    t0 = now(); pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(1200)
    off = [x[2] for x in T() if x[0][0] & 0xF0 == 0xB0 and x[0][1] == 123 and x[2] >= t0]
    ok('…y pasar a otro patch la para (sin auto-escuchar)', off and not ons_after(off[0]) and E('window.__ctpl.S.looping') is None, [(x[0], round(x[1] - off[0]), round(x[2] - off[0])) for x in ons_after(off[0])][:4] if off else 'sin All Notes Off')
    # en la Biblioteca, Esc también para
    E(f"window.__ctpl.S.sel = '{ids[0]}'"); pg.click('.tabs-main button[data-v="library"]'); pg.wait_for_timeout(300)
    pg.locator('body').click(position={'x': 5, 'y': 400}); pg.keyboard.press('Space'); pg.wait_for_timeout(600)
    t0 = now(); pg.keyboard.press('Escape'); pg.wait_for_timeout(1200)
    off = [x[2] for x in T() if x[0][0] & 0xF0 == 0xB0 and x[0][1] == 123 and x[2] >= t0]
    ok('Biblioteca: Esc también para la frase', off and not ons_after(off[0]) and E('window.__ctpl.S.looping') is None)
    pg.reload(); pg.wait_for_selector('.top .brand'); pg.wait_for_timeout(500)
    ok('Repetir se guarda en los ajustes', E("window.__ctpl.S.loopPhrase") is True)
    E("window.__ctpl.S.loopPhrase = false")

    # ---------- portapapeles con carpeta ----------
    E(f"window.__ctpl.lib.addTags(['{ids[0]}'], ['Rolling', 'Dark'])"); pg.wait_for_timeout(100)
    E(f"window.__ctpl.lib.setSubfolder(['{ids[0]}'], 'bass', 'rolling')"); pg.wait_for_timeout(100)
    E(f"window.__ctpl.S.sel = '{ids[0]}'; window.__ctpl.A.view({{dataset:{{v:'library'}}}})"); pg.wait_for_timeout(300)
    pg.locator('body').click(position={'x': 5, 'y': 400}); pg.keyboard.press('Shift+V'); pg.wait_for_timeout(300)
    ok('Mayús V copia la carpeta y las etiquetas', E("window.__ctpl.lib.settings.clipF.cat") == 'bass' and E("window.__ctpl.lib.settings.clipF.sub") == 'rolling' and set(E("window.__ctpl.lib.settings.tagClip")) == {'Rolling', 'Dark'})
    other = E("window.__ctpl.lib.faces().find(p => p.name === 'Dark Pad').id")
    E(f"window.__ctpl.S.sel = '{other}'; window.__ctpl.A.view({{dataset:{{v:'library'}}}})"); pg.wait_for_timeout(200)
    pg.keyboard.press('v'); pg.wait_for_timeout(300)
    m = E(f"(() => {{ const m = window.__ctpl.lib.byId('{other}').meta; return [m.category, m.subtype, m.tags]; }})()")
    ok('V pega la carpeta (con su subcarpeta) y las etiquetas', m[0] == 'bass' and m[1] == 'rolling' and {'Rolling', 'Dark'} <= set(m[2]), m)
    ok('El botón dice «Ya lo tiene»', ('already has it' if EN else 'ya lo tiene') in pg.locator('.insp [data-act="clipPaste"]').inner_text().lower())
    third = E("window.__ctpl.lib.faces().find(p => p.name === 'Neon Lead').id")
    E(f"window.__ctpl.S.sel = '{third}'; window.__ctpl.A.view({{dataset:{{v:'library'}}}})"); pg.wait_for_timeout(200)
    pg.click('.insp .clipk[data-k="cat"]'); pg.wait_for_timeout(200)
    ok('La carpeta se puede apagar', 'cat' in E("window.__ctpl.lib.settings.clipF.off") and pg.locator('.insp .clipk[data-k="cat"]:not(.on)').count() == 1)
    cat0 = E(f"window.__ctpl.lib.byId('{third}').meta.category")
    pg.keyboard.press('v'); pg.wait_for_timeout(300)
    ok('…y entonces V solo pega las etiquetas', E(f"window.__ctpl.lib.byId('{third}').meta.category") == cat0 and 'Dark' in E(f"window.__ctpl.lib.byId('{third}').meta.tags"))
    pg.click('.insp .clipk[data-k="cat"]'); pg.click('.insp [data-act="clipGroup"]'); pg.wait_for_timeout(200)
    ok('El grupo guarda la carpeta', E("window.__ctpl.lib.settings.tagGroups[0].cat") == 'bass' and E("window.__ctpl.lib.settings.tagGroups[0].sub") == 'rolling')
    E("window.__ctpl.lib.setSetting('tagGroups', [['Acid', 'Wobble'], ...window.__ctpl.lib.settings.tagGroups])"); pg.wait_for_timeout(100)
    E("window.__ctpl.A.clipClear()"); pg.wait_for_timeout(100); E("window.__ctpl.A.clipLoad({dataset:{i:0}})"); pg.wait_for_timeout(200)
    ok('Un grupo de antes (solo etiquetas) se sigue cargando', E("window.__ctpl.lib.settings.tagClip") == ['Acid', 'Wobble'] and not E("window.__ctpl.lib.settings.clipF.cat"))

    # ---------- «Se guarda en» y ordenar en disco solo la selección ----------
    E(f"window.__ctpl.S.sel = '{other}'; window.__ctpl.A.view({{dataset:{{v:'library'}}}})"); pg.wait_for_timeout(300)
    path = E(f"window.__ctpl.diskPathOf('{other}')")
    entry = E(f"(() => {{ const e = window.__ctpl.currentPlan().entries.find(x => x.id === '{other}'); return e.dir.join(' / ') + ' / ' + e.file; }})()")
    ok('«Se guarda en» coincide con «Ordenar en disco»', path and path['dir'] + ' / ' + path['file'] == entry, (path, entry))
    ok('La ficha lo muestra', entry in pg.locator('.insp .savein').inner_text(), pg.locator('.insp .savein').inner_text())
    sel3 = E("window.__ctpl.lib.faces().slice(0, 3).map(p => p.id)")
    E(f"window.__ctpl.S.multi = new Set({json.dumps(sel3)}); window.__ctpl.S.plan.scope = 'sel'")
    ok('Ordenar en disco: «La selección» escribe solo esos patches', E("window.__ctpl.currentPlan().writes") == 3, E("window.__ctpl.currentPlan().writes"))
    pg.click('.tabs-main button[data-v="organize"]'); E("window.__ctpl.A.goDisk()"); pg.wait_for_timeout(300)
    ok('La vista dice «La selección (3)»', pg.locator('select[data-act="planSet"][data-k="scope"] option[value="sel"]').inner_text().endswith('(3)'))
    E("window.__ctpl.S.multi = new Set(); window.__ctpl.A.goDisk()"); pg.wait_for_timeout(200)
    ok('…y sin selección, toda la biblioteca (con aviso)', E("window.__ctpl.currentPlan().writes") > 3 and pg.locator('.note', has_text=('Nothing is selected' if EN else 'No hay nada seleccionado')).count() == 1)
    E("window.__ctpl.S.plan.scope = 'all'")
    if EN:
        E(f"window.__ctpl.S.sel = '{low}'; window.__ctpl.A.view({{dataset:{{v:'library'}}}})"); pg.wait_for_timeout(300)
        txt = pg.locator('.insp').inner_text()
        ok('Inglés: la ficha (frase, portapapeles, «Saved to») sin textos en español', 'saved to' in txt.lower() and 'in its register' in txt.lower() and not re.search(r'[áéíóúñ¿¡]', txt), (re.findall(r'\S*[áéíóúñ¿¡]\S*', txt)[:5], 'saved to' in txt.lower()))
    ok('Sin errores JavaScript', not errors, errors[:3])
    b.close()
print(f"\n{sum(res)} / {len(res)} comprobaciones")
sys.exit(0 if all(res) else 1)
