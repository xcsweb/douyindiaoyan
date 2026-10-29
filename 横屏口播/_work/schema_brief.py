# -*- coding: utf-8 -*-
"""把 1.5MB 的 params.schema.json 压成易读摘要。"""
import json
import sys
from pathlib import Path

p = Path(sys.argv[1])
d = json.load(open(p, encoding="utf-8-sig"))


def brief(node, depth=0, name="", out=None):
    if out is None:
        out = []
    pad = "  " * depth
    t = node.get("type", "?")
    title = node.get("title") or node.get("name") or ""
    desc = (node.get("description") or "").replace("\n", " ")
    if len(desc) > 150:
        desc = desc[:150] + "…"
    extra = ""
    if "default" in node:
        extra += f" default={node['default']!r}"
    if "enum" in node:
        extra += f" enum={node['enum']}"
    if depth <= 2:
        out.append(f"{pad}- {name} [{t}] {title}{extra}")
        if desc:
            out.append(f"{pad}  {desc}")
    if t == "object" and "properties" in node and depth < 2:
        req = set(node.get("required") or [])
        for k, v in node["properties"].items():
            brief(v, depth + 1, k + ("*" if k in req else ""), out)
    elif t == "array" and isinstance(node.get("items"), dict) and depth < 2:
        brief(node["items"], depth + 1, name + "[]", out)
    return out


root = d
for key in ("properties", "schema", "$defs"):
    if key in root and isinstance(root[key], dict) and "properties" in root[key]:
        root = root[key]
        break

lines = []
lines.append(f"# root keys: {sorted(d.keys())}")
lines.append(f"# title: {d.get('title')}")
lines.append(f"# required: {d.get('required')}")
lines.append("")
for k, v in root.get("properties", {}).items():
    lines.extend(brief(v, 0, k))

print("\n".join(lines))
