"""Fetch timespent, original estimate, and story points for every tree ticket.

Uses twg (already authenticated) in key batches, then parent-walks every EPP
so Feature time that is missing from the local tree is still included.
"""
from __future__ import annotations

import json
import re
import subprocess
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from jira_time import TIME_FIELDS, compact_issue

ROOT = Path(r"C:\Users\MihaiPostolache\Downloads\kpisss")
TREE = ROOT / "jira_map" / "delivery_tree.json"
OUT = ROOT / "jira_map" / "time_tracking.json"
DUMP_DIR = ROOT / "jira_map" / "time_dumps"
TWG = Path.home() / "AppData" / "Local" / "Programs" / "twg" / "bin" / "twg.exe"
CLOUD = "b54c53a6-841e-4aac-af70-3b24f660979c"
KEY_BATCH = 40
PARENT_BATCH = 10
PAGE_SIZE = 100
STDOUT_RE = re.compile(r'stdout:\s+"([^"]+stdout\.json)"')


def collect_tree_keys(tree: dict) -> dict[str, set[str]]:
    buckets = {"edp": set(), "epp": set(), "feature": set(), "story": set()}
    for item in list(tree.get("items") or []) + list(tree.get("non_ebase") or []):
        edp = (item.get("edp") or {}).get("key")
        if edp:
            buckets["edp"].add(edp)
        for epp in item.get("epps") or []:
            if epp.get("key"):
                buckets["epp"].add(epp["key"])
            for feat in epp.get("children") or []:
                if feat.get("key"):
                    buckets["feature"].add(feat["key"])
                for st in feat.get("stories") or []:
                    if st.get("key"):
                        buckets["story"].add(st["key"])
    return buckets


def chunks(items: list[str], size: int) -> list[list[str]]:
    return [items[i:i + size] for i in range(0, len(items), size)]


def parse_stdout_path(text: str) -> Path | None:
    match = STDOUT_RE.search(text)
    if not match:
        return None
    return Path(match.group(1))


def run_jql(jql: str, *, limit: int = PAGE_SIZE, after: str | None = None) -> dict:
    cmd = [
        str(TWG),
        "jira", "workitem", "query",
        "--cloud-id", CLOUD,
        "--jql", jql,
        "--fields", TIME_FIELDS,
        "--limit", str(limit),
        "-o", "json",
    ]
    if after:
        cmd.extend(["--after", after])
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=180,
    )
    combined = (proc.stdout or "") + "\n" + (proc.stderr or "")
    path = parse_stdout_path(combined)
    if proc.returncode != 0 and not path:
        raise RuntimeError(f"twg failed ({proc.returncode}): {combined[-2000:]}")
    if not path or not path.exists():
        raise RuntimeError(f"twg did not write stdout.json\n{combined[-2000:]}")
    return json.loads(path.read_text(encoding="utf-8"))


def issues_from_payload(payload: dict) -> list[dict]:
    data = payload.get("data") or payload
    issues = data.get("issues") or []
    if isinstance(issues, dict):
        issues = issues.get("issues") or issues.get("nodes") or []
    return issues


def next_page(payload: dict, issues: list[dict]) -> str | None:
    data = payload.get("data") or payload
    for key in ("nextPageToken", "nextPage", "after"):
        token = data.get(key)
        if token:
            return str(token)
    page = data.get("pageInfo") or payload.get("pageInfo") or {}
    if page.get("hasNextPage") and page.get("endCursor"):
        return page["endCursor"]
    if data.get("isLast") is False and data.get("nextPageToken"):
        return data["nextPageToken"]
    return None


def strip_order(jql: str) -> str:
    return re.sub(r"\s+ORDER BY\s+.+$", "", jql, flags=re.I).strip()


