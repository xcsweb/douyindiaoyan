"""Read at most five already decoded presenter samples, then keep one anchor."""
import json
from pathlib import Path
from statistics import median
import sys

from presenter_face import approximate_face


def detect_samples(paths):
    if not isinstance(paths, list) or not 1 <= len(paths) <= 5:
        raise ValueError('One to five decoded presenter samples required')
    rows, reports = [], []
    for value in paths:
        face, report = approximate_face(Path(value), 'image')
        reports.append(report)
        if report.get('status') == 'approximate':
            rows.append(face)
    report = {
        'profile': 'motiongit.static-presenter-face/1',
        'method': 'opencv-haar-static-face-median',
        'sampleDetectorMethods': list(dict.fromkeys(item.get('method', 'opencv-haar') for item in reports)),
        'sampleCount': sum(item.get('sampleCount', 0) for item in reports),
        'attemptedSamples': len(paths),
        'detectedSamples': len(rows), 'reviewRequired': True,
        'status': 'approximate' if rows else 'undetected',
        'sampleReports': reports,
    }
    if rows:
        face = {key: round(median(row[key] for row in rows), 6)
                for key in ('cx', 'cy', 'h')}
        if all('w' in row for row in rows):
            face['w'] = round(median(row['w'] for row in rows), 6)
    else:
        face = {'cx': .5, 'cy': .5, 'h': .4}
        codes = list(dict.fromkeys(item.get('errorCode', 'FACE_NOT_FOUND') for item in reports))
        report['errorCode'] = codes[0] if len(codes) == 1 else 'FACE_SAMPLE_FAILED'
        report['sampleErrorCodes'] = codes
        report['reason'] = '; '.join(dict.fromkeys(
            item.get('reason', 'No frontal face detected') for item in reports))
    return {'face': face, 'framing': report}


if __name__ == '__main__':
    print(json.dumps(detect_samples(json.load(sys.stdin)), ensure_ascii=False))
