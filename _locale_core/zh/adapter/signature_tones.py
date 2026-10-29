"""Change official Circle variants at real frame boundaries without restarting a signature."""
from copy import deepcopy


def frame_tone_runs(source, event, fps, ffmpeg='ffmpeg'):
    from bridge.brand_mark import _run, MarkError
    crop = f"crop={event['size_px']}:{event['size_px']}:{event['x']}:{event['y']},scale=1:1:flags=area"
    raw = _run([ffmpeg, '-v', 'error', '-nostdin', '-i', str(source), '-vf',
                f"select='gte(n,{event['start_frame']})*lt(n,{event['end_frame_exclusive']})',{crop}",
                '-fps_mode', 'passthrough', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], binary=True)
    if len(raw) != 3 * event['duration_frames']:
        raise MarkError('Complete signature-window background frame count differs')
    values, runs = [], []
    for offset in range(0, len(raw), 3):
        channels = [x / 255 for x in raw[offset:offset + 3]]
        linear = [x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in channels]
        light = sum(x * w for x, w in zip(linear, [.2126, .7152, .0722]))
        values.append(light)
        tone, frame = ('light' if light >= .45 else 'dark'), offset // 3
        if not runs or runs[-1]['tone'] != tone:
            runs.append({'start': frame, 'end': frame + 1, 'tone': tone})
        else:
            runs[-1]['end'] = frame + 1
    result = []
    for run in runs:
        item = deepcopy(event)
        item.update(start_frame=event['start_frame'] + run['start'],
                    end_frame_exclusive=event['start_frame'] + run['end'],
                    duration_frames=run['end'] - run['start'],
                    parent_interval_frames=[event['start_frame'], event['end_frame_exclusive']],
                    parent_fade_frames=event['fade_frames'])
        item['start_s'], item['end_s'] = item['start_frame'] / fps, item['end_frame_exclusive'] / fps
        item['background_samples'] = {
            'method': 'all output frames in the actual signature rectangle', 'tone': run['tone'],
            'variant': 'path' if run['tone'] == 'light' else 'lighter', 'frames': item['duration_frames'],
            'minimum': min(values[run['start']:run['end']]), 'maximum': max(values[run['start']:run['end']]),
            'parentAnimationAndFadePreserved': True}
        result.append(item)
    if len(result) > 64:
        raise MarkError('Signature corner changes contrast too rapidly; reserve a calmer top-right background')
    return result
