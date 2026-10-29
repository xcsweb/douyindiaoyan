#!/usr/bin/env python3
"""Source-bound motion-kit extension of the normal personal .motion workflow.

The host keeps credentials. This child receives only reviewed relative media and
parameters; frozen code is loaded for one operation and never copied into caches.
"""
from __future__ import annotations
import argparse
from copy import deepcopy
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
from portable import npm_command
from narration_composition import resolve as resolve_narration, review as review_narration_composition
from narration_choices import describe as narration_choices
# MOTIONGIT_MOTIONKIT_WINDOWS_REPAIR_V1
ROOT = Path(__file__).resolve().parents[1]


def read(p):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError("Duplicate JSON key")
            result[key] = value
        return result
    return json.loads(Path(p).read_text(encoding="utf-8"), object_pairs_hook=pairs,
                      parse_constant=lambda x: (_ for _ in ()).throw(ValueError("Nonfinite JSON")))


def write(p, value):
    Path(p).write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def sha(p):
    with Path(p).open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                    separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def environment():
    allowed = {"PATH", "HOME", "TMPDIR", "TMP", "TEMP", "LANG", "LANGUAGE", "TZ", "SYSTEMROOT",
               "WINDIR", "PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA", "APPDATA", "USERPROFILE", "PATHEXT", "CHROME_PATH"}
    return {**{k: v for k, v in os.environ.items() if k.upper() in allowed},
            "PYTHONDONTWRITEBYTECODE": "1", "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}


def run(args, *, env=None, stdin=None):
    result = subprocess.run([str(x) for x in args], input=stdin, text=True, capture_output=True, encoding="utf-8", errors="replace",
                            env=env or environment(), check=False, shell=False)
    if result.returncode:
        raise ValueError((result.stderr or result.stdout)[-6000:].strip() or "Operation failed")
    return result.stdout


def safe_relative(name):
    if not isinstance(name, str) or not name or "\\" in name or ":" in name or name.startswith("/"):
        raise ValueError("Media paths must be relative to declared inputs")
    if any(part in {"", ".", ".."} for part in name.split("/")) or any(ord(x) < 32 for x in name):
        raise ValueError("Unsafe relative path")
    return name


def safe_path(base, value, *, existing=False):
    base, p = Path(base).absolute(), Path(value).absolute()
    if ".." in p.parts or ".." in base.parts or p == base or not p.is_relative_to(base):
        raise ValueError("Operation path must stay inside instance")
    current = p
    while current != base:
        if current.is_symlink():
            raise ValueError("Symlink paths are not accepted")
        current = current.parent
    if base.is_symlink() or (existing and not p.exists()):
        raise ValueError("Missing path or linked root")
    return p


def verify_bundle():
    receipt = read(ROOT / "kit-integration.json")
    lib = receipt["library"]
    kit = ROOT / lib["root"]
    actual = {p.relative_to(kit).as_posix(): sha(p) for p in kit.rglob("*") if p.is_file()}
    if any(p.is_symlink() for p in kit.rglob("*")) or actual != lib["sourceFiles"] or digest(actual) != lib["sourceDigest"]:
        raise ValueError("Frozen component library changed; obtain a new verified .motion release")
    spec = read(ROOT / lib["controlsSpec"])
    if sha(ROOT / lib["controlsSpec"]) != lib["specDigest"] or spec["version"] != lib["version"]:
        raise ValueError("Component contract/version changed")
    return receipt, kit, spec


def source_binding(receipt):
    return {"integritySha256": sha(ROOT / "integrity.json"), "sourceLockSha256": sha(ROOT / "motion.lock.json"),
            "librarySha256": receipt["library"]["sourceDigest"], "libraryVersion": receipt["library"]["version"]}


def dependencies(receipt, cache_arg):
    source = {key: sha(ROOT / file) for key, file in receipt["dependencies"].items()}
    expected = {"schema": "motiongit-kit-dependencies/1", "files": source}
    cache = Path(str(Path(cache_arg).absolute()) + "-kit") if cache_arg else Path(tempfile.gettempdir()) / ("motiongit-kit-dependencies-" + digest(source)[:20])
    if cache.is_symlink() or cache.resolve().is_relative_to(ROOT):
        raise ValueError("Dependency cache must be outside template")
    return cache, expected


def setup(receipt, cache, expected):
    if cache.exists():
        if cache.is_symlink() or (cache / "kit-dependencies.json").is_symlink():
            raise ValueError("Linked dependency cache rejected")
        actual=read(cache / "kit-dependencies.json")
        legacy=json.loads(json.dumps(expected));legacy["files"]["requirements"]='2719521e1f58d81f0e06ebf50da9b663990c221047b4129c02e0fc1a0d0d1544'
        if actual not in (expected,legacy) or sha(cache / "package.json")!=expected["files"]["packageManifest"] or sha(cache / "package-lock.json")!=expected["files"]["packageLock"]:
            raise ValueError("Dependency cache differs; choose a new cache")
        if any((cache / n).is_symlink() or not (cache / n).is_dir() for n in (".venv","node_modules")):
            raise ValueError("Linked or missing dependency tree rejected")
        python=cache / ".venv" / ("Scripts/python.exe" if os.name=="nt" else "bin/python")
        from face_runtime_dependencies import repair_face_runtime
        repair_face_runtime(python,env=environment(),requirements=ROOT / receipt["dependencies"]["requirements"])
        write(cache / "kit-dependencies.json",expected)
        render_env(cache,expected)
        return
    cache.mkdir(parents=True)
    try:
        dep = receipt["dependencies"]
        for key, name in (("packageManifest", "package.json"), ("packageLock", "package-lock.json")):
            shutil.copyfile(ROOT / dep[key], cache / name)
        run([*npm_command(), "ci", "--prefix", cache, "--ignore-scripts", "--no-audit", "--no-fund"])
        from face_runtime_dependencies import create_face_venv
        create_face_venv(cache / ".venv",env=environment())
        python = cache / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        run([python, "-m", "pip", "install", "--only-binary=:all:", "-r", ROOT / dep["requirements"]])
        from face_runtime_dependencies import repair_face_runtime
        repair_face_runtime(python,env=environment(),requirements=ROOT / receipt["dependencies"]["requirements"])
        write(cache / "kit-dependencies.json", expected)
    except Exception:
        shutil.rmtree(cache)
        raise


def render_env(cache, expected):
    if not cache.is_dir() or read(cache / "kit-dependencies.json") != expected:
        raise ValueError("Run setup --workflow motion-kit once in a fresh dependency cache")
    if (sha(cache / "package.json") != expected["files"]["packageManifest"] or
            sha(cache / "package-lock.json") != expected["files"]["packageLock"]):
        raise ValueError("Dependency lock changed")
    python = cache / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    module = cache / "node_modules/playwright-core"
    if not python.is_file() or not module.is_dir() or module.is_symlink():
        raise ValueError("Dependency tree missing")
    from face_runtime_dependencies import check_face_runtime
    check_face_runtime(python,env=environment())
    return {**environment(), "PYTHON": str(python), "PLAYWRIGHT_CORE": str(module)}


def validate_params(params):
    timeline = params.get("timeline", {})
    for role in ("voiceover", "music"):
        if role not in timeline or not isinstance(timeline[role], str):
            raise ValueError("needs-binding: timeline." + role + " requires a user path or explicit empty string")
    module = ROOT / "motion-kit/tools/inputs-validator.mjs"
    js = "import {validateInputs} from " + json.dumps(module.as_uri()) + ";import fs from 'node:fs';const p=JSON.parse(fs.readFileSync(0,'utf8'));const s=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const e=validateInputs(p,s);if(e.length)throw Error(e.join('\\n'));"
    run(["node", "--input-type=module", "-e", js, ROOT / "kit.params.schema.json"], stdin=json.dumps(params, ensure_ascii=False))


def media_names(timeline, spec):
    names = set()
    for key in ("voiceover", "music", "subtitles"):
        if timeline.get(key):
            names.add(safe_relative(timeline[key]))
    if timeline.get("presenter", {}).get("src"):
        names.add(safe_relative(timeline["presenter"]["src"]))
    def walk(obj, fields):
        for k, s in fields.items():
            value = obj.get(k)
            if value is None or value == "":
                continue
            if s["type"] == "media":
                names.add(safe_relative(value))
            elif s["type"] == "object":
                walk(value, s["props"])
            elif s["type"] == "array" and s["of"] == "object":
                for item in value:
                    walk(item, s["props"])
    for segment in timeline["segments"] + timeline.get("overlays", []):
        walk(segment["props"], spec["controls"][segment["control"]]["props"])
    if set(timeline.get("mediaPolicies", {})) - names:
        raise ValueError("Media policy refers to an unused material")
    return sorted(names)


def bindings(params, inputs, spec):
    validate_params(params)
    if inputs.is_symlink() or inputs.resolve() != inputs or not inputs.is_dir():
        raise ValueError("Declare an existing regular input directory")
    files = {}
    for name in media_names(params["timeline"], spec):
        file = safe_path(inputs, inputs / name, existing=True)
        if not file.is_file() or file.stat().st_size > 150 * 1024 * 1024:
            raise ValueError("Media must be one regular file within 150 MiB")
        files[name] = {"sha256": sha(file), "bytes": file.stat().st_size}
    return files


def hydrated(params, inputs):
    tl = deepcopy(params["timeline"])
    # motiongit-content-header: preserve the public per-production binding.
    if params.get("header") is not None: tl["header"] = deepcopy(params["header"])
    paths = media_names(tl, read(ROOT / read(ROOT / "kit-integration.json")["library"]["controlsSpec"]))
    mapping = {name: str(inputs / name) for name in paths}
    # Only media fields are rewritten: identical words in captions/labels remain text.
    for key in ("voiceover", "music", "subtitles"):
        if tl.get(key):
            tl[key] = mapping[tl[key]]
    if tl.get("presenter", {}).get("src"):
        tl["presenter"]["src"] = mapping[tl["presenter"]["src"]]
    spec = read(ROOT / read(ROOT / "kit-integration.json")["library"]["controlsSpec"])
    def walk(obj, fields):
        for k, field in fields.items():
            value = obj.get(k)
            if value is None or value == "":
                continue
            if field["type"] == "media":
                obj[k] = mapping[value]
            elif field["type"] == "object":
                walk(value, field["props"])
            elif field["type"] == "array" and field["of"] == "object":
                for item in value:
                    walk(item, field["props"])
    for segment in tl["segments"] + tl.get("overlays", []):
        walk(segment["props"], spec["controls"][segment["control"]]["props"])
    tl["mediaPolicies"] = {mapping[name]: value for name, value in tl.get("mediaPolicies", {}).items()}
    return tl


def engine(kit, params, inputs, flags, env=None):
    with tempfile.TemporaryDirectory(prefix="motiongit-kit-operation-") as tmp:
        timeline = Path(tmp) / "timeline.json"
        write(timeline, hydrated(params, inputs))
        return run(["node", kit / "tools/render.mjs", "--timeline", timeline, "--expect-version",
                    read(ROOT / "kit-integration.json")["library"]["version"], *flags], env=env)


def project_hashes(project):
    excluded = {"preview.json", "render.json"}
    if any(p.is_symlink() for p in project.rglob("*")):
        raise ValueError("Project cannot contain symlinks")
    return {p.relative_to(project).as_posix(): sha(p) for p in sorted(project.rglob("*"))
            if p.is_file() and p.relative_to(project).parts[0] != "preview" and p.name not in excluded}


def verify_files(base, files):
    for name, expected in files.items():
        p = safe_path(base, base / safe_relative(name), existing=True)
        if not p.is_file() or {"sha256": sha(p), "bytes": p.stat().st_size} != expected:
            raise ValueError("Reviewed input changed; replan")


def main():
    receipt, kit, spec = verify_bundle()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--instance", type=Path, required=True)
    parser.add_argument("--cache", type=Path)
    sub = parser.add_subparsers(dest="action", required=True)
    for action in ("setup", "doctor", "capabilities"):
        p = sub.add_parser(action)
        if action == "capabilities":
            p.add_argument("--layout", choices=["landscape", "portrait"], default="landscape")
    for action in ("check-params", "plan", "prepare"):
        p = sub.add_parser(action)
        p.add_argument("params")
        p.add_argument("--inputs", required=True)
        if action != "check-params":
            p.add_argument("--out", type=Path, required=True)
        if action == "prepare":
            p.add_argument("--plan", type=Path, required=True)
    for action in ("preview", "render"):
        p = sub.add_parser(action)
        p.add_argument("project", type=Path)
        if action == "preview":
            p.add_argument("--times", required=True)
        else:
            p.add_argument("--out", type=Path, required=True)
            p.add_argument("--workers", type=int, choices=range(1, 5), default=1)
    args = parser.parse_args()
    instance = args.instance.absolute()
    if instance.is_symlink() or instance.resolve() != instance or instance.is_relative_to(ROOT):
        raise ValueError("Permanent instance must be outside frozen core")
    instance.mkdir(parents=True, exist_ok=True)
    source = source_binding(receipt)
    marker = instance / ".motiongit-kit-instance.json"
    expected_marker = {"schema": "motiongit-kit-instance/1", "sourceBinding": source}
    if marker.exists() and read(marker) != expected_marker:
        raise ValueError("Instance belongs to another library/release; create a new instance")
    if not marker.exists():
        write(marker, expected_marker)
    cache, cache_receipt = dependencies(receipt, args.cache)
    if args.action == "setup":
        setup(receipt, cache, cache_receipt)
        print(json.dumps({"status": "dependencies-ready", "workflow": "motion-kit", "cache": str(cache)}))
    elif args.action == "doctor":
        env = render_env(cache, cache_receipt)
        run([env["PYTHON"], "-c", "import numpy; print(numpy.__version__)"], env=env)
        print(json.dumps({"status": "dependencies-verified", "libraryVersion": spec["version"]}))
    elif args.action == "capabilities":
        print(json.dumps({"workflow": "motion-kit", "layout": args.layout, "library": receipt["library"], "controls": spec["controls"]}, ensure_ascii=False))
    elif args.action in {"check-params", "plan"}:
        param_file = (ROOT / args.params[6:]) if args.params.startswith("@core/") else Path(args.params).absolute()
        inputs = ROOT if args.inputs == "@core" else Path(args.inputs).absolute()
        params = resolve_narration(read(param_file))
        files = bindings(params, inputs, spec)
        plan_result = json.loads(engine(kit, params, inputs, ["--plan"], render_env(cache, cache_receipt)))
        plan_result["narrationChoices"] = narration_choices(params["timeline"], plan_result)
        choices = plan_result["narrationChoices"]
        choices["highlightReadability"] = plan_result["highlightReadability"]
        highlight_shots = [i for i, segment in enumerate(params["timeline"].get("segments", [])) if segment.get("control") == "highlight"]
        if choices["applicable"] and highlight_shots:
            choices["newProductionOptions"].append({"field": "timeline.highlightReadability", "value": "complete-text/1", "shots": highlight_shots,
                "action": "For a new narrated film, explicitly select complete marked-text composition before prepare. Retain complete text and source clocks; inspect real font capacity and a fresh preview. Preserve omitted mode for approved old projects."})
            if choices["highlightReadability"]["value"] == "original":
                choices["findings"].append({"code": "HIGHLIGHT_READABILITY_ORIGINAL", "shots": highlight_shots,
                    "action": "New composition: select timeline.highlightReadability=complete-text/1 in a fresh input/plan. Approved legacy replay: keep its existing mode. Clear final text applies to highlight with ending=cut; other controls and fades retain their exits. Never shrink, crop or extend source clocks to fit."})
        plan_result["narrationChoices"]["composition"] = review_narration_composition(params["timeline"], plan_result)
        plan_result["narrationChoices"]["findings"].extend(plan_result["narrationChoices"]["composition"]["findings"])
        if args.action == "check-params":
            print(json.dumps({"status": "inputs-valid", "workflow": "motion-kit", "mediaCount": len(files), "duration": plan_result["duration"], "narrationChoices": plan_result["narrationChoices"]}, ensure_ascii=False))
            return
        out = safe_path(instance, args.out)
        if out.exists():
            raise ValueError("Plan output already exists")
        identity = digest({"paramsSha256": sha(param_file), "files": files})
        vault = safe_path(instance, instance / "inputs" / identity)
        if not vault.exists():
            vault.mkdir(parents=True)
            (vault / "files").mkdir()
            for name in files:
                p = vault / "files" / name
                p.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(inputs / name, p)
            shutil.copyfile(param_file, vault / "params.json")
        verify_files(vault / "files", files)
        if sha(vault / "params.json") != sha(param_file):
            raise ValueError("Vault parameters differ")
        out.mkdir(parents=True)
        report = {**plan_result, "ready": True, "workflow": "motion-kit", "ownerEffectsAcceptance": "pending",
                  "nativeModeReplaced": False, "narrationTiming": "actual-media-preflight", "semanticSelection": "assistant-review-required"}
        write(out / "report.json", report)
        write(out / "auto_plan.json", params)
        write(out / "spec.json", spec)
        write(out / "capabilities.json", {"workflow": "motion-kit", "version": spec["version"], "controls": list(spec["controls"]), "layouts": ["landscape", "portrait"]})
        plan_files = {name: sha(out / name) for name in ("report.json", "auto_plan.json", "spec.json", "capabilities.json")}
        snapshot = {"schema": "motiongit-kit-plan/1", "workflow": "motion-kit", "sourceBinding": source,
                    "paramsSha256": sha(vault / "params.json"), "vault": vault.relative_to(instance).as_posix(),
                    "files": files, "planFiles": plan_files}
        write(out / "inputs.json", snapshot)
        write(out / "review.json", {"schema": "motiongit-plan-review/1", "reviewed": False,
              "inputsSha256": sha(out / "inputs.json"), "instruction": "Review complete user meaning, real media/duration, chosen controls/variants/cues. Technical ready is not owner artistic acceptance."})
        print(json.dumps({"ready": True, "workflow": "motion-kit", "plan": str(out), "narrationChoices": plan_result["narrationChoices"]}, ensure_ascii=False))
    elif args.action == "prepare":
        plan = safe_path(instance, args.plan, existing=True)
        snapshot, review = read(plan / "inputs.json"), read(plan / "review.json")
        if snapshot.get("schema") != "motiongit-kit-plan/1" or snapshot["sourceBinding"] != source or review.get("reviewed") is not True or review.get("inputsSha256") != sha(plan / "inputs.json"):
            raise ValueError("Inspect the source-bound plan before prepare")
        for name, value in snapshot["planFiles"].items():
            if sha(plan / safe_relative(name)) != value:
                raise ValueError("Plan changed after review")
        vault = safe_path(instance, instance / snapshot["vault"], existing=True)
        verify_files(vault / "files", snapshot["files"])
        if sha(vault / "params.json") != snapshot["paramsSha256"]:
            raise ValueError("Parameters changed after review")
        if args.params != "@vault" and sha(Path(args.params).absolute()) != snapshot["paramsSha256"]:
            raise ValueError("Requested parameters differ from reviewed vault")
        if args.inputs != "@vault" and bindings(read(vault / "params.json"), Path(args.inputs).absolute(), spec) != snapshot["files"]:
            raise ValueError("Requested media differ from reviewed vault")
        project = safe_path(instance, args.out)
        if project.exists():
            raise ValueError("Project output already exists")
        project.mkdir(parents=True)
        shutil.copytree(vault / "files", project / "assets")
        params = resolve_narration(read(vault / "params.json"))
        # Rebase declared media, keeping their final policies and human text intact.
        tl = hydrated(params, vault / "files")
        def rebase(value):
            if isinstance(value, dict):
                return {rebase(k): rebase(v) for k, v in value.items()}
            if isinstance(value, list):
                return [rebase(v) for v in value]
            if isinstance(value, str) and value.startswith(str(vault / "files") + os.sep):
                return "assets/" + Path(value).relative_to(vault / "files").as_posix()
            return value
        params["timeline"] = rebase(tl)
        write(project / "params.json", params)
        write(project / "motiongit-origin.json", {"schema": "motiongit-instance/1", "workflow": "motion-kit", "sourceBinding": source,
              "templateId": read(ROOT / "motion.json")["template"]["id"], "templateVersion": read(ROOT / "motion.json")["template"]["version"],
              "planInputsSha256": sha(plan / "inputs.json"),
              "preparedParamsSha256": sha(project / "params.json"), "preparedFiles": bindings(params, project, spec),
              "ownerEffectsAcceptance": "pending", "credentialsInProject": False})
        print(json.dumps({"project": str(project), "workflow": "motion-kit"}))
    else:
        project = safe_path(instance, args.project, existing=True)
        origin = read(project / "motiongit-origin.json")
        if origin.get("workflow") != "motion-kit" or origin["sourceBinding"] != source:
            raise ValueError("Project belongs to a different release/library")
        params = resolve_narration(read(project / "params.json"))
        files = bindings(params, project, spec)
        if origin.get("preparedParamsSha256") != sha(project / "params.json") or origin.get("preparedFiles") != files:
            raise ValueError("Prepared content changed from reviewed plan; replan and prepare a fresh project")
        env = render_env(cache, cache_receipt)
        if args.action == "preview":
            if (project / "preview.json").exists():
                raise ValueError("Preview exists; prepare a fresh project after changes")
            times = [float(t) for t in args.times.split(",")]
            duration = params["timeline"]["duration"]
            if any(not math.isfinite(t) or not 0 <= t < duration for t in times):
                raise ValueError("Preview times must be inside actual duration")
            renderer = json.loads(engine(kit, params, project, ["--out", project / "preview", "--stills", args.times], env))
            hashes = project_hashes(project)
            stills = {p.relative_to(project).as_posix(): sha(p) for p in (project / "preview").glob("*.png")}
            if not stills:
                raise ValueError("No preview frames generated")
            write(project / "preview.json", {"schema": "motiongit-preview/1", "reviewed": False, "sourceBinding": source,
                  "projectHashes": hashes, "stills": stills, "times_s": times, "renderer": renderer,
                  "instruction": "Inspect real material framing, readable full text, safe zones, fonts and motion beats before marking reviewed. Owner effects acceptance remains pending."})
            print(json.dumps({"preview": str(project / "preview"), "reviewed": False}))
        else:
            review = read(project / "preview.json") if (project / "preview.json").exists() else {}
            if review.get("reviewed") is not True or review.get("sourceBinding") != source or review.get("projectHashes") != project_hashes(project):
                raise ValueError("Inspect unchanged preview before render")
            for name, expected in review["stills"].items():
                if sha(project / safe_relative(name)) != expected:
                    raise ValueError("Preview frames changed")
            out = safe_path(instance, args.out)
            if out.exists():
                raise ValueError("Render output exists")
            output = engine(kit, params, project, ["--out", out], env)
            write(project / "render.json", {"workflow": "motion-kit", "sourceBinding": source, "outputSha256": sha(out), "renderer": json.loads(output), "ownerEffectsAcceptance": "pending"})
            print(json.dumps({"output": str(out), "sha256": sha(out), "workflow": "motion-kit"}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        raise SystemExit("MotionGit component extension: " + str(error))
