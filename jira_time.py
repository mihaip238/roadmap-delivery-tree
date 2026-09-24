"""Jira time-tracking helpers.

Rules (verified against live Eneve Jira, Sep 2026):

- timespent = worklogs on THIS ticket only.
- aggregatetimespent on a Feature/Story includes hierarchy-0 children
  (stories, defects, tasks, sub-tasks). It does NOT roll Feature time into an EPP.
- EPP totals must be own timespent + each child Feature's aggregatetimespent.
- Never add a parent's aggregatetimespent to its children's timespent (double count).
- Original Estimate is sparse. Story points live in customfield_10016.
- Jira display calendar: 8h = 1d, 5d = 1w.
"""
from __future__ import annotations

from typing import Any

HOUR = 3600
DAY = 8 * HOUR
WEEK = 5 * DAY

TIME_FIELDS = (
    "summary,issuetype,status,parent,project,"
    "timespent,timeoriginalestimate,timeestimate,"
    "aggregatetimespent,aggregatetimeoriginalestimate,aggregatetimeestimate,"
    "timetracking,customfield_10016,customfield_10026"
)

FEATURE_TYPES = {
    "Feature",
    "Technical Implementation",
    "Testing Activities",
    "Software Issue",
}


def as_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def as_points(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, dict):
        value = value.get("value")
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def field(issue: dict, name: str, default: Any = None) -> Any:
    fields = issue.get("fields")
    if isinstance(fields, dict) and name in fields:
        return fields.get(name)
    return issue.get(name, default)


def issue_type_name(issue: dict) -> str:
    raw = field(issue, "issuetype") or {}
    if isinstance(raw, dict):
        return raw.get("name") or ""
    return str(raw or "")


def parent_key_of(issue: dict) -> str | None:
    parent = field(issue, "parent") or {}
    if isinstance(parent, dict):
        return parent.get("key")
    return None


def compact_issue(issue: dict) -> dict:
    key = issue.get("key")
    status = field(issue, "status") or {}
    status_category = status.get("statusCategory") if isinstance(status, dict) else {}
    project = field(issue, "project") or {}
    tracking = field(issue, "timetracking") or {}
    if not isinstance(tracking, dict):
        tracking = {}
    return {
        "key": key,
        "summary": field(issue, "summary"),
        "issuetype": issue_type_name(issue),
        "status": status.get("name") if isinstance(status, dict) else status,
        "statusCategory": (
            status_category.get("key") or status_category.get("name") or ""
            if isinstance(status_category, dict) else ""
        ),
        "project": project.get("key") if isinstance(project, dict) else project,
        "parent_key": parent_key_of(issue),
        "ownSpentSec": as_int(field(issue, "timespent")) or 0,
        "ownEstimateSec": as_int(field(issue, "timeoriginalestimate")),
        "ownRemainingSec": as_int(field(issue, "timeestimate")),
        "jiraAggSpentSec": as_int(field(issue, "aggregatetimespent")),
        "jiraAggEstimateSec": as_int(field(issue, "aggregatetimeoriginalestimate")),
        "jiraAggRemainingSec": as_int(field(issue, "aggregatetimeestimate")),
        "storyPoints": as_points(field(issue, "customfield_10016")),
        "jiraSpentPretty": tracking.get("timeSpent"),
        "jiraEstimatePretty": tracking.get("originalEstimate"),
    }


def format_jira_time(seconds: int | None) -> str:
    if seconds is None:
        return ""
    sec = int(seconds)
    if sec == 0:
        return "0h"
    sign = "-" if sec < 0 else ""
    sec = abs(sec)
    weeks, rem = divmod(sec, WEEK)
    days, rem = divmod(rem, DAY)
    hours, rem = divmod(rem, HOUR)
    minutes, _ = divmod(rem, 60)
    parts: list[str] = []
    if weeks:
        parts.append(f"{weeks}w")
    if days:
        parts.append(f"{days}d")
    if hours:
        parts.append(f"{hours}h")
    if minutes:
        parts.append(f"{minutes}m")
    return sign + " ".join(parts) if parts else "0h"


def hours(seconds: int | None) -> float | None:
    if seconds is None:
        return None
    return round(seconds / HOUR, 2)


def iso_day(raw: Any) -> str | None:
    if not raw:
        return None
    text = str(raw).strip()
    if len(text) < 10:
        return None
    return text[:10]


def later_date(*values: Any) -> str | None:
    days = [iso_day(value) for value in values]
    days = [day for day in days if day]
    return max(days) if days else None


