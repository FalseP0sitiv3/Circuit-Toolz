"""v1.5: Supr elimina (a la papelera) y pasa al siguiente, Ctrl Z deshace, Mayús Supr descarta, la papelera recupera con su slot,
lo eliminado no vuelve al releer la carpeta, vaciar puede borrar el archivo del disco, ? muestra los atajos y Alt+1 pone una etiqueta.
Uso: python3 tests/trash_ui.py dist/Circuit_Rhythm_Sample_Library.html /tmp/crsl_fixture"""
import base64, os, sys, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from browser_test import MOCK, wait_idle
HTML = os.path.abspath(sys.argv[1]); FIX = sys.argv[2]
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
    ctx = br.new_context(viewport={'width': 1440, 'height': 1000}); ctx.add_init_script(MOCK)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    page.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
    page.goto('file://' + HTML); page.wait_for_selector('.tab')
    page.evaluate('([f]) => { window.__fs = window.__mkFS("Samples", f); window.__pickQueue.push(window.__fs); }', [files])
    page.click('[data-act="link"] >> nth=0'); time.sleep(0.5); wait_idle(page, 120)
    J = page.evaluate
    n0 = J('() => window.__crsl.S.samples.length')
    # pack con todo, para ver que se recupera el slot
    page.click('.tab[data-view="packs"]'); page.click('[data-act="pack-new"]'); page.select_option('#ab-cert', 'any'); page.click('[data-act="autobuild"]'); time.sleep(0.4)
    # Escucha
    page.click('.tab[data-view="listen"]'); page.check('input[name="lsrc"][value="all"]'); time.sleep(0.3)
    q = J('() => { const L = window.__crsl.S.listen; return [L.queue[L.i], L.queue[L.i + 1]]; }')
    inpack = J('(id) => window.__crsl.S.pack.slots.indexOf(id)', q[0])
    page.keyboard.press('Delete'); time.sleep(0.4)
    ok(J('() => window.__crsl.S.samples.length') == n0 - 1 and page.locator('#modal.on').count() == 0, 'Supr elimina sin preguntar')
    ok(J('() => { const L = window.__crsl.S.listen; return L.queue[L.i]; }') == q[1], '…y pasa al siguiente')
    ok(page.locator('.toast [data-act="trash-undo"]').count() == 1, 'aviso con «Deshacer»')
    ok(J('(id) => !window.__crsl.S.pack.slots.includes(id)', q[0]), 'sale del pack')
    page.screenshot(path='/tmp/crsl_shots/15_eliminar.png')
    page.keyboard.press('Control+z'); time.sleep(0.4)
    ok(J('() => window.__crsl.S.samples.length') == n0 and J('() => { const L = window.__crsl.S.listen; return L.queue[L.i]; }') == q[0], 'Ctrl Z lo recupera en su sitio de la cola')
    ok(inpack < 0 or J('(id) => window.__crsl.S.pack.slots.indexOf(id)', q[0]) == inpack, 'y vuelve a su slot del pack')
    page.keyboard.press('Shift+Delete'); time.sleep(0.3)
    ok(J('(id) => window.__crsl.S.byId[id].user.discard === true', q[0]) and J('() => window.__crsl.S.samples.length') == n0, 'Mayús Supr solo descarta')
    qt = J('() => { const p = window.__crsl.S.set.tagPal; return (p && p.fx && p.fx[0]) || "Reverb"; }')
    page.keyboard.press('Alt+1'); time.sleep(0.3)
    ok(qt in (J('(id) => window.__crsl.S.byId[id].user.tags || []', q[0])), 'Alt+1 pone la primera etiqueta rápida')
    ok(page.locator('.orgd .quick .chip2').count() == 9, 'etiquetas rápidas numeradas en Escucha')
    # biblioteca: Supr sobre una selección
    page.click('.tab[data-view="library"]'); time.sleep(0.3)
    page.click('.li >> nth=1'); page.click('.li >> nth=2', modifiers=['Shift']); time.sleep(0.2)
    names = J('() => [...window.__crsl.S.multi].map((id) => window.__crsl.S.byId[id].src.rel)')
    page.keyboard.press('Delete'); time.sleep(0.4)
    ok(J('() => window.__crsl.S.samples.length') == n0 - 2 and J('() => window.__crsl.trashCount()') == 2, 'Supr en la biblioteca elimina la selección')
    # releer la carpeta no los trae de vuelta
    J('async () => { const { S, scanRoot } = window.__crsl; await scanRoot([...S.roots.values()][0]); }'); time.sleep(0.5); wait_idle(page, 60)
    ok(J('() => window.__crsl.S.samples.length') == n0 - 2, 'al releer la carpeta no vuelven')
    # papelera
    page.click('[data-act="o-mode"][data-v="trash"]'); time.sleep(0.3)
    ok(page.locator('[data-act="trash-restore"]').count() == 1, 'Papelera con la eliminación')
    page.screenshot(path='/tmp/crsl_shots/16_papelera.png', full_page=True)
    page.click('[data-act="trash-empty"]'); page.wait_for_selector('#modal.on')
    ok(page.locator('#purge-files').count() == 1, 'ofrece borrar también los archivos del disco')
    page.check('#purge-files'); page.click('[data-act="trash-purge-ok"]'); time.sleep(0.5)
    gone = J('(rels) => rels.map((r) => { let d = window.__fs; const s = r.split("/"); for (const x of s.slice(0, -1)) d = d.children.get(x); return d.children.has(s.at(-1)); })', names)
    ok(J('() => window.__crsl.trashCount()') == 0 and not any(gone), f'vaciar: fuera de la papelera y del disco ({gone})')
    # ? atajos
    page.keyboard.press('?'); time.sleep(0.2)
    ok(page.locator('#modal .keyshelp h4').count() == 4, '? muestra los atajos')
    page.screenshot(path='/tmp/crsl_shots/17_atajos.png'); page.keyboard.press('Escape')
    ok(not errors, 'sin errores en la consola' + ('' if not errors else ': ' + ' | '.join(errors[:3])))
    br.close()
bad = [m for c, m in checks if not c]
print(f'\n{len(checks) - len(bad)} correctas, {len(bad)} con fallo'); sys.exit(1 if bad else 0)
