"""v1.6: acortar loops repetitivos (ficha, a mano, en bloque y en el pack).
Uso: python3 tests/short_ui.py dist/Circuit_Rhythm_Sample_Library.html [shots_dir]"""
import base64, io, os, sys, time, wave
import numpy as np
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from browser_test import MOCK, wait_idle, wait_for

HTML = os.path.abspath(sys.argv[1]); SHOTS = sys.argv[2] if len(sys.argv) > 2 else '/tmp/crsl_shots'
EN = '_EN' in HTML
os.makedirs(SHOTS, exist_ok=True)
checks = []
def ok(c, m): checks.append((bool(c), m)); print(('  ✓ ' if c else '  ✗ ') + m)

# ---------- loops sintéticos ----------
SR = 44100; BPM = 128; BEAT = 60 / BPM
rng = np.random.default_rng(7)
def env(n, d): return np.exp(-np.arange(n) / SR * d)
def kick(): n = int(0.4 * SR); tt = np.arange(n) / SR; f = 50 + 120 * np.exp(-tt * 30); return 0.9 * np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 7)
def hat(): n = int(0.08 * SR); x = rng.uniform(-1, 1, n) * env(n, 40); return np.diff(np.diff(x, prepend=0), prepend=0) * 0.5
def snare(): n = int(0.3 * SR); tt = np.arange(n) / SR; return (0.5 * np.sin(2 * np.pi * 190 * tt) * np.exp(-tt * 25) + 0.4 * rng.uniform(-1, 1, n) * np.exp(-tt * 14))
def saw(f, sec): n = int(sec * SR); tt = np.arange(n) / SR; return 0.5 * (2 * ((tt * f) % 1) - 1) * np.minimum(1, (sec - tt) / 0.02)
K, H, SN = kick(), hat(), snare()
def place(x, s, t, g=1.0):
    o = int(round(t * SR)); seg = s[: max(0, min(len(s), len(x) - o))]; x[o: o + len(seg)] += seg * g
def loop(bars, fn):
    x = np.zeros(int(round(bars * 4 * BEAT * SR)))
    for b in range(bars): fn(x, b * 4 * BEAT, b)
    return x
def basic(x, t0, b=0):
    for q in range(4): place(x, K, t0 + q * BEAT); place(x, H, t0 + (q + 0.5) * BEAT, 0.6)
    place(x, SN, t0 + BEAT, 0.7); place(x, SN, t0 + 3 * BEAT, 0.7)
def fill(x, t0, b):
    basic(x, t0)
    if b == 3:
        for s in range(8): place(x, SN, t0 + 2 * BEAT + s * BEAT / 4, 0.5)
def bassline(x, t0, b):
    basic(x, t0)
    notes = [55, 55, 82.4, 55, 65.4, 55, 73.4, 61.7] if b % 2 == 0 else [49, 49, 73.4, 49, 58.3, 49, 65.4, 55]
    for s, f in enumerate(notes): place(x, saw(f, BEAT / 2 * 0.9), t0 + s * BEAT / 2, 0.4)
def randp(x, t0, b):
    for s in range(16):
        if rng.random() < 0.3: place(x, K, t0 + s * BEAT / 4)
        if rng.random() < 0.4: place(x, H, t0 + s * BEAT / 4, 0.5)
        if rng.random() < 0.2: place(x, SN, t0 + s * BEAT / 4, 0.5)
def wav16(x):
    x = np.clip(x / max(1e-9, np.max(np.abs(x))) * 0.9, -1, 1); b = io.BytesIO()
    with wave.open(b, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * 32767).astype('<i2').tobytes())
    return base64.b64encode(b.getvalue()).decode()
LOOPS = {
    'Groove Loop 128bpm.wav': loop(4, basic),
    'Fill Drum Loop 128bpm.wav': loop(4, fill),
    'Bass Loop 128bpm Am.wav': loop(4, bassline),
    'Random Perc Loop 128bpm.wav': loop(4, randp),
}
files = {k: wav16(v) for k, v in LOOPS.items()}
files['Kick Short.wav'] = wav16(np.concatenate([K, np.zeros(1000)]))

