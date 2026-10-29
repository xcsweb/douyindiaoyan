"""Resolve media only through the selected group's typed slot paths.

Names such as result/detail/evidence also occur in plain text and source refs.
Leaf-name guessing must never turn those strings into file paths.
"""
from copy import deepcopy

# This adapter's contract has only these bound media types. A new scalar type
# must remain a value until its media semantics are deliberately implemented.
MEDIA_SLOT_TYPES = frozenset({'video', 'wall-sprites'})

def resolve_candidate_media(candidate,contract,resolve_path):
    data=deepcopy(candidate)
    if not isinstance(data,dict) or not isinstance(contract,dict):return data
    def transform(root,path):
        parts=path.split('.');cur=root
        for part in parts[:-1]:
            if isinstance(cur,dict):cur=cur.get(part)
            elif isinstance(cur,list) and part.isdigit() and int(part)<len(cur):cur=cur[int(part)]
            else:return
            if cur is None:return
        leaf=parts[-1]
        if isinstance(cur,dict) and leaf in cur:
            value=cur[leaf]
            if isinstance(value,str) and value:cur[leaf]=resolve_path(value)
        elif isinstance(cur,list) and leaf.isdigit() and int(leaf)<len(cur):
            value=cur[int(leaf)]
            if isinstance(value,str) and value:cur[int(leaf)]=resolve_path(value)
    for slot in contract.get('slots',[]):
        if slot.get('type') not in MEDIA_SLOT_TYPES:continue
        if isinstance(data.get('inputs'),dict) and slot.get('inputPath'):transform(data['inputs'],slot['inputPath'])
        if isinstance(data.get('slots'),dict):transform(data['slots'],slot['id'])
    return data
