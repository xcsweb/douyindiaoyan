# -*- coding: utf-8 -*-
"""由 master.srt + 词级时间码生成模板原生字幕 JSON (captions.json)。"""
import json, os, re, sys, difflib

WORK = os.path.dirname(os.path.abspath(__file__))
SRT = os.path.join(WORK, "master", "master.srt")
TIMELINE = os.path.join(WORK, "master", "timeline.json")
TRANS = os.path.join(WORK, "transcript")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(WORK, "captions.json")

PUNCT = set("，。！？、；：…—·,.!?;:()（）《》“”\"'‘’%")
CLAUSE = set("，。！？、；：…")
LATIN = re.compile(r"[A-Za-z0-9]+")


def parse_srt(path):
    raw = open(path, encoding="utf-8-sig").read().replace("\r\n", "\n")
    rows = []
    for b in [x for x in raw.split("\n\n") if x.strip()]:
        lines = [l for l in b.split("\n") if l.strip()]
        if len(lines) < 3:
            continue
        m = re.match(r"(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)", lines[1])
        if not m:
            continue
        g = [int(x) for x in m.groups()]
        t0 = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000.0
        t1 = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000.0
        rows.append({"idx": int(lines[0]), "t0": t0, "t1": t1, "zh": "".join(lines[2:]).strip()})
    return rows


HEAD_PAD = 0.18  # 与 build_master.py 保持一致：每段裁头 0.18s


def load_words():
    """全局时间 = 主轨 offset + (段内时间 - 该段裁切起点)。"""
    tl = json.load(open(TIMELINE, encoding="utf-8"))
    words = []
    for clip in tl["clips"]:
        data = json.load(open(os.path.join(TRANS, clip["stem"] + ".json"), encoding="utf-8"))
        segs = [s for s in data["segments"] if s["text"].strip()]
        head = max(0.0, segs[0]["start"] - HEAD_PAD)
        for seg in data["segments"]:
            for w in seg.get("words", []):
                if w["word"]:
                    words.append({"text": w["word"],
                                  "start": clip["offset"] + w["start"] - head,
                                  "end": clip["offset"] + w["end"] - head})
    words.sort(key=lambda x: (x["start"], x["end"]))
    return words, tl.get("total", 0)


def tokenize(text):
    out, i = [], 0
    while i < len(text):
        m = LATIN.match(text, i)
        if m:
            out.append({"text": m.group(0), "core": True, "s": i, "e": m.end()})
            i = m.end()
        else:
            c = text[i]
            out.append({"text": c, "core": not (c.isspace() or c in PUNCT), "s": i, "e": i + 1})
            i += 1
    return out