errors = []
with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required'])
    ctx = br.new_context(viewport={'width': 1440, 'height': 1100}, accept_downloads=True); ctx.add_init_script(MOCK)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    page.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
    page.goto('file://' + HTML); page.wait_for_selector('.tab')
    page.evaluate('([f]) => window.__pickQueue.push(window.__mkFS("Loops", f))', [files])
    page.click('[data-act="link"] >> nth=0'); time.sleep(0.5); wait_idle(page, 120)
    J = lambda js, *a: page.evaluate(js, *a)
    ok(J('() => window.__crsl.S.samples.length') == 5, 'cinco samples enlazados')
    def sel(name):
        J('(n) => { const { S } = window.__crsl; S.sel = S.samples.find((s) => s.name === n).id; S.libMode = "list"; S.view = "library"; window.__crsl.renderAll(); }', name); time.sleep(0.2)
    def sid(name): return J('(n) => window.__crsl.S.samples.find((s) => s.name === n).id', name)
    def keep(name): return J('(n) => { const s = window.__crsl.S.samples.find((s) => s.name === n); return s.recipe && s.recipe.keep || null; }', name)
    def secs(name): return J('(n) => window.__crsl.sampleSeconds(window.__crsl.S.samples.find((s) => s.name === n))', name)
    full = 16 * BEAT

    # 1. ficha: el one-shot no ofrece acortar; el loop sí
    sel('Kick Short.wav')
    ok(page.locator('#shortp').count() == 0, 'un one-shot no tiene panel «Acortar»')
    sel('Groove Loop 128bpm.wav')
    ok(page.locator('#shortp').count() == 1, 'un loop tiene panel «Acortar»')
    page.wait_for_selector('#shortp table.shopts', timeout=20000)
    first = page.locator('#shortp table.shopts tr').first.inner_text()
    ok(('compás 1 de 4' in first or 'bar 1 of 4' in first) and ('idénticas' in first or 'identical' in first), f'propone 1 compás de 4, idénticos ({first.splitlines()[0][:70]})')
    page.screenshot(path=f'{SHOTS}/40_acortar_ficha.png', full_page=True)
    # escuchar en bucle sin aplicar
    page.locator('#shortp table.shopts tr').first.locator('[data-act="sh-loop"]').click(); time.sleep(0.3)
    pl = J('() => { const P = window.__crsl.Player; return [P.playing, P.loop, P.key, P.dur]; }')
    ok(pl[0] and pl[1] and pl[2].startswith('sh|') and abs(pl[3] - full / 4) < 0.01, f'escuchar en bucle la propuesta sin aplicarla ({pl[3]:.3f} s)')
    ok(keep('Groove Loop 128bpm.wav') is None, 'escuchar no cambia nada')
    page.locator('#shortp table.shopts tr').first.locator('[data-act="sh-use"]').click(); time.sleep(0.4)
    k = keep('Groove Loop 128bpm.wav')
    ok(k == {'n': 4, 'sel': [0]}, f'«Usar» guarda la receta ({k})')
    ok(abs(secs('Groove Loop 128bpm.wav') - full / 4) < 0.01, f'ocupa un cuarto: {secs("Groove Loop 128bpm.wav"):.3f} s de {full:.3f} s')
    ren = J('async () => { const { S, renderedOf } = window.__crsl; const r = await renderedOf(S.byId[S.sel]); return [r.data.length, r.report.kept && r.report.kept.savedSec]; }')
    ok(abs(ren[0] - round(full / 4 * 48000)) <= 1 and ren[1] > 5.5, f'lo exportado dura exactamente 1 compás ({ren[0]} muestras, ahorra {ren[1]:.2f} s)')
    wv = J('async () => { const { S, wavOf } = window.__crsl; const b = await wavOf(S.byId[S.sel]); return b.length; }')
    ok(abs(wv - (44 + 2 * round(full / 4 * 48000))) <= 4, f'WAV 16 bit mono 48 kHz del tamaño justo ({wv} bytes)')
    ok(page.locator('#shortp .shcur').count() == 1 and page.locator('.li.sel').inner_text().find('✂') >= 0, 'la ficha y la lista muestran que está acortado')
    # clic en una slice de la onda: la que se queda suena desde lo exportado; la quitada, del original
    box = page.locator('#wave').bounding_box()
    page.mouse.click(box['x'] + box['width'] * 0.1, box['y'] + box['height'] / 2); time.sleep(0.2)
    a = J('() => { const P = window.__crsl.Player; return [P.playing, P.key, P.dur]; }')
    ok(a[0] and abs(a[2] - full / 4) < 0.01, 'clic en la slice que se queda: suena lo exportado')
    page.mouse.click(box['x'] + box['width'] * 0.6, box['y'] + box['height'] / 2); time.sleep(0.2)
    b = J('() => { const P = window.__crsl.Player; return [P.playing, P.dur]; }')
    ok(b[0] and abs(b[1] - full) < 0.05, 'clic en una slice quitada: suena el original')
    J('() => window.__crsl.Player.stop()')

    # 2. a mano: 8 slices, texto con orden, quitar
    page.select_option('#shortp select[data-sh="n"]', '8'); time.sleep(0.2)
    ok(page.locator('#shortp .shchip').count() == 8 and page.locator('#shortp .shchip.on').count() == 8, 'dividir en 8: ocho slices marcadas')
    page.locator('#shortp .shchip').nth(7).click(); page.locator('#shortp .shchip').nth(6).click(); time.sleep(0.2)
    ok(page.input_value('#shortp input[data-sh="txt"]') == '1-6', 'quitar slices 7 y 8 → «1-6»')
    page.fill('#shortp input[data-sh="txt"]', '1-2, 7 8'); page.press('#shortp input[data-sh="txt"]', 'Tab'); time.sleep(0.3)
    page.click('#shortp [data-act="sh-apply"]'); time.sleep(0.4)
    ok(keep('Groove Loop 128bpm.wav') == {'n': 8, 'sel': [0, 1, 6, 7]}, f'orden escrito a mano ({keep("Groove Loop 128bpm.wav")})')
    page.fill('#shortp input[data-sh="txt"]', '9'); page.press('#shortp input[data-sh="txt"]', 'Tab'); time.sleep(0.3)
    ok(page.locator('.toast.warn').count() >= 1 and keep('Groove Loop 128bpm.wav') == {'n': 8, 'sel': [0, 1, 6, 7]}, 'número fuera de rango: aviso y no cambia nada')
    page.click('#shortp [data-act="sh-off"]'); time.sleep(0.3)
    ok(keep('Groove Loop 128bpm.wav') is None and abs(secs('Groove Loop 128bpm.wav') - full) < 0.01, '«Quitar» deja el loop entero')

    # 3. otros loops
    sel('Fill Drum Loop 128bpm.wav'); page.wait_for_selector('#shortp table.shopts', timeout=20000)
    f1 = page.locator('#shortp table.shopts tr').first.inner_text()
    ok('remate' in f1 or 'fill' in f1, f'con remate: propone el compás 1 y el último ({f1.splitlines()[0][:80]})')
    sel('Bass Loop 128bpm Am.wav'); page.wait_for_selector('#shortp table.shopts', timeout=20000)
    b1 = page.locator('#shortp table.shopts tr').first.inner_text()
    ok('1–2 de 4' in b1 or '1–2 of 4' in b1, f'bajo de 2 compases: propone la mitad ({b1.splitlines()[0][:80]})')
    sel('Random Perc Loop 128bpm.wav'); wait_for(page, '() => !document.querySelector("#sh-wait")', 20)
    ok(page.locator('#shortp table.shopts').count() == 0, 'sin repetición: no propone nada, solo «a mano»')

    # 4. Escucha (02) también lo muestra
    page.click('.tab[data-view="listen"]'); time.sleep(0.4)
    J('() => { const { S, ACT } = window.__crsl; S.listen.src = "all"; ACT.lrebuild && ACT.lrebuild(); }'); time.sleep(0.3)
    J('() => { const { S } = window.__crsl; const q = S.listen.queue; const i = q.findIndex((id) => S.byId[id].name === "Groove Loop 128bpm.wav"); if (i >= 0) { S.listen.i = i; window.__crsl.renderAll(); } }'); time.sleep(0.3)
    inq = J('() => window.__crsl.S.listen.queue.some((id) => window.__crsl.S.byId[id].name === "Groove Loop 128bpm.wav")')
    ok(inq and page.locator('#shortp').count() == 1 and J('() => window.__crsl.S.byId[window.__crsl.S.listen.queue[window.__crsl.S.listen.i]].name') == 'Groove Loop 128bpm.wav', 'en Escucha la ficha del loop también tiene «Acortar»')

    # 5. en bloque, desde el pack
    J('async () => { const c = window.__crsl; const p = await c.newPack(); const ids = c.S.samples.map((s) => s.id); ids.forEach((id, i) => { p.slots[i] = id; }); await c.savePack(p); }')
    page.click('.tab[data-view="packs"]'); time.sleep(0.4)
    b0 = J('() => window.__crsl.budget(window.__crsl.S.pack, window.__crsl.S.byId).total')
    page.click('[data-act="sh-from-pack"]'); time.sleep(0.4)
    ok(page.locator('.shortmode').count() == 1 and J('() => window.__crsl.S.shortScope') == 'pack', 'desde Packs: «Acortar loops» con los loops del pack')
    ok(page.locator('.shtab tr:not(.th)').count() == 4, f'los 4 loops del pack, sin el one-shot ({page.locator(".shtab tr:not(.th)").count()})')
    if page.locator('[data-act="sh-scan"]:not([disabled])').count(): page.click('[data-act="sh-scan"]')
    wait_for(page, '() => !window.__crsl.S.shortRun && document.querySelectorAll(".shtab select[data-sh=pick]").length >= 3', 30)
    txt = page.inner_text('.shortmode')
    ok(('3 se pueden acortar' in txt) or ('3 can be shortened' in txt), '3 de 4 se pueden acortar')
    page.screenshot(path=f'{SHOTS}/41_acortar_bloque.png', full_page=True)
    # el de remate: elegir «no acortar» en su fila
    fid = sid('Fill Drum Loop 128bpm.wav')
    page.select_option(f'.shtab select[data-sh="pick"][data-id="{fid}"]', 'none'); time.sleep(0.3)
    page.click('[data-act="sh-apply-all"]'); time.sleep(0.6)
    ok(keep('Groove Loop 128bpm.wav') == {'n': 4, 'sel': [0]} and keep('Bass Loop 128bpm Am.wav') == {'n': 2, 'sel': [0]}, 'aplica las propuestas seguras')
    ok(keep('Fill Drum Loop 128bpm.wav') is None and keep('Random Perc Loop 128bpm.wav') is None, 'respeta «no acortar» y no toca el que no se repite')
    b1v = J('() => window.__crsl.budget(window.__crsl.S.pack, window.__crsl.S.byId).total')
    ok(abs((b0 - b1v) - (full * 3 / 4 + full / 2)) < 0.05, f'el pack ocupa {b0 - b1v:.2f} s menos')
    page.click('.shortmode [data-act="sh-undo"]'); time.sleep(0.4)
    ok(keep('Groove Loop 128bpm.wav') is None and keep('Bass Loop 128bpm Am.wav') is None, 'Deshacer deja todo como estaba')
    # recarga: la receta y el análisis se guardan
    page.click('[data-act="sh-apply-all"]'); time.sleep(0.5)
    # exportación del pack (ZIP para la SD): el WAV del loop acortado mide un compás
    ws = J('async () => { const { S, wavOf } = window.__crsl; const s = S.samples.find((x) => x.name === "Groove Loop 128bpm.wav"); return (await wavOf(s)).length; }')
    ok(abs(ws - (44 + 2 * round(full / 4 * 48000))) <= 4, 'al exportar, el WAV del loop acortado mide un compás')
    page.reload(); page.wait_for_selector('.tab'); time.sleep(1.0)
    ok(keep('Groove Loop 128bpm.wav') == {'n': 4, 'sel': [0]} and J('() => !!window.__crsl.S.samples.find((s) => s.name === "Groove Loop 128bpm.wav").rep'), 'tras recargar, la receta y el análisis siguen')
    J('() => { const { S } = window.__crsl; S.view = "library"; S.libMode = "short"; window.__crsl.renderAll(); }'); time.sleep(0.3)
    ok(page.locator('.libmodes [data-v="short"].on').count() == 1, 'pestaña «Acortar loops» en la Biblioteca')
    page.keyboard.press('Control+k'); time.sleep(0.2); page.keyboard.type('acortar' if not EN else 'shorten'); time.sleep(0.2)
    ok(page.locator('.cpal').inner_text().lower().find('acortar loops que se repiten' if not EN else 'shorten loops that repeat') >= 0, 'Ctrl K: «Acortar loops que se repiten»')
    page.keyboard.press('Escape')
    br.close()
errs = [e for e in errors if 'favicon' not in e]
ok(not errs, 'sin errores en la consola' + ('' if not errs else ': ' + ' | '.join(errs[:3])))
print(f"\n{sum(c for c, _ in checks)} correctas, {sum(not c for c, _ in checks)} con fallo")
sys.exit(0 if all(c for c, _ in checks) else 1)
