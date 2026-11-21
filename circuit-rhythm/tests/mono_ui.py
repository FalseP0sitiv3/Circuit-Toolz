"""v2.8: mono reparado para la Rhythm (contrafase, retardo entre canales, cancelación parcial) sin tocar el estéreo.
Uso: python3 tests/mono_ui.py dist/Circuit_Rhythm_Sample_Library.html /tmp/crsl_fixture"""
import base64, io, math, os, random, struct, sys, time, wave
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
def wav_b64(L, R, sr=44100):
    b = io.BytesIO(); w = wave.open(b, 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes(b''.join(struct.pack('<hh', int(max(-1, min(1, l)) * 32000), int(max(-1, min(1, r)) * 32000)) for l, r in zip(L, R))); w.close()
    return base64.b64encode(b.getvalue()).decode()
random.seed(3); sr = 44100; n = sr
x = [0.25 * random.uniform(-1, 1) + 0.3 * math.sin(2 * math.pi * 220 * i / sr) for i in range(n)]
d = round(0.011 * sr)
files['Atmos/Haas Pad.wav'] = wav_b64([x[i - d] if i >= d else 0 for i in range(n)], x)
y = [0.25 * random.uniform(-1, 1) for _ in range(n)]
files['Atmos/Wide Texture.wav'] = wav_b64([x[i] * 0.6 + 0.9 * y[i] for i in range(n)], [-x[i] * 0.6 + 0.9 * y[i] for i in range(n)])
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
        J('(n) => { const { S } = window.__crsl; S.sel = S.samples.find((s) => s.name === n).id; S.multi = new Set(); S.libMode = "list"; S.view = "library"; S.f = { ...S.f, q: "", cat: "all", cert: "all", flag: "all", tag: "", sub: "", words: [], kind: "" }; window.__crsl.renderAll(); }', name)
        time.sleep(0.4)
    M = lambda n: J('(n) => window.__crsl.S.samples.find((s) => s.name === n).analysis.mono || null', n)
    ok((M('Wide Pad.wav') or {}).get('used') == 'flip', 'Wide Pad (un canal invertido): se le da la vuelta')
    h = M('Haas Pad.wav') or {}
    ok(h.get('used') == 'align' and abs(h.get('delayMs', 0) - 11) < 0.2 and h.get('lead') == 'R', f'Haas Pad: el canal derecho va 11 ms por delante y se alinean ({h})')
    w = M('Wide Texture.wav') or {}
    ok(w.get('used') == 'spectral' and w.get('lossAfter', 99) < w.get('lossBefore', 0) - 3, f'Wide Texture: suma alineada por frecuencias ({w.get("lossBefore")} → {w.get("lossAfter")} dB)')
    ok((M('Top Loop 128bpm.wav') or {}).get('used') in (None, 'mono', 'sum', 'left'), 'lo que no se cancela no se toca')
    sel('Haas Pad.wav')
    txt = page.locator('#detail .monotxt').inner_text().lower()
    ok(('repaired' if EN else 'reparado') in txt and '11' in txt, 'la ficha dice cómo se repara: ' + txt[:90])
    ok(page.locator('#detail .monostereo').count() == 1, 'y que tu archivo sigue en estéreo')
    ok(page.locator('#detail [data-act="mono-ab"]').count() == 4, 'botones para comparar: Suma, Reparado, L y R')
    page.click('#detail [data-act="mono-ab"][data-v="sum"]'); time.sleep(0.3)
    ok(J('() => window.__crsl.Player.playing') and J('() => window.__crsl.Player.key').endswith('|mono|sum'), '▶ Suma suena (como en la Rhythm)')
    page.click('#detail [data-act="mono-ab"][data-v="repair"]'); time.sleep(0.3)
    ok(J('() => window.__crsl.Player.key').endswith('|mono|repair'), '▶ Reparado suena')
    J('() => window.__crsl.Player.stop()')
    # lo que va a la Rhythm: mono y con el nivel; el original sigue con 2 canales
    lv = J('''async (n) => { const c = window.__crsl, s = c.S.samples.find((x) => x.name === n); const r = await c.renderedOf(s); let e = 0; for (const v of r.data) e += v * v; return [r.report.monoUsed, Math.sqrt(e / r.data.length), s.analysis.ch]; }''', 'Haas Pad.wav')
    ok(lv[0] == 'align' and lv[2] == 2, f'para la Rhythm se alinea; el archivo sigue teniendo {lv[2]} canales')
    # suma a mano: vuelve el aviso
    page.select_option('#detail select[data-rc="mono"]', 'sum'); time.sleep(0.5)
    ok(page.locator('#detail .result.warn').count() == 1, 'con «suma L+R» a mano vuelve el aviso de que se cancela')
    ok(J('(n) => window.__crsl.S.samples.find((s) => s.name === n).recipe.mono', 'Haas Pad.wav') == 'sum', 'y se guarda en la receta')
    page.select_option('#detail select[data-rc="mono"]', 'auto'); time.sleep(0.4)
    # filtro: los que se cancelan al sumar
    J('() => { const c = window.__crsl; c.S.f = { ...c.S.f, flag: "phase" }; c.renderAll(); }'); time.sleep(0.3)
    names = J('() => window.__crsl.filtered().map((s) => s.name)')
    ok(set(names) == {'Wide Pad.wav', 'Haas Pad.wav', 'Wide Texture.wav'}, 'filtro «se cancela en mono»: ' + ', '.join(names))
    ok(page.locator('#list .li .ok[title]').filter(has_text='Φ').count() == 3, 'en la lista, Φ en verde: reparados')
    # fichas de antes de 2.8: se calcula al abrirlas
    J('(n) => { const s = window.__crsl.S.samples.find((x) => x.name === n); delete s.analysis.mono; }', 'Haas Pad.wav')
    sel('Haas Pad.wav'); time.sleep(1.2)
    ok((M('Haas Pad.wav') or {}).get('used') == 'align', 'una ficha antigua se completa al abrirla')
    bad = [e for e in errors if 'favicon' not in e]
    ok(not bad, 'sin errores en la consola' + (': ' + ' | '.join(bad[:3]) if bad else ''))
    br.close()
print(f'\n{sum(c for c, _ in checks)} de {len(checks)} comprobaciones')
sys.exit(0 if all(c for c, _ in checks) else 1)
