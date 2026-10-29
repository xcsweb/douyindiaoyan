"""sfx.py — motion-kit 音效：把 sfx.json 里的提示合成为立体声 WAV（44.1 kHz / 16 bit）。
只依赖 NumPy，全部是程序合成，没有采样文件；固定随机种子，同一份 sfx.json 每次输出相同。
用法：python3 audio/sfx.py SFX.json OUT.wav
sfx.json 由 tools/render.mjs 按本次输入从场景源码的 S(t, type, gain, pan) 导出（时间轴随 duration / fuseAt 变化），渲染成片时自动调用本脚本。"""
import json, os, sys, wave
import numpy as np

SR = 44100
rng = np.random.default_rng(11)
HERE = os.path.dirname(os.path.abspath(__file__))


def T(d): return np.arange(int(SR * d)) / SR
def hz(m): return 440 * 2 ** ((m - 69) / 12)
def fir(x, h):
    L = len(x) + len(h) - 1; F = 1 << (L - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, F) * np.fft.rfft(h, F), F)[:L][len(h) // 2:len(h) // 2 + len(x)]
def lowpass(x, fc, k=255):
    n = np.arange(k) - k // 2; h = np.sinc(2 * fc / SR * n) * np.hamming(k); h /= h.sum(); return fir(x, h)
def highpass(x, fc): return x - lowpass(x, fc)
def bandpass(x, lo, hi): return lowpass(highpass(x, lo), hi)
def pan(x, p): p = np.clip(p, -1, 1); return np.stack([x * np.sqrt((1 - p) / 2), x * np.sqrt((1 + p) / 2)], 1)
def add(buf, x, t0, g=1.0):
    i = int(round(t0 * SR))
    if i < 0: x = x[-i:]; i = 0          # 片头之前的预备音：只保留 0 秒之后的部分
    if i >= len(buf) or not len(x): return
    x = x[:len(buf) - i]; buf[i:i + len(x)] += x * g
def sq(f, t, duty=.5): return np.where((f * t) % 1 < duty, 1.0, -1.0)
def noise(d): return rng.standard_normal(len(T(d)))


# ---------- 音色 ----------
def kick(tone=48):
    t = T(.45); f = tone + 120 * np.exp(-t * 32)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5) + .25 * np.exp(-t * 220) * rng.standard_normal(len(t))
def sub_drop(d=1.2, g=1.):
    t = T(d); f = 110 * np.exp(-t * 2.2) + 32; return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.2) * g
def glock(m, d=.9, g=1.):
    t = T(d); f = hz(m); return (np.sin(2 * np.pi * f * t) + .3 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 9)) * np.exp(-t * 5) * g
def whoosh(d=.45, bright=2500):
    n = noise(d); t = T(d); out = np.zeros(len(t)); seg = int(SR * .03)
    for i in range(0, len(t), seg):
        k = i / len(t); fc = 300 + bright * np.sin(np.pi * k)
        out[i:i + seg] = bandpass(n[i:i + seg + 300], fc * .5, fc * 1.5)[:len(out[i:i + seg])]
    return out * np.sin(np.pi * t / d) ** 2 * .9
def pop(m=84):
    t = T(.12); f = hz(m) * (1 + 1.6 * np.exp(-t * 60)); return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 32) * .6
def hit():
    t = T(1.0); k = np.zeros(len(t)); kk = kick(42); k[:len(kk)] = kk
    sd = sub_drop(1., .4); k[:len(sd)] += sd
    return (k + lowpass(rng.standard_normal(len(t)), 5000) * np.exp(-t * 7) * .35) * .75
def crash():
    t = T(.8); return lowpass(rng.standard_normal(len(t)), 3000) * np.exp(-t * 5) * .6 + np.sin(2 * np.pi * 70 * t) * np.exp(-t * 6) * .6 + sq(hz(40), t) * np.exp(-t * 8) * .15
def cymbal():
    t = T(2.2); return highpass(rng.standard_normal(len(t)), 4500) * np.exp(-t * 2.4) * .22
