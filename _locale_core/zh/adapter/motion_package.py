#!/usr/bin/env python3
"""Read-only MotionGit draft validation and bounded ZIP packaging/extraction.

This module reads data; it never imports or executes anything from a package.
Integrity detects changed bytes, not authorship, licensing or safe executable code.
Only the deliberately narrow first MotionGit profile is supported.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import tempfile
from dataclasses import dataclass
from typing import Any
import zipfile

FORMAT = "motiongit-template"
SPEC_VERSION = "0.1.0-draft.1"
RUNTIME_PROFILE = "adu-authored-unit/1"
_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_FORBIDDEN_COMPONENTS = {
    ".git", ".venv", "venv", "node_modules", "__pycache__", ".cache",
    "cache", "caches", "logs", ".pytest_cache", ".mypy_cache", ".ruff_cache",
    ".ds_store", ".env", "secrets", "secret", "credentials", ".ssh",
}
_FORBIDDEN_FILES = {
    ".npmrc", ".pypirc", ".netrc", "credentials.json", "secrets.json",
    "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519",
}


class PackageError(ValueError):
    """The package is unsafe, unsupported, inconsistent or outside limits."""


@dataclass(frozen=True)
class Limits:
    max_entries: int = 10_000
    max_file_bytes: int = 256 * 1024 * 1024
    max_total_bytes: int = 1024 * 1024 * 1024
    max_compression_ratio: float = 1000.0
    max_json_bytes: int = 16 * 1024 * 1024

    def __post_init__(self) -> None:
        values = (self.max_entries, self.max_file_bytes, self.max_total_bytes,
                  self.max_compression_ratio, self.max_json_bytes)
        if any(not math.isfinite(value) or value <= 0 for value in values):
            raise ValueError("all package limits must be positive")


def strict_json_loads(data: bytes | str, label: str = "JSON") -> Any:
    """Require UTF-8 and reject duplicate keys, NaN/Infinity and trailing data."""
    def pairs(items: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in items:
            if key in result:
                raise PackageError(f"{label}: duplicate JSON key {key!r}")
            result[key] = value
        return result

    def finite_float(value: str) -> float:
        number = float(value)
        if not math.isfinite(number):
            raise PackageError(f"{label}: non-finite JSON number {value}")
        return number

    def constant(value: str) -> Any:
        raise PackageError(f"{label}: non-finite JSON number {value}")

    try:
        if isinstance(data, bytes):
            data = data.decode("utf-8", errors="strict")
        return json.loads(data, object_pairs_hook=pairs, parse_constant=constant, parse_float=finite_float)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PackageError(f"{label}: invalid strict UTF-8 JSON: {exc}") from exc


def safe_path(value: Any, label: str = "path") -> str:
    """Return an unchanged, canonical relative POSIX path, or raise."""
    if not isinstance(value, str) or not value:
        raise PackageError(f"{label}: a nonempty relative POSIX path is required")
    if value.startswith("/") or "\\" in value or ":" in value:
        raise PackageError(f"{label}: absolute, drive or backslash path rejected: {value!r}")
    if any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise PackageError(f"{label}: control character in path")
    parts = value.split("/")
    try:
        path_bytes = value.encode("utf-8", errors="strict")
    except UnicodeEncodeError as exc:
        raise PackageError(f"{label}: invalid Unicode path") from exc
    if len(path_bytes) > 4096 or len(parts) > 64:
        raise PackageError(f"{label}: path length or depth limit exceeded")
    if any(part in ("", ".", "..") for part in parts):
        raise PackageError(f"{label}: non-canonical or traversing path: {value!r}")
    for part in parts:
        folded = part.casefold()
        if folded in _FORBIDDEN_COMPONENTS or folded in _FORBIDDEN_FILES:
            raise PackageError(f"{label}: cache or secret path rejected: {value!r}")
        if folded.startswith(".env.") or folded.endswith((".pyc", ".pyo", ".log", ".pem", ".key", ".p12", ".pfx", ".keystore")):
            raise PackageError(f"{label}: cache or secret file rejected: {value!r}")
    return value


# Public aliases used by the first template parameter adapter.
strict_json = strict_json_loads
safe_relative = safe_path


class _Inventory:
    def __init__(self, limits: Limits):
        self.limits = limits
        self.files: dict[str, int] = {}
        self.directories: set[str] = set()
        self._nodes: dict[str, tuple[str, bool]] = {}
        self._explicit: set[str] = set()
        self.entries = 0
        self.total_bytes = 0

    def add(self, name: str, is_directory: bool, size: int = 0) -> None:
        name = safe_path(name)
        self.entries += 1
        if self.entries > self.limits.max_entries:
            raise PackageError("package exceeds entry-count limit")
        if name in self._explicit:
            raise PackageError(f"duplicate archive entry: {name}")
        self._explicit.add(name)
        parts = name.split("/")
        for index in range(1, len(parts) + 1):
            path = "/".join(parts[:index])
            directory = index < len(parts) or is_directory
            folded = path.casefold()
            previous = self._nodes.get(folded)
            if previous and previous != (path, directory):
                raise PackageError(f"case or file/directory collision: {previous[0]} and {path}")
            self._nodes[folded] = (path, directory)
            if directory:
                self.directories.add(path)
        if not is_directory:
            if size < 0 or size > self.limits.max_file_bytes:
                raise PackageError(f"single-file size limit exceeded: {name}")
            self.total_bytes += size
            if self.total_bytes > self.limits.max_total_bytes:
                raise PackageError("package exceeds total uncompressed size limit")
            self.files[name] = size


class _Package:
    def __init__(self, limits: Limits):
        self.inventory = _Inventory(limits)

    def open_file(self, name: str):
        raise NotImplementedError

    def digest(self, name: str) -> str:
        expected_size = self.inventory.files[name]
        actual_size = 0
        digest = hashlib.sha256()
        try:
            with self.open_file(name) as stream:
                while chunk := stream.read(1024 * 1024):
                    actual_size += len(chunk)
                    if actual_size > expected_size:
                        raise PackageError(f"file changed or exceeds declared size: {name}")
                    digest.update(chunk)
        except (OSError, zipfile.BadZipFile, RuntimeError, NotImplementedError) as exc:
            raise PackageError(f"cannot read {name}: {exc}") from exc
        if actual_size != expected_size:
            raise PackageError(f"file changed or has incorrect size: {name}")
        return digest.hexdigest()

    def json(self, name: str) -> Any:
        if name not in self.inventory.files:
            raise PackageError(f"referenced file is missing: {name}")
        if self.inventory.files[name] > self.inventory.limits.max_json_bytes:
            raise PackageError(f"JSON size limit exceeded: {name}")
        try:
            with self.open_file(name) as stream:
                data = stream.read(self.inventory.limits.max_json_bytes + 1)
        except (OSError, zipfile.BadZipFile, RuntimeError) as exc:
            raise PackageError(f"cannot read {name}: {exc}") from exc
        if len(data) != self.inventory.files[name]:
            raise PackageError(f"JSON file changed or has incorrect size: {name}")
        return strict_json_loads(data, name)


class _DirectoryPackage(_Package):
    def __init__(self, root: Path, limits: Limits):
        super().__init__(limits)
        self.root = root
        if root.is_symlink() or not root.is_dir():
            raise PackageError("package root must be an existing directory, not a symlink")
        self._walk(root)

    def _walk(self, folder: Path) -> None:
        try:
            entries = sorted(os.scandir(folder), key=lambda entry: entry.name)
            for entry in entries:
                relative = Path(entry.path).relative_to(self.root).as_posix()
                mode = entry.stat(follow_symlinks=False).st_mode
                if stat.S_ISLNK(mode) or not (stat.S_ISDIR(mode) or stat.S_ISREG(mode)):
                    raise PackageError(f"symlink or special file rejected: {relative}")
                directory = stat.S_ISDIR(mode)
                self.inventory.add(relative, directory, 0 if directory else entry.stat(follow_symlinks=False).st_size)
                if directory:
                    self._walk(Path(entry.path))
        except OSError as exc:
            raise PackageError(f"cannot inventory package directory: {exc}") from exc

    def open_file(self, name: str):
        # O_NOFOLLOW prevents a replaced final component from becoming a symlink.
        path = self.root.joinpath(*name.split("/"))
        for parent in path.parents:
            if parent == self.root:
                break
            if parent.is_symlink():
                raise PackageError(f"symlink parent rejected: {name}")
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            os.close(fd)
            raise PackageError(f"special file rejected: {name}")
        return os.fdopen(fd, "rb")


class _ZipPackage(_Package):
    def __init__(self, archive: zipfile.ZipFile, limits: Limits):
        super().__init__(limits)
        self.archive = archive
        self.members: dict[str, zipfile.ZipInfo] = {}
        for info in archive.infolist():
            raw_name = info.orig_filename
            directory = raw_name.endswith("/")
            name = raw_name[:-1] if directory else raw_name
            mode = info.external_attr >> 16
            file_type = stat.S_IFMT(mode)
            if file_type not in (0, stat.S_IFREG, stat.S_IFDIR):
                raise PackageError(f"symlink or special ZIP entry rejected: {name}")
            if file_type == stat.S_IFDIR and not directory or file_type == stat.S_IFREG and directory:
                raise PackageError(f"inconsistent ZIP entry type: {name}")
            if info.flag_bits & 1:
                raise PackageError(f"encrypted ZIP entry rejected: {name}")
            if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                raise PackageError(f"unsupported ZIP compression: {name}")
            if directory and info.file_size:
                raise PackageError(f"nonempty ZIP directory rejected: {name}")
            if info.file_size and (info.compress_size == 0 or info.file_size / info.compress_size > limits.max_compression_ratio):
                raise PackageError(f"compression ratio limit exceeded: {name}")
            self.inventory.add(name, directory, info.file_size)
            if not directory:
                self.members[name] = info

    def open_file(self, name: str):
        return self.archive.open(self.members[name], "r")


def _object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise PackageError(f"{label}: JSON object required")
    return value


def _required(value: dict[str, Any], key: str, label: str) -> Any:
    if key not in value:
        raise PackageError(f"{label}: missing required field {key}")
    return value[key]


def _hash_map(value: Any, label: str, package: _Package, hashes: dict[str, str], prefix: str = "") -> None:
    mapping = _object(value, label)
    if not mapping:
        raise PackageError(f"{label}: file hash map must not be empty")
    for relative, digest in mapping.items():
        relative = safe_path(relative, label)
        name = f"{prefix}/{relative}" if prefix else relative
        if not isinstance(digest, str) or not _SHA256.fullmatch(digest):
            raise PackageError(f"{label}: lowercase SHA256 required for {relative}")
        if name not in package.inventory.files:
            raise PackageError(f"{label}: referenced file is missing: {name}")
        if name not in hashes:
            raise PackageError(f"{label}: integrity.json cannot hash itself")
        if hashes[name] != digest:
            raise PackageError(f"{label}: SHA256 mismatch: {name}")


def _validate(package: _Package, require_integrity: bool = True, *, allow_personal_key: bool = False) -> dict[str, Any]:
    inventory = package.inventory
    if "motion.json" not in inventory.files:
        raise PackageError("ZIP/package root must contain motion.json")
    manifest = _object(package.json("motion.json"), "motion.json")
    if manifest.get("format") != FORMAT:
        raise PackageError("unsupported motion.json format")
    if manifest.get("specVersion") != SPEC_VERSION:
        raise PackageError("unsupported motion.json specVersion")
    template = _object(_required(manifest, "template", "motion.json"), "template")
    for key in ("id", "version"):
        if not isinstance(template.get(key), str) or not template[key]:
            raise PackageError(f"template.{key}: nonempty string required")
    runtime = _object(_required(manifest, "runtime", "motion.json"), "runtime")
    if runtime.get("profile") != RUNTIME_PROFILE or runtime.get("engine") != "adu-motion-video":
        raise PackageError("unsupported runtime profile or engine")
    parameters = _object(_required(manifest, "parameters", "motion.json"), "parameters")
    assets = _object(_required(manifest, "assets", "motion.json"), "assets")
    preview = _object(_required(manifest, "preview", "motion.json"), "preview")
    license_info = _object(_required(manifest, "license", "motion.json"), "license")
    ai = _object(_required(manifest, "ai", "motion.json"), "ai")
    references = [
        (runtime, "entry", "runtime"), (runtime, "sourceManifest", "runtime"),
        (runtime, "dependencyLock", "runtime"), (parameters, "schema", "parameters"),
        (parameters, "mapping", "parameters"), (parameters, "defaultPreset", "parameters"),
        (assets, "manifest", "assets"), (preview, "cover", "preview"),
        (preview, "preset", "preview"),
        (license_info, "file", "license"), (ai, "entry", "ai"),
    ]
    if "inputGuide" in ai:
        references.append((ai, "inputGuide", "ai"))
    if "fontProfile" in runtime:
        references.append((runtime, "fontProfile", "runtime"))
    if "adapterEntry" in runtime:
        references.append((runtime, "adapterEntry", "runtime"))
    if "video" in preview:
        references.append((preview, "video", "preview"))
    elif not manifest.get("extensions", {}).get("motiongit.com:website-preview", {}).get("websiteVideo", "").startswith("https://media.openaicut.com/previews/"):
        raise PackageError("Missing packaged video or official website preview")
    if "portraitVideo" in preview:
        references.append((preview, "portraitVideo", "preview"))
    for container, key, label in references:
        name = safe_path(_required(container, key, label), f"{label}.{key}")
        if name not in inventory.files:
            raise PackageError(f"{label}.{key}: referenced file is missing: {name}")
    for name in ("README.md", "SKILL.md"):
        if name not in inventory.files:
            raise PackageError(f"required root file is missing: {name}")
    pack = safe_path(_required(runtime, "pack", "runtime"), "runtime.pack")
    if pack not in inventory.directories:
        raise PackageError(f"runtime.pack: referenced directory is missing: {pack}")
    if not runtime["sourceManifest"].startswith(pack + "/"):
        raise PackageError("runtime.sourceManifest must be inside runtime.pack")
    integrity_name = safe_path(_required(manifest, "integrity", "motion.json"), "integrity")
    if integrity_name != "integrity.json":
        raise PackageError("this draft requires root integrity.json")
    # Every JSON file is strict, including auxiliary runtime data and presets.
    for name in sorted(inventory.files):
        if name.endswith(".json") and (require_integrity or name != integrity_name):
            package.json(name)
    personal_key = "motiongit.key.json"
    if personal_key in inventory.files:
        if not allow_personal_key:
            raise PackageError("Personal download Key must never be sealed or published")
        if inventory.files[personal_key] > 65536:
            raise PackageError("Personal Key file is too large")
        _object(package.json(personal_key), "personal Key file")
    hashes = {name: package.digest(name) for name in sorted(inventory.files)
              if name != integrity_name and not (allow_personal_key and name == personal_key)}
    source = _object(package.json(runtime["sourceManifest"]), "source manifest")
    if source.get("sourceFormat") != "authored-unit/1":
        raise PackageError("unsupported source manifest sourceFormat")
    _hash_map(_required(source, "files", "source manifest"), "source manifest files", package, hashes, pack)
    runtime_files = source.get("runtimeFiles", [])
    if not isinstance(runtime_files, list):
        raise PackageError("source manifest runtimeFiles must be an array")
    for name in runtime_files:
        if safe_path(name, "source runtimeFiles") not in source["files"]:
            raise PackageError(f"source runtimeFiles must be declared in files: {name}")
    scenes = source.get("scenes", [])
    if not isinstance(scenes, list):
        raise PackageError("source manifest scenes must be an array")
    for scene in scenes:
        scene = _object(scene, "source scene")
        if "sourceCodeFile" in scene:
            code = safe_path(scene["sourceCodeFile"], "sourceCodeFile")
            if code not in source["files"]:
                raise PackageError(f"sourceCodeFile must be declared in files: {code}")
            if scene.get("sourceBlockSha256") != source["files"][code]:
                raise PackageError(f"sourceBlockSha256 mismatch: {code}")
    lock = _object(package.json(runtime["dependencyLock"]), "dependency lock")
    # Only these documented package-root hash maps have known path semantics.
    # Tool-specific lock layouts are data, not inferred commands or paths.
    if "sourceFiles" in lock:
        _hash_map(lock["sourceFiles"], "dependency lock sourceFiles", package, hashes)
        if lock.get("schema") == "motiongit-lock/1":
            frozen = {name for name in inventory.files if name.startswith(pack + "/") or name.startswith("runtime/")}
            missing = frozen - set(lock["sourceFiles"])
            if missing:
                raise PackageError(f"dependency lock sourceFiles omits frozen files: {sorted(missing)[:5]}")
    if "dependencyFiles" in lock:
        if not isinstance(lock["dependencyFiles"], list):
            raise PackageError("dependency lock dependencyFiles must be an array")
        for value in lock["dependencyFiles"]:
            name = safe_path(value, "dependencyFiles")
            if name not in inventory.files:
                raise PackageError(f"dependencyFiles: referenced file is missing: {name}")
    if "runtimeFiles" in lock and isinstance(lock["runtimeFiles"], dict):
        _hash_map(lock["runtimeFiles"], "dependency lock runtimeFiles", package, hashes)
    if require_integrity:
        integrity = _object(package.json(integrity_name), "integrity.json")
        if integrity.get("algorithm") != "sha256":
            raise PackageError("integrity.json algorithm must be sha256")
        declared = _object(_required(integrity, "files", "integrity.json"), "integrity files")
        if set(declared) != set(hashes):
            missing = sorted(set(hashes) - set(declared))
            extra = sorted(set(declared) - set(hashes))
            raise PackageError(f"integrity file inventory mismatch; missing={missing[:5]}, extra={extra[:5]}")
        _hash_map(declared, "integrity", package, hashes)
    return {"format": FORMAT, "specVersion": SPEC_VERSION, "template": template,
            "runtimeProfile": RUNTIME_PROFILE, "files": len(inventory.files),
            "totalBytes": inventory.total_bytes, "hashes": hashes}


def validate_directory(directory: str | Path, limits: Limits = Limits()) -> dict[str, Any]:
    """Read-only validation. Does not execute code or alter any package file."""
    return _validate(_DirectoryPackage(Path(directory).absolute(), limits), allow_personal_key=True)


def seal_directory(directory: str | Path, limits: Limits = Limits()) -> dict[str, Any]:
    """Explicitly generate integrity.json after independent structural checks."""
    root = Path(directory).absolute()
    package = _DirectoryPackage(root, limits)
    report = _validate(package, require_integrity=False)
    content = (json.dumps({"algorithm": "sha256", "files": report["hashes"]},
                          ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")
    if len(content) > min(limits.max_json_bytes, limits.max_file_bytes):
        raise PackageError("generated integrity.json exceeds file or JSON size limit")
    prior_size = package.inventory.files.get("integrity.json", 0)
    if package.inventory.total_bytes - prior_size + len(content) > limits.max_total_bytes:
        raise PackageError("sealed package would exceed total size limit")
    if "integrity.json" not in package.inventory.files and package.inventory.entries + 1 > limits.max_entries:
        raise PackageError("sealed package would exceed entry-count limit")
    fd, temporary = tempfile.mkstemp(prefix=".motion-integrity-", dir=root)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(content)
        os.replace(temporary, root / "integrity.json")
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return validate_directory(root, limits)


def pack_directory(directory: str | Path, destination: str | Path, limits: Limits = Limits()) -> dict[str, Any]:
    """Create deterministic NEW.motion and a byte-identical NEW.zip; fail existing."""
    root = Path(directory).absolute()
    target = Path(destination).absolute()
    if target.suffix != ".motion":
        raise PackageError("pack destination must end in .motion")
    compatibility = target.with_suffix(".zip")
    if target.exists() or target.is_symlink() or compatibility.exists() or compatibility.is_symlink():
        raise PackageError("pack destinations must not already exist")
    if not target.parent.is_dir():
        raise PackageError("pack destination parent directory must already exist")
    if (target.parent.resolve() / target.name).is_relative_to(root.resolve()):
        raise PackageError("pack destination must be outside the source package")
    package = _DirectoryPackage(root, limits)
    report = _validate(package)
    created: list[Path] = []
    try:
        # 'x' creates exclusively, so concurrent existing files are not overwritten.
        with target.open("xb") as output:
            created.append(target)
            with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
                for name in sorted(package.inventory.files):
                    info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                    info.create_system = 3
                    info.external_attr = (stat.S_IFREG | 0o644) << 16
                    info.compress_type = zipfile.ZIP_DEFLATED
                    info._compresslevel = 9
                    digest = hashlib.sha256()
                    size = 0
                    with package.open_file(name) as source, archive.open(info, "w") as member:
                        while chunk := source.read(1024 * 1024):
                            size += len(chunk)
                            if size > package.inventory.files[name]:
                                raise PackageError(f"source changed during pack: {name}")
                            digest.update(chunk)
                            member.write(chunk)
                    expected = report["hashes"].get(name)
                    if name == "integrity.json":
                        expected = package.digest(name)
                    if size != package.inventory.files[name] or digest.hexdigest() != expected:
                        raise PackageError(f"source changed during pack: {name}")
        # Verify the produced archive through exactly the extractor's validation.
        with zipfile.ZipFile(target) as archive:
            _validate(_ZipPackage(archive, limits))
        with target.open("rb") as source, compatibility.open("xb") as output:
            created.append(compatibility)
            shutil.copyfileobj(source, output)
        digest = hashlib.sha256()
        with target.open("rb") as stream:
            while chunk := stream.read(1024 * 1024):
                digest.update(chunk)
        return {"motion": str(target), "zip": str(compatibility), "sha256": digest.hexdigest(), "files": report["files"]}
    except (OSError, zipfile.BadZipFile, RuntimeError) as exc:
        raise PackageError(f"cannot pack package: {exc}") from exc
    finally:
        if sys.exc_info()[0] is not None:
            for path in created:
                path.unlink(missing_ok=True)


def unpack_archive(archive_path: str | Path, destination: str | Path, limits: Limits = Limits()) -> dict[str, Any]:
    """Validate all metadata/data before creating a fresh extraction directory."""
    target = Path(destination).absolute()
    if target.exists() or target.is_symlink():
        raise PackageError("unpack destination must not already exist")
    if not target.parent.is_dir():
        raise PackageError("unpack destination parent directory must already exist")
    created = False
    try:
        with zipfile.ZipFile(archive_path, "r") as archive:
            package = _ZipPackage(archive, limits)
            report = _validate(package, allow_personal_key=True)
            target.mkdir()
            created = True
            for name in sorted(package.inventory.files):
                output_path = target.joinpath(*name.split("/"))
                output_path.parent.mkdir(parents=True, exist_ok=True)
                with package.open_file(name) as source, output_path.open("xb") as output:
                    size = 0
                    while chunk := source.read(1024 * 1024):
                        size += len(chunk)
                        if size > package.inventory.files[name]:
                            raise PackageError(f"ZIP entry exceeds declared size: {name}")
                        output.write(chunk)
                    if size != package.inventory.files[name]:
                        raise PackageError(f"ZIP entry size mismatch: {name}")
            verified = validate_directory(target, limits)
            return {"directory": str(target), "files": verified["files"], "template": report["template"]}
    except (OSError, zipfile.BadZipFile, RuntimeError, NotImplementedError) as exc:
        raise PackageError(f"cannot unpack package: {exc}") from exc
    finally:
        if created and sys.exc_info()[0] is not None:
            shutil.rmtree(target)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for command in ("validate", "seal"):
        sub = commands.add_parser(command)
        sub.add_argument("directory")
    sub = commands.add_parser("pack")
    sub.add_argument("directory")
    sub.add_argument("new_motion")
    sub = commands.add_parser("unpack")
    sub.add_argument("archive")
    sub.add_argument("new_directory")
    args = parser.parse_args(argv)
    try:
        if args.command == "validate":
            report = validate_directory(args.directory)
        elif args.command == "seal":
            report = seal_directory(args.directory)
        elif args.command == "pack":
            report = pack_directory(args.directory, args.new_motion)
        else:
            report = unpack_archive(args.archive, args.new_directory)
        report.pop("hashes", None)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except (PackageError, OSError) as exc:
        print(f"motion-package: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
