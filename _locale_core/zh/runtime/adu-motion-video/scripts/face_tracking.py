"""One coarse local face position; five prepared samples, no tracking."""
from pathlib import Path
from statistics import median
import json


def auto_face(stage, fps, frames):
    stage = Path(stage)
    images = sorted((stage / 'talk/clip_000').glob('f*.jpg'))
    if not images:
        raise ValueError('Missing actual narration frames for face preparation')
    # Only five already prepared, display-oriented pictures; no second video
    # decode or platform-specific Vision service, and no per-frame tracking.
    positions = sorted({round((len(images) - 1) * p) for p in (.05, .25, .5, .75, .95)})
    samples = []; errors = []; rows = []
    try:
        import cv2
        import numpy as np
        from presenter_face import _load_cascade
        try:
            detector = _load_cascade(cv2)
        except cv2.error as error:
            raise ValueError('OpenCV face detector could not be loaded') from error
        for position in positions:
            image = images[position]
            sample = {'frame': int(image.stem[2:]), 'file': image.name}
            samples.append(sample)
            try:
                # Python byte loading handles Windows Unicode and space paths.
                pixels = cv2.imdecode(np.frombuffer(image.read_bytes(), dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
                if pixels is None:
                    raise ValueError('Prepared image could not be decoded')
                height, width = pixels.shape
                found = detector.detectMultiScale(pixels, scaleFactor=1.1, minNeighbors=7,
                    minSize=(max(24, width // 20), max(24, height // 30)))
                if len(found):
                    x, y, w, h = max(found, key=lambda box: int(box[2]) * int(box[3]))
                    row = {'cx': float((x + w / 2) / width), 'cy': float((y + h / 2) / height), 'h': float(h / height)}
                    rows.append(row); sample.update(status='detected', face=row)
                else:
                    sample['status'] = 'no-frontal-face'
            except (OSError, ValueError, cv2.error) as error:
                sample.update(status='sample-error', reason=str(error)[:240])
                errors.append({'frame': sample['frame'], 'reason': sample['reason']})
    except (ImportError, OSError, ValueError, AttributeError) as error:
        errors.append({'stage': 'detector', 'reason': str(error)[:240]})
    if rows:
        fixed = {key: round(median(row[key] for row in rows), 6) for key in ('cx', 'cy', 'h')}
        mode = 'opencv-haar-fixed'; status = 'approximate'; warnings = []
    else:
        fixed = {'cx': .5, 'cy': .5, 'h': 1.0}
        mode = 'wide-fixed-fallback'; status = 'undetected'
        warnings = ['No reliable frontal face found; centered wide framing requires visual review']
    if errors:
        warnings.append('Some face samples or the local detector failed; inspect framing details')
    face = {'f': [1, frames], **{key: [value, value] for key, value in fixed.items()}}
    (stage / 'face.js').write_text('const FACE=' + json.dumps({'clip_000': face}) + ';\n', encoding='utf-8')
    report = {'profile': 'motiongit.static-native-face/1', 'mode': mode, 'status': status,
        'sampleCount': len(samples), 'detectedSamples': len(rows), 'samples': samples, 'errors': errors,
        'fixedFace': fixed, 'coordinateSpace': 'prepared narration frame after display rotation and letterbox',
        'tracking': False, 'warnings': warnings, 'reviewRequired': True}
    (stage / 'face-framing.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return report
