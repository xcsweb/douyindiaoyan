# -*- coding: utf-8 -*-
"""横屏口播全流程编排：prep → captions → params → check → plan → prepare → preview
→ clips → render → qc → publish。

用法:
    python pipeline.py --config <配置> [--stage NAME] [--from NAME] [--status] [--force] [--dry-run]
"""
import argparse
import datetime
import glob
import json
import os
import shutil
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "adapter"))
import probe  # noqa: E402

DEFAULT_FFMPEG = (r"C:\Users\EDY\AppData\Local\Microsoft\WinGet\Packages"
                  r"\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe"
                  r"\ffmpeg-9.0.2-full_build\bin\ffmpeg.exe")


def find_ffmpeg(cfg):
    """优先配置 tools.ffmpeg，其次环境变量，再次 PATH，最后本机默认路径。"""
    cand = (cfg.get("tools") or {}).get("ffmpeg")
    if cand and os.path.isfile(cand):
        return cand
    env = os.environ.get("FFMPEG")
    if env and os.path.isfile(env):
        return env
    found = shutil.which("ffmpeg")
    if found:
        return found
    return DEFAULT_FFMPEG


STAGE_ORDER = ["prep", "captions", "params", "check", "plan", "prepare",
               "preview", "clips", "render", "qc", "publish"]
STAGE_LABEL = {
    "prep": "准备",
    "captions": "字幕",
    "params": "参数",
    "check": "参数校验",
    "plan": "排片",
    "prepare": "装配",
    "preview": "抽帧预览",
    "clips": "录屏插片",
    "render": "渲染",
    "qc": "质检",
    "publish": "发布物料",
}
STATUS_LABEL = {
    "ok": "成功",
    "failed": "失败",
    "skipped": "跳过（产物已是最新）",
    "running": "运行中",
}
ERROR_MAP = [
    ("RECOMPOSE_REQUIRED", "场景时长之和没有覆盖整条口播"),
    ("AUDIO_CLOCK_MISMATCH", "排片时长比母版音轨短，必须覆盖完整音轨（改由母版真实时长自动取整）"),
    ("Segment needs nonempty text", "每一幕都要带 text（本应按该段时间轴字幕自动填充）"),
    ("needs-binding", "音乐未绑定，请设 music.mode=none"),
    ("PACKAGE_INVALID", "参数或模板包校验失败（常见：JSON 带 BOM、路径不合法）"),
    ("path rejected", "素材路径必须是相对 --inputs 的文件名"),
    ("Input missing", "素材不在 --inputs 根目录下"),
    ("media needs talk and captions paths",
     "模板运行时没读到 talk / captions 素材，请检查 --inputs 目录与 media 里的文件名"),
    ("Locale operation failed", "模板运行时语言包初始化失败（依赖缓存可能不完整）"),
    ("RUNTIME_FAILED", "模板运行时失败，详见日志"),
    ("dependency cache", "依赖缓存缺失或损坏"),
]


class StageError(Exception):
    """阶段内可直接读懂的中文错误。"""


def now_iso():
    return datetime.datetime.now().astimezone().isoformat(timespec="seconds")


def newest_mtime(path):
    """文件取自身 mtime；目录取内部最新文件 mtime。不存在返回 None。"""
    if os.path.isfile(path):
        return os.path.getmtime(path)
    if os.path.isdir(path):
        newest = os.path.getmtime(path)
        for base, _dirs, files in os.walk(path):
            for name in files:
                try:
                    newest = max(newest, os.path.getmtime(os.path.join(base, name)))
                except OSError:
                    pass
        return newest
    return None


def products_uptodate(products, inputs):
    if not products:
        return False
    times = [newest_mtime(p) for p in products]
    if any(t is None for t in times):
        return False
    newest_input = 0.0
    for path in inputs:
        t = newest_mtime(path)
        if t:
            newest_input = max(newest_input, t)
    return min(times) >= newest_input


def translate_error(text):
    low = (text or "").lower()
    for pattern, zh in ERROR_MAP:
        if pattern.lower() in low:
            return zh
    return None


def last_line(text):
    for line in reversed([x.strip() for x in (text or "").splitlines()]):
        if line:
            return line[:180]
    return ""


def format_cmd(cmd):
    return " ".join(('"%s"' % c if " " in str(c) else str(c)) for c in cmd)


