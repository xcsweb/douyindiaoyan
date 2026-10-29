"""Split reference captions only at audio-derived word boundaries.

Input captions: [{id,t0,t1,zh}]. Alignment: [{id,words:[{word,start,end}]}],
with absolute final-output times. Recognition spelling never replaces reference
text. Poor matches remain whole cues for the real-font capacity check; they are
not assigned proportional or guessed timestamps. This is phrase-level ASR
alignment, not verified word-level animation cues.
"""
import argparse
from difflib import SequenceMatcher
import json
import math
from pathlib import Path
import re
import unicodedata


def letters(text):
    return [(c.casefold(), i) for i, c in enumerate(text)
            if unicodedata.category(c)[0] in 'LN']


def validate_highlight(cue):
    h=cue.get('highlight')
    if h is None:return
    if not isinstance(h,dict) or set(h)-{'source','language','units'} or h.get('source') not in ('asr-word-boundaries','verified-word-boundaries') or h.get('language') not in ('zh','en') or not isinstance(h.get('units'),list) or not h['units']:
        raise ValueError('Highlight requires measured primary-language word units')
    previous=cue['t0'];texts=[]
    for u in h['units']:
        if not isinstance(u,dict) or set(u)!={'text','start','end'} or not isinstance(u['text'],str) or not u['text']:
            raise ValueError('Invalid highlight text unit')
        a,b=u['start'],u['end']
        if any(type(x) not in (int,float) or not math.isfinite(x) for x in (a,b)) or a<previous-.001 or b<a or a<cue['t0']-.001 or b>cue['t1']+.001:
            raise ValueError('Invalid measured highlight interval')
        previous=b;texts.append(u['text'])
    if ''.join(texts)!=cue.get(h['language']):raise ValueError('Highlight must preserve caption text exactly')


def split_caption(cue, words, target_chars=18):
    text=cue['zh']; source=letters(text)
    if not (math.isfinite(cue['t0']) and math.isfinite(cue['t1']) and cue['t1']>cue['t0']):
        raise ValueError('Caption requires a positive finite interval')
    recognized=[]; previous=cue['t0']
    for index,word in enumerate(words):
        a,b=word['start'],word['end']
        if not all(math.isfinite(x) for x in (a,b)) or a<previous-.001 or b<a or a<cue['t0']-.05 or b>cue['t1']+.05:
            raise ValueError('Alignment timestamps must be monotonic within the reference cue')
        previous=b
        recognized.extend((c,index) for c,_ in letters(word['word']))
    match=SequenceMatcher(None,[c for c,_ in source],[c for c,_ in recognized],autojunk=False)
    audit={'cueId':cue.get('id'),'matchRatio':match.ratio(),'timingSource':'ASR word boundaries; phrase draft','wordTimesReliable':False}
    if not words or match.ratio()<.90:
        return [dict(cue)],{**audit,'status':'kept-source-cue-untrusted-alignment'}
    mapping={};corrections=[]
    for op,a,b,x,y in match.get_opcodes():
        if op=='equal' or (op=='replace' and b-a==y-x and b-a<=2):
            for s,r in zip(range(a,b),range(x,y),strict=True):mapping[source[s][1]]=recognized[r][1]
            if op=='replace':corrections.append({'reference':''.join(c for c,_ in source[a:b]),'recognized':''.join(c for c,_ in recognized[x:y])})
    parts=[];start=0
    for m in re.finditer(r'[，。！？；：、,.!?;:]+\s*',text):
        parts.append((start,m.end()));start=m.end()
    if start<len(text):parts.append((start,len(text)))
    chunks=[]
    for a,b in parts:
        if chunks and b-chunks[-1][0]<=target_chars and not re.search(r'[。！？.!?]\s*$',text[chunks[-1][0]:chunks[-1][1]]):
            chunks[-1]=(chunks[-1][0],b)
        else:chunks.append((a,b))
    if len(chunks)>1 and cue.get('en'):
        return [dict(cue)],{**audit,'status':'kept-source-cue-translation-needs-alignment'}
    result=[]
    for i,(a,b) in enumerate(chunks):
        chars=[j for _,j in source if a<=j<b]
        if not chars or chars[0] not in mapping or chars[-1] not in mapping:
            return [dict(cue)],{**audit,'status':'kept-source-cue-missing-boundary'}
        first,last=mapping[chars[0]],mapping[chars[-1]]
        # Never split an ASR word into guessed character times.
        if any((j<a and word==first) or (j>=b and word==last) for j,word in mapping.items()):
            return [dict(cue)],{**audit,'status':'kept-source-cue-boundary-inside-word'}
        begin=cue['t0'] if i==0 else max(cue['t0'],words[first]['start'])
        end=cue['t1'] if i==len(chunks)-1 else min(cue['t1'],words[last]['end'])
        if end<=begin:
            return [dict(cue)],{**audit,'status':'kept-source-cue-zero-boundary'}
        result.append({**cue,'id':f"{cue.get('id','cue')}-{i+1}",'t0':begin,'t1':end,'zh':text[a:b],
                       'sourceCueId':cue.get('id'),'timingSource':'asr-phrase-boundary'})
    if any(a['t1']>b['t0']+.001 for a,b in zip(result,result[1:])):
        return [dict(cue)],{**audit,'status':'kept-source-cue-overlapping-boundaries'}
    assert ''.join(r['zh'] for r in result)==text
    return result,{**audit,'status':'phrase-boundaries-aligned','phrases':len(result),'recognitionSpellingCorrections':corrections}


