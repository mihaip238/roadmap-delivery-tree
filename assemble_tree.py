"""Build EDP → EPP → Feature → Story trees for every Excel KPI item.

Polaris EDP↔EPP links are ground truth. Title matches against the EPP catalog
are stored separately as inferred and never silently merged into polaris.
"""
from __future__ import annotations

import csv
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(r"C:\Users\MihaiPostolache\Downloads\kpisss")
DUMPS = Path(r"C:\Users\MihaiPostolache\.cursor\projects\c-Users-MihaiPostolache-Downloads-kpisss\agent-tools")
OUT = ROOT / "jira_map"

EPP_DUMPS = [
    DUMPS / "f317c004-3e64-4465-b9d4-5b7ba6f62063.txt",  # page 1
    DUMPS / "4697d5e8-ba7e-420b-9c22-aca1308a995c.txt",  # page 2
    DUMPS / "58da2817-e927-4c24-8511-8f7734dc7075.txt",  # page 3
    DUMPS / "07b220b4-9743-4279-8c07-52a2ec0a26f8.txt",  # page 4
    DUMPS / "d500c1e5-9656-4cff-971d-5804cadb227b.txt",  # compact duplicate of early page
]

STORY_DUMPS = [
    DUMPS / "d5d32354-69e5-497a-94a2-a45e7860a04b.txt",
    DUMPS / "ce6b2678-4714-4100-a51d-aaf533f00e45.txt",
    DUMPS / "9be169af-a2f1-4448-9a1d-44dc24890200.txt",
    DUMPS / "5d2e59d5-4b62-41de-adde-2ee5fdbfa613.txt",
    DUMPS / "76361302-4e57-41c3-b49d-d5b6bee641ee.txt",
    DUMPS / "d29ddf9c-3289-4d03-bed5-94aa21708d54.txt",
    DUMPS / "645fcbc4-d34f-4929-89bc-5fd007bce371.txt",
    DUMPS / "13738eee-c00d-42e1-88a3-539886e8e948.txt",
    DUMPS / "be15aa88-5214-463e-a768-4a2c1fb95bd4.txt",
]

INFERRED_CHILD_DUMPS = [
    DUMPS / "b3f4c26d-ee21-4d02-9dde-4a48ffcf2af4.txt",  # EPP-132/59/69
    DUMPS / "b2dd9a6f-5eee-4c3e-a9f3-1562aa1bfa4f.txt",  # EPP-69/78/161
    DUMPS / "5aa7098d-c187-48d4-8e9a-ca7af05fd2d0.txt",  # JTP-10561 Click
]

JTP_DUMP = DUMPS / "ee6943c7-4112-4507-816a-7aaac61b438e.txt"

STOP = {
    "ebase", "energy", "platform", "management", "system", "data", "api", "new",
    "and", "for", "the", "with", "from", "service", "product", "dashboard",
    "dashboards", "implementation", "improve", "improvement", "process", "client",
    "user", "admin", "standard", "light", "put", "get", "xml", "csv", "via",
    "into", "using", "add", "support", "make", "able", "can", "have", "been",
    "that", "this", "those", "these", "message", "messages", "version", "phase",
    "tranche", "allocation", "time", "series", "control", "nl", "volumes",
    "financials", "forecast", "forecasts", "forecasting", "quality", "imbalance",
    "total", "costs", "trades", "position", "positions", "expansion",
    "functionality", "logging", "monitoring", "identity", "access", "framework",
    "transaction", "flow", "enabler", "scripts", "intake", "administration",
    "setup", "model", "import", "imports", "influence", "factor", "generation",
    "load", "market", "document", "extend", "critical", "alerts", "proxy",
    "cloud", "architecture", "road", "trading", "integration", "microservice",
    "switching", "supplier", "realizations", "realization", "reconciliation",
    "nominations", "prognosis", "suppliers", "customers", "per", "isp",
}

ACRONYM_RE = re.compile(
    r"\b(afrr|mfrr|glmd|etpa|iam|epm|spm|brpaas|e-?prog|ic\d+[a-z]?|ts\d+)\b"
)

