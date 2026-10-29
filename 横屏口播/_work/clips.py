# -*- coding: utf-8 -*-
"""按配置裁切屏幕录屏插片，统一为 1920x1080 / 60fps / H.264 / 无音轨。

用法：
    python clips.py --config _work\\configs\\横屏口播.json [--force]
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_ROOT = HERE.parent
DEFAULT_FFMPEG_DIR = Path(
    r"C:\Users\EDY\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.2-full_build\bin"
)


def load_config(path):
    p = Path(path)
    if not p.is_absolute():
        p = (Path.cwd() / p).resolve()
    if not p.exists():
        sys.exit("配置不存在：%s" % p)
    with open(p, "r", encoding="utf-8-sig") as f:
        return json.load(f), p


def resolve_root(cfg):
    root = cfg.get("root")
    return Path(root).resolve() if root else DEFAULT_ROOT


def resolve(base, value):
    p = Path(value)
    return p if p.is_absolute() else (base / p)


def find_ffmpeg(cfg):
    cand = (cfg.get("tools") or {}).get("ffmpeg")
    if cand and Path(cand).exists():
        return str(cand)
    exe = DEFAULT_FFMPEG_DIR / "ffmpeg.exe"
    if exe.exists():
        return str(exe)
    found = shutil.which("ffmpeg")
    if found:
        return found
    sys.exit("找不到 ffmpeg，请在配置 tools.ffmpeg 指定路径")


def find_ffprobe(ffmpeg_path):
    cand = Path(ffmpeg_path).with_name("ffprobe.exe")
    if cand.exists():
        return str(cand)
    found = shutil.which("ffprobe")
    if found:
        return found
    sys.exit("找不到 ffprobe")


def probe(ffprobe_path, video):
    out = subprocess.run(
        [ffprobe_path, "-v", "error",
         "-select_streams", "v:0",
         "-show_entries", "stream=width,height,r_frame_rate,avg_frame_rate,codec_name,bit_rate",
         "-show_entries", "format=duration,size,bit_rate",
         "-of", "json", str(video)],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if out.returncode != 0:
        return {}
    try:
        data = json.loads(out.stdout)
    except json.JSONDecodeError:
        return {}
    info = {}
    streams = data.get("streams") or []
    if streams:
        st = streams[0]
        info.update({k: st.get(k) for k in ("width", "height", "r_frame_rate",
                                            "avg_frame_rate", "codec_name", "bit_rate")})
    fmt = data.get("format") or {}
    for k in ("duration", "size", "bit_rate"):
        if fmt.get(k) is not None:
            info[k] = fmt[k]
    return info


def to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def fps_of(info):
    for key in ("avg_frame_rate", "r_frame_rate"):
        raw = info.get(key)
        if not raw:
            continue
        m = re.match(r"^(\d+)/(\d+)$", str(raw))
        if m:
            den = float(m.group(2))
            if den:
                return round(float(m.group(1)) / den, 2)
        val = to_float(raw)
        if val:
            return round(val, 2)
    return None


def num_text(x):
    return ("%g" % float(x))


def clean_stem(name):
    return re.sub(r"[\s:]", "", Path(name).stem)


def disp_width(text):
    return sum(2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1 for ch in str(text))


def pad(text, width, align="<"):
    text = str(text)
    gap = max(0, width - disp_width(text))
    return text + " " * gap if align == "<" else " " * gap + text


def human_size(num):
    if num is None:
        return "-"
    mb = float(num) / (1024 * 1024)
    return "%.2f MB" % mb


def run_ffmpeg(cmd):
    res = subprocess.run(cmd, capture_output=True, text=True,
                         encoding="utf-8", errors="replace")
    return res


def main():
    ap = argparse.ArgumentParser(description="裁切录屏插片")
    ap.add_argument("--config", required=True, help="配置文件路径")
    ap.add_argument("--force", action="store_true", help="忽略已有产物，强制重做")
    args = ap.parse_args()

    cfg, cfg_path = load_config(args.config)
    root = resolve_root(cfg)
    ffmpeg = find_ffmpeg(cfg)
    ffprobe = find_ffprobe(ffmpeg)
    src_dir = resolve(root, (cfg.get("sources") or {}).get("screen", "02-录屏素材"))
    out_dir = root / "_work" / "clips"
    out_dir.mkdir(parents=True, exist_ok=True)

    inserts = cfg.get("screenInserts") or []
    if not inserts:
        sys.exit("配置里没有 screenInserts，无需裁切")

    rows = []
    errors = 0
    for idx, item in enumerate(inserts, 1):
        clip = item.get("clip")
        rng = item.get("range") or [0, 0]
        mode = (item.get("mode") or "clip").lower()
        bind = item.get("bind")
        src = src_dir / clip
        if not src.exists():
            print("[%d] 源文件缺失：%s" % (idx, src))
            rows.append((idx, clip, "-", "-", "-", "失败：源缺失"))
            errors += 1
            continue

        src_info = probe(ffprobe, src)
        src_dur = to_float(src_info.get("duration")) or 0.0
        start = max(0.0, float(rng[0]))
        end = float(rng[1])
        clipped = False
        if src_dur and end > src_dur:
            end = round(src_dur, 3)
            clipped = True
        if end <= start:
            print("[%d] 区间无效：%s %s" % (idx, clip, rng))
            rows.append((idx, clip, "%s-%s" % (num_text(start), num_text(end)),
                         "-", "-", "失败：区间无效"))
            errors += 1
            continue

        name = "%s_%s-%s.mp4" % (clean_stem(clip), num_text(start), num_text(end))
        out = out_dir / name
        rel_out = str(out.relative_to(root)) if out.is_relative_to(root) else str(out)

        if out.exists() and not args.force and out.stat().st_mtime >= src.stat().st_mtime:
            info = probe(ffprobe, out)
            dur = to_float(info.get("duration"))
            status = "跳过（已存在且较新）"
        else:
            vf = ("setpts=(PTS-STARTPTS)/0.85,fps=60,scale=1920:1080"
                  if mode == "slowmo" else "fps=60,scale=1920:1080")
            cmd = [
                ffmpeg, "-hide_banner", "-nostats", "-loglevel", "error", "-y",
                "-ss", num_text(start), "-to", num_text(end), "-i", str(src),
                "-vf", vf, "-an",
                "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                "-pix_fmt", "yuv420p",
                str(out),
            ]
            res = run_ffmpeg(cmd)
            if res.returncode != 0 or not out.exists():
                tail = (res.stderr or "").strip().splitlines()[-6:]
                print("[%d] 裁切失败：%s" % (idx, clip))
                for line in tail:
                    print("    " + line)
                rows.append((idx, clip, "%s-%s" % (num_text(start), num_text(end)),
                             "-", "-", "失败：ffmpeg 报错"))
                errors += 1
                continue
            info = probe(ffprobe, out)
            dur = to_float(info.get("duration"))
            status = "完成"

        res_w = info.get("width")
        res_h = info.get("height")
        out_fps = fps_of(info)
        size = out.stat().st_size
        rows.append((idx, clip,
                     "%s-%s%s" % (num_text(start), num_text(end), "*" if clipped else ""),
                     "%.2fs" % dur if dur else "-",
                     human_size(size),
                     "%s（%sx%s/%s）" % (status, res_w, res_h, num_text(out_fps) if out_fps else "-")))

    # 汇总清单（重新组装，避免异常项漏写）
    manifest = []
    for idx, item in enumerate(inserts):
        clip = item.get("clip")
        rng = item.get("range") or [0, 0]
        start = max(0.0, float(rng[0]))
        src = src_dir / clip
        src_info = probe(ffprobe, src) if src.exists() else {}
        src_dur = to_float(src_info.get("duration")) or 0.0
        end = float(rng[1])
        if src_dur and end > src_dur:
            end = round(src_dur, 3)
        name = "%s_%s-%s.mp4" % (clean_stem(clip), num_text(start), num_text(end))
        out = out_dir / name
        if not out.exists():
            continue
        info = probe(ffprobe, out)
        manifest.append({
            "name": name,
            "source": str(src.relative_to(root)) if src.exists() and src.is_relative_to(root) else str(src),
            "range": [start, end],
            "output": str(out.relative_to(root)) if out.is_relative_to(root) else str(out),
            "duration": round(to_float(info.get("duration")) or 0.0, 3),
            "size": out.stat().st_size,
            "fps": fps_of(info),
            "mode": (item.get("mode") or "clip").lower(),
            "bind": item.get("bind"),
        })

    manifest_path = out_dir / "clips.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print("")
    headers = ["#", "源文件", "区间(s)", "时长", "大小", "结果"]
    widths = [3, 26, 16, 9, 11, 34]
    print("  ".join(pad(h, widths[i]) for i, h in enumerate(headers)))
    print("  ".join("-" * widths[i] for i in range(len(headers))))
    for row in rows:
        print("  ".join(pad(cell, widths[i]) for i, cell in enumerate(row)))
    print("")
    print("清单：%s（%d 条）" % (manifest_path, len(manifest)))
    if errors:
        print("共 %d 条失败，请检查上面日志。" % errors)
        return 1
    print("全部完成。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
