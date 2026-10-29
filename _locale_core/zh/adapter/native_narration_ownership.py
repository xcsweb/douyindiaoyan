"""Bind native text ownership to supplied caption words, never character offsets.

This verifies exact text/clock consumption, not the truth of an ASR or semantic
claim. The normal adapter binds the original caption file and media fingerprints.
No word interval is interpolated, shortened, or inferred from a scene boundary.
"""
import hashlib
import math
import unicodedata

PROFILE = 'motiongit.native-caption-ownership/1'
TOLERANCE = 1 / 60 + .002


def fail(message):
    raise ValueError('NARRATION_ALIGNMENT_REQUIRED: ' + message)


def number(value):
    return type(value) in (int, float) and math.isfinite(value)


def has_content(text):
    return any(not c.isspace() and not unicodedata.category(c).startswith('P') for c in text)


def source_words(text, captions, duration):
    if not isinstance(captions, list) or not captions:
        fail('NATIVE_SOURCE_CLOCK_REQUIRED: bind the original caption file with measured highlight words; text character offsets are not seconds')
    cursor, previous, words, cues, language = 0, 0, [], [], None
    for index, cue in enumerate(captions):
        if not isinstance(cue, dict):
            fail('Invalid source caption object')
        a, b, highlight = cue.get('t0'), cue.get('t1'), cue.get('highlight')
        if not number(a) or not number(b) or not 0 <= previous <= a < b <= duration + TOLERANCE:
            fail('Source caption clock must be finite, ordered and inside the complete output')
        if (not isinstance(highlight, dict)
                or highlight.get('source') not in ('asr-word-boundaries', 'verified-word-boundaries')
                or highlight.get('language') not in ('zh', 'en')
                or not isinstance(highlight.get('units'), list) or not highlight['units']):
            fail('NATIVE_SOURCE_CLOCK_REQUIRED: source captions need their actual measured primary-language words')
        lang = highlight['language']
        if language is not None and language != lang:
            fail('Native caption primary language changed inside one source')
        language = lang
        value = cue.get(lang)
        if not isinstance(value, str) or not value.strip():
            fail('Source captions require their complete primary-language text')
        start = text.find(value, cursor)
        if start < cursor or text[cursor:start].strip():
            fail('NATIVE_SOURCE_TEXT_MISMATCH: caption text must consume the original evidence text in order; do not substitute a summary or translation')
        end, offset, word_previous = start + len(value), start, a
        local = []
        for word_index, word in enumerate(highlight['units']):
            if not isinstance(word, dict) or set(word) != {'text', 'start', 'end'}:
                fail('Invalid measured caption word fields')
            spelling, left, right = word['text'], word['start'], word['end']
            if (not isinstance(spelling, str) or not spelling
                    or not number(left) or not number(right)
                    or left < word_previous - .001 or right < left
                    or left < a - .001 or right > b + .001):
                fail('Invalid finite measured caption word interval')
            word_end = offset + len(spelling)
            if text[offset:word_end] != spelling or word_end > end:
                fail('NATIVE_SOURCE_TEXT_MISMATCH: measured words must preserve the exact original caption spelling')
            record = {'charStart': offset, 'charEnd': word_end, 'start': left,
                      'end': right, 'captionIndex': index, 'wordIndex': word_index,
                      'positiveContent': right > left and has_content(spelling)}
            local.append(record)
            offset, word_previous = word_end, right
        if offset != end:
            fail('Measured words must cover each complete caption, including its punctuation')
        words.extend(local)
        cues.append({'charStart': start, 'charEnd': end, 'start': a, 'end': b})
        cursor, previous = end, b
    if text[cursor:].strip():
        fail('Source captions omit the evidence text tail')
    return words, cues


