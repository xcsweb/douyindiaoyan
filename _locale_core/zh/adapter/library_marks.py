"""Opt-in per-frame background review for circle marks across native scene cuts.

The interval/clock remains the approved bridge schedule. A background change
splits the art within that interval, with each official variant fading out/in.
No asset recolouring or geometric changes are made.
"""
from copy import deepcopy
import math

def frame_tone_runs(source,event,fps,ffmpeg='ffmpeg'):
    from bridge.brand_mark import _run,MarkError
    crop=f"crop={event['size_px']}:{event['size_px']}:{event['x']}:{event['y']},scale=1:1:flags=area"
    raw=_run([ffmpeg,'-v','error','-nostdin','-i',str(source),'-vf',f"select='gte(n,{event['start_frame']})*lt(n,{event['end_frame_exclusive']})',{crop}",'-fps_mode','passthrough','-pix_fmt','rgb24','-f','rawvideo','-'],binary=True)
    if len(raw)!=3*event['duration_frames']:raise MarkError('Full-window background sample frame count differs')
    values=[]
    for i in range(0,len(raw),3):
        channels=[x/255 for x in raw[i:i+3]]
        linear=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in channels]
        values.append(sum(x*w for x,w in zip(linear,[.2126,.7152,.0722])))
    runs=[]
    for i,v in enumerate(values):
        tone='light' if v>=.45 else 'dark'
        if not runs or runs[-1]['tone']!=tone:runs.append({'start':i,'end':i+1,'tone':tone})
        else:runs[-1]['end']=i+1
    result=[]
    for run in runs:
        e=deepcopy(event);e.update(start_frame=event['start_frame']+run['start'],end_frame_exclusive=event['start_frame']+run['end'],duration_frames=run['end']-run['start'])
        e['start_s']=e['start_frame']/fps;e['end_s']=e['end_frame_exclusive']/fps
        e['fade_frames']=min(event['fade_frames'],max(1,e['duration_frames']//2))
        e['background_samples']={'method':'all output frames, actual mark rectangle, linear sRGB luminance; human obstruction review separate','tone':run['tone'],'variant':'path' if run['tone']=='light' else 'lighter','frames':e['duration_frames'],'minimum':min(values[run['start']:run['end']]),'maximum':max(values[run['start']:run['end']])}
        e['parent_interval_frames']=[event['start_frame'],event['end_frame_exclusive']]
        result.append(e)
    if len(result)>16:raise MarkError('Rapid background changes at the mark rectangle; declare a calmer corner/interval')
    return result

def install_bridge(path):
    """Extend a copied bridge; its default behavior stays unchanged."""
    code=path.read_text()
    old='    brands = []\n'
    insert="    if tone == 'auto' and config.get('tonePolicy') == 'frame-split':\n        from library_marks import frame_tone_runs\n        events=[part for e in events for part in frame_tone_runs(source,e,float(Fraction(before['fps'])),ffmpeg)]\n"
    if 'from library_marks import frame_tone_runs' not in code:code=code.replace(old,insert+old)
    code=code.replace("sample=sample_mark_background(source,event,ffmpeg)","sample=event.get('background_samples') or sample_mark_background(source,event,ffmpeg)")
    path.write_text(code)
