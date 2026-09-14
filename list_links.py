import json
from pathlib import Path

p = json.loads(Path(r"C:\Users\MihaiPostolache\Downloads\kpisss\jira_map\edp_match.json").read_text(encoding="utf-8"))
linked = []
unlinked = []
for m in p["matches"]:
    epps = [l["key"] for l in m["edp"]["links"] if (l.get("key") or "").startswith("EPP-")]
    row = {
        "key": m["edp"]["key"],
        "summary": m["edp"]["summary"],
        "status": m["edp"]["status"],
        "roadmap": m["excel"]["roadmap"],
        "product": m["excel"]["product"],
        "active": m["excel"]["active"],
        "epps": epps,
    }
    (linked if epps else unlinked).append(row)

print("LINKED", len(linked))
for r in linked:
    print(f"  {r['key']} [{r['roadmap'] or '-'}] {r['summary'][:70]} -> {','.join(r['epps'])}")
print("UNLINKED", len(unlinked), "active", sum(1 for r in unlinked if r["active"]))
print("Active unlinked:")
for r in unlinked:
    if r["active"]:
        print(f"  {r['key']} [{r['roadmap']}] {r['summary'][:80]} | {r['product']}")
print("Inactive unlinked count", sum(1 for r in unlinked if not r["active"]))
