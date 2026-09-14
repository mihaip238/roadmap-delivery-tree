"""Compact EDP Jira search dumps and match to Excel KPI items."""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

DUMPS = [
    Path(r"C:\Users\MihaiPostolache\.cursor\projects\c-Users-MihaiPostolache-Downloads-kpisss\agent-tools\924b24a1-ca96-4c78-a7f0-fe82d758f12c.txt"),
    Path(r"C:\Users\MihaiPostolache\.cursor\projects\c-Users-MihaiPostolache-Downloads-kpisss\agent-tools\717a836e-d856-4260-9ebd-7c390422d0df.txt"),
]
EXCEL = Path(r"C:\Users\MihaiPostolache\Downloads\kpisss\excel_items.json")
OUT_DIR = Path(r"C:\Users\MihaiPostolache\Downloads\kpisss\jira_map")
OUT_DIR.mkdir(exist_ok=True)


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s or "")
    s = s.replace("\u00a0", " ")
    s = re.sub(r"\s+", " ", s).strip().lower()
    s = s.replace("–", "-").replace("—", "-")
    # drop trailing punctuation
    s = s.rstrip(" .")
    return s


def tokens(s: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", norm(s)) if len(t) > 2}


def extract_links(issuelinks):
    out = []
    for link in issuelinks or []:
        t = link.get("type") or {}
        for side in ("inwardIssue", "outwardIssue"):
            issue = link.get(side)
            if not issue:
                continue
            out.append({
                "side": side,
                "link_name": t.get("name"),
                "inward": t.get("inward"),
                "outward": t.get("outward"),
                "key": issue.get("key"),
                "summary": (issue.get("fields") or {}).get("summary"),
                "issuetype": ((issue.get("fields") or {}).get("issuetype") or {}).get("name"),
                "status": ((issue.get("fields") or {}).get("status") or {}).get("name"),
            })
    return out


def compact_search(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    issues = []
    for iss in data.get("issues") or []:
        f = iss.get("fields") or {}
        issues.append({
            "key": iss.get("key"),
            "id": iss.get("id"),
            "summary": f.get("summary"),
            "status": (f.get("status") or {}).get("name"),
            "issuetype": (f.get("issuetype") or {}).get("name"),
            "links": extract_links(f.get("issuelinks")),
        })
    return {
        "path": str(path),
        "count": len(issues),
        "isLast": data.get("isLast"),
        "nextPageToken": data.get("nextPageToken"),
        "issues": issues,
    }


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def main():
    extra = list(OUT_DIR.glob("edp_page_*.json"))
    blobs = []
    for p in DUMPS + extra:
        if p.exists():
            blobs.append(compact_search(p) if p.suffix == ".txt" else json.loads(p.read_text(encoding="utf-8")))

    all_issues = []
    seen = set()
    for b in blobs:
        for iss in b["issues"]:
            if iss["key"] in seen:
                continue
            seen.add(iss["key"])
            all_issues.append(iss)

    excel = json.loads(EXCEL.read_text(encoding="utf-8"))
    items = excel["ebase"]

    by_norm = {}
    for iss in all_issues:
        by_norm.setdefault(norm(iss["summary"]), []).append(iss)

    matches = []
    unmatched = []
    used_keys = set()
    for item in items:
        n = norm(item["summary"])
        hit = None
        conf = "none"
        if n in by_norm:
            hit = by_norm[n][0]
            conf = "exact"
        else:
            # substring / token overlap
            best = None
            best_score = 0.0
            itoks = tokens(item["summary"])
            for iss in all_issues:
                sc = jaccard(itoks, tokens(iss["summary"]))
                # boost if one contains the other
                ns = norm(iss["summary"])
                if n and ns and (n in ns or ns in n) and min(len(n), len(ns)) >= 10:
                    sc = max(sc, 0.85)
                if sc > best_score:
                    best_score = sc
                    best = iss
            if best and best_score >= 0.72:
                hit = best
                conf = f"fuzzy:{best_score:.2f}"
        rec = {
            "excel": item,
            "match_confidence": conf,
            "edp": None if not hit else {
                "key": hit["key"],
                "summary": hit["summary"],
                "status": hit["status"],
                "links": hit["links"],
            },
        }
        if hit:
            used_keys.add(hit["key"])
            matches.append(rec)
        else:
            unmatched.append(rec)

    epp_from_links = []
    for m in matches:
        for link in (m["edp"] or {}).get("links") or []:
            if link["key"] and link["key"].startswith("EPP-"):
                epp_from_links.append(link["key"])

    compact = {
        "edp_loaded": len(all_issues),
        "excel_items": len(items),
        "matched": len(matches),
        "unmatched": len(unmatched),
        "exact": sum(1 for m in matches if m["match_confidence"] == "exact"),
        "fuzzy": sum(1 for m in matches if m["match_confidence"].startswith("fuzzy")),
        "edps_with_epp_link": sum(1 for m in matches if any((l.get("key") or "").startswith("EPP-") for l in (m["edp"] or {}).get("links") or [])),
        "unique_epps": sorted(set(epp_from_links)),
        "matches": matches,
        "unmatched": unmatched,
        "edp_catalog": all_issues,
    }
    (OUT_DIR / "edp_match.json").write_text(json.dumps(compact, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"EDP loaded {len(all_issues)} excel {len(items)} matched {len(matches)} unmatched {len(unmatched)}")
    print("exact", compact["exact"], "fuzzy", compact["fuzzy"], "with EPP", compact["edps_with_epp_link"], "unique EPPs", len(compact["unique_epps"]))
    print("UNMATCHED:")
    for u in unmatched:
        print(" -", u["excel"]["summary"], "|", u["excel"].get("product"), "|", u["excel"].get("roadmap"))
    print("EPPS", ",".join(compact["unique_epps"]))


if __name__ == "__main__":
    main()
