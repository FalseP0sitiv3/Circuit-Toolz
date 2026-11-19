"""Recorre la versión inglesa y busca texto visible en español."""
import base64, os, re, sys, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from browser_test import MOCK, wait_idle
HTML = os.path.abspath(sys.argv[1]); FIX = sys.argv[2]
files = {}
root = os.path.join(FIX, 'Samples')
for d, _, fs in os.walk(root):
    for f in fs:
        p = os.path.join(d, f); files[os.path.relpath(p, root)] = base64.b64encode(open(p, 'rb').read()).decode()
SPANISH = re.compile(r"[áéíóúñ¿¡]|\b(de|la|el|los|las|del|por|para|con|sin|una|que|muestra|carpeta|biblioteca|pista|escuchar|página|nombre|sonido|tarjeta|equipo|copia|borrar)\b", re.I)
IGNORE = re.compile(r"(\bDel\b|Español|Samples/|\.wav|\.aif|BD Dark|HH Closed|Kick Rumble|Field Rec|Snare Tight|Wide Pad|Acid Loop|Top Loop|Reese|Stab Cm|sample_007|Riser|Shaker|Clap 909|Open Hat|Sub A1|broken|Kick 99)")
hits = []
with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path='/usr/bin/google-chrome')
    page = br.new_context(viewport={'width': 1440, 'height': 1000}).new_page(); page.add_init_script(MOCK)
    page.goto('file://' + HTML); page.wait_for_selector('.tab')
    def scan(where):
        txt = page.evaluate('() => document.body.innerText + "\\n" + [...document.querySelectorAll("[title],[placeholder]")].map((e) => (e.title || "") + " " + (e.placeholder || "")).join("\\n")')
        for line in txt.split('\n'):
            l = IGNORE.sub('', line)
            if SPANISH.search(l): hits.append(f'{where}: {line.strip()[:120]}')
    scan('vacía')
    page.evaluate('([f]) => window.__pickQueue.push(window.__mkFS("Samples", f))', [files])
    page.click('[data-act="link"] >> nth=0'); time.sleep(0.5); wait_idle(page, 120)
    page.click('.tab[data-view="packs"]'); page.click('[data-act="pack-new"]'); page.select_option('#ab-cert', 'any'); page.click('[data-act="autobuild"]'); time.sleep(0.4)
    page.click('.pad[data-i="0"]')
    for v in ['library', 'listen', 'map', 'packs', 'patterns', 'songs', 'device', 'data']:
        page.click(f'.tab[data-view="{v}"]'); time.sleep(0.3)
        if v == 'device': page.click('[data-act="midi-connect"]'); time.sleep(0.3)
        if v == 'packs': page.click('.pad[data-i="0"]'); time.sleep(0.2); page.click('[data-act="exp-sdzip"]'); time.sleep(0.2); scan('modal SD'); page.keyboard.press('Escape')
        scan(v)
    for name in ['Wide Pad.wav', 'Kick 99.wav', 'broken.wav', 'Top Loop 128bpm.wav']:
        page.click('.tab[data-view="library"]')
        page.evaluate('(n) => { const { S } = window.__crsl; S.sel = S.samples.find((s) => s.name === n).id; window.__crsl.renderAll(); }', name); time.sleep(0.2)
        scan('ficha ' + name)
    page.evaluate('() => { const { S, clsOf } = window.__crsl; let n = 0; for (const s of S.samples) { const c = clsOf(s); if (c.cat && n < 12) { s.user.cat = c.cat; n++; } } S.ver++; }')
    page.evaluate('() => { const { S } = window.__crsl; S.sel = S.samples.find((s) => s.name === "Top Loop 128bpm.wav").id; S.libMode = "list"; window.__crsl.renderAll(); }'); time.sleep(1.5)
    page.evaluate('() => window.__crsl.renderAll()'); time.sleep(0.3); scan('ficha loop: acortar')
    page.click('#shortp [data-act="sh-use"] >> nth=0'); time.sleep(0.4); scan('ficha loop acortado')
    for m in ['rean', 'tax', 'trash', 'short']:
        page.click('.tab[data-view="library"]'); page.click(f'[data-act="o-mode"][data-v="{m}"]'); time.sleep(0.3)
        if m == 'short' and page.locator('[data-act="sh-scan"]:not([disabled])').count(): page.click('[data-act="sh-scan"]'); time.sleep(2.0)
        scan('biblioteca ' + m)
    page.click('[data-act="o-mode"][data-v="list"]'); time.sleep(0.2)
    page.click('.li >> nth=0'); page.click('.li >> nth=1', modifiers=['Shift']); page.click('[data-act="multi-org"]'); time.sleep(0.2); scan('selección'); page.keyboard.press('Escape')
    page.click('.tab[data-view="map"]'); page.keyboard.press('.'); time.sleep(0.2); scan('dock')
    page.keyboard.press('Control+k'); time.sleep(0.2); scan('paleta'); page.keyboard.type('pa'); time.sleep(0.2); scan('paleta pa'); page.keyboard.press('Escape')
    page.click('.tab[data-view="songs"]'); time.sleep(0.3); scan('canciones')
    page.keyboard.press('?'); time.sleep(0.2); scan('atajos'); page.keyboard.press('Escape')
    page.screenshot(path='/tmp/crsl_shots/08_en.png')
    br.close()
for h in sorted(set(hits)): print(h)
print(len(set(hits)), 'líneas sospechosas')