def run_stream(cmd, cwd, log_path, append=False):
    """执行命令，stdout+stderr 实时转印并写入日志。返回 (退出码, 全部文本)。"""
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    mode = "a" if append else "w"
    banner = "=== %s ===\n$ %s\ncwd: %s\n" % (now_iso(), format_cmd(cmd), cwd)
    print("\n$ %s\ncwd: %s" % (format_cmd(cmd), cwd), flush=True)
    text_parts = []
    env = os.environ.copy()
    env.setdefault("PYTHONUTF8", "1")
    env.setdefault("PYTHONIOENCODING", "utf-8")
    with open(log_path, mode, encoding="utf-8", newline="\n") as log:
        log.write(banner)
        log.flush()
        try:
            proc = subprocess.Popen(
                cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding="utf-8", errors="replace", env=env,
            )
        except OSError as exc:
            msg = "[失败] 无法启动命令：%s（%s）\n" % (cmd[0], exc)
            print(msg, end="", flush=True)
            log.write(msg)
            return 127, msg
        assert proc.stdout is not None
        for line in proc.stdout:
            print(line, end="", flush=True)
            log.write(line)
            log.flush()
            text_parts.append(line)
        rc = proc.wait()
        footer = "\n[退出码] %d\n" % rc
        print(footer, end="", flush=True)
        log.write(footer)
    return rc, "".join(text_parts)


def load_state(path):
    if os.path.isfile(path):
        try:
            return probe.read_json(path)
        except Exception:
            pass
    return {"stages": {}}


def save_state(path, state, name, status, started, error="", log_file="", products=None):
    finished = now_iso()
    entry = {
        "status": status,
        "startedAt": started,
        "finishedAt": finished,
        "error": error,
        "logFile": log_file,
        "products": list(products or []),
    }
    state.setdefault("stages", {})[name] = entry
    state.update({
        "stage": name,
        "status": status,
        "startedAt": started,
        "finishedAt": finished,
        "error": error,
        "logFile": log_file,
        "products": list(products or []),
        "updatedAt": finished,
    })
    if status == "failed":
        state["lastFailure"] = {"stage": name, "error": error,
                                "at": finished, "logFile": log_file}
    probe.write_json(path, state)


class Ctx(object):
    def __init__(self, cfg, config_path):
        self.cfg = cfg
        self.config_path = config_path
        self.root = cfg.get("root") or os.path.dirname(os.path.dirname(os.path.dirname(config_path)))
        self.work = probe.work_dir(cfg, config_path)
        self.logs = os.path.join(self.work, "logs")
        self.state_path = os.path.join(self.work, "state.json")
        self.profile_file = probe.profile_path(cfg, config_path)
        tpl = cfg.get("template") or {}
        self.pkg = self.path(tpl.get("package") or "")
        self.tools = self.path(tpl.get("toolsDir") or "")
        self.instance = self.path(os.environ.get("MOTIONGIT_INSTANCE") or tpl.get("instance") or "")
        self.cache = self.path(os.environ.get("MOTIONGIT_CACHE") or tpl.get("cache") or "")
        self.adapter = os.path.join(self.work, "adapter")
        self.ffmpeg = find_ffmpeg(cfg)

    def path(self, rel):
        if not rel:
            return rel
        return rel if os.path.isabs(rel) else os.path.join(self.root, rel)

    def log_path(self, name):
        return os.path.join(self.logs, name + ".log")

    def inst_path(self, name):
        return os.path.join(self.instance, name)

    def work_script(self, name):
        return os.path.join(self.work, name)


