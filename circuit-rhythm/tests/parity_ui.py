"""v2.1: lo traído de la herramienta de Tracks (grupos en el mapa, colecciones, CSV de la lista) y el apoyo y el idioma visibles.
Uso: python3 tests/parity_ui.py dist/Circuit_Rhythm_Sample_Library.html /tmp/crsl_fixture"""
import base64, csv, io, os, sys, time
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
    J = lambda js, *a: page.evaluate(js, *a)

    # 1. idioma y apoyo, visibles
    cur, other = ('EN', 'ES') if EN else ('ES', 'EN')
    sw = page.locator('#status .langsw.hdr')
    ok(sw.count() == 1 and sw.locator('.on').inner_text() == cur and sw.locator('a').inner_text() == other, f'selector de idioma en la cabecera ({cur} marcado, {other} enlace)')
    href = sw.locator('a').get_attribute('href')
    ok(href.endswith('_EN.html') != EN and sw.locator('a').get_attribute('hreflang') == other.lower(), f'el enlace lleva al otro archivo ({href})')
    sup = page.locator('#foot a.support')
    fs = float(sup.evaluate('(e) => parseFloat(getComputedStyle(e).fontSize)')) if sup.count() else 0
    ok(sup.count() == 1 and fs >= 15 and 'ko-fi.com/falsepositive' in sup.get_attribute('href'), f'«Apoyar el proyecto» como botón de {fs:.0f} px')
    ok(page.locator('#foot .langsw').count() == 1, 'y el selector de idioma también en el pie')
    # autoría: © en el pie, huella en Acerca de, cabecera y marca invisible coherentes
    org = J('() => window.__crsl.origin')
    head = J('() => ([...document.childNodes].find((n) => n.nodeType === 8) || {}).data || ""')
    ok('© 2026 FalsePositive' in page.locator('#foot').inner_text() and org['author'] == 'FalsePositive', '© FalsePositive en el pie')
    ok(('fingerprint ' + org['fp']) in head and 'GPL-3.0' in head, f'comentario de cabecera con la huella {org["fp"]}')
    ok(J('() => /\u2060[\u200b\u200c]{64,}\u2060/.test(document.body.textContent)'), 'marca invisible en el texto de la página')
    page.click('#foot [data-act="about"]'); page.wait_for_selector('#fp')
    ok(page.locator('#fp').inner_text() == org['fp'], 'Acerca de muestra la misma huella')
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    if page.locator('#fp').count(): page.evaluate('() => document.querySelector("#fp").closest(".modal, .ov, dialog, .overlay")?.remove()')

    page.evaluate('([f]) => window.__pickQueue.push(window.__mkFS("Samples", f))', [files])
    page.click('[data-act="link"] >> nth=0'); time.sleep(0.5); wait_idle(page, 120)

    # 2. grupos de sonidos parecidos en el mapa
    page.click('.tab[data-view="map"]'); time.sleep(0.4)
    gb = page.locator('[data-act="map-group"]')
    ok(gb.count() >= 2, f'{gb.count()} grupos de sonidos parecidos')
    sizes = [int(x.locator('.mono').inner_text()) for x in gb.all()]
    total = J('() => window.__crsl.S.samples.filter((s) => s.analysis && s.analysis.bands && !s.user.discard).length')
    ok(sum(sizes) == total, f'cubren todos los samples del mapa ({sum(sizes)} = {total})')
    gb.first.click(); time.sleep(0.3)
    ok(J('() => window.__crsl.S.multi.size') == sizes[0], f'pulsar un grupo lo selecciona ({sizes[0]})')
    page.select_option('#mapcolor', 'group'); time.sleep(0.3)
    ok(J('() => window.__crsl.S.mapColor') == 'group', 'color por grupo en el mapa')

    # 3. colecciones
    J('() => { const c = window.__crsl; c.S.multi.clear(); c.S.view = "library"; c.S.libMode = "list"; c.S.f = { ...c.S.f, q: "", cat: "kick", cert: "all", flag: "all", tag: "", sub: "", words: [], kind: "" }; c.renderAll(); }'); time.sleep(0.3)
    nk = page.locator('.li').count()
    page.select_option('#fcoll', '__save'); page.wait_for_selector('#modal.on')
    page.fill('#coll-name', 'Bombos'); page.click('#modal [data-act="coll-save"]'); time.sleep(0.3)
    ok(J('() => (window.__crsl.S.set.colls || []).length') == 1, 'guardar el filtro actual como colección')
    J('() => { const c = window.__crsl; c.S.f = { ...c.S.f, cat: "all" }; c.renderAll(); }'); time.sleep(0.3)
    nall = page.locator('.li').count()
    cid = J('() => window.__crsl.S.set.colls[0].id')
    page.select_option('#fcoll', cid); time.sleep(0.3)
    ok(J('() => window.__crsl.S.f.cat') == 'kick' and page.locator('.li').count() == nk and nk < nall, f'elegirla vuelve al filtro ({nk} de {nall})')
    ok(page.locator('#fcoll option:checked').inner_text().endswith('Bombos'), 'y el desplegable la muestra activa')
    page.reload(); page.wait_for_selector('.tab'); time.sleep(0.6)
    ok(J('() => (window.__crsl.S.set.colls || []).map((c) => c.name)') == ['Bombos'], 'sigue ahí al recargar')
    J('() => { const c = window.__crsl; c.S.view = "library"; c.S.libMode = "list"; c.S.f = { ...c.S.f, ...c.S.set.colls[0].f }; c.renderAll(); }'); time.sleep(0.3)
    page.select_option('#fcoll', '__del'); time.sleep(0.3)
    ok(J('() => (window.__crsl.S.set.colls || []).length') == 0 and J('() => window.__crsl.S.f.cat') == 'kick', 'borrarla deja el filtro puesto')

    # 4. CSV de la lista filtrada
    with page.expect_download() as d: page.click('[data-act="lib-csv"]')
    rows = list(csv.reader(io.StringIO(open(d.value.path(), encoding='utf-8-sig').read())))
    ok(rows[0][:6] == ['path', 'name', 'category', 'certainty', 'subfolder', 'type'] and 'measured' in rows[0], 'CSV con cabecera: ' + ', '.join(rows[0][:8]) + '…')
    ok(len(rows) - 1 == page.locator('.li').count() and all(r[2] == 'kick' for r in rows[1:]), f'una fila por sample de la lista filtrada ({len(rows) - 1})')

    bad = [e for e in errors if 'favicon' not in e]
    ok(not bad, 'sin errores en la consola' + (': ' + ' | '.join(bad[:3]) if bad else ''))
    br.close()
n = sum(1 for c, _ in checks if c)
print(f'\n{n} de {len(checks)} comprobaciones')
sys.exit(0 if n == len(checks) else 1)
