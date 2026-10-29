"""Reviewed native exports with immutable inputs and persistent recovery evidence.

This module is copied into an authored template by motion-runtime-upgrade.py.
It uses only the template's existing renderer/brand bridge and Python stdlib.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import uuid

SCHEMA = "motiongit-export-transaction/1"
DERIVED_FILES = {
    "preview.json", "sfx.json", "bgm.wav", "sfx.wav", "mix.wav", "final.wav",
    "macro_audio_report.json", "sound_recipe_receipt.json", "audio_boundary_report.json",
    "mix_receipt.json", "music-sfx-report.json", "mark-report.json", "render.log", "preview.log",
}
DERIVED_DIRS = {"stills", "marks", "exports"}


def _motiongit_command_detail(result):
    # MOTIONGIT_CAPTURED_TOOL_DETAILS_V1: only failed-tool diagnostics change.
    value = getattr(result, 'stderr', None) or getattr(result, 'stdout', None) or ''
    if isinstance(value, bytes):
        value = value.decode('utf-8', errors='replace')
    return str(value).strip()[-6000:]


def sha(path):
    with Path(path).open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                   ensure_ascii=False, allow_nan=False).encode()).hexdigest()


def read(path):
    # The package adapter performs its strict package/input validation first.
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        with temporary.open("x", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write("\n")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def reviewed_hashes(project):
    """Exclude only declared root-level generated outputs; bind all mix settings.

    mix_recipe.json is immutable user configuration and stays fully hashed.
    The patched mixer writes effective mastering evidence to mix_receipt.json.
    An identically named file nested in user assets is still a reviewed input.
    """
    project = Path(project)
    result = {}
    for item in sorted(project.rglob("*")):
        relative = item.relative_to(project)
        if relative.parts[0] in DERIVED_DIRS or (len(relative.parts) == 1 and item.name in DERIVED_FILES):
            continue
        if item.is_symlink():
            raise ValueError("Symlink in reviewed project")
        if item.is_file():
            result[relative.as_posix()] = sha(item)
    return result


def _run(command):
    result = subprocess.run(list(map(str, command)), check=False, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE)
    if result.returncode:
        raise ValueError(("Export preflight tool failed: " + Path(str(command[0])).name) + "\n" + _motiongit_command_detail(result))
    return result.stdout


def brand_preflight(package, project, config):
    """Validate approved bytes and real VP9 alpha decode before audio/render work."""
    from bridge.brand_mark import BRAND_SHAPES, schedule_marks
    plan = read(Path(project) / "macro_plan.json")
    layout = plan.get("layout")
    width = plan.get("width", layout.get("width") if isinstance(layout, dict) else None)
    height = plan.get("height", layout.get("height") if isinstance(layout, dict) else None)
    if plan.get("fps", 60) != 60 or (width, height) not in {(1920, 1080), (1080, 1920)}:
        raise ValueError("Native export requires a verified 60fps 1080p layout")
    schedule_marks(plan["end_frame"] / 60, 60, width, height, config)
    shape = config.get("shape", "square")
    if shape not in BRAND_SHAPES:
        raise ValueError("Unsupported brand shape")
    if "libx264" not in _run(["ffmpeg", "-hide_banner", "-encoders"]).decode():
        raise ValueError("Brand/export requires libx264")
    if "libvpx-vp9" not in _run(["ffmpeg", "-hide_banner", "-decoders"]).decode():
        raise ValueError("Brand/export requires the libvpx-vp9 alpha decoder")
    _run(["ffmpeg", "-v", "error", "-nostdin", "-f", "lavfi", "-i", "color=s=16x16:r=60",
          "-frames:v", "1", "-c:v", "libx264", "-f", "null", "-"])
    faces = []
    for variant, (name, expected) in BRAND_SHAPES[shape].items():
        asset = Path(package) / "brand" / name
        if asset.is_symlink() or not asset.is_file() or sha(asset) != expected:
            raise ValueError("Approved brand asset missing or changed: " + name)
        alpha = _run(["ffmpeg", "-v", "error", "-nostdin", "-c:v", "libvpx-vp9", "-i", asset,
                      "-ss", "1.2", "-frames:v", "1", "-vf", "format=rgba,alphaextract",
                      "-pix_fmt", "gray", "-f", "rawvideo", "-"])
        if not alpha or min(alpha) != 0 or max(alpha) == 0:
            raise ValueError("Brand asset did not decode a transparent alpha plane: " + name)
        faces.append({"variant": variant, "file": "brand/" + name, "sha256": expected,
                      "decodedAlphaMinimum": min(alpha), "decodedAlphaMaximum": max(alpha)})
    return {"schema": "motiongit-brand-preflight/1", "shape": shape, "approvedAssets": faces,
            "libx264EncodeVerified": True, "vp9AlphaDecodeVerified": True}


def identity(package, project, config):
    package, project = Path(package), Path(project)
    hashes = reviewed_hashes(project)
    return {"reviewedProjectHashesSha256": digest(hashes), "previewSha256": sha(project / "preview.json"),
            "packageIntegritySha256": sha(package / "integrity.json"),
            "sourceLockSha256": sha(package / "motion.lock.json"),
            "runtimeLockSha256": sha(package / "runtime-lock.json"), "markConfigSha256": digest(config)}


def _new_path(path):
    path = Path(path).absolute()
    if path.exists() or path.is_symlink() or not path.parent.is_dir():
        raise ValueError("Export target and manifest must be new files in an existing directory")
    if not os.access(path.parent, os.W_OK | (0 if os.name == "nt" else os.X_OK)):
        raise ValueError("Export parent is not writable")
    return path


def validate_master(project, master, manifest):
    """Require original renderer evidence and current prepared-input identities."""
    if any(p.is_symlink() or not p.is_file() for p in (master, manifest)):
        raise ValueError("Recovery master or original render manifest is missing")
    export = read(manifest)
    clock = export.get("frame_clock", {})
    frames, fps, duration = export.get("frames"), export.get("fps"), export.get("duration")
    if (export.get("schema") != "adu-motion-video-export/v1" or export.get("output_sha256") != sha(master)
            or export.get("output_size_bytes") != master.stat().st_size
            or type(frames) is not int or frames < 1 or type(fps) is not int or not 1 <= fps <= 120
            or type(duration) not in (int, float) or not math.isfinite(duration)
            or abs(duration - frames / fps) > 1e-8
            or clock.get("frames") != export.get("frames") or clock.get("fps") != export.get("fps")
            or type(clock.get("max_error_seconds")) not in (int, float)
            or not math.isfinite(clock["max_error_seconds"]) or not 0 <= clock["max_error_seconds"] <= 2e-6
            or export.get("verification") != "all segment exits + frame counts; concat/mux metadata; every display timestamp; complete media decode"):
        raise ValueError("Recovery master fingerprint or complete frame validation differs")
    hashes = export.get("source_sha256")
    if not isinstance(hashes, dict) or not hashes:
        raise ValueError("Original render source fingerprints are missing")
    for relative, expected in hashes.items():
        name = Path(relative)
        if name.is_absolute() or ".." in name.parts:
            raise ValueError("Invalid render source fingerprint path")
        item = Path(project) / name
        if item.is_symlink() or not item.is_file() or sha(item) != expected:
            raise ValueError("Prepared source changed; retained render cannot be reused")
    audio = export.get("audio_identity")
    if not isinstance(audio, dict) or audio.get("sha256") != sha(Path(project) / "mix.wav"):
        raise ValueError("Prepared mix changed; retained render cannot be reused")
    return export


def _recoverable(root, project, expected):
    for attempt in sorted(root.iterdir(), reverse=True):
        if (attempt.is_symlink() or not attempt.is_dir() or (attempt / "transaction.json").is_symlink()
                or not (attempt / "transaction.json").is_file()):
            continue
        try:
            record = read(attempt / "transaction.json")
        except (ValueError, OSError):
            continue
        if (record.get("schema") != SCHEMA or record.get("status") != "failed"
                or record.get("stage") not in {"brand", "final-check", "publish"}
                or record.get("identity") != expected):
            continue
        try:
            validate_master(project, attempt / "unmarked.mp4", attempt / "unmarked.mp4.manifest.json")
        except (ValueError, OSError, KeyError):
            continue
        return attempt
    return None


def render_export(package, project, output, workers, cache, execute, verify_preview, config):
    """Publish a fresh checked output; retain verified masters for a later attempt."""
    package, project = Path(package), Path(project).resolve()
    output = _new_path(output)
    delivered_manifest = _new_path(Path(str(output) + ".manifest.json"))
    if output.suffix.lower() != ".mp4":
        raise ValueError("Export target must end in .mp4")
    if output.resolve().is_relative_to(project):
        raise ValueError("Final output must be outside the reviewed project; exports are kept internally")
    verify_preview(project)
    from corner_runtime import valid_declaration
    shared = config.get("appliedBy") == "deterministic-renderer"
    if shared and not valid_declaration(read(project / "output-signature.json")):
        raise ValueError("Invalid managed output declaration")
    preflight = brand_preflight(package, project, config)
    expected = identity(package, project, config)
    root = project / "exports"
    if root.is_symlink() or (root.exists() and not root.is_dir()):
        raise ValueError("Export evidence root must be a regular directory")
    root.mkdir(exist_ok=True)
    lock = root / ".render.lock"
    descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.write(descriptor, str(os.getpid()).encode()); os.close(descriptor)
    transaction = root / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex)
    published = []
    record = {"schema": SCHEMA, "id": transaction.name, "status": "running", "stage": "initialization"}
    try:
        recovered = _recoverable(root, project, expected)
        transaction.mkdir()
        record.update(stage="audio", identity=expected, output=str(output),
                      recoveredFrom=recovered.name if recovered else None)
        def stage(value):
            record["stage"] = value; write(transaction / "transaction.json", record)
        write(transaction / "brand-preflight.json", preflight)
        write(transaction / "mark-config.json", config)
        master = transaction / "unmarked.mp4"
        manifest = transaction / "unmarked.mp4.manifest.json"
        if recovered:
            stage("recover")
            shutil.copy2(recovered / master.name, master)
            shutil.copy2(recovered / manifest.name, manifest)
        else:
            from audio_integrity import require_signal,verify_mix
            write(transaction / "voice-integrity.json",require_signal(project / "voice.wav",role="prepared narration"))
            stage("audio"); execute(cache, "audio", project)
            stage("mix"); execute(cache, "mix", project)
            verify_preview(project)
            if identity(package, project, config) != expected:
                raise ValueError("Reviewed input changed during audio preparation")
            stage("render"); execute(cache, "render", project, master, workers)
        from audio_integrity import require_signal,verify_mix
        require_signal(project / "voice.wav",role="prepared narration")
        export = validate_master(project, master, manifest)
        audio_integrity=verify_mix(project / "mix.wav",master)
        write(transaction / "audio-integrity.json",audio_integrity)
        if identity(package, project, config) != expected:
            raise ValueError("Reviewed input changed during rendering")
        from bridge.brand_mark import apply_mark
        stage("brand")
        marked = transaction / "marked.mp4"
        brand_report = transaction / "brand.json"
        if shared:
            from corner_runtime import verify_shared_export
            verify_shared_export(read(manifest), config)
            shutil.copy2(master, marked)
            mark = {"schema":"motiongit.output-signature/2", "appliedBy":"deterministic-renderer", "previewAndExportMatch":True, "secondPassApplied":False, "input_frames":export["frames"], "fps":str(export["fps"]), "complete_decode_verified":True, "audio_stream_copy_verified":True}
            write(brand_report, mark)
        else:
            mark = apply_mark(master, marked, config, package / "brand", brand_report)
        if mark["input_frames"] != export["frames"] or mark["fps"] != str(export["fps"]):
            raise ValueError("Brand input clock differs from the original renderer evidence")
        stage("final-check"); execute(cache, "check", marked)
        verify_preview(project)
        if identity(package, project, config) != expected:
            raise ValueError("Reviewed input changed during final checking")
        final = {"schema": "motiongit-final-export/1", "exportId": transaction.name, "identity": expected,
                 "finalVideoSha256": sha(marked), "finalVideoBytes": marked.stat().st_size,
                 "frames": export["frames"], "fps": export["fps"], "durationSeconds": export["duration"],
                 "renderManifest": {"path": str(manifest), "sha256": sha(manifest)},
                 "renderMaster": {"path": str(master), "sha256": sha(master)},
                 "brandReceipt": {"path": str(brand_report), "sha256": sha(brand_report)},
                 "brandPreflightSha256": sha(transaction / "brand-preflight.json"),
                 "recoveredFrom": record["recoveredFrom"], "ownerEffectsAcceptance": "pending",
                 "completeDecodeVerified": mark["complete_decode_verified"],
                 "audioEncodedPacketsPreserved": mark["audio_stream_copy_verified"],
                 "audioIntegrityVerified": audio_integrity["passed"],
                 "audioIntegrityReceipt": {"path": str(transaction / "audio-integrity.json"),"sha256": sha(transaction / "audio-integrity.json")}}
        write(transaction / "final.json", final)
        stage("publish")
        with output.open("xb") as target, marked.open("rb") as source:
            published.append(output); shutil.copyfileobj(source, target)
        if sha(output) != final["finalVideoSha256"]:
            raise ValueError("Final output changed during publication")
        with delivered_manifest.open("x", encoding="utf-8") as handle:
            published.append(delivered_manifest)
            json.dump(final, handle, ensure_ascii=False, indent=2, allow_nan=False); handle.write("\n")
        record.update(status="complete", stage="complete", finalVideoSha256=final["finalVideoSha256"],
                      finalReceiptSha256=sha(transaction / "final.json"))
        write(transaction / "transaction.json", record)
        print(json.dumps({"video": str(output), "sha256": final["finalVideoSha256"],
                          "manifest": str(delivered_manifest), "exportId": transaction.name,
                          "recoveredFrom": record["recoveredFrom"],
                          "status": "technical-export-owner-effects-review-pending"}, ensure_ascii=False))
        return final
    except Exception as error:
        for item in published:
            item.unlink(missing_ok=True)
        if transaction.is_dir():
            record.update(status="failed", failure={"type": type(error).__name__,
                          "message": "Export failed; original renderer evidence is retained locally"})
            write(transaction / "transaction.json", record)
        raise ValueError("Export failed at " + record.get("stage", "initialization") +
                         "; retained evidence: " + str(transaction)) from None
    finally:
        lock.unlink(missing_ok=True)
