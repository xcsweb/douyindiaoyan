#!/usr/bin/env python3
"""Build MotionGit basic scenes without replacing native authored groups."""
from __future__ import annotations

import json
import math
from pathlib import Path, PurePosixPath
import shutil
import sys

KINDS = {"keyword", "points", "explanation", "conclusion"}
ALIASES = {"keywords": "keyword", "list": "points", "explain": "explanation", "paragraph": "explanation", "summary": "conclusion"}
STYLE_ALIASES = {"continuous-performance": "continuous", "doubao-console-performance": "console", "vivid-sticker-performance": "vivid"}
SOUND_TYPES = {"enter": "whoosh", "keyword": "pop", "point": "tick", "explanation": "slide", "conclusion": "check"}


def integer(value: object, label: str, minimum: int = 0) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise ValueError(f"{label} 必须是至少 {minimum} 的整数")
    return value


def text(value: object, label: str, required: bool = False) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{label} 必须是文字")
    if required and not value.strip():
        raise ValueError(f"{label} 不能为空")
    if len(value) > 2000:
        raise ValueError(f"{label} 超过 2000 字；请拆成多个解释组")
    return value


def validate(raw: dict) -> dict:
    if not isinstance(raw, dict):
        raise ValueError("配置必须是 JSON 对象")
    config = dict(raw)
    style = text(config.get("style", "continuous"), "style")
    config["style"] = STYLE_ALIASES.get(style, style)
    if config["style"] not in {"continuous", "console", "vivid"}:
        raise ValueError("style 必须是 continuous、console 或 vivid")
    config.setdefault("layout", "landscape")
    text(config["layout"], "layout")
    if config["layout"] not in {"landscape", "portrait"}:
        raise ValueError("layout 必须是 landscape 或 portrait")
    config.setdefault("fps", 60)
    if integer(config["fps"], "fps", 1) != 60:
        raise ValueError("本基础镜头合同为 60fps")
    config["width"], config["height"] = (1920, 1080) if config["layout"] == "landscape" else (1080, 1920)
    config["brand"] = text(config.get("brand", ""), "brand")
    if len(config["brand"]) > 60:
        raise ValueError("brand 超过 60 字")
    config.setdefault("presenter", False)
    if not isinstance(config["presenter"], bool):
        raise ValueError("presenter 必须为布尔值")
    segments = config.get("segments")
    if not isinstance(segments, list) or not segments:
        raise ValueError("segments 至少包含一个镜头")
    normalized = []
    previous_end = 0
    for index, item in enumerate(segments):
        at = f"segments[{index}]"
        if not isinstance(item, dict):
            raise ValueError(f"{at} 必须是对象")
        seg = dict(item)
        text(seg.get("kind"), f"{at}.kind", True)
        seg["kind"] = ALIASES.get(seg.get("kind"), seg.get("kind"))
        if seg["kind"] not in KINDS:
            raise ValueError(f"{at}.kind 不支持；可用 keyword/points/explanation/conclusion")
        seg["startFrame"] = integer(seg.get("startFrame"), f"{at}.startFrame")
        seg["durationFrames"] = integer(seg.get("durationFrames"), f"{at}.durationFrames", 120)
        if seg["startFrame"] != previous_end:
            raise ValueError(f"{at} 与前组之间有空隙或重叠；请让组完整覆盖输出时间")
        seg["title"] = text(seg.get("title", ""), f"{at}.title")
        seg["text"] = text(seg.get("text", ""), f"{at}.text")
        entries = seg.get("items", [])
        if not isinstance(entries, list):
            raise ValueError(f"{at}.items 必须是数组")
        if seg["kind"] == "points":
            if not 1 <= len(entries) <= 6:
                raise ValueError(f"{at} 要点必须为 1–6 项")
            seg["items"] = [text(v, f"{at}.items[{j}]", True) for j, v in enumerate(entries)]
            if not seg["title"].strip():
                raise ValueError(f"{at} 要点组需要标题")
        else:
            if entries:
                raise ValueError(f"{at} 的 items 只适用于要点组，避免输入被忽略")
            seg["items"] = []
            if not (seg["title"].strip() or seg["text"].strip()):
                raise ValueError(f"{at} 至少需要 title 或 text")
        count = len(seg["items"]) if seg["kind"] == "points" else 1
        cues = seg.get("cueFrames", [24 + j * 18 for j in range(count)])
        if not isinstance(cues, list) or len(cues) != count:
            raise ValueError(f"{at}.cueFrames 需要 {count} 个组内相对帧")
        cues = [integer(v, f"{at}.cueFrames", 12) for v in cues]
        if cues != sorted(set(cues)) or any(v > seg["durationFrames"] - 90 for v in cues):
            raise ValueError(f"{at}.cueFrames 必须严格递增并为动作/尾音留至少 90 帧")
        seg["cueFrames"] = cues
        seg["cueEvidence"] = "provided-relative-frames" if "cueFrames" in item else "intrinsic-motion-schedule"
        evidence = seg.get("evidence")
        if evidence is not None:
            if not isinstance(evidence, dict):
                raise ValueError(f"{at}.evidence 必须是对象")
            frame_dir = evidence.get("frameDir", "")
            if not isinstance(frame_dir, str) or not frame_dir or "\\" in frame_dir or PurePosixPath(frame_dir).is_absolute() or any(v in {".", ".."} for v in frame_dir.split("/")):
                raise ValueError(f"{at}.evidence.frameDir 必须是实例内相对目录")
            evidence["frameCount"] = integer(evidence.get("frameCount"), f"{at}.evidence.frameCount", 1)
            evidence["fps"] = integer(evidence.get("fps", 60), f"{at}.evidence.fps", 1)
            if evidence["fps"] != config["fps"]:
                raise ValueError(f"{at}.evidence 需按输出 60fps 准备")
            evidence["startFrame"] = integer(evidence.get("startFrame", 0), f"{at}.evidence.startFrame")
            evidence["durationFrames"] = integer(evidence.get("durationFrames", evidence["frameCount"]), f"{at}.evidence.durationFrames", 1)
            if evidence["durationFrames"] > evidence["frameCount"] or evidence["startFrame"] + evidence["durationFrames"] > seg["durationFrames"]:
                raise ValueError(f"{at}.evidence 素材不足或超出镜头时间")
            if "offset" in evidence and (isinstance(evidence["offset"], bool) or not isinstance(evidence["offset"], (int, float)) or not math.isfinite(evidence["offset"]) or evidence["offset"] < 0):
                raise ValueError(f"{at}.evidence.offset 必须是有限非负秒数")
            seg["evidence"] = evidence
        previous_end = seg["startFrame"] + seg["durationFrames"]
        normalized.append(seg)
    config["segments"] = normalized
    config["totalFrames"] = previous_end
    if "totalFrames" in raw and raw["totalFrames"] != previous_end:
        raise ValueError("totalFrames 必须与镜头覆盖总帧数相同")
    captions = config.get("captions", [])
    if not isinstance(captions, list):
        raise ValueError("captions 必须是数组")
    for index, cap in enumerate(captions):
        if not isinstance(cap, dict):
            raise ValueError(f"captions[{index}] 必须是对象")
        start, end = cap.get("start"), cap.get("end")
        if any(isinstance(v, bool) or not isinstance(v, (float, int)) or not math.isfinite(v) for v in (start, end)):
            raise ValueError(f"captions[{index}] 起止必须为有限秒数")
        if not 0 <= start < end <= previous_end / config["fps"] + 1e-7:
            raise ValueError(f"captions[{index}] 超出成片时间")
        cap["text"] = text(cap.get("text", ""), f"captions[{index}].text", True)
        cap["translation"] = text(cap.get("translation", ""), f"captions[{index}].translation")
    config["captions"] = captions
    return config


