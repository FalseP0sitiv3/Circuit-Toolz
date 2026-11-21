"""v2.7: exportar las slices elegidas por separado y relacionadas (Acortar → Al exportar).
Uso: python3 tests/parts_ui.py dist/Circuit_Rhythm_Sample_Library.html /tmp/crsl_fixture"""
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
LOOP = 'Top Loop 128bpm.wav'
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
        time.sleep(0.4)
    orig = lambda: J('(n) => { const s = window.__crsl.S.samples.find((x) => x.name === n); return { id: s.id, split: s.user.split || null, keep: (s.recipe || {}).keep || null }; }', LOOP)
    parts = lambda: J('(id) => window.__crsl.S.samples.filter((x) => x.user && x.user.rel && x.user.rel.of === id).sort((a, b) => a.user.rel.i - b.user.rel.i).map((x) => ({ id: x.id, name: x.name, path: x.path, rel: x.user.rel, kind: x.user.kind, cat: x.user.cat || null, dur: x.analysis && x.analysis.dur }))', orig()['id'])
    sel(LOOP)
    page.wait_for_selector('#shortp .shman', timeout=20000)
    page.select_option('#shortp select[data-sh="n"]', '4'); time.sleep(0.3)
    page.click('#shortp [data-act="sh-chip"][data-i="2"]'); time.sleep(0.15)
    page.click('#shortp [data-act="sh-chip"][data-i="3"]'); time.sleep(0.15)
    page.click('#shortp [data-act="sh-apply"]'); time.sleep(0.6)
    ok(orig()['keep'] == {'n': 4, 'sel': [0, 1]}, 'slices 1 y 2 de 4 elegidas')
    ok(page.locator('#shortp .shsplit').count() == 1 and page.locator('#shortp [data-act="sp-join"].on').count() == 1, '«Al exportar»: unidas en un sample (por defecto)')
    page.click('#shortp [data-act="sp-split"]'); time.sleep(0.6); wait_idle(page, 60); time.sleep(0.6)
    P = parts()
    ok(len(P) == 2 and orig()['split'] == [p['id'] for p in P], 'por separado: dos samples nuevos, relacionados con el original')
    ok(all(p['path'].startswith(('Parts/' if EN else 'Partes/') + 'Top Loop 128bpm/') for p in P) and [p['name'] for p in P] == ['Top Loop 128bpm 1.wav', 'Top Loop 128bpm 2.wav'], 'en Partes/Top Loop 128bpm/, numerados: ' + ', '.join(p['path'] for p in P))
    full = J('(n) => window.__crsl.S.samples.find((x) => x.name === n).analysis.dur', LOOP)
    ok(all(p['kind'] == 'loop' for p in P) and all(abs(p['dur'] - full / 4) < 0.02 for p in P), f'loops de un cuarto cada uno ({[round(p["dur"], 3) for p in P]} s de {round(full, 3)})')
    ok(P[0]['rel']['slice'] == 1 and P[1]['rel']['slice'] == 2, 'cada parte sabe de qué slice sale')
    # papel
    page.select_option(f'#shortp select.prole[data-part="{P[1]["id"]}"]', 'Fill'); time.sleep(0.4)
    ok(parts()[1]['rel']['role'] == 'Fill', 'la parte 2 pasa a ser «Fill»')
    # al pack: todo el grupo en pads seguidos
    J('(id) => window.__crsl.addToPack([id])', orig()['id']); time.sleep(0.5)
    sl = J('(ids) => { const p = window.__crsl.S.pack; return ids.map((id) => [p.slots.indexOf(id), p.names[p.slots.indexOf(id)]]); }', [p['id'] for p in parts()])
    ok(sl[0][0] >= 0 and sl[1][0] == sl[0][0] + 1, f'al pack: las dos partes en pads seguidos ({sl})')
    ok(sl[0][1] == 'Top Loop 128bpm 1' and sl[1][1] == 'Top Loop 128bpm ' + ('Fill'), 'con su nombre en el pack: ' + ' / '.join(x[1] for x in sl))
    ok(J('(id) => !window.__crsl.S.pack.slots.includes(id)', orig()['id']), 'el original no entra: van sus partes')
    J('(id) => window.__crsl.place(0, id)', orig()['id']); time.sleep(0.4)
    sl0 = J('(ids) => ids.map((id) => window.__crsl.S.pack.slots.indexOf(id))', [p['id'] for p in parts()])
    ok(sl0 == [0, 1], f'ponerlo en el pad 1 coloca sus partes en 1 y 2 ({sl0})')
    J('() => { const c = window.__crsl; c.S.view = "packs"; c.renderAll(); }'); time.sleep(0.4)
    ok(page.locator('.pad .plink').count() == 2, 'los pads muestran ⛓ 1/2 y ⛓ 2/2')
    # cambiar las slices: se vuelven a separar y el papel se conserva
    sel(LOOP); page.wait_for_selector('#shortp .shman', timeout=20000)
    page.click('#shortp [data-act="sh-chip"][data-i="3"]'); time.sleep(0.2)
    page.click('#shortp [data-act="sh-apply"]'); time.sleep(0.6); wait_idle(page, 60); time.sleep(0.6)
    P = parts()
    ok(len(P) == 3 and P[1]['rel']['role'] == 'Fill', 'slices 1, 2 y 4: tres partes, la 2 sigue siendo «Fill»')
    sl = J('(ids) => ids.map((id) => window.__crsl.S.pack.slots.indexOf(id))', [p['id'] for p in P])
    ok(sl == list(range(sl[0], sl[0] + 3)), f'y en el pack siguen juntas ({sl})')
    # ficha de una parte
    sel(P[1]['name'])
    ok(page.locator('#detail .path [data-act="sel"]').count() >= 3, 'la ficha de una parte lleva al original y a sus hermanas')
    # exportar el pack a la tarjeta: cada parte con su nombre
    names = J('() => window.__crsl.S.pack.names.filter(Boolean)')
    ok(('Top Loop 128bpm Fill') in names and 'Top Loop 128bpm 3' in names, 'nombres para la tarjeta: ' + ', '.join(n for n in names if 'Top Loop' in n))
    # unir otra vez
    sel(LOOP); page.wait_for_selector('#shortp .shsplit', timeout=20000)
    page.click('#shortp [data-act="sp-join"]'); time.sleep(0.6)
    ok(not parts() and not orig()['split'], '«Unidas en un sample»: las partes desaparecen')
    ok(J('(id) => window.__crsl.S.pack.slots.includes(id)', orig()['id']), 'y el original vuelve a su sitio en el pack')
    page.click('#shortp [data-act="sp-split"]'); time.sleep(0.6); wait_idle(page, 60); time.sleep(0.6)
    ok(len(parts()) == 3, 'se puede volver a separar')
    page.reload(); page.wait_for_selector('.tab'); time.sleep(1)
    ok(len(parts()) == 3 and orig()['split'], 'todo sigue al recargar')
    bad = [e for e in errors if 'favicon' not in e]
    ok(not bad, 'sin errores en la consola' + (': ' + ' | '.join(bad[:3]) if bad else ''))
    br.close()
print(f'\n{sum(c for c, _ in checks)} de {len(checks)} comprobaciones')
sys.exit(0 if all(c for c, _ in checks) else 1)
