"""Merge Jira worklog search dumps into last_booked dates (no authors)."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from jira_time import later_date

ROOT = Path(__file__).resolve().parent
DUMP = ROOT / "jira_map" / "worklog_dumps"
OUT = ROOT / "jira_map" / "last_booked.json"


def ingest_issue(issue: dict, dates: dict[str, str], overflow: dict[str, int]) -> None:
    key = issue.get("key")
    if not key:
        return
    fields = issue.get("fields") or issue
    worklog = fields.get("worklog") or {}
    logs = worklog.get("worklogs") or issue.get("worklogs") or []
    total = int(worklog.get("total") or len(logs) or 0)
    day = later_date(*[row.get("started") for row in logs])
    if day:
        dates[key] = later_date(dates.get(key), day) or day
    if total > len(logs):
        overflow[key] = total


def main() -> None:
    dates: dict[str, str] = {}
    overflow: dict[str, int] = {}
    if OUT.exists():
        prev = json.loads(OUT.read_text(encoding="utf-8"))
        dates.update(prev.get("dates") or {})
    DUMP.mkdir(parents=True, exist_ok=True)
    for path in sorted(DUMP.glob("*.json")):
        blob = json.loads(path.read_text(encoding="utf-8"))
        data = blob.get("data") or blob
        if data.get("worklogs") and blob.get("key"):
            ingest_issue({"key": blob["key"], "worklogs": data["worklogs"], "fields": {"worklog": data}}, dates, overflow)
            continue
        for issue in data.get("issues") or []:
            ingest_issue(issue, dates, overflow)
    OUT.write_text(json.dumps({
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "source": "jira worklog started date",
        "count": len(dates),
        "overflow": overflow,
        "dates": dict(sorted(dates.items())),
    }, indent=2), encoding="utf-8")
    print("dates", len(dates), "overflow", len(overflow), "wrote", OUT)
    for key, total in sorted(overflow.items(), key=lambda kv: -kv[1])[:20]:
        print(" overflow", key, total, "partial", dates.get(key))


if __name__ == "__main__":
    main()
