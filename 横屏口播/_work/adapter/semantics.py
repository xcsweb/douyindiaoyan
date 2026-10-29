# -*- coding: utf-8 -*-
"""把 141.43 秒口播切成 01-D（editorial-performance）能接受的语义段落。

模板 plan 不是"套版"而是"语义排片"：每段必须声明 intent/phases/counts、
给出文案槽位、把原片的动作窗口按 1x 速度保住，并让每段独占对应的原字幕。
这里集中维护这些人工判断，native.py 只负责拼装 params.json。
"""
import hashlib
import json
import math
import os
import glob

FPS = 60
STYLE = "01-D"
TOLERANCE = 1 / FPS + 0.002


def q(group):
    return STYLE + ":" + group


# 每段帧数固定，总和必须等于整条音轨（8486 帧）。
# 切点都落在字幕之间的静音里，这样每段可以独占完整的原字幕。
SEGMENTS = [
    dict(id="s01", frames=672, group="basic-points", title="600 人的全家福",
         intent="basic-points", phases=["entry", "reading"], counts={"items": 3},
         slots={"heading": "600 人的全家福",
                "body-0": "不是截图，打开网页就能看",
                "body-1": "1024 倒计时，每秒跳一次",
                "body-2": "600 个成员都在里面"}),
    dict(id="s02", frames=624, group="basic-points", title="夜空与地球",
         intent="basic-points", phases=["entry", "reading"], counts={"items": 3},
         slots={"heading": "连成夜空",
                "body-0": "所有成员连成夜空",
                "body-1": "还能变成地球",
                "body-2": "真正难的是拼字和拼脸"}),
    dict(id="s03", frames=970, group="claim-and-response", title="想法来源",
         intent="claim-method-proof-response",
         phases=["claim", "method", "distribution", "proof", "response"], counts={"steps": 3},
         slots={"text-claim-line1": "拼字", "text-claim-line2": "拼脸",
                "text-claim-context": "600 个头像拼成一张脸",
                "text-method-heading": "土办法",
                "text-method-name": "把头像当像素点",
                "text-steps-0": "按网格对齐头像", "text-steps-1": "逐个像素替换", "text-steps-2": "先拼字再拼脸",
                "text-audience": "600 位社区成员",
                "text-proof-line1": "抖音上", "text-proof-line2": "见过",
                "text-proof-note": "看着简单，做起来很难",
                "text-response-context": "验证和前端都得跟上",
                "text-response-line1": "能做", "text-response-line2": "很难",
                "text-response-conclusion": "所以先做最小版",
                "text-presenterLabel": "创作者 · TRAE 社区",
                "text-brandLabel": "TRAE 社区 ／",
                "text-chapterCount": "11", "text-label": "想法来源", "text-chapter": "03"}),
    dict(id="s04", frames=667, group="basic-points", title="难点清单",
         intent="basic-points", phases=["entry", "reading"], counts={"items": 3},
         slots={"heading": "三个难点",
                "body-0": "拼成一张脸或一个字",
                "body-1": "验证怎么做才可信",
                "body-2": "前端能不能做出来"}),
    dict(id="s05", frames=1195, group="decompose-and-consolidate", title="踩过的坑",
         intent="concept-decomposition", phases=["concept", "parts", "consolidation", "result"],
         counts={"parts": 3},
         slots={"text-entry": "踩过的坑", "text-concept": "三坑",
                "text-context": "600 个头像，渲染和性能都是硬骨头",
                "text-decomposeHeading": "拆开看",
                "text-parts-0-label": "渲染", "text-parts-1-label": "性能", "text-parts-2-label": "数据",
                "text-parts-0-sample": "600",
                "text-consolidateHeading": "一个个解决",
                "text-result-file": "优化清单",
                "text-result-contents": "降分辨率、预加载、分块渲染",
                "text-result-conclusion": "和 AI 一点点沟通，最后跑通了",
                "text-presenterLabel": "创作者 · TRAE 社区",
                "text-brandLabel": "TRAE 社区 ／",
                "text-chapterCount": "11", "text-label": "踩过的坑", "text-chapter": "05"}),
    dict(id="s06", frames=792, group="basic-points", title="和 AI 一起",
         intent="basic-points", phases=["entry", "reading"], counts={"items": 3},
         slots={"heading": "和 AI 一起",
                "body-0": "和 AI 一点点沟通",
                "body-1": "问题一个个解决",
                "body-2": "最后做成了星流"}),
    dict(id="s07", frames=1222, group="claim-to-evolving-timeline", title="星流",
         intent="claim-to-evolving-timeline",
         phases=["claim", "permanence", "cross", "timeline", "growth", "ceiling", "continue"],
         counts={"stages": 3},
         slots={"text-claim": "星流", "text-permanence": "重新做",
                "text-disclaimer": "把之前的拼图想法，换一种做法",
                "text-progression-heading": "一路演进",
                "text-change-heading": "换了做法",
                "text-conclusion": "成了星流",
                "text-stages-0": "拼图", "text-stages-1": "拼人", "text-stages-2": "星流",
                "text-ceiling": "还能更好",
                "text-presenterLabel": "创作者 · TRAE 社区",
                "text-brandLabel": "TRAE 社区 ／",
                "text-chapterTitle": "星流", "chapter": "07", "chapterCount": "11"}),
    dict(id="s08", frames=494, group="basic-points", title="星流怎么用",
         intent="basic-points", phases=["entry", "reading"], counts={"items": 3},
         slots={"heading": "星流怎么用",
                "body-0": "输入文字或图片",
                "body-1": "转成一幅星流图",
                "body-2": "文字想改就改"}),
    dict(id="s09", frames=774, group="basic-points", title="都在 TRAE 社区",
         intent="basic-points", phases=["entry", "reading"], counts={"items": 3},
         slots={"heading": "都在 TRAE 社区",
                "body-0": "实现的完整过程",
                "body-1": "整个调试的过程",
                "body-2": "怎么部署的也有"}),
    dict(id="s10", frames=668, group="basic-summary", title="看看别人的",
         intent="basic-summary", phases=["entry", "reading"], counts={"items": 1},
         slots={"heading": "看看别人的",
                "body-0": "社区里还有很多小伙伴做的东西，可以看一下，也能借鉴思路。"}),
    dict(id="s11", frames=408, group="basic-summary", title="一起学习",
         intent="basic-summary", phases=["entry", "reading"], counts={"items": 1},
         slots={"heading": "一起学习",
                "body-0": "大家都共同学习，互相学习、互相鼓励。"}),
]


