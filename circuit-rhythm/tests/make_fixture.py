"""Colección de prueba: samples sintéticos con nombres y carpetas realistas (sin hardware)."""
import os, sys, struct, wave
import numpy as np

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/crsl_fixture'
rng = np.random.default_rng(3)

def wav(path, ch, sr=44100, bits=16):
    full = os.path.join(OUT, path); os.makedirs(os.path.dirname(full), exist_ok=True)
    ch = [np.clip(np.asarray(c, dtype=np.float64), -1, 1) for c in ch]
    n = len(ch[0]); inter = np.stack(ch, axis=1).reshape(-1)
    with wave.open(full, 'wb') as w:
        w.setnchannels(len(ch)); w.setsampwidth(bits // 8); w.setframerate(sr)
        if bits == 16: w.writeframes((inter * 32767).astype('<i2').tobytes())
        else:
            v = (inter * 8388607).astype('<i4')
            b = np.zeros((len(v), 3), dtype=np.uint8); b[:, 0] = v & 255; b[:, 1] = (v >> 8) & 255; b[:, 2] = (v >> 16) & 255
            w.writeframes(b.tobytes())

def aiff(path, x, sr=44100):
    full = os.path.join(OUT, path); os.makedirs(os.path.dirname(full), exist_ok=True)
    d = (np.clip(x, -1, 1) * 32767).astype('>i2').tobytes(); n = len(x)
    e = int(np.floor(np.log2(sr))); m = sr / 2 ** e
    comm = struct.pack('>hIh', 1, n, 16) + struct.pack('>HII', 16383 + e, int(m * 2 ** 31), 0)
    ssnd = struct.pack('>II', 0, 0) + d
    body = b'AIFF' + b'COMM' + struct.pack('>I', len(comm)) + comm + b'SSND' + struct.pack('>I', len(ssnd)) + ssnd
    open(full, 'wb').write(b'FORM' + struct.pack('>I', len(body)) + body)

def t(sec, sr=44100): return np.arange(int(sec * sr)) / sr
def hp(x, a=0.6):
    y = np.zeros_like(x); px = py = 0.0
    for i, v in enumerate(x): py = a * (py + v - px); px = v; y[i] = py
    return y
def lp(x, a=0.3):
    y = np.zeros_like(x); p = 0.0
    for i, v in enumerate(x): p += a * (v - p); y[i] = p
    return y
def kick(sec=0.5, f1=120, dec=7):
    tt = t(sec); f = 50 + f1 * np.exp(-tt * 30); ph = np.cumsum(2 * np.pi * f / 44100); return 0.9 * np.sin(ph) * np.exp(-tt * dec)
def hat(sec=0.12, dec=40): return hp(hp(hp(rng.uniform(-1, 1, len(t(sec))) * np.exp(-t(sec) * dec)))) * 0.8
def saw(f, sec, amp=0.6): tt = t(sec); e = np.minimum(1, tt / 0.002) * np.minimum(1, (sec - tt) / 0.05); return lp(amp * (2 * ((tt * f) % 1) - 1) * e, 0.35)

wav('Samples/Drums/Kicks/BD Dark 01.wav', [kick()], bits=24)
wav('Samples/Drums/Kicks/BD Dark 02.wav', [kick(0.45, 140, 9)])
wav('Samples/Drums/Kicks/Kick Rumble 03.wav', [np.concatenate([np.zeros(int(0.2 * 44100)), kick(0.6, 100, 5)])])
h = hat(); wav('Samples/Drums/Hats/HH Closed 01.wav', [h]); wav('Samples/Drums/Hats/Copy/HH Closed 01 copy.wav', [h])
wav('Samples/Drums/Hats/HH Closed 02.wav', [hat(0.09, 55)])
wav('Samples/Drums/Hats/Open Hat 01.wav', [hat(0.6, 7)])
cl = np.zeros(int(0.4 * 44100))
for st in [0, 0.011, 0.022, 0.034]:
    o = int(st * 44100); g = np.exp(-t(0.4)[: len(cl) - o] * (300 if st < 0.03 else 18)); cl[o:] += 0.5 * rng.uniform(-1, 1, len(cl) - o) * g
wav('Samples/Drums/Claps/Clap 909.wav', [hp(lp(cl, 0.5), 0.9)])
tt = t(0.35); wav('Samples/Drums/Snares/Snare Tight.wav', [hp(0.5 * np.sin(2 * np.pi * 190 * tt) * np.exp(-tt * 25) + 0.5 * rng.uniform(-1, 1, len(tt)) * np.exp(-tt * 14), 0.97)])
aiff('Samples/Drums/Perc/Shaker.aif', hat(0.15, 25) * 0.7)
tt = t(0.8); wav('Samples/Bass/Sub A1.wav', [0.7 * np.sin(2 * np.pi * 55 * tt) * np.minimum(1, tt / 0.003) * np.minimum(1, (0.8 - tt) / 0.02)])
wav('Samples/Bass/Reese Bass.wav', [saw(55, 0.9), saw(55.4, 0.9)])
wav('Samples/Synth/Stab Cm.wav', [saw(261.6, 0.5, 0.3) + saw(311.1, 0.5, 0.3) + saw(392, 0.5, 0.3)])
tt = t(3); x = np.zeros(len(tt)); p = 0
noise = rng.uniform(-1, 1, len(tt))
a = 0.02 + 0.9 * (tt / 3) ** 2
for i in range(len(tt)): p += a[i] * (noise[i] - p); x[i] = p
wav('Samples/FX/Riser 01.wav', [(noise * (tt / 3) - x * (1 - tt / 3)) * 0.7 * np.minimum(1, tt / 0.5)])
tt = t(4); padx = sum(0.2 * np.sin(2 * np.pi * f * tt + np.sin(2 * np.pi * 0.3 * tt)) for f in [220, 261.6, 329.6]) * np.minimum(1, tt / 1.2) * np.minimum(1, (4 - tt) / 0.8)
wav('Samples/Atmos/Wide Pad.wav', [padx, -padx * 0.95])
def loop(bpm, bars, tonal=False):
    beat = 60 / bpm; n = int(bars * 4 * beat * 44100); x = np.zeros(n); k = kick(0.4); hh = hat(0.08); s = saw(110, 0.18, 0.5)
    for b in range(bars * 4):
        o = int(b * beat * 44100)
        if tonal:
            for j in range(4):
                oo = o + int(j * beat / 4 * 44100); seg = s[: max(0, min(len(s), n - oo))]; x[oo: oo + len(seg)] += seg * (1 if j % 2 == 0 else 0.6)
        else:
            seg = k[: max(0, min(len(k), n - o))]; x[o: o + len(seg)] += seg
            o2 = int((b + 0.5) * beat * 44100); seg = hh[: max(0, min(len(hh), n - o2))]; x[o2: o2 + len(seg)] += seg * 0.6
    return x
wav('Samples/Loops/Top Loop 128bpm.wav', [loop(128, 2)])
wav('Samples/Loops/Acid Loop 130bpm Am.wav', [loop(130, 2, True)])
wav('Samples/Misc/sample_007.wav', [kick(0.5, 130, 8)])
wav('Samples/Misc/Kick 99.wav', [hat(0.1, 45)])
wav('Samples/Long/Field Rec.wav', [rng.uniform(-0.2, 0.2, int(35 * 44100)) * 0.5], sr=44100)
os.makedirs(os.path.join(OUT, 'Samples/Misc'), exist_ok=True)
open(os.path.join(OUT, 'Samples/Misc/broken.wav'), 'wb').write(b'RIFF\x10\x00\x00\x00WAVEjunkjunk')
os.makedirs(os.path.join(OUT, 'Samples/__MACOSX'), exist_ok=True)
open(os.path.join(OUT, 'Samples/__MACOSX/._BD.wav'), 'wb').write(b'\x00\x05\x16\x07')
open(os.path.join(OUT, 'Samples/readme.txt'), 'w').write('no es audio')
print('ok', OUT)
