# -*- coding: utf-8 -*-
"""生成 MotionGit native 路线的 params.json，并把母版/字幕同步到实例 inputs。

用法: python native.py --config <配置路径>
"""
import argparse
import json
import math
import os
import shutil
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import probe  # noqa: E402

FPS = 60
BRAND = "TRAE 社区"
BRIEF_SCHEMA = "adu-auto-brief/1"
SOURCE_FIELD = "口播文案-横屏.txt"
FFPROBE = (r"C:\Users\EDY\AppData\Local\Microsoft\WinGet\Packages"
           r"\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe"
           r"\ffmpeg-9.0.2-full_build\bin\ffprobe.exe")


def find_ffprobe():
    env = os.environ.get("FFPROBE")
    if env and os.path.isfile(env):
        return env
    found = shutil.which("ffprobe")
    if found:
        return found
    return FFPROBE


def frame_at(seconds):
    """秒 → 帧（四舍五入，不用银行家舍入）。"""
    return int(math.floor(float(seconds) * FPS + 0.5))


def media_duration(path):
    """用 ffprobe 读母版真实时长（优先音频流）。读不到返回 None。"""
    def ask(sel):
        cmd = [find_ffprobe(), "-v", "error"]
        if sel:
            cmd += ["-select_streams", sel]
        cmd += ["-show_entries", "stream=duration" if sel else "format=duration",
                "-of", "default=nw=1:nk=1", path]
        out = subprocess.run(cmd, capture_output=True, text=True,
                             encoding="utf-8", errors="replace", timeout=60)
        for line in (out.stdout or "").splitlines():
            line = line.strip()
            if line and line != "N/A":
                try:
                    return float(line)
                except ValueError:
                    continue
        return None

    for sel in ("a:0", None):
        try:
            value = ask(sel)
        except (OSError, subprocess.TimeoutExpired):
            return None
        if value and value > 0:
            return value
    return None


def scene_text(cues, start, end, fallback):
    """把该幕时间范围内的中文字幕拼成一段话，供模板做语义排片。"""
    picked = [c.get("zh", "") for c in cues
              if float(c.get("t0", 0)) < float(end) and float(c.get("t1", 0)) > float(start)]
    text = "".join(picked).strip()
    return text or fallback


def scene_frames(cfg, total_frames, cues):
    scenes = cfg["scenes"]
    segs = []
    for scene in scenes:
        dur = frame_at(scene["end"]) - frame_at(scene["start"])
        if dur <= 0:
            raise ValueError("场景 %s 的帧数非正数（%s）" % (scene.get("id"), dur))
        title = scene.get("title") or scene["id"]
        segs.append({
            "id": scene["id"],
            "durationFrames": dur,
            "title": title,
            "text": scene.get("text") or scene_text(cues, scene["start"], scene["end"], title),
        })
    diff = total_frames - sum(s["durationFrames"] for s in segs)
    if diff:
        segs[-1]["durationFrames"] += diff
        if segs[-1]["durationFrames"] <= 0:
            raise ValueError("补齐总帧数后最后一幕帧数非正数：%s" % segs[-1]["durationFrames"])
    return segs, diff


def same_file(src, dst):
    try:
        a = os.stat(src)
        b = os.stat(dst)
        return a.st_size == b.st_size and int(a.st_mtime) == int(b.st_mtime)
    except OSError:
        return False


def sync(src, dst):
    """已一致（size + mtime）则跳过，返回是否复制。"""
    if same_file(src, dst):
        return False
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    shutil.copy2(src, dst)
    return True