# Known high-confidence aliases from title inspection (still tagged inferred).
# BRPaaS M3 board (Sep 2026): screens hang off EPP-299/302; FC admin is EPP-303;
# weather is EPP-305. Do not alias GLMD to EPP-308 (that epic is allocation vs measurement).
KNOWN_ALIASES = {
    "EDP-157": ["EPP-132", "EPP-72", "EPP-78", "EPP-144"],  # aFRR family
    "EDP-129": ["EPP-161"],  # mFRR Energy Bidding (XML)
    "EDP-68": ["EPP-59", "EPP-69"],  # PUT Time-series
    "EDP-104": ["EPP-306"],  # Import of Steering Signal
    "EDP-164": ["EPP-309"],  # GLMD Forecasting
    "EDP-160": ["EPP-309"],  # Nominations E-Prog and GLMD
    "EDP-114": ["EPP-377", "EPP-209"],  # ETPA via Jules
    "EDP-162": ["EPP-311"],  # Financial Realizations Dashboard
    "EDP-109": ["EPP-310", "EPP-302"],  # Imbalance dashboard + Forecast Quality Insights
    "EDP-110": ["EPP-300"],  # Reconciliation Realizations Dashboard
    "EDP-102": ["EPP-303"],  # B2C forecast model → FC Admin & Calc
    "EDP-159": ["EPP-303"],  # B2B forecast model → FC Admin & Calc
    "EDP-158": ["EPP-303"],  # Shadow Forecasting / prognosis
    "EDP-106": ["EPP-305"],  # Influence factor imports → Weather Influences
    "EDP-105": ["EPP-299", "EPP-304"],  # Position dashboards + self-trade import
    "EDP-161": ["EPP-299", "EPP-304"],  # Ex-post position + self-trade import
}

NON_EBASE_HINTS = {
    "Click integration": [
        {
            "key": "JTP-10561",
            "summary": "Click Project integration into JTP",
            "issuetype": "Epic",
            "project": "JTP",
            "reason": "title: Jules Click integration ↔ JTP Click Project",
            "score": 0.9,
        }
    ],
}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s or "")
    s = s.replace("\u00a0", " ")
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s.replace("–", "-").replace("—", "-").rstrip(" .")


def tokens(s: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", norm(s)) if len(t) > 2 and t not in STOP}


def distinctive(s: str) -> set[str]:
    noise = STOP | {"power", "balancer", "jules", "ecedo", "gridhub", "baas"}
    out = {t for t in tokens(s) if len(t) >= 4 and t not in noise}
    raw = s or ""
    for m in re.findall(r"\b[A-Za-z]{2,}\d+[A-Za-z]?\b", raw):
        out.add(m.lower())
    for m in re.findall(r"\b(?:afrr|mfrr|glmd|etpa|iam|epm|spm|brp|rop|ic\d+)\b", norm(s)):
        out.add(m)
    return out


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def compact_issue(iss: dict) -> dict:
    f = iss.get("fields") or {}
    parent = f.get("parent") or {}
    parent_fields = parent.get("fields") or {}
    return {
        "key": iss.get("key"),
        "summary": f.get("summary") or iss.get("summary"),
        "issuetype": (f.get("issuetype") or {}).get("name") or iss.get("issuetype"),
        "status": (f.get("status") or {}).get("name") or iss.get("status"),
        "project": (f.get("project") or {}).get("key") or iss.get("project"),
        "parent_key": parent.get("key") or iss.get("parent_key"),
        "parent_summary": parent_fields.get("summary"),
    }


def polaris_edp_keys_from_epp(iss: dict) -> list[str]:
    f = iss.get("fields") or {}
    keys = []
    for link in f.get("issuelinks") or []:
        t = link.get("type") or {}
        if (t.get("name") or "") != "Polaris work item link":
            continue
        for side in ("inwardIssue", "outwardIssue"):
            other = link.get(side)
            if not other:
                continue
            key = other.get("key") or ""
            if key.startswith("EDP-"):
                keys.append(key)
    return keys


def load_search_dump(path: Path) -> list[dict]:
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict) and "issues" in data:
        return data["issues"]
    return []