def riser(d, f0=300, f1=5000):
    t = T(d); n = rng.standard_normal(len(t)); out = np.zeros(len(t)); seg = int(SR * .05)
    for i in range(0, len(t), seg):
        fc = f0 * (f1 / f0) ** (i / len(t)); out[i:i + seg] = bandpass(n[i:i + seg + 400], fc * .6, fc * 1.4)[:len(out[i:i + seg])]
    return out * (t / d) ** 2 * .3
def check(n=0): return np.concatenate([glock(84 + [0, 2, 4, 7][n % 4], .08, .3)[:int(.05 * SR)], glock(91 + [0, 2, 4, 7][n % 4], .6, .35)])
def hum(d):
    t = T(d); x = np.sin(2 * np.pi * 110 * t) * .5 + np.sin(2 * np.pi * 220 * t) * .2 + np.sin(2 * np.pi * 330.5 * t) * .1
    return x * np.minimum(1, t / .5) * np.minimum(1, (d - t) / .3) * (.7 + .3 * np.sin(2 * np.pi * 1.6 * t)) * .12
def shine():
    out = np.zeros(len(T(1.2)))
    for k, m in enumerate([86, 90, 93, 98]): s2 = glock(m, .8, .16); i = int(k * .06 * SR); out[i:i + len(s2)] += s2[:len(out) - i]
    return out

def sin_(f, t): return np.sin(2 * np.pi * f * t)
def tick(): t = T(.03); return sin_(3200, t) * np.exp(-t * 180) * .18 + highpass(noise(.03), 4000) * np.exp(-t * 300) * .15
def thud(): return (lowpass(noise(.15), 600) * np.exp(-T(.15) * 30) + sin_(90, T(.15)) * np.exp(-T(.15) * 25)) * .55
def stamp():
    a = hit() * .8; b = lowpass(noise(.2), 2000) * np.exp(-T(.2) * 25) * .5; a[:len(b)] += b; return a
def marker(): t = T(.25); return bandpass(noise(.25), 3000, 9000) * np.sin(np.pi * t / .25) * .18
def counter(d):
    out = np.zeros(len(T(d))); k = 0
    while k * .05 < d:
        t = T(.025); s = sin_(1800 + 600 * (k % 3), t) * np.exp(-t * 220) * .14; i = int(k * .05 * SR); out[i:i + len(s)] += s[:len(out) - i]; k += 1
    return out
def fill(d):
    out = np.zeros(len(T(d))); k = 0
    while k * .023 < d:
        s2 = sin_(1400 + 30 * k, T(.02)) * np.exp(-T(.02) * 250) * .09; i = int(k * .023 * SR); out[i:i + len(s2)] += s2[:len(out) - i]; k += 1
    return out
def click(): t = T(.02); return highpass(rng.standard_normal(len(t)), 2500) * np.exp(-t * 350) * .45
def typing(d, rate=15):
    out = np.zeros(len(T(d))); tt = 0.
    while tt < d:
        t = T(.07); c = (lowpass(rng.standard_normal(len(t)), 1800) * np.exp(-t * 90) + np.sin(2 * np.pi * 220 * t) * np.exp(-t * 60) * .5) * .18
        k = click(); c[:len(k)] += k * rng.uniform(.5, 1); i = int(tt * SR); out[i:i + len(c)] += c[:len(out) - i]; tt += 1 / rate * rng.uniform(.6, 1.4)
    return out

def glitch(d=.45):
    t = T(d); x = sq(80 + 900 * (np.floor(t * 45) % 3), t) * rng.standard_normal(len(t)) * .5
    return lowpass(x, 7000) * np.exp(-t * 2.5) * .5

# ---------- 0.3.0 新增音色（只加不改，上面的音色与 0.2.0 相同） ----------
def whip():
    t = T(.22); return bandpass(noise(.22), 1500, 9000) * np.sin(np.pi * t / .22) ** 3 * .8
