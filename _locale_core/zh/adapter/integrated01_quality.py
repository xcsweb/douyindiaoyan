"""Output-clock header/caption settings, separate from native choreography."""
import json
from pathlib import Path
import shutil


def mark_config(portrait):
    w, h = (1080, 1920) if portrait else (1920, 1080)
    return {'reference_size': [w, h], 'safe_corners': {'right': {'x': w-142, 'y': 76 if portrait else 44}},
            'cornerPolicy': 'right', 'shape': 'circle', 'backgroundTone': 'auto', 'tonePolicy': 'frame-split',
            'blocked_intervals': [], 'declaration': 'Small circular official mark in the output-clock slot; shared frame fade schedule'}


def install(project, package):
    project, package = Path(project), Path(package)
    plan = json.loads((project/'macro_plan.json').read_text(encoding='utf-8'))
    portrait = plan['height'] > plan['width']
    from bridge.brand_mark import schedule_marks
    events = schedule_marks(plan['end_frame']/60, 60, plan['width'], plan['height'], mark_config(portrait))
    children = [(project/p['path'], p['startFrame'], p['style']) for p in plan.get('parts', [])]
    if not children:
        labels={'classic-performance':'01-A','continuous-performance':'01-B','stage-performance':'01-C',
                'editorial-performance':'01-D','kinetic-performance':'01-E'}
        children = [(project, 0, labels.get(plan.get('pack'), '01'))]
    for child, offset, style in children:
        shutil.copy2(package/'adapter/integrated01-quality.js', child/'integrated01-quality.js')
        with (child/'config.js').open('a', encoding='utf-8') as out:
            out.write('\nCONFIG.subtitleBilingual=true;CONFIG.subtitleLanguage="zh";CONFIG.subtitleLayout={maxLines:1};'
                      'CONFIG.subtitleStyle={zhSize:50,enSize:30};CONFIG.subtitleEndPunctuation="omit-comma-period";'
                      'CONFIG.subtitlePosition='+('CONFIG.subtitlePosition??' if portrait else '')+json.dumps({'bottomRatio': .19 if portrait else .07, 'leftRatio': .08, 'rightRatio': .16 if portrait else .08})+';'
                      'CONFIG.integrated01OffsetFrame='+str(offset)+';CONFIG.integrated01Style='+json.dumps(style)+';'
                      'CONFIG.motiongitHeaderMarks='+json.dumps(events)+';\n')
        html = (child/'index.html').read_text(encoding='utf-8')
        if 'integrated01-quality.js' not in html:
            html = html.replace('</body>', '<script src="integrated01-quality.js"></script></body>')
            (child/'index.html').write_text(html, encoding='utf-8')
    (project/'quality-layer.json').write_text(json.dumps({'schema': 'motiongit-integrated01-quality/1',
        'nativeChoreography': 'Original units, source action clocks and motion displacement retained; portrait-only presenter fit/header clearance, C opening headline/evidence-window/footer and D flying handbook-item offsets are explicit layout repairs',
        'captions': 'Measured bilingual phrases; one line per language', 'header': 'Final output time; native duplicate labels hidden',
        'mark': mark_config(portrait)}, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