def find_manifest(root):
    """定位 01-D 的 manifest：运行时 overlay > 本地副本。"""
    cands = []
    env = os.environ.get("MOTIONGIT_RUNTIME")
    if env:
        cands.append(os.path.join(env, "packs", STYLE, "manifest.json"))
    cands += sorted(glob.glob("/tmp/motiongit-runtime-overlay-*/runtime/packs/%s/manifest.json" % STYLE),
                    reverse=True)
    for base in (root, os.path.dirname(root), os.path.dirname(os.path.dirname(root)),
                 "/workspace/_runtime_copy", "/workspace/横屏口播/_work/instance"):
        cands.append(os.path.join(base, "runtime", "packs", STYLE, "manifest.json"))
    cands += sorted(glob.glob("/workspace/横屏口播/_work/instance/**/packs/%s/manifest.json" % STYLE),
                    reverse=True)
    cands.append(os.path.join(os.path.dirname(os.path.dirname(root)),
                              "_runtime_copy", "runtime", "packs", STYLE, "manifest.json"))
    for path in cands:
        if os.path.isfile(path):
            return path
    return None


def frame_of(seconds):
    return int(math.floor(float(seconds) * FPS + 0.5))


def _windows(scene):
    """与 adapt_project.motion_windows 一致：只保留场景内窗口，相邻窗口合并。"""
    src = scene["source"]
    s0, s1 = float(src["start"]), float(src["end"])
    spans = sorted((float(w["start"]), float(w["end"])) for w in scene.get("motionWindows") or []
                   if s0 - 1e-9 <= float(w["start"]) < float(w["end"]) <= s1 + 1e-9)
    merged = []
    for a, b in spans:
        if merged and a <= merged[-1][1] + 1e-8:
            merged[-1] = (merged[-1][0], max(merged[-1][1], b))
        else:
            merged.append((a, b))
    return merged


def _interp(x, points):
    """与 adapt_project.interpolate 一致的线性插值。"""
    import bisect
    sources = [p[0] for p in points]
    idx = bisect.bisect_right(sources, x)
    if idx <= 0:
        return points[0][1]
    if idx >= len(points):
        return points[-1][1]
    a, b = points[idx - 1], points[idx]
    if b[0] - a[0] <= 1e-12:
        return a[1]
    return a[1] + (x - a[0]) * (b[1] - a[1]) / (b[0] - a[0])


