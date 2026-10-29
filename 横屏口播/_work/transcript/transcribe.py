# -*- coding: utf-8 -*-
"""逐段转写 16k 单声道 wav，输出 JSON（含词级时间戳）。

用法: python transcribe.py
"""
import gc
import json
import os
import subprocess
import sys
import traceback
from pathlib import Path

# 模型下载走镜像站，并禁用 xet（xet CAS 返回 401 会直接失败）
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

AUDIO_DIR = Path(r"d:\backup-zips\www\douyindiaoyan\横屏口播\_work\audio")
OUT_DIR = Path(r"d:\backup-zips\www\douyindiaoyan\横屏口播\_work\transcript")
FFPROBE = r"C:\Users\EDY\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.2-full_build\bin\ffprobe.exe"

ASR_KWARGS = dict(
    language="zh",
    vad_filter=True,
    word_timestamps=True,
    beam_size=5,
)


def probe_duration(path: Path) -> float:
    out = subprocess.run(
        [FFPROBE, "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return float(out)


def load_model():
    from faster_whisper import WhisperModel
    try:
        return WhisperModel("small", device="cpu", compute_type="int8")
    except Exception as exc:
        print(f"[warn] 模型首次加载失败: {type(exc).__name__}: {exc}", flush=True)
        print("[warn] 设置 HF_ENDPOINT=https://hf-mirror.com 后重试一次", flush=True)
        os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
        return WhisperModel("small", device="cpu", compute_type="int8")


def transcribe_one(wav: Path) -> dict:
    duration = probe_duration(wav)
    model = load_model()  # 每段独立加载，用完即释放
    try:
        segments_iter, info = model.transcribe(str(wav), **ASR_KWARGS)
        segments = []
        for seg in segments_iter:
            segments.append({
                "start": round(float(seg.start), 3),
                "end": round(float(seg.end), 3),
                "text": seg.text.strip(),
                "words": [
                    {
                        "word": w.word,
                        "start": round(float(w.start), 3) if w.start is not None else None,
                        "end": round(float(w.end), 3) if w.end is not None else None,
                        "probability": round(float(w.probability), 4),
                    }
                    for w in (seg.words or [])
                ],
            })
        return {
            "file": wav.name,
            "duration": round(duration, 3),
            "language": info.language,
            "language_probability": round(float(info.language_probability), 4),
            "segments": segments,
        }
    finally:
        del model
        gc.collect()


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    wavs = sorted(AUDIO_DIR.glob("*.wav"))
    if not wavs:
        print(f"[error] 没有找到 wav: {AUDIO_DIR}")
        return 1

    ok, failed = 0, []
    for wav in wavs:
        out_path = OUT_DIR / (wav.stem + ".json")
        print(f"[asr] {wav.name} ...", flush=True)
        try:
            data = transcribe_one(wav)
        except Exception:
            traceback.print_exc()
            failed.append(wav.name)
            continue
        out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[asr] {wav.name} -> {out_path.name} "
              f"({len(data['segments'])} segments, {data['duration']}s)", flush=True)
        ok += 1

    print(f"[done] ok={ok} failed={failed}", flush=True)
    return 0 if not failed else 2


if __name__ == "__main__":
    sys.exit(main())
