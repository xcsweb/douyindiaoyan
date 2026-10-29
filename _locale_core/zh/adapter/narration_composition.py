"""Explicit new-production bundle and source-copy review, never semantic approval."""
from copy import deepcopy
import math
import re
import unicodedata

PROFILE='readable/1'


def _whole_cues(timeline,segment):
    cues=segment.get('cues',[]);n=len(segment.get('props',{}).get('steps',[]))
    starts=[c.get('s',c.get('start')) for c in timeline.get('captions',[])
            if isinstance(c,dict)]
    return bool(n) and len(cues)==n and all(type(c)in(int,float)and math.isfinite(c)
        and segment['t0']<=c<segment['t1'] and (i==0 or c>=cues[i-1])
        and any(type(s)in(int,float)and abs(c-s)<1e-7 for s in starts)
        for i,c in enumerate(cues))


def resolve(params):
    tl=params.get('timeline',{})
    if 'narrationComposition'not in tl:return params
    if tl['narrationComposition']!=PROFILE:raise ValueError('NARRATION_COMPOSITION: unknown explicit profile')
    result=deepcopy(params);tl=result['timeline'];segments=tl.get('segments',[])
    def choose(field,value):
        if field in tl and tl[field]!=value:
            raise ValueError('NARRATION_COMPOSITION_CONFLICT: '+field+' conflicts with readable/1. For a fresh readable composition select '+str(value)+'; retain approved legacy inputs without this profile. No parameter was silently overwritten.')
        tl[field]=value
    if any(s.get('control')in('list','steps','compare','prosCons','checklist','iconcards')for s in segments):choose('narrationLayout','balanced')
    if tl.get('captions')or tl.get('subtitles'):choose('captionLayout','balanced-lines/1')
    if any(s.get('control')=='highlight'for s in segments):choose('highlightReadability','complete-text/1')
    if segments and segments[-1].get('control')=='highlight':choose('ending','cut')
    steps=[s for s in segments if s.get('control')=='steps']
    if steps and all(_whole_cues(tl,s)for s in steps):choose('narrationVisualMode','follow-speech')
    elif steps and (tl.get('narrationVisualMode')=='follow-speech' or any(s.get('cues')for s in steps)):
        raise ValueError('NARRATION_COMPOSITION_CUES: readable/1 requires existing complete genuine whole-caption cues for steps. Keep original reveal or bind actual whole-cue groups; never infer individual word/action times. Existing cues and SFX were not changed.')
    return result


def _normal(text):return re.sub(r'\s+',' ',unicodedata.normalize('NFKC',str(text)).replace('*','')).strip().casefold()


def review(timeline,plan):
    segments=timeline.get('segments',[]);has_highlight=any(s.get('control')=='highlight'for s in segments)
    recipe={}
    if any(s.get('control')in('list','steps','compare','prosCons','checklist','iconcards')for s in segments):recipe['timeline.narrationLayout']='balanced'
    if timeline.get('captions')or timeline.get('subtitles'):recipe['timeline.captionLayout']='balanced-lines/1'
    if has_highlight:recipe['timeline.highlightReadability']='complete-text/1'
    if segments and segments[-1].get('control')=='highlight':recipe['timeline.ending']='cut'
    missing=[{'field':k,'recommended':v,'current':timeline.get(k.split('.',1)[1],'omitted')}for k,v in recipe.items()if timeline.get(k.split('.',1)[1])!=v]
    step_rows=[{'shot':i,'wholeCaptionCuesPresent':_whole_cues(timeline,s),'current':timeline.get('narrationVisualMode','original'),
        'action':'Use existing complete whole-caption groups only. Missing cues keep original reveal and SFX; this profile never creates step/word times.'}
        for i,s in enumerate(segments)if s.get('control')=='steps']
    source_rows=plan.get('narrationAlignment',{}).get('rows',[]);comparisons=[]
    for i,s in enumerate(segments):
        if s.get('control')!='compare':continue
        source=source_rows[i].get('spokenText','') if i<len(source_rows)else'';fields=[]
        def walk(value,path):
            if isinstance(value,str)and value.strip():
                literal=bool(source)and _normal(value)in _normal(source)
                fields.append({'field':path,'visibleText':value,'sourceText':source,
                    'copyStatus':'literal-excerpt-only'if literal else'nonliteral-copy-needs-review',
                    'review':'Literal occurrence is not semantic support: check negation, direction, units and conditions. Unspoken performance must have actual supplied evidence or be restored to source wording.'})
            elif isinstance(value,dict):
                for k,v in value.items():walk(v,path+'.'+k)
            elif isinstance(value,list):
                for j,v in enumerate(value):walk(v,path+'.'+str(j))
        for key in ['left','right','verdict']:walk(s.get('props',{}).get(key),'props.'+key)
        comparisons.append({'shot':i,'sourceText':source,'fields':fields})
    findings=[]
    if missing:findings.append({'code':'NEW_NARRATION_COMPOSITION_INCOMPLETE','missingChoices':missing,
        'action':'For a new composition use timeline.narrationComposition=readable/1 before the first check. Resolve explicit ending/layout conflicts in a fresh input. For approved legacy replay retain original settings; no automatic migration.'})
    if any(not r['wholeCaptionCuesPresent']for r in step_rows):findings.append({'code':'STEP_REVEAL_DEFERRED_NO_GENUINE_CUES','action':'Missing genuine per-step/group cues are deliberately not generated. Original display and SFX remain; do not claim word/action synchrony.'})
    for c in comparisons:
        nonliteral=[f for f in c['fields']if f['copyStatus']=='nonliteral-copy-needs-review']
        if nonliteral:findings.append({'code':'VISIBLE_COMPARISON_COPY_NOT_IN_SOURCE','shot':c['shot'],'fields':nonliteral,
            'action':'Compare these exact visible phrases with the full source quote. A label, purpose value or reviewed=true is not evidence of extra performance. Preserve real meaning; do not silently invent a synonym for a stronger claim.'})
    return {'profile':'motiongit.narration-composition/1','selected':timeline.get('narrationComposition','omitted'),
        'newProductionEntry':{'field':'timeline.narrationComposition','value':PROFILE,'resolvedRecipe':recipe},
        'missingChoices':missing,'stepReveal':step_rows,'sourceComparisons':comparisons,'findings':findings,
        'semanticReviewState':'Source/visible-copy comparison required; no semantic or artistic approval is produced.',
        'legacy':'No profile means no input changes. Explicit new profile is compiled before review, stored resolved in the plan and recompiled consistently from the bound original vault.'}