def shutter():
    a = click() * 1.4; b = np.zeros(len(T(.12))); b[:len(a)] += a; c = click(); i = int(.07 * SR); b[i:i + len(c)] += c[:len(b) - i] * 1.2
    return lowpass(b, 6000) + sin_(160, T(.12)) * np.exp(-T(.12) * 50) * .25
def blip(m=88): t = T(.08); return sq(hz(m), t, .3) * np.exp(-t * 40) * .12
def ding(m=88):
    t = T(1.4); return (sin_(hz(m), t) + .45 * sin_(hz(m) * 2.01, t) * np.exp(-t * 3) + .2 * sin_(hz(m) * 3.02, t) * np.exp(-t * 6)) * np.exp(-t * 2.6) * .32
def chime():
    out = np.zeros(len(T(1.6)))
    for k, m in enumerate([79, 83, 86, 91]): s2 = ding(m) * .6; i = int(k * .09 * SR); out[i:i + len(s2)] += s2[:len(out) - i]
    return out
def notify():
    out = np.zeros(len(T(.9)))
    for k, m in enumerate([88, 95]): s2 = ding(m)[:int(.8 * SR)] * .7; i = int(k * .11 * SR); out[i:i + len(s2)] += s2[:len(out) - i]
    return out
def coin():
    t = T(.5); a = sq(hz(95), t, .5) * np.exp(-t * 9); i = int(.07 * SR); b = np.zeros(len(t)); b[i:] = sq(hz(100), t[:len(t) - i], .5) * np.exp(-t[:len(t) - i] * 7)
    return lowpass(np.where(t < .07, a, b), 7000) * .09
def cash():
    out = coin() * 1.2; d = ding(96)[:len(out)] * .5; out[:len(d)] += d; return out
def tada():
    out = np.zeros(len(T(1.8)))
    for k, m in enumerate([72, 76, 79, 84]): s2 = (sq(hz(m), T(1.2), .5) * .35 + sin_(hz(m), T(1.2))) * np.exp(-T(1.2) * 2.5) * .12; i = int(k * .07 * SR); out[i:i + len(s2)] += lowpass(s2, 4000)[:len(out) - i]
    return out + cymbal()[:len(out)] * .5
def drumroll(d):
    out = np.zeros(len(T(d))); tt = 0.
    while tt < d:
        t = T(.06); s = lowpass(noise(.06), 3000) * np.exp(-t * 60) * (.12 + .25 * tt / d); i = int(tt * SR); out[i:i + len(s)] += s[:len(out) - i]; tt += .045
    return out
def heartbeat():
    out = np.zeros(len(T(.7)))
    for k in (0, .22): s = sin_(55, T(.18)) * np.exp(-T(.18) * 22) * .9; i = int(k * SR); out[i:i + len(s)] += s[:len(out) - i]
    return out
def bubble(m=76): t = T(.15); f = hz(m) * (1 + 2.2 * t / .15); return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / .15) * .25
def scratch():
    t = T(.35); return bandpass(noise(.35), 800, 5000) * (np.abs(np.sin(2 * np.pi * 9 * t)) ** 2) * np.exp(-t * 4) * .45
def boom():
    out = sub_drop(1.6, .9); k = kick(36); out[:len(k)] += k * .8; return out + lowpass(noise(1.6), 900) * np.exp(-T(1.6) * 4) * .3
def zap():
    t = T(.3); f = 1800 * np.exp(-t * 12) + 200; return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 8) * .3
def snap(): t = T(.06); return highpass(noise(.06), 1800) * np.exp(-t * 120) * .7 + sin_(1200, t) * np.exp(-t * 90) * .2
def keyclick(): return (click() * .6)
def swell(d):
    t = T(d); x = sum(np.sin(2 * np.pi * hz(m) * t) for m in (60, 64, 67, 72)) / 4
    return x * (t / d) ** 2 * np.minimum(1, (d - t) / .08) * .22
def notif_pop():
    a = pop(90) * .8; b = blip(100) * .6; a[:len(b)] += b; return a

