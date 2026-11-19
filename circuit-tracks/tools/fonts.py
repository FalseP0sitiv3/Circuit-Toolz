"""Genera src/ui/fonts.css con fuentes OFL incrustadas (WOFF base64, subconjunto latino).
Uso: python3 tools/fonts.py RUTA_GOOGLE_FONTS
Familias: Archivo (títulos expandidos y texto), Barlow Condensed (interfaz), JetBrains Mono (valores).
Las tres tienen licencia SIL Open Font License 1.1, que permite incrustarlas y redistribuirlas."""
import sys, os, io, base64
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

GF = sys.argv[1]
UNI = list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + [0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x2032, 0x2039, 0x203A, 0x2190, 0x2191, 0x2192, 0x2193, 0x2212, 0x2264, 0x2265, 0x00D7, 0x2248, 0x2260, 0x221E, 0x00B7, 0x20AC]

def build(path, family, weight, axes=None, stretch='normal'):
    f = TTFont(path)
    if axes: f = instancer.instantiateVariableFont(f, axes)
    opts = subset.Options(); opts.flavor = 'woff'; opts.layout_features = ['kern', 'liga', 'tnum', 'lnum', 'case']; opts.name_IDs = [1, 2]; opts.hinting = False; opts.desubroutinize = True
    s = subset.Subsetter(opts); s.populate(unicodes=UNI); s.subset(f)
    buf = io.BytesIO(); f.flavor = 'woff'; f.save(buf)
    b = buf.getvalue()
    print(f'{family} {weight}: {len(b)//1024} KB', file=sys.stderr)
    return f"@font-face{{font-family:'{family}';font-style:normal;font-weight:{weight};font-display:block;src:url(data:font/woff;base64,{base64.b64encode(b).decode()}) format('woff')}}\n"

A = os.path.join(GF, 'ofl/archivo/Archivo[wdth,wght].ttf')
B = lambda w: os.path.join(GF, f'ofl/barlowcondensed/BarlowCondensed-{w}.ttf')
J = os.path.join(GF, 'ofl/jetbrainsmono/JetBrainsMono[wght].ttf')
css = '/* Fuentes incrustadas (SIL OFL 1.1): Archivo, Barlow Condensed, JetBrains Mono. Generado por tools/fonts.py */\n'
css += build(A, 'CT Display', 800, {'wdth': 125, 'wght': 800})
css += build(A, 'CT Display', 600, {'wdth': 125, 'wght': 600})
css += build(A, 'CT Text', 400, {'wdth': 100, 'wght': 400})
css += build(A, 'CT Text', 600, {'wdth': 100, 'wght': 600})
css += build(B('Medium'), 'CT Cond', 500)
css += build(B('SemiBold'), 'CT Cond', 600)
css += build(B('Bold'), 'CT Cond', 700)
css += build(J, 'CT Mono', 400, {'wght': 400})
css += build(J, 'CT Mono', 600, {'wght': 600})
open(os.path.join(os.path.dirname(__file__), '..', 'src', 'ui', 'fonts.css'), 'w').write(css)
print(f'fonts.css {len(css)//1024} KB', file=sys.stderr)