def build_params(cfg, segs, duration, evidence=None):
    publish = cfg.get("publish") or {}
    style = cfg.get("style") or "01-D"
    brief = {
        "schema": BRIEF_SCHEMA,
        "brand": BRAND,
        "layout": "landscape",
        "fps": FPS,
        "stylePolicy": "coherent-first",
        "allowedStyles": [style],
        "narrationDuration": duration,
        "music": {"mode": "none"},
        "segments": segs,
        "header": {
            "shortTitle": publish.get("titleShort") or "",
            "source": {"kind": "user-explicit", "field": SOURCE_FIELD},
        },
    }
    if evidence:
        brief["contentEvidence"] = evidence
    return {
        "media": {
            "talk": "master.mp4",
            "captions": "captions.json",
        },
        "brief": brief,
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description="生成 native 路线 params.json")
    ap.add_argument("--config", required=True, help="配置文件路径")
    args = ap.parse_args(argv)

    config_path = os.path.abspath(args.config)
    try:
        cfg = probe.read_json(config_path)
    except Exception as exc:
        print("[失败] 读取配置失败：%s（%s）" % (config_path, exc))
        return 1

    profile_file = probe.profile_path(cfg, config_path)
    if not os.path.isfile(profile_file):
        print("[探测] 未找到模板档案，先运行 probe.py ...")
        _, rc = probe.run_probe(cfg, config_path, out_path=profile_file)
        if rc != 0:
            print("[失败] 模板探测未通过，已停止。")
            return 1
    try:
        profile = probe.read_json(profile_file)
    except Exception as exc:
        print("[失败] 模板档案无法解析：%s（%s）" % (profile_file, exc))
        return 1

    root = cfg.get("root") or os.path.dirname(os.path.dirname(os.path.dirname(config_path)))
    instance = os.environ.get("MOTIONGIT_INSTANCE") or (cfg.get("template") or {}).get("instance")
    if not instance:
        print("[失败] 配置缺少 template.instance（也可用环境变量 MOTIONGIT_INSTANCE 指定）。")
        return 1
    if not os.path.isabs(instance):
        instance = os.path.normpath(os.path.join(root, instance))

    master = os.path.join(root, cfg["narration"]["master"])
    captions = os.path.join(root, cfg["captions"]["json"])
    missing = [p for p in (master, captions) if not os.path.isfile(p)]
    if missing:
        for p in missing:
            print("[失败] 素材不存在：%s" % p)
        return 1

    try:
        cues = probe.read_json(captions)
    except Exception as exc:
        print("[失败] 字幕文件无法解析：%s（%s）" % (captions, exc))
        return 1
    if not isinstance(cues, list):
        print("[失败] 字幕文件应为数组：%s" % captions)
        return 1

    cfg_duration = float(cfg["narration"]["duration"])
    duration = media_duration(master)
    if duration is None:
        duration = cfg_duration
        print("[提示] 读不到母版真实时长，沿用配置值 %.3f 秒。" % duration)
    elif abs(duration - cfg_duration) > 0.002:
        print("[提示] 母版真实时长 %.3f 秒与配置 %.3f 秒不一致，以真实时长为准。"
              % (duration, cfg_duration))
    # 向上取整，保证排片覆盖整条音轨（少一帧就会报 AUDIO_CLOCK_MISMATCH）
    total_frames = int(math.ceil(duration * FPS - 1e-6))
    if cfg.get("planMode") == "semantic":
        try:
            import semantics
            segs, total_frames, evidence = semantics.build_segments(root, total_frames, cues)
        except Exception as exc:
            print("[失败] 语义排片生成失败：%s" % exc)
            return 1
    else:
        segs, diff = scene_frames(cfg, total_frames, cues)
        evidence = None
        if diff:
            print("[提示] 各幕帧数之和与总帧数相差 %d 帧，已补到最后一幕。" % diff)

    inputs_dir = os.path.join(instance, "inputs")
    copies = [
        (master, os.path.join(inputs_dir, "master.mp4")),
        (captions, os.path.join(inputs_dir, "captions.json")),
    ]
    for src, dst in copies:
        changed = sync(src, dst)
        print("[素材] %s -> inputs\\%s（%s）" % (
            os.path.basename(src), os.path.basename(dst), "已复制" if changed else "已是最新，跳过"))

    params = build_params(cfg, segs, round(duration, 6), evidence)
    params_path = os.path.join(instance, "params.json")
    probe.write_json(params_path, params)

    print("[帧率] %d fps，共 %d 帧 / %.3f 秒" % (FPS, total_frames, duration))
    for seg in segs:
        print("  %s  %4d 帧  %s" % (seg["id"], seg["durationFrames"], seg["title"]))
    print("[校验] 各幕之和 %d 帧，总帧数 %d 帧" % (sum(s["durationFrames"] for s in segs), total_frames))
    print("[输出] %s" % params_path)
    print("[档案] verified=%s，入口 sha256 %s" % (profile.get("verified"), (profile.get("entrySha256") or "")[:12]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
