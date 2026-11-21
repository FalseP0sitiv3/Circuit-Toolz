"""v2.5: pistas que se pueden usar (en un loop, el instrumento va a su subcarpeta) y portapapeles con
categoría, tipo y subcarpeta. Uso: python3 tests/content_ui.py dist/Circuit_Rhythm_Sample_Library.html /tmp/crsl_fixture"""
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
# un loop de hats en una carpeta «hh» y otro sin pistas en el nombre
# (otro contenido: las copias exactas se juntan en una sola ficha)
def variant(b64, k):
    b = bytearray(base64.b64decode(b64)); b[-2] = (b[-2] + k) % 256; return base64.b64encode(bytes(b)).decode()
files['Loops/hh/hatloop 128.wav'] = variant(files['Loops/Top Loop 128bpm.wav'], 1)
files['Loops/Groove 07.wav'] = variant(files['Loops/Top Loop 128bpm.wav'], 2)
errors = []
with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required'])
    ctx = br.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True); ctx.add_init_script(MOCK)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    page.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
    page.goto('file://' + HTML); page.wait_for_selector('.tab')
    page.evaluate('([f]) => window.__pickQueue.push(window.__mkFS("Samples", f))', [files])
    page.click('[data-act="link"] >> nth=0'); time.sleep(0.5); wait_idle(page, 120)
    J = lambda js, *a: page.evaluate(js, *a)
    def sel(name):
        J('(n) => { const { S } = window.__crsl; S.sel = S.samples.find((s) => s.name === n).id; S.multi = new Set(); S.libMode = "list"; S.view = "library"; S.f = { ...S.f, q: "", cat: "all", cert: "all", flag: "all", tag: "", sub: "", words: [], kind: "" }; window.__crsl.renderAll(); }', name)
        time.sleep(0.2)
    U = lambda n: J('(n) => window.__crsl.S.samples.find((s) => s.name === n).user', n)
    HL = 'hatloop 128.wav'
    sel(HL)
    ok(J('(n) => window.__crsl.clsOf(window.__crsl.S.samples.find((s) => s.name === n)).cat', HL) == 'dloop', '«hatloop» se propone como Drum loop')
    prop = page.locator('#detail .orgd .oprop').first.inner_text()
    ok('closed-hats' in prop.lower(), 'y su subcarpeta propuesta es Closed-Hats: ' + prop.strip()[:60])
    clues = page.locator('#detail .why-list .clue')
    ok(clues.count() >= 2, f'las pistas del nombre, la carpeta y el sonido son botones ({clues.count()})')
    hh = page.locator('#detail .why-list .clue[data-tok="hh"]')
    ok(hh.count() == 1 and ('closed-hats' in (hh.get_attribute('title') or '').lower()), 'la pista «hh» dice que irá a Drum loop › Closed-Hats')
    hh.click(); time.sleep(0.4)
    u = U(HL)
    ok(u.get('cat') == 'dloop' and u.get('sub') == 'hat', 'un clic: Drum loop con subcarpeta Closed-Hats')
    ok(page.locator('#detail .why-list .clue.on').count() >= 1, 'la pista usada queda marcada')
    segs = [x.strip() for x in page.locator('#detail .dest .dseg b').all_inner_texts()]
    ok(segs[:2] == ['14 Drum Loops', 'Closed-Hats'] and page.locator('#detail .dest .dseg.prop').count() == 0, '«Se guarda en»: 14 Drum Loops / Closed-Hats, ya decidido: ' + ' / '.join(segs))
    plan = J('(n) => { const c = window.__crsl, s = c.S.samples.find((x) => x.name === n); return c.organizePlanOf(s); }', HL)
    ok(plan == '14 Drum Loops/Closed-Hats/' + HL, 'y «Ordenar en disco» lo deja ahí: ' + str(plan))
    # en un one-shot, la pista cambia la categoría
    sel('Kick 99.wav')
    k = page.locator('#detail .why-list .clue').first
    kc = k.get_attribute('data-cat'); k.click(); time.sleep(0.4)
    ok(U('Kick 99.wav').get('cat') == kc, 'en un one-shot, la pista decide la categoría (' + str(kc) + ')')
    segs = [x.strip() for x in page.locator('#detail .dest .dseg b').all_inner_texts()]
    ok(len(segs) >= 3 and segs[1] == ('One-shots') and page.locator('#detail .dest .dseg.prop').count() >= 1, 'un one-shot: Categoría / One-shots / subcarpeta propuesta (discontinua): ' + ' / '.join(segs))
    found = []
    for v in ['library', 'listen', 'map', 'packs', 'patterns', 'songs', 'device', 'data']:
        J('(v) => { const c = window.__crsl; c.S.view = v; c.renderAll(); }', v); time.sleep(0.4)
        body = page.locator('body').inner_text().lower()
        found += [v + ':' + w for w in ['verificar', 'verified', 'experimental'] if w in body]
    ok(not found, 'ninguna sección dice «sin verificar» ni «experimental»' + (': ' + ', '.join(found) if found else ''))
    # Escucha: usar una pista no avanza
    J('(n) => { const c = window.__crsl, s = c.S.samples.find((x) => x.name === n); c.S.view = "listen"; c.S.listen.queue = [s.id, ...c.S.samples.filter((x) => x !== s).map((x) => x.id)]; c.S.listen.i = 0; c.renderAll(); }', 'Groove 07.wav'); time.sleep(0.5)
    n0 = J('() => window.__crsl.S.listen.i')
    page.locator('.why-list .clue').first.click(); time.sleep(0.4)
    ok(J('() => window.__crsl.S.listen.i') == n0, 'Escucha: usar una pista no salta al siguiente')
    # portapapeles: Alt Mayús V copia categoría, tipo, subcarpeta y etiquetas
    sel(HL)
    J('(n) => { const c = window.__crsl, s = c.S.samples.find((x) => x.name === n); s.user.tags = ["Wobble"]; c.renderAll(); }', HL); time.sleep(0.2)
    page.locator('#detail .label').click(); page.keyboard.press('Alt+Shift+V'); time.sleep(0.4)
    f = J('() => window.__crsl.S.set.clipF')
    ok(f.get('cat') == 'dloop' and f.get('sub') == 'hat' and f.get('kind') == 'loop' and J('() => window.__crsl.S.set.tagClip') == ['Wobble'], 'Alt Mayús V copia categoría, subcarpeta, tipo y etiquetas')
    ok(page.locator('#detail .tclip .cf').count() == 3, 'el portapapeles muestra los tres campos')
    sel('Groove 07.wav'); page.locator('#detail .label').click(); page.keyboard.press('Alt+v'); time.sleep(0.4)
    u = U('Groove 07.wav')
    ok(u.get('cat') == 'dloop' and u.get('sub') == 'hat' and u.get('kind') == 'loop' and 'Wobble' in (u.get('tags') or []), 'Alt V lo pega todo en otro loop')
    ok(('already has it' if EN else 'ya lo tiene') in page.locator('#detail [data-act="clip-paste"]').inner_text().lower(), 'y el botón dice «Ya lo tiene»')
    # apagar categoría y subcarpeta: solo el tipo y las etiquetas
    page.click('#detail .tclip [data-act="clip-tog"][data-v="cat"]'); time.sleep(0.2)
    page.click('#detail .tclip [data-act="clip-tog"][data-v="sub"]'); time.sleep(0.2)
    ok(page.locator('#detail .tclip .cf.off').count() == 2, 'categoría y subcarpeta apagadas')
    sel('Shaker.aif'); cat0 = U('Shaker.aif').get('cat'); page.click('#detail [data-act="clip-paste"]'); time.sleep(0.4)
    u = U('Shaker.aif')
    ok(u.get('kind') == 'loop' and u.get('cat') == cat0 and not u.get('sub') and 'Wobble' in (u.get('tags') or []), 'con lo apagado: pega solo el tipo y las etiquetas')
    # subcarpeta entre categorías: Shakers de Closed hat → Shakers de Perc (mismo nombre)
    J('''(n) => { const c = window.__crsl, s = c.S.samples.find((x) => x.name === n); s.user.cat = "hat"; s.user.sub = "shaker"; s.user.kind = "oneshot"; c.invalidateAll(); c.renderAll(); }''', 'HH Closed 02.wav'); time.sleep(0.2)
    sel('HH Closed 02.wav'); page.locator('#detail .label').click(); page.keyboard.press('Alt+Shift+V'); time.sleep(0.3)
    J('() => { const c = window.__crsl; c.S.set.clipF.off = ["cat", "kind", "tags"]; c.renderAll(); }')
    J('''(n) => { const c = window.__crsl, s = c.S.samples.find((x) => x.name === n); s.user.cat = "perc"; delete s.user.sub; c.invalidateAll(); }''', 'Clap 909.wav')
    sel('Clap 909.wav'); page.locator('#detail .label').click(); page.keyboard.press('Alt+v'); time.sleep(0.4)
    ok(U('Clap 909.wav').get('cat') == 'perc' and U('Clap 909.wav').get('sub') == 'shaker', 'la subcarpeta pasa a otra categoría por su nombre (Shakers)')
    # grupos: guardan los campos; los de 2.4 (solo etiquetas) siguen funcionando
    J('() => { const c = window.__crsl; c.S.set.clipF.off = []; c.S.set.tagGroups = [["Oscuro", "Sucio"]]; c.renderAll(); }'); time.sleep(0.2)
    page.click('#detail .tclip [data-act="clip-group"]'); time.sleep(0.3)
    g = J('() => window.__crsl.S.set.tagGroups')
    ok(len(g) == 2 and g[0].get('cat') == 'hat' and g[0].get('sub') == 'shaker' and (g[1] if isinstance(g[1], list) else g[1].get('tags')) == ['Oscuro', 'Sucio'], 'un grupo guarda categoría, subcarpeta y tipo; el de 2.4 sigue ahí')
    page.click('#detail .tclip [data-act="clip-load"] >> nth=1'); time.sleep(0.3)
    ok(J('() => window.__crsl.S.set.tagClip') == ['Oscuro', 'Sucio'] and not J('() => window.__crsl.S.set.clipF').get('cat'), 'cargar un grupo de 2.4: solo etiquetas')
    page.reload(); page.wait_for_selector('.tab'); time.sleep(0.8)
    ok(len(J('() => window.__crsl.S.set.tagGroups')) == 2 and J('(n) => window.__crsl.S.samples.find((s) => s.name === n).user.sub', HL) == 'hat', 'todo sigue al recargar')
    bad = [e for e in errors if 'favicon' not in e]
    ok(not bad, 'sin errores en la consola' + (': ' + ' | '.join(bad[:3]) if bad else ''))
    br.close()
print(f'\n{sum(c for c, _ in checks)} de {len(checks)} comprobaciones')
sys.exit(0 if all(c for c, _ in checks) else 1)
