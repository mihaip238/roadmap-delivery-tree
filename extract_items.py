"""Extract all named items from the KPI workbook + Jira CSV."""
from __future__ import annotations

import csv
import json
from pathlib import Path

CSV = Path(r"C:\Users\MihaiPostolache\Downloads\KPIs - E21 Discovery Project Jul 8, 2026 04_27 PM.csv")
DUMP = Path(r"C:\Users\MihaiPostolache\Downloads\kpisss\sheet_dump.txt")
OUT = Path(r"C:\Users\MihaiPostolache\Downloads\kpisss\excel_items.json")

rows = list(csv.DictReader(CSV.open(encoding="utf-8-sig")))
ebase = []
seen_summaries = set()
for r in rows:
    name = (r.get("Summary") or "").strip()
    if not name:
        continue
    if name in seen_summaries:
        continue
    seen_summaries.add(name)
    ebase.append({
        "source": "EBASE items / Jira CSV",
        "summary": name,
        "product": (r.get("Product Name") or "").strip(),
        "roadmap": (r.get("Roadmap") or "").strip(),
        "customer_problem": (r.get("Customer Problem") or "").strip(),
        "origin": (r.get("Origin") or "").strip(),
        "business_case": (r.get("Business Case") or "").strip(),
        "planned_pi": (r.get("Planned PI") or "").strip(),
        "active": (r.get("Roadmap") or "") in {"Now", "Next", "Later"},
    })

# Non-EBASE from dump: rows with a real summary that isn't None/JULES/GRIDHUB/Count
non = []
# We'll parse from dump lines R2-R27 Ecedo, R34-R36 Jules, R44-R45 Gridhub
text = DUMP.read_text(encoding="utf-8")
family = "Ecedo"
for line in text.splitlines():
    if not line.startswith("R"):
        continue
    if "A33[V] JULES" in line:
        family = "Jules"
        continue
    if "A43[V] GRIDHUB" in line:
        family = "Gridhub"
        continue
    if "A1[V] Summary" in line:
        continue
    # extract A and B and C
    def grab(tag):
        import re
        m = re.search(rf"{tag}\d*\[V\] ([^|]+)", line)
        return m.group(1).strip() if m else ""
    a = grab("A")
    b = grab("B")
    c = grab("C")
    d = grab("D")
    e = grab("E")
    f = grab("F")
    g = grab("G")
    skip = {"", "None", "JULES", "GRIDHUB", "Summary", "Count", "Count base", "KPI%"}
    if a in skip:
        continue
    if not line.startswith("R") or "||" not in line:
        continue
    # only item rows in Non-EBASE section: before Overall
    if line.startswith("=== Overall"):
        break
    # dump starts with Non-EBASE
    if "FORMULA" in line and "A" not in line[:20]:
        continue
    # Heuristic: item rows have Product Name Ecedo/Jules/Gridhub
    if b in {"Ecedo", "Jules", "Gridhub"}:
        non.append({
            "source": "Non-EBASE items",
            "family": b,
            "summary": a,
            "product": b,
            "roadmap": c,
            "customer_problem": d,
            "origin": e,
            "business_case": f,
            "planned_pi": g,
            "active": c in {"Now", "Next", "Later"},
        })

eet = []
# from workbook_summary mapping preview - parse from extract json if needed
# Use workbook_analysis.json sheets EET
analysis = json.loads(Path(r"C:\Users\MihaiPostolache\Downloads\kpisss\workbook_analysis.json").read_text(encoding="utf-8"))
for sh in analysis["sheets"]:
    if sh["name"] != "EET_Mapping_EDPs":
        continue
    # reconstruct from preview+tail cells
    rows_map = {}
    for block in (sh.get("preview") or []) + (sh.get("tail") or []):
        for c in block:
            addr = c["addr"]
            import re
            m = re.match(r"([A-Z]+)(\d+)", addr)
            col, r = m.group(1), int(m.group(2))
            rows_map.setdefault(r, {})[col] = c.get("value")
    for r, cols in sorted(rows_map.items()):
        if r == 1:
            continue
        feat = (cols.get("A") or "").strip()
        if not feat:
            continue
        mapped = cols.get("D") or ""
        mapped_list = [x.strip() for x in str(mapped).split("\n") if x.strip()]
        eet.append({
            "source": "EET_Mapping_EDPs",
            "eet_feature": feat,
            "area": cols.get("B"),
            "status": cols.get("C"),
            "mapped_edps": mapped_list,
        })

payload = {
    "ebase_count": len(ebase),
    "non_ebase_count": len(non),
    "eet_count": len(eet),
    "ebase": ebase,
    "non_ebase": non,
    "eet": eet,
    "all_summaries": sorted({x["summary"] for x in ebase + non}),
}
OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
print("ebase", len(ebase), "non", len(non), "eet", len(eet), "unique summaries", len(payload["all_summaries"]))
for x in non:
    print(" NON", x["family"], x["summary"])
print("--- EET no EDP", sum(1 for x in eet if (x.get("status") or "").lower() == "no edp"))
print("wrote", OUT)
