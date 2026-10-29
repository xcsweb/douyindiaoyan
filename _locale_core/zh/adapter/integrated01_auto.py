#!/usr/bin/env python3
"""Adapter-local entry to the frozen native multi-pack planner/compiler.

No alternate scene renderer lives here. All source geometry/choreography is
executed by the version-pinned authored pack, in its own host when mixed.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import sys

sys.dont_write_bytecode=True


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def write(path,value):
    Path(path).write_text(json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')


def install_caption_contract(project,package):
    """Adjust only the shared output-clock subtitle configuration.

    Authored scene bodies and source clocks are untouched. The optional quality
    module declares its portrait display repairs separately from frozen source.
    """
    plan=read(project/'macro_plan.json')
    targets=[project/p['path'] for p in plan.get('parts',[])] or [project]
    for target in targets:
        with (target/'config.js').open('a',encoding='utf-8') as handle:
            handle.write('\nCONFIG.subtitleBilingual=true;CONFIG.subtitleLanguage="zh";CONFIG.subtitleLayout={maxLines:1};'
                'CONFIG.subtitleStyle={zhSize:50,enSize:30};'
                'CONFIG.subtitleEndPunctuation="omit-comma-period";\n')
        receipt=target/'recipe_versions.json'
        if receipt.is_file():
            data=read(receipt);data.setdefault('frozenRuntime',{})['config.js']=hashlib.sha256((target/'config.js').read_bytes()).hexdigest()
            write(receipt,data)
    module=package/'adapter/integrated01_quality.py'
    if module.is_file():
        sys.path.insert(0,str(module.parent))
        from integrated01_quality import install
        install(project,package)
    # Output-only overlays are intentional and must not leave stale compiler
    # receipts claiming the pre-overlay config/index bytes are still executing.
    for target in targets:
        receipt=target/'recipe_versions.json'
        if receipt.is_file():
            data=read(receipt)
            for name in ('config.js','index.html','integrated01-quality.js'):
                if (target/name).is_file():
                    data.setdefault('frozenRuntime',{})[name]=hashlib.sha256((target/name).read_bytes()).hexdigest()
            data['outputOverlay']='Bilingual captions/header and explicit portrait display repairs; authored scene bodies, motion displacement and source clocks unchanged'
            write(receipt,data)
    if (project/'quality-layer.json').is_file() and (project/'recipe_versions.json').is_file():
        data=read(project/'recipe_versions.json')
        data.setdefault('frozenRuntime',{})['quality-layer.json']=hashlib.sha256((project/'quality-layer.json').read_bytes()).hexdigest()
        write(project/'recipe_versions.json',data)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime',type=Path,required=True)
    parser.add_argument('--package',type=Path,required=True)
    sub=parser.add_subparsers(dest='command',required=True)
    capabilities=sub.add_parser('capabilities');capabilities.add_argument('--layout',choices=['landscape','portrait'],required=True)
    plan=sub.add_parser('plan');plan.add_argument('brief',type=Path);plan.add_argument('source',type=Path);plan.add_argument('out',type=Path)
    build=sub.add_parser('build');build.add_argument('plan',type=Path);build.add_argument('talk',type=Path);build.add_argument('out',type=Path);build.add_argument('captions',type=Path)
    args=parser.parse_args();runtime=args.runtime.resolve();sys.path.insert(0,str(runtime/'scripts'))
    from auto_templates import capabilities,choose,library
    if args.command=='capabilities':
        print(json.dumps(capabilities(library(layout=args.layout),args.layout),ensure_ascii=False,indent=2));return
    if args.command=='plan':
        if args.out.exists() or args.out.is_symlink():raise ValueError('Refusing existing plan output')
        result=choose(read(args.brief),args.source.resolve())
        args.out.mkdir()
        for name,value in [('auto_plan.json',result),('report.json',result['report']),('spec.json',result['spec'])]:write(args.out/name,value)
        write(args.out/'capabilities.json',capabilities(library(layout=result['brief']['layout']),result['brief']['layout']))
        from plan_macro_project import markdown_report
        (args.out/'report.md').write_text(markdown_report(result['report'],result['spec']),encoding='utf-8')
        print(json.dumps({k:result['report'][k] for k in ('ready','status','selectedStyle','selectedSegmentation')},ensure_ascii=False));return
    from build_auto_project import build_auto
    build_auto(args.plan.resolve(),args.talk.resolve(),args.out.absolute(),args.captions.resolve())
    install_caption_contract(args.out,args.package.resolve())
    from portable import run
    run(['node',args.package.resolve()/'adapter/portrait-concept-guard.mjs',args.out.absolute(),runtime],runtime)
    print(json.dumps({'output':str(args.out),'status':'built-native-awaiting-preview-review'},ensure_ascii=False))


if __name__=='__main__':
    try:main()
    except (ValueError,OSError,KeyError) as error:raise SystemExit('Native integration failed: '+str(error))
