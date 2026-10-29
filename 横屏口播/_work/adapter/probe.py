# -*- coding: utf-8 -*-
"""探测 MotionGit 模板包，生成 _work/template-profile.json。

用法: python probe.py --config <配置路径>
"""
import argparse
import datetime
import hashlib
import json
import os
import subprocess
import sys

START_TIMEOUT = 600
RAW_LIMIT = 4000
FRAME_RATE = 60
REQUIRED_PARAMS = ["media.talk", "media.captions", "brief.segments", "music"]
SLOTS = ["talk", "captions", "scenes", "header"]


def read_json(path):
    with open(path, "r", encoding="utf-8-sig") as f:
        return json.load(f)


def write_json(path, obj):
    parent = os.path.dirname(os.path.abspath(path))
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(obj, ensure_ascii=False, indent=2) + "\n")


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def now_iso():
    return datetime.datetime.now().astimezone().isoformat(timespec="seconds")


def work_dir(cfg, config_path=None):
    root = cfg.get("root")
    if root:
        return os.path.join(root, "_work")
    return os.path.dirname(os.path.dirname(os.path.abspath(config_path)))


def profile_path(cfg, config_path=None):
    return os.path.join(work_dir(cfg, config_path), "template-profile.json")


def read_template_meta(package_path):
    """从同名解压副本的 motion.json 读 templateVersion / templateId。读不到返回 (None, None)。"""
    if package_path.lower().endswith(".zip"):
        project_dir = package_path[:-4]
    else:
        project_dir = package_path
    motion_json = os.path.join(project_dir, "motion.json")
    try:
        meta = read_json(motion_json)
        stage = (meta.get("extensions") or {}).get("motiongit.com:delivery-stage") or {}
        return stage.get("templateVersion"), stage.get("templateId")
    except Exception:
        return None, None


def parse_summary(raw_stdout, raw_all):
    for candidate in (raw_stdout, raw_all):
        if not candidate:
            continue
        try:
            return json.loads(candidate.strip())
        except Exception:
            continue
    return None


def detect_routes(summary, workflow):
    routes = [workflow or "native"]
    if isinstance(summary, dict):
        ext = (summary.get("productionEntry") or {}).get("extension") or {}
        name = ext.get("workflow")
        if name and name not in routes:
            routes.append(name)
    return routes


def run_probe(cfg, config_path, out_path=None, echo=True):
    """执行 start --summary 并写档案。返回 (profile 或 None, 退出码)。"""
    def log(msg):
        if echo:
            print(msg, flush=True)

    tpl = cfg.get("template") or {}
    pkg = tpl.get("package")
    tools = tpl.get("toolsDir")
    workflow = tpl.get("workflow") or "native"

    if not pkg or not os.path.isfile(pkg):
        log("[失败] 模板包不存在：%s" % pkg)
        return None, 1
    if not tools or not os.path.isdir(tools):
        log("[失败] 工具目录不存在：%s" % tools)
        return None, 1
    entry = os.path.join(tools, "assistant", "motion.mjs")
    if not os.path.isfile(entry):
        log("[失败] 工具入口不存在：%s" % entry)
        return None, 1

    cmd = ["node", os.path.join("assistant", "motion.mjs"), "start", pkg, "--summary"]
    log("[探测] 正在执行 start --summary（最长 %d 秒）..." % START_TIMEOUT)
    try:
        proc = subprocess.run(
            cmd, cwd=tools, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=START_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        log("[失败] start --summary 超时（%d 秒），请检查依赖缓存或网络。" % START_TIMEOUT)
        return None, 1
    except OSError as exc:
        log("[失败] 无法执行 node：%s" % exc)
        return None, 1

    raw = (proc.stdout or "") + (("\n" + proc.stderr) if proc.stderr else "")
    raw_start = raw[:RAW_LIMIT]
    summary = parse_summary(proc.stdout, raw)
    verified = bool(isinstance(summary, dict) and summary.get("verified"))

    template_version, template_id = read_template_meta(pkg)
    entry_sha = sha256_of(entry)
    routes = detect_routes(summary, workflow)

    profile = {
        "packagePath": pkg,
        "workflow": workflow,
        "toolsDir": tools,
        "entrySha256": entry_sha,
        "templateVersion": template_version,
        "templateId": template_id,
        "frameRate": FRAME_RATE,
        "routes": routes,
        "requiredParams": list(REQUIRED_PARAMS),
        "slots": list(SLOTS),
        "verified": verified,
        "rawStart": raw_start,
        "generatedAt": now_iso(),
    }
    if out_path is None:
        out_path = profile_path(cfg, config_path)
    write_json(out_path, profile)

    log("[路线] %s" % " / ".join(routes))
    log("[版本] %s（templateId %s）" % (
        template_version or "未知", template_id if template_id is not None else "未知"))
    log("[sha256] %s" % entry_sha[:12])
    log("[verified] %s" % ("是" if verified else "否"))
    log("[档案] %s" % out_path)

    if proc.returncode != 0 or not verified:
        if summary is None:
            log("[失败] start 输出不是可解析的 JSON，详见上面的原始输出。")
        else:
            log("[失败] 模板包校验未通过（verified=false），请先用 setup 完成环境安装。")
        return profile, 1
    return profile, 0


def main(argv=None):
    ap = argparse.ArgumentParser(description="探测 MotionGit 模板包")
    ap.add_argument("--config", required=True, help="配置文件路径")
    args = ap.parse_args(argv)

    config_path = os.path.abspath(args.config)
    try:
        cfg = read_json(config_path)
    except Exception as exc:
        print("[失败] 读取配置失败：%s（%s）" % (config_path, exc))
        return 1

    _, rc = run_probe(cfg, config_path)
    return rc


if __name__ == "__main__":
    sys.exit(main())
