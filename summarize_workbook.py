"""Produce a readable summary of workbook formulas by sheet."""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

src = Path(r"C:\Users\MihaiPostolache\Downloads\kpisss\workbook_analysis.json")
out = Path(r"C:\Users\MihaiPostolache\Downloads\kpisss\workbook_summary.md")
data = json.loads(src.read_text(encoding="utf-8"))

lines = []
def p(s=""):
    lines.append(s)

p(f"# Workbook analysis")
p(f"File: `{data['file']}` ({data['size']} bytes)")
p(f"Sheets: {', '.join(s['name'] for s in data['sheets'])}")
p()
p("## Tables")
p(json.dumps(data.get("tables"), indent=2))
p()
p("## Charts")
p(json.dumps(data.get("charts"), indent=2)[:4000])
p()
p("## Defined names")
p(json.dumps(data.get("workbook", {}).get("defined_names"), indent=2))
p()

for sh in data["sheets"]:
    p(f"## Sheet: {sh['name']}")
    p(f"- dim={sh['dimension']} max={sh['max_row']}x{sh['max_col']} nonempty={sh['nonempty']} formulas={sh['formula_count']}")
    p(f"- freeze={sh['freeze']} merged={sh['merged']}")
    p()
    p("### Unique formulas (top)")
    for f, n in sh["unique_formulas"][:50]:
        p(f"- ({n}x) `{f}`")
    p()
    p("### Preview (row-wise)")
    for row in sh["preview"]:
        parts = []
        for c in row:
            addr = c["addr"]
            if c.get("formula"):
                parts.append(f"{addr}: FORMULA {c['formula']} => {c.get('value')}")
            else:
                val = c.get("value")
                if val is not None and str(val).strip() != "":
                    parts.append(f"{addr}: {val}")
        if parts:
            p("- " + " | ".join(parts))
    p()
    if sh.get("tail"):
        p("### Tail")
        for row in sh["tail"]:
            parts = []
            for c in row:
                addr = c["addr"]
                if c.get("formula"):
                    parts.append(f"{addr}: FORMULA {c['formula']} => {c.get('value')}")
                else:
                    val = c.get("value")
                    if val is not None and str(val).strip() != "":
                        parts.append(f"{addr}: {val}")
            if parts:
                p("- " + " | ".join(parts))
        p()

    # For item sheets, dump ALL unique formula templates by column
    if sh["name"] in ("EBASE items", "Non-EBASE items", "KPI Dashboard", "Overall"):
        by_col = defaultdict(Counter)
        for f in sh["all_formulas"]:
            col = "".join(ch for ch in f["addr"] if ch.isalpha())
            by_col[col][f["formula"]] += 1
        p("### Formulas by column")
        for col in sorted(by_col, key=lambda x: (len(x), x)):
            p(f"#### Column {col}")
            for formula, n in by_col[col].most_common(15):
                p(f"- ({n}x) `{formula}`")
        p()

out.write_text("\n".join(lines), encoding="utf-8")
print("wrote", out, out.stat().st_size)