def stamp_last_booked(node: dict, dates: dict[str, str]) -> str | None:
    """Set own and rolled last-booked dates. Rolled is max(own, children)."""
    own = dates.get(node.get("key") or "") or None
    child_dates = [
        stamp_last_booked(child, dates)
        for child in (node.get("children") or node.get("stories") or [])
    ]
    rolled = later_date(own, *child_dates)
    time_info = dict(node.get("time") or {})
    time_info["lastBookedOn"] = own
    time_info["lastBookedOnRolled"] = rolled
    node["time"] = time_info
    return rolled


def leaf_rolled_spent(rec: dict | None) -> int:
    """Story/task rolled time: Jira aggregate (includes sub-tasks) else own."""
    if not rec:
        return 0
    agg = rec.get("jiraAggSpentSec")
    if agg is not None:
        return int(agg)
    return int(rec.get("ownSpentSec") or 0)


def leaf_rolled_estimate(rec: dict | None) -> int:
    if not rec:
        return 0
    agg = rec.get("jiraAggEstimateSec")
    if agg is not None:
        return int(agg)
    return int(rec.get("ownEstimateSec") or 0)


def leaf_rolled_remaining(rec: dict | None) -> int:
    if not rec:
        return 0
    agg = rec.get("jiraAggRemainingSec")
    if agg is not None:
        return int(agg)
    return int(rec.get("ownRemainingSec") or 0)


def feature_rolled_spent(rec: dict | None, child_rolled: int) -> int:
    """Feature rolled time prefers Jira aggregate so unlisted defects are not lost."""
    if not rec:
        return child_rolled
    agg = rec.get("jiraAggSpentSec")
    own = int(rec.get("ownSpentSec") or 0)
    if agg is None:
        return own + child_rolled
    return max(int(agg), own + child_rolled)


def feature_rolled_estimate(rec: dict | None, child_rolled: int) -> int:
    if not rec:
        return child_rolled
    agg = rec.get("jiraAggEstimateSec")
    own = int(rec.get("ownEstimateSec") or 0)
    if agg is None:
        return own + child_rolled
    return max(int(agg), own + child_rolled)


def feature_rolled_remaining(rec: dict | None, child_rolled: int) -> int:
    if not rec:
        return child_rolled
    agg = rec.get("jiraAggRemainingSec")
    own = int(rec.get("ownRemainingSec") or 0)
    if agg is None:
        return own + child_rolled
    return max(int(agg), own + child_rolled)


def time_view(
    rec: dict | None,
    *,
    own_spent: int,
    rolled_spent: int,
    own_estimate: int | None,
    rolled_estimate: int | None,
    own_points: float | None,
    rolled_points: float | None,
    own_remaining: int | None = None,
    rolled_remaining: int | None = None,
    unlisted_spent: int = 0,
    shared_with: list[str] | None = None,
    last_booked_on: str | None = None,
    last_booked_on_rolled: str | None = None,
) -> dict:
    return {
        "ownSpentSec": own_spent,
        "rolledSpentSec": rolled_spent,
        "ownEstimateSec": own_estimate,
        "rolledEstimateSec": rolled_estimate,
        "ownRemainingSec": own_remaining,
        "rolledRemainingSec": rolled_remaining,
        "ownSpentHours": hours(own_spent),
        "rolledSpentHours": hours(rolled_spent),
        "ownEstimateHours": hours(own_estimate),
        "rolledEstimateHours": hours(rolled_estimate),
        "ownRemainingHours": hours(own_remaining),
        "rolledRemainingHours": hours(rolled_remaining),
        "ownSpent": format_jira_time(own_spent),
        "rolledSpent": format_jira_time(rolled_spent),
        "ownEstimate": format_jira_time(own_estimate) if own_estimate is not None else "",
        "rolledEstimate": format_jira_time(rolled_estimate) if rolled_estimate else "",
        "ownRemaining": format_jira_time(own_remaining) if own_remaining is not None else "",
        "rolledRemaining": format_jira_time(rolled_remaining) if rolled_remaining is not None else "",
        "ownPoints": own_points,
        "rolledPoints": rolled_points,
        "unlistedSpentSec": unlisted_spent,
        "unlistedSpent": format_jira_time(unlisted_spent) if unlisted_spent else "",
        "sharedWith": shared_with or [],
        "lastBookedOn": last_booked_on or (rec or {}).get("lastBookedOn"),
        "lastBookedOnRolled": last_booked_on_rolled or last_booked_on or (rec or {}).get("lastBookedOnRolled"),
        "jiraSpentPretty": (rec or {}).get("jiraSpentPretty"),
        "jiraEstimatePretty": (rec or {}).get("jiraEstimatePretty"),
    }
