# -*- coding: utf-8 -*-
"""生成抖音发布包：横版 / 竖版 / 封面 / 文案 / 字幕 / 素材清单。

用法：
    python publish.py --config _work\\configs\\横屏口播.json
"""

import argparse
import json
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
         "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,bit_rate",
         "-show_entries", "format=duration,size,bit_rate",
         "-of", "json", str(video)],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if out.returncode != 0:
        return {"_error": out.stderr.strip(), "_streams": []}
    try:
        data = json.loads(out.stdout)
    except json.JSONDecodeError:
        return {"_error": "ffprobe 输出无法解析", "_streams": []}
    data["_streams"] = data.get("streams") or []
    return data


def to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def num_text(x):
    return "%g" % float(x)


def template_version(cfg):
    raw = str((cfg.get("template") or {}).get("package", ""))
    m = re.search(r"v?(\d+\.\d+\.\d+(?:-[A-Za-z0-9][-A-Za-z0-9.]*)?)", Path(raw).stem)
    return m.group(1) if m else "unknown"


def human_size(num):
    if num is None:
        return "-"
    mb = float(num) / (1024 * 1024)
    return "%.2f MB" % mb


def run_ffmpeg(cmd):
    return subprocess.run(cmd, capture_output=True, text=True,
                          encoding="utf-8", errors="replace")


def disp_width(text):
    return sum(2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1 for ch in str(text))


def pad(text, width, align="<"):
    text = str(text)
    gap = max(0, width - disp_width(text))
    return text + " " * gap if align == "<" else " " * gap + text


def fail_message(step, res):
    tail = (res.stderr or "").strip().splitlines()[-4:]
    print("  [失败] %s：ffmpeg 返回码 %d" % (step, res.returncode))
    for line in tail:
        print("    " + line)


