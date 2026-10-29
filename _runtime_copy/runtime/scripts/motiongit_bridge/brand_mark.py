#!/usr/bin/env python3
"""Final-pass MotionGit mark. Requires FFmpeg/FFprobe; content labels use the existing native Pillow dependency.

Safe corners are declared, never inferred from a person's pixels. Config example:
{"safe_corners":{"right":{},"left":{}}, "blocked_intervals":[
  {"start_s":8,"end_s":14,"corners":["right"],"reason":"title"}]}
Optional numeric x/y are reference pixels (default short side 1080); omitted
coordinates use the specified 40px side / 36px top inset. Intervals are half-open.
"""
from __future__ import annotations

import argparse
from fractions import Fraction
import hashlib
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

BRAND_SHA256 = "c6b67b78935dec77fb05fe736a5a848b6d61ed7e3a3d86b217bb6694889650cf"
# Brand Pack 2 (2026-10-05): six-second path-reveal marks. "lighter" is the lifted badge for dark
# templates; "path" is the original badge for light templates. Square, VP9 alpha, 512 px, 30 fps.
BRAND_VARIANTS = {
    "lighter": ("motiongit-mark-lighter.webm", "fd747c524249b737527946b798547e0e7b77e913171fc4b82e6d12192ae7d4bb"),
    "path": ("motiongit-mark-path.webm", "9bbdac16470dd7af5f6ba9b52624fe581fbfd4ecc2e3921858e36a8948df100a"),
}
BRAND_SHAPES = {"square": BRAND_VARIANTS, "circle": {
    "lighter": ("motiongit-circle-lighter.webm", "1a4dc17a2ea86f4cf6b2745b3ee91d89dbae061e812cf78691d2680362776e0d"),
    "path": ("motiongit-circle-path.webm", "9e9212233683817eef1ed474a192fbf797700f499839f7c7a3e2b96e1fe5ba8e"),
}}
KNOWN_BRAND_SHA256 = {BRAND_SHA256, *(digest for variants in BRAND_SHAPES.values() for _, digest in variants.values())}


class MarkError(ValueError):
    """An explicit safety, clock, or encoding failure."""


def _number(value, name):
    if isinstance(value, bool):
        raise MarkError(f"{name} must be a finite number")
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise MarkError(f"{name} must be a finite number") from exc
    if not math.isfinite(result):
        raise MarkError(f"{name} must be a finite number")
    return result