def events(config: dict) -> list[dict]:
    out = []
    fps = config["fps"]
    for seg in config["segments"]:
        start = seg["startFrame"]
        out.append({"time": (start + 6) / fps, "type": SOUND_TYPES["enter"], "gain": 0.35})
        category = {"keyword": "keyword", "points": "point", "explanation": "explanation", "conclusion": "conclusion"}[seg["kind"]]
        for cue in seg["cueFrames"]:
            out.append({"time": (start + cue) / fps, "type": SOUND_TYPES[category], "gain": 0.42 if seg["kind"] == "conclusion" else 0.3})
    return sorted(out, key=lambda e: e["time"])


def build(project: Path, config_path: Path) -> dict:
    raw = json.loads(config_path.read_text(encoding="utf-8"))
    config = validate(raw)
    source = Path(__file__).resolve().parent
    project.mkdir(parents=True, exist_ok=True)
    # Original input is preserved separately from the normalized runtime config.
    (project / "config.json").write_text(json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for name in ("index.html", "style.css"):
        shutil.copy2(source / name, project / name)
    main = "window.MOTION_CONFIG = " + json.dumps(config, ensure_ascii=False) + ";\n" + (source / "main.js").read_text(encoding="utf-8")
    (project / "main.js").write_text(main, encoding="utf-8")
    if not config["presenter"]:
        # Avoid referencing an optional script when there is no presenter.
        html = (project / "index.html").read_text(encoding="utf-8").replace('<script src="talkmap.js"></script>', '')
        (project / "index.html").write_text(html, encoding="utf-8")
    elif not (project / "talkmap.js").is_file():
        raise ValueError("presenter=true 需要 import_talk.py 生成的 talkmap.js 与真实 talk 帧")
    css = (project / "style.css").read_text(encoding="utf-8")
    for stem in ("NotoSansSC", "NotoSansMono"):
        upstream = next((source.parents[1] / "assets" / "fonts" / (stem + ext) for ext in (".woff2", ".ttf") if (source.parents[1] / "assets" / "fonts" / (stem + ext)).is_file()), None)
        if upstream is None:
            raise ValueError(f"缺少本地字体 {stem}.woff2 或 .ttf")
        target = project / "fonts" / upstream.name
        if not target.is_file():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(upstream, target)
        if upstream.suffix == ".woff2":
            css = css.replace(f"fonts/{stem}.ttf') format('truetype')", f"fonts/{stem}.woff2') format('woff2')")
    (project / "style.css").write_text(css, encoding="utf-8")
    sfx = events(config)
    (project / "sfx_events.json").write_text(json.dumps(sfx, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    native = [{"t": e["time"], "type": e["type"], "g": e["gain"]} for e in sfx]
    (project / "sfx_native.json").write_text(json.dumps(native, indent=2) + "\n", encoding="utf-8")
    (project / "sfx.json").write_text(json.dumps({"end": config["totalFrames"] / config["fps"], "sfx": native}, indent=2) + "\n", encoding="utf-8")
    scenes = [{**s, "id": f"motiongit-basic-{i+1}-{s['kind']}", "sceneId": s["kind"], "start_frame": s["startFrame"], "end_frame": s["startFrame"] + s["durationFrames"], "endFrame": s["startFrame"] + s["durationFrames"], "origin": "new-extension"} for i, s in enumerate(config["segments"])]
    plan = {"schema": "motiongit-basic/1", "fps": config["fps"], "width": config["width"], "height": config["height"], "totalFrames": config["totalFrames"], "end_frame": config["totalFrames"], "endFrame": config["totalFrames"], "style": config["style"], "layout": {"id": config["layout"], "width": config["width"], "height": config["height"]}, "segments": config["segments"], "scenes": scenes, "sfx": {"events": "sfx_events.json", "native": "sfx_native.json", "mapping": SOUND_TYPES}, "presenter": config["presenter"], "missingMaterials": [] if config["presenter"] else ["video.presenter"]}
    (project / "macro_plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return plan


if __name__ == "__main__":
    try:
        if len(sys.argv) != 3:
            raise ValueError("用法：python build.py PROJECT CONFIG_JSON")
        result = build(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
        print(json.dumps({k: result[k] for k in ("schema", "fps", "width", "height", "totalFrames")}, ensure_ascii=False))
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        print(f"基础镜头构建失败：{exc}", file=sys.stderr)
        sys.exit(1)