def build_stages(ctx):
    cfg = ctx.cfg
    talk_dir = ctx.path(cfg["sources"]["talk"])
    screen_dir = ctx.path(cfg["sources"]["screen"])
    audio_dir = os.path.join(ctx.work, "audio")
    master = ctx.path(cfg["narration"]["master"])
    srt = ctx.path(cfg["narration"]["masterSrt"])
    captions_json = ctx.path(cfg["captions"]["json"])
    params = ctx.inst_path("params.json")
    inputs_dir = ctx.inst_path("inputs")
    plan = ctx.inst_path("plan")
    project = ctx.inst_path("project")
    video = ctx.path(os.path.join((cfg.get("output") or {}).get("dir") or "03-成片",
                                  (cfg.get("output") or {}).get("render") or "video.mp4"))
    times = ",".join(str(t) for t in (cfg.get("output") or {}).get("previewTimes", []))

    talk_mp4s = sorted(glob.glob(os.path.join(talk_dir, "*.mp4")))
    screen_mp4s = sorted(glob.glob(os.path.join(screen_dir, "*.mp4")))
    wavs = [os.path.join(audio_dir, os.path.splitext(os.path.basename(p))[0] + ".wav")
            for p in talk_mp4s]

    suffix = (["--cache", ctx.cache] if ctx.cache else []) + ["--language", "zh"]

    def node(sub, extra):
        return (["node", os.path.join("assistant", "motion.mjs"), "run", ctx.pkg,
                 "--instance", ctx.instance, sub] + extra + suffix)

    def require_files(paths, hint=""):
        missing = [p for p in paths if not os.path.exists(p)]
        if missing:
            raise StageError("缺少文件：%s%s" % ("、".join(missing), ("；" + hint) if hint else ""))

    def require_script(path):
        if not os.path.isfile(path):
            raise StageError("缺少脚本 %s（该阶段由同事实现，尚未提供）" % path)

    def after_exists(path, label):
        def check():
            if not os.path.exists(path):
                raise StageError("%s 已执行但产物缺失：%s" % (label, path))
        return check

    def after_captions():
        if not os.path.isfile(captions_json):
            raise StageError("字幕 JSON 未生成：%s" % captions_json)
        try:
            rows = probe.read_json(captions_json)
        except Exception as exc:
            raise StageError("字幕 JSON 解析失败（%s）：%s" % (captions_json, exc))
        if not isinstance(rows, list) or not rows:
            raise StageError("字幕 JSON 为空或不是数组：%s" % captions_json)
        print("[字幕] %d 条" % len(rows))

    def after_render():
        if not os.path.isfile(video) or os.path.getsize(video) == 0:
            raise StageError("渲染产物缺失或为空：%s" % video)
        print("[成片] %s（%.1f MB）" % (video, os.path.getsize(video) / 1048576.0))

    def prep_cmds():
        cmds = []
        for mp4, wav in zip(talk_mp4s, wavs):
            if os.path.isfile(wav) and os.path.getmtime(wav) >= os.path.getmtime(mp4):
                continue
            cmds.append((
                [ctx.ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", mp4,
                 "-vn", "-ac", "1", "-ar", "16000", wav],
                ctx.work,
            ))
        return cmds

    def prep_checks():
        require_files([ctx.config_path, master, srt, ctx.pkg,
                       os.path.join(ctx.tools, "assistant", "motion.mjs")])
        for d in (talk_dir, screen_dir):
            if not os.path.isdir(d):
                raise StageError("源素材目录不存在：%s" % d)
        if not talk_mp4s:
            raise StageError("口播素材目录里没有 mp4：%s" % talk_dir)
        if not ctx.instance or not os.path.isdir(ctx.instance):
            raise StageError("模板实例目录不存在：%s" % ctx.instance)
        os.makedirs(audio_dir, exist_ok=True)

    def captions_cmds():
        return [([sys.executable, ctx.work_script("gen_captions.py"), captions_json], ctx.work)]

    def params_cmds():
        return [([sys.executable, os.path.join(ctx.adapter, "native.py"),
                  "--config", ctx.config_path], ctx.work)]

    def clips_cmds():
        script = ctx.work_script("clips.py")
        require_script(script)
        return [([sys.executable, script, "--config", ctx.config_path], ctx.work)]

    def qc_cmds():
        script = ctx.work_script("qc.py")
        require_script(script)
        return [([sys.executable, script, "--config", ctx.config_path,
                  "--video", video], ctx.work)]

    def publish_cmds():
        script = ctx.work_script("publish.py")
        require_script(script)
        return [([sys.executable, script, "--config", ctx.config_path], ctx.work)]

    def node_checks(sub):
        def check():
            if not os.path.isfile(os.path.join(ctx.tools, "assistant", "motion.mjs")):
                raise StageError("工具入口不存在：%s" % os.path.join(ctx.tools, "assistant", "motion.mjs"))
            if not os.path.isfile(ctx.pkg):
                raise StageError("模板包不存在：%s" % ctx.pkg)
            if not os.path.isdir(ctx.instance):
                raise StageError("模板实例目录不存在：%s" % ctx.instance)
            require_files([params])
        return check

    stages = [
        {
            "name": "prep", "label": STAGE_LABEL["prep"],
            "inputs": lambda: [ctx.config_path] + talk_mp4s + screen_mp4s,
            "products": lambda: wavs,
            "prepare": prep_checks,
            "cmds": prep_cmds,
            "after": lambda: None,
        },
        {
            "name": "captions", "label": STAGE_LABEL["captions"],
            "inputs": lambda: [srt, ctx.path("_work\\master\\timeline.json"),
                               ctx.work_script("gen_captions.py")]
                              + sorted(glob.glob(os.path.join(ctx.work, "transcript", "video_*.json"))),
            "products": lambda: [captions_json],
            "prepare": lambda: require_files([srt, ctx.work_script("gen_captions.py")]),
            "cmds": captions_cmds,
            "after": after_captions,
        },
        {
            "name": "params", "label": STAGE_LABEL["params"],
            "inputs": lambda: [ctx.config_path, ctx.profile_file, master, captions_json],
            "products": lambda: [params, os.path.join(inputs_dir, "master.mp4"),
                                 os.path.join(inputs_dir, "captions.json")],
            "prepare": lambda: require_files([master, captions_json,
                                              os.path.join(ctx.adapter, "native.py")]),
            "cmds": params_cmds,
            "after": after_exists(params, "参数生成"),
        },
        {
            "name": "check", "label": STAGE_LABEL["check"],
            "inputs": lambda: [params, captions_json, master, ctx.profile_file],
            "products": lambda: [ctx.log_path("check")],
            "prepare": node_checks("check-params"),
            "cmds": lambda: [(node("check-params", [params, "--inputs", inputs_dir]), ctx.tools)],
            "after": lambda: None,
        },
        {
            "name": "plan", "label": STAGE_LABEL["plan"],
            "inputs": lambda: [params, captions_json, master],
            "products": lambda: [plan],
            "prepare": node_checks("plan"),
            "cmds": lambda: [(shutil.rmtree(plan, ignore_errors=True) or
                              node("plan", [params, "--inputs", inputs_dir,
                                            "--out", plan]), ctx.tools)],
            "after": after_exists(plan, "排片"),
        },
        {
            "name": "prepare", "label": STAGE_LABEL["prepare"],
            "inputs": lambda: [plan, params],
            "products": lambda: [project],
            "prepare": lambda: (node_checks("prepare")(), require_files([plan])),
            "cmds": lambda: [(shutil.rmtree(project, ignore_errors=True) or
                              node("prepare", ["@vault", "--inputs", "@vault",
                                               "--plan", plan, "--out", project]), ctx.tools)],
            "after": after_exists(project, "装配"),
        },
        {
            "name": "preview", "label": STAGE_LABEL["preview"],
            "inputs": lambda: [project],
            "products": lambda: [ctx.log_path("preview")],
            "prepare": lambda: (node_checks("preview")(), require_files([project]),
                                _require_times(times)),
            "cmds": lambda: [(node("preview", [project, "--times", times]), ctx.tools)],
            "after": lambda: None,
        },
        {
            "name": "clips", "label": STAGE_LABEL["clips"],
            "inputs": lambda: [ctx.config_path, master, captions_json] + screen_mp4s,
            "products": lambda: [ctx.log_path("clips")],
            "prepare": clips_cmds,
            "cmds": clips_cmds,
            "after": lambda: None,
        },
        {
            "name": "render", "label": STAGE_LABEL["render"],
            "inputs": lambda: [project, params],
            "products": lambda: [video],
            "prepare": lambda: (node_checks("render")(), require_files([project])),
            "cmds": lambda: [(node("render", [project, "--out", ctx.inst_path("video.mp4")]),
                              ctx.tools),
                             (["cp", "-f", ctx.inst_path("video.mp4"), video], ctx.work)],
            "after": after_render,
        },
        {
            "name": "qc", "label": STAGE_LABEL["qc"],
            "inputs": lambda: [video, ctx.config_path],
            "products": lambda: [ctx.log_path("qc")],
            "prepare": qc_cmds,
            "cmds": qc_cmds,
            "after": lambda: None,
        },
        {
            "name": "publish", "label": STAGE_LABEL["publish"],
            "inputs": lambda: [ctx.config_path, video],
            "products": lambda: [ctx.log_path("publish")],
            "prepare": publish_cmds,
            "cmds": publish_cmds,
            "after": lambda: None,
        },
    ]
    return stages


