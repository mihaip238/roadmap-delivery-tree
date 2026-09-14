"""Extract structure, formulas, and sample values from the KPI workbook."""
from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

XLSX = Path(r"C:\Users\MihaiPostolache\Downloads\E21_Discovery_KPI_Tracker_ALL PRODUCTS_BO_June KPIs (1).xlsx")
OUT = Path(r"C:\Users\MihaiPostolache\Downloads\kpisss\workbook_analysis.json")

try:
    from openpyxl import load_workbook
    from openpyxl.utils import get_column_letter
except ImportError:
    print("NEED_OPENPYXL", file=sys.stderr)
    sys.exit(2)


def cell_repr(cell):
    v = cell.value
    if v is None:
        return None
    if isinstance(v, str) and v.startswith("="):
        return {"kind": "formula", "formula": v, "cached": getattr(cell, "value", None)}
    return {"kind": "value", "value": v if not isinstance(v, (bytes,)) else repr(v)}


def main():
    print(f"Loading {XLSX} exists={XLSX.exists()} size={XLSX.stat().st_size}")
    wb = load_workbook(XLSX, data_only=False, keep_vba=False)
    wb_values = load_workbook(XLSX, data_only=True, keep_vba=False)

    sheets = []
    for ws in wb.worksheets:
        ws_val = wb_values[ws.title]
        formulas = []
        values_sample = []
        unique_formulas = Counter()
        formula_patterns = Counter()
        nonempty = 0
        max_row = ws.max_row or 0
        max_col = ws.max_column or 0

        # header row
        headers = []
        for col in range(1, min(max_col, 80) + 1):
            headers.append({"col": get_column_letter(col), "n": col, "value": ws.cell(1, col).value})

        for row in ws.iter_rows(min_row=1, max_row=max_row, max_col=min(max_col, 80)):
            for cell in row:
                if cell.value is None:
                    continue
                nonempty += 1
                if isinstance(cell.value, str) and cell.value.startswith("="):
                    f = cell.value
                    unique_formulas[f] += 1
                    # normalize numbers in formula for pattern
                    formulas.append({
                        "addr": cell.coordinate,
                        "formula": f,
                        "cached": ws_val[cell.coordinate].value,
                    })
                elif cell.row <= 40 or (cell.row <= 5):
                    pass

        # first 25 rows of values
        grid = []
        for r in range(1, min(max_row, 25) + 1):
            row_vals = []
            for c in range(1, min(max_col, 40) + 1):
                raw = ws.cell(r, c).value
                cached = ws_val.cell(r, c).value
                if raw is None and cached is None:
                    row_vals.append(None)
                else:
                    row_vals.append({
                        "addr": f"{get_column_letter(c)}{r}",
                        "raw": raw if not isinstance(raw, str) or len(raw) < 500 else raw[:500] + "…",
                        "cached": cached,
                    })
            grid.append(row_vals)

        merged = [str(m) for m in ws.merged_cells.ranges]
        charts = []
        if hasattr(ws, "_charts"):
            for ch in ws._charts:
                charts.append({
                    "type": type(ch).__name__,
                    "title": str(getattr(ch, "title", None)),
                    "anchor": str(getattr(ch, "anchor", None)),
                })

        tables = []
        if hasattr(ws, "tables"):
            for name, t in ws.tables.items():
                tables.append({"name": name, "ref": t.ref, "displayName": getattr(t, "displayName", None)})

        # data validations
        dvs = []
        if ws.data_validations:
            for dv in ws.data_validations.dataValidation:
                dvs.append({"sqref": str(dv.sqref), "type": dv.type, "formula1": dv.formula1})

        # defined names later at workbook level
        sheets.append({
            "title": ws.title,
            "sheet_state": ws.sheet_state,
            "max_row": max_row,
            "max_col": max_col,
            "nonempty": nonempty,
            "merged": merged[:50],
            "charts": charts,
            "tables": tables,
            "validations": dvs[:30],
            "headers": headers,
            "unique_formula_count": len(unique_formulas),
            "top_formulas": unique_formulas.most_common(40),
            "all_formulas": formulas[:400],
            "grid_preview": grid,
            "freeze": str(ws.freeze_panes),
            "print_title": str(ws.print_title_rows),
        })

        print(f"Sheet: {ws.title!r} {max_row}x{max_col} nonempty={nonempty} formulas={len(formulas)} unique={len(unique_formulas)} charts={len(charts)} tables={len(tables)}")

    names = []
    for dn in wb.defined_names.definedName:
        names.append({"name": dn.name, "attr": dn.attr_text, "hidden": dn.hidden})

    # also dump last ~15 rows of each sheet for totals
    tails = {}
    for ws in wb.worksheets:
        ws_val = wb_values[ws.title]
        max_row = ws.max_row or 0
        max_col = min(ws.max_column or 0, 40)
        start = max(1, max_row - 15)
        tail = []
        for r in range(start, max_row + 1):
            row = []
            for c in range(1, max_col + 1):
                raw = ws.cell(r, c).value
                cached = ws_val.cell(r, c).value
                if raw is None and cached is None:
                    continue
                row.append({
                    "addr": f"{get_column_letter(c)}{r}",
                    "raw": raw if not isinstance(raw, str) or len(raw) < 400 else raw[:400] + "…",
                    "cached": cached,
                })
            if row:
                tail.append(row)
        tails[ws.title] = tail

    result = {
        "file": str(XLSX),
        "size": XLSX.stat().st_size,
        "sheetnames": wb.sheetnames,
        "defined_names": names,
        "sheets": sheets,
        "tails": tails,
    }
    OUT.write_text(json.dumps(result, default=str, indent=2), encoding="utf-8")
    print(f"Wrote {OUT} bytes={OUT.stat().st_size}")


if __name__ == "__main__":
    main()
