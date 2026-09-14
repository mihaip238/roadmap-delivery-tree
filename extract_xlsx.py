"""Stdlib-only extraction of xlsx structure, shared strings, and formulas."""
from __future__ import annotations

import json
import re
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "c": "http://schemas.openxmlformats.org/drawingml/2006/chart",
}

XLSX = Path(r"C:\Users\MihaiPostolache\Downloads\E21_Discovery_KPI_Tracker_ALL PRODUCTS_BO_June KPIs (1).xlsx")
OUT = Path(r"C:\Users\MihaiPostolache\Downloads\kpisss\workbook_analysis.json")
LISTING = Path(r"C:\Users\MihaiPostolache\Downloads\kpisss\xlsx_listing.txt")

COL_RE = re.compile(r"^([A-Z]+)")


def col_to_n(col: str) -> int:
    n = 0
    for ch in col:
        n = n * 26 + (ord(ch) - 64)
    return n


def load_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    strings = []
    for si in root.findall("m:si", NS):
        texts = [t.text or "" for t in si.findall(".//m:t", NS)]
        strings.append("".join(texts))
    return strings


def parse_sheet(xml_bytes: bytes, sst: list[str]) -> dict:
    root = ET.fromstring(xml_bytes)
    dim = root.find("m:dimension", NS)
    dimension = dim.get("ref") if dim is not None else None
    freeze = None
    sheet_view = root.find(".//m:sheetView", NS)
    if sheet_view is not None:
        pane = sheet_view.find("m:pane", NS)
        if pane is not None:
            freeze = pane.attrib
    merge = [m.get("ref") for m in root.findall(".//m:mergeCell", NS)]
    tables_in_sheet = [t.attrib for t in root.findall(".//m:tablePart", NS)]

    cells = {}
    formulas = []
    formula_counter = Counter()
    max_row = 0
    max_col = 0
    nonempty = 0

    for c in root.findall(".//m:c", NS):
        ref = c.get("r")
        if not ref:
            continue
        col_letters = COL_RE.match(ref).group(1)
        row = int(ref[len(col_letters):])
        coln = col_to_n(col_letters)
        max_row = max(max_row, row)
        max_col = max(max_col, coln)
        t = c.get("t")
        f_el = c.find("m:f", NS)
        v_el = c.find("m:v", NS)
        is_el = c.find("m:is", NS)
        value = None
        formula = None
        if f_el is not None:
            formula = (f_el.text or "") + ((" " + json.dumps(f_el.attrib)) if f_el.attrib else "")
            if f_el.get("t") == "shared" and not f_el.text:
                formula = f"[shared {f_el.attrib}]"
        if t == "s" and v_el is not None and v_el.text:
            try:
                value = sst[int(v_el.text)]
            except Exception:
                value = v_el.text
        elif t == "inlineStr" and is_el is not None:
            value = "".join(x.text or "" for x in is_el.findall(".//m:t", NS))
        elif t == "b" and v_el is not None:
            value = v_el.text == "1"
        elif v_el is not None:
            value = v_el.text
        if formula or value is not None:
            nonempty += 1
            cells[ref] = {"formula": formula, "value": value, "type": t}
            if formula:
                formulas.append({"addr": ref, "formula": formula, "cached": value})
                formula_counter[formula.split(" ")[0] if formula.startswith("[") else formula] += 1

    # header + first 30 rows as grid of used cells
    preview_rows = []
    for r in range(1, min(max_row, 35) + 1):
        row_cells = []
        for c in range(1, min(max_col, 30) + 1):
            letters = ""
            n = c
            while n:
                n, rem = divmod(n - 1, 26)
                letters = chr(65 + rem) + letters
            ref = f"{letters}{r}"
            if ref in cells:
                item = dict(cells[ref])
                item["addr"] = ref
                row_cells.append(item)
        if row_cells:
            preview_rows.append(row_cells)

    tail_rows = []
    if max_row > 35:
        for r in range(max(1, max_row - 20), max_row + 1):
            row_cells = []
            for c in range(1, min(max_col, 30) + 1):
                letters = ""
                n = c
                while n:
                    n, rem = divmod(n - 1, 26)
                    letters = chr(65 + rem) + letters
                ref = f"{letters}{r}"
                if ref in cells:
                    item = dict(cells[ref])
                    item["addr"] = ref
                    row_cells.append(item)
            if row_cells:
                tail_rows.append(row_cells)

    # collect unique formulas (normalize row numbers somewhat)
    return {
        "dimension": dimension,
        "max_row": max_row,
        "max_col": max_col,
        "nonempty": nonempty,
        "freeze": freeze,
        "merged": merge,
        "table_parts": tables_in_sheet,
        "formula_count": len(formulas),
        "unique_formulas": formula_counter.most_common(80),
        "all_formulas": formulas,
        "preview": preview_rows,
        "tail": tail_rows,
        "headers": preview_rows[0] if preview_rows else [],
    }


