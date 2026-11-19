# Canciones (v2.7): estrategia, candado, escucha y grabación guiada con un Circuit Tracks SIMULADO, .mid y hoja de ruta.
import sys, os, re, threading, http.server, functools, struct
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
import json
VER = json.load(open(os.path.join(ROOT, 'package.json')))['version']
SHOTS = os.path.join(ROOT, 'tests', 'shots'); os.makedirs(SHOTS, exist_ok=True)
SRC = open(os.path.join(ROOT, 'tests', 'browser_test.py')).read()
FAKE_MIDI = re.search(r'FAKE_MIDI = """(.*?)"""', SRC, re.S).group(1)
FILE = sys.argv[1] if len(sys.argv) > 1 else 'Circuit_Tracks_Patch_Library_Editor.html'
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8772), functools.partial(Q, directory=os.path.join(ROOT, 'dist'))); threading.Thread(target=srv.serve_forever, daemon=True).start()
results = []; errors = []
def ok(name, cond, extra=''):
    results.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name + (' · ' + str(extra) if extra != '' else ''))
def mid_tracks(b):
    assert b[:4] == b'MThd'; fmt, ntrk, ppq = struct.unpack('>HHH', b[8:14]); i = 14; names = []
    for _ in range(ntrk):
        assert b[i:i+4] == b'MTrk'; ln = struct.unpack('>I', b[i+4:i+8])[0]; ch = b[i+8:i+8+ln]
        m = re.search(rb'\xff\x03(.)', ch); names.append(ch[m.end():m.end()+m.group(1)[0]].decode() if m else ''); i += 8 + ln
    return fmt, ntrk, names
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1500, 'height': 1000}, accept_downloads=True); ctx.add_init_script(FAKE_MIDI)
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    pg.goto('http://127.0.0.1:8772/' + FILE); pg.wait_for_selector('.top .brand')
    pg.click('.tabs-main button[data-v="songs"]'); pg.wait_for_selector('.sg-tl')
    ok('Canciones: 5 estrategias y 8 carriles + energía', pg.locator('.sg-strat').count() == 5 and pg.locator('.sg-tl .sg-lane').count() == 10)
    tl = pg.evaluate('window.__ctpl.songTl'); ok('DJ: compases en múltiplos de 8', tl['bars'] % 8 == 0 and tl['bars'] >= 96, tl['bars'])
    ok('MIDI 1 y 2 desactivadas por defecto', pg.locator('.sg-lane.off').count() == 2)
    with pg.expect_download() as d: pg.click('button[data-act="sgMidi"]')
    path = d.value.path(); data = open(path, 'rb').read(); fmt, ntrk, names = mid_tracks(data)
    ok('.mid de la canción: SMF tipo 1 con 6 pistas + tempo', fmt == 1 and ntrk == 7 and names[1:] == ['Synth 1', 'Synth 2', 'Drum 1', 'Drum 2', 'Drum 3', 'Drum 4'], (fmt, ntrk, names))
    pg.click('button[data-act="sgStrat"][data-v="live"]'); tl = pg.evaluate('window.__ctpl.songTl')
    ok('Directo: 8 escenas de 8 compases', len(tl['sections']) == 8 and all(s['bars'] == 8 for s in tl['sections']))
    pg.click('button[data-act="sgStrat"][data-v="dj"]')
    f0 = pg.evaluate('JSON.stringify(window.__ctpl.S.song.fam.tracks[0])')
    pg.click('button[data-act="sgLock"][data-i="0"]'); pg.click('button[data-act="sgNew"]')
    ok('Otra canción conserva la pista con candado', pg.evaluate('JSON.stringify(window.__ctpl.S.song.fam.tracks[0])') == f0 and pg.evaluate('window.__ctpl.S.song.fam.tracks[4]') != None)
    fam = pg.evaluate('JSON.stringify(window.__ctpl.S.song.fam)'); pg.click('button[data-act="sgStruct"]')
    ok('Otra estructura no toca los patrones', pg.evaluate('JSON.stringify(window.__ctpl.S.song.fam)') == fam)
    pg.click('button[data-act="sgMore"]'); pg.check('input[data-k="midi0"]'); ok('Activar MIDI 1', pg.locator('.sg-lane.off').count() == 1 and pg.locator('.sg-rm th').count() == 3 + 8)  # 7 pistas + MIDI 2 como reloj de escenas
    with pg.expect_download() as d: pg.click('button[data-act="sgSheet"]')
    txt = open(d.value.path(), encoding='utf-8').read(); ok('Hoja de ruta en texto', 'MIDI 1' in txt and ('Escenas' in txt or 'Scenes' in txt), txt[:80])
    pg.evaluate("document.querySelector('#full').scrollTop=0"); pg.screenshot(path=SHOTS + '/20_songs.png')
    # equipo simulado
    pg.click('.tabs-main button[data-v="device"]'); pg.click('button[data-act="midiConnect"]'); pg.wait_for_timeout(300)
    pg.click('.tabs-main button[data-v="songs"]'); pg.evaluate('window.__midiSent.length=0')
    pg.click('button.sg-sec[data-from="4"]'); pg.wait_for_timeout(900)
    sent = pg.evaluate('window.__midiSent'); chans = sorted({a[0] & 15 for a in sent if (a[0] & 0xF0) == 0x90})
    ok('Escuchar en el Circuit desde el drop: notas en sus canales, sin transporte', 9 in chans and 0 in chans and not any(a[0] in (0xFA, 0xF8) for a in sent), chans)
    pg.click('button[data-act="sgStop"]'); ok('Parar', not pg.evaluate('window.__ctpl.S.sgPlaying'))
    pg.click('button[data-act="sgStrat"][data-v="live"]'); pg.evaluate('window.__midiSent.length=0')
    pg.click('button[data-act="sgRec"]'); pg.click('.modal .btn.primary')
    pg.wait_for_selector('.modal h3:has-text("1")'); pg.click('.modal .btn.primary'); pg.wait_for_timeout(250)
    pg.wait_for_function('!window.__ctpl.S.recording', timeout=15000); pg.wait_for_selector('.modal')
    sent = pg.evaluate('window.__midiSent'); clocks = sum(1 for a in sent if a == [0xF8])
    ok('Grabación guiada: patrón 1 con un Start, 96 relojes (16 pasos) y Stop', sent.count([0xFA]) == 1 and clocks == 96 and sent[-1] == [0xFC], (sent.count([0xFA]), clocks))
    ok('Patrón 1 marcado como grabado', pg.evaluate('window.__ctpl.S.song.recorded[0]') == True)
    pg.click('.modal .btn >> nth=0'); pg.wait_for_timeout(200)
    if pg.locator('.modal').count(): pg.click('.modal .btn')
    pg.screenshot(path=SHOTS + '/21_songs_rec.png', full_page=True)
    pg.reload(); pg.wait_for_selector('.top .brand'); pg.click('.tabs-main button[data-v="songs"]')
    ok('La canción se conserva al recargar', pg.evaluate('window.__ctpl.S.song.strategy') == 'live' and pg.evaluate('window.__ctpl.S.song.locked') == [0])
    foot = pg.inner_text('#foot'); ok('Pie con aviso de no afiliación, versión y cambio de idioma', ('Novation' in foot) and ('v' + VER) in foot and ('English' in foot or 'Español' in foot or pg.locator('#foot .langsw').count() == 1), foot[:90])
    pg.click('#foot a[data-act="about"]'); pg.wait_for_selector('#bugrep')
    rep = pg.input_value('#bugrep'); ok('Acerca de: informe con versión, navegador y capacidades', VER in rep and 'midi=true' in rep and 'patches=' in rep, rep[:60])
    pg.click('.modal .btn.primary')
    ok('Metadatos para la web', pg.evaluate("!!document.querySelector('meta[name=description]') && !!document.querySelector('link[rel=icon]') && !!document.querySelector('meta[property=\"og:title\"]')"))
    ok('Sin errores JavaScript', not errors, errors[:3])
    b.close()
print(f'{sum(results)}/{len(results)} comprobaciones superadas'); srv.shutdown(); sys.exit(0 if all(results) else 1)
