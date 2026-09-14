"""Independent KPI computation from Jira CSV + workbook facts we already extracted."""
from __future__ import annotations

import csv
from collections import Counter, defaultdict
from pathlib import Path

csv_path = Path(r"C:\Users\MihaiPostolache\Downloads\KPIs - E21 Discovery Project Jul 8, 2026 04_27 PM.csv")
rows = list(csv.DictReader(csv_path.open(encoding="utf-8-sig")))

ACTIVE = {"Now", "Next", "Later"}
LINES = [
    "BRP as a Service",
    "Power Balancer",
    "Platform",
    "Gas Shipper",
    "Portfolio Management",
    "Supply",
]


def products(r):
    raw = (r.get("Product Name") or "").strip()
    if not raw:
        return []
    return [p.strip() for p in raw.split(",") if p.strip()]


print("CSV rows", len(rows))
print("Roadmap", Counter((r["Roadmap"] or "(empty)") for r in rows))
print("Customer Problem all", Counter((r["Customer Problem"] or "(empty)") for r in rows))
print("Origin all", Counter((r["Origin"] or "(empty)") for r in rows))
print("Business Case all", Counter((r["Business Case"] or "(empty)") for r in rows))
print("Planned PI all", Counter((r["Planned PI"] or "(empty)") for r in rows))

active = [r for r in rows if r["Roadmap"] in ACTIVE]
print("\nActive", len(active))
print("Roadmap active", Counter(r["Roadmap"] for r in active))
print("CP active", Counter((r["Customer Problem"] or "(empty)") for r in active))
print("Origin active", Counter((r["Origin"] or "(empty)") for r in active))
print("BC active", Counter((r["Business Case"] or "(empty)") for r in active))
print("PI active", Counter((r["Planned PI"] or "(empty)") for r in active))

untagged = [r for r in active if not products(r)]
print("\nUntagged active", len(untagged))
for r in untagged:
    print(" -", r["Summary"], "|", r["Roadmap"], r["Customer Problem"], r["Origin"], r["Business Case"], r["Planned PI"])

multi = [r for r in active if len(products(r)) > 1]
print("\nMulti-tagged active", len(multi))
for r in multi:
    print(" -", r["Summary"], products(r), r["Roadmap"], r["Customer Problem"], r["Origin"], r["Business Case"], r["Planned PI"])


def ratio(items, num_pred, den_pred):
    den = [r for r in items if den_pred(r)]
    num = [r for r in den if num_pred(r)]
    if not den:
        return None, 0, 0, len(items)
    return len(num) / len(den), len(num), len(den), len(items)


metrics = {
    "Customer problem approved": (
        lambda r: r["Customer Problem"] == "Approved",
        lambda r: (r["Customer Problem"] or "") != "",
    ),
    "Product-led share": (
        lambda r: r["Origin"] == "Product-led",
        lambda r: (r["Origin"] or "") != "",
    ),
    "Business case approved": (
        lambda r: r["Business Case"] == "Approved",
        lambda r: (r["Business Case"] or "") != "",
    ),
    "Delivered on plan": (
        lambda r: r["Planned PI"] == "Delivered on Plan",
        lambda r: r["Planned PI"] in ("Delivered on Plan", "Missed"),
    ),
}

print("\n=== POOLED (active) ===")
for name, (n, d) in metrics.items():
    pct, num, den, pop = ratio(active, n, d)
    cov = den / pop if pop else None
    print(f"{name}: {num}/{den} = {pct:.4f} coverage={cov:.3f} pop={pop} excluded={pop-den}")

print("\n=== BY LINE (active membership via substring, overlapping) ===")
by_line = {}
for line in LINES:
    members = [r for r in active if any(line == p or line in p for p in products(r))]
    # exact membership like SEARCH: substring of Product Name field
    members2 = [r for r in active if line in (r["Product Name"] or "")]
    by_line[line] = members2
    print(f"\n{line}: items={len(members2)}")
    for name, (n, d) in metrics.items():
        pct, num, den, pop = ratio(members2, n, d)
        if pct is None:
            print(f"  {name}: NO SCORE den=0 pop={pop}")
        else:
            print(f"  {name}: {num}/{den} = {pct:.4f}")

print("\n=== EQUAL PEER ===")
for name, (n, d) in metrics.items():
    scores = []
    for line in LINES:
        pct, num, den, pop = ratio(by_line[line], n, d)
        if pct is not None:
            scores.append((line, pct, pop))
    avg = sum(s[1] for s in scores) / len(scores)
    print(f"{name}: {avg:.4f} groups={len(scores)} {[round(s[1],3) for s in scores]}")
    scores2 = [s for s in scores if s[2] >= 2]
    avg2 = sum(s[1] for s in scores2) / len(scores2)
    print(f"  min2: {avg2:.4f} groups={len(scores2)} {[s[0] for s in scores2]}")

print("\n=== WRONG original method: divide by all 94 ===")
all_items = rows
for name, (n, d) in metrics.items():
    num = sum(1 for r in all_items if n(r))
    print(f"{name}: {num}/94 = {num/94:.4f}  (true pooled uses active+assignment)")

print("\n=== Group-sum pooled trap for delivered ===")
nfun, dfun = metrics["Delivered on plan"]
gn = gd = 0
for line in LINES:
    items = by_line[line]
    den = [r for r in items if dfun(r)]
    num = [r for r in den if nfun(r)]
    gn += len(num)
    gd += len(den)
print(f"sum of groups {gn}/{gd}")
pct, num, den, pop = ratio(active, nfun, dfun)
print(f"true pooled {num}/{den}")

# SEARCH collision
print("\n=== SEARCH collisions ===")
for r in rows:
    name = r.get("Product Name") or ""
    hits = [line for line in LINES if line in name]
    exact = products(r)
    if set(hits) != set(exact) and (hits or exact):
        print(" mismatch", r["Summary"], "field=", name, "search=", hits, "split=", exact)
print("done")
