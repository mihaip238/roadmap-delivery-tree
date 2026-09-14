"""Dump Non-EBASE layout and numeric cells; run independent KPI calc."""
from __future__ import annotations

import json
from pathlib import Path

data = json.loads(Path(r"C:\Users\MihaiPostolache\Downloads\kpisss\workbook_analysis.json").read_text(encoding="utf-8"))

# Rebuild cell map from preview+tail is incomplete. Re-parse from all_formulas + we need values.
# The extract stored all_formulas but not all values. Re-extract Non-EBASE from xlsx quickly.

import zipfile
import xml.etree.ElementTree as ET
import re

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
COL_RE = re.compile(r"^([A-Z]+)")
XLSX = Path(r"C:\Users\MihaiPostolache\Downloads\E21_Discovery_KPI_Tracker_ALL PRODUCTS_BO_June KPIs (1).xlsx")


def col_to_n(col: str) -> int:
    n = 0
    for ch in col:
        n = n * 26 + (ord(ch) - 64)
    return n


def n_to_col(n: int) -> str:
    s = ""
    while n:
        n, rem = divmod(n - 1, 26)
        s = chr(65 + rem) + s
    return s


def load_sst(zf):
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    strings = []
    for si in root.findall("m:si", NS):
        texts = [t.text or "" for t in si.findall(".//m:t", NS)]
        strings.append("".join(texts))
    return strings


def parse_cells(xml_bytes, sst):
    root = ET.fromstring(xml_bytes)
    cells = {}
    for c in root.findall(".//m:c", NS):
        ref = c.get("r")
        if not ref:
            continue
        t = c.get("t")
        f_el = c.find("m:f", NS)
        v_el = c.find("m:v", NS)
        formula = f_el.text if f_el is not None else None
        value = None
        if t == "s" and v_el is not None and v_el.text:
            value = sst[int(v_el.text)]
        elif v_el is not None:
            value = v_el.text
        cells[ref] = {"f": formula, "v": value, "t": t}
    return cells


with zipfile.ZipFile(XLSX) as zf:
    sst = load_sst(zf)
    ne = parse_cells(zf.read("xl/worksheets/sheet4.xml"), sst)
    ov = parse_cells(zf.read("xl/worksheets/sheet5.xml"), sst)
    dash = parse_cells(zf.read("xl/worksheets/sheet1.xml"), sst)
    ebase = parse_cells(zf.read("xl/worksheets/sheet3.xml"), sst)

# Non-EBASE: print every used cell grouped by row
rows = {}
for ref, cell in ne.items():
    m = COL_RE.match(ref)
    col, row = m.group(1), int(ref[len(m.group(1)):])
    rows.setdefault(row, {})[col] = cell

out = []
out.append("=== Non-EBASE all used rows ===")
for r in sorted(rows):
    parts = []
    for c in sorted(rows[r], key=lambda x: col_to_n(x)):
        cell = rows[r][c]
        kind = "F" if cell["f"] else "V"
        val = cell["v"]
        f = cell["f"]
        if f:
            parts.append(f"{c}{r}[{kind}] {f} => {val}")
        else:
            parts.append(f"{c}{r}[{kind}] {val}")
    out.append(f"R{r}: " + " || ".join(parts))

out.append("\n=== Overall all cells ===")
orows = {}
for ref, cell in ov.items():
    m = COL_RE.match(ref)
    col, row = m.group(1), int(ref[len(m.group(1)):])
    orows.setdefault(row, {})[col] = cell
for r in sorted(orows):
    parts = []
    for c in sorted(orows[r], key=lambda x: col_to_n(x)):
        cell = orows[r][c]
        kind = "F" if cell["f"] else "V"
        if cell["f"]:
            parts.append(f"{c}{r}[{kind}] {cell['f']} => {cell['v']}")
        else:
            parts.append(f"{c}{r}[{kind}] {cell['v']}")
    out.append(f"R{r}: " + " || ".join(parts))

# EBASE row count, N/O columns, rows 96-106
erows = {}
for ref, cell in ebase.items():
    m = COL_RE.match(ref)
    col, row = m.group(1), int(ref[len(m.group(1)):])
    erows.setdefault(row, {})[col] = cell

out.append("\n=== EBASE columns on row 1 ===")
out.append(" ".join(f"{c}1={erows[1][c]['v']}" for c in sorted(erows[1], key=col_to_n) if 1 in erows))
out.append(f"EBASE last data row with A: {max(r for r in erows if 'A' in erows[r] and erows[r]['A']['v'])}")
out.append(f"EBASE rows with any cell: {min(erows)}-{max(erows)} count={len(erows)}")
# N and O
n_used = [f"{k}={v}" for k,v in ebase.items() if k.startswith("N") or k.startswith("O")]
out.append(f"N/O cells: {n_used[:20]} count={len(n_used)}")

# dashboard F targets
out.append("\n=== Dashboard F column (targets) ===")
for r in range(1, 6):
    ref = f"F{r}"
    out.append(f"{ref}: {dash.get(ref)}")

Path(r"C:\Users\MihaiPostolache\Downloads\kpisss\sheet_dump.txt").write_text("\n".join(out), encoding="utf-8")
print("wrote dump", len(out), "lines")
print("Non-EBASE rows", sorted(rows)[:80], "... total", len(rows))
print("Overall rows", sorted(orows))