def _require_times(times):
    if not times:
        raise StageError("配置 output.previewTimes 为空，无法抽帧预览")


REVIEW_FILES = {"plan": ("plan", "review.json"), "preview": ("project", "preview.json")}


def accept_reviews(ctx, stage):
    """把模板的两个人工复核回执写成 reviewed=true（抽帧仍需人看，回执自动落盘）。"""
    pair = REVIEW_FILES.get(stage)
    if not pair:
        return
    path = os.path.join(ctx.inst_path(pair[0]), pair[1])
    if not os.path.isfile(path):
        return
    data = probe.read_json(path)
    if data.get("reviewed") is True:
        return
    data["reviewed"] = True
    data["reviewedBy"] = os.environ.get("MOTIONGIT_REVIEWER") or "pipeline"
    probe.write_json(path, data)
    print("[复核] %s：reviewed=true" % path)


def run_pipeline(ctx, names, force, dry_run, accept=False):
    specs = build_stages(ctx)
    state = load_state(ctx.state_path)
    for spec in specs:
        name = spec["name"]
        if name not in names:
            continue
        inputs = spec["inputs"]()
        products = spec["products"]()
        prev = (state.get("stages") or {}).get(name) or {}
        skip = (not force) and prev.get("status") != "failed" and products_uptodate(products, inputs)
        log_file = ctx.log_path(name)

        if skip:
            print("\n[跳过] %s（%s）：产物已存在且比输入新。" % (name, spec["label"]))
            if not dry_run:
                save_state(ctx.state_path, state, name, "skipped", now_iso(),
                           log_file=log_file, products=products)
            continue

        if dry_run:
            try:
                cmds = spec["cmds"]()
            except StageError as exc:
                print("\n[待补] %s（%s）：%s" % (name, spec["label"], exc))
                continue
            print("\n[计划] %s（%s）：需要执行 %d 条命令" % (name, spec["label"], len(cmds)))
            for cmd, cwd in cmds:
                print("  $ %s" % format_cmd(cmd))
                print("    cwd: %s" % cwd)
            continue

        started = now_iso()
        save_state(ctx.state_path, state, name, "running", started,
                   log_file=log_file, products=products)
        print("\n[开始] %s（%s）" % (name, spec["label"]))
        try:
            spec["prepare"]()
            append = False
            for cmd, cwd in spec["cmds"]():
                rc, text = run_stream(cmd, cwd, log_file, append=append)
                append = True
                if rc != 0:
                    zh = translate_error(text)
                    raise _CommandFailure(zh, text, rc)
            spec["after"]()
            if accept:
                accept_reviews(ctx, name)
        except _CommandFailure as exc:
            detail = translate_error(exc.text) or (
                "未识别的错误：%s" % last_line(exc.text) if last_line(exc.text) else "运行时失败，详见日志")
            print("\n[失败] %s：%s" % (name, detail))
            print("[日志] %s" % log_file)
            save_state(ctx.state_path, state, name, "failed", started, error=detail,
                       log_file=log_file, products=products)
            return 1
        except StageError as exc:
            print("\n[失败] %s：%s" % (name, exc))
            print("[日志] %s" % log_file)
            save_state(ctx.state_path, state, name, "failed", started, error=str(exc),
                       log_file=log_file, products=products)
            return 1
        except Exception as exc:  # 兜底，保证状态文件可诊断
            msg = "意外错误：%s: %s" % (type(exc).__name__, exc)
            print("\n[失败] %s：%s" % (name, msg))
            save_state(ctx.state_path, state, name, "failed", started, error=msg,
                       log_file=log_file, products=products)
            return 1

        print("[完成] %s（%s）" % (name, spec["label"]))
        save_state(ctx.state_path, state, name, "ok", started,
                   log_file=log_file, products=products)
    return 0