def _ceil_frame(seconds, rate):
    n = Fraction(str(seconds)) * rate
    return -(-n.numerator // n.denominator)


def schedule_marks(duration_s, fps, width, height, config):
    """Return frame-aligned slots; raise when a due mark has no safe gap.

    A mark is due only when its entire 5.5-second interval fits in the video.
    A blocked due mark moves forward to the first safe interval in its corner.
    """
    duration = _number(duration_s, "duration_s")
    try:
        rate = Fraction(str(fps))
    except (ValueError, ZeroDivisionError) as exc:
        raise MarkError("fps must be a positive rational") from exc
    if rate <= 0 or duration <= 0 or width <= 0 or height <= 0:
        raise MarkError("duration, fps, width and height must be positive")
    total_frames = math.floor(Fraction(str(duration)) * rate + Fraction(1, 100000))
    mark_frames = _ceil_frame(5.5, rate)
    fade_frames = _ceil_frame(0.4, rate)
    safe = config.get("safe_corners", {})
    if isinstance(safe, list):
        safe = {corner: {} for corner in safe}
    if not isinstance(safe, dict):
        raise MarkError("safe_corners must declare right/left as objects or a list")
    ref = config.get("reference_size", [1920, 1080])
    if not isinstance(ref, list) or len(ref) != 2:
        raise MarkError("reference_size must be [width, height]")
    ref_short = min(_number(v, "reference_size") for v in ref)
    if ref_short <= 0:
        raise MarkError("reference_size must be positive")
    scale = min(width, height) / ref_short
    size = max(1, round(min(width, height) * 0.052))
    corners = {}
    for corner, declaration in safe.items():
        if corner not in ("right", "left") or not isinstance(declaration, dict):
            raise MarkError("safe_corners may only declare right/left objects")
        x = round(_number(declaration.get("x", 40 if corner == "left" else (width - size) / scale - 40), "corner.x") * scale)
        y = round(_number(declaration.get("y", 36), "corner.y") * scale)
        if x < 0 or y < 0 or x + size > width or y + size > height:
            raise MarkError(f"declared {corner} corner lies outside the frame")
        corners[corner] = (x, y)
    if not corners:
        raise MarkError("declare at least one safe corner before rendering")
    blocks = []
    for block in config.get("blocked_intervals", []):
        start = _number(block.get("start_s"), "blocked.start_s")
        end = _number(block.get("end_s"), "blocked.end_s")
        affected = block.get("corners", ["right", "left"])
        if start < 0 or end <= start or not isinstance(affected, list) or not affected or any(c not in ("right", "left") for c in affected):
            raise MarkError("invalid blocked interval (start/end/corners)")
        blocks.append((math.floor(Fraction(str(start)) * rate), _ceil_frame(end, rate), affected, str(block.get("reason", "occupied"))))
    for region in config.get("blocked_regions", []):
        rx, ry, rw, rh = (_number(region.get(k), f"region.{k}") * scale for k in ("x", "y", "width", "height"))
        if rw <= 0 or rh <= 0:
            raise MarkError("blocked region dimensions must be positive")
        affected = [c for c, (x, y) in corners.items() if x < rx + rw and x + size > rx and y < ry + rh and y + size > ry]
        if affected:
            start = _number(region.get("start_s", 0), "region.start_s")
            end = _number(region.get("end_s", duration), "region.end_s")
            if start < 0 or end <= start:
                raise MarkError("invalid blocked region time interval")
            blocks.append((math.floor(Fraction(str(start)) * rate), _ceil_frame(end, rate), affected, str(region.get("reason", "occupied region"))))
    if duration < 14:
        end=duration-min(.1,duration*.05)
        mark_frames=max(1,math.floor((end-duration*.5)*float(rate)))
        fade_frames=max(1,min(fade_frames,mark_frames//3))
        desired=[_ceil_frame(duration*.5,rate)]
    else:
        desired=[_ceil_frame(8+30*i,rate) for i in range(math.ceil(duration/30)) if _ceil_frame(8+30*i,rate)+mark_frames<=total_frames]
    events = []
    previous_end = 0
    policy = "right"  # Managed official output slot is always the top-right.
    if policy not in ("alternate", "right", "left"):
        raise MarkError("cornerPolicy must be alternate, right or left")
    for index, nominal in enumerate(desired):
        corner = policy if policy != "alternate" else "right" if index % 2 == 0 else "left"
        if corner not in corners:
            raise MarkError(f"due {corner} mark at {float(nominal / rate):.3f}s has no declared safe corner")
        start = max(nominal, previous_end)
        avoided = []
        while True:
            overlaps = [b for b in blocks if corner in b[2] and start < b[1] and start + mark_frames > b[0]]
            if not overlaps:
                break
            avoided.extend(b[3] for b in overlaps)
            start = max(b[1] for b in overlaps)
        if start + mark_frames > total_frames:
            raise MarkError(f"no safe 5.5s gap for {corner} mark due at {float(nominal / rate):.3f}s; occupied: {', '.join(sorted(set(avoided))) or 'previous mark'}")
        x, y = corners[corner]
        end = start + mark_frames
        events.append({"corner": corner, "nominal_start_frame": nominal, "start_frame": start, "end_frame_exclusive": end, "start_s": float(start / rate), "end_s": float(end / rate), "duration_frames": mark_frames, "fade_frames": fade_frames, "x": x, "y": y, "size_px": size, "alpha": 0.52, "avoided": sorted(set(avoided))})
        previous_end = end
    return events


def _run(command, *, binary=False):
    try:
        result = subprocess.run(command, check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except OSError as exc:
        raise MarkError(f"cannot execute {Path(command[0]).name}: {exc.strerror}") from exc
    if result.returncode:
        message = result.stderr.decode("utf-8", "replace")[-3000:]
        raise MarkError(f"{Path(command[0]).name} failed: {message}")
    return result.stdout if binary else result.stdout.decode("utf-8", "replace")


def probe_video(path, ffprobe="ffprobe"):
    data = json.loads(_run([ffprobe, "-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", str(path)]))
    videos = [s for s in data["streams"] if s["codec_type"] == "video" and not s.get("disposition", {}).get("attached_pic")]
    if len(videos) != 1:
        raise MarkError("expected exactly one primary video stream")
    video = videos[0]
    rate = Fraction(video["avg_frame_rate"])
    if rate <= 0 or Fraction(video["r_frame_rate"]) != rate:
        raise MarkError("final-pass mark requires a constant frame-rate master")
    frames = int(video.get("nb_read_frames") or video.get("nb_frames") or 0)
    if not frames:
        raise MarkError("could not count master frames")
    if abs(float(video.get("start_time", 0))) > 1 / float(rate):
        raise MarkError("master must start at zero on its full-film clock")
    if video.get("color_transfer") in ("smpte2084", "arib-std-b67") or video.get("color_primaries") == "bt2020":
        raise MarkError("HDR master requires an explicit SDR conversion before the final-pass mark")
    return {"width": video["width"], "height": video["height"], "fps": str(rate), "frames": frames, "duration_s": float(frames / rate), "color_space": video.get("color_space", "unknown"), "color_transfer": video.get("color_transfer", "unknown"), "color_primaries": video.get("color_primaries", "unknown"), "color_range": video.get("color_range", "unknown"), "audio_streams": [s for s in data["streams"] if s["codec_type"] == "audio"]}


def _audio_hashes(path, streams, ffmpeg):
    results = []
    for ordinal, stream in enumerate(streams):
        # FFmpeg's hash muxer hashes copied encoded packets, not a new encoding.
        digest = _run([ffmpeg, "-v", "error", "-i", str(path), "-map", f"0:a:{ordinal}", "-c:a", "copy", "-f", "hash", "-hash", "sha256", "-"]).strip().split("=", 1)[-1].lower()
        results.append({"ordinal": ordinal, "codec": stream["codec_name"], "sha256_encoded_packets": digest})
    return results


def apply_mark(input_path, output_path, config, brand_path=None, report_path=None, ffmpeg="ffmpeg", ffprobe="ffprobe", no_mark=False):
    """Encode to a fresh file, verify film frames and copied audio, then commit it.

    A report includes the declaration and measurable technical checks. It does
    not claim a human inspection of HUD/person/subtitle content.
    """
    source, target = Path(input_path).resolve(), Path(output_path).resolve()
    if source == target or target.exists():
        raise MarkError("output must be a new path; the master is never overwritten")
    if not source.is_file() or not target.parent.is_dir():
        raise MarkError("master and output parent must already exist")
    report_file = Path(report_path) if report_path else target.parent / "mark-report.json"
    if report_file.resolve() in (source, target) or report_file.exists():
        raise MarkError("report must be a new path distinct from the video")
    before = probe_video(source, ffprobe)
    events = [] if no_mark else schedule_marks(before["duration_s"], before["fps"], before["width"], before["height"], config)
    shape = config.get("shape", "square")
    if shape not in BRAND_SHAPES:
        raise MarkError("shape must be square or circle")
    approved_variants = BRAND_SHAPES[shape]
    variant = config.get("variant")
    declared=config.get("branding",{}).get("variant")
    if declared is not None:
        if declared not in ("light","dark","lighter","path"):raise MarkError("Invalid fixed branding variant")
        variant="path" if declared in ("dark","path") else "lighter"
    if variant is not None and variant not in BRAND_VARIANTS:
        raise MarkError("variant must be lighter (dark templates) or path (light templates)")
    # Fixed declared design choice; historical auto means compatible dark default.
    # No decoded frame or screenshot is used to choose the mark asset.
    tone = config.get("backgroundTone")
    if variant is None:
        variant = "path" if tone == "light" else "lighter"
    tone = "light" if variant == "path" else "dark"
    brands = []
    brand_digest = None
    digests=[]
    for event in events:
        selected=variant
        if shape == "circle" and selected is None:
            raise MarkError("circle marks require backgroundTone or variant")
        default = approved_variants[selected][0] if selected else "motiongit-mark.webm"
        base=Path(brand_path) if brand_path else Path(__file__).resolve().parent.parent / "brand"
        brand=base/default if base.is_dir() else base
        brand_digest = hashlib.sha256(brand.read_bytes()).hexdigest() if brand.is_file() else None
        expected = approved_variants[selected][1] if selected else None
        if brand_digest not in KNOWN_BRAND_SHA256 or (expected and brand_digest != expected):
            raise MarkError("MotionGit VP9-alpha mark is missing or not an approved brand file")
        event['brand_variant']=selected;event['brand_shape']=shape;event['brand_sha256']=brand_digest
        brands.append(brand);digests.append(brand_digest)
    brand_digest=digests[0] if digests and len(set(digests))==1 else None
    audio_before = _audio_hashes(source, before["audio_streams"], ffmpeg)
    with tempfile.TemporaryDirectory(prefix="motiongit-mark-") as scratch:
        encoded = Path(scratch) / target.name
        # The adjacent content title is retired even when old config contains it.
        header=None
        labels=[]
        if not events and not labels:
            shutil.copyfile(source, encoded)
        else:
            command = [ffmpeg, "-v", "error", "-nostdin", "-n", "-filter_complex_threads", "1", "-threads", "1", "-i", str(source)]
            for brand in brands:
                command.extend(["-c:v", "libvpx-vp9", "-i", str(brand)])
            for label in labels:
                command.extend(['-loop','1','-framerate',before['fps'],'-i',str(label['path'])])
            filters = []
            # Give each mark the master's time base before the global offset.
            rate = Fraction(before["fps"])
            clock = f"{rate.numerator}/{rate.denominator}"
            filters.append("[0:v:0]setpts=PTS-STARTPTS,format=yuv420p[base]")
            previous = "base"
            for i, event in enumerate(events, 1):
                start, end = event["start_s"], event["end_s"]
                parent = event.get("parent_interval_frames", [event["start_frame"], event["end_frame_exclusive"]])
                animation_start = parent[0] / float(rate)
                length = (parent[1] - parent[0]) / float(rate)
                fade = event.get("parent_fade_frames", event["fade_frames"]) / float(rate)
                speed = length / 5.5
                filters.append(f"[{i}:v]trim=duration=5.5,setpts=(PTS-STARTPTS)*{speed:.12f},fps={clock},scale={event['size_px']}:{event['size_px']}:flags=lanczos,format=rgba,fade=t=in:st=0:d={fade:.12f}:alpha=1,fade=t=out:st={length - fade:.12f}:d={fade:.12f}:alpha=1,colorchannelmixer=aa=0.52,setpts=PTS+{animation_start:.12f}/TB[mark{i}]")
                # enable's half-open interval explicitly prevents EOF repeat/tail.
                filters.append(f"[{previous}][mark{i}]overlay=x={event['x']}:y={event['y']}:eof_action=pass:repeatlast=0:enable='gte(t,{start:.12f})*lt(t,{end:.12f})'[v{i}]")
                previous = f"v{i}"
            for j,label in enumerate(labels):
                index=len(events)+1+j;start=label['start_s'];length=label['end_s']-start;fade=label['fade']
                filters.append(f"[{index}:v]trim=duration={length:.12f},setpts=PTS-STARTPTS,format=rgba,fade=t=in:st=0:d={fade:.12f}:alpha=1,fade=t=out:st={length-fade:.12f}:d={fade:.12f}:alpha=1,setpts=PTS+{start:.12f}/TB[label{j}]")
                filters.append(f"[{previous}][label{j}]overlay=x={label['x']}:y={label['y']}:eof_action=pass:repeatlast=0:enable='gte(t,{start:.12f})*lt(t,{label['end_s']:.12f})'[labelled{j}]")
                previous=f'labelled{j}'
            # The finite base video controls video EOF. A video frame limit can
            # stop muxing before the last copied audio packet when audio ends
            # slightly after the last frame. Verify frames below instead of
            # imposing a limit that can truncate an independent audio stream.
            command.extend(["-filter_complex", ";".join(filters), "-map", f"[{previous}]", "-map", "0:a?", "-map_metadata", "0", "-c:v", "libx264", "-threads:v", "1", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-fps_mode", "passthrough", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv", "-c:a", "copy", "-movflags", "+faststart", str(encoded)])
            _run(command)
        after = probe_video(encoded, ffprobe)
        audio_after = _audio_hashes(encoded, after["audio_streams"], ffmpeg)
        if before["frames"] != after["frames"] or before["fps"] != after["fps"]:
            raise MarkError("final-pass encoding changed the full-film frame clock")
        if audio_before != audio_after:
            raise MarkError("copied audio packet SHA256 differs from the master")
        _run([ffmpeg, "-v", "error", "-i", str(encoded), "-f", "null", "-"])
        report = {"schema": "motiongit-mark-report/1", "status": "author-debug-unmarked" if no_mark else "marked" if events else "short-film-no-mark", "input_frames": before["frames"], "output_frames": after["frames"], "fps": before["fps"], "duration_s": before["duration_s"], "marks": events, "brand_sha256": brand_digest, "brand_variant": variant, "alpha_decoder": "libvpx-vp9" if events else None, "font_independent": True, "clock_verified": True, "complete_decode_verified": True, "audio_stream_copy_verified": audio_before == audio_after, "audio_streams": audio_after, "color": {k: after[k] for k in ("color_space", "color_transfer", "color_primaries", "color_range")}, "safe_corner_declaration": config, "content_obstruction_check": "declared safe coordinates and blocked intervals; human frame inspection still required"}
        report.update(font_independent=not bool(labels),contentHeader=header, labelPolicy='disabled', labelWindows=[{k:v for k,v in item.items() if k!='path'} for item in labels], pixelReads=0, samplingScreenshots=0, tonePolicy='fixed', previewAndExportMatch=False)
        # Exclusive creation preserves another writer's files even after checks.
        with target.open("xb") as handle, encoded.open("rb") as data:
            shutil.copyfileobj(data, handle)
        try:
            with report_file.open("x", encoding="utf-8") as handle:
                json.dump(report, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
        except Exception:
            target.unlink()
            raise
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--config", required=True)
    parser.add_argument("--brand")
    parser.add_argument("--report")
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--ffprobe", default="ffprobe")
    parser.add_argument("--no-mark", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    try:
        config = json.loads(Path(args.config).read_text(encoding="utf-8"))
        result = apply_mark(args.input, args.output, config, args.brand, args.report, args.ffmpeg, args.ffprobe, args.no_mark)
        print(json.dumps({"status": result["status"], "marks": result["marks"]}, ensure_ascii=False))
        return 0
    except (MarkError, OSError, ValueError) as exc:
        print(f"MotionGit mark: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
