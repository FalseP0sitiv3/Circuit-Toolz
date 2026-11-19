"""Recorrido exhaustivo: pulsa cada control [data-act] de cada vista con una colección real y un Circuit Tracks SIMULADO.
Registra errores de JavaScript y de consola por vista y acción. No valida hardware ni sonido.
Uso: python3 tests/monkey_ui.py CARPETA_DE_PATCHES"""
import sys, os, re, time, threading, http.server, functools, json
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
src = open(os.path.join(ROOT, 'tests', 'browser_test.py')).read()
FAKE_MIDI = re.search(r'FAKE_MIDI = """(.*?)"""', src, re.S).group(1)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8772), functools.partial(Q, directory=os.path.join(ROOT, 'dist'))); threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:8772/' + os.environ.get('CT_HTML', 'Circuit_Tracks_Patch_Library_Editor.html')
# acciones que borran, abren selectores del sistema o cambian de vista (se prueban aparte)
SKIP = {'orgTab', 'regView', 'regOpen', 'palOpen', 'resetLib', 'wipe', 'chgDrop', 'chgDropAll', 'patDel', 'deleteSel', 'delColl', 'delBank', 'delTpl', 'restore', 'importFiles', 'importDir', 'planWrite', 'toDisk', 'exportDir', 'view', 'pick', 'regFixAll', 'bulkDelete', 'discardVariant', 'rmRule'}
errors = []; log = []
def run(folder):
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'])
        ctx = b.new_context(viewport={'width': 1500, 'height': 980}, accept_downloads=True); ctx.add_init_script(FAKE_MIDI)
        pg = ctx.new_page(); cur = {'where': 'inicio'}
        pg.on('pageerror', lambda e: errors.append((cur['where'], 'pageerror', str(e)[:300])))
        pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append((cur['where'], 'console', m.text[:300])))
        pg.on('filechooser', lambda fc: None); downloads = []; pg.on('download', lambda d: downloads.append(d.suggested_filename))
        pg.on('dialog', lambda d: d.dismiss())
        pg.goto(URL); pg.wait_for_timeout(500)
        t0 = time.time(); pg.set_input_files('#dirIn', folder); pg.wait_for_selector('.modal', timeout=120000); pg.click('.modal .btn'); log.append(f'importación {time.time()-t0:.1f}s, {pg.evaluate("window.__ctpl.lib.patches.length")} patches')
        # conectar el equipo simulado
        pg.click('.tabs-main button[data-v="device"]'); pg.wait_for_timeout(300)
        if pg.locator('[data-act="midiConnect"]').count(): pg.click('[data-act="midiConnect"]'); pg.wait_for_timeout(800)
        log.append('equipo: ' + ('conectado' if pg.evaluate("!!window.__ctpl.S.dev.session") else 'NO conectado'))
        pg.evaluate("(()=>{const S=window.__ctpl.S,L=window.__ctpl.lib;S.sel=L.patches.find(p=>p.kind!=='variant'&&L.info(p).macros.knobs.some(k=>k.activeCount)).id;})()")
        def close_modals():
            for _ in range(3):
                if not pg.locator('.modal').count(): return
                btns = pg.locator('.modal .mfoot .btn')
                n = btns.count()
                if n == 0: pg.keyboard.press('Escape'); pg.locator('.modal').first.evaluate('m=>m.remove()') if pg.locator('.modal').count() else None; continue
                # preferir Cancelar/Cerrar (botón no primario ni peligroso)
                idx = 0
                for i in range(n):
                    cls = btns.nth(i).get_attribute('class') or ''
                    if 'danger' not in cls and 'primary' not in cls: idx = i; break
                btns.nth(idx).click(timeout=2000); pg.wait_for_timeout(120)
        def sweep(view, setup=None, label=None):
            name = label or view
            pg.evaluate(f"window.__ctpl.S.view='{view}'"); pg.evaluate("window.__ctpl.A.view({dataset:{v:window.__ctpl.S.view}})")
            if setup: pg.evaluate(setup); pg.evaluate("window.__ctpl.A.view({dataset:{v:window.__ctpl.S.view}})")
            pg.wait_for_timeout(250)
            seen = {}; clicks = 0
            for rnd in range(400):
                items = pg.evaluate("""() => [...document.querySelectorAll('.main [data-act], .top [data-act], .tabs-main [data-act]')].filter(e => e.offsetParent !== null && !e.disabled).map((e, i) => { e.setAttribute('data-mk', i); return {i, act: e.dataset.act, tag: e.tagName, sig: e.dataset.act + '|' + JSON.stringify(Object.fromEntries(Object.entries(e.dataset).filter(([k]) => !['act','id','mk'].includes(k)))) }; })""")
                todo = [it for it in items if it['act'] not in SKIP and seen.get(it['sig'], 0) < 1 and sum(1 for k, v in seen.items() if k.startswith(it['act'] + '|')) < 4]
                if not todo: break
                it = todo[0]; seen[it['sig']] = seen.get(it['sig'], 0) + 1
                cur['where'] = f'{name} › {it["act"]}'
                el = pg.locator(f'[data-mk="{it["i"]}"]').first
                try:
                    if it['tag'] == 'SELECT':
                        opts = el.evaluate("e => [...e.options].map(o => o.value)")
                        if len(opts) > 1: el.select_option(opts[1] if opts[0] == el.input_value() else opts[0], timeout=2000)
                    elif it['tag'] == 'INPUT':
                        t = el.get_attribute('type') or 'text'
                        if t in ('checkbox', 'radio'): el.click(timeout=2000)
                        elif t == 'range': el.evaluate("e => { e.value = Math.round((+e.min + +e.max) / 2); e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true})); }")
                        elif t == 'file': pass
                        else: el.fill('5', timeout=2000); el.dispatch_event('change')
                    else:
                        el.click(timeout=2500)
                    clicks += 1
                except Exception as e:
                    msg = str(e).split('\n')[0]
                    if 'expect_download' not in msg and 'Timeout' not in msg: errors.append((cur['where'], 'playwright', msg[:200]))
                pg.wait_for_timeout(120); close_modals()
                # volver a la vista si la acción navegó
                if pg.evaluate("window.__ctpl.S.view") != view:
                    pg.evaluate(f"window.__ctpl.S.view='{view}'"); pg.evaluate("window.__ctpl.A.view({dataset:{v:window.__ctpl.S.view}})")
                    if setup: pg.evaluate(setup); pg.evaluate("window.__ctpl.A.view({dataset:{v:window.__ctpl.S.view}})")
                    pg.wait_for_timeout(150)
            log.append(f'{name}: {clicks} controles probados')
            pg.evaluate("window.__ctpl.S.dev.session && window.__ctpl.S.dev.session.stopAll()")
        sel = "window.__ctpl.S.sel=window.__ctpl.S.sel||window.__ctpl.lib.patches[0].id;"
        for ct in ['anatomy', 'params', 'macros', 'compare', 'history']: sweep('library', sel + f"window.__ctpl.S.ctab='{ct}'", f'biblioteca/{ct}')
        # también sobre una variante (controles de edición)
        pg.evaluate("(async()=>{const L=window.__ctpl.lib,S=window.__ctpl.S;const o=L.patches.find(p=>p.kind!=='variant');const v=await L.createVariant(o.id,o.payload,'edit','monkey','');S.sel=v.id;})()"); pg.wait_for_timeout(300)
        for ct in ['anatomy', 'params', 'macros']: sweep('library', f"window.__ctpl.S.ctab='{ct}';window.__ctpl.S.editing=true;", f'biblioteca(variante)/{ct}')
        sweep('audition'); sweep('patterns'); sweep('songs'); sweep('patterns', "window.__ctpl.S.patMode='drum';window.__ctpl.S.pat=null;", 'patrones/batería')
        for t in ['rean', 'folders', 'arch', 'register', 'dups', 'disk']: sweep('organize', f"window.__ctpl.S.orgTab='{t}';window.__ctpl.S.regView='plan'", f'organizar/{t}')
        sweep('organize', "window.__ctpl.S.orgTab='register';window.__ctpl.S.regView='detail';window.__ctpl.S.regCat='bass'", 'organizar/octava detalle')
        sweep('organize', "window.__ctpl.S.orgTab='register';window.__ctpl.S.regView='review'", 'organizar/octava revisión')
        sweep('macros'); sweep('changes')
        sweep('analyze')
        sweep('banks'); sweep('device')
        for g in ['family', 'category', 'folder', 'architecture']: sweep('data', f"window.__ctpl.S.groupBy='{g}';window.__ctpl.S.rowsKey='';", f'datos (lista agrupada: {g})')
        log.append(f'descargas: {len(downloads)} ({", ".join(sorted(set(x.rsplit(".",1)[-1] for x in downloads)))})')
        # biblioteca nueva al final (destructiva), con confirmación correcta
        cur['where'] = 'datos › resetLib'
        pg.evaluate("window.__ctpl.S.view='data'"); pg.evaluate("window.__ctpl.A.view({dataset:{v:'data'}})"); pg.wait_for_timeout(200)
        pg.click('[data-act="resetLib"]'); pg.fill('#rsConfirm', 'borrar'); pg.click('.modal .btn.danger'); pg.wait_for_timeout(800)
        log.append(f'biblioteca nueva: {pg.evaluate("window.__ctpl.lib.patches.length")} patches tras borrar')
        pg.reload(); pg.wait_for_timeout(800)
        log.append(f'tras recargar: {pg.evaluate("window.__ctpl.lib.patches.length")} patches · plantillas {pg.evaluate("(window.__ctpl.lib.settings.templates||[]).length")}')
        for v in ['library', 'audition', 'patterns', 'organize', 'macros', 'changes', 'analyze', 'banks', 'device', 'data']:
            cur['where'] = f'vacía › {v}'; pg.evaluate(f"window.__ctpl.A.view({{dataset:{{v:'{v}'}}}})"); pg.wait_for_timeout(150)
        b.close()
run(sys.argv[1])
print('\n'.join(log))
print(f'\nERRORES: {len(errors)}')
seen = set()
for w, k, m in errors:
    key = (w, m[:80])
    if key in seen: continue
    seen.add(key); print(f'- [{w}] {k}: {m}')
