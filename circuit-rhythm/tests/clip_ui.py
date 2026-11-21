"""v2.4: portapapeles de etiquetas (Alt V pega, Alt Mayús V copia, grupos, selección).
Uso: python3 tests/clip_ui.py dist/Circuit_Rhythm_Sample_Library.html /tmp/crsl_fixture"""
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
    ctx = br.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True); ctx.add_init_script(MOCK)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    page.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
    page.goto('file://' + HTML); page.wait_for_selector('.tab')
    page.evaluate('([f]) => window.__pickQueue.push(window.__mkFS("Samples", f))', [files])
    page.click('[data-act="link"] >> nth=0'); time.sleep(0.5); wait_idle(page, 120)
    J = lambda js, *a: page.evaluate(js, *a)
    def sel(name):
        J('(n) => { const { S } = window.__crsl; S.sel = S.samples.find((s) => s.name === n).id; S.libMode = "list"; S.view = "library"; S.f = { ...S.f, q: "", cat: "all", cert: "all", flag: "all", tag: "", sub: "", words: [], kind: "" }; window.__crsl.renderAll(); }', name)
        time.sleep(0.15)
    tags = lambda n: J('(n) => window.__crsl.S.samples.find((s) => s.name === n).user.tags || []', n)
    sel('Kick 99.wav')
    ok(page.locator('#detail .tclip').count() == 1, 'Portapapeles en la ficha')
    page.fill('#detail .clipin', 'Wobble'); page.press('#detail .clipin', 'Enter'); time.sleep(0.3)
    ok(J('() => window.__crsl.S.set.tagClip') == ['Wobble'], 'Escribir «Wobble» lo pone en el portapapeles')
    page.locator('#detail .label').click(); time.sleep(0.1)
    page.keyboard.press('Alt+v'); time.sleep(0.4)
    ok('Wobble' in tags('Kick 99.wav'), 'Alt V lo pega en el sample')
    ok(('already has it' if EN else 'ya lo tiene') in page.locator('#detail [data-act="clip-paste"]').inner_text().lower(), 'y el botón dice «Ya lo tiene»')
    # en Escucha: Alt V pega y no decide «Vox»
    J('() => { const c = window.__crsl; c.S.view = "listen"; c.renderAll(); }'); time.sleep(0.5)
    cid = J('() => { const c = window.__crsl; return c.S.listen.queue[c.S.listen.i]; }')
    cat0 = J('(id) => window.__crsl.S.byId[id].user.cat || null', cid)
    page.keyboard.press('Alt+v'); time.sleep(0.4)
    ok('Wobble' in (J('(id) => window.__crsl.S.byId[id].user.tags || []', cid)) and J('(id) => window.__crsl.S.byId[id].user.cat || null', cid) == cat0, 'Escucha: Alt V pega en el que escuchas, sin decidir «Vox»')
    ok(page.locator('.tclip').count() >= 1, 'Escucha también tiene el portapapeles')
    J('async (id) => { const c = window.__crsl, s = c.S.byId[id]; s.user.tags = ["Wobble", "Oscuro", "Sucio"]; c.renderAll(); }', cid); time.sleep(0.3)
    page.keyboard.press('Alt+Shift+V'); time.sleep(0.4)
    ok(sorted(J('() => window.__crsl.S.set.tagClip')) == ['Oscuro', 'Sucio', 'Wobble'], 'Alt Mayús V copia las etiquetas del sample')
    page.click('.tclip [data-act="clip-group"] >> nth=0'); time.sleep(0.3)
    page.click('.tclip [data-act="clip-clear"] >> nth=0'); time.sleep(0.3)
    ok(len(J('() => window.__crsl.S.set.tagGroups')) == 1 and J('() => window.__crsl.S.set.tagClip') == [], 'Guardar como grupo y vaciar')
    page.click('.tclip [data-act="clip-load"] >> nth=0'); time.sleep(0.3)
    ok(sorted(J('() => window.__crsl.S.set.tagClip')) == ['Oscuro', 'Sucio', 'Wobble'], 'Cargar el grupo con un clic')
    names = ['Kick Rumble 03.wav', 'Snare Tight.wav', 'Shaker.aif']
    J('(ns) => { const c = window.__crsl, ids = ns.map((n) => c.S.samples.find((s) => s.name === n).id); c.S.view = "library"; c.S.multi = new Set(ids); c.S.sel = ids[0]; c.renderAll(); }', names); time.sleep(0.4)
    ok(('paste on 3' if EN else 'pegar en 3') in page.locator('[data-act="clip-paste"]').first.inner_text().lower(), 'Biblioteca con 3 seleccionados: «Pegar en 3»')
    page.click('[data-act="clip-paste"] >> nth=0'); time.sleep(0.4)
    ok(all({'Oscuro', 'Sucio', 'Wobble'} <= set(tags(n)) for n in names), 'y se pegan en los tres')
    page.reload(); page.wait_for_selector('.tab'); time.sleep(0.8)
    ok(len(J('() => window.__crsl.S.set.tagClip')) == 3 and len(J('() => window.__crsl.S.set.tagGroups')) == 1, 'Portapapeles y grupos siguen al recargar')
    bad = [e for e in errors if 'favicon' not in e]
    ok(not bad, 'sin errores en la consola' + (': ' + ' | '.join(bad[:3]) if bad else ''))
    br.close()
print(f'\n{sum(c for c, _ in checks)} de {len(checks)} comprobaciones')
sys.exit(0 if all(c for c, _ in checks) else 1)
