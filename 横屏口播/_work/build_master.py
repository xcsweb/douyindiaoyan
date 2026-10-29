# -*- coding: utf-8 -*-
"""按实录裁剪 8 段口播 → 拼接为 1920x1080/30fps 母版 → 生成对齐 SRT。

- 每段用 ASR 首末词时间码定边界，头留 0.18s、尾留 0.24s 气口，段间自然形成约 0.4s 呼吸。
- 音轨统一到 -16 LUFS / 峰值 -1 dBTP（loudnorm 两遍法，视频流 copy）。
- SRT 用同一套时间映射：offset + (seg_start - trim_start)。
"""
import json
import math
import re
import shutil
import subprocess
import sys
from pathlib import Path

DEFAULT_BIN = (r"C:\Users\EDY\AppData\Local\Microsoft\WinGet\Packages"
               r"\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe"
               r"\ffmpeg-9.0.2-full_build\bin")
FFMPEG = shutil.which("ffmpeg") or str(Path(DEFAULT_BIN) / "ffmpeg.exe")
FFPROBE = shutil.which("ffprobe") or str(Path(DEFAULT_BIN) / "ffprobe.exe")

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SRC = ROOT / "01-口播素材"
TRANS = HERE / "transcript"
OUT = HERE / "master"

HEAD_PAD = 0.18
TAIL_PAD = 0.24
FPS = 30
W, H = 1920, 1080

# 只修正明显的同音/识别错误，不改语义；键为 "文件名|段序号"
CORRECTIONS_FILE = TRANS / "corrections.json"


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def duration_of(path: Path) -> float:
    out = run([FFPROBE, "-v", "error", "-show_entries", "format=duration",
               "-of", "csv=p=0", str(path)]).stdout.strip()
    return float(out)


def load_clips():
    clips = []
    for p in sorted(TRANS.glob("video_*.json")):
        d = json.load(open(p, encoding="utf-8"))
        stem = Path(d["file"]).stem
        video = SRC / (stem + ".mp4")
        if not video.exists():
            raise FileNotFoundError(video)
        segs = [s for s in d["segments"] if s["text"].strip()]
        if not segs:
            raise RuntimeError(f"{stem} 没有识别出语音")
        speech_start = segs[0]["start"]
        speech_end = segs[-1]["end"]
        dur = duration_of(video)
        start = max(0.0, speech_start - HEAD_PAD)
        end = min(dur, speech_end + TAIL_PAD)
        clips.append(dict(video=video, stem=stem, dur=dur, start=start, end=end,
                          segs=segs, transcript=d))
    return clips


def loudnorm_params(wav: Path):
    cmd = [FFMPEG, "-hide_banner", "-nostats", "-i", str(wav),
           "-af", "loudnorm=I=-16:TP=-1.0:LRA=11:print_format=json",
           "-f", "null", "-"]
    out = run(cmd).stderr
    m = re.search(r"\{[\s\S]*\}", out)
    if not m:
        raise RuntimeError("loudnorm 分析失败:\n" + out[-2000:])
    return json.loads(m.group(0))


