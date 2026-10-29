"""Advisory discovery of existing component options; never edits a timeline.

Run only after normal input/media/timing validation. Cue structure is not proof
of measured speech or semantic correctness. Existing projects keep their mode.
"""
import math

PROFILE = 'motiongit.narration-choices/1'
LAYOUT_CONTROLS = frozenset(('list', 'steps', 'compare', 'prosCons', 'checklist', 'iconcards'))


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def describe(timeline, plan):
    """Return mode choices and existing review hints, with no I/O or mutation."""
    narrated = bool(timeline.get('voiceover') or timeline.get('captions')
                    or timeline.get('subtitles') or plan.get('voiceover'))
    current = {name: {'value': timeline.get(name, 'original'), 'explicit': name in timeline}
               for name in ('narrationLayout', 'narrationVisualMode')}
    result = {'profile': PROFILE, 'applicable': narrated, 'mode': 'advisory-no-input-changes',
              'guide': 'NARRATION-VISUAL.md', 'current': current,
              'newProductionOptions': [], 'stepCueStructure': [], 'findings': [],
              'legacyReplay': 'Omitted/original keeps the existing composition. Never silently change an approved project.',
              'acceptance': 'Choices and cue structure do not certify speech timing, pixels or semantic/artistic quality.'}
    if not narrated:
        return result
    segments = timeline.get('segments', [])
    layout_shots = [i for i, s in enumerate(segments) if s.get('control') in LAYOUT_CONTROLS]
    if layout_shots:
        result['newProductionOptions'].append({
            'field': 'timeline.narrationLayout', 'value': 'balanced', 'shots': layout_shots,
            'action': 'For a new narrated film, select this supported content-sized layout before the first plan. Inspect actual content/caption clearance; it does not reserve every possible subtitle rectangle.'})
        if current['narrationLayout']['value'] == 'original':
            result['findings'].append({'code': 'NARRATION_LAYOUT_ORIGINAL', 'shots': layout_shots,
                'action': 'New production: explicitly set timeline.narrationLayout=balanced and review a fresh plan. Legacy replay: keep original. Do not disable caption/capacity guards or shrink the whole film.'})
    for i, s in enumerate(segments):
        if s.get('control') != 'steps':
            continue
        cues, steps = s.get('cues', []), s.get('props', {}).get('steps', [])
        complete = bool(steps) and len(cues) == len(steps) and all(
            finite(c) and s['t0'] <= c < s['t1'] and (j == 0 or c >= cues[j - 1])
            for j, c in enumerate(cues))
        result['stepCueStructure'].append({'shot': i, 'items': len(steps), 'cues': len(cues),
            'completeCueStructure': complete, 'measuredEvidenceReviewRequired': True})
        if not complete:
            result['findings'].append({'code': 'STEP_FOLLOW_REQUIRES_COMPLETE_CUES', 'shot': i,
                'action': 'follow-speech needs one genuine cue per step. This group retains its original reveal fallback. Bind complete real sentence evidence, present items together at one shared genuine cue when the sentence introduces them together, or recompose. Never fill missing cues by text length.'})
    if result['stepCueStructure']:
        result['newProductionOptions'].append({'field': 'timeline.narrationVisualMode', 'value': 'follow-speech',
            'scope': 'steps labels only when this actual group has a complete cue structure and genuine speech evidence',
            'action': 'For a new film select the supported option after binding complete real cues. It hides future step labels; it does not fix compare/keyword entry or replace original action/sound clocks.'})
        if current['narrationVisualMode']['value'] == 'original':
            result['findings'].append({'code': 'NARRATION_REVEAL_ORIGINAL',
                'action': 'New production: consider timeline.narrationVisualMode=follow-speech for fully bound steps. Preserve original for legacy replay; changing the flag alone cannot supply missing cues.'})
    coverage = plan.get('narrationAlignment', {}).get('visualCoverage', {})
    for finding in coverage.get('findings', []):
        if finding.get('code') not in ('late-subject-entry-review', 'sentence-visual-unmapped', 'repeated-single-target', 'long-shot-review'):
            continue
        result['findings'].append({k: v for k, v in finding.items() if k != 'text'})
    # Continuous-caption coverage reports whole-sentence ownership but does not
    # currently run the legacy subject-entry hint. Surface the same review need
    # here, using only the validated sentence intervals and actual input cues.
    # This is a potential cue gap, never proof of an empty pixel or a word clock.
    for i, s in enumerate(segments):
        if s.get('control') not in ('compare', 'keyword', 'intro', 'tip', 'iconcards'):
            continue
        entries = [c for c in s.get('cues', []) if finite(c)]
        owned = [c for c in coverage.get('sentences', []) if c.get('shot') == i
                 and finite(c.get('start')) and finite(c.get('end'))
                 and min(c['end'], s['t1']) > max(c['start'], s['t0'])]
        if not entries or not owned:
            continue
        first = min(owned, key=lambda c: c['start'])
        visible_start, visible_end = max(first['start'], s['t0']), min(first['end'], s['t1'])
        gap = min(entries) - visible_start
        if gap > max(.75, (visible_end - visible_start) * .2) and not any(
                f.get('code') == 'late-subject-entry-review' and f.get('shot') == i for f in result['findings']):
            result['findings'].append({'code': 'late-subject-entry-review', 'shot': i,
                'firstVisibleSentenceStart': visible_start, 'firstSubjectCue': min(entries),
                'potentialOpeningGapSeconds': round(gap, 6), 'scope': 'Cue-gap review only; actual pixels and entry animation still require preview.',
                'action': 'Inspect the scene opening for missing recognizable context. For new composition, bind whole-sentence context in time or choose another supported expression; preserve real voice/caption clocks. balanced/follow-speech do not fix compare/keyword entry.'})
    result['nextAction'] = 'Before prepare, read these findings and NARRATION-VISUAL.md. For a new film select applicable options in a fresh input; keep complete narration, real cue clocks and normal plan/preview review. Inspect scene openings and transitions as well as the middle. No user technical form is needed.'
    return result