def validate(brief, captions=()):
    if not isinstance(brief, dict):
        fail('Native ownership requires an original brief object')
    evidence = brief.get('contentEvidence', {})
    if not isinstance(evidence, dict):
        fail('Native ownership requires the complete original contentEvidence object')
    text, units, segments = evidence.get('text'), evidence.get('units'), brief.get('segments')
    if not isinstance(text, str) or not text.strip() or not isinstance(units, list) or not units:
        fail('Native ownership requires the complete original text and character-span units')
    identity = hashlib.sha256(text.encode('utf-8')).hexdigest()
    if evidence.get('schema') != 'adu-content-evidence/1' or evidence.get('textSha256') != identity:
        fail('Original contentEvidence text identity changed')
    if not isinstance(segments, list) or not segments:
        fail('Native ownership needs the complete output scene plan')
    for segment in segments:
        if not isinstance(segment, dict) or type(segment.get('durationFrames')) is not int or segment['durationFrames'] <= 0:
            fail('Native scenes require positive integer durationFrames at the existing 60 fps')
    if brief.get('fps', 60) != 60:
        fail('Native ownership uses the normal 60 fps output clock')
    duration = sum(s['durationFrames'] for s in segments) / 60
    words, cues = source_words(text, captions, duration)
    by_id, order, positive_refs, cursor, word_cursor = {}, [], set(), 0, 0
    for unit in units:
        if not isinstance(unit, dict):
            fail('Invalid evidence character unit')
        a, b, ref = unit.get('start'), unit.get('end'), unit.get('id')
        if (type(a) is not int or type(b) is not int or a != cursor or not a < b <= len(text)
                or ref != f'{identity[:16]}:{a}:{b}' or ref in by_id or unit.get('text') != text[a:b]):
            fail('Evidence character spans, stable IDs and exact original text must cover the source once in order')
        while word_cursor < len(words) and words[word_cursor]['charEnd'] <= a:
            word_cursor += 1
        matched, probe = [], word_cursor
        while probe < len(words) and words[probe]['charStart'] < b:
            matched.append(words[probe])
            probe += 1
        if not matched:
            # Only literal whitespace between complete supplied cues has no
            # spoken clock. It remains exclusively owned, never retimed.
            if text[a:b].strip() or unit.get('time') is not None:
                fail('NATIVE_SOURCE_CLOCK_REQUIRED: evidence unit has no corresponding original caption words')
            timing = None
        else:
            first, last = matched[0], matched[-1]
            timing = {'clock': 'bound-caption-words', 'start': first['start'], 'end': last['end'],
                      'captionWordRefs': [[w['captionIndex'], w['wordIndex']] for w in matched]}
            # The public source contract permits zero-length word markers.
            # Keep their original point/ref, but never count a gap between such
            # markers, punctuation, or a whole cue box as voiced evidence.
            if any(w['positiveContent'] for w in matched):
                positive_refs.add(ref)
            declared = unit.get('time')
            if declared is not None:
                if (not isinstance(declared, dict)
                        or ('clock' in declared and (not isinstance(declared['clock'], str) or not declared['clock'].strip()))
                        or not number(declared.get('start'))
                        or not number(declared.get('end')) or not -.001 <= declared['start'] <= declared['end']):
                    fail('Invalid declared evidence time; character start/end are never a time fallback')
                allowed = [(timing['start'], timing['end'])]
                whole = [c for c in cues if a <= c['charStart'] and c['charEnd'] <= b]
                if whole and all(a <= w['charStart'] and w['charEnd'] <= b for w in matched):
                    # Preserve previously bound complete sentence/paragraph
                    # clocks as well as exact measured word intervals.
                    if whole[0]['charStart'] == first['charStart'] and whole[-1]['charEnd'] == last['charEnd']:
                        allowed.append((whole[0]['start'], whole[-1]['end']))
                if not any(abs(declared['start'] - x) <= .001 and abs(declared['end'] - y) <= .001 for x, y in allowed):
                    fail('NATIVE_SOURCE_CLOCK_MISMATCH: declared unit.time differs from the bound original words/whole cues')
        by_id[ref], cursor = (unit, timing), b
        order.append(ref)
    if cursor != len(text):
        fail('Evidence character spans omit the original narration tail')
    rows, owned, at = [], [], 0
    for index, segment in enumerate(segments):
        end, refs = at + segment['durationFrames'] / 60, segment.get('ownershipRefs')
        if not isinstance(refs, list) or not refs or any(type(r) is not str or r not in by_id for r in refs):
            fail('Native segments must own the actual original evidence unit references')
        selected = [by_id[r] for r in refs]
        times = [time for _, time in selected if time is not None]
        if not times:
            fail('Native voiced scene has no bound original caption clock')
        if not any(ref in positive_refs for ref in refs):
            fail('Native voiced scene has no positive-span original content word; zero-length source markers are not voiced duration')
        if any(time['start'] < at - TOLERANCE or time['end'] > end + TOLERANCE for time in times):
            fail('A native scene owns words outside its output range; resegment at actual phrase boundaries')
        owned.extend(refs)
        rows.append({'shot': index, 'start': at, 'end': end,
                     'spokenText': ''.join(unit['text'] for unit, _ in selected),
                     'intent': segment.get('intent'), 'sourceUnitRefs': refs,
                     'phraseTimes': times,
                     'sourceSeparatorRefs': [ref for ref in refs if by_id[ref][1] is None],
                     'nativeGroupCandidates': list(segment.get('candidates', {})),
                     'semanticReview': 'Original caption-word ownership only; action meaning and actual final speech require review'})
        at = end
    if owned != order:
        fail('Native ownershipRefs must cover every original unit exactly once in source order')
    return {'profile': 'motiongit.narration-alignment/1', 'timingCoverageVerified': True,
            'sourceClockProfile': PROFILE, 'durationSeconds': duration, 'rows': rows,
            'meaningReview': 'Original word-clock consumption is verified; no ASR authenticity or semantic acceptance is produced'}
