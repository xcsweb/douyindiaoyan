#!/usr/bin/env python3
"""One verified temporary package core, permanent reviewed inputs and instance.

Dependency caches contain dependency trees and their lock receipt only. Frozen
renderer source is overlaid in an OS temporary directory for each operation.
The underlying native planner/compiler and render transaction stay authoritative.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile

sys.dont_write_bytecode = True


def materialize_runtime_dependency(source, destination):
    # MOTIONGIT_PORTABLE_DEPENDENCY_TREE_V3
    # The caller validates the dependency receipt and owns this temporary output.
    source, destination = Path(source), Path(destination)
    if (source.is_symlink() or not source.is_dir()
            or (getattr(source, "is_junction", lambda: False)())):
        raise ValueError("Dependency source must be a regular cache directory")
    if destination.exists() or destination.is_symlink():
        raise ValueError("Dependency overlay destination already exists")
    try:
        destination.symlink_to(source, target_is_directory=True)
        return "symbolic-link"
    except OSError as error:
        if sys.platform == "win32" and getattr(error, "winerror", None) in {2, 87, 183}:
            # Some execution hosts create the correct link but report a stale
            # failure. CPython may then retry error 87 and encounter error 183.
            # The destination was absent above: accept only that completed link
            # to this exact regular cache object, never an existing copy/junction.
            try:
                if (destination.is_symlink() and source.samefile(destination)
                        and destination.resolve(strict=True) == source.resolve(strict=True)):
                    return "verified-symbolic-link"
            except (OSError, RuntimeError):
                pass
        if sys.platform != "win32" or getattr(error, "winerror", None) not in {1, 50, 1314}:
            raise
        if destination.exists() or destination.is_symlink():
            raise ValueError("Dependency overlay link failed after creating an output") from error
    # Windows native npm/venv trees use regular files. Do not follow unexpected
    # links/reparse directories into another cache or the user's filesystem.
    for item in source.rglob("*"):
        if (item.is_symlink() or getattr(item, "is_junction", lambda: False)()
                or not (item.is_file() or item.is_dir())):
            raise ValueError("Dependency cache contains a linked or special entry")
    def link_or_copy_file(src, dst):
        # Same-volume hard links avoid recopying dependency contents. A different
        # volume/filesystem uses a regular copy; no elevation or shell is needed.
        try:
            os.link(src, dst, follow_symlinks=False)
            return str(dst)
        except (OSError, NotImplementedError):
            return shutil.copy2(src, dst, follow_symlinks=False)
    shutil.copytree(source, destination, symlinks=False, copy_function=link_or_copy_file)
    return "portable-tree"
INSTANCE_PREFIX = "motiongit-instance:/"
SPLIT_ROOT = {"schema": "motiongit-split-root/1", "instanceArgument": "--instance",
              "coreLifetime": "operation", "inputVault": "inputs"}


def safe_child(root, path, *, existing=False):
    root, path = Path(root).absolute(), Path(path).absolute()
    if not path.is_relative_to(root) or path == root:
        raise ValueError("Operation path must be inside the permanent instance")
    current = path
    while current != root:
        if current.is_symlink():
            raise ValueError("Instance paths must not contain symlinks")
        current = current.parent
    if root.is_symlink() or (existing and not path.exists()):
        raise ValueError("Instance path is missing or is a symlink")
    return path


def binding(instance, path):
    return INSTANCE_PREFIX + safe_child(instance, path).relative_to(instance).as_posix()


def hydrate(instance, value):
    if isinstance(value, dict):
        return {k: hydrate(instance, v) for k, v in value.items()}
    if isinstance(value, list):
        return [hydrate(instance, v) for v in value]
    if isinstance(value, str) and value.startswith(INSTANCE_PREFIX):
        name = value[len(INSTANCE_PREFIX):]
        if not name or ".." in Path(name).parts or Path(name).is_absolute():
            raise ValueError("Invalid permanent input binding")
        return str(safe_child(instance, Path(instance) / name, existing=True))
    return value


def canonical(instance, value):
    if isinstance(value, dict):
        return {k: canonical(instance, v) for k, v in value.items()}
    if isinstance(value, list):
        return [canonical(instance, v) for v in value]
    if isinstance(value, str):
        path = Path(value)
        if path.is_absolute() and path.is_relative_to(instance) and path != instance:
            return binding(instance, path)
    return value


def source_binding(consumer):
    return {"integritySha256": consumer.sha(consumer.ROOT / "integrity.json"),
            "sourceLockSha256": consumer.sha(consumer.ROOT / "motion.lock.json"),
            "runtimeLockSha256": consumer.sha(consumer.ROOT / "runtime-lock.json")}


def install_packaged_default_binding(consumer, instance):
    """Keep an implicit licensed music input alive after the temporary core closes."""
    original = consumer.bindings

    def bindings(params, inputs):
        brief, paths, rows = original(params, inputs)
        source = paths.get("default-music")
        if source is None:
            return brief, paths, rows
        source = Path(source)
        if not source.is_relative_to(consumer.ROOT):
            raise ValueError("Packaged default must belong to the verified core")
        relative = source.relative_to(consumer.ROOT)
        destination = safe_child(instance, instance / "inputs" / ".package-assets" /
                                 consumer.sha(consumer.ROOT / "integrity.json") / relative)
        expected = consumer.fingerprint(source)
        if destination.exists():
            if consumer.fingerprint(destination) != expected:
                raise ValueError("Permanent packaged default changed")
        else:
            destination.parent.mkdir(parents=True, exist_ok=True)
            if source.is_dir():
                shutil.copytree(source, destination)
            else:
                shutil.copy2(source, destination)
                destination.chmod(0o600)

        def relocate(value):
            if isinstance(value, dict):
                return {key: relocate(item) for key, item in value.items()}
            if isinstance(value, list):
                return [relocate(item) for item in value]
            return str(destination) if value == str(source) else value

        return relocate(brief), {**paths, "default-music": destination}, rows

    consumer.bindings = bindings


def instance_root(consumer, directory):
    root = Path(directory).absolute()
    consumer.outside_package(root)
    if root.is_symlink():
        raise ValueError("Instance root must be a regular directory")
    root.mkdir(parents=True, exist_ok=True)
    receipt = root / ".motiongit-instance.json"
    expected = {"schema": "motiongit-split-instance/1", "sourceBinding": source_binding(consumer)}
    if receipt.is_symlink() or (receipt.exists() and consumer.read(receipt) != expected):
        raise ValueError("Instance belongs to a different verified template source")
    if not receipt.exists():
        consumer.write(receipt, expected)
    return root


def core_argument(consumer, value, *, directory=False):
    if value == "@core" and directory:
        return consumer.ROOT
    if value.startswith("@core/"):
        from motion_package import safe_relative
        name = value[len("@core/"):]
        safe_relative(name)
        return consumer.local(name, consumer.ROOT)
    if value == "@vault":
        raise ValueError("@vault is available only for reviewed prepare")
    return Path(value).resolve()


def vault_inputs(consumer, instance, params, inputs):
    """Copy only declared file/sequence inputs; never clone a package core."""
    _, paths, _ = consumer.bindings(consumer.read(params), inputs)
    fingerprints = {key: consumer.fingerprint(path) for key, path in paths.items()}
    identity = consumer.digest_json({"paramsSha256": consumer.sha(params), "files": fingerprints})
    vault = instance / "inputs" / identity
    safe_child(instance, vault)
    if vault.exists():
        record = consumer.read(vault / "vault.json")
        if record.get("inputIdentity") != identity or record.get("fingerprints") != fingerprints:
            raise ValueError("Existing input vault differs")
    else:
        vault.parent.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="motiongit-input-vault-") as temporary:
            staging = Path(temporary) / "vault"
            media = staging / "files"
            media.mkdir(parents=True)
            for path in paths.values():
                if path.is_relative_to(instance / "inputs" / ".package-assets"):
                    # This input was already copied and checked by the host adapter.
                    continue
                relative = path.relative_to(inputs)
                if relative == Path("."):
                    raise ValueError("Declare sequence input below its input directory")
                target = media / relative
                if target.exists():
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                if path.is_dir():
                    shutil.copytree(path, target)
                else:
                    shutil.copy2(path, target)
            shutil.copy2(params, staging / "params.json")
            consumer.write(staging / "vault.json", {"schema": "motiongit-input-vault/1",
                           "inputIdentity": identity, "fingerprints": fingerprints})
            # Cross-volume rename is not assumed; publication refuses reuse.
            shutil.copytree(staging, vault)
    stored_params, stored_inputs = vault / "params.json", vault / "files"
    if consumer.sha(stored_params) != consumer.sha(params):
        raise ValueError("Stored parameters differ from the declared input")
    _, stored_paths, _ = consumer.bindings(consumer.read(stored_params), stored_inputs)
    if {k: consumer.fingerprint(p) for k, p in stored_paths.items()} != fingerprints:
        raise ValueError("Stored input vault changed")
    return stored_params, stored_inputs


def plan(consumer, instance, params, inputs, destination, runtime):
    destination = safe_child(instance, destination)
    stored_params, stored_inputs = vault_inputs(consumer, instance, params, inputs)
    consumer.plan(stored_params, stored_inputs, destination, runtime)
    names = ("auto_plan.json", "report.json", "spec.json", "capabilities.json")
    for name in names:
        consumer.write(destination / name, canonical(instance, consumer.read(destination / name)))
    snapshot = canonical(instance, consumer.read(destination / "inputs.json"))
    snapshot.update(schema="motiongit-plan-inputs/2", sourceBinding=source_binding(consumer),
                    paramsBinding=binding(instance, stored_params), inputsBinding=binding(instance, stored_inputs))
    snapshot["planFiles"] = {name: consumer.sha(destination / name) for name in names}
    consumer.write(destination / "inputs.json", snapshot)
    review = consumer.read(destination / "review.json")
    review.update(inputsSha256=consumer.sha(destination / "inputs.json"),
                  planFilesSha256=consumer.digest_json(snapshot["planFiles"]))
    consumer.write(destination / "review.json", review)


def reviewed_plan(consumer, instance, plan_dir):
    plan_dir = safe_child(instance, plan_dir, existing=True)
    snapshot, review = consumer.read(plan_dir / "inputs.json"), consumer.read(plan_dir / "review.json")
    if (snapshot.get("schema") != "motiongit-plan-inputs/2"
            or snapshot.get("sourceBinding") != source_binding(consumer)
            or review.get("schema") != "motiongit-plan-review/1" or review.get("reviewed") is not True):
        raise ValueError("Inspect the current source-bound plan before prepare")
    if (review.get("inputsSha256") != consumer.sha(plan_dir / "inputs.json")
            or review.get("planFilesSha256") != consumer.digest_json(snapshot["planFiles"])):
        raise ValueError("Reviewed plan binding changed; replan")
    for name, expected in snapshot["planFiles"].items():
        from motion_package import safe_relative
        safe_relative(name)
        if consumer.sha(plan_dir / name) != expected:
            raise ValueError("Plan changed after review; replan")
    stored_params = Path(hydrate(instance, snapshot["paramsBinding"]))
    stored_inputs = Path(hydrate(instance, snapshot["inputsBinding"]))
    if consumer.sha(stored_params) != snapshot["paramsSha256"]:
        raise ValueError("Parameters changed after plan")
    for item in snapshot["files"].values():
        if consumer.fingerprint(hydrate(instance, item["path"])) != item["fingerprint"]:
            raise ValueError("Input changed after plan")
    if not consumer.read(plan_dir / "report.json")["ready"]:
        raise ValueError("Plan has unresolved missing or blocked inputs")
    return snapshot, stored_params, stored_inputs


def prepare(consumer, instance, params, inputs, plan_dir, output, runtime):
    snapshot, stored_params, stored_inputs = reviewed_plan(consumer, instance, plan_dir)
    if params != "@vault" and consumer.sha(core_argument(consumer, params)) != snapshot["paramsSha256"]:
        raise ValueError("Requested parameters differ from the reviewed vault")
    if inputs != "@vault":
        _, requested, _ = consumer.bindings(consumer.read(stored_params), core_argument(consumer, inputs, directory=True))
        if {k: consumer.fingerprint(v) for k, v in requested.items()} != {
                k: v["fingerprint"] for k, v in snapshot["files"].items()}:
            raise ValueError("Requested inputs differ from the reviewed vault")
    output = safe_child(instance, output)
    _, paths, rows = consumer.bindings(consumer.read(stored_params), stored_inputs)
    with tempfile.TemporaryDirectory(prefix="motiongit-materialized-plan-") as temporary:
        work = Path(temporary)
        consumer.write(work / "auto_plan.json", hydrate(instance, consumer.read(plan_dir / "auto_plan.json")))
        captions = work / "subs.js"
        captions.write_text("const SUBS=" + json.dumps(rows, ensure_ascii=False).replace("<", "\\u003c") + ";\n")
        consumer.native(runtime, "build", work / "auto_plan.json", paths["talk"], output, captions)
    from corner_runtime import install_project_signature
    install_project_signature(output, consumer.ROOT, consumer.read(stored_params), 605)
    consumer.write(output / "motiongit-origin.json", {"schema": "motiongit-instance/1",
                   "integritySha256": snapshot["packageSha256"], "sourceLockSha256": snapshot["sourceLockSha256"],
                   "paramsSha256": snapshot["paramsSha256"], "planInputsSha256": consumer.sha(plan_dir / "inputs.json"),
                   "inputFiles": snapshot["files"], "sourceBinding": snapshot["sourceBinding"],
                   "captionLanguages": ["zh", "en"],
                   "primaryCaptionLanguage": consumer.read(consumer.ROOT / "guide.json").get("language", "zh"),
                   "wordTimingSource": "measured and validated", "ownerEffectsAcceptance": "pending"})


def dependency_receipt(consumer):
    return {"schema": "motiongit-dependencies/1", "runtimeLockSha256": consumer.sha(consumer.ROOT / "runtime-lock.json"),
            "npmLockSha256": consumer.sha(consumer.RUNTIME / "package-lock.json"),
            "pythonRequirementsSha256": consumer.sha(consumer.RUNTIME / "requirements-runtime.txt")}


def dependency_cache(consumer, value):
    return (Path(value).absolute() if value else Path(tempfile.gettempdir()) /
            ("motiongit-dependencies-" + consumer.sha(consumer.ROOT / "runtime-lock.json")[:16]))


@contextmanager
def runtime_overlay(consumer, cache, *, setup=False, doctor=False):
    consumer.outside_package(cache)
    receipt = cache / "dependencies.json"
    if cache.is_symlink():
        raise ValueError("Dependency cache must be a regular directory")
    expected = dependency_receipt(consumer)
    reuse = setup and cache.exists()
    if setup:
        if reuse:
            if receipt.is_symlink() or not receipt.is_file():
                raise ValueError("Dependency cache receipt missing or linked")
            actual = consumer.read(receipt)
            legacy = {**expected, "runtimeLockSha256": '2e51fe090f75f09296761d56242317e939fe03372d11c252ff95f8ae005e0c38', "pythonRequirementsSha256": '2719521e1f58d81f0e06ebf50da9b663990c221047b4129c02e0fc1a0d0d1544'}
            if actual not in (expected, legacy) or set(p.name for p in cache.iterdir()) != {"dependencies.json", "node_modules", ".venv"}:
                raise ValueError("Dependency cache differs; choose a new cache")
            if any((cache / n).is_symlink() or not (cache / n).is_dir() for n in ("node_modules", ".venv")):
                raise ValueError("Linked dependency tree rejected")
        else:
            cache.mkdir(parents=True)
    elif not doctor or cache.exists():
        if receipt.is_symlink() or not receipt.is_file() or consumer.read(receipt) != expected:
            raise ValueError("Dependency cache differs; run setup in a new cache")
        if set(p.name for p in cache.iterdir()) != {"dependencies.json", "node_modules", ".venv"}:
            raise ValueError("Persistent dependency cache contains unexpected source files")
    with tempfile.TemporaryDirectory(prefix="motiongit-runtime-overlay-") as temporary:
        overlay = Path(temporary) / "runtime"
        shutil.copytree(consumer.RUNTIME, overlay)
        overlay.chmod(0o700)
        # A verified core may be read-only. The native compiler copies source
        # files into an editable project and then applies reviewed output layers;
        # preserving 0444 would make those generated copies unwritable. Only the
        # disposable overlay's permission bits change; frozen bytes stay hashed.
        for file in overlay.rglob("*"):
            if file.is_dir():
                file.chmod(0o700)
            elif file.is_file():
                file.chmod(0o644)
        if setup:
            from portable import npm_command, run, venv_python
            from face_runtime_dependencies import create_face_venv, repair_face_runtime
            if not reuse:
                run([*npm_command(), "ci", "--prefix", overlay], overlay)
                shutil.move(overlay / "node_modules", cache / "node_modules")
                create_face_venv(cache / ".venv")
                run([venv_python(cache), "-m", "pip", "install", "--only-binary=:all:",
                     "-r", overlay / "requirements-runtime.txt"], overlay)
            repair_face_runtime(venv_python(cache), requirements=overlay / "requirements-runtime.txt")
            consumer.write(receipt, expected)
        if cache.exists():
            for name in ("node_modules", ".venv"):
                if not (cache / name).is_dir() or (cache / name).is_symlink():
                    raise ValueError("Dependency tree missing or linked outside its cache")
                materialize_runtime_dependency(cache / name, overlay / name)
        consumer.verify(overlay)
        yield overlay


def main():
    import run as consumer
    from motion_package import validate_directory
    validate_directory(consumer.ROOT)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--instance", type=Path, required=True)
    parser.add_argument("--cache", type=Path)
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("setup", "doctor"):
        sub.add_parser(name)
    capabilities = sub.add_parser("capabilities")
    capabilities.add_argument("--layout", choices=["landscape", "portrait"], default="portrait")
    for name in ("check-params", "plan", "prepare"):
        operation = sub.add_parser(name)
        operation.add_argument("params")
        operation.add_argument("--inputs", required=True)
        if name != "check-params":
            operation.add_argument("--out", type=Path, required=True)
        if name == "prepare":
            operation.add_argument("--plan", type=Path, required=True)
    for name in ("preview", "render"):
        operation = sub.add_parser(name)
        operation.add_argument("project", type=Path)
        if name == "preview":
            operation.add_argument("--times", required=True)
        else:
            operation.add_argument("--out", type=Path, required=True)
            operation.add_argument("--workers", type=int, choices=range(1, 5), default=4)
    args = parser.parse_args()
    instance = instance_root(consumer, args.instance)
    install_packaged_default_binding(consumer, instance)
    cache = dependency_cache(consumer, args.cache)
    with runtime_overlay(consumer, cache, setup=args.command == "setup", doctor=args.command in {"doctor", "capabilities"}) as runtime:
        if args.command == "setup":
            print(json.dumps({"status": "dependencies-ready", "persistentCore": False,
                              "dependencyCache": str(cache), "splitRoot": SPLIT_ROOT}))
        elif args.command == "doctor":
            consumer.execute(runtime, "doctor")
        elif args.command == "capabilities":
            consumer.native(runtime, "capabilities", "--layout", args.layout)
        elif args.command in {"check-params", "plan"}:
            params = core_argument(consumer, args.params)
            inputs = core_argument(consumer, args.inputs, directory=True)
            if args.command == "plan":
                plan(consumer, instance, params, inputs, args.out, runtime)
            else:
                brief, _, rows = consumer.bindings(consumer.read(params), inputs)
                print(json.dumps({"status": "inputs-valid-semantic-plan-still-required",
                                  "frames": sum(s["durationFrames"] for s in brief["segments"]),
                                  "bilingualCues": len(rows), "measuredHighlightCues": len(rows)}))
        elif args.command == "prepare":
            prepare(consumer, instance, args.params, args.inputs, args.plan, args.out, runtime)
        elif args.command == "preview":
            consumer.preview(safe_child(instance, args.project, existing=True), args.times, runtime)
        else:
            consumer.render(safe_child(instance, args.project, existing=True), safe_child(instance, args.out), args.workers, runtime)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        raise SystemExit("MotionGit split-root: " + str(error))