def build_manifest_md(root, cfg, clips):
    lines = []
    lines.append("# 素材清单（最小版）")
    lines.append("")
    lines.append("- 模板版本：%s" % template_version(cfg))
    lines.append("- 素材来源：%s（口播） / %s（录屏）" % (
        (cfg.get("sources") or {}).get("talk", "01-口播素材"),
        (cfg.get("sources") or {}).get("screen", "02-录屏素材")))
    narration = cfg.get("narration") or {}
    lines.append("- 母版：%s（%.2fs / %sx%s / %sfps）" % (
        narration.get("master", "_work\\master\\master.mp4"),
        to_float(narration.get("duration")) or 0.0,
        (narration.get("size") or [1920, 1080])[0],
        (narration.get("size") or [1920, 1080])[1],
        narration.get("fps", 30)))
    lines.append("")
    lines.append("## 录屏插片")
    if clips:
        lines.append("")
        lines.append("| 源录屏 | 使用区间(s) | 绑定区间(s) | 模式 | 片段文件 |")
        lines.append("|---|---|---|---|---|")
        for c in clips:
            rng = c.get("range") or [None, None]
            bind = c.get("bind") or [None, None]
            lines.append("| %s | %s—%s | %s—%s | %s | %s |" % (
                Path(str(c.get("source", ""))).name,
                num_text(rng[0]) if rng[0] is not None else "-",
                num_text(rng[1]) if rng[1] is not None else "-",
                num_text(bind[0]) if bind and bind[0] is not None else "-",
                num_text(bind[1]) if bind and bind[1] is not None else "-",
                c.get("mode", "clip"),
                c.get("name", "-")))
    else:
        lines.append("")
        lines.append("_work\\clips\\clips.json 不存在或为空，暂无插片数据。")
    lines.append("")
    lines.append("## 校验")
    lines.append("")
    lines.append("- 质检报告：_work\\qc-report.json（详见 qc.py 输出）")
    lines.append("")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description="生成抖音发布包")
    ap.add_argument("--config", required=True, help="配置文件路径")
    args = ap.parse_args()

    cfg, cfg_path = load_config(args.config)
    root = resolve_root(cfg)
    ffmpeg = find_ffmpeg(cfg)
    ffprobe = find_ffprobe(ffmpeg)

    instance = (cfg.get("template") or {}).get("instance")
    if not instance:
        sys.exit("配置缺少 template.instance，无法定位成片")
    render_name = (cfg.get("output") or {}).get("render", "video.mp4")
    src = resolve(Path(instance).resolve() if Path(instance).is_absolute() else root, render_name)
    if not src.exists():
        print("成片不存在：%s" % src)
        print("请先跑完渲染（render）生成 video.mp4，再执行发布打包。")
        return 1

    publish_cfg = cfg.get("publish") or {}
    out_dir = resolve(root, (cfg.get("output") or {}).get("dir", "03-成片")) / "发布包"
    out_dir.mkdir(parents=True, exist_ok=True)

    info = probe(ffprobe, src)
    if info.get("_error"):
        print("无法读取成片信息：%s" % info["_error"])
        return 1
    streams = info.get("_streams") or []
    has_audio = any(s.get("codec_type") == "audio" for s in streams)
    duration = to_float(info.get("duration")) or 0.0
    vstream = next((s for s in streams if s.get("codec_type") == "video"), {})
    bit_rate = to_float(vstream.get("bit_rate")) or to_float(info.get("bit_rate"))
    if not bit_rate and duration:
        bit_rate = (to_float(info.get("size")) or src.stat().st_size) * 8 / duration
    mbps = round(bit_rate / 1e6, 2) if bit_rate else None

    rng = publish_cfg.get("bitrateMbps") or [8, 12]
    low, high = float(rng[0]), float(rng[1])
    fps_target = (cfg.get("output") or {}).get("fps") or 60
    v_size = publish_cfg.get("verticalSize") or [1080, 1920]
    c_size = publish_cfg.get("coverSize") or [1080, 1440]
    lufs = to_float(publish_cfg.get("loudnessLufs")) or -14.0
    tp = to_float(publish_cfg.get("truePeakDb"))
    tp = -1.0 if tp is None else tp

    print("")
    print("==== 生成抖音发布包 ====")
    print("源成片：%s（%.2fs，%sx%s，%s Mbps）" % (
        src, duration, vstream.get("width"), vstream.get("height"),
        "%.2f" % mbps if mbps else "-"))
    print("输出目录：%s" % out_dir)
    print("")

    produced = []
    failures = []

    # 1. 横版-抖音.mp4
    horiz = out_dir / "横版-抖音.mp4"
    if mbps and low <= mbps <= high and vstream.get("codec_name") == "h264":
        print("[1/6] 横版-抖音.mp4：码率 %.2f Mbps 已在 %g—%g 区间，流拷贝" % (mbps, low, high))
        cmd = [ffmpeg, "-hide_banner", "-nostats", "-loglevel", "error", "-y",
               "-i", str(src), "-c", "copy", "-movflags", "+faststart", str(horiz)]
    else:
        print("[1/6] 横版-抖音.mp4：码率 %s，重编码为高码率 H.264" % ("%.2f Mbps" % mbps if mbps else "未知"))
        cmd = [ffmpeg, "-hide_banner", "-nostats", "-loglevel", "error", "-y",
               "-i", str(src),
               "-c:v", "libx264", "-profile:v", "high", "-preset", "medium",
               "-crf", "18", "-r", str(fps_target), "-pix_fmt", "yuv420p",
               "-movflags", "+faststart"]
        if has_audio:
            cmd += ["-c:a", "aac", "-b:a", "192k", "-ar", "48000"]
        cmd += [str(horiz)]
    res = run_ffmpeg(cmd)
    if res.returncode == 0 and horiz.exists():
        print("      完成：%s" % human_size(horiz.stat().st_size))
        produced.append(horiz)
    else:
        fail_message("横版-抖音.mp4", res)
        failures.append("横版-抖音.mp4 生成失败")

    # 2. 竖版-抖音.mp4
    vert = out_dir / "竖版-抖音.mp4"
    print("[2/6] 竖版-抖音.mp4：%dx%d，横版画面居中 + 同帧模糊填充" % (v_size[0], v_size[1]))
    filter_complex = (
        "[0:v]split=2[bg][fg];"
        "[bg]scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d,boxblur=20:2[bgblur];"
        "[fg]scale=%d:%d:force_original_aspect_ratio=decrease[fgsc];"
        "[bgblur][fgsc]overlay=(W-w)/2:(H-h)/2:shortest=1[v]"
        % (v_size[0], v_size[1], v_size[0], v_size[1], v_size[0], v_size[1])
    )
    cmd = [ffmpeg, "-hide_banner", "-nostats", "-loglevel", "error", "-y",
           "-i", str(src), "-filter_complex", filter_complex, "-map", "[v]"]
    if has_audio:
        cmd += ["-map", "0:a:0", "-af", "loudnorm=I=%g:TP=%g:LRA=11" % (lufs, tp)]
    cmd += ["-c:v", "libx264", "-profile:v", "high", "-preset", "medium",
            "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
    if has_audio:
        cmd += ["-c:a", "aac", "-b:a", "192k", "-ar", "48000"]
    cmd += [str(vert)]
    res = run_ffmpeg(cmd)
    if res.returncode == 0 and vert.exists():
        print("      完成：%s" % human_size(vert.stat().st_size))
        produced.append(vert)
    else:
        fail_message("竖版-抖音.mp4", res)
        failures.append("竖版-抖音.mp4 生成失败")

    # 3. 封面
    cover_times = publish_cfg.get("coverTimes") or [2.6, 40.0, 96.0]
    for i, t in enumerate(cover_times, 1):
        ts = min(float(t), max(0.0, duration - 0.1)) if duration else float(t)
        cover = out_dir / ("封面-%02d.jpg" % i)
        print("[3/6] 封面-%02d.jpg：第 %.2fs 抽帧，居中裁成 %dx%d" % (i, ts, c_size[0], c_size[1]))
        cmd = [ffmpeg, "-hide_banner", "-nostats", "-loglevel", "error", "-y",
               "-ss", "%.3f" % ts, "-i", str(src), "-frames:v", "1",
               "-vf", "scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d" %
               (c_size[0], c_size[1], c_size[0], c_size[1]),
               "-q:v", "2", str(cover)]
        res = run_ffmpeg(cmd)
        if res.returncode == 0 and cover.exists():
            print("      完成：%s" % human_size(cover.stat().st_size))
            produced.append(cover)
        else:
            fail_message("封面-%02d.jpg" % i, res)
            failures.append("封面-%02d.jpg 生成失败" % i)

    # 4. 标题与文案.txt
    text_path = out_dir / "标题与文案.txt"
    print("[4/6] 标题与文案.txt")
    title = publish_cfg.get("title") or publish_cfg.get("titleShort") or ""
    body = publish_cfg.get("body") or ""
    tags = " ".join(publish_cfg.get("hashtags") or [])
    content = "%s\n\n%s\n\n%s\n" % (title, body, tags)
    try:
        with open(text_path, "w", encoding="utf-8", newline="\n") as f:
            f.write(content)
        print("      完成：%s" % human_size(text_path.stat().st_size))
        produced.append(text_path)
    except OSError as exc:
        print("  [失败] 标题与文案.txt：%s" % exc)
        failures.append("标题与文案.txt 写入失败")

    # 5. 字幕 master.srt
    srt_src = resolve(root, (cfg.get("narration") or {}).get("masterSrt", "_work\\master\\master.srt"))
    print("[5/6] master.srt")
    if srt_src.exists():
        try:
            shutil.copy2(srt_src, out_dir / "master.srt")
            print("      完成：复制自 %s" % srt_src)
            produced.append(out_dir / "master.srt")
        except OSError as exc:
            print("  [失败] master.srt：%s" % exc)
            failures.append("master.srt 复制失败")
    else:
        print("  [失败] master.srt：源文件不存在 %s" % srt_src)
        failures.append("master.srt 缺少源文件")

    # 6. 素材清单.md
    print("[6/6] 素材清单.md")
    project_md = resolve(root, (cfg.get("output") or {}).get("dir", "03-成片")) / "素材清单.md"
    clips_path = root / "_work" / "clips" / "clips.json"
    clips = []
    if clips_path.exists():
        try:
            with open(clips_path, "r", encoding="utf-8-sig") as f:
                clips = json.load(f)
        except (json.JSONDecodeError, OSError):
            clips = []
    if not project_md.exists():
        try:
            project_md.parent.mkdir(parents=True, exist_ok=True)
            with open(project_md, "w", encoding="utf-8", newline="\n") as f:
                f.write(build_manifest_md(root, cfg, clips))
            print("      生成最小版素材清单：%s" % project_md)
        except OSError as exc:
            print("  [失败] 素材清单.md 生成：%s" % exc)
            failures.append("素材清单.md 生成失败")
    try:
        shutil.copy2(project_md, out_dir / "素材清单.md")
        print("      完成：复制进发布包")
        produced.append(out_dir / "素材清单.md")
    except OSError as exc:
        print("  [失败] 素材清单.md 复制：%s" % exc)
        failures.append("素材清单.md 复制失败")

    print("")
    print("==== 发布包清单 ====")
    for p in sorted(out_dir.iterdir()):
        if p.is_file():
            print("%s  %s" % (pad(p.name, 20), pad(human_size(p.stat().st_size), 10, ">")))
    print("")
    print("共 %d 个文件，目录：%s" % (len([p for p in out_dir.iterdir() if p.is_file()]), out_dir))
    if failures:
        print("部分步骤失败（已完成产物已保留）：")
        for f in failures:
            print("  - %s" % f)
        return 1
    print("发布包生成完成。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
