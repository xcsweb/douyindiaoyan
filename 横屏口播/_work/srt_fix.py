# -*- coding: utf-8 -*-
"""按 20 字上限拆分过长的字幕条，时间按字数比例切分。"""
import re
from pathlib import Path

SRT = Path(r"d:\backup-zips\www\douyindiaoyan\横屏口播\_work\master\master.srt")
LIMIT = 20


def to_ms(t: str) -> int:
    h, m, rest = t.split(":")
    s, ms = rest.split(",")
    return ((int(h) * 60 + int(m)) * 60 + int(s)) * 1000 + int(ms)


def to_ts(ms: int) -> str:
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def split_text(text: str):
    """在标点处尽量平均地切成两段，每段不超过 LIMIT。"""
    if len(text) <= LIMIT:
        return [text]
    marks = [m.start() for m in re.finditer(r"[，、；：]", text)]
    if not marks:
        return [text]
    target = len(text) / 2
    cut = min(marks, key=lambda i: abs(i - target))
    left, right = text[:cut + 1], text[cut + 1:]
    return [left, right] if right else [text]


blocks = SRT.read_text(encoding="utf-8").strip().split("\n\n")
out, idx = [], 1
for b in blocks:
    lines = b.split("\n")
    if len(lines) < 3:
        continue
    a, bb = lines[1].split(" --> ")
    text = "\n".join(lines[2:]).strip()
    parts = split_text(text)
    if len(parts) == 1:
        out.append(f"{idx}\n{to_ts(to_ms(a))} --> {to_ts(to_ms(bb))}\n{text}")
        idx += 1
        continue
    t0, t1 = to_ms(a), to_ms(bb)
    total = sum(len(p) for p in parts)
    cur = t0
    for p in parts:
        seg = int((t1 - t0) * len(p) / total)
        nxt = min(t1, cur + seg)
        out.append(f"{idx}\n{to_ts(cur)} --> {to_ts(nxt)}\n{p}")
        idx += 1
        cur = nxt

SRT.write_text("\n\n".join(out) + "\n", encoding="utf-8")
longest = max((len(l) for b in out for l in b.split("\n")[2:]), default=0)
print(f"字幕 {idx - 1} 条，最长一行 {longest} 字")
