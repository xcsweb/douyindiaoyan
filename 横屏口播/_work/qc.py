# -*- coding: utf-8 -*-
"""成片质检：时长 / 分辨率帧率 / 码率 / 响度 / 黑帧 / 静音 / 字幕覆盖 / 字幕安全区。

用法：
    python qc.py --config _work\\configs\\横屏口播.json --video <成片路径> [--publish]
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
import unicodedata
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_ROOT = HERE.parent
DEFAULT_FFMPEG_DIR = Path(
    r"C:\Users\EDY\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.2-full_build\bin"
)
LEVEL_ORDER = {"PASS": 0, "WARN": 1, "FAIL": 2}


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
         "-show_entries", "stream=index,codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,bit_rate",
         "-show_entries", "format=duration,size,bit_rate",
         "-of", "json", str(video)],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if out.returncode != 0:
        return {"_error": out.stderr.strip()}
    try:
        data = json.loads(out.stdout)
    except json.JSONDecodeError:
        return {"_error": "ffprobe 输出无法解析"}
    data["_streams"] = data.get("streams") or []
    fmt = data.get("format") or {}
    for key in ("duration", "size", "bit_rate"):
        if fmt.get(key) is not None:
            data[key] = fmt[key]
    return data


def to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def fps_of(info, key="avg_frame_rate"):
    for k in (key, "r_frame_rate"):
        raw = info.get(k)
        if not raw:
            continue
        m = re.match(r"^(\d+)/(\d+)$", str(raw))
        if m and float(m.group(2)):
            return round(float(m.group(1)) / float(m.group(2)), 2)
        val = to_float(raw)
        if val:
            return round(val, 2)
    return None


def run_ffmpeg(cmd):
    return subprocess.run(cmd, capture_output=True, text=True,
                          encoding="utf-8", errors="replace")


def disp_width(text):
    return sum(2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1 for ch in str(text))


def pad(text, width, align="<"):
    text = str(text)
    gap = max(0, width - disp_width(text))
    return text + " " * gap if align == "<" else " " * gap + text


def make_item(name, level, detail, value):
    return {"name": name, "level": level, "detail": detail, "value": value}


def template_version(cfg):
    raw = str((cfg.get("template") or {}).get("package", ""))
    m = re.search(r"v?(\d+\.\d+\.\d+(?:-[A-Za-z0-9][-A-Za-z0-9.]*)?)", Path(raw).stem)
    return m.group(1) if m else "unknown"


def check_duration(cfg, duration):
    target = to_float((cfg.get("narration") or {}).get("duration"))
    if target is None:
        return make_item("时长", "PASS", "配置未给出 narration.duration，跳过", duration)
    diff = abs(duration - target)
    if diff <= 0.5:
        return make_item("时长", "PASS",
                         "实际 %.2fs，目标 %.2fs，误差 %.2fs" % (duration, target, diff),
                         {"actual": round(duration, 3), "target": target, "diff": round(diff, 3)})
    return make_item("时长", "FAIL",
                     "实际 %.2fs，目标 %.2fs，误差 %.2fs 超过 0.5s" % (duration, target, diff),
                     {"actual": round(duration, 3), "target": target, "diff": round(diff, 3)})


def check_resolution(cfg, info, publish_mode):
    out_cfg = cfg.get("output") or {}
    target_size = out_cfg.get("size") or [1920, 1080]
    target_fps = out_cfg.get("fps") or 60
    width, height = info.get("width"), info.get("height")
    fps = fps_of(info)
    issues = []
    level = "PASS"
    if [width, height] != list(target_size):
        issues.append("分辨率为 %sx%s，应为 %dx%d" % (width, height, target_size[0], target_size[1]))
        level = "FAIL"
    if fps is None:
        issues.append("无法读取帧率")
        level = "WARN"
    elif fps < 30:
        issues.append("帧率 %.2ffps 低于 30fps" % fps)
        level = "FAIL"
    elif fps < target_fps:
        issues.append("帧率 %.2ffps，未达目标的 %dfps（发布版应为 %dfps）" % (fps, target_fps, target_fps))
        level = "FAIL" if publish_mode else "WARN"
    detail = "；".join(issues) if issues else "%dx%d / %.2ffps，符合要求" % (width, height, fps)
    return make_item("分辨率与帧率", level, detail,
                     {"width": width, "height": height, "fps": fps,
                      "targetSize": target_size, "targetFps": target_fps})


def check_bitrate(cfg, info, size, duration):
    rng = (cfg.get("publish") or {}).get("bitrateMbps") or [8, 12]
    low = float(rng[0])
    bit_rate = to_float(info.get("bit_rate"))
    mbps = round(bit_rate / 1e6, 2) if bit_rate else None
    if mbps is None and size and duration:
        mbps = round((float(size) * 8 / 1e6) / duration, 2)
    if mbps is None:
        return make_item("视频码率", "WARN", "无法读取码率", None)
    if mbps < low:
        return make_item("视频码率", "WARN",
                         "平均 %.2f Mbps，低于发布下限 %g Mbps（需重编码）" % (mbps, low), mbps)
    if mbps > float(rng[1]):
        return make_item("视频码率", "WARN",
                         "平均 %.2f Mbps，高于发布上限 %g Mbps" % (mbps, float(rng[1])), mbps)
    return make_item("视频码率", "PASS", "平均 %.2f Mbps，处于 %g—%g Mbps 区间" % (mbps, low, float(rng[1])), mbps)


def check_loudness(cfg, ffmpeg, video, publish_mode):
    narration = cfg.get("narration") or {}
    publish = cfg.get("publish") or {}
    target = to_float(publish.get("loudnessLufs")) if publish_mode else to_float(narration.get("loudnessLufs"))
    if target is None:
        target = -14.0 if publish_mode else -16.0
    peak_limit = to_float(publish.get("truePeakDb"))
    if peak_limit is None:
        peak_limit = -1.0
    res = run_ffmpeg([ffmpeg, "-hide_banner", "-nostats", "-i", str(video),
                      "-af", "ebur128=peak=true", "-f", "null", "-"])
    log = res.stderr or ""
    if res.returncode != 0 and not log:
        return make_item("响度", "WARN", "ebur128 分析失败：%s" % (log.strip()[-200:] or "无输出"), None)
    integrated = None
    peak = None
    for m in re.finditer(r"I:\s*(-?\d+(?:\.\d+)?)\s*LUFS", log):
        integrated = float(m.group(1))
    for m in re.finditer(r"Peak:\s*(-?\d+(?:\.\d+)?)\s*dB", log):
        peak = float(m.group(1))
    if integrated is None:
        return make_item("响度", "WARN", "未能从 ebur128 输出解析到 Integrated 响度", None)
    problems = []
    level = "PASS"
    diff = abs(integrated - target)
    if diff > 1.0:
        problems.append("Integrated %.1f LUFS，与目标 %.1f LUFS 偏差 %.2f LU（允许 ≤1.0）"
                        % (integrated, target, diff))
        level = "FAIL"
    if peak is not None and peak > peak_limit:
        problems.append("峰值超过上限 %.1f dB" % peak_limit)
        level = "FAIL"
    detail = "Integrated %.1f LUFS（目标 %.1f），峰值 %s dB；%s" % (
        integrated, target, "%.2f" % peak if peak is not None else "-",
        "；".join(problems) if problems else "符合要求")
    return make_item("响度", level, detail,
                     {"integrated": integrated, "peak": peak, "target": target,
                      "peakLimit": peak_limit, "mode": "publish" if publish_mode else "master"})


def check_black_and_silence(ffmpeg, video, has_audio, duration):
    cmd = [ffmpeg, "-hide_banner", "-nostats", "-i", str(video),
           "-vf", "blackdetect=d=0.2:pix_th=0.10"]
    if has_audio:
        cmd += ["-af", "silencedetect=n=-45dB:d=2.0"]
    cmd += ["-f", "null", "-"]
    res = run_ffmpeg(cmd)
    log = res.stderr or ""
    blacks = []
    open_start = None
    for line in log.splitlines():
        m_start = re.search(r"black_start:\s*(-?\d+(?:\.\d+)?)", line)
        m_end = re.search(r"black_end:\s*(-?\d+(?:\.\d+)?)", line)
        if m_start:
            open_start = float(m_start.group(1))
        if m_end:
            blacks.append((open_start if open_start is not None else float(m_end.group(1)),
                           float(m_end.group(1))))
            open_start = None
    if open_start is not None:
        blacks.append((open_start, duration or None))

    silences = []
    open_sil = None
    for line in log.splitlines():
        m_start = re.search(r"silence_start:\s*(-?\d+(?:\.\d+)?)", line)
        m_end = re.search(r"silence_end:\s*(-?\d+(?:\.\d+)?)", line)
        if m_start:
            open_sil = float(m_start.group(1))
        if m_end:
            silences.append((open_sil if open_sil is not None else float(m_end.group(1)),
                             float(m_end.group(1))))
            open_sil = None
    if open_sil is not None and duration:
        silences.append((open_sil, duration))

    if blacks:
        desc = "，".join("%.2fs→%s" % (a, "%.2fs" % b if b is not None else "结尾")
                        for a, b in blacks[:6])
        black_item = make_item("黑帧", "FAIL", "检测到 %d 段黑帧：%s" % (len(blacks), desc),
                               blacks)
    else:
        black_item = make_item("黑帧", "PASS", "未检测到 ≥0.2s 的黑帧", [])

    if not has_audio:
        silence_item = make_item("静音", "PASS", "无音轨，跳过静音检测", [])
    elif silences:
        desc = "，".join("%.2fs→%.2fs" % (a, b if b is not None else 0.0) for a, b in silences[:6])
        silence_item = make_item("静音", "WARN", "检测到 %d 段 ≥2s 静音：%s" % (len(silences), desc),
                                 silences)
    else:
        silence_item = make_item("静音", "PASS", "未检测到 ≥2s 静音段", [])
    return black_item, silence_item


def load_captions(cfg, root):
    cap_cfg = cfg.get("captions") or {}
    path = cap_cfg.get("json")
    if not path:
        return None, None
    p = resolve(root, path)
    if not p.exists():
        return None, str(p)
    try:
        with open(p, "r", encoding="utf-8-sig") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return None, str(p)
    return data, str(p)


def check_captions(cfg, root, duration):
    data, path = load_captions(cfg, root)
    if data is None:
        return make_item("字幕覆盖率", "WARN", "字幕文件缺失或无法解析：%s" % (path or "未配置"), None)
    entries = data if isinstance(data, list) else data.get("captions") or []
    entries = [e for e in entries if isinstance(e, dict) and e.get("t0") is not None and e.get("t1") is not None]
    if not entries:
        return make_item("字幕覆盖率", "WARN", "字幕文件里没有可用条目", None)

    entries = sorted(entries, key=lambda e: float(e["t0"]))
    beyond = []
    gaps = []
    covered = 0.0
    for i, e in enumerate(entries):
        t0 = max(0.0, float(e["t0"]))
        t1 = float(e["t1"])
        if t1 > duration + 1e-3:
            beyond.append((e.get("id") or "#%d" % (i + 1), round(t0, 3), round(t1, 3)))
        covered += max(0.0, min(t1, duration) - min(t0, duration))
        if i + 1 < len(entries):
            nxt = float(entries[i + 1]["t0"])
            gap = nxt - t1
            if gap > 2.5:
                gaps.append((round(t1, 2), round(nxt, 2), round(gap, 2), e.get("id")))

    ratio = covered / duration if duration else 0.0
    level = "PASS"
    problems = []
    if beyond:
        level = "FAIL"
        problems.append("有 %d 条字幕超出时长：%s" % (
            len(beyond),
            "，".join("%s(%.2f→%.2fs)" % (cid, t0, t1) for cid, t0, t1 in beyond[:8])))
    if gaps:
        level = "FAIL" if level == "FAIL" else "WARN"
        problems.append("有 %d 处字幕间隔 >2.5s：%s" % (
            len(gaps),
            "，".join("%.2fs→%.2fs（%.2fs）" % (a, b, g) for a, b, g, _ in gaps[:8])))
    if ratio < 0.7:
        level = "FAIL" if level == "FAIL" else "WARN"
        problems.append("字幕总时长占比 %.1f%%，低于 70%%" % (ratio * 100))

    detail = "；".join(problems) if problems else \
        "%d 条字幕，覆盖 %.1f%%，无超时与超长间隔" % (len(entries), ratio * 100)
    return make_item("字幕覆盖率", level, detail,
                     {"count": len(entries), "ratio": round(ratio, 4),
                      "beyond": beyond, "gaps": gaps})


def find_bottom_px(obj, height, depth=0):
    """从 subtitle-bounds.json 里尽力找出字幕最低点（像素）。"""
    if depth > 4:
        return None
    if isinstance(obj, dict):
        for key, value in obj.items():
            lk = re.sub(r"[^a-z]", "", str(key).lower())
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                if lk in ("bottom", "bottomy", "maxy", "maxbottom", "lowest", "lowesty",
                          "ymax", "y2", "bottompx", "bottombound"):
                    return float(value) * height if float(value) <= 1.0 and lk != "bottompx" else float(value)
                if lk in ("bottompct", "bottompercent", "bottomsafe"):
                    return float(value) / 100.0 * height
            else:
                found = find_bottom_px(value, height, depth + 1)
                if found is not None:
                    return found
    if isinstance(obj, list):
        best = None
        for value in obj:
            if isinstance(value, dict):
                found = find_bottom_px(value, height, depth + 1)
                if found is not None and (best is None or found > best):
                    best = found
        return best
    return None


def check_safe_area(cfg, root, height):
    publish = cfg.get("publish") or {}
    pct = to_float(publish.get("safeAreaBottomPct")) or 15.0
    path = root / "_work" / "publish" / "subtitle-bounds.json"
    if not path.exists():
        return make_item("字幕安全区", "PASS", "未提供 %s，跳过检查" % path, None)
    try:
        with open(path, "r", encoding="utf-8-sig") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as exc:
        return make_item("字幕安全区", "WARN", "无法读取字幕边界文件：%s" % exc, None)
    bottom = find_bottom_px(data, height)
    if bottom is None:
        return make_item("字幕安全区", "WARN", "字幕边界文件里找不到可识别的底部坐标", None)
    limit = (1.0 - pct / 100.0) * height
    if bottom > limit:
        return make_item("字幕安全区", "FAIL",
                         "字幕最低点 %.0fpx，安全上限 %.0fpx（底部需留 %.0f%%）" % (bottom, limit, pct),
                         {"bottom": round(bottom, 1), "limit": round(limit, 1), "safeAreaBottomPct": pct})
    return make_item("字幕安全区", "PASS",
                     "字幕最低点 %.0fpx，安全上限 %.0fpx（底部留 %.0f%%）" % (bottom, limit, pct),
                     {"bottom": round(bottom, 1), "limit": round(limit, 1), "safeAreaBottomPct": pct})


def main():
    ap = argparse.ArgumentParser(description="成片质检")
    ap.add_argument("--config", required=True, help="配置文件路径")
    ap.add_argument("--video", required=True, help="待检视频路径")
    ap.add_argument("--publish", action="store_true", help="按发布规格检查（60fps / -14 LUFS）")
    args = ap.parse_args()

    cfg, cfg_path = load_config(args.config)
    root = resolve_root(cfg)
    ffmpeg = find_ffmpeg(cfg)
    ffprobe = find_ffprobe(ffmpeg)

    video = Path(args.video)
    if not video.is_absolute():
        video = (Path.cwd() / video).resolve()
    if not video.exists():
        sys.exit("待检视频不存在：%s" % video)

    info = probe(ffprobe, video)
    if info.get("_error"):
        sys.exit("ffprobe 读取失败：%s" % info["_error"])

    streams = info.get("_streams") or []
    vstream = next((s for s in streams if s.get("codec_type") == "video"), {})
    has_audio = any(s.get("codec_type") == "audio" for s in streams)
    duration = to_float(info.get("duration")) or to_float(vstream.get("duration")) or 0.0
    size = to_float(info.get("size")) or video.stat().st_size

    items = []
    items.append(check_duration(cfg, duration))
    items.append(check_resolution(cfg, vstream, args.publish))
    items.append(check_bitrate(cfg, vstream, size, duration))
    items.append(check_loudness(cfg, ffmpeg, video, args.publish))
    black_item, silence_item = check_black_and_silence(ffmpeg, video, has_audio, duration)
    items.append(black_item)
    items.append(silence_item)
    items.append(check_captions(cfg, root, duration))
    items.append(check_safe_area(cfg, root, vstream.get("height") or 1080))

    fails = [i for i in items if i["level"] == "FAIL"]
    warns = [i for i in items if i["level"] == "WARN"]
    passed = [i for i in items if i["level"] == "PASS"]

    checked_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    report = {
        "video": str(video),
        "checkedAt": checked_at,
        "publishMode": bool(args.publish),
        "version": template_version(cfg),
        "duration": round(duration, 3),
        "items": items,
        "summary": {"PASS": len(passed), "WARN": len(warns), "FAIL": len(fails)},
        "result": "FAIL" if fails else "PASS",
    }
    report_path = root / "_work" / "qc-report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    out_dir = resolve(root, (cfg.get("output") or {}).get("dir", "03-成片"))
    marker = out_dir / "可发布.json"
    if fails:
        if marker.exists():
            try:
                marker.unlink()
            except OSError:
                pass
    else:
        out_dir.mkdir(parents=True, exist_ok=True)
        with open(marker, "w", encoding="utf-8") as f:
            json.dump({
                "checkedAt": checked_at,
                "version": template_version(cfg),
                "video": str(video),
                "report": str(report_path),
                "publishMode": bool(args.publish),
                "duration": round(duration, 3),
                "warnings": len(warns),
            }, f, ensure_ascii=False, indent=2)

    print("")
    print("==== 质检报告 ====")
    print("视频：%s" % video)
    print("时长：%.2fs    模式：%s" % (duration, "发布" if args.publish else "母版"))
    print("")
    widths = [16, 6, 0]
    print("%s  %s  %s" % (pad("检查项", 16), pad("结果", 6), "说明"))
    print("%s  %s  %s" % ("-" * 16, "-" * 6, "-" * 40))
    for it in items:
        print("%s  %s  %s" % (pad(it["name"], 16), pad(it["level"], 6), it["detail"]))

    if fails:
        print("")
        print("【FAIL】共 %d 项：" % len(fails))
        for it in fails:
            print("  - %s：%s" % (it["name"], it["detail"]))
    if warns:
        print("")
        print("【WARN】共 %d 项：" % len(warns))
        for it in warns:
            print("  - %s：%s" % (it["name"], it["detail"]))

    print("")
    print("报告：%s" % report_path)
    if fails:
        print("QC 不通过")
        return 1
    print("QC 通过")
    print("可发布标记：%s" % marker)
    return 0


if __name__ == "__main__":
    sys.exit(main())
