"""v2.9: un sample, un sitio (lo que suena + el tipo deciden la carpeta) y exportar en lote como el original con
tus cortes. Uso: python3 tests/place_ui.py dist/Circuit_Rhythm_Sample_Library.html /tmp/crsl_fixture"""
import base64, io, math, os, random, struct, sys, time, zipfile, csv
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
def variant(b64, k):
    b = bytearray(base64.b64decode(b64)); b[-2] = (b[-2] + k) % 256; return base64.b64encode(bytes(b)).decode()
# un loop de hats en estéreo, 24 bit y 44,1 kHz: 4 compases a 128 BPM con un charles en cada semicorchea
def hat_loop(sr=44100, bpm=128, bars=4, seed=3):
    rnd = random.Random(seed); n = int(sr * 60 / bpm * 4 * bars); L = [0.0] * n; R = [0.0] * n
    step = sr * 60 / bpm / 4
    for k in range(bars * 16):
        at = int(k * step); amp = 0.5 if k % 2 == 0 else 0.3
        for i in range(int(0.03 * sr)):
            if at + i >= n: break
            e = amp * math.exp(-i / (0.006 * sr)); x = rnd.uniform(-1, 1); y = rnd.uniform(-1, 1)
            L[at + i] += e * (x - 0.6 * y); R[at + i] += e * (0.8 * x - 0.5 * y)
    data = bytearray()
    for a, b in zip(L, R):
        for v in (a, b):
            q = max(-8388608, min(8388607, int(round(v * 8388607)))); data += struct.pack('<i', q)[:3]
    hdr = b'RIFF' + struct.pack('<I', 36 + len(data)) + b'WAVE' + b'fmt ' + struct.pack('<IHHIIHH', 16, 1, 2, sr, sr * 6, 6, 24) + b'data' + struct.pack('<I', len(data))
    return base64.b64encode(hdr + bytes(data)).decode()
