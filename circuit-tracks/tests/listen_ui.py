# v3.10: Escucha (carpeta del patch que suena, frase de prueba con notas y octava, «Otro» en la columna acoplada)
# y «un sonido, una versión» (ediciones que se suman, propuestas, duplicar, ordenar lo antiguo). Equipo SIMULADO.
import sys, os, re, threading, http.server, functools
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FAKE_MIDI = re.search(r'FAKE_MIDI = """(.*?)"""', open(os.path.join(ROOT, 'tests', 'browser_test.py')).read(), re.S).group(1)
FILE = sys.argv[1] if len(sys.argv) > 1 else 'Circuit_Tracks_Patch_Library_Editor.html'
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8779), functools.partial(Q, directory=os.path.join(ROOT, 'dist'))); threading.Thread(target=srv.serve_forever, daemon=True).start()
res = []; errors = []
def ok(name, cond, extra=''): res.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name + (' · ' + str(extra) if extra != '' else ''))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1500, 'height': 900}); ctx.add_init_script(FAKE_MIDI)
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
    E = pg.evaluate
    ons = lambda: sorted({a[1] for a in E('window.__midiSent') if (a[0] & 0xF0) == 0x90 and a[2] > 0})
    pg.goto('http://127.0.0.1:8779/' + FILE); pg.wait_for_selector('.top .brand')
    pg.set_input_files('#dirIn', os.path.join(ROOT, 'tests', 'out')); pg.wait_for_selector('.modal', timeout=60000); pg.click('.modal .btn'); pg.wait_for_timeout(300)
    pg.click('.tabs-main button[data-v="device"]'); pg.click('button[data-act="midiConnect"]'); pg.wait_for_timeout(300)
    n0 = E("window.__ctpl.lib.faces().length")
    # --- Escucha con la columna acoplada; en la Biblioteca había otro patch seleccionado ---
    other = E("window.__ctpl.lib.patches[7].id"); E(f"window.__ctpl.S.sel='{other}'")
    pg.click('.tabs-main button[data-v="audition"]'); pg.wait_for_timeout(200)
    pg.select_option('select[data-act="qsrc"]', 'all'); pg.wait_for_timeout(200); pg.keyboard.press('.'); pg.wait_for_timeout(300)
    qid = E("window.__ctpl.S.queue[window.__ctpl.S.qi]")
    pg.select_option('.dock select[data-act="setCat"]', 'lead'); pg.wait_for_timeout(300)
    ok('Columna acoplada en Escucha: la categoría cambia en el patch que suena, no en el de la Biblioteca', E(f"window.__ctpl.lib.byId('{qid}').meta.category") == 'lead' and E(f"window.__ctpl.lib.byId('{other}').meta.category") != 'lead' and pg.locator('.modal').count() == 0)
    qi0 = E("window.__ctpl.S.qi")
    pg.select_option('.stage select[data-act="audCatSel"]', 'bass'); pg.wait_for_timeout(250)
    pg.click('.stage button[data-act="audSub"][data-s="sub"]'); pg.wait_for_timeout(250)
    ok('Escucha: carpeta y subcarpeta del que suena, directamente y sin pasar al siguiente', E(f"[window.__ctpl.lib.byId('{qid}').meta.category, window.__ctpl.lib.byId('{qid}').meta.subtype].join('/')") == 'bass/sub' and E("window.__ctpl.S.qi") == qi0)
    E("window.__ctpl.S.autoNext = false"); pg.keyboard.press('Enter'); pg.wait_for_timeout(250)
    ok('Intro confirma tu carpeta (no la cambia por la propuesta)', E(f"window.__ctpl.lib.byId('{qid}').meta.subtype") == 'sub' and E(f"window.__ctpl.lib.byId('{qid}').meta.review") == 'listened')
    # --- «Otro» en la columna acoplada: suena el patrón nuevo y la columna no vuelve arriba ---
    E("document.querySelector('.dock').scrollTop = 300"); y0 = E("document.querySelector('.dock').scrollTop")
    E('window.__midiSent.length = 0'); n_before = E("JSON.stringify(window.__ctpl.S.autoCache?.pat?.notes || [])")
    E("document.querySelector('.dock [data-act=\"autoNext\"]').click()"); pg.wait_for_timeout(500)
    gen = sorted({x['n'] for x in E("window.__ctpl.S.autoCache.pat.notes")})
    ok('«Otro» genera otra variación y la toca (lo que se ve es lo que suena)', E("JSON.stringify(window.__ctpl.S.autoCache.pat.notes)") != n_before and ons() == gen, (ons(), gen))
    ok('…y la columna se queda donde estaba', y0 > 0 and E("document.querySelector('.dock').scrollTop") == y0, (y0, E("document.querySelector('.dock').scrollTop")))
    # --- frase de prueba: notas visibles y octava ---
    txt = pg.inner_text('.stage .tnotes')
    ok('Frase de prueba: tónica, notas y cómo suena', all(w in txt.upper() for w in (['TÓNICA', 'NOTAS', 'SUENA'] if '_EN' not in FILE else ['ROOT', 'NOTES', 'SOUNDS'])) and re.search(r'(Do|C)1', txt), txt.replace('\n', ' '))
    pay0 = E(f"Array.from(window.__ctpl.lib.currentVersion(window.__ctpl.lib.byId('{qid}')).payload).join()")
    E('window.__midiSent.length = 0'); pg.keyboard.press('<'); pg.wait_for_timeout(500)
    low = ons()
    ok('Tecla <: la frase suena una octava más abajo y no cambia el patch', low == [n - 12 for n in gen] and E(f"Array.from(window.__ctpl.lib.currentVersion(window.__ctpl.lib.byId('{qid}')).payload).join()") == pay0, low)
    ok('…y se recuerda para su grupo (Bass / Subs)', E("JSON.stringify(window.__ctpl.lib.settings.phraseOct)") == '{"bass/sub":-12}' and re.search(r'(Do|C)0', pg.inner_text('.stage .tnotes')))
    pg.click('.stage button[data-act="phOct"][data-d="12"]'); pg.wait_for_timeout(300)
    ok('8va ▶ la devuelve', E("window.__ctpl.lib.settings.phraseOct['bass/sub']") == 0)
    # con patrón adjunto, ◀ mueve el patrón (lo que se exporta como .mid)
    E("document.querySelector('.dock [data-act=\"autoAttach\"]').click()"); pg.wait_for_timeout(300)
    pid = E(f"window.__ctpl.lib.byId('{qid}').meta.patternId"); before = E(f"window.__ctpl.lib.settings.patterns.find(x=>x.id==='{pid}').notes.map(n=>n.n)")
    pg.click('.stage button[data-act="phOct"][data-d="-12"]'); pg.wait_for_timeout(300)
    after = E(f"window.__ctpl.lib.settings.patterns.find(x=>x.id==='{pid}').notes.map(n=>n.n)")
    ok('Con patrón adjunto, ◀ 8va mueve el propio patrón', after == [n - 12 for n in before])
    # --- un sonido, una versión ---
    pg.keyboard.press('Alt+ArrowDown'); pg.wait_for_timeout(250); pg.keyboard.press('Alt+ArrowDown'); pg.wait_for_timeout(250)
    grp = lambda: E(f"(()=>{{const L=window.__ctpl.lib; return L.groupIds('{qid}').length}})()")
    ok('Dos −8va: una sola versión (−2 oct), sin filas nuevas', grp() == 2 and E(f"window.__ctpl.lib.currentVersion(window.__ctpl.lib.byId('{qid}')).meta.quickOct") == -24 and E("window.__ctpl.lib.faces().length") == n0)
    E(f"window.__ctpl.S.sel = window.__ctpl.lib.currentVersion(window.__ctpl.lib.byId('{qid}')).id; window.__ctpl.S.knob = 0"); pg.click('.tabs-main button[data-v="macros"]'); pg.wait_for_timeout(200)
    pg.locator('.mk[data-knob="0"]').focus(); pg.keyboard.press('ArrowUp'); pg.keyboard.press('ArrowUp'); pg.wait_for_timeout(450); pg.click('button[data-act="mSavePos"]'); pg.wait_for_timeout(300)
    cv = E(f"(()=>{{const L=window.__ctpl.lib, v=L.currentVersion(L.byId('{qid}')); return {{k: v.kind, oct: v.meta.quickOct, m0: v.payload[204]}}}})()")
    ok('Guardar una macro se suma a esa misma versión', grp() == 2 and cv['k'] == 'variant' and cv['oct'] == -24 and cv['m0'] > 0, cv)
    pg.click('.tabs-main button[data-v="library"]'); pg.wait_for_timeout(300)
    ok('La ficha dice «editado» y ofrece A/B y Volver al original', pg.locator('.insp .chgbox [data-act="chgRevert"]').count() == 1 and re.search('editado|edited', pg.inner_text('.insp .label .k'), re.I))
    pg.click('.insp .chgbox [data-act="chgRevert"]'); pg.wait_for_timeout(300)
    ok('Volver al original: el sonido vuelve a ser el original', grp() == 1 and E(f"window.__ctpl.lib.currentVersion(window.__ctpl.lib.byId('{qid}')).id") == qid)
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(300)
    ok('Ctrl Z devuelve la versión', grp() == 2 and E(f"window.__ctpl.lib.currentVersion(window.__ctpl.lib.byId('{qid}')).meta.quickOct") == -24)
    # propuesta en bloque (macros reordenadas) → no ocupa fila, se ve en la ficha y se suma al aplicarla
    E(f"window.__ctpl.S.multi = new Set([window.__ctpl.lib.currentVersion(window.__ctpl.lib.byId('{qid}')).id])")
    np0 = E(f"window.__ctpl.lib.proposalsOf(window.__ctpl.lib.byId('{qid}')).length")
    E("(async()=>{const L=window.__ctpl.lib, v=L.currentVersion(L.byId('" + qid + "')); const pl=new Uint8Array(v.payload); pl[60]=(pl[60]+7)%128; await L.createVariant(v.id, pl, 'macro-reorder', 'Prueba');})()"); pg.wait_for_timeout(300)
    E("window.__ctpl.A.view({dataset:{v:'library'}})"); pg.wait_for_timeout(300)
    ok('Una propuesta no ocupa fila y aparece en la ficha', E("window.__ctpl.lib.faces().length") == n0 and pg.locator('.insp .propc').count() == np0 + 1)
    pg.locator('.insp .propc [data-act="chgAdopt"]').first.click(); pg.wait_for_timeout(300)
    ok('Aplicarla la suma a la versión (sigue habiendo una)', grp() == 2 and E(f"window.__ctpl.lib.currentVersion(window.__ctpl.lib.byId('{qid}')).meta.quickOct") == -24)
    # duplicar = otro sonido
    pg.click('button[data-act="duplicate"]'); pg.wait_for_timeout(300)
    dup = E("window.__ctpl.S.sel")
    ok('Duplicar crea otro sonido (una fila más), independiente', E("window.__ctpl.lib.faces().length") == n0 + 1 and E(f"window.__ctpl.lib.byId('{dup}').parentId") is None and E(f"window.__ctpl.lib.rootOf(window.__ctpl.lib.byId('{dup}')).id") == dup)
    # --- ordenar lo que dejó el modelo anterior ---
    E("""(async()=>{const L=window.__ctpl.lib; const o=L.faces().find(p=>p.kind==='original'&&!L.groupIds(p.id).slice(1).length); window.__old=o.id;
      const a=new Uint8Array(o.payload); a[42]=52; const v1=await L.createVariant(o.id,a,'register','Octava −1'); v1.meta.adopted=true;
      const b2=new Uint8Array(v1.payload); b2[204]=50; const v2=await L.createVariant(v1.id,b2,'edit','Macros'); v2.meta.adopted=true;
      await L.createVariant(o.id,o.payload,'copy','Copia editable'); L.emit(); window.__ctpl.A.view({dataset:{v:'library'}});})()"""); pg.wait_for_timeout(400)
    ok('Aviso «Ordenar versiones» en la barra', pg.locator('.tabs-main [data-act="tidyOpen"]').count() == 1)
    pg.click('.tabs-main [data-act="tidyOpen"]'); pg.wait_for_timeout(300)
    pg.locator('.tidybox [data-act="tidyRun"]').first.click(); pg.wait_for_selector('.modal'); pg.click('.modal .btn.primary'); pg.wait_for_timeout(400)
    ok('Ordenar: una versión por sonido y nada que ordenar', E("window.__ctpl.lib.groupIds(window.__old).length") == 2 and pg.locator('.tabs-main [data-act="tidyOpen"]').count() == 0 and E("(()=>{const L=window.__ctpl.lib,v=L.currentVersion(L.byId(window.__old)); return v.payload[42]===52&&v.payload[204]===50&&v.parentId===window.__old})()"))
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(300)
    ok('Ctrl Z deshace el orden entero', E("window.__ctpl.lib.groupIds(window.__old).length") == 4)
    pg.reload(); pg.wait_for_selector('.top .brand'); pg.wait_for_timeout(400)
    ok('Tras recargar: octava de frase y versiones se conservan', E("'bass/sub' in (window.__ctpl.lib.settings.phraseOct||{})") and E(f"window.__ctpl.lib.groupIds('{qid}').length") == 2)
    pg.locator('.stage, body').first.screenshot(path=os.path.join(ROOT, 'tests', 'shots', '30_escucha_v310' + ('_en' if '_EN' in FILE else '') + '.png')) if os.path.isdir(os.path.join(ROOT, 'tests', 'shots')) else None
    ok('Sin errores JavaScript', not errors, errors[:3])
    b.close()
print(f'{sum(res)}/{len(res)} comprobaciones superadas'); srv.shutdown(); sys.exit(0 if all(res) else 1)
