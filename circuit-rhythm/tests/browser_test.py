"""Prueba en Chrome sin pantalla: carpeta enlazada simulada, Web MIDI simulado, exportaciones reales.
Uso: python3 tests/browser_test.py dist/Circuit_Rhythm_Sample_Library.html /tmp/crsl_fixture [shots_dir]"""
import base64, io, json, os, sys, time, wave, zipfile
VER = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'package.json')))['version']
from playwright.sync_api import sync_playwright

HTML = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else 'dist/Circuit_Rhythm_Sample_Library.html')
FIX = sys.argv[2] if len(sys.argv) > 2 else '/tmp/crsl_fixture'
SHOTS = sys.argv[3] if len(sys.argv) > 3 else '/tmp/crsl_shots'
EN = '_EN' in HTML
os.makedirs(SHOTS, exist_ok=True)
DL = '/tmp/crsl_dl'; os.makedirs(DL, exist_ok=True)

MOCK = r"""
(() => {
  const sent = []; window.__midiSent = sent;
  const out = { id: 'o1', name: 'Circuit Rhythm MIDI', state: 'connected', send: (b) => sent.push(Array.from(b)) };
  const inp = { id: 'i1', name: 'Circuit Rhythm MIDI', state: 'connected', onmidimessage: null };
  navigator.requestMIDIAccess = async () => ({ outputs: new Map([['o1', out]]), inputs: new Map([['i1', inp]]), onstatechange: null });
  window.__midiIn = inp;
  class MFile { constructor(n, d) { this.kind = 'file'; this.name = n; this.data = d; }
    async getFile() { return new File([this.data], this.name); }
    async createWritable() { const self = this, chunks = []; return { write: async (d) => { chunks.push(d); }, close: async () => { self.data = new Blob(chunks); } }; }
    async isSameEntry(o) { return o === this; } async queryPermission() { return 'granted'; } async requestPermission() { return 'granted'; } }
  class MDir { constructor(n) { this.kind = 'directory'; this.name = n; this.children = new Map(); }
    async *entries() { for (const e of this.children) yield e; }
    async getDirectoryHandle(n, o = {}) { let d = this.children.get(n); if (!d) { if (!o.create) throw new DOMException('nf', 'NotFoundError'); d = new MDir(n); this.children.set(n, d); } return d; }
    async removeEntry(n) { if (!this.children.has(n)) throw new DOMException('nf', 'NotFoundError'); this.children.delete(n); }
    async getFileHandle(n, o = {}) { let f = this.children.get(n); if (!f) { if (!o.create) throw new DOMException('nf', 'NotFoundError'); f = new MFile(n, new Blob([])); this.children.set(n, f); } return f; }
    async isSameEntry(o) { return o === this; } async queryPermission() { return 'granted'; } async requestPermission() { return 'granted'; } }
  window.__mkFS = (name, files) => { const root = new MDir(name);
    for (const [p, b64] of Object.entries(files)) { const parts = p.split('/'); let d = root;
      for (let i = 0; i < parts.length - 1; i++) { if (!d.children.has(parts[i])) d.children.set(parts[i], new MDir(parts[i])); d = d.children.get(parts[i]); }
      const bin = b64 === null ? null : Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      if (bin) d.children.set(parts.at(-1), new MFile(parts.at(-1), new Blob([bin]))); }
    return root; };
  window.__listFS = async (d, pre = '') => { const out = []; for (const [k, v] of d.children) { if (v.kind === 'directory') { out.push(pre + k + '/'); out.push(...await window.__listFS(v, pre + k + '/')); } else out.push(pre + k + ':' + v.data.size); } return out; };
  window.__pickQueue = [];
  window.showDirectoryPicker = async () => { const d = window.__pickQueue.shift(); if (!d) throw new DOMException('abort', 'AbortError'); return d; };
})();
"""

checks = []
SD_JS = 'async () => { const { S } = window.__crsl; const files = {}; const p = S.packs[0]; let i = 0;\n  const wav = "UklGRiwAAABXQVZFZm10IBAAAAABAAEAgLsAAAB3AQACABAAZGF0YQgAAAAAAAEAAgADAA==";\n  for (const [k, id] of p.slots.entries()) { if (!id || i >= 5) continue; i++; files[`Rhythm/2/PCM/${String(k).padStart(2, "0")}__S${k}.wav`] = wav; }\n  files["Rhythm/2/Sessions/0.ncs"] = "AAAA"; window.__sdr = window.__mkFS("SD", files); window.__pickQueue.push(window.__sdr); }\n'
def ok(cond, msg):
    checks.append((bool(cond), msg)); print(('  ✓ ' if cond else '  ✗ ') + msg)

def wait_for(page, js, timeout=20):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if page.evaluate(js): return True
        except Exception: pass
        time.sleep(0.15)
    return False

