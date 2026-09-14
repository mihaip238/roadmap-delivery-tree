"""Compact EPP-child (Feature) dumps and emit parent-in JQL batches for stories."""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

CHILD_DUMPS = [
    Path(r"C:\Users\MihaiPostolache\.cursor\projects\c-Users-MihaiPostolache-Downloads-kpisss\agent-tools\a982b04d-863c-4ede-8fe9-5db1efa9a466.txt"),
    Path(r"C:\Users\MihaiPostolache\.cursor\projects\c-Users-MihaiPostolache-Downloads-kpisss\agent-tools\bf4224a0-c2cc-43c4-8a5f-c5248410931e.txt"),
]
OUT = Path(r"C:\Users\MihaiPostolache\Downloads\kpisss\jira_map\features_under_linked_epps.json")


def compact(path: Path):
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = []
    for iss in data.get("issues") or []:
        f = iss.get("fields") or {}
        parent = f.get("parent") or {}
        rows.append({
            "key": iss.get("key"),
            "summary": f.get("summary"),
            "issuetype": (f.get("issuetype") or {}).get("name"),
            "status": (f.get("status") or {}).get("name"),
            "project": (f.get("project") or {}).get("key"),
            "parent_key": parent.get("key"),
            "parent_summary": (parent.get("fields") or {}).get("summary"),
        })
    return rows, data.get("isLast"), data.get("nextPageToken")


all_rows = []
for p in CHILD_DUMPS:
    rows, last, token = compact(p)
    print(p.name, len(rows), "isLast", last, "token", bool(token))
    all_rows.extend(rows)

by_type = Counter(r["issuetype"] for r in all_rows)
by_proj = Counter(r["project"] for r in all_rows)
by_parent = Counter(r["parent_key"] for r in all_rows)
print("total children", len(all_rows), "types", dict(by_type), "projects", dict(by_proj))
print("parents with children", len(by_parent), "of 65 EPPs")

feature_keys = [r["key"] for r in all_rows if r["issuetype"] in {"Feature", "Testing Activities", "Technical Implementation", "Software Issue"}]
# actually get stories under ALL children that can have children (hierarchy 1)
story_parents = [r["key"] for r in all_rows]
print("story parent candidates", len(story_parents))

OUT.write_text(json.dumps({"children": all_rows, "story_parent_keys": story_parents}, indent=2, ensure_ascii=False), encoding="utf-8")

# print JQL batches of 40
batch = 40
for i in range(0, len(story_parents), batch):
    chunk = story_parents[i:i+batch]
    print(f"BATCH {i//batch+1} n={len(chunk)}")
    print("parent in (" + ", ".join(chunk) + ")")
