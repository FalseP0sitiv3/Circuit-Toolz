"""v1.4: carpetas, etiquetas, palabras del nombre, Reanalizar por parecido, selección múltiple, dock, Ctrl K y canción por escenas.
Uso: python3 tests/org_ui.py dist/Circuit_Rhythm_Sample_Library.html /tmp/crsl_fixture"""
import base64, os, sys, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from browser_test import MOCK, wait_idle, wait_for

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
    sel = lambda name: J('(n) => { const { S } = window.__crsl; S.sel = S.samples.find((s) => s.name === n).id; S.libMode = "list"; S.view = "library"; window.__crsl.renderAll(); }', name)

    # 1. ficha: subcarpeta propuesta, aceptar con G, etiqueta de la paleta y propia
    sel('BD Dark 01.wav'); time.sleep(0.2)
    ok(page.locator('#detail .orgd').count() == 1, 'la ficha tiene «Carpeta y etiquetas»')
    ok(page.locator('#detail .orgd .chip2.prop').count() >= 1, 'subcarpeta propuesta resaltada')
    page.keyboard.press('g'); time.sleep(0.3)
    sub = J('() => { const { S } = window.__crsl; return S.byId[S.sel].user.sub; }')
    ok(bool(sub), f'G acepta la subcarpeta propuesta ({sub})')
    page.click('#detail [data-act="o-tag-tog"][data-v="Oscuro"]'); time.sleep(0.2)
    page.fill('#detail input.otag', 'Techno'); page.press('#detail input.otag', 'Enter'); time.sleep(0.3)
    tags = J('() => { const { S } = window.__crsl; return S.byId[S.sel].user.tags; }')
    ok(tags == ['Oscuro', 'Techno'], f'etiquetas de la paleta y propias ({tags})')
    ok(page.locator('.li.sel .why').inner_text().find('#2') >= 0, 'la fila muestra cuántas etiquetas tiene')

    # 2. filtros: etiqueta y palabras del nombre
    page.select_option('#ftag', 'Techno'); time.sleep(0.2)
    ok(page.locator('.li').count() == 1, 'filtro por etiqueta')
    page.select_option('#ftag', ''); time.sleep(0.2)
    ok(page.locator('.words .chip2').count() >= 1, 'chips con palabras frecuentes del nombre')
    w = page.locator('.words .chip2').first; wtxt = w.inner_text().split()[0]; w.click(); time.sleep(0.2)
    n = page.locator('.li').count()
    ok(n >= 2 and all(wtxt in x.lower() for x in page.locator('.li .nm').all_inner_texts()), f'filtro por la palabra «{wtxt}» ({n})')
    page.click('.words .chip2.on'); time.sleep(0.2)

    # 3. selección múltiple: etiqueta a varios
    page.click('.li >> nth=0'); page.click('.li >> nth=2', modifiers=['Shift']); time.sleep(0.2)
    page.click('[data-act="multi-org"]'); page.wait_for_selector('#modal.on')
    page.click('#modal [data-act="o-bulk-tag"][data-v="Reverb"]'); time.sleep(0.3)
    nr = J('() => window.__crsl.S.samples.filter((s) => (s.user.tags || []).includes("Reverb")).length')
    ok(nr == 3, f'etiqueta a la selección ({nr})')
    page.click('#modal [data-act="o-bulk-untag"][data-v="Reverb"]'); time.sleep(0.3)
    ok(J('() => window.__crsl.S.samples.filter((s) => (s.user.tags || []).includes("Reverb")).length') == 0, 'y quitarla')
    page.keyboard.press('Escape'); page.click('[data-act="multi-clear"]')

    # 4. Reanalizar: con 12 decididos propone por parecido; subcarpetas y efectos en bloque
    J('''() => { const { S, clsOf } = window.__crsl; let n = 0; for (const s of S.samples) { const c = clsOf(s); if (c.cat && n < 12 && !s.analysis?.error) { s.user.cat = c.cat; n++; } } S.ver++; S.learnVer++; }''')
    page.click('[data-act="o-mode"][data-v="rean"]'); time.sleep(0.4)
    ok(page.locator('.rean section').count() == 3, 'Reanalizar: parecido, subcarpetas y efectos')
    ok('12' in page.locator('.rean section >> nth=0').inner_text(), 'cuenta tus decisiones como referencias')
    ng = J('() => window.__crsl.S.samples.filter((s) => !s.user.cat).length')
    rows = page.locator('.otab tr').count()
    ok(rows <= ng, f'propuestas solo para los no decididos ({rows} de {ng})')
    if rows:
        page.click('.otab [data-act="o-kn-ok"] >> nth=0'); time.sleep(0.3)
        ok(J('() => window.__crsl.S.samples.some((s) => s.user.via === "similar")'), 'aceptar una propuesta por parecido')
    before = J('() => window.__crsl.S.samples.filter((s) => s.user.sub).length')
    if page.locator('[data-act="o-sub-allcats"]').count():
        page.click('[data-act="o-sub-allcats"]'); time.sleep(0.4)
    after = J('() => window.__crsl.S.samples.filter((s) => s.user.sub).length')
    ok(after > before, f'aceptar todas las subcarpetas ({before} → {after})')

    # 5. Carpetas y etiquetas: crear, renombrar y que «Ordenar en disco» las use
    page.click('[data-act="o-mode"][data-v="tax"]'); time.sleep(0.3)
    page.fill('.otaxnew[data-c="kick"]', 'Groovys'); page.press('.otaxnew[data-c="kick"]', 'Enter'); time.sleep(0.3)
    ok(J('() => window.__crsl.S.set.tax.kick.some((x) => x.label === "Groovys")'), 'nueva subcarpeta en Kick')
    inp = page.locator('.otax[data-c="kick"]').last; inp.fill('Groovy kicks'); inp.press('Enter'); time.sleep(0.3)
    ok(J('() => window.__crsl.S.set.tax.kick.some((x) => x.label === "Groovy kicks")'), 'renombrar la subcarpeta')
    page.fill('.opalnew[data-g="fx"]', 'Chorus'); page.press('.opalnew[data-g="fx"]', 'Enter'); time.sleep(0.3)
    ok(J('() => window.__crsl.S.set.tagPal.fx.includes("Chorus")'), 'paleta de etiquetas ampliable')
    page.click('.tab[data-view="data"]'); time.sleep(0.3)
    note = page.locator('#org-subs').count()
    ok(note == 1, 'Ordenar en disco: opción de subcarpetas')
    dests = J('() => { const ks = [...document.querySelectorAll(".panel .note")].map((e) => e.innerText).join(" "); return ks; }')
    ok('/' in dests or 'Kicks' in dests, 'el plan de carpetas incluye subcarpetas')

    # 6. dock en otra vista y «.»; elegir en el mapa lo abre en el sitio
    page.click('.tab[data-view="map"]'); time.sleep(0.4)
    page.keyboard.press('.'); time.sleep(0.2)
    ok(page.locator('#dock').count() == 1 and page.locator('body.docked').count() == 1, '«.» abre «Sample actual» fuera de la biblioteca')
    page.click('#dock [data-act="o-tag-tog"] >> nth=0') if page.locator('#dock [data-act="o-tag-tog"]').count() else None
    page.select_option('#dock-cat', 'perc'); time.sleep(0.3)
    ok(J('() => { const { S } = window.__crsl; return S.byId[S.sel].user.cat; }') == 'perc', 'categoría desde el dock')
    page.keyboard.press('.'); time.sleep(0.2)
    ok(page.locator('#dock').count() == 0, '«.» lo cierra')

    # 7. Ctrl K: ir a una vista y buscar un sample
    page.keyboard.press('Control+k'); page.wait_for_selector('#cpal.on')
    page.keyboard.type('packs'); time.sleep(0.2); page.keyboard.press('Enter'); time.sleep(0.3)
    ok(J('() => window.__crsl.S.view') == 'packs', 'Ctrl K → 04 Packs')
    page.keyboard.press('Control+k'); page.keyboard.type('Wide Pad'); time.sleep(0.2)
    ok(page.locator('.citem.smp').count() >= 1, 'Ctrl K encuentra samples por nombre')
    page.locator('.citem.smp').first.click(); time.sleep(0.3)
    ok(page.locator('#dock .dnm').inner_text().startswith('Wide Pad') and J('() => window.__crsl.S.view') == 'packs', 'el sample se abre en el dock, sin salir de Packs')
    page.keyboard.press('Control+k'); page.keyboard.press('Escape'); time.sleep(0.1)
    ok(not page.locator('#cpal.on').count(), 'Esc cierra la paleta')

    # 8. canción: escenas reales, copias en la hoja de ruta, reloj
    page.click('.tab[data-view="songs"]'); time.sleep(0.4)
    tl = J('() => { const tl = window.__crsl.curTimeline(); return { scenes: tl.scenes.length, bars: tl.bars, timers: tl.timers, cut: tl.cut.length }; }')
    ok(tl['scenes'] <= 16 and tl['scenes'] >= 8 and tl['cut'] == 0, f"plan de {tl['scenes']} escenas, {tl['bars']} compases")
    ok(page.locator('.t.rm tr.dup').count() >= 1, 'hoja de ruta con escenas copiadas (= N)')
    ok(page.locator('.arrsec').first.inner_text().find('–') >= 0 or tl['scenes'] == 9, 'cada sección dice qué escenas ocupa')
    ok(tl['timers'] and max(tl['timers']) == 8, 'reloj de 8 compases en el patrón 8')

    ok(not errors, 'sin errores en la consola' + ('' if not errors else ': ' + ' | '.join(errors[:3])))
    page.screenshot(path='/tmp/crsl_shots/14_org.png')
    br.close()
bad = [m for c, m in checks if not c]
print(f'\n{len(checks) - len(bad)} correctas, {len(bad)} con fallo'); sys.exit(1 if bad else 0)