def parse_workbook(zf: zipfile.ZipFile) -> dict:
    root = ET.fromstring(zf.read("xl/workbook.xml"))
    sheets = []
    for sh in root.findall("m:sheets/m:sheet", NS):
        sheets.append({
            "name": sh.get("name"),
            "sheetId": sh.get("sheetId"),
            "rid": sh.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"),
            "state": sh.get("state"),
        })
    names = []
    for dn in root.findall("m:definedNames/m:definedName", NS):
        names.append({"name": dn.get("name"), "hidden": dn.get("hidden"), "text": (dn.text or "")[:500]})
    return {"sheets": sheets, "defined_names": names}


def parse_rels(zf: zipfile.ZipFile) -> dict:
    root = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    rels = {}
    ns = {"pr": "http://schemas.openxmlformats.org/package/2006/relationships"}
    for rel in root.findall("pr:Relationship", ns):
        rels[rel.get("Id")] = {"target": rel.get("Target"), "type": rel.get("Type")}
    return rels


def parse_table(xml_bytes: bytes) -> dict:
    root = ET.fromstring(xml_bytes)
    cols = [c.get("name") for c in root.findall(".//m:tableColumn", NS)]
    return {
        "name": root.get("name"),
        "displayName": root.get("displayName"),
        "ref": root.get("ref"),
        "headerRowCount": root.get("headerRowCount"),
        "totalsRowCount": root.get("totalsRowCount"),
        "columns": cols,
    }


def parse_chart(xml_bytes: bytes) -> dict:
    root = ET.fromstring(xml_bytes)
    titles = [t.text or "" for t in root.findall(".//{http://schemas.openxmlformats.org/drawingml/2006/chart}tx//{http://schemas.openxmlformats.org/drawingml/2006/main}t")]
    f_cache = [f.text for f in root.findall(".//{http://schemas.openxmlformats.org/officeDocument/2006/relationships}f") if False]
    formulas = [f.text for f in root.iter() if f.tag.endswith("}f") and f.text]
    types = sorted({el.tag.split("}")[-1] for el in root.iter() if el.tag.endswith("Chart")})
    return {"title_parts": titles[:10], "formulas": formulas[:40], "chart_types": types}


def main():
    print("opening", XLSX, "size", XLSX.stat().st_size)
    with zipfile.ZipFile(XLSX) as zf:
        listing = "\n".join(sorted(zf.namelist()))
        LISTING.write_text(listing, encoding="utf-8")
        print("entries", len(zf.namelist()))
        sst = load_shared_strings(zf)
        print("shared strings", len(sst))
        wb = parse_workbook(zf)
        rels = parse_rels(zf)

        tables = {}
        charts = {}
        drawings = {}
        for name in zf.namelist():
            if name.startswith("xl/tables/") and name.endswith(".xml"):
                tables[name] = parse_table(zf.read(name))
            elif name.startswith("xl/charts/") and name.endswith(".xml") and "/_rels/" not in name:
                try:
                    charts[name] = parse_chart(zf.read(name))
                except Exception as e:
                    charts[name] = {"error": str(e)}
            elif name.startswith("xl/drawings/") and name.endswith(".xml") and "/_rels/" not in name:
                drawings[name] = zf.read(name).decode("utf-8", errors="replace")[:2000]

        sheet_results = []
        for sh in wb["sheets"]:
            target = rels[sh["rid"]]["target"]
            if not target.startswith("xl/"):
                path = "xl/" + target.lstrip("/")
            else:
                path = target
            # targets are like worksheets/sheet1.xml
            if not path.startswith("xl/"):
                path = "xl/" + path
            print("sheet", sh["name"], path)
            parsed = parse_sheet(zf.read(path), sst)
            parsed["name"] = sh["name"]
            parsed["state"] = sh["state"]
            parsed["path"] = path
            sheet_results.append(parsed)
            print("  ", parsed["max_row"], "x", parsed["max_col"], "formulas", parsed["formula_count"], "nonempty", parsed["nonempty"])

        result = {
            "file": str(XLSX),
            "size": XLSX.stat().st_size,
            "workbook": wb,
            "rels": rels,
            "tables": tables,
            "charts": charts,
            "drawing_snippets": drawings,
            "shared_string_count": len(sst),
            "shared_strings_sample": sst[:80],
            "sheets": sheet_results,
        }
        OUT.write_text(json.dumps(result, default=str, indent=2), encoding="utf-8")
        print("wrote", OUT, OUT.stat().st_size)


if __name__ == "__main__":
    main()
