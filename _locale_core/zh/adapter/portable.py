#!/usr/bin/env python3
"""Shell-free host for the locked template-04 production commands.

The native pack stays byte-for-byte frozen. Runtime1.0.1 carries the documented font subset selection patch. This host calls
their Python/Node entry points directly on Windows and macOS.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import math
import tempfile
from datetime import datetime, timezone
import json
import ntpath
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import uuid


def venv_python(runtime, *, windows=None):
    windows = os.name == 'nt' if windows is None else windows
    return Path(runtime) / '.venv' / ('Scripts/python.exe' if windows else 'bin/python')


def npm_command(*, which=None):
    """Run npm's JS entry with Node, including Windows .cmd installations.

    Never execute a .cmd/.bat through a shell or interpolate user paths.
    Official Node installers and ordinary npm global installs are supported.
    """
    which = shutil.which if which is None else which
    node, npm = which('node'), which('npm')
    if not node or not npm:
        raise ValueError('Install Node.js with npm and put them on PATH')
    npm_path = Path(npm).resolve()
    candidates = [npm_path] if npm_path.suffix.lower() in {'.js', '.mjs'} else []
    for base in [npm_path.parent, Path(node).resolve().parent]:
        candidates += [base / 'node_modules/npm/bin/npm-cli.js',
                       base / '../lib/node_modules/npm/bin/npm-cli.js']
    cli = next((file.resolve() for file in candidates if file.is_file()), None)
    if cli is None:
        raise ValueError('npm JS entry not found next to Node/npm; use the standard Node.js installation')
    return [node, str(cli)]


def windows_browser_candidates(environ):
    """Keep Windows drive and separator semantics even in host-side tests."""
    env = {key.upper(): value for key, value in environ.items()}
    roots = [env.get(key) for key in ['PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA']]
    return [ntpath.join(root, suffix) for suffix in
            [r'Google\Chrome\Application\chrome.exe', r'Microsoft\Edge\Application\msedge.exe']
            for root in roots if root]


def host_environment(runtime):
    from run import environment
    env = environment()
    # Trusted values are derived here, never accepted as ambient overrides.
    env['ADU_MOTION_VIDEO_ROOT'] = str(runtime)
    env['ADU_PYTHON'] = sys.executable
    env['NODE_PATH'] = str(runtime / 'node_modules')
    if os.name == 'nt' and not env.get('CHROME'):
        browser = next((f for f in windows_browser_candidates(env) if Path(f).is_file()), None)
        if browser:
            env['CHROME'] = browser
    return env


def run(command, runtime, *, capture=False, forward=False):
    # MOTIONGIT_CAPTURED_DIAGNOSTICS_V2: preserve both bounded failed-child streams.
    if capture and forward:
        raise ValueError('Choose captured text or byte-preserving forwarded output')
    output = dict(capture_output=capture or forward)
    if not forward:
        output.update(text=True, encoding='utf-8', errors='replace')
    try:
        result = subprocess.run(list(map(str, command)), check=True, cwd=runtime,
                                env=host_environment(runtime), shell=False, **output)
    except subprocess.CalledProcessError as error:
        if capture or forward:
            streams = [value.decode('utf-8', errors='replace') if isinstance(value, bytes) else value
                       for value in (error.stderr, error.stdout) if value]
            detail = '\n'.join(streams).strip()[-6000:]
            if detail:
                raise ValueError(f'Command failed (exit {error.returncode}):\n{detail}') from error
        raise
    if forward:
        # The stills CLI keeps the exact successful bytes on their original streams.
        sys.stdout.buffer.write(result.stdout or b'')
        sys.stderr.buffer.write(result.stderr or b'')
        sys.stdout.flush()
        sys.stderr.flush()
        return ''
    return result.stdout.strip() if capture else ''


def py(runtime, name, *args, capture=False, audio=False):
    interpreter = venv_python(runtime) if audio else Path(sys.executable)
    if not interpreter.is_file():
        raise ValueError('Python dependency environment is missing; run setup explicitly')
    if name == 'build_macro_project.py':
        from face_runtime_dependencies import check_face_runtime
        check_face_runtime(interpreter, env=host_environment(runtime))
    script = runtime / 'scripts' / name
    return run([interpreter, script, *args], runtime, capture=capture)


def node(runtime, name, *args, capture=False, forward=False):
    executable = shutil.which('node')
    if not executable:
        raise ValueError('Node.js is missing from PATH')
    return run([executable, runtime / 'scripts' / name, *args], runtime, capture=capture, forward=forward)



def crop_geometry(width,height,crop):
    """A normalized source window, constrained to the 720:1280 box ratio."""
    if not isinstance(crop,dict) or set(crop)!={'cx','cy','h'} or any(type(v) not in (float,int) or not math.isfinite(v) or not 0<v<=1 for v in crop.values()):
        raise ValueError('Crop requires finite normalized cx/cy/h values in (0,1]')
    if min(width,height)<2:raise ValueError('Source crop requires a positive frame size')
    ch=max(2,min(height//2*2,round(height*crop['h']/2)*2))
    cw=max(2,round(ch*720/1280/2)*2)
    if cw>width:
        cw=width//2*2;ch=max(2,min(height//2*2,round(cw*1280/720/2)*2))
    x=max(0,min(width-cw,round(width*crop['cx']-cw/2)))//2*2
    y=max(0,min(height-ch,round(height*crop['cy']-ch/2)))//2*2
    return {'x':x,'y':y,'width':cw,'height':ch,'source_width':width,'source_height':height,'effective_cx':(x+cw/2)/width,'effective_cy':(y+ch/2)/height,'effective_h':ch/height,'output_width':720,'output_height':1280}


def import_talk_crop(runtime,project,video,crop):
    """Reuse frozen timing/color policy; extract the cropped frame sequence once."""
    project,video=Path(project).resolve(),Path(video).resolve()
    if not project.is_dir() or not video.is_file():raise ValueError('Project and presenter input must exist')
    mapping=project/'talkmap.js';stub='// Optional data absent. Generated data may replace this stub.'
    if mapping.is_symlink() or not mapping.is_file() or mapping.read_text().strip()!=stub:raise ValueError('Cropped import needs a fresh talk-map stub')
    if any((project/n).exists() or (project/n).is_symlink() for n in ('talk','voice.wav','import.json')):raise ValueError('Cropped import never replaces existing media')
    # Only the verified cache is imported; the frozen engine source stays unchanged.
    scripts=runtime/'scripts';sys.path.insert(0,str(scripts));sys.dont_write_bytecode=True
    spec=importlib.util.spec_from_file_location('motiongit_locked_talk_import',scripts/'import_talk.py')
    helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
    probe=json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',video],runtime,capture=True))
    timing=helper.input_timing(probe,60)
    if timing['videoStartSeconds']>1/60+1e-5:raise ValueError('Presenter input must be aligned to the output clock')
    source=next(s for s in probe['streams'] if s.get('codec_type')=='video')
    rotation=next((item.get('rotation') for item in source.get('side_data_list',[]) if item.get('rotation') is not None),source.get('tags',{}).get('rotate',0))
    rotation=float(rotation)
    if not math.isfinite(rotation) or abs(rotation/90-round(rotation/90))>1e-6:raise ValueError('Presenter crop supports only orthogonal display rotation')
    width,height=source['width'],source['height']
    if round(rotation/90)%2:width,height=height,width
    geometry=crop_geometry(width,height,crop);geometry['display_rotation_degrees']=rotation; color=helper.image_plan(video)
    frames=timing['frames'];duration=timing['duration']
    report=dict(source=str(video),fps=60,**timing,color=color,frame_width=720,frame_height=1280,presenterCrop=dict(crop),crop=geometry,frameExtractionPasses=1,subtitles='not generated',audioProcessing='original frozen narration extraction; crop changes video only')
    with tempfile.TemporaryDirectory(prefix='motiongit-cropped-presenter-') as temporary:
        work=Path(temporary);sequence=work/'talk/clip_000';sequence.mkdir(parents=True)
        vf=(f"fps=60:start_time=0,crop={geometry['width']}:{geometry['height']}:{geometry['x']}:{geometry['y']},scale=720:1280:flags=lanczos,tpad=stop_mode=clone:stop_duration={1/60},"+color['filter'])
        run(['ffmpeg','-v','error','-n','-copyts','-start_at_zero','-i',video,'-map','0:v:0','-vf',vf,'-frames:v',frames,'-q:v','3',sequence/'f_%05d.jpg'],runtime)
        if len(list(sequence.glob('f_*.jpg')))!=frames:raise ValueError('Cropped presenter frame count differs from the original clock')
        run(['ffmpeg','-v','error','-n','-copyts','-start_at_zero','-i',video,'-map','0:a:0','-vn','-af',f'aresample=48000:async=1:first_pts=0:max_soft_comp=0:min_hard_comp=0.001,apad,atrim=duration={duration}','-ar','48000','-ac','2','-c:a','pcm_f64le',work/'voice.wav'],runtime)
        if helper.fingerprint_file(video)!={'sha256':color['source_sha256'],'sizeBytes':color['source_size_bytes']}:raise ValueError('Presenter input changed during cropped import')
        report['voiceWavSha256']=hashlib.sha256((work/'voice.wav').read_bytes()).hexdigest()
        data='const TALKF=["clip_000"];const TALKMAP='+json.dumps([[0,i+1] for i in range(frames)],separators=(',',':'))+';\n'
        (work/'import.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        if mapping.read_text().strip()!=stub or any((project/n).exists() for n in ('talk','voice.wav','import.json')):raise ValueError('Project changed during cropped import')
        shutil.copytree(work/'talk',project/'talk')
        for name in ('voice.wav','import.json'):
            with (project/name).open('xb') as target,(work/name).open('rb') as sourcefile:shutil.copyfileobj(sourcefile,target)
        mapping.write_text(data,encoding='utf-8')
    print(json.dumps({'presenterCrop':crop,'crop':geometry,'frames':frames,'duration_s':duration,'voiceWavSha256':report['voiceWavSha256'],'frameExtractionPasses':1},ensure_ascii=False))
    return report


def setup(runtime):
    run([*npm_command(), 'ci', '--prefix', runtime], runtime)
    from face_runtime_dependencies import create_face_venv
    create_face_venv(runtime / '.venv', env=host_environment(runtime))
    run([venv_python(runtime), '-m', 'pip', 'install', '--only-binary=:all:',
         '-r', runtime / 'requirements-runtime.txt'], runtime)
    from face_runtime_dependencies import repair_face_runtime
    repair_face_runtime(venv_python(runtime), env=host_environment(runtime), requirements=runtime / 'requirements-runtime.txt')
    print('Locked dependencies installed in this new host-specific cache. No browser or FFmpeg downloaded.')


def doctor(runtime):
    failures = []
    def report(name, work):
        try:
            detail = work()
            print('OK ', name + ':', detail)
        except (ValueError, OSError, subprocess.CalledProcessError) as exc:
            failures.append(name)
            print('MISSING ', name + ':', str(exc))
    def python_version():
        if sys.version_info < (3, 11):
            raise ValueError('Python 3.11+ required; face setup uses an isolated compatible Python 3.11, 3.12 or 3.13')
        return sys.version.split()[0]
    def node_version():
        version = run(['node', '--version'], runtime, capture=True)
        if int(version.lstrip('v').split('.')[0]) < 18:
            raise ValueError('Node.js 18+ required')
        return version
    report('Python', python_version)
    report('Node', node_version)
    report('npm', lambda: run([*npm_command(), '--version'], runtime, capture=True))
    for tool in ['ffmpeg', 'ffprobe']:
        report(tool, lambda tool=tool: run([tool, '-version'], runtime, capture=True).splitlines()[0])
    report('H.264 encoder', lambda: require_x264(runtime))
    report('Color conversion', lambda: py(runtime, 'color_management.py', '--export-plan', capture=True))
    browser_js = "import {chrome} from './scripts/chrome.mjs'; console.log(chrome());"
    report('Browser', lambda: run(['node', '--input-type=module', '-e', browser_js], runtime, capture=True))
    report('Playwright', lambda: run(['node', '-e', "console.log(require('playwright-core/package.json').version)"], runtime, capture=True))
    report('Audio libraries', lambda: run([venv_python(runtime), '-c',
           'import numpy,PIL,scipy,cv2; print("ready")'], runtime, capture=True))
    from face_runtime_dependencies import check_face_runtime
    report('Fixed face detector', lambda: str(check_face_runtime(venv_python(runtime), env=host_environment(runtime))))
    from run import font_preflight
    report('Bundled portable fonts', lambda: str(font_preflight()['id']))
    print('Host:', sys.platform, '; native Python/Node entry; no Bash, WSL or Apple fonts required.')
    print('Normal production reuses or requests the actual video and matching SRT. Demo requires explicit opt-in.')
    if failures:
        raise ValueError('Missing requirements: ' + ', '.join(failures))


def require_x264(runtime):
    if 'libx264' not in run(['ffmpeg', '-hide_banner', '-encoders'], runtime, capture=True):
        raise ValueError('FFmpeg must include libx264')
    return 'libx264 available'


def probe_end(runtime, project):
    data = json.loads(node(runtime, 'render_project.mjs', project / 'index.html', '--probe', capture=True))
    end = data.get('end')
    import math
    if type(end) not in (float, int) or not math.isfinite(end) or end <= 0:
        raise ValueError('Native END must be finite and positive')
    return end


def mix(runtime, project):
    end = probe_end(runtime, project)
    helper = project / 'audio_runtime/mix_recipe.py'
    if not helper.is_file():
        helper = runtime / 'scripts/mix_recipe.py'
    def recipe(command, *args):
        return run([sys.executable, helper, command, project, *args], runtime, capture=True)
    volume = recipe('volume')
    voice = recipe('voice')
    if voice == 'file':
        if not (project / 'voice.wav').is_file():
            raise ValueError('Missing actual voice.wav')
        voice_args = ['-i', project / 'voice.wav']
    elif voice == 'none':
        voice_args = ['-f', 'lavfi', '-t', end, '-i', 'anullsrc=r=48000:cl=stereo']
    else:
        raise ValueError('Unsupported voice mode')
    for name in ['bgm.wav', 'sfx.wav']:
        if not (project / name).is_file():
            raise ValueError('Missing ' + name)
    show = (['-i', project / 'showaudio.wav'] if (project / 'showaudio.wav').is_file() else
            ['-f', 'lavfi', '-t', end, '-i', 'anullsrc=r=44100:cl=stereo'])
    fallback = (
        '[0:a]apad,highpass=f=70,acompressor=threshold=-20dB:ratio=2.5:attack=5:release=120,loudnorm=I=-16:TP=-1.5:LRA=9,asplit=3[v][vsc][vsc2];'
        '[1:a]volume=1.0[sh0];[sh0][vsc2]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=350[sh];'
        f'[2:a]volume={volume}[b];[b][vsc]sidechaincompress=threshold=0.05:ratio=3:attack=30:release=450[bd];'
        '[3:a]volume=0.5,highpass=f=60[s];'
        f'[v][sh][bd][s]amix=inputs=4:normalize=0:duration=longest,atrim=0:{end},alimiter=limit=0.92:level=false,loudnorm=I=-15.5:TP=-1.2:LRA=9,aresample=48000[out]')
    graph = recipe('graph', fallback, str(end), volume, voice, '0')
    run(['ffmpeg', '-y', '-loglevel', 'error', *voice_args, *show,
         '-i', project / 'bgm.wav', '-i', project / 'sfx.wav', '-filter_complex', graph,
         '-map', '[out]', '-c:a', 'pcm_s16le', project / 'mix.wav'], runtime)
    recipe('save', str(end), volume, voice, graph)


def check(runtime, video):
    print(run(['ffprobe', '-v', 'error', '-count_frames', '-show_streams', '-show_format',
               '-of', 'json', video], runtime, capture=True))
    run(['ffmpeg', '-v', 'error', '-xerror', '-i', video, '-map', '0:v:0', '-map', '0:a?', '-f', 'null', '-'], runtime)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', required=True, type=Path)
    parser.add_argument('command', choices=['doctor', 'setup', 'macro-plan', 'macro-build', 'audio', 'mix', 'render', 'check', 'stills', 'basic-build', 'import-talk', 'basic-audio'])
    parser.add_argument('args', nargs=argparse.REMAINDER)
    a = parser.parse_args()
    runtime = a.runtime.absolute()
    values = a.args
    if a.command == 'doctor':
        doctor(runtime)
    elif a.command == 'setup':
        setup(runtime)
    elif a.command == 'macro-plan':
        py(runtime, 'plan_macro_project.py', *values)
    elif a.command == 'macro-build':
        py(runtime, 'build_macro_project.py', 'build', *values, audio=True)
    elif a.command == 'import-talk':
        if '--crop-json' in values:
            index=values.index('--crop-json')
            if index+2!=len(values) or values[2:index]!=['--fps','60','--size','720x1280']:raise ValueError('Cropped import requires the fixed 60fps 720x1280 contract')
            import_talk_crop(runtime,Path(values[0]),Path(values[1]),json.loads(values[index+1]))
        else:py(runtime, 'import_talk.py', *values)
    elif a.command == 'basic-build':
        run([sys.executable, runtime / 'template/motiongit-basic/build.py', *values], runtime)
    elif a.command == 'basic-audio':
        project = Path(values[0]).absolute()
        node(runtime, 'dump_sfx.mjs', project / 'index.html', project / 'sfx.json')
        run([venv_python(runtime), Path(__file__).parent / 'basic_audio.py', project, '--runtime', runtime], runtime)
    elif a.command == 'audio':
        project = Path(values[0]).absolute()
        node(runtime, 'dump_sfx.mjs', project / 'index.html', project / 'sfx.json')
        run([venv_python(runtime), project / 'audio.py'], runtime)
    elif a.command == 'mix':
        mix(runtime, Path(values[0]).absolute())
    elif a.command == 'render':
        project, output = Path(values[0]).absolute(), Path(values[1]).absolute()
        workers = int(values[2]) if len(values) == 3 else 2
        if not 1 <= workers <= 4:
            raise ValueError('Workers must be between 1 and 4')
        py(runtime, 'export_project.py', project, output, '--html', 'index.html', '--fps', '60', '--segments', workers)
    elif a.command == 'check':
        check(runtime, Path(values[0]).absolute())
    elif a.command == 'stills':
        project = Path(values[0]).absolute()
        plan = json.loads((project / 'macro_plan.json').read_text(encoding='utf-8'))
        layout = plan['layout']
        width, height = (layout['width'], layout['height']) if isinstance(layout, dict) else (plan['width'], plan['height'])
        if (width, height) not in {(1920, 1080), (1080, 1920)}:
            raise ValueError('Unreviewed layout dimensions')
        (project / 'stills').mkdir(exist_ok=True)
        target = project / 'stills' / ('run-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S') + '-' + uuid.uuid4().hex[:8])
        # MOTIONGIT_STILLS_CHILD_DIAGNOSTICS_V1: None on an inherited pipe is not empty output.
        node(runtime, 'render_project.mjs', project / 'index.html', '--stills-dir', target,
             '--times', values[1], '--width', width, '--height', height, forward=True)
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        raise SystemExit('Portable runtime failed: ' + str(exc)) from exc
