#!/usr/bin/env python3
"""Import one already edited talk video without speech recognition or raw-clip matching.

Writes talk/clip_000/f_*.jpg, talkmap.js, voice.wav and import.json. Replaces
only the empty talkmap.js stub created by pipeline new. Other media are protected.
Does not rewrite the creative timeline in config.js/scenes.js.
"""
import argparse
import json
import math
from pathlib import Path
import shutil
import subprocess
import tempfile
from color_management import image_plan, fingerprint_file, validate_review_evidence


def run(args):
    result = subprocess.run([str(a) for a in args], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f'{args[0]} failed: {result.stderr[-4000:]}')
    return result.stdout


# MOTIONGIT_CONSOLE_EXACT_FRAMES_V1
def exact_input_frame_count(probe, fps, *, packet_loader=None):
    """Ceil the selected A/V endpoints on the output grid using exact fractions.

    Use the first video and audio streams, matching import_talk's 0:v:0/0:a:0
    selection. Preserve its public container origin and nonnegative stream
    offset rule. Do not infer duration from nb_frames, nominal/average FPS, or
    the rounded *_time/duration display fields. A missing duration_ts uses
    integer packet endpoints, preserving the existing Matroska clock fallback.
    Explicitly invalid or unmeasurable timestamps fail instead of authorizing
    source shortening or duplicated frames. packet_loader is a read-only test
    seam: (filename, stream_index) -> a list of packet dictionaries.
    """
    from fractions import Fraction

    if type(fps) is not int or not 1 <= fps <= 120:
        raise ValueError('Exact source clock requires integer output fps 1..120')
    if not isinstance(probe, dict) or not isinstance(probe.get('streams'), list):
        raise ValueError('Exact source clock requires ffprobe streams')

    def integer(value, name):
        if type(value) is int:
            return value
        if isinstance(value, str):
            digits = value[1:] if value.startswith(('+', '-')) else value
            if digits and all('0' <= char <= '9' for char in digits):
                return int(value)
        raise ValueError('Exact source clock needs integer ' + name)

    container = probe.get('format', {})
    if not isinstance(container, dict):
        raise ValueError('Exact source clock requires a format object')
    # Keep the existing common origin rule: missing/empty start_time means 0.
    # Fraction parses the reported decimal without a binary-float conversion.
    origin_value = container.get('start_time') or 0
    if type(origin_value) is not int and not isinstance(origin_value, str):
        raise ValueError('Exact source clock needs a decimal container start_time')
    try:
        origin = Fraction(origin_value)
    except (ValueError, ZeroDivisionError) as exc:
        raise ValueError('Exact source clock has invalid container start_time') from exc

    def load_packets(filename, stream_index):
        import json
        import subprocess
        if not isinstance(filename, str) or not filename:
            raise ValueError('Exact packet clock requires the probed filename')
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-select_streams', str(stream_index),
             '-show_packets', '-show_entries', 'packet=pts,duration', '-of', 'json', filename],
            capture_output=True, text=True, encoding='utf-8', errors='replace', shell=False)
        if result.returncode:
            detail = (result.stderr or result.stdout or '').strip()[-4000:]
            raise ValueError('Exact source packet probe failed: ' + detail)
        try:
            return json.loads(result.stdout)['packets']
        except (ValueError, KeyError, TypeError) as exc:
            raise ValueError('Exact source packet probe returned invalid JSON') from exc

    endpoints = []
    for role in ('video', 'audio'):
        stream = next((item for item in probe['streams']
                       if isinstance(item, dict) and item.get('codec_type') == role), None)
        if stream is None:
            raise ValueError('input needs video and narration audio')
        raw_base = stream.get('time_base')
        if not isinstance(raw_base, str) or raw_base.count('/') != 1:
            raise ValueError('Exact source clock needs rational ' + role + '.time_base')
        top, bottom = raw_base.split('/')
        numerator = integer(top, role + '.time_base numerator')
        denominator = integer(bottom, role + '.time_base denominator')
        if numerator <= 0 or denominator <= 0:
            raise ValueError('Exact source clock needs positive ' + role + '.time_base')
        time_base = Fraction(numerator, denominator)
        start = integer(stream.get('start_pts'), role + '.start_pts') * time_base
        offset = max(Fraction(0), start - origin)
        if 'duration_ts' in stream:
            duration_ticks = integer(stream['duration_ts'], role + '.duration_ts')
            if duration_ticks <= 0:
                raise ValueError('Exact source clock needs positive ' + role + '.duration_ts')
            endpoint = offset + duration_ticks * time_base
        else:
            stream_index = integer(stream.get('index'), role + '.index')
            if stream_index < 0:
                raise ValueError('Exact source packet clock needs a nonnegative stream index')
            packets = (packet_loader or load_packets)(container.get('filename'), stream_index)
            if not isinstance(packets, list) or not packets:
                raise ValueError('Exact source packet clock has no ' + role + ' packets')
            ends = []
            for packet in packets:
                if not isinstance(packet, dict):
                    raise ValueError('Exact source packet clock needs packet objects')
                pts = integer(packet.get('pts'), role + ' packet.pts')
                duration = integer(packet.get('duration'), role + ' packet.duration')
                if duration <= 0:
                    raise ValueError('Exact source packet clock needs positive packet.duration')
                ends.append((pts + duration) * time_base - origin)
            # Same common-origin/packet-end rule as source_clock, with no float
            # or per-stream timestamp reset. Packet order may be decode order.
            endpoint = offset + max(Fraction(0), max(ends) - offset)
            if endpoint <= offset:
                raise ValueError('Exact source packet clock has no positive ' + role + ' duration')
        endpoints.append(endpoint)

    frame_position = max(endpoints) * fps
    return -(-frame_position.numerator // frame_position.denominator)


def input_timing(probe, fps):
    streams = probe.get('streams', [])
    video = next((s for s in streams if s.get('codec_type') == 'video'), None)
    audio = next((s for s in streams if s.get('codec_type') == 'audio'), None)
    if video is None or audio is None:
        raise ValueError('input needs video and narration audio')
    container = probe.get('format', {})
    from audio_integrity import source_clock
    measured_clock=source_clock(container['filename']) if container.get('filename') else None
    origin = float(container.get('start_time') or 0)
    offset = max(0., float(video.get('start_time') or origin) - origin)
    raw_duration = float(video.get('duration') or
                         (float(container.get('duration') or 0) - offset))
    end = offset + raw_duration
    if measured_clock:
        offset=measured_clock['video']['offsetSeconds'];raw_duration=measured_clock['video']['streamDurationSeconds'];end=measured_clock['video']['endSeconds']
    if not math.isfinite(end) or end <= 0:
        raise ValueError('input video has no finite positive duration')
    audio_end = max(0., float(audio.get('start_time') or origin) - origin) + float(audio.get('duration') or raw_duration)
    if measured_clock:audio_end=measured_clock['audio']['endSeconds']
    if not math.isfinite(audio_end) or audio_end > end + 1/fps + .002:raise ValueError('Source audio extends past the picture; review the complete source rather than silently truncating it')
    count = exact_input_frame_count(probe, fps)
    if count < 1:
        raise ValueError('input video is too short')
    return dict(frames=count, duration=count / fps, videoStartSeconds=offset,
                videoStreamDurationSeconds=raw_duration, videoEndSeconds=end,
                audioStartSeconds=max(0., float(audio.get('start_time') or origin) - origin),
                audioStreamDurationSeconds=float(audio.get('duration') or 0),
                frameResampling='nearest source frame on the output grid; edge padding limited to frame quantization',
                maximumEdgeQuantizationSeconds=1 / fps)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('project', type=Path)
    ap.add_argument('video', type=Path)
    ap.add_argument('--fps', type=int, default=60, help='project frame clock; default 60')
    ap.add_argument('--size', default='720x1280', help='frame box; preserves aspect ratio with padding')
    ap.add_argument('--color-review', type=Path, help='explicit source colour comparison record; never generated automatically')
    ap.add_argument('--repair-mode', choices=['off', 'basic'], default='off')
    ap.add_argument('--edit-map', type=Path, help='Prepared master; ignored when repair-mode=off')
    a = ap.parse_args()
    project, video = a.project.expanduser().resolve(), a.video.expanduser().resolve()
    if not project.is_dir() or not video.is_file(): ap.error('project folder and input video must exist')
    if a.repair_mode == 'basic':
        if a.edit_map is None or a.fps != 60: ap.error('Basic import requires --edit-map and fps=60')
        from repair_talk import install_master
        install_master(a.edit_map, video, project)
        print(json.dumps({'project': str(project), 'cutsApplied': True, 'playbackRateChanged': False}))
        return
    try:
        width, height = map(int, a.size.split('x'))
        if not 1 <= a.fps <= 120 or min(width, height) < 2: raise ValueError()
    except ValueError:
        ap.error('--fps must be 1..120; --size must be positive WIDTHxHEIGHT')
    for tool in ('ffmpeg', 'ffprobe'):
        if not shutil.which(tool): ap.error(f'{tool} is required')
    talk, mapping = project / 'talk', project / 'talkmap.js'
    stub = '// Optional data absent. Generated data may replace this stub.'
    if talk.exists() and (not talk.is_dir() or any(talk.iterdir())): ap.error('talk/ already contains media; import into a fresh project')
    if talk.is_symlink() or mapping.is_symlink(): ap.error('refusing a linked media directory or map')
    if mapping.exists() and mapping.read_text().strip() != stub: ap.error('talkmap.js already contains project data; use a fresh project')
    for name in ('voice.wav', 'import.json'):
        target = project / name
        if target.exists() or target.is_symlink(): ap.error(f'{name} already exists; use a fresh project')
    probe = json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', video]))
    timing = input_timing(probe, a.fps)
    count, duration = timing['frames'], timing['duration']
    color = image_plan(video)
    if a.color_review:
        review = json.loads(a.color_review.read_text())
        validate_review_evidence(color, review)
        color['reviewEvidence'] = review
    if timing['videoStartSeconds'] > 1 / a.fps + 1e-5:
        ap.error('video starts more than one output frame after the input clock; provide an aligned clip rather than padding a frozen presenter')
    report = dict(source=str(video), fps=a.fps, **timing, color=color,
                  frame_width=width, frame_height=height, subtitles='not generated',
                  next_step='Set CONFIG.demo=false, CONFIG.fps=fps, CONFIG.end=duration; author scenes/race/captions for this clip. No creative timeline was rewritten.')
    with tempfile.TemporaryDirectory(prefix='adu-talk-import-') as temporary:
        work = Path(temporary)
        sequence = work / 'talk' / 'clip_000'
        sequence.mkdir(parents=True)
        vf = (f'fps={a.fps}:start_time=0,scale={width}:{height}:force_original_aspect_ratio=decrease:flags=lanczos,'
              f'pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,tpad=stop_mode=clone:stop_duration={1/a.fps},' + color['filter'])
        run(['ffmpeg', '-v', 'error', '-n', '-copyts', '-start_at_zero', '-i', video, '-map', '0:v:0', '-vf', vf,
             '-frames:v', count, '-q:v', '3', sequence / 'f_%05d.jpg'])
        if len(list(sequence.glob('f_*.jpg'))) != count: raise RuntimeError('Extracted frame count mismatch')
        run(['ffmpeg', '-v', 'error', '-n', '-copyts', '-start_at_zero', '-i', video, '-map', '0:a:0', '-vn',
             '-af', f'aresample=48000:async=1:first_pts=0:max_soft_comp=0:min_hard_comp=0.001,apad,atrim=duration={duration}', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_f64le', work / 'voice.wav'])
        data = 'const TALKF=["clip_000"];const TALKMAP=' + json.dumps([[0, i+1] for i in range(count)], separators=(',', ':')) + ';\n'
        identity = fingerprint_file(video)
        if identity != dict(sha256=color['source_sha256'], sizeBytes=color['source_size_bytes']):
            raise ValueError('Input media changed during import; discard this extraction and import a stable source')
        (work / 'talkmap.js').write_text(data)
        (work / 'import.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        # Preflight again before publishing; old media are never replaced.
        if talk.exists() and any(talk.iterdir()): raise RuntimeError('talk/ changed while importing')
        if mapping.exists() and mapping.read_text().strip() != stub: raise RuntimeError('talkmap.js changed while importing')
        created = []
        talk_was_absent = not talk.exists()
        try:
            talk.mkdir(exist_ok=True)
            created.append(talk / 'clip_000')
            shutil.copytree(sequence, talk / 'clip_000')
            for name in ('voice.wav', 'import.json'):
                with (project / name).open('xb') as dst, (work / name).open('rb') as src:
                    created.append(project / name)
                    shutil.copyfileobj(src, dst)
            mapping.write_text(data)
        except Exception:
            for item in reversed(created):
                if item.is_dir(): shutil.rmtree(item)
                else: item.unlink(missing_ok=True)
            if talk_was_absent and talk.is_dir() and not any(talk.iterdir()): talk.rmdir()
            raise
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, ValueError) as exc:
        raise SystemExit(f'Import failed: {exc}') from exc
