"""v1.7: conservar lo detectado al decidir, loop / one-shot en cualquier categoría, reanalizar, exportar un sample
y Ordenar en disco con todo lo marcado.
Uso: python3 tests/kind_ui.py dist/Circuit_Rhythm_Sample_Library.html /tmp/crsl_fixture"""
import base64, io, os, sys, time, wave, zipfile, csv
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
    names = J('() => window.__crsl.S.samples.map((s) => s.name)')
    def sel(name):
        J('(n) => { const { S } = window.__crsl; S.sel = S.samples.find((s) => s.name === n).id; S.libMode = "list"; S.view = "library"; S.f = { ...S.f, q: "", cat: "all", cert: "all", flag: "all", tag: "", sub: "", words: [], kind: "" }; window.__crsl.renderAll(); }', name)
        time.sleep(0.15)
    user = lambda: J('() => { const { S } = window.__crsl; return S.byId[S.sel].user; }')

    # 1. decidir otra categoría: lo detectado no se pierde y la explicación sigue ahí
    target = None
    for n in names:
        sel(n)
        det = page.locator('#detail [data-act="o-tag-add"]').count()
        if det and not user().get('cat'): target = (n, det, page.locator('#detail [data-act="o-tag-add"]').evaluate_all('(b) => b.map((x) => x.dataset.v)')); break
    ok(target is not None, f'hay un sample con etiquetas detectadas ({target and target[0]})')
    n, det, detTags = target
    autoCat = J('() => { const { S, clsOf } = window.__crsl; return clsOf(S.byId[S.sel]).cat; }')
    other = 'x' if autoCat != 'fx' else 'v'
    before_lines = page.locator('#detail .why-list li').count()
    page.keyboard.press(other); time.sleep(0.3)
    u = user()
    ok(u.get('cat') in ('fx', 'vox') and u.get('cat') != autoCat, f'decide otra categoría ({autoCat} → {u.get("cat")})')
    ok(all(x in (u.get('tags') or []) for x in detTags), f'las etiquetas detectadas pasan a ser tuyas ({detTags} → {u.get("tags")})')
    ok(page.locator('#detail .why-list li').count() >= before_lines, 'las líneas Nombre / Carpeta / Sonido siguen ahí')
    proposed = 'the tool suggested' if EN else 'la herramienta proponía'
    ok(proposed in page.locator('#detail .why-list').inner_text(), 'dice qué proponía la herramienta')
    # con la opción desactivada no se añaden
    J('() => { window.__crsl.S.set.keepDet = false; }')
    n2 = None
    for m in names:
        if m == n: continue
        sel(m)
        if page.locator('#detail [data-act="o-tag-add"]').count() and not user().get('cat'): n2 = m; break
    if n2:
        page.keyboard.press('x' if J('() => { const { S, clsOf } = window.__crsl; return clsOf(S.byId[S.sel]).cat; }') != 'fx' else 'v'); time.sleep(0.3)
        ok(not user().get('tags'), f'sin la opción, no se añaden solas ({n2})')
    J('() => { window.__crsl.S.set.keepDet = true; }')

    # 2. loop / one-shot
    loopName = next(x for x in names if 'Acid Loop' in x)
    sel(loopName)
    on = lambda: page.locator('#detail .kindrow .seg button.on').inner_text().strip()
    ok(on() == 'Loop', f'«Acid Loop» sale como loop ({on()})')
    kick = next(x for x in names if x.lower().startswith('bd') or 'kick' in x.lower())
    sel(kick)
    ok(on() == 'One-shot', f'«{kick}» sale como one-shot')
    page.keyboard.press('w'); time.sleep(0.3)
    ok(user().get('kind') == 'loop' and on() == 'Loop', 'W lo marca como loop, aunque sea un kick')
    ok('⟳' in page.locator('.li.sel .fl').inner_text(), 'la lista lo marca con ⟳')
    page.select_option('#fkind', 'loop'); time.sleep(0.2)
    loops = page.locator('.li .nm').all_inner_texts()
    ok(any(kick.rsplit('.', 1)[0] in x for x in loops) and any('Acid Loop' in x for x in loops), f'filtro «Solo loops» ({len(loops)})')
    page.select_option('#fkind', 'oneshot'); time.sleep(0.2)
    ok(not any('Acid Loop' in x for x in page.locator('.li .nm').all_inner_texts()), 'filtro «Solo one-shots»')
    page.select_option('#fkind', ''); time.sleep(0.2)
    sel(kick); page.click('#detail [data-act="kind-auto"]'); time.sleep(0.3)
    ok('kind' not in user() and on() == 'One-shot', 'volver a automático')

    # 3. reanalizar
    sel(loopName)
    J('() => { const { S } = window.__crsl; S.byId[S.sel].analysis.loopBpm = 1; }')
    page.click('#detail [data-act="s-reanalyze"]'); time.sleep(1.0)
    bpm = J('() => { const { S } = window.__crsl; return S.byId[S.sel].analysis.loopBpm; }')
    ok(bpm and bpm > 100, f'Reanalizar vuelve a medir ({bpm} BPM)')
    ok(page.locator('#toast .toast').count() >= 1 and ('Re-analysed' if EN else 'Reanalizado') in page.locator('#toast').inner_text(), 'y lo dice')

    # 4. exportar un sample: entero o en slices, para la Rhythm o como el original (v1.8)
    def exp(fmt, n, act='s-exp-go'):
        page.click('#detail [data-act="s-exp"]'); page.wait_for_selector('#modal.on')
        page.check(f'#modal input[name="exfmt"][value="{fmt}"]')
        page.click(f'#modal [data-act="s-exp-n"][data-v="{n}"]'); time.sleep(0.1)
        with page.expect_download() as d: page.click(f'#modal [data-act="{act}"]')
        return d.value
    rel = J('() => { const { S } = window.__crsl; return S.byId[S.sel].path; }').split('/', 1)[1]
    src = open(os.path.join(root, rel), 'rb').read(); sw = wave.open(io.BytesIO(src)); sframes = sw.readframes(sw.getnframes())
    dl = exp('rhythm', 1); w = wave.open(io.BytesIO(open(dl.path(), 'rb').read()))
    ok(dl.suggested_filename.endswith('(48k mono).wav') and w.getframerate() == 48000 and w.getnchannels() == 1 and w.getsampwidth() == 2, f'entero para la Rhythm: {dl.suggested_filename} · {w.getframerate()} Hz · {w.getnchannels()} canal')
    dl = exp('rhythm', 1, 's-exp-orig')
    ok(open(dl.path(), 'rb').read() == src, 'el archivo original tal cual, idéntico')
    J('() => { const { S } = window.__crsl; S.byId[S.sel].recipe = { ...(S.byId[S.sel].recipe || {}), autoTrim: false, trimStart: null, trimEnd: null, fitSec: null }; }')
    dl = exp('orig', 4); z = zipfile.ZipFile(dl.path()); nl = sorted(z.namelist())
    ws = [wave.open(io.BytesIO(z.read(x))) for x in nl]
    ok(len(nl) == 4 and nl[0].endswith(' 01.wav') and nl[3].endswith(' 04.wav'), f'4 slices numeradas en un ZIP ({dl.suggested_filename})')
    ok(all(x.getframerate() == sw.getframerate() and x.getnchannels() == sw.getnchannels() and x.getsampwidth() == sw.getsampwidth() for x in ws), f'como el original: {sw.getframerate()} Hz · {sw.getnchannels()} canal · {8 * sw.getsampwidth()} bit')
    frames = [x.readframes(x.getnframes()) for x in ws]
    ok(sum(len(f) for f in frames) == len(sframes), 'las 4 suman el archivo entero')
    bpf = sw.getsampwidth() * sw.getnchannels(); fade = int(0.002 * sw.getframerate()) + 1
    mid = frames[1][fade * bpf: -fade * bpf]; off = len(frames[0]) + fade * bpf
    ok(mid == sframes[off: off + len(mid)], 'y fuera de los fundidos de 2 ms, idénticas al original byte a byte')
    dl = exp('rhythm', 8); z = zipfile.ZipFile(dl.path()); ws = [wave.open(io.BytesIO(z.read(x))) for x in z.namelist()]
    ok(len(ws) == 8 and all(x.getframerate() == 48000 and x.getnchannels() == 1 for x in ws), f'8 slices para la Rhythm, 48 kHz mono ({dl.suggested_filename})')
    page.click('#detail [data-act="s-exp"]'); page.wait_for_selector('#modal.on')
    ok(page.locator('#modal [data-act="s-exp-n"].on').inner_text() == '8' and page.locator('#modal input[value="rhythm"]').is_checked(), 'recuerda el formato y las partes de la última vez')
    page.click('#modal [data-act="s-exp-n"][data-v="1"]'); time.sleep(0.1)
    ok(page.locator('#modal [data-act="s-exp-n"].on').get_attribute('data-v') == '1', 'y se puede volver a «Entero»')
    page.click('#modal [data-act="modal-close"]')

    # 5. Escucha: opción, herramientas y atajo
    J('() => { const c = window.__crsl; c.S.view = "listen"; c.S.listen.built = false; c.S.listen.queue = []; c.renderAll(); }'); time.sleep(0.3)
    ok(page.locator('#lkeep').is_checked(), 'Escucha: «conservar las etiquetas detectadas» activado por defecto')
    if page.locator('.lcard').count():
        ok(page.locator('.lcard [data-act="s-reanalyze"]').count() == 1 and page.locator('.lcard [data-act="s-exp"]').count() == 1, 'Escucha: reanalizar y exportar junto al sample')
        ok(page.locator('.lcard .kindrow').count() == 1, 'Escucha: fila Loop / One-shot')

    # 6. Ordenar en disco con loops / one-shots y etiquetas en el nombre
    sel(kick); page.keyboard.press('k'); time.sleep(0.2)
    J('() => { const { S } = window.__crsl; const s = S.byId[S.sel]; s.user.tags = ["Oscuro"]; s.user.kind = "loop"; }')
    J('() => { const c = window.__crsl; c.S.view = "data"; c.renderAll(); }'); time.sleep(0.3)
    ok(page.locator('#org-kinds').is_checked(), 'Ordenar en disco: separar loops y one-shots, activado por defecto')
    page.check('#org-tags'); time.sleep(0.3)
    page.select_option('#org-cert', 'any'); time.sleep(0.3)
    with page.expect_download(timeout=60000) as d: page.click('[data-act="org-zip"]')
    z = zipfile.ZipFile(d.value.path()); nl = z.namelist()
    kdir = 'Loops'
    kb = kick.rsplit('.', 1)[0]
    hit = [x for x in nl if kb in x]
    ok(any(f'/{kdir}/' in x and '[' in x for x in hit), f'el kick marcado como loop va en Kicks/Loops con su etiqueta en el nombre ({hit})')
    ok(any('/One-shots/' in x for x in nl), 'y el resto de one-shots en su carpeta')
    man = [x for x in nl if x.endswith('manifest.csv')][0]
    rows = list(csv.reader(io.StringIO(z.read(man).decode())))
    ok(rows[0] == ['source', 'destination', 'category', 'subfolder', 'type', 'tags', 'rating', 'favourite'], 'manifiesto con todo lo marcado')
    ok(any(kb in r[0] and r[2] == 'kick' and r[4] == 'loop' and r[5] for r in rows[1:]), 'y la fila del kick dice loop y su etiqueta')

    bad = [e for e in errors if 'favicon' not in e]
    ok(not bad, 'sin errores en la consola' + (': ' + ' | '.join(bad[:3]) if bad else ''))
    br.close()
n = sum(1 for c, _ in checks if c)
print(f'\n{n} de {len(checks)} comprobaciones')
sys.exit(0 if n == len(checks) else 1)
