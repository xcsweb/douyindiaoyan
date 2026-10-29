# -*- coding: utf-8 -*-
"""汇总录屏 freezedetect 结果：冻结总时长、最长卡死、覆盖率、可用区间。"""
import re
import sys
from pathlib import Path

WORK = Path(r"d:\backup-zips\www\douyindiaoyan\横屏口播\_work")
DUR = {
    "2026-10-28 17-13-00": 34.05,
    "2026-10-28 17-13-45": 6.05,
    "2026-10-28 17-14-00": 14.20,
    "2026-10-28 17-14-26": 23.18,
    "2026-10-28 17-15-05": 6.78,
}

for txt in sorted(WORK.glob("*-freeze.txt")):
    name = txt.name.replace("-freeze.txt", "")
    raw = txt.read_text(encoding="utf-8-sig", errors="replace")
    dur_total = DUR.get(name, 0.0)
    freezes = []
    cur = {}
    for line in raw.splitlines():
        m = re.search(r"freeze_start: ([\d.]+)", line)
        if m:
            cur = {"start": float(m.group(1))}
            continue
        m = re.search(r"freeze_duration: ([\d.]+)", line)
        if m and cur:
            cur["dur"] = float(m.group(1))
            continue
        m = re.search(r"freeze_end: ([\d.]+)", line)
        if m and cur:
            cur["end"] = float(m.group(1))
            freezes.append(cur)
            cur = {}

    frozen = sum(f.get("dur", 0) for f in freezes)
    longest = max((f.get("dur", 0) for f in freezes), default=0)
    ratio = frozen / dur_total * 100 if dur_total else 0
    print(f"{name}  时长 {dur_total:5.2f}s  冻结 {frozen:5.2f}s ({ratio:4.1f}%)  "
          f"最长 {longest:.2f}s  片段数 {len(freezes)}")
    bad = [f for f in freezes if f.get("dur", 0) >= 0.5]
    for f in bad:
        print(f"    卡死 {f['start']:.2f} → {f.get('end', 0):.2f}  ({f['dur']:.2f}s)")