def acronyms(s: str) -> set[str]:
    return set(ACRONYM_RE.findall(norm(s)))


def score_title(edp_summary: str, epp_summary: str) -> tuple[float, str]:
    n_edp, n_epp = norm(edp_summary), norm(epp_summary)
    if not n_edp or not n_epp:
        return 0.0, "empty"
    a_edp, a_epp = acronyms(edp_summary), acronyms(epp_summary)
    if a_edp and a_epp and a_edp.isdisjoint(a_epp):
        return 0.0, "acronym-mismatch"
    if n_edp == n_epp:
        return 1.0, "exact"
    if len(n_edp) >= 12 and (n_edp in n_epp or n_epp in n_edp):
        return 0.92, "containment"
    t_edp, t_epp = tokens(edp_summary), tokens(epp_summary)
    d_edp, d_epp = distinctive(edp_summary), distinctive(epp_summary)
    jac = jaccard(t_edp, t_epp)
    shared_a = a_edp & a_epp
    shared_d = d_edp & d_epp
    if shared_a:
        return min(0.95, 0.78 + 0.05 * len(shared_a) + jac * 0.15), "acronym:" + ",".join(sorted(shared_a))
    longest = max(shared_d, key=len) if shared_d else ""
    if longest and len(longest) >= 6 and jac >= 0.4:
        return min(0.86, 0.58 + jac * 0.3), "token+distinct:" + ",".join(sorted(shared_d)[:4])
    if jac >= 0.72:
        return jac, "jaccard"
    return jac, "weak"


def polaris_links(edp: dict) -> list[dict]:
    out = []
    seen = set()
    for link in (edp or {}).get("links") or []:
        key = link.get("key") or ""
        if not key.startswith("EPP-"):
            continue
        name = (link.get("link_name") or "")
        inward = (link.get("inward") or "")
        if name != "Polaris work item link" and inward != "is implemented by":
            # still keep EPP keys on the idea; they are delivery initiatives
            if not key.startswith("EPP-"):
                continue
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "key": key,
            "summary": link.get("summary"),
            "issuetype": link.get("issuetype"),
            "status": link.get("status"),
            "method": "polaris",
            "reason": f"{name}: {inward}",
        })
    return out


def attach_children(epp: dict, features_by_epp: dict, stories_by_parent: dict) -> dict:
    children = []
    for feat in features_by_epp.get(epp["key"], []):
        stories = stories_by_parent.get(feat["key"], [])
        children.append({
            **{k: feat[k] for k in ("key", "summary", "issuetype", "status", "project")},
            "story_count": len(stories),
            "stories": stories,
        })
    epp = dict(epp)
    epp["feature_count"] = len(children)
    epp["story_count"] = sum(c["story_count"] for c in children)
    epp["children"] = children
    return epp


