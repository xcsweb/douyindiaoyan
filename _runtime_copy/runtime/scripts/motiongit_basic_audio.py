#!/usr/bin/env python3
"""Render the explicitly selected music and captured basic-component SFX.

The original native group's audio score is not reused or rewritten here.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys

def render(project, runtime):
    project, runtime = Path(project), Path(runtime)
    sys.path.insert(0, str(runtime / 'scripts'))
    from macro_audio import render as render_audio
    plan = json.loads((project / 'macro_plan.json').read_text(encoding='utf-8'))
    cues = json.loads((project / 'sfx.json').read_text(encoding='utf-8'))
    config = json.loads((project / 'config.json').read_text(encoding='utf-8'))
    plan['audio'] = {'sfxMixSource': 'runtime-scene-S-only', 'mixProfile': 'legacy-macro',
                     'specialEvents': [], 'hits': [], 'dark': [], 'envelope': [], 'fade': [],
                     'provenance': 'New basic components; deterministic browser-captured actions, not original native group score.'}
    (project / 'macro_plan.json').write_text(json.dumps(plan, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    selected = config.get('music')
    if not isinstance(selected, dict) or selected.get('mode') not in {'track', 'none'}:
        raise ValueError('Choose an explicit music track/offset or mode none before audio production')
    (project / 'macro_music.json').write_text(json.dumps(selected, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    (project / 'mix_recipe.json').write_text(json.dumps({'schema':'adu-mix/1','musicVolume':.14,'voiceMode':'file'})+'\n',encoding='utf-8')
    render_audio(project)
    report = json.loads((project / 'audio_boundary_report.json').read_text(encoding='utf-8'))
    end = plan['end_frame']/plan['fps']
    over = [e for e in report['events'] if not e.get('muted') and
            (e.get('potentialTailEnd') is None or e['potentialTailEnd'] > end + 1e-6)]
    if over:
        raise ValueError('Basic component sound tail exceeds the output; review action cue/hold before mixing')
    receipt = {'schema':'motiongit-basic-audio/1','sfx':len(cues['sfx']),
               'completeBrowserCapture':True,'fullPotentialTailsFit':True,
               'musicMode':selected['mode'],'humanListening':'pending'}
    (project / 'basic_audio_receipt.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
    return receipt

if __name__ == '__main__':
    p=argparse.ArgumentParser(description=__doc__); p.add_argument('project',type=Path); p.add_argument('--runtime',required=True,type=Path)
    a=p.parse_args(); print(json.dumps(render(a.project,a.runtime),ensure_ascii=False))
