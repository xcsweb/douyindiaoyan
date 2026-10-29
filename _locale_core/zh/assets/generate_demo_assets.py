#!/usr/bin/env python3
"""Author the MotionGit public demonstration media, without downloaded inputs.

SPDX-License-Identifier: MIT
Copyright (c) 2026 MotionGit template contributors

Python >= 3.12, numpy >= 2.0, Pillow >= 11, and an FFmpeg with libx264 are
required. The unchanged bundled OFL font is the default on all hosts.
Custom fonts, if selected explicitly, must have appropriate usage rights.
All generated pictures, animation and original score are dedicated to CC0 1.0.
This generator is separate from the frozen template engine and has no role in
speech alignment or real-person quality acceptance.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


FPS = 30
SCALE = 2
SAMPLE_RATE = 48000
INK = "#ECF4F3"
MUTED = "#A6B5C0"
MINT = "#9CE3D1"
LILAC = "#B5A6EF"
GOLD = "#F0C686"
SOURCE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = SOURCE_DIR
BUNDLED_FONT = SOURCE_DIR / 'fonts/NotoSansSC-Variable.ttf'
FONT_PATHS = (str(BUNDLED_FONT),)
BOLD_PATHS = (str(BUNDLED_FONT),)

FONT_REGULAR: Path
FONT_BOLD: Path
FONT_CACHE: dict[tuple[int, bool], ImageFont.FreeTypeFont] = {}


def choose_font(explicit: str | None, candidates: tuple[str, ...]) -> Path:
    if explicit is not None:
        path = Path(explicit).resolve()
        if not path.is_file():
            raise ValueError(f"Font is not a file: {path}")
        return path
    for candidate in candidates:
        if Path(candidate).is_file():
            return Path(candidate)
    raise ValueError("Bundled font missing; restore the package or explicitly provide --font and --font-bold.")


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    key = (size, bold)
    if key not in FONT_CACHE:
        chosen = FONT_BOLD if bold else FONT_REGULAR
        face = ImageFont.truetype(str(chosen), size * SCALE)
        if chosen.resolve() == BUNDLED_FONT.resolve():
            face.set_variation_by_axes([700 if bold else 400])
        FONT_CACHE[key] = face
    return FONT_CACHE[key]


def scaled_box(box: tuple[float, float, float, float]) -> tuple[int, int, int, int]:
    return tuple(round(n * SCALE) for n in box)  # type: ignore[return-value]


def rectangle(draw: ImageDraw.ImageDraw, box: tuple[float, float, float, float],
              fill: str | tuple, radius: float = 0, outline: str | tuple | None = None,
              width: int = 1) -> None:
    draw.rounded_rectangle(scaled_box(box), radius=round(radius * SCALE), fill=fill,
                           outline=outline, width=width * SCALE)


def ellipse(draw: ImageDraw.ImageDraw, box: tuple[float, float, float, float],
            fill: str | tuple | None = None, outline: str | tuple | None = None,
            width: int = 1) -> None:
    draw.ellipse(scaled_box(box), fill=fill, outline=outline, width=width * SCALE)


def line(draw: ImageDraw.ImageDraw, points: list[tuple[float, float]], fill: str | tuple,
         width: int = 1) -> None:
    draw.line([(round(x * SCALE), round(y * SCALE)) for x, y in points], fill=fill,
              width=width * SCALE, joint="curve")


def text(draw: ImageDraw.ImageDraw, pos: tuple[float, float], label: str,
         size: int, color: str = INK, bold: bool = False, anchor: str = "la") -> None:
    draw.text((round(pos[0] * SCALE), round(pos[1] * SCALE)), label,
              fill=color, font=font(size, bold), anchor=anchor)


def background(width: int, height: int) -> Image.Image:
    yy, xx = np.mgrid[0:height*SCALE, 0:width*SCALE].astype(np.float32)
    x, y = xx / (width*SCALE), yy / (height*SCALE)
    glow_a = np.exp(-(((x - .2) / .52) ** 2 + ((y - .25) / .55) ** 2))
    glow_b = np.exp(-(((x - .9) / .62) ** 2 + ((y - .86) / .6) ** 2))
    rgb = np.empty((*x.shape, 3), np.uint8)
    for channel, (base, a, b) in enumerate(((15, 12, 10), (22, 13, 1), (36, 13, 19))):
        rgb[..., channel] = np.clip(base + a * glow_a + b * glow_b, 0, 255).astype(np.uint8)
    return Image.fromarray(rgb)


def talk_frame(base: Image.Image, frame: int) -> Image.Image:
    t = frame / FPS
    canvas = base.copy()
    draw = ImageDraw.Draw(canvas)
    # The geometric form has no face, lips, recorded voice or person likeness.
    rectangle(draw, (32, 30, 116, 59), "#243C43", 14)
    text(draw, (74, 35), "DEMO", 15, MINT, True, "ma")
    text(draw, (608, 35), "SCHEMATIC", 12, MUTED, True, "ra")
    text(draw, (32, 90), "A place for your story.", 28, INK, True)
    text(draw, (32, 132), "Abstract presenter placeholder", 16, MUTED)

    # Orbiting marks keep the source visibly continuous over both sample groups.
    center = (320, 343)
    for k in range(4):
        angle = t * .12 + k * math.pi / 2
        x, y = center[0] + math.cos(angle) * 233, center[1] + math.sin(angle) * 161
        ellipse(draw, (x - 4, y - 4, x + 4, y + 4), (MINT, LILAC, GOLD, MINT)[k])
    ellipse(draw, (98, 184, 542, 506), outline="#33434F")
    ellipse(draw, (134, 209, 506, 482), outline="#2B3549")
    bob = math.sin(2 * math.pi * t / 6.8) * 3
    sway = math.sin(2 * math.pi * t / 11.3) * 4
    x, y = 320 + sway, 343 + bob
    # A floating pedestal, simple head and torso instead of a speaking avatar.
    ellipse(draw, (209, 470, 431, 491), "#152C38")
    ellipse(draw, (241, 477, 399, 484), "#375360")
    rectangle(draw, (x - 80, y + 12, x + 80, y + 124), MINT, 65)
    rectangle(draw, (x - 80, y + 79, x + 80, y + 124), MINT, 24)
    ellipse(draw, (x - 57, y - 108, x + 57, y + 6), LILAC)
    ellipse(draw, (x - 44, y - 95, x + 44, y - 7), "#C9BAF7")
    # Hands float beside the body; their calm motion is independent of speech.
    hand = math.sin(2 * math.pi * t / 8.5) * 8
    ellipse(draw, (x - 117, y + 43 + hand, x - 81, y + 79 + hand), GOLD)
    ellipse(draw, (x + 81, y + 62 - hand, x + 117, y + 98 - hand), GOLD)
    line(draw, [(x - 19, y + 53), (x + 19, y + 53)], "#5EAEA3", 3)
    line(draw, [(x - 12, y + 70), (x + 12, y + 70)], "#5EAEA3", 3)
    # Quiet timing marks are not an audio waveform or a claimed transcript.
    for k in range(7):
        h = 7 + 9 * (.5 + .5 * math.sin(t * .8 + k * .8))
        rectangle(draw, (287 + k * 10, 533 - h / 2, 291 + k * 10, 533 + h / 2), "#536773", 2)
    text(draw, (320, 564), "NO REAL PERSON  /  NO NARRATION", 12, MUTED, True, "ma")
    line(draw, [(32, 602), (608, 602)], "#34404F")
    text(draw, (32, 616), "ORIGINAL PUBLIC DEMO", 10, MUTED, True)
    text(draw, (608, 616), "38.900 s", 10, MUTED, False, "ra")
    return canvas.resize((640, 640), Image.Resampling.LANCZOS)


def workflow_icon(draw: ImageDraw.ImageDraw, step: int, cx: float, cy: float, t: float) -> None:
    if step == 0:
        for j, (dx, dy, color) in enumerate(((-36, -20, LILAC), (7, -7, GOLD), (-12, 22, MINT))):
            shift = math.sin(t * .75 + j) * 3
            rectangle(draw, (cx+dx-20, cy+dy-24+shift, cx+dx+20, cy+dy+24+shift), "#31404F", 8, color)
            line(draw, [(cx+dx-10, cy+dy-10+shift), (cx+dx+10, cy+dy-10+shift)], color, 2)
            line(draw, [(cx+dx-10, cy+dy+shift), (cx+dx+5, cy+dy+shift)], color, 2)
    elif step == 1:
        angle = .12 * math.sin(t * .6)
        points = []
        for j in range(6):
            a = angle + j * math.pi / 3
            points.append((cx + 48 * math.cos(a), cy + 48 * math.sin(a)))
        draw.polygon([(int(x*SCALE), int(y*SCALE)) for x, y in points], fill="#4A496C")
        line(draw, points + points[:1], LILAC, 2)
        ellipse(draw, (cx-23, cy-23, cx+23, cy+23), MINT)
        ellipse(draw, (cx-7, cy-7, cx+7, cy+7), "#283A48")
    else:
        rectangle(draw, (cx-58, cy-39, cx+58, cy+35), "#304351", 11, MINT)
        rectangle(draw, (cx-49, cy-30, cx+49, cy+13), "#1D2D3D", 4)
        for j in range(3):
            xx = cx-25+j*25
            hh = 8+7*math.sin(t*.55+j)**2
            rectangle(draw, (xx-6, cy+2-hh, xx+6, cy+2), (MINT, LILAC, GOLD)[j], 3)
        ellipse(draw, (cx-4, cy+21, cx+4, cy+29), GOLD)


def evidence_frame(base: Image.Image, frame: int) -> Image.Image:
    t = frame / FPS
    canvas = base.copy()
    draw = ImageDraw.Draw(canvas)
    rectangle(draw, (42, 32, 126, 61), "#243C43", 14)
    text(draw, (84, 37), "DEMO", 15, MINT, True, "ma")
    text(draw, (918, 37), "SCHEMATIC", 12, MUTED, True, "ra")
    text(draw, (42, 87), "An idea, in three movements.", 34, INK, True)
    text(draw, (42, 139), "A visual workflow example. No live product or data claims.", 16, MUTED)
    labels = (("01", "COLLECT", "Gather ingredients", MINT),
              ("02", "SHAPE", "Explore a direction", LILAC),
              ("03", "SHARE", "Make an example", GOLD))
    active = min(2, int(t / 4))
    for j, (number, title, detail, accent) in enumerate(labels):
        left = 42+j*304
        rectangle(draw, (left, 198, left+266, 431), "#202D40", 22,
                  accent if j == active else "#3E4A5D", 2 if j == active else 1)
        text(draw, (left+20, 217), number, 14, accent, True)
        workflow_icon(draw, j, left+133, 299, t)
        text(draw, (left+133, 367), title, 17, INK, True, "ma")
        text(draw, (left+133, 398), detail, 13, MUTED, False, "ma")
        if j < 2:
            start = left+275
            line(draw, [(start, 313), (start+21, 313)], "#677187", 2)
            line(draw, [(start+15, 308), (start+21, 313), (start+15, 318)], "#677187", 2)
            flow = ((t/2.8 + j*.4) % 1)
            ellipse(draw, (start+21*flow-3, 310, start+21*flow+3, 316), accent)
    line(draw, [(42, 472), (918, 472)], "#354053")
    # A precise visual position cue for the 12-second public source clip.
    rectangle(draw, (42, 471, 42+(876*(frame+1)/(12*FPS)), 474), MINT, 1)
    text(draw, (42, 492), "ORIGINAL MOTION STUDY", 11, MUTED, True)
    text(draw, (918, 492), "PUBLIC DEMONSTRATION", 11, MUTED, True, "ra")
    return canvas.resize((960, 540), Image.Resampling.LANCZOS)


def encode_video(name: str, width: int, height: int, seconds: float, renderer,
                 silent_audio: bool = False) -> None:
    output = OUTPUT_DIR / name
    if output.exists():
        raise FileExistsError(f"Refusing to overwrite: {output}")
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-n", "-f", "rawvideo",
           "-pix_fmt", "rgb24", "-s", f"{width}x{height}", "-r", str(FPS), "-i", "pipe:0"]
    if silent_audio:
        cmd += ["-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate={SAMPLE_RATE}",
                "-map", "0:v:0", "-map", "1:a:0", "-c:a", "aac", "-b:a", "128k"]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
            "-t", str(seconds), "-movflags", "+faststart", "-metadata",
            "comment=Original CC0-1.0 schematic demonstration; not real speech or a product claim.",
            str(output)]
    base = background(width, height)
    process = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    try:
        assert process.stdin is not None
        for frame in range(round(seconds * FPS)):
            process.stdin.write(renderer(base, frame).tobytes())
        process.stdin.close()
        code = process.wait()
        if code != 0:
            raise RuntimeError(f"ffmpeg exited {code}")
    except BaseException:
        if process.stdin and not process.stdin.closed:
            process.stdin.close()
        process.kill()
        process.wait()
        output.unlink(missing_ok=True)
        raise
    print(f"Created {name}: {seconds * FPS} frames, {seconds:.1f}s", flush=True)


def midi(note: int) -> float:
    return 440 * 2 ** ((note - 69) / 12)


def create_score() -> dict:
    """A new 40-second instrumental: slow suspended chords and a small motif.

    No samples, pre-existing score code, MIDI files or known-song transcription.
    All envelopes, oscillators, notes and voicings are authored here.
    """
    path = OUTPUT_DIR / "music-demo.wav"
    if path.exists():
        raise FileExistsError(f"Refusing to overwrite: {path}")
    seconds = 40
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

    # Seven five-second cells and a dedicated final cadence with full reverb room.
    harmony = ((50, 57, 64, 66), (47, 54, 61, 66), (43, 50, 57, 62), (45, 52, 59, 64),
               (50, 57, 62, 66), (47, 54, 62, 66), (43, 50, 59, 62), (50, 57, 64, 69))
    motifs = ((74, 78, 81, 78), (73, 78, 76, 73), (74, 78, 76, 74), (76, 81, 78, 76),
              (78, 81, 86, 81), (78, 76, 73, 74), (74, 78, 81, 78), (78, 76, 74, 74))
    for cell, notes in enumerate(harmony):
        onset = cell * 5 if cell < 7 else 32.4
        for j, note in enumerate(notes):
            place(onset, 6.4, note+2, .09 if j == 0 else .047, "pad", -.42+j*.28)
        place(onset+.12, 3.8, notes[0]-10, .12, "bass", 0)
        place(onset+2.65, 2.5, notes[0]-10, .075, "bass", 0)
        for j, note in enumerate(motifs[cell]):
            place(onset+.55+j*1.06, 3.0, note+2, .074 if j == 0 else .055,
                  "plucked", -.3 if j%2 == 0 else .3)
    # A short, fixed stereo echo gives depth without outside sound libraries.
    dry = score.copy()
    for delay, gain in ((.23, .14), (.41, .09), (.67, .05)):
        shift = round(delay*SAMPLE_RATE)
        score[shift:, 0] += dry[:-shift, 1]*gain
        score[shift:, 1] += dry[:-shift, 0]*gain
    timeline = np.arange(count)/SAMPLE_RATE
    score *= (np.clip(timeline/1.2, 0, 1)*np.clip((2334/60-1.4-timeline)/3.2, 0, 1))[:, None]
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
            "rmsDbfs": round(20*math.log10(rms), 4), "compositionId": "motiongit-template04-score-20261005-v1"}


def summarize(path: Path) -> dict:
    probe = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-show_streams",
                            "-show_format", "-of", "json", str(path)],
                           check=True, capture_output=True, text=True)
    detail = json.loads(probe.stdout)
    return {"path": path.name, "bytes": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "durationSeconds": float(detail["format"]["duration"]),
            "streams": [{key: stream[key] for key in
                         ("codec_type", "codec_name", "width", "height", "r_frame_rate",
                          "duration", "nb_frames", "nb_read_frames", "sample_rate", "channels")
                         if key in stream} for stream in detail["streams"]]}




def main():
    global FONT_REGULAR, FONT_BOLD, OUTPUT_DIR
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True, type=Path, help='New output directory outside the frozen package')
    parser.add_argument('--font')
    parser.add_argument('--font-bold')
    args = parser.parse_args()
    OUTPUT_DIR = args.out.expanduser().absolute()
    if OUTPUT_DIR.exists() or OUTPUT_DIR.is_symlink() or not OUTPUT_DIR.parent.is_dir():
        parser.error('--out must be a new directory inside an existing parent')
    if OUTPUT_DIR.resolve().is_relative_to(SOURCE_DIR.parent.resolve()):
        parser.error('--out must stay outside this frozen package')
    FONT_REGULAR=choose_font(args.font,FONT_PATHS);FONT_BOLD=choose_font(args.font_bold,BOLD_PATHS)
    OUTPUT_DIR.mkdir()
    duration=2334/60
    encode_video('talk-demo.mp4',640,640,duration,talk_frame,True)
    score=create_score()
    # Two original stills illustrating input and delivered output. No screenshot,
    # real-person footage, third-party UI or claimed product/data results.
    base=background(960,540)
    evidence_frame(base,0).save(OUTPUT_DIR/'input-thumbnail.png')
    evidence_frame(base,11*FPS).save(OUTPUT_DIR/'output-thumbnail.png')
    rng=np.random.default_rng(40261005)
    Image.fromarray(rng.integers(0,256,(256,256),dtype=np.uint8)).save(OUTPUT_DIR/'noise.png')
    params=json.loads((SOURCE_DIR.parent/'presets/demo.json').read_text(encoding='utf-8'))
    labels=[('两种输入汇聚，形成一个明确结果。','Two inputs. One result.'),('提供方法与素材，再执行六项检查。','Submit. Choose an input. Run six checks.'),('三方遵循同一手册，七步完成交付。','One manual. Three roles. Seven steps.'),('保留同一交付物，让结果自然收束。','Keep the delivered object. Let it settle.')]
    captions=[];cursor=0
    for segment,(zh,en) in zip(params['segments'],labels):
        end=cursor+segment['durationFrames']/60
        captions.append(dict(t0=round(cursor+.18,6),t1=round(end-.18,6),zh=zh,en=en));cursor=end
    (OUTPUT_DIR/'demo-subs.json').write_text(json.dumps(captions,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    names=['talk-demo.mp4','music-demo.wav','input-thumbnail.png','output-thumbnail.png','noise.png','demo-subs.json']
    record={'schema':'motiongit-public-assets/1','created':'2026-10-05','license':'CC0-1.0','noRealPerson':True,'noNarration':True,'subtitleKind':'visual-demonstration-not-ASR','score':score,'durationFrames':2334,'fps':60,'files':[]}
    for name in names:
        p=OUTPUT_DIR/name;record['files'].append({'path':name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
    (OUTPUT_DIR/'generation-record.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
if __name__=='__main__':main()