def _unique(points):
    """与 adapt_project.unique_knots 一致：同一源时刻必须同帧，其余严格递增。"""
    out = []
    for at, frame in sorted(points):
        if out and abs(at - out[-1][0]) < 1e-8:
            if int(frame) != out[-1][1]:
                return out, False
            continue
        if out and frame <= out[-1][1]:
            return out, False
        out.append((at, int(frame)))
    return out, True


def _simulate(scene, frames, bindings):
    """复刻 adapt_project.timed_scene 的动作窗口摆放，返回 (可行, 原因, cue 输出帧)。"""
    src = scene["source"]
    s0, s1 = float(src["start"]), float(src["end"])
    cues = scene.get("cues", [])
    explicit = [(s0, 0), (s1, frames)]
    explicit += [(float(c["at"]), int(bindings[c["id"]])) for c in cues if c["id"] in bindings]
    explicit.sort()
    fixed = []
    for at, out in explicit:
        if fixed and abs(at - fixed[-1][0]) < 1e-8:
            if int(out) != fixed[-1][1]:
                return False, "同一时刻出现两个目标帧", {}
            continue
        fixed.append((at, int(out)))
    for (at, out), (next_at, next_out) in zip(fixed, fixed[1:]):
        if not (next_at > at and next_out > out):
            return False, "锚点顺序与模板编排冲突", {}
    knots = list(fixed)
    out_frames, placed = {}, []
    for a, b in _windows(scene):
        inside = [c for c in cues if a - 1e-8 <= float(c["at"]) <= b + 1e-8]
        known = [(float(c["at"]), int(bindings[c["id"]])) for c in inside if c["id"] in bindings]
        if abs(a - s0) < 1e-8:
            known.append((s0, 0))
        if abs(b - s1) < 1e-8:
            known.append((s1, frames))
        if known:
            anchor_at, anchor_out = known[0]
        else:
            anchor_at = a
            anchor_out = int(math.floor(_interp(a, fixed) + 0.5))
        shift = anchor_out - frame_of(anchor_at)

        def pinned(at):
            predicted = frame_of(at) + shift
            for fixed_at, fixed_frame in known:
                if abs(at - fixed_at) < 1e-8:
                    if abs(predicted - fixed_frame) > 1:
                        return None
                    return fixed_frame
            return predicted

        ws, we = pinned(a), pinned(b)
        if ws is None or we is None:
            return False, "动作窗口内的锚点与 1x 原速错开", {}
        if not 0 <= ws < we <= frames:
            return False, "动作窗口超出段长", {}
        if abs((we - ws) - frame_of(b - a)) > 1:
            return False, "动作窗口时长被改变", {}
        knots += [(a, ws), (b, we)]
        for cue in inside:
            value = pinned(float(cue["at"]))
            if value is None:
                return False, "动作窗口内的锚点与 1x 原速错开", {}
            out_frames[cue["id"]] = value
            knots.append((float(cue["at"]), value))
        placed.append((a, b, ws, we))
    knots, ok = _unique(knots)
    if not ok:
        return False, "动作窗口互相重叠", {}
    for cue in cues:
        if cue["id"] not in out_frames:
            out_frames[cue["id"]] = int(math.floor(_interp(float(cue["at"]), knots) + 0.5))
    previous_at, previous_out = None, None
    for cue in sorted(cues, key=lambda c: float(c["at"])):
        at, out = float(cue["at"]), out_frames[cue["id"]]
        if previous_at is not None and not (at > previous_at and out > previous_out):
            return False, "段内节拍排不下", {}
        previous_at, previous_out = at, out
    if not out_frames or min(out_frames.values()) < 0 or max(out_frames.values()) >= frames:
        return False, "锚点落在段边界上", {}
    return True, "", out_frames


def _anchors(scene, frames, roles):
    """先让模板自己摆放动作窗口，再把窗口落点写回成锚点，直到两者完全一致。"""
    values = {}
    for _ in range(5):
        ok, why, predicted = _simulate(scene, frames, values)
        if not ok:
            raise ValueError("%s：动作窗口在 %d 帧里放不下（%s），换一段或调整时长"
                             % (scene["id"], frames, why))
        if predicted == values:
            break
        values = predicted
    else:
        raise ValueError("%s：锚点无法与动作窗口收敛，换一段或调整时长" % scene["id"])
    result = {}
    for cue in scene.get("cues", []):
        role = roles.get(cue["id"])
        if role:
            result[role] = {"frame": values[cue["id"]]}
    return result


