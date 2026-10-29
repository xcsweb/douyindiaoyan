# -*- coding: utf-8 -*-
"""汇总 8 段转写结果，打印并写出 转写汇总.md。"""
import glob
import json
import os
from pathlib import Path

TRANS_DIR = Path(r"d:\backup-zips\www\douyindiaoyan\横屏口播\_work\transcript")

rows = []
for p in sorted(glob.glob(str(TRANS_DIR / "*.json"))):
    d = json.load(open(p, encoding="utf-8"))
    rows.append(d)

lines = ["# 8 段口播转写汇总", "", "| 文件 | 时长(s) | 段数 |", "|---|---|---|"]
for d in rows:
    lines.append(f"| {d['file']} | {d['duration']:.2f} | {len(d['segments'])} |")
lines.append("")

total = 0.0
for d in rows:
    total += d["duration"]
    lines.append(f"## {d['file']}  ·  {d['duration']:.2f}s")
    lines.append("")
    for s in d["segments"]:
        lines.append(f"- `{s['start']:.2f} - {s['end']:.2f}`  {s['text']}")
    lines.append("")

lines.append(f"**总时长：{total:.2f}s**")

out = TRANS_DIR / "转写汇总.md"
out.write_text("\n".join(lines), encoding="utf-8")
print("\n".join(lines))