def main():
    edp_match = json.loads((OUT / "edp_match.json").read_text(encoding="utf-8"))
    excel = json.loads((ROOT / "excel_items.json").read_text(encoding="utf-8"))
    features_blob = json.loads((OUT / "features_under_linked_epps.json").read_text(encoding="utf-8"))

    features = list(features_blob.get("children") or [])
    for path in INFERRED_CHILD_DUMPS:
        for iss in load_search_dump(path):
            features.append(compact_issue(iss))
    extra_feat = json.loads((OUT / "extra_features.json").read_text(encoding="utf-8"))
    features.extend(extra_feat.get("issues") or [])

    # de-dupe features
    feat_by_key = {}
    for f in features:
        if f.get("key"):
            feat_by_key[f["key"]] = f
    features = list(feat_by_key.values())
    features_by_epp = defaultdict(list)
    for f in features:
        if f.get("parent_key"):
            features_by_epp[f["parent_key"]].append(f)

    stories = []
    for path in STORY_DUMPS:
        for iss in load_search_dump(path):
            stories.append(compact_issue(iss))
    extra = json.loads((OUT / "extra_stories.json").read_text(encoding="utf-8"))
    stories.extend(extra.get("issues") or [])
    story_by_key = {}
    for s in stories:
        if s.get("key"):
            story_by_key[s["key"]] = s
    stories = list(story_by_key.values())
    stories_by_parent = defaultdict(list)
    for s in stories:
        if s.get("parent_key"):
            stories_by_parent[s["parent_key"]].append({
                "key": s["key"],
                "summary": s["summary"],
                "issuetype": s["issuetype"],
                "status": s["status"],
                "project": s.get("project"),
            })

    epp_catalog = {}
    reverse_polaris = defaultdict(list)  # edp_key -> epp keys from EPP side
    for path in EPP_DUMPS:
        for iss in load_search_dump(path):
            row = compact_issue(iss)
            if not row.get("key") or not str(row["key"]).startswith("EPP-"):
                continue
            prev = epp_catalog.get(row["key"])
            if not prev or (row.get("summary") and not prev.get("summary")):
                epp_catalog[row["key"]] = row
            for edp_key in polaris_edp_keys_from_epp(iss):
                reverse_polaris[edp_key].append(row["key"])

    epp_list = list(epp_catalog.values())
    (OUT / "epp_catalog.json").write_text(
        json.dumps(sorted(epp_list, key=lambda x: x["key"]), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    jtp_hits = []
    for iss in load_search_dump(JTP_DUMP):
        jtp_hits.append(compact_issue(iss))

    items = []
    inferred_epps_needed = set()
    counts = Counter()

    for rec in edp_match["matches"]:
        excel_row = rec["excel"]
        edp = rec.get("edp") or {}
        polaris = polaris_links(edp)
        polaris_keys = {p["key"] for p in polaris}

        # Reverse polaris from EPP catalog (EDP dump sometimes empty).
        for epp_key in reverse_polaris.get(edp.get("key") or "", []):
            if epp_key in polaris_keys:
                continue
            cat = epp_catalog.get(epp_key) or {"key": epp_key}
            polaris.append({
                "key": epp_key,
                "summary": cat.get("summary"),
                "issuetype": cat.get("issuetype"),
                "status": cat.get("status"),
                "method": "polaris_reverse",
                "reason": "Polaris link stored on the EPP, not on the EDP",
            })
            polaris_keys.add(epp_key)

        inferred = []
        inferred_keys = set()
        for alias in KNOWN_ALIASES.get(edp.get("key") or "", []):
            if alias in polaris_keys or alias in inferred_keys:
                continue
            cat = epp_catalog.get(alias) or {"key": alias}
            inferred.append({
                "key": alias,
                "summary": cat.get("summary"),
                "issuetype": cat.get("issuetype"),
                "status": cat.get("status"),
                "method": "inferred_alias",
                "reason": "known title alias",
                "score": 0.95,
            })
            inferred_keys.add(alias)

        edp_sum = edp.get("summary") or excel_row.get("summary") or ""
        ranked = []
        min_score = 0.85 if polaris_keys else 0.72
        for cat in epp_list:
            if cat["key"] in polaris_keys or cat["key"] in inferred_keys:
                continue
            if (cat.get("issuetype") or "") in {"Theme"}:
                continue
            score, reason = score_title(edp_sum, cat.get("summary") or "")
            if score >= min_score:
                ranked.append((score, reason, cat))
        ranked.sort(key=lambda x: -x[0])
        for score, reason, cat in ranked[:3]:
            inferred.append({
                "key": cat["key"],
                "summary": cat.get("summary"),
                "issuetype": cat.get("issuetype"),
                "status": cat.get("status"),
                "method": "inferred_title",
                "reason": reason,
                "score": round(score, 3),
            })
            inferred_keys.add(cat["key"])

        used_epps = []
        for p in polaris:
            cat = epp_catalog.get(p["key"]) or {}
            used_epps.append(attach_children({
                "key": p["key"],
                "summary": p.get("summary") or cat.get("summary"),
                "issuetype": p.get("issuetype") or cat.get("issuetype"),
                "status": p.get("status") or cat.get("status"),
                "method": p["method"],
                "reason": p.get("reason"),
            }, features_by_epp, stories_by_parent))
        for inf in inferred:
            used_epps.append(attach_children({
                "key": inf["key"],
                "summary": inf.get("summary"),
                "issuetype": inf.get("issuetype"),
                "status": inf.get("status"),
                "method": inf["method"],
                "reason": inf.get("reason"),
                "score": inf.get("score"),
            }, features_by_epp, stories_by_parent))
            if inf["key"] not in features_by_epp:
                inferred_epps_needed.add(inf["key"])

        if polaris and inferred:
            link_kind = "mixed"
        elif polaris:
            link_kind = "polaris"
        elif inferred:
            link_kind = "inferred"
        else:
            link_kind = "none"

        feature_count = sum(e["feature_count"] for e in used_epps)
        story_count = sum(e["story_count"] for e in used_epps)
        epps_with_children = sum(1 for e in used_epps if e["feature_count"] > 0)
        counts[link_kind] += 1
        if excel_row.get("active"):
            counts[f"active_{link_kind}"] += 1
        if feature_count == 0:
            counts["no_delivery_work"] += 1
            if excel_row.get("active"):
                counts["active_no_delivery_work"] += 1

        items.append({
            "family": "EBASE",
            "excel": excel_row,
            "edp": {
                "key": edp.get("key"),
                "summary": edp.get("summary"),
                "status": edp.get("status"),
            },
            "link_kind": link_kind,
            "polaris_epp_count": len(polaris),
            "inferred_epp_count": len(inferred),
            "epps": used_epps,
            "inferred_candidates": inferred,
            "coverage": {
                "epp_count": len(used_epps),
                "epps_with_children": epps_with_children,
                "epps_without_children": len(used_epps) - epps_with_children,
                "feature_count": feature_count,
                "story_count": story_count,
            },
        })

    non_ebase_items = []
    for row in excel.get("non_ebase") or []:
        hints = list(NON_EBASE_HINTS.get(row["summary"], []))
        extra_hits = []
        pool = jtp_hits if row.get("family") == "Jules" else []
        for hit in pool:
            score, reason = score_title(row["summary"], hit.get("summary") or "")
            if score >= 0.85:
                extra_hits.append({**hit, "method": "inferred_title", "reason": reason, "score": round(score, 3)})
        seen = {h["key"] for h in hints}
        for h in extra_hits:
            if h["key"] not in seen:
                hints.append(h)
                seen.add(h["key"])
        kind = "inferred" if hints else "none"
        counts[f"non_{kind}"] += 1
        used = []
        for h in hints:
            used.append(attach_children({
                "key": h["key"],
                "summary": h.get("summary"),
                "issuetype": h.get("issuetype"),
                "status": h.get("status"),
                "method": h.get("method") or "inferred_title",
                "reason": h.get("reason"),
                "score": h.get("score"),
            }, features_by_epp, stories_by_parent))
        feature_count = sum(e["feature_count"] for e in used)
        story_count = sum(e["story_count"] for e in used)
        non_ebase_items.append({
            "family": row.get("family"),
            "excel": row,
            "edp": None,
            "link_kind": kind,
            "note": (
                "No Ecedo or Gridhub software project exists in Jira. "
                "Jules Click maps to JTP-10561. Gridhub currently appears as ETR/QA tests."
            ),
            "hits": hints,
            "epps": used,
            "coverage": {
                "epp_count": len(used),
                "epps_with_children": sum(1 for e in used if e["feature_count"] > 0),
                "feature_count": feature_count,
                "story_count": story_count,
            },
        })

    payload = {
        "generated_from": "Polaris EDP links + EPP catalog title inference + parent-walk of EBASE/FEAT children",
        "hierarchy": "EDP (Idea) -Polaris implements-> EPP (Epic Initiative) -parent-> Feature/Tech/Test -parent-> Story/Task",
        "epp_catalog_size": len(epp_catalog),
        "features_loaded": len(features),
        "stories_loaded": len(stories),
        "counts": dict(counts),
        "inferred_epps_missing_children": sorted(inferred_epps_needed),
        "items": items,
        "non_ebase": non_ebase_items,
        "eet": excel.get("eet") or [],
    }
    (OUT / "delivery_tree.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    csv_path = OUT / "delivery_tree.csv"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow([
            "family", "excel_summary", "product", "roadmap", "active",
            "edp_key", "edp_status", "link_kind",
            "epp_key", "epp_summary", "epp_status", "epp_method", "epp_score",
            "feature_key", "feature_summary", "feature_type", "feature_status",
            "story_key", "story_summary", "story_type", "story_status",
        ])
        for item in items + non_ebase_items:
            excel_row = item["excel"]
            edp = item.get("edp") or {}
            if not item["epps"]:
                w.writerow([
                    item["family"], excel_row.get("summary"), excel_row.get("product"),
                    excel_row.get("roadmap"), excel_row.get("active"),
                    edp.get("key"), edp.get("status"), item["link_kind"],
                    "", "", "", "", "", "", "", "", "", "", "", "", "",
                ])
                continue
            for epp in item["epps"]:
                if not epp["children"]:
                    w.writerow([
                        item["family"], excel_row.get("summary"), excel_row.get("product"),
                        excel_row.get("roadmap"), excel_row.get("active"),
                        edp.get("key"), edp.get("status"), item["link_kind"],
                        epp["key"], epp.get("summary"), epp.get("status"),
                        epp.get("method"), epp.get("score") or "",
                        "", "", "", "", "", "", "", "",
                    ])
                    continue
                for feat in epp["children"]:
                    if not feat["stories"]:
                        w.writerow([
                            item["family"], excel_row.get("summary"), excel_row.get("product"),
                            excel_row.get("roadmap"), excel_row.get("active"),
                            edp.get("key"), edp.get("status"), item["link_kind"],
                            epp["key"], epp.get("summary"), epp.get("status"),
                            epp.get("method"), epp.get("score") or "",
                            feat["key"], feat.get("summary"), feat.get("issuetype"),
                            feat.get("status"), "", "", "", "",
                        ])
                        continue
                    for st in feat["stories"]:
                        w.writerow([
                            item["family"], excel_row.get("summary"), excel_row.get("product"),
                            excel_row.get("roadmap"), excel_row.get("active"),
                            edp.get("key"), edp.get("status"), item["link_kind"],
                            epp["key"], epp.get("summary"), epp.get("status"),
                            epp.get("method"), epp.get("score") or "",
                            feat["key"], feat.get("summary"), feat.get("issuetype"),
                            feat.get("status"),
                            st["key"], st.get("summary"), st.get("issuetype"), st.get("status"),
                        ])

    summary = {
        "excel_ebase": len(items),
        "excel_non_ebase": len(non_ebase_items),
        "epp_catalog_size": len(epp_catalog),
        "features_loaded": len(features),
        "stories_loaded": len(stories),
        "counts": dict(counts),
        "active_unlinked": [
            {
                "edp": i["edp"]["key"],
                "summary": i["excel"]["summary"],
                "roadmap": i["excel"].get("roadmap"),
                "link_kind": i["link_kind"],
                "inferred": [e["key"] for e in i["inferred_candidates"]],
                "features": i["coverage"]["feature_count"],
                "stories": i["coverage"]["story_count"],
            }
            for i in items if i["excel"].get("active") and i["link_kind"] != "polaris"
        ],
        "inferred_epps_missing_children": sorted(inferred_epps_needed),
    }
    (OUT / "coverage_summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    print("NEED_CHILDREN", ",".join(sorted(inferred_epps_needed)))


if __name__ == "__main__":
    main()