def _check_slots(seg, scene):
    limits = {s["id"]: s.get("maxChars") for s in scene.get("slots", []) if s.get("type") == "text"}
    unknown = set(seg["slots"]) - set(limits)
    if unknown:
        raise ValueError("%s 有模板不认识的槽位：%s" % (seg["id"], sorted(unknown)))
    for key, value in seg["slots"].items():
        limit = limits.get(key)
        if limit is not None and len(value) > limit:
            raise ValueError("%s.%s 文案 %d 字，模板上限 %d：%r"
                             % (seg["id"], key, len(value), limit, value))


def narration_evidence(cues, frames_by_segment):
    """把原字幕合成一份 contentEvidence，并给每段分配独占的 ownershipRefs。"""
    text = "".join(c["zh"] for c in cues)
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    units, cursor = [], 0
    for cue in cues:
        a, b = cursor, cursor + len(cue["zh"])
        units.append({"id": "%s:%d:%d" % (digest[:16], a, b), "start": a, "end": b,
                      "text": text[a:b]})
        cursor = b
    evidence = {"schema": "adu-content-evidence/1", "text": text, "textSha256": digest,
                "units": units}
    refs, cursor = [], 0
    for index, frames in enumerate(frames_by_segment):
        start, end = cursor / FPS, (cursor + frames) / FPS
        owned = []
        for cue, unit in zip(cues, units):
            if float(cue["t0"]) >= start - TOLERANCE and float(cue["t1"]) <= end + TOLERANCE:
                owned.append(unit["id"])
        refs.append(owned)
        cursor += frames
    evidence["scopeRefs"] = [u["id"] for u in units]
    return evidence, refs


def build_segments(root, expected_frames, cues):
    """生成 params.json 的 segments（含 anchors/candidates/slots/ownershipRefs）。"""
    manifest_path = find_manifest(root)
    if not manifest_path:
        raise ValueError("找不到 %s 的 manifest.json（先跑一次 setup）" % STYLE)
    manifest = json.load(open(manifest_path, encoding="utf-8"))
    scenes = {s["id"]: s for s in manifest["scenes"]}
    roles = {c["sceneId"]: c.get("cueRoles", {})
             for c in manifest.get("adaptationProfile", {}).get("scenes", [])}
    total = sum(s["frames"] for s in SEGMENTS)
    if total != expected_frames:
        raise ValueError("各段帧数之和 %d，应为 %d" % (total, expected_frames))
    evidence, ownership = narration_evidence(cues, [s["frames"] for s in SEGMENTS])
    result = []
    for seg, refs in zip(SEGMENTS, ownership):
        scene = scenes.get(seg["group"])
        if scene is None:
            raise ValueError("%s：模板没有场景 %s" % (seg["id"], seg["group"]))
        frames = seg["frames"]
        if frames < scene.get("minFrames", 1):
            raise ValueError("%s 只有 %d 帧，%s 至少 %d 帧"
                             % (seg["id"], frames, seg["group"], scene["minFrames"]))
        src_len = float(scene["source"]["end"]) - float(scene["source"]["start"])
        cap = frame_of(src_len) + (scene.get("maxHoldFrames") or 0)
        if frames > cap:
            raise ValueError("%s 有 %d 帧，%s 最多 %d 帧（含停留上限）"
                             % (seg["id"], frames, seg["group"], cap))
        if not refs:
            raise ValueError("%s 没有分到任何原字幕，切点要落在字幕之间的静音里" % seg["id"])
        _check_slots(seg, scene)
        anchors = _anchors(scene, frames, roles.get(seg["group"], {}))
        result.append({
            "id": seg["id"],
            "durationFrames": frames,
            "title": seg["title"],
            "text": "".join(u["text"] for u in evidence["units"] if u["id"] in refs),
            "intent": seg["intent"],
            "phases": list(seg["phases"]),
            "counts": dict(seg["counts"]),
            "anchors": anchors,
            "ownershipRefs": refs,
            "candidates": {q(seg["group"]): {"slots": dict(seg["slots"])}},
            "candidateInterpretations": {},
            "preferredScenes": [q(seg["group"])],
        })
    return result, total, evidence