HL = 'hatloop 128.wav'
files['Loops/hh/' + HL] = hat_loop()
files['Loops/Perc Loop 2.wav'] = variant(files['Loops/Top Loop 128bpm.wav'], 3)
files['Loops/Pad 3.wav'] = variant(files['Atmos/Wide Pad.wav'], 4)
def wav_info(b):
    ch, sr = struct.unpack('<HI', b[22:28]); bits = struct.unpack('<H', b[34:36])[0]
    i = 12
    while i < len(b) - 8:
        cid, sz = b[i:i + 4], struct.unpack('<I', b[i + 4:i + 8])[0]
        if cid == b'data': return {'ch': ch, 'sr': sr, 'bits': bits, 'frames': sz // (ch * bits // 8)}
        i += 8 + sz + (sz & 1)
    return {'ch': ch, 'sr': sr, 'bits': bits, 'frames': 0}
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
        time.sleep(0.2); page.locator('#detail .label').click()
    U = lambda n: J('(n) => window.__crsl.S.samples.find((s) => s.name === n).user', n)
    segs = lambda: [x.strip() for x in page.locator('#detail .dest .dseg b').all_inner_texts()]
    caps = lambda: [x.strip() for x in page.locator('#detail .dest .dseg i').all_inner_texts()]
    on = lambda: sorted(page.locator('#detail .keys .kbtn.on').evaluate_all('(b) => b.map((x) => x.dataset.v)'))

    # 1. un loop de hats: H basta → Drum loop › Closed-Hats (las dos teclas encendidas)
    sel(HL)
    ok(page.locator('#detail .kindrow button.on').get_attribute('data-v') == 'loop', 'el loop de hats se ve como loop')
    ok(page.locator('#detail .keyhint').count() == 1, 'junto a las teclas: en un loop, la tecla de lo que suena lo lleva a Drum loop')
    page.keyboard.press('h'); time.sleep(0.3)
    u = U(HL)
    ok(u.get('cat') == 'dloop' and u.get('sub') == 'hat', 'H en un loop → Drum loop › Closed-Hats: ' + str({k: u.get(k) for k in ('cat', 'sub', 'kind')}))
    ok(segs()[:2] == ['14 Drum Loops', 'Closed-Hats'] and caps()[1].lower() == ('what plays' if EN else 'lo que suena'), '«Se guarda en»: 14 Drum Loops / Closed-Hats (lo que suena): ' + ' / '.join(segs()) + ' · ' + ' / '.join(caps()))
    ok(on() == ['dloop', 'hat'], 'se encienden Drum loop y Closed hat: ' + str(on()))
    # 2. W: one-shot ↔ loop, el sitio sigue al tipo
    page.keyboard.press('w'); time.sleep(0.3)
    u = U(HL)
    ok(u.get('cat') == 'hat' and u.get('kind') == 'oneshot' and not u.get('sub'), 'W → one-shot: Closed hat')
    ok(segs()[0] == '04 Closed-Hats' and 'One-shots' not in segs(), 'y se guarda en 04 Closed-Hats, sin «One-shots» dentro: ' + ' / '.join(segs()))
    page.keyboard.press('w'); time.sleep(0.3)
    u = U(HL)
    ok(u.get('cat') == 'dloop' and u.get('sub') == 'hat' and u.get('kind') == 'loop', 'W otra vez → Drum loop › Closed-Hats')
    # 3. un loop de percusión: E → Drum loop › Perc (y D después no lo cambia)
    sel('Perc Loop 2.wav'); page.keyboard.press('e'); time.sleep(0.3)
    u = U('Perc Loop 2.wav')
    ok(u.get('cat') == 'dloop' and u.get('sub') == 'perc', 'E en un loop de percusión → Drum loop › Perc')
    page.keyboard.press('d'); time.sleep(0.3)
    ok(U('Perc Loop 2.wav').get('sub') == 'perc', 'D después: sigue en Drum loop › Perc')
    # 4. un one-shot de hat: H y luego D (es un loop) → Drum loop › Closed-Hats
    sel('HH Closed 01.wav'); page.keyboard.press('h'); time.sleep(0.3)
    ok(U('HH Closed 01.wav').get('cat') == 'hat' and segs()[0] == '04 Closed-Hats', 'un one-shot de hat: Closed hat')
    page.keyboard.press('d'); time.sleep(0.3)
    u = U('HH Closed 01.wav')
    ok(u.get('cat') == 'dloop' and u.get('sub') == 'hat' and J('(n) => { const c = window.__crsl, s = c.S.samples.find((x) => x.name === n); return c.organizePlanOf(s); }', 'HH Closed 01.wav').startswith('14 Drum Loops/Closed-Hats/'), 'D en un Closed hat → Drum loop › Closed-Hats')
    page.keyboard.press('w'); time.sleep(0.3)
    ok(U('HH Closed 01.wav').get('cat') == 'hat', 'y W lo devuelve a Closed hat')
    # 5. bajo: B y luego M → Melodic loop › Bass
    sel('Sub A1.wav'); page.keyboard.press('b'); time.sleep(0.2); page.keyboard.press('m'); time.sleep(0.3)
    u = U('Sub A1.wav')
    ok(u.get('cat') == 'mloop' and u.get('sub') == 'bass' and segs()[:2] == ['15 Melodic Loops', 'Bass'], 'M en un bajo → 15 Melodic Loops / Bass')
    # 6. la propuesta también va a su sitio: un pad en una carpeta Loops → Melodic loop › Atmos, y aceptar la deja así
    sel('Pad 3.wav')
    c = J('(n) => { const c = window.__crsl.clsOf(window.__crsl.S.samples.find((s) => s.name === n)); return { cat: c.cat, from: c.placedFrom, sub: c.placedSub }; }', 'Pad 3.wav')
    ok(c['cat'] == 'mloop' and c['from'] == 'atmos' and c['sub'] == 'texture', 'propuesta: Atmos en un loop → Melodic loop › Atmos ' + str(c))
    ok(page.locator('#detail .big-sub').count() and 'Atmos' in page.locator('#detail .big-sub').first.inner_text(), 'la ficha lo dice: MELODIC LOOP › Atmos')
    ok(sorted(page.locator('#detail .keys .kbtn.prop-hint').evaluate_all('(b) => b.map((x) => x.dataset.v)')) == ['atmos', 'mloop'], 'las teclas de la propuesta: Melodic loop y Atmos')
    page.keyboard.press('Enter'); time.sleep(0.3)
    u = U('Pad 3.wav')
    ok(u.get('cat') == 'mloop' and u.get('sub') == 'texture', 'Intro acepta Melodic loop › Atmos entero: ' + str(u.get('cat')) + ' ' + str(u.get('sub')))
    # 7. filtrar por Closed hat también muestra sus loops
    J('() => { const c = window.__crsl; c.S.f = { ...c.S.f, cat: "hat" }; c.renderAll(); }'); time.sleep(0.3)
    names = J('() => window.__crsl.filtered().map((s) => s.name)')
    ok(HL in names and 'HH Closed 01.wav' in names, 'el filtro Closed hat muestra one-shots y loops de hats: ' + ', '.join(names[:5]))
    ok(page.locator('.cats [data-v="hat"]').get_attribute('title') is not None, 'y el botón lo explica')
    # 8. portapapeles: lo que suena, con el tipo del que lo recibe
    sel(HL); page.keyboard.press('Alt+Shift+v'); time.sleep(0.2)
    J('() => { const c = window.__crsl; c.S.set.clipF.off = ["kind", "tags"]; c.renderAll(); }')
    sel('HH Closed 02.wav'); page.keyboard.press('Alt+v'); time.sleep(0.3)
    u = U('HH Closed 02.wav')
    ok(u.get('cat') == 'hat' and u.get('kind') != 'loop', 'pegar «Drum loop › Closed-Hats» en un one-shot (sin el tipo) → Closed hat: ' + str(u.get('cat')))
    J('() => { const c = window.__crsl; c.S.set.clipF.off = ["tags"]; c.renderAll(); }')
    sel('Open Hat 01.wav'); page.keyboard.press('Alt+v'); time.sleep(0.3)
    u = U('Open Hat 01.wav')
    ok(u.get('cat') == 'dloop' and u.get('sub') == 'hat' and u.get('kind') == 'loop', 'con el tipo → Drum loop › Closed-Hats, loop')
    # 10. exportar en lote como el original, con tus cortes
    sel('Kick 99.wav'); page.keyboard.press('k'); time.sleep(0.2)
    J('''(n) => { const c = window.__crsl, s = c.S.samples.find((x) => x.name === n); s.recipe = { ...(s.recipe || {}), keep: { n: 4, sel: [0, 1] } }; c.invalidateAll(); }''', HL)
    J('''(n) => { const c = window.__crsl, s = c.S.samples.find((x) => x.name === n); s.recipe = { ...(s.recipe || {}), autoTrim: false, trimStart: 0.02, trimEnd: 0.07 }; c.invalidateAll(); }''', 'Kick 99.wav')
    sel(HL)
    J('(ns) => { const c = window.__crsl; c.S.multi = new Set(c.S.samples.filter((s) => ns.includes(s.name)).map((s) => s.id)); c.renderAll(); }', [HL, 'Kick 99.wav', 'Perc Loop 2.wav'])
    time.sleep(0.2)
    ok(page.locator('.listfoot [data-act="lib-export"]').count() == 1, 'Biblioteca: «Exportar…» al pie de la lista')
    page.click('.listfoot [data-act="lib-export"]'); time.sleep(0.5)
    ok(J('() => window.__crsl.S.view') == 'data' and page.locator('#org-panel [data-act="org-scope"][data-v="sel"].on').count() == 1, 'lleva a 08 Datos con «La selección»')
    page.check('#org-panel input[name="orgfmt"][value="asis"]'); time.sleep(0.3)
    ok(page.locator('#org-panel [data-act="org-slices"][data-v="4"]').is_disabled(), 'tal cual: sin slices')
    with page.expect_download(timeout=60000) as d: page.click('#org-panel [data-act="org-zip"]')
    z = zipfile.ZipFile(d.value.path()); nl = [x for x in z.namelist() if not x.endswith('manifest.csv')]
    kick = [x for x in nl if x.endswith('/Kick 99.wav')]
    ok(len(nl) == 3 and kick and z.read(kick[0]) == base64.b64decode(files['Misc/Kick 99.wav']), 'tal cual: los 3 seleccionados, byte a byte el original: ' + str(nl))
    page.check('#org-panel input[name="orgfmt"][value="cuts"]'); time.sleep(0.3)
    page.click('#org-panel [data-act="org-slices"][data-v="4"]'); time.sleep(0.3)
    with page.expect_download(timeout=60000) as d: page.click('#org-panel [data-act="org-zip"]')
    z = zipfile.ZipFile(d.value.path()); nl = [x for x in z.namelist() if not x.endswith('manifest.csv')]
    sl = sorted(x for x in nl if '/14 Drum Loops/Closed-Hats/hatloop 128 (4 slices)/' in x)
    ok(len(sl) == 4 and sl[0].endswith('hatloop 128 01.wav'), 'con tus cortes y 4 slices: el loop de hats en su carpeta de slices: ' + (sl[0] if sl else str(nl)))
    orig = wav_info(base64.b64decode(files['Loops/hh/' + HL]))
    s1 = wav_info(z.read(sl[0])) if sl else {}
    ok(s1.get('ch') == 2 and s1.get('sr') == 44100 and s1.get('bits') == 24, 'cada slice en estéreo, 44,1 kHz y 24 bit, como el original: ' + str(s1))
    ok(abs(s1.get('frames', 0) - orig['frames'] / 4) <= 2, 'y dura un cuarto del loop entero (las slices se cuentan sobre el loop completo)')
    k = [x for x in nl if x.endswith('/Kick 99.wav')]
    ki = wav_info(z.read(k[0])) if k else {}
    ok(k and '/01 Kicks/' in k[0] and ki.get('sr') == 44100 and ki.get('ch') == 1 and abs(ki.get('frames', 0) - round(0.05 * 44100)) <= 1, 'el kick, recortado a mano (50 ms) y sin convertir: ' + str(ki) + ' ' + str(k))
    ok(any('/14 Drum Loops/Perc/' in x for x in nl), 'el loop de percusión en Drum Loops/Perc')
    page.click('#org-panel [data-act="org-slices"][data-v="1"]'); time.sleep(0.3)
    with page.expect_download(timeout=60000) as d: page.click('#org-panel [data-act="org-zip"]')
    z = zipfile.ZipFile(d.value.path()); nl = z.namelist()
    h = [x for x in nl if x.endswith('/Closed-Hats/' + HL)]
    hi = wav_info(z.read(h[0])) if h else {}
    ok(h and hi.get('ch') == 2 and hi.get('bits') == 24 and abs(hi.get('frames', 0) - orig['frames'] / 2) <= 4, 'entero y acortado (1-2 de 4): la mitad, estéreo y 24 bit: ' + str(hi))
    rows = list(csv.reader(io.StringIO(z.read([x for x in nl if x.endswith('manifest.csv')][0]).decode())))
    ok(any(r[2] == 'dloop' and r[3] == 'Closed-Hats' and r[4] == 'loop' for r in rows[1:]), 'el manifiesto lo dice: Drum loop › Closed-Hats, loop')
    page.check('#org-panel input[name="orgfmt"][value="rhythm"]'); time.sleep(0.3)
    with page.expect_download(timeout=60000) as d: page.click('#org-panel [data-act="org-zip"]')
    z = zipfile.ZipFile(d.value.path()); h = [x for x in z.namelist() if x.endswith('/Closed-Hats/' + HL)]
    ri = wav_info(z.read(h[0])) if h else {}
    ok(ri.get('ch') == 1 and ri.get('sr') == 48000 and ri.get('bits') == 16, 'para la Rhythm: 48 kHz · mono · 16 bit: ' + str(ri))
    ok(J('() => window.__crsl.S.set.org.fmt') == 'rhythm', 'recuerda el formato')
    # 11. un sample suelto: «como el original · entero» también sale acortado
    sel(HL)
    page.click('#detail [data-act="s-exp"]'); page.wait_for_selector('#modal.on')
    page.check('#modal input[name="exfmt"][value="orig"]'); page.click('#modal [data-act="s-exp-n"][data-v="1"]'); time.sleep(0.1)
    with page.expect_download() as d: page.click('#modal [data-act="s-exp-go"]')
    one = wav_info(open(d.value.path(), 'rb').read())
    ok(one.get('ch') == 2 and abs(one.get('frames', 0) - orig['frames'] / 2) <= 4, 'exportar un loop acortado como el original, entero: la mitad y en estéreo')
    # 12. lo decidido antes de la 2.9 se coloca al abrir
    J('''async (n) => { const c = window.__crsl, s = c.S.samples.find((x) => x.name === n); s.user = { cat: "perc", kind: "loop", heard: true };
      const o = { ...s }; delete o._cls; delete o._clsKey; await c.S.lib.put("samples", o); }''', 'Perc Loop 2.wav')
    page.reload(); page.wait_for_selector('.tab'); time.sleep(1.2)
    u = U('Perc Loop 2.wav')
    ok(u.get('cat') == 'dloop' and u.get('sub') == 'perc', 'al abrir: un Perc marcado como loop pasa a Drum loop › Perc')
    ok(('placed by what plays' if EN else 'colocados por lo que suena') in page.locator('#toast').inner_text(), 'y lo dice')
    ok(U(HL).get('sub') == 'hat', 'lo demás sigue igual al recargar')

    bad = [e for e in errors if 'favicon' not in e]
    ok(not bad, 'sin errores en la consola' + (': ' + ' | '.join(bad[:3]) if bad else ''))
    br.close()
print(f'\n{sum(c for c, _ in checks)} de {len(checks)} comprobaciones')
sys.exit(0 if all(c for c, _ in checks) else 1)
