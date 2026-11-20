"""v2.3: sacar los golpes de un loop, afinar al tono del pack e igualar el volumen percibido por página.
Uso: python3 tests/sound_ui.py dist/Circuit_Rhythm_Sample_Library.html /tmp/crsl_fixture"""
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
    total0 = J('() => window.__crsl.S.samples.length')

    # ---------- 1. golpes ----------
    sel('Top Loop 128bpm.wav')
    loop_id = J('() => window.__crsl.S.sel')
    btn = page.locator('#detail [data-act="hits-open"]')
    ok(btn.count() == 1, 'botón «Golpes…» en la ficha del loop')
    sel('Kick 99.wav')
    ok(page.locator('#detail [data-act="hits-open"]').count() == 0, 'y no en un one-shot')
    sel('Top Loop 128bpm.wav')
    page.click('#detail [data-act="hits-open"]'); page.wait_for_selector('.hitrow', timeout=20000)
    cats = page.locator('.hitrow select').evaluate_all('(s) => s.map((x) => x.value)')
    counts = page.locator('.hitrow').evaluate_all('(r) => r.map((x) => +(x.querySelector("b.mono")?.textContent.slice(1) || 1))')
    ok('kick' in cats and 'hat' in cats, f'grupos: {list(zip(cats, counts))}')
    ok(sum(counts) >= 14 and max(counts) >= 6, f'{sum(counts)} golpes de 16, agrupados ({len(cats)} grupos)')
    ok(page.locator('#hitwave').count() == 1, 'onda con los cortes')
    J('() => { const P = window.__crsl.Player; P._n = 0; if (!P._spy) { const o = P.play.bind(P); P.play = (...a) => { P._n++; return o(...a); }; P._spy = 1; } }')
    page.click('.hitrow [data-act="hits-play"] >> nth=0'); time.sleep(0.2)
    ok(J('() => window.__crsl.Player._n') == 1, 'escuchar un golpe')
    hv = page.locator('.hitrow .hvars .hv')
    if hv.count() > 1:
        on0 = page.locator('.hitrow .hvars .hv.on').first.inner_text()
        hv.nth(1 if on0 != '2' else 2).click(); time.sleep(0.2)
        ok(page.locator('.hitrow .hvars .hv.on').first.inner_text() != on0, 'elegir otro golpe del grupo')
    page.uncheck('#hits-group'); time.sleep(0.2)
    nall = page.locator('.hitrow').count()
    ok(nall == sum(counts), f'sin agrupar: {nall} filas, una por golpe')
    page.check('#hits-group'); time.sleep(0.2)
    # cambiar la categoría del primero y desmarcar el último
    first_key = page.locator('.hitrow select').first.get_attribute('data-hcat')
    page.select_option('.hitrow select >> nth=0', 'tom'); time.sleep(0.15)
    if page.locator('.hitrow').count() > 2:
        page.locator('.hitrow input[type=checkbox]').last.uncheck(); time.sleep(0.15)
    n_add = page.locator('.hitrow input[type=checkbox]:checked').count()
    ok(str(n_add) in page.locator('[data-act="hits-add"]').inner_text(), f'«Añadir {n_add}»')
    page.click('[data-act="hits-add"]'); time.sleep(0.5); wait_idle(page, 60)
    added = J('(lid) => window.__crsl.S.samples.filter((s) => s.from && s.from.id === lid).map((s) => ({ name: s.name, path: s.path, kind: s.user.kind, cat: s.user.cat, sr: s.analysis.sr, ch: s.analysis.ch, dur: s.analysis.dur }))', loop_id)
    ok(len(added) == n_add and J('() => window.__crsl.S.samples.length') == total0 + n_add, f'{len(added)} golpes nuevos en la biblioteca')
    folder = ('Extracted/' if EN else 'Extraídos/') + 'Top/'
    ok(all(a['path'].startswith(folder) for a in added) and sorted(a['name'] for a in added)[0] == 'Top 01.wav', f'en «{folder}», «Top 01.wav»…')
    ok(all(a['kind'] == 'oneshot' for a in added) and any(a['cat'] == 'tom' for a in added), 'one-shots, con la categoría elegida')
    ok(all(a['sr'] == 44100 and a['dur'] < 0.5 for a in added), 'con la frecuencia del original y la duración de un golpe')
    page.click('#toast [data-act="hits-show"]') if page.locator('#toast [data-act="hits-show"]').count() else J('() => 0')
    time.sleep(0.3)
    ok(page.locator('.li').count() == len(added), f'«Verlos» deja solo los nuevos en la lista ({page.locator(".li").count()})')
    page.locator('#detail .path [data-act="sel"]').click(); time.sleep(0.3)
    ok(J('() => window.__crsl.S.sel') == loop_id, 'la ficha del golpe lleva a su loop')
    # repetir: ya están
    page.click('#detail [data-act="hits-open"]'); page.wait_for_selector('.hitrow', timeout=20000)
    page.click('[data-act="hits-add"]'); time.sleep(0.5); wait_idle(page, 60)
    ok(J('() => window.__crsl.S.samples.length') == total0 + n_add, 'sacarlos otra vez no duplica nada')

    # ---------- 2. afinar ----------
    kick = J('() => { const s = window.__crsl.S.samples.find((x) => x.name === "sample_007.wav"); return { id: s.id, midi: s.analysis.midi, conf: s.analysis.f0conf }; }')
    ok(kick['midi'] is not None and kick['conf'] > 0.6, f'el bombo tiene nota medida ({kick["midi"]:.2f})')
    J('''async (id) => { const c = window.__crsl; c.S.view = "packs"; if (!c.S.pack) { await c.newPack?.(); } if (!c.S.pack) return;
        c.S.pack.slots[0] = id; await c.savePack(c.S.pack); c.renderAll(); }''', kick['id'])
    if not J('() => !!window.__crsl.S.pack'):
        page.click('[data-act="pack-new"] >> nth=0'); time.sleep(0.3)
        J('async (id) => { const c = window.__crsl; c.S.pack.slots[0] = id; await c.savePack(c.S.pack); c.renderAll(); }', kick['id'])
    time.sleep(0.3)
    page.select_option('#packkey', '7'); time.sleep(0.3)
    ok(J('() => window.__crsl.S.pack.key') == 7, 'tono del pack: G')
    page.click('[data-act="snd-tune"]'); page.wait_for_selector('.tunet', timeout=10000)
    m = kick['midi']; want = ((7 - m) % 12 + 12) % 12; want = want - 12 if want >= 6 else want
    ok(page.locator('.tunet [data-tk]').count() >= 1, 'el bombo aparece para afinar')
    page.click('.tunet [data-act="snd-tune-play"] >> nth=0'); time.sleep(0.2)
    page.click('[data-act="snd-tune-go"]'); time.sleep(0.5)
    tune = J('(id) => window.__crsl.S.byId[id].recipe.tune', kick['id'])
    ok(tune is not None and abs(tune - round(want, 2)) < 0.011, f'afinado {tune} st (a G: {want:.2f})')
    sec = J('(id) => window.__crsl.sampleSeconds(window.__crsl.S.byId[id])', kick['id'])
    ren = J('async (id) => { const r = await window.__crsl.renderedOf(window.__crsl.S.byId[id]); return { n: r.data.length, tuned: r.report.tuned }; }', kick['id'])
    ok(abs(ren['n'] / 48000 - sec) < 0.01 and ren['tuned'] == tune, f'lo que se exporta dura lo previsto ({ren["n"] / 48000:.3f} s ≈ {sec:.3f} s)')
    page.click('#toast [data-act="snd-undo"]'); time.sleep(0.4)
    ok(J('(id) => window.__crsl.S.byId[id].recipe.tune', kick['id']) is None and J('() => window.__crsl.S.pack.key') == 7, 'Deshacer quita la afinación (el tono queda como estaba)')
    page.select_option('#packkey', '7'); time.sleep(0.3)
    sel('sample_007.wav')
    ok(page.locator('#detail [data-rc="tune"]').count() == 1, 'fila «Afinación» en la preparación')
    page.click('#detail [data-act="tune-root"]'); time.sleep(0.3)
    t2 = J('(id) => window.__crsl.S.byId[id].recipe.tune', kick['id'])
    ok(t2 is not None and abs(t2 - round(want, 2)) < 0.011, f'«A la tónica (G)» desde la ficha: {t2}')
    ok('♪' in page.locator('#detail .label .meta').inner_text(), 'la ficha muestra la nota afinada')
    page.fill('#detail [data-rc="tune"]', '-3'); page.locator('#detail [data-rc="tune"]').dispatch_event('change'); time.sleep(0.3)
    ok(J('(id) => window.__crsl.S.byId[id].recipe.tune', kick['id']) == -3, 'afinación a mano: −3 semitonos')

    # ---------- 3. igualar volumen ----------
    hit_ids = J('(lid) => window.__crsl.S.samples.filter((s) => s.from && s.from.id === lid).map((s) => s.id)', loop_id)
    J('async (ids) => { const c = window.__crsl; ids.forEach((id, i) => { c.S.pack.slots[1 + i] = id; }); await c.savePack(c.S.pack); c.S.view = "packs"; c.renderAll(); }', hit_ids)
    time.sleep(0.3)
    page.click('[data-act="snd-level"]'); page.wait_for_selector('[data-lp]', timeout=30000)
    ok(page.locator('[data-lp]').count() == 1, 'una página con varios samples')
    page.click('[data-act="snd-level-go"]'); time.sleep(0.5)
    rs = J('''async () => { const c = window.__crsl, out = [];
        for (const id of new Set(c.S.pack.slots.slice(0, 16).filter(Boolean))) { const s = c.S.byId[id]; const r = await c.renderedOf(s);
          out.push({ n: s.recipe.normalize, t: s.recipe.targetLufs, l: r.report.lufs, lim: !!r.report.loudLimited }); } return out; }''')
    tg = rs[0]['t']
    ok(all(r['n'] == 'loud' and r['t'] == tg for r in rs), f'{len(rs)} samples a {tg} LUFS')
    even = [r for r in rs if not r['lim']]
    ok(len(even) >= 2 and all(abs(r['l'] - tg) < 0.3 for r in even), 'y suenan igual de fuertes: ' + ', '.join(f'{r["l"]:.1f}' for r in rs))
    page.click('#toast [data-act="snd-undo"]'); time.sleep(0.4)
    ok(J('(id) => window.__crsl.S.byId[id].recipe.normalize', hit_ids[0]) is None, 'Deshacer devuelve el nivel de antes')
    J('() => window.__crsl.S.view = "library"')
    bad = [e for e in errors if 'favicon' not in e]
    ok(not bad, 'sin errores en la consola' + (': ' + ' | '.join(bad[:3]) if bad else ''))
    br.close()
print(f'\n{sum(c for c, _ in checks)} de {len(checks)} comprobaciones')
sys.exit(0 if all(c for c, _ in checks) else 1)
