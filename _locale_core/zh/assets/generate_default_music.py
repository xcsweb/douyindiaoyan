#!/usr/bin/env python3
"""Original 180s CC0 instrumental. Generator MIT. Mathematical oscillators only.
Derived from this package's original MIT generate_demo_assets.py; no external samples.
Run only in a new empty output folder. No file looping at runtime.
"""
import math, wave, subprocess, json, hashlib
from pathlib import Path
import numpy as np
OUTPUT_DIR=Path.cwd()
SAMPLE_RATE=24000
def midi(note: int) -> float:
    return 440 * 2 ** ((note - 69) / 12)


def create_score() -> dict:
    """A new 180-second instrumental: slow suspended chords and a small motif.

    No samples, pre-existing score code, MIDI files or known-song transcription.
    All envelopes, oscillators, notes and voicings are authored here.
    """
    path = OUTPUT_DIR / "music-default.wav"
    if path.exists():
        raise FileExistsError(f"Refusing to overwrite: {path}")
    seconds = 180
    count = seconds * SAMPLE_RATE
    score = np.zeros((count, 2), dtype=np.float64)

    def place(start: float, duration: float, note: int, level: float,
              kind: str, pan: float = 0) -> None:
        offset = round(start * SAMPLE_RATE)
        length = min(round(duration * SAMPLE_RATE), count-offset)
        if length <= 0:
            return
        tt = np.arange(length, dtype=np.float64) / SAMPLE_RATE
        freq = midi(note)
        if kind == "pad":
            signal = (np.sin(2*np.pi*freq*tt)*.67 + np.sin(2*np.pi*freq*1.0014*tt)*.2
                      + np.sin(2*np.pi*freq*2*tt)*.13)
            env = np.minimum(tt/.85, 1) * np.minimum((duration-tt)/1.7, 1)
            env = np.clip(env, 0, 1)**1.4
        elif kind == "plucked":
            signal = (np.sin(2*np.pi*freq*tt)*.78 + np.sin(2*np.pi*freq*2*tt)*.16
                      + np.sin(2*np.pi*freq*3*tt)*.06)
            env = (1-np.exp(-tt*260))*np.exp(-tt*1.6)*np.minimum((duration-tt)/.12, 1)
        elif kind == "bass":
            signal = np.sin(2*np.pi*freq*tt)*.91+np.sin(2*np.pi*freq*2*tt)*.09
            env = np.minimum(tt/.09, 1)*np.exp(-tt*.55)*np.minimum((duration-tt)/.28, 1)
        else:
            raise ValueError(kind)
        mono = signal * env * level
        score[offset:offset+length, 0] += mono * math.sqrt((1-pan)/2)
        score[offset:offset+length, 1] += mono * math.sqrt((1+pan)/2)

    # Eight newly arranged five-second cells in D-centered suspended harmony.
    harmony = ((50, 57, 64, 66), (47, 54, 61, 66), (43, 50, 57, 62), (45, 52, 59, 64),
               (50, 57, 62, 66), (47, 54, 62, 66), (43, 50, 59, 62), (50, 57, 64, 69))
    motifs = ((74, 78, 81, 78), (73, 78, 76, 73), (74, 78, 76, 74), (76, 81, 78, 76),
              (78, 81, 86, 81), (78, 76, 73, 74), (74, 78, 81, 78), (78, 76, 74, 74))
    for cell in range(36):
        notes=harmony[cell%8]
        variation=([0,0,2,0,-2,0,2,0][cell//5%8])
        onset = cell * 5
        for j, note in enumerate(notes):
            place(onset, 6.4, note, .09 if j == 0 else .047, "pad", -.42+j*.28)
        place(onset+.12, 3.8, notes[0]-12, .12, "bass", 0)
        place(onset+2.65, 2.5, notes[0]-12, .075, "bass", 0)
        for j, note in enumerate(motifs[cell%8]):
            place(onset+.55+j*1.06, 3.0, note+variation, .074 if j == 0 else .055,
                  "plucked", -.3 if j%2 == 0 else .3)
    # A short, fixed stereo echo gives depth without outside sound libraries.
    dry = score.copy()
    for delay, gain in ((.23, .14), (.41, .09), (.67, .05)):
        shift = round(delay*SAMPLE_RATE)
        score[shift:, 0] += dry[:-shift, 1]*gain
        score[shift:, 1] += dry[:-shift, 0]*gain
    timeline = np.arange(count)/SAMPLE_RATE
    score *= (np.clip(timeline/1.2, 0, 1)*np.clip((seconds-timeline)/3.2, 0, 1))[:, None]
    peak = float(np.max(np.abs(score)))
    score *= (10 ** (-4/20)) / peak
    pcm = np.clip(np.rint(score*32767), -32768, 32767).astype("<i2")
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(pcm.tobytes())
    rms = float(np.sqrt(np.mean((pcm.astype(float)/32768)**2)))
    print(f"Created {path.name}: {seconds}.0s original stereo score", flush=True)
    return {"peakDbfs": round(20*math.log10(float(np.max(np.abs(pcm.astype(float))))/32768), 4),
            "rmsDbfs": round(20*math.log10(rms), 4), "compositionId": "motiongit-default-score-20261006-v1"}


if __name__=='__main__':
    levels=create_score()
    subprocess.run(['ffmpeg','-v','error','-n','-i',str(OUTPUT_DIR/'music-default.wav'),'-c:a','aac','-b:a','64k','-movflags','+faststart',str(OUTPUT_DIR/'music-default.m4a')],check=True)
    file=OUTPUT_DIR/'music-default.m4a'
    record={'schema':'motiongit-original-score/1','compositionId':'motiongit-default-score-20261006-v1','license':'CC0-1.0','generatorLicense':'MIT','seconds':180,'source':'Original oscillator score, 36 arranged harmonic cells with melodic variation; no runtime loop or external samples','levels':levels,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'bytes':file.stat().st_size}
    (OUTPUT_DIR/'music-default-provenance.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