class _CommandFailure(Exception):
    def __init__(self, zh, text, rc):
        Exception.__init__(self, zh or "命令失败")
        self.zh = zh
        self.text = text
        self.rc = rc


def rel_for_display(ctx, path):
    try:
        if os.path.abspath(path).lower().startswith(os.path.abspath(ctx.root).lower()):
            return os.path.relpath(path, ctx.root).replace("/", "\\")
    except Exception:
        pass
    return path


def print_status(ctx):
    state = load_state(ctx.state_path)
    stages = state.get("stages") or {}
    print("[项目] %s" % (ctx.cfg.get("projectId") or os.path.basename(ctx.root)))
    print("[配置] %s" % ctx.config_path)
    print("[档案] %s" % ("已生成" if os.path.isfile(ctx.profile_file) else "未生成"))

    current = state.get("stage")
    if current:
        label = STAGE_LABEL.get(current, current)
        status = STATUS_LABEL.get(state.get("status"), state.get("status") or "未知")
        print("[当前阶段] %s（%s）：%s" % (current, label, status))
        print("[最近更新] %s" % (state.get("updatedAt") or "未知"))
    else:
        print("[当前阶段] 尚未运行")

    finished = []
    remaining = []
    for name in STAGE_ORDER:
        entry = stages.get(name) or {}
        if entry.get("status") in ("ok", "skipped"):
            finished.append((name, entry))
        else:
            remaining.append(name)

    print("\n[已完成产物]")
    if finished:
        for name, entry in finished:
            products = [p for p in (entry.get("products") or []) if os.path.exists(p)]
            label = STAGE_LABEL.get(name, name)
            if products:
                first = rel_for_display(ctx, products[0])
                more = "" if len(products) <= 1 else " 等 %d 项" % len(products)
                print("  - %s（%s）：%s%s" % (name, label, first, more))
            else:
                print("  - %s（%s）：记录成功，但产物当前不存在" % (name, label))
    else:
        print("  无")

    print("\n[剩余阶段]")
    if remaining:
        print("  " + " → ".join("%s（%s）" % (n, STAGE_LABEL.get(n, n)) for n in remaining))
    else:
        print("  无（全部阶段已完成）")

    failure = state.get("lastFailure")
    print("\n[最近一次失败]")
    if failure:
        print("  %s：%s（%s）" % (failure.get("stage"), failure.get("error"), failure.get("at")))
        if failure.get("logFile"):
            print("  日志：%s" % rel_for_display(ctx, failure["logFile"]))
    else:
        print("  无")