def ts(sec: float) -> str:
    ms = int(round(sec * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    clips = load_clips()
    corrections = {}
    if CORRECTIONS_FILE.exists():
        corrections = json.load(open(CORRECTIONS_FILE, encoding="utf-8"))

    # ---- 1. 视频+音频拼接（未做响度） ----
    parts_v, parts_a, filters = [], [], []
    for i, c in enumerate(clips):
        filters.append(
            f"[{i}:v]trim=start={c['start']:.3f}:end={c['end']:.3f},setpts=PTS-STARTPTS,"
            f"scale={W}:{H}:force_original_aspect_ratio=decrease:flags=lanczos,"
            f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={FPS}[v{i}]")
        filters.append(
            f"[{i}:a]atrim=start={c['start']:.3f}:end={c['end']:.3f},asetpts=PTS-STARTPTS,"
            f"aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a{i}]")
        parts_v.append(f"[v{i}]")
        parts_a.append(f"[a{i}]")
    n = len(clips)
    concat_in = "".join(f"{v}{a}" for v, a in zip(parts_v, parts_a))
    filters.append(f"{concat_in}concat=n={n}:v=1:a=1[v][a]")
    # 画面定格补帧到「音频长度向上取整」的整帧数，音轨同长补静音。
    # 模板两处校验把画面/音轨夹在 ±0.019s 内，帧对齐必须一次到位，否则整条母版要重编码。
    total = sum(c["end"] - c["start"] for c in clips)
    frames = int(math.ceil(total * FPS - 1e-6))
    clock = frames / FPS
    filters.append(f"[v]tpad=stop_mode=clone:stop_duration=2,trim=end_frame={frames},setpts=PTS-STARTPTS[vo]")
    filters.append(f"[a]apad,atrim=duration={clock:.6f},asetpts=PTS-STARTPTS[ao]")

    raw = OUT / "master_raw.mp4"
    cmd = [FFMPEG, "-y", "-hide_banner"]
    for c in clips:
        cmd += ["-i", str(c["video"])]
    cmd += ["-filter_complex", ";".join(filters), "-map", "[vo]", "-map", "[ao]",
            "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-pix_fmt", "yuv420p", "-r", str(FPS),
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", f"{clock:.6f}", str(raw)]
    print("[1/3] 拼接中 ...", flush=True)
    r = run(cmd)
    if r.returncode != 0:
        print(r.stderr[-3000:])
        return 1

    # ---- 2. 响度标准化（仅音频） ----
    print("[2/3] 响度分析 ...", flush=True)
    wav = OUT / "master_audio.wav"
    run([FFMPEG, "-y", "-hide_banner", "-i", str(raw), "-vn", "-ac", "2",
         "-ar", "48000", str(wav)])
    p = loudnorm_params(wav)
    print(f"    实测 I={p['input_i']} TP={p['input_tp']} LRA={p['input_lra']}", flush=True)

    master = OUT / "master.mp4"
    af = (f"loudnorm=I=-16:TP=-1.0:LRA=11:linear=true:"
          f"measured_I={p['input_i']}:measured_TP={p['input_tp']}:"
          f"measured_LRA={p['input_lra']}:measured_thresh={p['input_thresh']}:"
          f"offset={p['target_offset']}")
    print("[3/3] 输出母版 ...", flush=True)
    r = run([FFMPEG, "-y", "-hide_banner", "-i", str(raw), "-c:v", "copy",
             "-af", af, "-c:a", "aac", "-b:a", "192k", "-ar", "48000", str(master)])
    if r.returncode != 0:
        print(r.stderr[-3000:])
        return 1

    # ---- 4. SRT + 映射 ----
    lines, idx, offset, mapping = [], 1, 0.0, []
    for c in clips:
        c_start = offset
        for si, s in enumerate(c["segs"]):
            key = f"{c['stem']}|{si}"
            text = corrections.get(key, s["text"])
            text = text.strip()
            if not text:
                continue
            a = c_start + max(0.0, s["start"] - c["start"])
            b = c_start + min(c["end"] - c["start"], s["end"] - c["start"])
            lines.append(f"{idx}\n{ts(a)} --> {ts(b)}\n{text}\n")
            idx += 1
        seg_len = c["end"] - c["start"]
        mapping.append(dict(stem=c["stem"], offset=round(c_start, 3),
                            length=round(seg_len, 3)))
        offset += seg_len

    (OUT / "master.srt").write_text("\n".join(lines), encoding="utf-8")
    (OUT / "timeline.json").write_text(
        json.dumps({"total": round(offset, 3), "clips": mapping},
                   ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[done] 母版 {duration_of(master):.2f}s  -> {master}")
    print(f"[done] 字幕 {idx - 1} 条 -> {OUT / 'master.srt'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