def wait_idle(page, timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if page.evaluate('() => !window.__crsl || !window.__crsl.S.busy'): return True
        time.sleep(0.2)
    return False

def main():
    files = {}
    root = os.path.join(FIX, 'Samples')
    for d, _, fs in os.walk(root):
        for f in fs:
            p = os.path.join(d, f); rel = os.path.relpath(p, root)
            files[rel] = base64.b64encode(open(p, 'rb').read()).decode()

    errors = []
    with sync_playwright() as pw:
        br = pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required'])
        ctx = br.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
        ctx.add_init_script(MOCK)
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        page.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
        page.goto('file://' + HTML)
        page.wait_for_selector('.tab')
        ok(page.locator('.tab').count() == 8, 'ocho secciones')
        foot = page.inner_text('#foot')
        ok(('no afiliada a Novation' in foot or 'not affiliated with Novation' in foot) and ('v' + VER) in foot, 'pie con aviso de no afiliación y versión')
        ok(page.locator('meta[name="description"]').count() == 1 and page.locator('link[rel="icon"]').count() == 1, 'metadatos para la web e icono propio')
        href = page.get_attribute('[data-act="lang-switch"]', 'href')
        ok(href and href.endswith('.html') and (('_EN' in href) != EN), f'enlace al otro idioma ({href})')
        ok(page.locator('.compat').count() == 0, 'en Chrome de escritorio no hay avisos de compatibilidad')
        page.click('[data-act="about"] >> nth=0'); page.wait_for_selector('#bugrep')
        rep = page.input_value('#bugrep')
        ok(VER in rep and 'secure=true' in rep and 'midi=true' in rep, 'Acerca de: informe de fallos con versión y capacidades del navegador')
        page.click('#modal [data-act="modal-close"]')
        ok(page.locator('[data-act="link"]').count() >= 1, 'biblioteca vacía ofrece enlazar carpeta')

        # 1. enlazar carpeta (simulada)
        page.evaluate('([f]) => window.__pickQueue.push(window.__mkFS("Samples", f))', [files])
        page.click('[data-act="link"] >> nth=0')
        time.sleep(0.5); wait_idle(page, 120)
        info = page.evaluate("""() => { const { S, clsOf } = window.__crsl; const by = {}; for (const s of S.samples) { const c = clsOf(s); by[s.name] = { cat: c.cat, cert: c.cert, basis: c.basis, conflict: c.conflict, paths: s.paths.length, a: s.analysis && { err: s.analysis.error, lead: s.analysis.leadMs, act: s.analysis.activeDur, corr: s.analysis.corr, bpm: s.analysis.loopBpm }, src: s.src.kind }; } return { n: S.samples.length, by }; }""")
        by = info['by']
        ok(info['n'] == 20, f"20 samples únicos (copias exactas y basura fuera): {info['n']}")
        exp = {'BD Dark 01.wav': 'kick', 'HH Closed 01.wav': 'hat', 'Open Hat 01.wav': 'ohat', 'Clap 909.wav': 'clap', 'Snare Tight.wav': 'snare', 'Shaker.aif': 'perc',
               'Sub A1.wav': 'bass', 'Reese Bass.wav': 'bass', 'Stab Cm.wav': 'synth', 'Riser 01.wav': 'fx', 'Wide Pad.wav': 'atmos', 'Top Loop 128bpm.wav': 'dloop', 'Acid Loop 130bpm Am.wav': 'mloop'}
        for k, v in exp.items():
            got = by.get(k, {})
            want = ('confirmed', 'onehint') if k == 'Shaker.aif' else ('confirmed',)  # un shaker suena como un hat: familia compatible, no confirma
            ok(got.get('cat') == v and got.get('cert') in want, f"{k} → {v} {'/'.join(want)} ({got.get('cat')}, {got.get('cert')}, {got.get('basis')})")
        ok(by['sample_007.wav']['cat'] == 'kick' and by['sample_007.wav']['cert'] == 'sound', 'sin nombre útil: kick «por el sonido»')
        ok(by['Kick 99.wav']['cert'] == 'doubt' and by['Kick 99.wav']['conflict'], 'se llama Kick y suena a hat: dudoso')
        ok(by['HH Closed 01.wav']['paths'] == 2, 'copia exacta en otra carpeta: una sola ficha con 2 rutas')
        ok(by['broken.wav']['a']['err'], 'archivo dañado: error legible, no rompe la importación')
        ok(abs(by['Kick Rumble 03.wav']['a']['lead'] - 200) < 3, f"silencio inicial medido ({by['Kick Rumble 03.wav']['a']['lead']:.1f} ms)")
        ok(by['Wide Pad.wav']['a']['corr'] < -0.9, 'estéreo en contrafase detectado')
        wp = page.evaluate("() => { const a = window.__crsl.S.samples.find((s) => s.name === 'Wide Pad.wav').analysis; return [a.peakDb, a.note || null, a.chordLike || false]; }")
        ok(wp[0] > -12 and wp[1] is None and wp[2], f'pad en contrafase: nivel del canal útil ({wp[0]:.1f} dBFS) y acorde sin nota falsa')
        ok(by['Field Rec.wav']['a']['act'] > 30, 'sample de más de 30 s detectado')
        ok(abs(by['Top Loop 128bpm.wav']['a']['bpm'] - 128) < 0.5, 'tempo del loop medido')
        ok(all(v['src'] == 'root' for v in by.values()), 'carpeta enlazada: nada copiado al navegador')
        page.screenshot(path=f'{SHOTS}/01_biblioteca.png', full_page=False)

        # 2. ficha, reproducción, preparación
        page.evaluate("""() => { const { S } = window.__crsl; S.sel = S.samples.find((s) => s.name === 'Wide Pad.wav').id; window.__crsl.renderAll(); }""")
        page.wait_for_selector('#wave')
        ok('cancela' in page.inner_text('#detail') or 'cancels' in page.inner_text('#detail'), 'la ficha avisa de la cancelación en mono')
        page.keyboard.press('Space'); time.sleep(0.6)
        ok(page.evaluate('() => window.__crsl.Player.playing || window.__crsl.S.byId[window.__crsl.S.sel].user.heard'), 'Espacio reproduce (versión Rhythm)')
        page.keyboard.press('Escape')
        page.select_option('select[data-rc="mono"]', 'left'); time.sleep(0.3)
        ok(page.evaluate("() => window.__crsl.S.byId[window.__crsl.S.sel].recipe.mono") == 'left', 'receta: mono por canal izquierdo guardada')
        page.screenshot(path=f'{SHOTS}/02_ficha.png', full_page=True)
        # 3. decisiones por teclado en la biblioteca
        page.evaluate("""() => { const { S } = window.__crsl; S.sel = S.samples.find((s) => s.name === 'sample_007.wav').id; window.__crsl.renderAll(); }""")
        page.keyboard.press('Enter'); page.keyboard.press('4'); page.keyboard.press('f'); time.sleep(0.3)
        u = page.evaluate("() => window.__crsl.S.samples.find((s) => s.name === 'sample_007.wav').user")
        ok(u.get('cat') == 'kick' and u.get('rating') == 4 and u.get('fav'), 'Intro acepta, 4 valora, F favorito')

        # 4. escucha
        page.click('.tab[data-view="listen"]'); time.sleep(0.3)
        q = page.evaluate('() => window.__crsl.S.listen.queue.map((id) => window.__crsl.S.byId[id].name)')
        ok('Kick 99.wav' in q, f'la cola de dudosos incluye «Kick 99» ({len(q)} en cola)')
        while page.evaluate('() => { const L = window.__crsl.S.listen; return L.queue[L.i] && window.__crsl.S.byId[L.queue[L.i]].name !== "Kick 99.wav"; }'):
            page.keyboard.press('ArrowRight'); time.sleep(0.05)
        page.screenshot(path=f'{SHOTS}/03_escucha.png', full_page=True)
        page.keyboard.press('h'); time.sleep(0.4)
        c = page.evaluate("() => { const s = window.__crsl.S.samples.find((s) => s.name === 'Kick 99.wav'); return [s.user.cat, window.__crsl.clsOf(s).cert]; }")
        ok(c == ['hat', 'user'], 'H decide «Closed hat» y avanza')

        # 5. packs
        page.click('.tab[data-view="packs"]'); page.click('[data-act="pack-new"]'); time.sleep(0.3)
        page.select_option('#ab-cert', 'any'); page.click('[data-act="autobuild"]'); time.sleep(0.6)
        pk = page.evaluate("""() => { const { S, packChecks } = window.__crsl; const p = S.pack; const c = packChecks(p); return { used: p.slots.filter(Boolean).length, total: c.b.total, first: S.byId[p.slots[0]] && S.byId[p.slots[0]].name, issues: c.issues.map((i) => i.k) }; }""")
        ok(pk['used'] >= 14 and pk['total'] <= 228, f"constructor: {pk['used']} slots, {pk['total']:.1f} s ≤ 228 s")
        ok(pk['first'] in ('BD Dark 01.wav', 'BD Dark 02.wav', 'Kick Rumble 03.wav', 'sample_007.wav'), f"slot 1 = un kick ({pk['first']})")
        page.click('.pad[data-i="0"]'); time.sleep(0.2)
        page.drag_and_drop('.pad[data-i="0"]', '.pad[data-i="5"]'); time.sleep(0.3)
        sw = page.evaluate('() => [!!window.__crsl.S.pack.slots[5], window.__crsl.S.pack.slots[0]]')
        ok(sw[0], 'arrastrar un slot a otro los intercambia')
        page.keyboard.press('Control+z'); time.sleep(0.3)
        ok(page.evaluate('() => !!window.__crsl.S.pack.slots[0]'), 'Ctrl+Z deshace')
        page.screenshot(path=f'{SHOTS}/04_packs.png', full_page=True)

        # 6. exportar a Components
        with page.expect_download(timeout=60000) as d:
            page.click('[data-act="exp-components"]')
        path = os.path.join(DL, d.value.suggested_filename); d.value.save_as(path)
        z = zipfile.ZipFile(path); names = z.namelist(); idx = json.loads(z.read('index.json'))
        ok(path.endswith('.circuitrhythmpack') and names[-1] == 'index.json', 'pack .circuitrhythmpack con index.json al final')
        ok(idx['product'] == 'circuit-rhythm' and len(idx['projects']) == 64 and len(idx['samples']) == 128 and len(idx['gridEffects']) == 16, 'index.json: 64 proyectos, 128 samples, 16 Grid FX')
        wavs = [n for n in names if n.startswith('samples/sample_')]
        params = set()
        for n in wavs:
            w = wave.open(io.BytesIO(z.read(n))); params.add((w.getframerate(), w.getnchannels(), w.getsampwidth())); ok(w.getnframes() <= 30 * 48000, f'{n} ≤ 30 s') if w.getnframes() > 29 * 48000 else None
        ok(params == {(48000, 1, 2)}, f'todos los WAV a 48 kHz · mono · 16 bit ({len(wavs)} samples)')
        ok(len(wavs) == pk['used'], 'un WAV por slot ocupado')
        ok(z.read('projects/project_3.ncs')[:4] == b'INIT' and len(z.read('projects/project_3.ncs')) == 169092, 'proyectos vacíos con la plantilla de Components')
        tot = sum(wave.open(io.BytesIO(z.read(n))).getnframes() for n in wavs) / 48000
        ok(abs(tot - pk['total']) < 0.5 + 0.02 * len(wavs), f'tiempo real exportado {tot:.2f} s ≈ previsto {pk["total"]:.2f} s')

        # 7. tarjeta SD (simulada, con Rhythm/0 ya ocupado)
        page.evaluate('() => { window.__sd = window.__mkFS("SDCARD", { "Rhythm/0/PCM/00__Old.wav": "AAAA" }); window.__pickQueue.push(window.__sd); }')
        page.click('[data-act="exp-sd"]'); page.wait_for_selector('#sd-go')
        page.click('#sd-go'); time.sleep(0.2)
        ok(page.locator('#sd-go').count() == 1, 'tarjeta: sin marcar la copia de seguridad no continúa')
        page.check('#sd-ok'); page.click('#sd-go')
        page.wait_for_selector('#sdnum')
        ok(page.eval_on_selector('#sdnum', 'e => e.value') == '1', 'tarjeta: propone la primera posición libre (1), Rhythm/0 ya existe')
        page.click('#sdgo'); time.sleep(1.0); wait_idle(page)
        lst = page.evaluate('() => window.__listFS(window.__sd)')
        pcm = [x for x in lst if x.startswith('Rhythm/1/PCM/') and x.endswith('.wav') is False and '.wav:' in x]
        ok('Rhythm/1/meta/' in lst and 'Rhythm/1/Sessions/' in lst and len(pcm) == pk['used'], f'tarjeta: Rhythm/1 con meta, Sessions y {len(pcm)} WAV')
        ok('Rhythm/0/PCM/00__Old.wav:3' in lst, 'el pack que ya estaba en la tarjeta no se toca')
        ok(any(x.startswith('Rhythm/1/PCM/00__') for x in pcm), f'nombres NN__Nombre.wav ({pcm[0] if pcm else "-"})')
        # 8. ZIP para la SD
        page.click('[data-act="exp-sdzip"]'); page.wait_for_selector('#sdnum'); page.select_option('#sdnum', '3')
        with page.expect_download(timeout=60000) as d:
            page.click('#sdgo')
        p2 = os.path.join(DL, d.value.suggested_filename); d.value.save_as(p2)
        zn = zipfile.ZipFile(p2).namelist()
        ok('Rhythm/3/meta/' in zn and 'Rhythm/3/Sessions/' in zn and any(n.startswith('Rhythm/3/PCM/00__') for n in zn), 'ZIP SD: Rhythm/3/{meta,Sessions,PCM/00__…}')
        # 9. WAV + CSV
        with page.expect_download(timeout=60000) as d:
            page.click('[data-act="exp-wav"]')
        p3 = os.path.join(DL, d.value.suggested_filename); d.value.save_as(p3)
        zw = zipfile.ZipFile(p3); csvn = [n for n in zw.namelist() if n.endswith('pack.csv')]
        ok(csvn and zw.read(csvn[0]).decode().startswith('slot,sd_file'), 'WAV numerados + CSV')

        # 10. reimportar el pack exportado
        with page.expect_file_chooser() as fc:
            page.click('.tab[data-view="data"]'); time.sleep(0.2); page.click('[data-act="pick-pack"]')
        fc.value.set_files(path); time.sleep(1.5); wait_idle(page)
        rp = page.evaluate('() => { const { S } = window.__crsl; return [S.packs.length, S.pack.slots.filter(Boolean).length, S.samples.length]; }')
        ok(rp[0] == 2 and rp[1] == pk['used'], f'pack reimportado: {rp[1]} slots en su sitio')
        ok(rp[2] == 20, f'reimportar un pack propio no duplica samples ({rp[2]})')

        # 11. MIDI
        page.click('.tab[data-view="device"]'); page.click('[data-act="midi-connect"]'); time.sleep(0.4)
        page.fill('#dev-slot', '5'); page.click('[data-act="dev-audition"]'); time.sleep(0.2)
        sent = page.evaluate('() => window.__midiSent')
        ok([0xB0, 8, 4] in sent and [0x90, 60, 100] in sent, 'CC 8 = slot 5 (valor 4) y nota 60 en el canal 1')
        page.select_option('select[data-chan="0"]', '10'); page.select_option('#dev-track', '0')
        page.click('[data-act="dev-audition"]'); time.sleep(0.2)
        ok([0xB9, 8, 4] in page.evaluate('() => window.__midiSent'), 'canal configurable (pista 1 → canal 10)')
        page.evaluate('() => { const i = window.__midiIn; let t = 0; for (let k = 0; k < 49; k++) i.onmidimessage({ data: [0xf8], timeStamp: (t += 60000 / (125 * 24)) }); }')
        ok(abs(page.evaluate('() => window.__crsl.S.midi.bpm') - 125) < 0.3, 'tempo leído del reloj MIDI (125 BPM)')
        page.screenshot(path=f'{SHOTS}/05_equipo.png', full_page=True)

        # ---- v1.1 ----
        page.evaluate('() => { window.__midiSent.length = 0; }')
        page.select_option('select[data-chan="0"]', '1')
        page.select_option('select[data-tcc="12"]', '2'); time.sleep(0.1)
        ok([0xB0, 12, 2] in page.evaluate('() => window.__midiSent'), 'modo de reproducción Loop por CC 12')
        page.fill('#dev-slot', '3'); page.click('[data-act="sweep"][data-i="6"]'); time.sleep(0.2)
        sw = page.evaluate('() => window.__midiSent')
        lp = [x for x in sw if x[0] == 0xB0 and x[1] == 27]
        ok([0xB0, 8, 2] in sw and len(lp) > 40 and lp[-1][2] == 127 and max(x[2] for x in lp) == 127 and min(x[2] for x in lp) == 0, 'barrido LP Filter 0→127→0 sobre el slot 3 y vuelta al valor por defecto')
        page.evaluate('() => window.__crsl.S.pack = window.__crsl.S.packs[0]')
        page.click('.tab[data-view="patterns"]'); time.sleep(0.3)
        kit = page.evaluate('() => window.__crsl.packKit()')
        ok(kit[0] is not None and kit[0] < 16, f'kit por defecto: pista 1 = un slot de la página de kicks ({kit[0]})')
        page.select_option('#pt-style', 'rumble'); time.sleep(0.2)
        ok(page.evaluate('() => window.__crsl.curPat().opts.style') == 'rumble', 'generador: estilo rumble')
        page.click('[data-act="pt-steps"][data-v="32"]'); time.sleep(0.2)
        ok(page.locator('.prow').first.locator('.pc').count() == 32, 'rejilla de 32 pasos')
        before = page.evaluate('() => JSON.stringify(window.__crsl.curPat().lanes[1].steps[2])')
        page.locator('.prow').nth(1).locator('.pc').nth(2).click(); time.sleep(0.1)
        ok(page.evaluate('() => JSON.stringify(window.__crsl.curPat().lanes[1].steps[2])') != before, 'clic en la rejilla pone o quita un golpe')
        page.click('[data-act="pt-preview"]'); time.sleep(0.8)
        ok(page.evaluate('() => window.__crsl.S.patPlaying'), 'escucha local del patrón con los samples del kit')
        page.click('[data-act="pt-preview"]'); time.sleep(0.1)
        page.evaluate('() => { window.__midiSent.length = 0; }')
        page.click('[data-act="pt-rec"]'); page.click('[data-act="pt-rec-go"]'); time.sleep(0.5)
        rec = page.evaluate('() => window.__midiSent')
        ok(rec and rec[0][0] == 0xB0 and rec[0][1] == 8, 'grabar: primero el CC 8 de cada pista')
        ok([0xFA] in rec and sum(1 for x in rec if x == [0xF8]) == 32 * 6 and rec[-1] == [0xFC], 'grabar: Start, 192 relojes para 32 pasos y Stop')
        with page.expect_download() as d:
            page.click('[data-act="pt-mid"]')
        mp = os.path.join(DL, d.value.suggested_filename); d.value.save_as(mp)
        ok(open(mp, 'rb').read(4) == b'MThd', f'.mid exportado ({d.value.suggested_filename})')
        page.fill('#pt-name', 'Rumble A'); page.click('[data-act="pt-save"]'); time.sleep(0.2)
        ok(page.evaluate('() => window.__crsl.S.patterns.length') == 1, 'patrón guardado')
        page.screenshot(path=f'{SHOTS}/08_patrones.png', full_page=True)
        # ---- v1.3: canciones ----
        page.click('.tab[data-view="songs"]'); time.sleep(0.4)
        ok(page.locator('.strat').count() == 5 and page.locator('.arrlane').count() == 9, 'canciones: 5 estrategias y 8 carriles + energía')
        bars = page.evaluate('() => window.__crsl.curTimeline().bars')
        ok(bars >= 96 and bars % 8 == 0, f'estrategia DJ: {bars} compases en múltiplos de 8')
        page.click('button.strat[data-v="live"]'); time.sleep(0.3)
        tl = page.evaluate('() => window.__crsl.curTimeline()')
        ok(len(tl['sections']) == 8 and all(s['bars'] == 8 for s in tl['sections']), 'estrategia directo: 8 escenas de 8 compases')
        page.click('button.strat[data-v="dj"]'); time.sleep(0.2)
        fam0 = page.evaluate('() => JSON.stringify(window.__crsl.songState().fam.tracks[0])')
        page.click('[data-act="sg-lock"][data-i="0"]'); time.sleep(0.1)
        page.click('[data-act="sg-new"]'); time.sleep(0.3)
        ok(page.evaluate('() => JSON.stringify(window.__crsl.songState().fam.tracks[0])') == fam0 and page.evaluate('() => window.__crsl.songState().seed') == 2, 'otra canción conserva la pista con candado')
        sec0 = page.evaluate('() => JSON.stringify(window.__crsl.songState().sections)')
        fam1 = page.evaluate('() => JSON.stringify(window.__crsl.songState().fam)')
        page.click('[data-act="sg-struct"]'); time.sleep(0.2)
        ok(page.evaluate('() => JSON.stringify(window.__crsl.songState().fam)') == fam1, 'otra estructura no toca los patrones')
        page.click('[data-act="sg-play"]'); time.sleep(0.8)
        ok(page.evaluate('() => window.__crsl.S.songPlaying') and ('compás' in page.inner_text('#sg-pos') or 'bar' in page.inner_text('#sg-pos')), 'escucha de la canción con posición')
        page.click('[data-act="sg-play"]'); time.sleep(0.1)
        ok(not page.evaluate('() => window.__crsl.S.songPlaying'), 'parar la canción')
        with page.expect_download() as d:
            page.click('[data-act="sg-mid"]')
        mp = os.path.join(DL, d.value.suggested_filename); d.value.save_as(mp)
        ok(open(mp, 'rb').read(4) == b'MThd' and os.path.getsize(mp) > 2000, f'.mid de la canción ({os.path.getsize(mp)} bytes)')
        page.select_option('#sg-slot', index=2)
        page.click('[data-act="sg-topack"]'); time.sleep(0.6)
        ok(page.evaluate('() => !!(window.__crsl.S.pack.songs && window.__crsl.S.pack.songs[2])'), 'canción guardada como proyecto 3 del pack')
        rp = page.evaluate('() => { const d = window.__crsl.S.pack.songs[2].data; const r = window.__crsl.readProject(d); return { len: d.length, tempo: r.tempo, scenes: r.scenes.length }; }')
        ok(rp['len'] == 169092 and rp['scenes'] >= 8, f'proyecto .ncs de 169092 bytes con escenas ({rp})')
        page.screenshot(path=f'{SHOTS}/10_canciones.png', full_page=True)
        with page.expect_download(timeout=120000) as d:
            page.click('[data-act="sg-audio"]')
        ap = os.path.join(DL, d.value.suggested_filename); d.value.save_as(ap)
        za = zipfile.ZipFile(ap); an = za.namelist()
        mixn = [n for n in an if n.endswith('(mix).wav')]
        ok(mixn and any(n.endswith('.mid') for n in an) and any(n.endswith('.txt') for n in an), f'audio de la canción: ZIP con mezcla, .mid y hoja de ruta ({len(an)} archivos)')
        w = wave.open(io.BytesIO(za.read(mixn[0]))); ok(w.getframerate() == 48000 and w.getnframes() > 48000 * 60, f'mezcla de {w.getnframes() / 48000:.0f} s a 48 kHz')
        with page.expect_download(timeout=60000) as d:
            page.evaluate('() => window.__crsl.exportComponents(window.__crsl.S.pack)')
        cp = os.path.join(DL, 'song_' + d.value.suggested_filename); d.value.save_as(cp)
        zc = zipfile.ZipFile(cp); ic = json.loads(zc.read('index.json'))
        ok(ic['projects'][2]['name'] != '' and zc.read('projects/project_2.ncs')[:4] == b'RUSE' and zc.read('projects/project_2.ncs') != zc.read('projects/project_5.ncs'), 'el .circuitrhythmpack lleva la canción en el proyecto 3')
        page.click('.tab[data-view="map"]'); time.sleep(0.4)
        ok(page.evaluate('() => window.__crsl.mapPoints().length') >= 18, 'mapa con todos los samples medidos')
        page.screenshot(path=f'{SHOTS}/09_mapa.png')
        page.click('.tab[data-view="library"]'); time.sleep(0.3)
        ok(page.locator('.kpi').count() == 6, 'fila de 6 cifras filtrables')
        page.click('.kpi[data-v="dups"]'); time.sleep(0.2)
        ok(page.evaluate('() => window.__crsl.filtered().length') == 1, 'cifra «copias idénticas» filtra')
        page.click('.kpi[data-v="all"]'); time.sleep(0.1)
        page.evaluate("() => { const { S } = window.__crsl; S.sel = S.samples.find((s) => s.name === 'Field Rec.wav').id; window.__crsl.renderAll(); }")
        txt = page.inner_text('#detail')
        ok('6 de 7' in txt or '6 of 7' in txt, 'revisión: 6 de 7 en un sample de más de 30 s')
        page.evaluate("() => { const { S } = window.__crsl; S.sel = S.samples.find((s) => s.name === 'Top Loop 128bpm.wav').id; window.__crsl.renderAll(); }")
        ok(page.locator('[data-act="fit-on"]').count() == 0, 'un loop ya cortado a compás no ofrece ajuste')
        page.select_option('#slices', '4'); time.sleep(0.1)
        wb = page.locator('#wave').bounding_box()
        page.mouse.click(wb['x'] + wb['width'] * 0.6, wb['y'] + wb['height'] / 2); time.sleep(0.3)
        ok(page.evaluate('() => { const P = window.__crsl.Player; return P.playing && P.off > 1.5; }'), 'clic en la slice 3 de 4 la reproduce sola')
        page.click('[data-act="ab"] >> nth=0'); time.sleep(0.2)
        a1 = page.evaluate('() => window.__crsl.Player.key'); page.keyboard.press('Tab'); time.sleep(0.3)
        ok(page.evaluate('() => window.__crsl.Player.key') != a1 and page.evaluate('() => window.__crsl.S.abSide') == 'A', 'A/B: Tab alterna entre los dos samples')
        page.evaluate("() => { const { S } = window.__crsl; const s = S.samples.find((s) => s.name === 'Acid Loop 130bpm Am.wav'); s.analysis = { ...s.analysis, activeDur: 3.6, dur: 3.6 }; s._cls = null; S.sel = s.id; window.__crsl.renderAll(); }")
        page.click('[data-act="fit-on"]'); time.sleep(0.3)
        ok(abs(page.evaluate("() => window.__crsl.S.byId[window.__crsl.S.sel].recipe.fitSec") - 8 * 60 / 130) < 1e-6, 'loop ajustado a 8 tiempos a 130 BPM (el BPM del nombre)')
        page.evaluate('() => { window.__midiSent.length = 0; }')
        page.evaluate("() => { const { S } = window.__crsl; S.pack = S.packs[0]; S.sel = S.pack.slots.find(Boolean); window.__crsl.renderAll(); }")
        page.keyboard.press('Shift+Digit7'); time.sleep(0.2)
        ok(any(x[:2] == [0xB0, 27] for x in page.evaluate('() => window.__midiSent')), 'Mayús+7 barre la macro LP Filter del sample seleccionado')
        page.click('.tab[data-view="packs"]'); page.keyboard.press('/'); time.sleep(0.2)
        ok(page.evaluate('() => window.__crsl.S.view == "library" && document.activeElement.id == "q"'), 'la tecla / busca desde cualquier vista')
        page.keyboard.press('Escape')
        page.click('.tab[data-view="data"]'); time.sleep(0.3)
        cal = page.evaluate('() => window.__crsl.calibration()')
        ok(cal['tot'] >= 2, f"calibración con {cal['tot']} decisiones")
        page.evaluate('() => { window.__org = window.__mkFS("DEST", {}); window.__pickQueue.push(window.__org); }')
        page.click('[data-act="org-dir"]'); time.sleep(0.5); wait_idle(page, 60); time.sleep(0.5)
        org = page.evaluate('() => window.__listFS(window.__org)')
        ok(any('/01 Kicks/One-shots/' in x and '/BD Dark 01.wav:' in x for x in org) and any('manifest.csv:' in x for x in org), f'ordenar en disco: carpeta con fecha, 01 Kicks y manifiesto ({len(org)} entradas)')
        page.evaluate(SD_JS)
        page.click('[data-act="sd-read"]'); time.sleep(0.6)
        sdp = page.evaluate('() => window.__crsl.S.sdPacks.map((p) => [p.name, p.files.length, p.sessions])')
        ok(sdp == [['2', 5, 1]], f'lectura de la tarjeta: Rhythm/2 con 5 samples y 1 proyecto ({sdp})')
        np = page.evaluate('() => window.__crsl.S.packs.length')
        page.click('[data-act="sd-import"]'); time.sleep(0.4); wait_idle(page); time.sleep(0.4)
        ok(page.evaluate('() => window.__crsl.S.packs.length') == np + 1 and page.evaluate('() => window.__crsl.S.pack.slots.filter(Boolean).length') == 5, 'pack de la tarjeta importado en sus slots')
        page.click('.tab[data-view="data"]'); time.sleep(0.3)
        page.screenshot(path=f'{SHOTS}/10_datos.png', full_page=True)

        # 12. copia, biblioteca nueva, restaurar
        page.click('.tab[data-view="data"]')
        with page.expect_download() as d:
            page.click('[data-act="backup"] >> nth=-1')
        pb = os.path.join(DL, 'backup.json'); d.value.save_as(pb)
        bj = json.load(open(pb)); ok(bj['app'] == 'circuit-rhythm-sample-library' and len(bj['samples']) == page.evaluate('() => window.__crsl.S.samples.length') and len(bj.get('patterns', [])) == 1, 'copia de seguridad con todas las fichas y los patrones')
        page.screenshot(path=f'{SHOTS}/06_datos.png', full_page=True)
        page.fill('#wipe-word', 'X'); page.click('[data-act="wipe"]'); time.sleep(0.2)
        ok(page.evaluate('() => window.__crsl.S.samples.length') > 0, 'sin la palabra de confirmación no borra')
        page.fill('#wipe-word', 'DELETE' if EN else 'BORRAR'); page.click('[data-act="wipe"]')
        wait_for(page, '() => window.__crsl.S.samples.length === 0 && !!document.querySelector("#wipe-word")')
        ok(page.evaluate('() => window.__crsl.S.samples.length') == 0, 'biblioteca nueva vacía')
        time.sleep(0.5); page.reload(); page.wait_for_selector('.tab'); wait_for(page, '() => !!window.__crsl')
        ok(page.evaluate('() => window.__crsl.S.samples.length') == 0, 'sigue vacía tras recargar')
        with page.expect_file_chooser() as fc:
            page.click('.tab[data-view="data"]'); time.sleep(0.2); page.click('[data-act="restore"]')
        fc.value.set_files(pb); wait_for(page, '() => Object.keys(window.__crsl.S.pending).length >= 20')
        ok(page.evaluate('() => Object.keys(window.__crsl.S.pending).length') >= 20, 'restaurar sin audio deja las fichas pendientes')
        with page.expect_file_chooser() as fc:
            page.click('[data-act="pick-dir"]')
        fc.value.set_files(os.path.join(FIX, 'Samples')); wait_for(page, '() => window.__crsl.S.samples.length >= 20 && !window.__crsl.S.busy', 120)
        u = page.evaluate("() => { const s = window.__crsl.S.samples.find((s) => s.name === 'sample_007.wav'); return s && s.user; }")
        ok(u and u.get('rating') == 4 and u.get('fav'), 'al reimportar los archivos, cada ficha vuelve a su sample (SHA-256)')
        ok(page.evaluate("() => window.__crsl.S.samples.every((s) => s.src.kind === 'blob')"), 'copiar carpeta: audio guardado en el navegador')
        page.click('.tab[data-view="library"]'); time.sleep(0.3)
        page.set_viewport_size({'width': 393, 'height': 850}); time.sleep(0.3)
        page.screenshot(path=f'{SHOTS}/07_movil.png', full_page=False)
        page.set_viewport_size({'width': 1440, 'height': 1000})

        errs = [e for e in errors if 'favicon' not in e]
        ok(not errs, 'sin errores en la consola' + ('' if not errs else ': ' + ' | '.join(errs[:5])))
        br.close()

    bad = [m for c, m in checks if not c]
    print(f'\n{len(checks) - len(bad)} correctas, {len(bad)} con fallo')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