def fetch_jql_all(jql: str, dump_name: str) -> list[dict]:
    DUMP_DIR.mkdir(parents=True, exist_ok=True)
    all_issues: list[dict] = []
    after_id = None
    page = 0
    core = strip_order(jql)
    while page < 50:
        page += 1
        if after_id:
            query = f"{core} AND id > {after_id} ORDER BY id ASC"
        else:
            query = f"{core} ORDER BY id ASC"
        payload = run_jql(query)
        (DUMP_DIR / f"{dump_name}_p{page}.json").write_text(
            json.dumps(payload, ensure_ascii=False),
            encoding="utf-8",
        )
        issues = issues_from_payload(payload)
        all_issues.extend(issues)
        last_id = issues[-1].get("id") if issues else None
        print(f"  {dump_name} page {page}: {len(issues)} issues after_id={after_id or '-'}")
        if not issues:
            break
        if not last_id or len(issues) < PAGE_SIZE:
            break
        if last_id == after_id:
            break
        after_id = last_id
        time.sleep(0.15)
    return all_issues


def fetch_keys(keys: list[str], label: str) -> list[dict]:
    out: list[dict] = []
    batches = chunks(sorted(keys), KEY_BATCH)
    for i, batch in enumerate(batches, 1):
        jql = "key in (" + ", ".join(batch) + ")"
        print(f"{label} batch {i}/{len(batches)} n={len(batch)}")
        issues = fetch_jql_all(jql, f"{label}_{i:03d}")
        out.extend(issues)
        missing = set(batch) - {iss.get("key") for iss in issues}
        if missing:
            print("  missing", ",".join(sorted(missing)[:12]), f"({len(missing)})")
        time.sleep(0.1)
    return out


def fetch_parents(parents: list[str], label: str) -> list[dict]:
    out: list[dict] = []
    batches = chunks(sorted(parents), PARENT_BATCH)
    for i, batch in enumerate(batches, 1):
        jql = "parent in (" + ", ".join(batch) + ")"
        print(f"{label} parent-batch {i}/{len(batches)} n={len(batch)}")
        issues = fetch_jql_all(jql, f"{label}_parent_{i:03d}")
        out.extend(issues)
        time.sleep(0.1)
    return out


def store_issue(index: dict, children: dict, issue: dict) -> None:
    row = compact_issue(issue)
    key = row.get("key")
    if not key:
        return
    prev = index.get(key)
    if not prev or (row.get("summary") and not prev.get("summary")):
        index[key] = row
    parent = row.get("parent_key")
    if parent:
        bucket = children[parent]
        if key not in bucket:
            bucket.append(key)


def main() -> None:
    if not TWG.exists():
        raise SystemExit(f"twg not found at {TWG}")
    tree = json.loads(TREE.read_text(encoding="utf-8"))
    buckets = collect_tree_keys(tree)
    print({k: len(v) for k, v in buckets.items()})

    index: dict[str, dict] = {}
    children: dict[str, list[str]] = defaultdict(list)

    tree_keys = sorted(set().union(*buckets.values()))
    for issue in fetch_keys(tree_keys, "tree"):
        store_issue(index, children, issue)

    epp_keys = sorted(buckets["epp"])
    extra_features = 0
    for issue in fetch_parents(epp_keys, "epp"):
        before = issue.get("key") in index
        store_issue(index, children, issue)
        if issue.get("key") and not before:
            extra_features += 1
    print("new issues from EPP parent walk", extra_features)

    # Children of features already in the map (covers defects not in the local tree).
    feature_parents = sorted({
        key for key, rec in index.items()
        if rec.get("issuetype") in {
            "Feature", "Technical Implementation", "Testing Activities", "Software Issue"
        } or key in buckets["feature"]
    })
    extra_leaves = 0
    for issue in fetch_parents(feature_parents, "feature"):
        before = issue.get("key") in index
        store_issue(index, children, issue)
        if issue.get("key") and not before:
            extra_leaves += 1
    print("new issues from feature parent walk", extra_leaves)

    missing_tree = [k for k in tree_keys if k not in index]
    payload = {
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "source": "twg jira workitem query",
        "cloudId": CLOUD,
        "treeKeyCounts": {k: len(v) for k, v in buckets.items()},
        "issuesFetched": len(index),
        "missingTreeKeys": missing_tree,
        "extraFromEppWalk": extra_features,
        "extraFromFeatureWalk": extra_leaves,
        "childrenByParent": {k: v for k, v in sorted(children.items())},
        "issues": {k: index[k] for k in sorted(index)},
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print("wrote", OUT, "issues", len(index), "missing tree keys", len(missing_tree))


if __name__ == "__main__":
    main()