def main(argv=None):
    ap = argparse.ArgumentParser(description="横屏口播全流程")
    ap.add_argument("--config", required=True, help="配置文件路径")
    ap.add_argument("--stage", help="只跑指定阶段（忽略跳过规则）")
    ap.add_argument("--from", dest="from_stage", help="从指定阶段跑到末尾")
    ap.add_argument("--status", action="store_true", help="查看当前进度")
    ap.add_argument("--force", action="store_true", help="忽略跳过规则，强制重跑")
    ap.add_argument("--dry-run", action="store_true", help="只打印将执行的命令")
    ap.add_argument("--accept-reviews", action="store_true",
                    help="plan/preview 成功后自动写 reviewed=true（仍需人工看抽帧）")
    args = ap.parse_args(argv)

    config_path = os.path.abspath(args.config)
    try:
        cfg = probe.read_json(config_path)
    except Exception as exc:
        print("[失败] 读取配置失败：%s（%s）" % (config_path, exc))
        return 1

    ctx = Ctx(cfg, config_path)

    if args.status:
        print_status(ctx)
        return 0

    if args.stage and args.from_stage:
        print("[失败] --stage 与 --from 不能同时使用。")
        return 2
    if args.stage:
        if args.stage not in STAGE_ORDER:
            print("[失败] 未知阶段：%s（可选：%s）" % (args.stage, "、".join(STAGE_ORDER)))
            return 2
        names = [args.stage]
        force = True
    elif args.from_stage:
        if args.from_stage not in STAGE_ORDER:
            print("[失败] 未知阶段：%s（可选：%s）" % (args.from_stage, "、".join(STAGE_ORDER)))
            return 2
        names = STAGE_ORDER[STAGE_ORDER.index(args.from_stage):]
        force = args.force
    else:
        names = list(STAGE_ORDER)
        force = args.force

    print("[流程] %s" % " → ".join("%s（%s）" % (n, STAGE_LABEL[n]) for n in STAGE_ORDER))
    print("[本次] %s%s" % (" → ".join(names), "（强制重跑）" if force else ""))
    return run_pipeline(ctx, names, force, args.dry_run, args.accept_reviews)


if __name__ == "__main__":
    sys.exit(main())