def main():
    rows = parse_srt(SRT)
    words, total = load_words()
    print("srt rows=%d  asr words=%d  total=%.3f" % (len(rows), len(words), total))
    result = []

    for r in rows:
        lo, hi = r["t0"] - 0.06, r["t1"] + 0.06
        sel = [w for w in words if w["end"] > lo and w["start"] < hi]
        if not sel:
            sel = sorted(words, key=lambda w: abs(w["start"] - r["t0"]))[:1]

        # ASR 侧 token 列表，每个 token 带所属词
        asr = []
        for w in sel:
            for tk in tokenize(w["text"]):
                if tk["core"]:
                    asr.append({"text": tk["text"], "word": w})
        srt_tk = tokenize(r["zh"])
        srt_core = [tk for tk in srt_tk if tk["core"]]

        # 默认按整行均分
        n = len(srt_core)
        span = max(r["t1"] - r["t0"], 0.3)
        step = span / max(n, 1)
        for k, tk in enumerate(srt_core):
            tk["start"] = r["t0"] + k * step
            tk["end"] = r["t0"] + (k + 1) * step

        sm = difflib.SequenceMatcher(None, [t["text"] for t in srt_core],
                                     [t["text"] for t in asr], autojunk=False)
        uni = [[t["start"], t["end"]] for t in srt_core]
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == "equal":
                for k in range(i2 - i1):
                    w = asr[j1 + k]["word"]
                    srt_core[i1 + k]["start"] = w["start"]
                    srt_core[i1 + k]["end"] = w["end"]
            elif tag == "replace" and j2 > j1:
                # 按被替换的 ASR 时间跨度线性摊开，避免重复口吃把时间挤到一处
                a0 = asr[j1]["word"]["start"]
                a1 = asr[j2 - 1]["word"]["end"]
                if a1 - a0 > 0.15:
                    cnt = i2 - i1
                    for k in range(cnt):
                        srt_core[i1 + k]["start"] = a0 + (a1 - a0) * k / cnt
                        srt_core[i1 + k]["end"] = a0 + (a1 - a0) * (k + 1) / cnt

        # 匹配点偏离均分过多时（口吃/重复词导致错位）退回均分
        for k, tk in enumerate(srt_core):
            if abs(tk["start"] - uni[k][0]) > 1.5:
                tk["start"], tk["end"] = uni[k]

        # ---- 生成 units：先按标点断句，过长句再从中间均分 ----
        raw_groups, cur, core_n = [], [], 0
        for tk in srt_tk:
            cur.append(tk)
            if tk["core"]:
                core_n += 1
            if (not tk["core"]) and tk["text"] in CLAUSE and core_n >= 2:
                raw_groups.append(cur)
                cur, core_n = [], 0
        if cur:
            if raw_groups and not any(t["core"] for t in cur):
                raw_groups[-1].extend(cur)
            else:
                raw_groups.append(cur)

        def make_unit(tokens, fallback):
            core = [t for t in tokens if t["core"]]
            st = core[0]["start"] if core else fallback
            en = core[-1]["end"] if core else min(r["t1"], st + 0.1)
            return {"text": "".join(t["text"] for t in tokens), "start": st, "end": en}

        def split_group(tokens):
            core = [t for t in tokens if t["core"]]
            if len(core) <= 8:
                return [tokens]
            half = len(core) / 2.0
            acc, cut = 0, len(tokens)
            for i, tk in enumerate(tokens):
                if tk["core"]:
                    acc += 1
                    if acc >= half:
                        cut = i + 1
                        break
            left, right = tokens[:cut], tokens[cut:]
            if not any(t["core"] for t in left) or not any(t["core"] for t in right):
                return [tokens]
            return split_group(left) + split_group(right)

        units = []
        for g in raw_groups:
            for part in split_group(g):
                units.append(make_unit(part, r["t0"]))

        # 单调与范围修正
        prev, fixed = r["t0"], []
        for u in units:
            st, en = u["start"], u["end"]
            st = max(st, r["t0"], prev)
            en = max(en, st + 0.02)
            if r["t1"] > st + 0.02:
                en = min(en, r["t1"])
            fixed.append({"text": u["text"], "start": round(st, 3), "end": round(en, 3)})
            prev = en

        joined = "".join(u["text"] for u in fixed)
        if joined != r["zh"]:
            raise SystemExit("拼接不一致 row %d: %r != %r" % (r["idx"], joined, r["zh"]))

        result.append({
            "id": "c%02d" % r["idx"],
            "t0": round(r["t0"], 3),
            "t1": round(r["t1"], 3),
            "zh": r["zh"],
            "en": EN.get(r["idx"], ""),
            "highlight": {"source": "asr-word-boundaries", "language": "zh", "units": fixed},
        })

    miss = [c["id"] for c in result if not c["en"]]
    if miss:
        print("缺少英文:", miss)
    json.dump(result, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("written:", OUT, "rows:", len(result))


EN = {
    1: "600 community members,", 2: "I made them a family portrait.",
    3: "This isn't a screenshot — open the page.",
    4: "How long until 1024 — it ticks every second.",
    5: "It can also link up into a night sky.",
    6: "Every member can be linked into that night sky.",
    7: "Then it can turn into a globe.",
    8: "All the members show up on the globe.",
    9: "The really hard part was spelling words and piecing faces.",
    10: "What I originally had in mind was…",
    11: "It started as some community ideas.",
    12: "Like ideas you see on Douyin.",
    13: "Built out of lots of avatars.",
    14: "Pieced into a face, or into a character.",
    15: "This idea is also hard.",
    16: "And implementing and solving it is painful.",
    17: "Things like verification.",
    18: "And whether the frontend can even do it.",
    19: "The biggest issue is that I still hit a few pitfalls.",
    20: "One is that rendering really is hard.",
    21: "Another is performance — it needs optimization.",
    22: "Because 600 avatar images really do…",
    23: "And how the data gets collected,",
    24: "where the data comes from.",
    25: "Those are all problems.",
    26: "Then step by step, talking with AI,",
    27: "and the problems got solved.",
    28: "What I finally built was that star flow.",
    29: "I ended up building the star flow.",
    30: "The star flow also came from my earlier idea.",
    31: "And then…",
    32: "I thought, could those earlier mosaics, piec…",
    33: "could this face-piecing thing be reused.",
    34: "Then through… the idea was,",
    35: "type text or upload an image,",
    36: "and it turns into a star flow.",
    37: "Like turning into a picture.",
    38: "The text that comes out, change it as you like,",
    39: "and it's easy to post as a mosaic.",
    40: "The full process of how it was built,",
    41: "if you want to know,",
    42: "come to the TRAE community.",
    43: "Take a look.",
    44: "And there's my…",
    45: "the whole debugging process,",
    46: "and how it was deployed.",
    47: "You can all come and see.",
    48: "And you might learn something too.",
    49: "The TRAE community has lots of people.",
    50: "You can look at what they've made.",
    51: "You can borrow the ideas.",
    52: "I think with learning…",
    53: "we all learn together,",
    54: "learn from each other,",
    55: "and encourage each other.",
}

if __name__ == "__main__":
    main()
