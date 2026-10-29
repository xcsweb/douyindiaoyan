#!/usr/bin/env python3
"""Portable consumer of the complete, isolated Template 01 native library."""
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

sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1]
RUNTIME=ROOT/'runtime/adu-motion-video'


def read(path):
    from motion_package import strict_json
    return strict_json(Path(path).read_bytes(),str(path))


def write(path,value):
    Path(path).write_text(json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')


def sha(path):
    with Path(path).open('rb') as handle:
        value=hashlib.file_digest(handle,'sha256').hexdigest()
    return value


def digest_json(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()).hexdigest()


def font_preflight(package_root=None):
    root=Path(package_root) if package_root is not None else ROOT
    profile=read(root/'adapter/font-profile.json')
    for face in profile['faces']:
        path=root/face['path']
        if not path.is_file() or path.is_symlink() or sha(path)!=face['sha256']:raise ValueError('Bundled font differs: '+face['family'])
    return profile


def environment(environ=None):
    current = os.environ if environ is None else environ
    names={'PATH','HOME','TMPDIR','TMP','TEMP','LANG','LANGUAGE','TZ','SYSTEMROOT','WINDIR','PROGRAMFILES','PROGRAMFILES(X86)','LOCALAPPDATA','APPDATA','USERPROFILE','PATHEXT','CHROME'}
    env = {**{k:v for k,v in current.items() if k.upper() in names},'PYTHONDONTWRITEBYTECODE':'1','PYTHONUTF8':'1'}
    # MOTIONGIT_VERIFIED_BROWSER_BRIDGE_V1: preserve CHROME; map only one existing explicit file.
    hint = next((value for key, value in current.items() if key.upper() == 'CHROME_PATH'), None)
    if not env.get('CHROME') and hint:
        if not isinstance(hint, str) or not Path(hint).is_file():
            raise ValueError('Explicit browser path is not an existing file; preserve it and fix the named dependency')
        env['CHROME'] = str(Path(hint).resolve())
    return env


def cache_path(path=None):
    return Path(path).resolve() if path else Path(tempfile.gettempdir())/('motiongit-integrated01-'+sha(ROOT/'runtime-lock.json')[:16])


def verify(cache):
    expected=read(ROOT/'runtime-lock.json')
    if not cache.is_dir() or cache.is_symlink():raise ValueError('Run setup in a fresh external runtime cache')
    for name,expected_sha in expected.items():
        path=cache/name
        if path.is_symlink() or not path.is_file() or sha(path)!=expected_sha:raise ValueError('Frozen runtime changed: '+name)
    actual={p.relative_to(cache).as_posix() for p in cache.rglob('*')
            if p.is_file() and p.relative_to(cache).parts[0] not in {'.venv','node_modules'}}
    if actual!=set(expected):raise ValueError('Unexpected runtime source files; use a fresh external cache')
    return cache


def fingerprint(path):
    path=Path(path)
    if path.is_symlink():raise ValueError('Symlink inputs are not supported')
    if path.is_file():return {'kind':'file','sha256':sha(path)}
    if not path.is_dir():raise ValueError('Input disappeared; replan')
    files={}
    for item in sorted(path.rglob('*')):
        if item.is_symlink():raise ValueError('Symlink in sequence input')
        if item.is_file():files[item.relative_to(path).as_posix()]=sha(item)
    return {'kind':'directory','files':files}


def outside_package(path):
    path=Path(path).absolute()
    if path.resolve().is_relative_to(ROOT.resolve()):raise ValueError('Outputs/cache must be outside the read-only template')
    return path


def execute(cache,command,*args,capture=False):
    from portable import run
    return run([sys.executable,ROOT/'adapter/portable.py','--runtime',cache,command,*args],cache,capture=capture)


def native(cache,command,*args,capture=False):
    from portable import run, venv_python
    interpreter = venv_python(cache) if command == 'build' else sys.executable
    if command == 'build':
        from face_runtime_dependencies import check_face_runtime
        check_face_runtime(interpreter)
    return run([interpreter,ROOT/'adapter/integrated01_auto.py','--runtime',cache,'--package',ROOT,command,*args],cache,capture=capture)


def local(name,inputs):
    from motion_package import safe_relative
    safe_relative(name)
    # Every user path is relative to the explicitly declared input directory.
    # The packaged demo uses --inputs ., so it needs no assets/ prefix exception.
    base=inputs
    unresolved=base/name;path=unresolved.resolve()
    if not path.is_relative_to(base.resolve()) or not path.exists():raise ValueError('Input missing or outside declared root: '+name)
    current=unresolved
    while current!=base:
        if current.is_symlink():raise ValueError('Symlink input is not supported')
        current=current.parent
    return path


def captions(path,duration):
    rows=read(path)
    if not isinstance(rows,list) or not rows:raise ValueError('Provide a nonempty bilingual caption JSON list')
    sys.path.insert(0,str(RUNTIME/'scripts'))
    from subtitle_phrases import validate_highlight
    previous=0
    for index,row in enumerate(rows):
        if not isinstance(row,dict):raise ValueError(f'NATIVE_CAPTION_FIELDS: caption {index+1} must be an object. Read guide.json captions.nativeContract or CAPTIONS-EXPORT.md; do not guess fields.')
        unknown=set(row)-{'id','t0','t1','zh','en','highlight','formatting'}
        if unknown:raise ValueError(f'NATIVE_CAPTION_FIELDS: caption {index+1} unsupported fields: '+', '.join(sorted(unknown))+'. Required: t0, t1, zh, en, highlight; optional: id, formatting. Read guide.json captions.nativeContract or CAPTIONS-EXPORT.md. Keep actual times; do not guess aliases.')
        if not isinstance(row.get('highlight'),dict):raise ValueError(f'NATIVE_CAPTION_WORDS_REQUIRED: caption {index+1} needs highlight object with source, language, units [{{text,start,end}}]. This native sweep requires measured primary-language words. Read guide.json captions.nativeContract; sentence-only input can use the declared component workflow without invented word times.')
        if not all(isinstance(row.get(k),str) and row[k].strip() and '\n' not in row[k] for k in ('zh','en')):
            raise ValueError(f'Caption {index+1} needs one explicit Chinese line and one corresponding English line')
        a,b=row.get('t0'),row.get('t1')
        if any(type(x) not in (int,float) or not math.isfinite(x) for x in (a,b)) or not previous<=a<b<=duration+1e-6:
            raise ValueError('Bilingual caption clock must be monotonic within real narration duration')
        if row.get('highlight') is None or row['highlight'].get('language')!='zh':raise ValueError(f'Caption {index+1} needs measured zh word intervals; align the actual spoken audio first')
        validate_highlight(row);previous=b
    return rows


def bindings(params,inputs):
    from corner_runtime import resolve_header
    resolve_header(params)
    if not isinstance(params,dict) or (set(params)-{'header'})!={'media','brief'}:raise ValueError('Parameters require exactly media and brief')
    media=params['media'];brief=deepcopy(params['brief'])
    if not isinstance(media,dict) or set(media)!={'talk','captions'} or any(not isinstance(v,str) or not v for v in media.values()):raise ValueError('media needs talk and captions paths')
    if not isinstance(brief,dict) or brief.get('schema')!='adu-auto-brief/1':raise ValueError('Use adu-auto-brief/1 with named native groups')
    if not isinstance(brief.get('brand'),str) or not brief['brand'].strip() or not isinstance(brief.get('segments'),list) or not brief['segments']:
        raise ValueError('Brief needs brand and complete semantic segments')
    if brief.get('layout') not in {'landscape','portrait'}:raise ValueError('Choose landscape or portrait')
    frames=0
    for segment in brief['segments']:
        if not isinstance(segment,dict) or type(segment.get('durationFrames')) is not int or segment['durationFrames']<=0:raise ValueError('Each segment needs positive integer durationFrames')
        frames+=segment['durationFrames']
    duration=frames/60;limits=read(ROOT/'guide.json')['duration'];declared=brief.get('narrationDuration')
    if type(declared) not in (int,float) or not math.isfinite(declared) or not limits['min']<=declared<=limits['max'] or abs(declared-duration)>1/60:
        raise ValueError('narrationDuration must match real planned frames and the declared duration range')
    if brief.get('repairPolicy',{}).get('mode','off')!='off':raise ValueError('This adapter preserves the unchanged narration; repair requires a separately authorized and reviewed edited master')
    brief['fps']=60;brief['fontPolicy']=brief.get('fontPolicy','preferred');brief['repairPolicy']={'mode':'off'}
    brief.setdefault('subtitlePosition',{'bottomRatio':.19 if brief['layout']=='portrait' else .07,'leftRatio':.08,'rightRatio':.16 if brief['layout']=='portrait' else .08})
    paths={'talk':local(media['talk'],inputs),'captions':local(media['captions'],inputs)}
    from audio_integrity import require_signal,source_clock
    originalAudioIntegrity=require_signal(paths['talk'],role='original narration')
    originalSourceClock=source_clock(paths['talk'])
    if abs(originalSourceClock['timelineEndSeconds']-duration)>1/60+.002:raise ValueError('AUDIO_CLOCK_MISMATCH: compose the complete original source duration; do not truncate narration to a shorter plan')
    rows=captions(paths['captions'],duration);contracts={g['id']:g for g in read(ROOT/'adapter/parameter-map.json')['groups']}
    def resolve(value,key=''):
        if isinstance(value,dict):
            if key in {'supportingRefs','ownershipRefs'}:return value
            if key=='candidates':
                from semantic_media_paths import resolve_candidate_media
                def media_path(v):
                    path=local(v,inputs);paths['binding:'+v]=path;return str(path)
                return {group:resolve(resolve_candidate_media(binding,contracts.get(group),media_path),group) for group,binding in value.items()}
            if key=='externalFontFiles':
                result={}
                for k,v in value.items():
                    path=local(v,inputs);paths['font:'+k+':'+v]=path;result[k]=str(path)
                return result
            return {k:resolve(v,k) for k,v in value.items()}
        if isinstance(value,list):return [resolve(v,key) for v in value]
        if isinstance(value,str) and value and key in {'path','grainTexture','monoFontFile','colorReviewFile'}:
            path=local(value,inputs);paths['binding:'+value]=path;return str(path)
        return value
    brief=resolve(brief)
    music=brief.get('music',{})
    if isinstance(music,dict)and music.get('mode')=='track'and music.get('path'):require_signal(Path(music['path']),role='music')
    if 'music' not in brief:
        raise ValueError('needs-binding: explicitly bind this production music or choose music.mode=none')
    return brief,paths,rows


def plan(params_file,inputs,destination,cache):
    brief,paths,rows=bindings(read(params_file),inputs)
    outside_package(destination)
    if destination.exists() or destination.is_symlink():raise ValueError('Plan output already exists')
    with tempfile.TemporaryDirectory(prefix='motiongit-integrated01-plan-') as tmp:
        path=Path(tmp)/'brief.json';write(path,brief)
        native(cache,'plan',path,inputs,destination)
    from narration_alignment import native as narration_alignment
    write(destination/'narration-map.json',narration_alignment(brief,captions=rows))
    hashes={name:sha(destination/name) for name in ('auto_plan.json','report.json','spec.json','capabilities.json','narration-map.json')}
    snapshot={'schema':'motiongit-plan-inputs/1','paramsSha256':sha(params_file),
        'packageSha256':sha(ROOT/'integrity.json'),'sourceLockSha256':sha(ROOT/'motion.lock.json'),
        'files':{k:{'path':str(p),'fingerprint':fingerprint(p)} for k,p in paths.items()},'planFiles':hashes,
        'captionLanguages':['zh','en'],'ownerEffectsAcceptance':'pending'}
    write(destination/'inputs.json',snapshot)
    write(destination/'bilingual-captions.json',rows)
    write(destination/'review.json',{'schema':'motiongit-plan-review/1','reviewed':False,
        'inputsSha256':sha(destination/'inputs.json'),'planFilesSha256':digest_json(hashes),
        'instruction':'Inspect full user content, selected complete groups, protected action/cue times, genuine media/counts, bilingual captions and missing/blocking report. Set reviewed=true only after that review. Technical ready does not imply owner visual acceptance.'})


def verify_plan(params_file,plan_dir):
    snapshot=read(plan_dir/'inputs.json');review=read(plan_dir/'review.json')
    if review.get('schema')!='motiongit-plan-review/1' or review.get('reviewed') is not True:raise ValueError('Inspect the plan and set review.json reviewed=true before prepare')
    if review.get('inputsSha256')!=sha(plan_dir/'inputs.json') or review.get('planFilesSha256')!=digest_json(snapshot['planFiles']):raise ValueError('Reviewed plan receipt changed; replan')
    if snapshot['paramsSha256']!=sha(params_file) or snapshot['packageSha256']!=sha(ROOT/'integrity.json') or snapshot['sourceLockSha256']!=sha(ROOT/'motion.lock.json'):raise ValueError('Parameters/package changed; replan')
    for name,expected in snapshot['planFiles'].items():
        if sha(plan_dir/name)!=expected:raise ValueError('Plan changed after review; replan')
    for item in snapshot['files'].values():
        if fingerprint(item['path'])!=item['fingerprint']:raise ValueError('Input changed since plan; replan')
    if not read(plan_dir/'report.json')['ready']:raise ValueError('Plan has unresolved missing or blocked inputs')
    return snapshot


def prepare(params_file,inputs,plan_dir,out,cache):
    _,paths,rows=bindings(read(params_file),inputs);snapshot=verify_plan(params_file,plan_dir)
    outside_package(out)
    with tempfile.TemporaryDirectory(prefix='motiongit-integrated01-captions-') as tmp:
        path=Path(tmp)/'subs.js';path.write_text('const SUBS='+json.dumps(rows,ensure_ascii=False).replace('<','\\u003c')+';\n',encoding='utf-8')
        native(cache,'build',plan_dir/'auto_plan.json',paths['talk'],out,path)
    from corner_runtime import install_project_signature
    install_project_signature(out, ROOT, read(params_file), 605)
    write(out/'motiongit-origin.json',{'schema':'motiongit-instance/1','integritySha256':sha(ROOT/'integrity.json'),
        'sourceLockSha256':sha(ROOT/'motion.lock.json'),'paramsSha256':sha(params_file),
        'planInputsSha256':sha(plan_dir/'inputs.json'),'inputFiles':snapshot['files'],
        'captionLanguages':['zh','en'],'primaryCaptionLanguage':'zh','wordTimingSource':'measured and validated','ownerEffectsAcceptance':'pending'})


def project_hashes(project):
    from render_transaction import reviewed_hashes
    return reviewed_hashes(project)



def verify_project_origin(project):
    origin=read(project/'motiongit-origin.json')
    if origin['integritySha256']!=sha(ROOT/'integrity.json') or origin['sourceLockSha256']!=sha(ROOT/'motion.lock.json'):raise ValueError('Project template source differs')
    return origin


def preview(project,times,cache):
    outside_package(project);origin=verify_project_origin(project)
    if (project/'preview.json').exists():raise ValueError('Preview already recorded; prepare a fresh instance after changes')
    execute(cache,'stills',project,times)
    stills={p.relative_to(project).as_posix():sha(p) for p in sorted((project/'stills').rglob('*.png'))}
    if not stills:raise ValueError('No preview stills generated')
    hashes=project_hashes(project)
    write(project/'preview.json',{'schema':'motiongit-preview/1','reviewed':False,'times_s':times,
        'integritySha256':origin['integritySha256'],'sourceLockSha256':origin['sourceLockSha256'],
        'projectHashes':hashes,'projectHashesSha256':digest_json(hashes),'stills':stills,
        'instruction':'Inspect real fonts, full backgrounds, foreground/paint/trajectory safe margins, bilingual short captions and measured sweep, presenter crop and aligned circular logo/time slot. Set reviewed=true after review; stills do not establish continuous animation/audio quality.'})


def verify_preview(project):
    origin=verify_project_origin(project)
    if not (project/'preview.json').is_file():raise ValueError('Create and inspect preview stills, then set preview.json reviewed=true before render')
    receipt=read(project/'preview.json')
    if receipt.get('schema')!='motiongit-preview/1' or receipt.get('reviewed') is not True:raise ValueError('Inspect actual preview stills and set preview.json reviewed=true before render')
    if receipt['integritySha256']!=origin['integritySha256'] or receipt['sourceLockSha256']!=origin['sourceLockSha256']:raise ValueError('Preview package changed')
    hashes=project_hashes(project)
    if hashes!=receipt['projectHashes'] or digest_json(hashes)!=receipt['projectHashesSha256']:raise ValueError('Project changed after preview; prepare and preview a fresh instance')
    for name,expected in receipt['stills'].items():
        if sha(project/name)!=expected:raise ValueError('Preview stills changed')


def mark_config(portrait):
    width,height=(1080,1920) if portrait else (1920,1080)
    return {'reference_size':[width,height],'safe_corners':{'right':{'x':width-142,'y':76 if portrait else 44}},
        'cornerPolicy':'right','shape':'circle','backgroundTone':'auto','tonePolicy':'frame-split','blocked_intervals':[],
        'declaration':'Shared output-clock circular mark/time slot; actual foreground overlap review required'}


def render(project,out,workers,cache):
    outside_package(project);outside_package(out)
    plan=read(project/'macro_plan.json');config=mark_config(plan['height']>plan['width'])
    if (ROOT/'adapter/integrated01_quality.py').is_file():
        from integrated01_quality import mark_config as quality_mark_config
        config=quality_mark_config(plan['height']>plan['width'])
    from render_transaction import render_export
    from corner_runtime import shared_config
    config=shared_config(project, config)
    return render_export(ROOT,project,out,workers,cache,execute,verify_preview,config)



def main():
    from motion_package import validate_directory
    validate_directory(ROOT)
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--cache',type=Path)
    sub=parser.add_subparsers(dest='command',required=True)
    for name in ('doctor','setup'):sub.add_parser(name)
    capabilities=sub.add_parser('capabilities');capabilities.add_argument('--layout',choices=['landscape','portrait'],default='portrait')
    for name in ('check-params','plan','prepare'):
        item=sub.add_parser(name);item.add_argument('params',type=Path);item.add_argument('--inputs',type=Path,required=True)
        if name!='check-params':item.add_argument('--out',type=Path,required=True)
        if name=='prepare':item.add_argument('--plan',type=Path,required=True)
    for name in ('preview','render'):
        item=sub.add_parser(name);item.add_argument('project',type=Path)
        if name=='preview':item.add_argument('--times',required=True)
        else:item.add_argument('--out',type=Path,required=True);item.add_argument('--workers',type=int,choices=range(1,5),default=4)
    args=parser.parse_args();cache=cache_path(args.cache)
    if args.command=='setup':
        outside_package(cache)
        if cache.exists() or cache.is_symlink():raise ValueError('Cache exists; use doctor or select a fresh external cache')
        shutil.copytree(RUNTIME,cache);execute(cache,'setup');verify(cache);return
    if args.command=='doctor':execute(cache if cache.exists() else RUNTIME,'doctor');return
    if args.command=='capabilities':native(RUNTIME,'capabilities','--layout',args.layout);return
    if args.command=='check-params':
        brief,_,rows=bindings(read(args.params),args.inputs.resolve())
        print(json.dumps({'status':'inputs-valid-semantic-plan-still-required','frames':sum(s['durationFrames'] for s in brief['segments']),
            'bilingualCues':len(rows),'measuredHighlightCues':len(rows)},ensure_ascii=False));return
    verify(cache)
    if args.command=='plan':plan(args.params.resolve(),args.inputs.resolve(),args.out.absolute(),cache)
    elif args.command=='prepare':prepare(args.params.resolve(),args.inputs.resolve(),args.plan.resolve(),args.out.absolute(),cache)
    elif args.command=='preview':preview(args.project.resolve(),args.times,cache)
    else:render(args.project.resolve(),args.out.absolute(),args.workers,cache)


if __name__=='__main__':
    try:main()
    except (ValueError,OSError,KeyError,subprocess.CalledProcessError) as error:raise SystemExit('MotionGit: '+str(error))

# motiongit-managed-native-corner: project signature owns preview and export.