GEN = {
    'whoosh': lambda c: whoosh(.45), 'card': lambda c: whoosh(.3, 2500) * .45, 'pop': lambda c: pop(84 + int(6 * rng.random())),
    'hit': lambda c: hit(), 'crash': lambda c: crash(), 'cymbal': lambda c: cymbal(), 'drop': lambda c: sub_drop(1.1, .5),
    'riser': lambda c: riser(c.get('d', 1.0)), 'check': lambda c: check(c.get('n', 0)), 'shine': lambda c: shine(),
    'swoosh': lambda c: whoosh(.3, 4000) * .7, 'swipe': lambda c: whoosh(.25, 5000) * .5, 'tick': lambda c: tick(), 'thud': lambda c: thud(),
    'stamp': lambda c: stamp(), 'marker': lambda c: marker(), 'counter': lambda c: counter(c.get('d', 1)), 'fill': lambda c: fill(c.get('d', 1)),
    'type': lambda c: typing(c.get('d', 1)), 'glitch': lambda c: glitch(c.get('d', .45)), 'hum': lambda c: hum(c.get('d', 3)),
    'whip': lambda c: whip(), 'shutter': lambda c: shutter(), 'blip': lambda c: blip(84 + 3 * int(c.get('n', 0)) % 24), 'ding': lambda c: ding(c.get('m', 88)),
    'chime': lambda c: chime(), 'notify': lambda c: notify(), 'coin': lambda c: coin(), 'cash': lambda c: cash(), 'tada': lambda c: tada(),
    'drumroll': lambda c: drumroll(c.get('d', 1.2)), 'heartbeat': lambda c: heartbeat(), 'bubble': lambda c: bubble(72 + 2 * int(c.get('n', 0)) % 20),
    'scratch': lambda c: scratch(), 'boom': lambda c: boom(), 'zap': lambda c: zap(), 'snap': lambda c: snap(), 'key': lambda c: keyclick(),
    'swell': lambda c: swell(c.get('d', 1.2)), 'notif': lambda c: notif_pop(),
}


def reverb(x, dec=.9, mix=.12, pre=.012):
    n = int(SR * dec); t = np.arange(n) / SR
    ir = rng.standard_normal(n) * np.exp(-t * 6.9 / dec); ir = lowpass(ir, 5000); ir[:int(pre * SR)] = 0; ir /= np.sqrt((ir ** 2).sum())
    out = np.zeros_like(x)
    for c in range(x.shape[1]):
        F = 1 << (len(x) + n - 1).bit_length()
        out[:, c] = np.fft.irfft(np.fft.rfft(x[:, c], F) * np.fft.rfft(np.roll(ir, c * 37), F), F)[:len(x)]
    return x * (1 - mix) + out * mix


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'sfx.json')
    dst = sys.argv[2] if len(sys.argv) > 2 else 'sfx.wav'
    if os.path.exists(dst): raise SystemExit(f'拒绝覆盖已存在的文件：{dst}')
    D = json.load(open(src, encoding='utf-8'))
    end = float(D['end']); buf = np.zeros((int(SR * end), 2))
    unknown = sorted({c['type'] for c in D['sfx'] if c['type'] not in GEN})
    if unknown: raise SystemExit(f'未知音效类型：{unknown}')
    for c in D['sfx']: add(buf, pan(GEN[c['type']](c), c.get('p', 0)), c['t'], c.get('g', 1))
    buf = reverb(buf)
    buf /= np.max(np.abs(buf)) * 1.12 + 1e-9                    # 峰值约 -1 dBFS
    i0 = int((end - .5) * SR); buf[i0:] *= np.linspace(1, 0, len(buf) - i0)[:, None] ** 1.5
    d = (np.clip(buf, -1, 1) * 32767).astype('<i2')
    with wave.open(dst, 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(d.tobytes())
    print(json.dumps({'output': dst, 'seconds': end, 'cues': len(D['sfx'])}))


if __name__ == '__main__':
    main()