def attach_highlights(cue, words):
    """Map reference text to measured ASR words. Never manufacture character clocks.

    Punctuation stays with an adjacent word. Multi-character words share their
    measured interval; the renderer may sweep color across that word visually.
    """
    source=letters(cue['zh']);recognized=[]
    selected=[w for w in words if w['start']>=cue['t0']-.001 and w['end']<=cue['t1']+.001]
    for i,w in enumerate(selected):recognized.extend((c,i) for c,_ in letters(w['word']))
    matcher=SequenceMatcher(None,[c for c,_ in source],[c for c,_ in recognized],autojunk=False)
    if not selected or matcher.ratio()<.90:return dict(cue)
    mapping={}
    for op,a,b,x,y in matcher.get_opcodes():
        if op=='equal' or (op=='replace' and b-a==y-x and b-a<=2):
            for s,r in zip(range(a,b),range(x,y),strict=True):mapping[source[s][1]]=recognized[r][1]
    if any(j not in mapping for _,j in source):return dict(cue)
    ordered=list(dict.fromkeys(mapping[j] for _,j in source))
    if ordered!=sorted(ordered):return dict(cue)
    units=[]
    for i,wi in enumerate(ordered):
        begin=0 if i==0 else min(j for j,w in mapping.items() if w==wi)
        end=len(cue['zh']) if i==len(ordered)-1 else min(j for j,w in mapping.items() if w==ordered[i+1])
        word=selected[wi]
        units.append({'text':cue['zh'][begin:end], 'start':word['start'], 'end':word['end']})
    if ''.join(u['text'] for u in units)!=cue['zh']:raise AssertionError('Highlight changed reference text')
    result={**cue,'highlight':{'source':'asr-word-boundaries','language':'zh','units':units}}
    validate_highlight(result)
    return result


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--captions',type=Path,required=True);p.add_argument('--alignment',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True);p.add_argument('--report',type=Path,required=True)
    p.add_argument('--target-chars',type=int,default=18)
    p.add_argument('--highlight',action='store_true',help='Emit measured-word color units; ASR draft, not manually verified character timing')
    args=p.parse_args()
    if args.out.exists() or args.report.exists():p.error('Use fresh output files')
    if not 8<=args.target_chars<=32:p.error('target-chars is a grouping hint from 8 through 32, not a font-fit guarantee')
    captions=json.loads(args.captions.read_text(encoding='utf-8-sig'));alignments=json.loads(args.alignment.read_text(encoding='utf-8-sig'))
    for label,rows in [('captions',captions),('alignment',alignments)]:
        ids=[r.get('id') for r in rows]
        if any(not isinstance(i,str) or not i.strip() for i in ids) or len(set(ids))!=len(ids):
            p.error(label+' requires unique nonempty string ids')
    by_id={r['id']:r['words'] for r in alignments}
    output=[];audits=[]
    for cue in captions:
        rows,audit=split_caption(cue,by_id.get(cue.get('id'),[]),args.target_chars)
        if args.highlight:rows=[attach_highlights(r,by_id.get(cue.get('id'),[])) for r in rows]
        portable=[{k:r[k] for k in ('t0','t1','zh','en','highlight') if k in r} for r in rows]
        output.extend(portable)
        audits.append({**audit,'outputCues':portable})
    args.out.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    args.report.write_text(json.dumps({'schema':'adu-caption-phrases/1','sourceTextPreserved':True,
        'guessedWordTimes':False,'fontCapacityCheckRequired':True,'wordTimesReliable':False,
        'highlightSource':'ASR measured words; visual sweep within a word, no character timestamps' if args.highlight else None,
        'cues':audits},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'sourceCues':len(captions),'phraseCues':len(output)}))


if __name__=='__main__':main()
