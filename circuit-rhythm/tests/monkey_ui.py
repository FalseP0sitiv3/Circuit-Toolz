"""Pulsa cada control de cada vista y cambia cada desplegable; cuenta errores de la página.
Uso: python3 tests/monkey_ui.py dist/Circuit_Rhythm_Sample_Library.html /tmp/crsl_fixture"""
import base64, os, sys, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from browser_test import MOCK, wait_idle  # noqa: E402  (reutiliza los simuladores)

HTML = os.path.abspath(sys.argv[1]); FIX = sys.argv[2]
SKIP = {'lang-switch', 'pt-rec', 'org-zip', 'org-dir', 'pt-rec-go', 'wipe', 'pack-del-ok', 'unlink-ok', 'unlink', 'link', 'pick-files', 'pick-dir', 'pick-pack', 'restore', 'exp-components', 'exp-sd', 'exp-sdzip', 'exp-wav', 'backup', 'busy-cancel', 'rescan', 'pack-walk', 'sg-audio'}
files = {}
root = os.path.join(FIX, 'Samples')
for d, _, fs in os.walk(root):
    for f in fs:
        p = os.path.join(d, f); files[os.path.relpath(p, root)] = base64.b64encode(open(p, 'rb').read()).decode()
errors = []; clicks = 0; selects = 0
with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required'])
    page = br.new_context(viewport={'width': 1440, 'height': 1000}).new_page()
    page.add_init_script(MOCK)
    page.on('pageerror', lambda e: errors.append(f'{view}/{act}: {e}'))
    view, act = 'init', ''
    page.goto('file://' + HTML); page.wait_for_selector('.tab')
    page.evaluate('([f]) => window.__pickQueue.push(window.__mkFS("Samples", f))', [files])
    page.click('[data-act="link"] >> nth=0'); time.sleep(0.5); wait_idle(page, 120)
    page.click('.tab[data-view="packs"]'); page.click('[data-act="pack-new"]'); page.select_option('#ab-cert', 'any'); page.click('[data-act="autobuild"]'); time.sleep(0.4)
    page.click('.tab[data-view="device"]'); page.click('[data-act="midi-connect"]'); time.sleep(0.3)
    for view in ['library', 'listen', 'map', 'packs', 'patterns', 'songs', 'device', 'data']:
        page.click(f'.tab[data-view="{view}"]'); time.sleep(0.2)
        if view == 'packs': page.click('.pad[data-i="0"]'); time.sleep(0.1)
        n = page.locator('[data-act]').count()
        for i in range(n):
            loc = page.locator('[data-act]').nth(i)
            try:
                act = loc.get_attribute('data-act', timeout=500)
                if act in SKIP or not loc.is_visible(): continue
                loc.click(timeout=1500); clicks += 1; time.sleep(0.05)
                page.keyboard.press('Escape')
                if page.evaluate('() => window.__crsl.S.view') != view: page.click(f'.tab[data-view="{view}"]'); time.sleep(0.1)
                if view == 'packs' and page.evaluate('() => window.__crsl.S.packSel') is None and page.locator('.pad[data-i="0"]').count(): page.click('.pad[data-i="0"]')
            except Exception as e:
                if 'Timeout' not in str(e) and 'detached' not in str(e) and 'not attached' not in str(e): errors.append(f'{view}/{act}: {e}')
        for sel in page.locator('select').all():
            try:
                if not sel.is_visible(): continue
                vals = sel.evaluate('e => [...e.options].map((o) => o.value)')
                sid = sel.get_attribute('id') or sel.get_attribute('data-rc') or sel.get_attribute('data-chan')
                for v in vals[:4]:
                    act = f'select {sid}={v}'; sel.select_option(v, timeout=1000); selects += 1; time.sleep(0.05)
            except Exception as e:
                if 'Timeout' not in str(e) and 'detached' not in str(e) and 'not attached' not in str(e): errors.append(f'{view}/{act}: {e}')
            if page.evaluate('() => window.__crsl.S.view') != view: page.click(f'.tab[data-view="{view}"]')
        # teclado en cada vista
        for k in ['Space', 'ArrowDown', 'ArrowRight', 'k', 'Enter', '3', 'f', 'r', 'r', 'Delete', 'Delete', 'Control+z', 'Escape']:
            act = 'key ' + k; page.keyboard.press(k); time.sleep(0.03)
    # v1.6: ficha de un loop (panel «Acortar») y 01 Biblioteca → Acortar loops
    def back():
        page.evaluate('(m) => { const { S } = window.__crsl; S.view = "library"; S.libMode = m; window.__crsl.renderAll(); }', MODE[0]); time.sleep(0.15)
    MODE = ['list']
    def sweep_here(view):
        global clicks, act
        n = page.locator('[data-act]').count()
        for i in range(n):
            loc = page.locator('[data-act]').nth(i)
            try:
                act = loc.get_attribute('data-act', timeout=500)
                if act in SKIP or act in ('o-mode', 'tab', 'trash-del', 'del-sample') or not loc.is_visible(): continue
                loc.click(timeout=1500); clicks += 1; time.sleep(0.05); page.keyboard.press('Escape')
                if page.evaluate('() => window.__crsl.S.view') != 'library' or page.locator('.libmodes').count() == 0: back()
            except Exception as e:
                if 'Timeout' not in str(e) and 'detached' not in str(e) and 'not attached' not in str(e): errors.append(f'{view}/{act}: {e}')
    loops = page.evaluate('() => { const { S, clsOf } = window.__crsl; return S.samples.filter((s) => ["dloop", "mloop"].includes(clsOf(s).cat) && !(s.analysis || {}).error).map((s) => s.name).slice(0, 2); }')
    if not loops: errors.append('extensión: no quedan loops en la biblioteca')
    for name in loops:
        view = 'ficha ' + name
        page.click('.tab[data-view="library"]'); page.click('[data-act="o-mode"][data-v="list"]')
        page.evaluate('(n) => { const { S } = window.__crsl; S.sel = S.samples.find((s) => s.name === n).id; window.__crsl.renderAll(); }', name); time.sleep(1.0)
        for _ in range(3):
            if not page.evaluate('(n) => window.__crsl.S.samples.some((s) => s.name === n)', name): break
            page.evaluate('(n) => { const { S } = window.__crsl; S.sel = S.samples.find((s) => s.name === n).id; S.libMode = "list"; S.view = "library"; window.__crsl.renderAll(); }', name); time.sleep(0.3)
            if page.locator('#shortp').count() == 0: errors.append(f'{view}: sin panel Acortar'); break
            sweep_here(view)
            for sel in page.locator('#shortp select, #shortp input').all():
                try:
                    if sel.evaluate('e => e.tagName') == 'SELECT':
                        for v in sel.evaluate('e => [...e.options].map((o) => o.value)')[:4]: act = 'select n=' + v; sel.select_option(v, timeout=1000); time.sleep(0.05)
                    else: act = 'txt'; sel.fill('2 1, 3'); sel.press('Tab'); time.sleep(0.1)
                except Exception as e:
                    if 'Timeout' not in str(e) and 'detached' not in str(e) and 'not attached' not in str(e): errors.append(f'{view}/{act}: {e}')
    view = 'biblioteca short'; MODE[0] = 'short'; back()
    if page.locator('[data-act="sh-scan"]:not([disabled])').count(): page.click('[data-act="sh-scan"]'); time.sleep(2.0)
    for _ in range(2):
        sweep_here(view)
        for sel in page.locator('.shortmode select').all():
            try:
                for v in sel.evaluate('e => [...e.options].map((o) => o.value)')[:3]: act = 'pick ' + v; sel.select_option(v, timeout=1000); time.sleep(0.05)
            except Exception as e:
                if 'Timeout' not in str(e) and 'detached' not in str(e) and 'not attached' not in str(e): errors.append(f'{view}/{act}: {e}')
        back()
    br.close()
print(f'{clicks} clics, {selects} cambios de desplegable, {len(errors)} errores')
for e in errors[:20]: print('  ', e)
sys.exit(1 if errors else 0)
