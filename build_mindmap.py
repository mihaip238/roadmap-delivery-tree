"""Build a nested product → EDP → EPP → Feature → Story tree for the mind map."""
from __future__ import annotations

import json
import re
from collections import OrderedDict
from pathlib import Path

from apply_overlay import apply_payload, load_budgets, load_overlay
from jira_time import format_jira_time
from milestones import build_milestone_tree
from report_history import update_history

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "jira_map" / "delivery_tree.json"
OUT_JSON = ROOT / "jira_map" / "product_tree.json"
OUT_JS = ROOT / "jira_map" / "tree_data.js"

JIRA = "https://eneve.atlassian.net/browse/"

PRODUCT_ORDER = [
    "BRP as a Service",
    "Power Balancer",
    "Gas Shipper",
    "Platform",
    "Portfolio Management",
    "Supply",
    "Ecedo",
    "Jules",
    "Gridhub",
    "Unclassified",
]

# Presentation grouping only. Never written back as Jira Product Name.
THEME_RULES = [
    ("Ancillary services", re.compile(r"\b(afrr|mfrr|frr|congestion|pasar)\b|asset steering", re.I)),
    ("Allocation & market messages", re.compile(r"\b(allocation|umig6?|sma|ic\d+[a-z]?|ts0?\d+)\b", re.I)),
    ("Gas", re.compile(r"\bgas\b|edigas|\bgts\b", re.I)),
    ("Portfolio / EPM", re.compile(r"\b(enprdm|epm|spm|portfolio|wingui)\b", re.I)),
    ("Time-series & APIs", re.compile(
        r"time[ -]?series|timeseries|ts calculator|ts-?push|ts push|\bcurves\b|master data api", re.I
    )),
    ("Workers & migrations", re.compile(r"c\+\+|c#|\bpython\b|gitlab|azure devops|\bworker\b|migration", re.I)),
    ("Platform enablers", re.compile(
        r"multi-?tenancy|arc\s*esb|partition|ci/?cd|container|datalake|staging|ems evolution|\bformula", re.I
    )),
]

# Conservative title → product hints. Used only to flag Jira tagging gaps, never to move items.
PRODUCT_HINTS = [
    ("BRP as a Service", re.compile(r"\bbrpaas\b|\bbaas\b", re.I), "Title names BRPaaS / BaaS"),
    ("Power Balancer", re.compile(
        r"power balancer|\bafrr\b|\bmfrr\b|congestion management|\bfrr\b", re.I
    ), "Title is balancing / ancillary"),
    ("Gas Shipper", re.compile(r"gas shipper", re.I), "Title names Gas Shipper"),
    ("Portfolio Management", re.compile(
        r"\benprdm\b|\bepm\b|\bspm\b|portfolio mgnt|sales portfolio|wingui", re.I
    ), "Title is EPM / SPM / portfolio"),
    ("Supply", re.compile(r"allocation 2\.0 supply|\bimprovements supply\b", re.I), "Title is a Supply line"),
    ("Platform", re.compile(
        r"multi-?tenancy|arc\s*esb|database partitioning|ems evolution|"
        r"generic connection with datalake|staging enviro",
        re.I,
    ), "Title is a platform enabler"),
]


def theme_for(title: str) -> str:
    text = title or ""
    for name, rx in THEME_RULES:
        if rx.search(text):
            return name
    return "Other / ungrouped"


def product_hint(title: str) -> tuple[str, str] | None:
    text = title or ""
    for name, rx, reason in PRODUCT_HINTS:
        if rx.search(text):
            return name, reason
    return None


def products_for(item: dict) -> list[str]:
    family = item.get("family") or ""
    excel = item.get("excel") or {}
    if family in {"Ecedo", "Jules", "Gridhub"}:
        return [family]
    raw = (excel.get("product") or "").replace(";", ",")
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    return parts or ["Unclassified"]


def slim_time(raw: dict | None) -> dict | None:
    if not raw:
        return None
    return {
        "ownSpentSec": raw.get("ownSpentSec") or 0,
        "rolledSpentSec": raw.get("rolledSpentSec") or 0,
        "ownEstimateSec": raw.get("ownEstimateSec"),
        "rolledEstimateSec": raw.get("rolledEstimateSec"),
        "ownSpent": raw.get("ownSpent") or "",
        "rolledSpent": raw.get("rolledSpent") or "",
        "ownEstimate": raw.get("ownEstimate") or "",
        "rolledEstimate": raw.get("rolledEstimate") or "",
        "ownSpentHours": raw.get("ownSpentHours"),
        "rolledSpentHours": raw.get("rolledSpentHours"),
        "uniqueSpentHours": raw.get("uniqueSpentHours"),
        "uniqueSpent": raw.get("uniqueSpent") or "",
        "rolledPoints": raw.get("rolledPoints"),
        "unlistedSpent": raw.get("unlistedSpent") or "",
        "sharedWith": raw.get("sharedWith") or [],
    }


def node_issue(kind: str, rec: dict, extra: dict | None = None) -> dict:
    key = rec.get("key") or ""
    out = {
        "type": kind,
        "key": key,
        "title": rec.get("summary") or rec.get("title") or "",
        "status": rec.get("status") or "",
        "url": (JIRA + key) if key else "",
    }
    t = slim_time(rec.get("time"))
    if t:
        out["time"] = t
    if extra:
        out.update(extra)
    return out


def compact_item(item: dict) -> dict:
    excel = item.get("excel") or {}
    edp = item.get("edp") or {}
    epps = []
    for epp in item.get("epps") or []:
        feats = []
        for feat in epp.get("children") or []:
            stories = [
                node_issue("story", st, {"issuetype": st.get("issuetype") or ""})
                for st in feat.get("stories") or []
            ]
            feats.append(
                node_issue(
                    "feature",
                    feat,
                    {
                        "issuetype": feat.get("issuetype") or "",
                        "storyCount": len(stories),
                        "children": stories,
                    },
                )
            )
        epps.append(
            node_issue(
                "epp",
                epp,
                {
                    "method": epp.get("method") or "",
                    "score": epp.get("score"),
                    "featureCount": epp.get("feature_count") or len(feats),
                    "storyCount": epp.get("story_count") or sum(f["storyCount"] for f in feats),
                    "children": feats,
                },
            )
        )
    cov = item.get("coverage") or {}
    out = {
        "type": "edp",
        "key": edp.get("key") or "",
        "title": excel.get("summary") or edp.get("summary") or "",
        "status": edp.get("status") or "",
        "url": (JIRA + edp["key"]) if edp.get("key") else "",
        "kind": item.get("link_kind") or "none",
        "roadmap": excel.get("roadmap") or "",
        "active": bool(excel.get("active")),
        "productLabel": excel.get("product") or item.get("family") or "",
        "family": item.get("family") or "",
        "classSource": "family" if item.get("family") in {"Ecedo", "Jules", "Gridhub"} else (
            "jira" if (excel.get("product") or "").strip() else "unclassified"
        ),
        "theme": theme_for(excel.get("summary") or edp.get("summary") or ""),
        "eppCount": cov.get("epp_count") or len(epps),
        "featureCount": cov.get("feature_count") or 0,
        "storyCount": cov.get("story_count") or 0,
        "children": epps,
    }
    t = slim_time(edp.get("time"))
    if t:
        out["time"] = t
    return out


def flatten_edps(nodes: list[dict]) -> list[dict]:
    out = []
    for n in nodes:
        if n.get("type") == "theme":
            out.extend(n.get("children") or [])
        else:
            out.append(n)
    return out


def collect_own_spent(node: dict, acc: dict[str, int]) -> None:
    t = node.get("time") or {}
    key = node.get("key")
    if key:
        acc[key] = int(t.get("ownSpentSec") or 0)
    for child in node.get("children") or []:
        collect_own_spent(child, acc)


def unique_spent_hours(nodes: list[dict]) -> float:
    acc: dict[str, int] = {}
    for n in flatten_edps(nodes):
        collect_own_spent(n, acc)
    return round(sum(acc.values()) / 3600, 2)


def tally(nodes: list[dict]) -> dict:
    leaves = flatten_edps(nodes)
    rolled = 0.0
    for n in leaves:
        hours = (n.get("time") or {}).get("rolledSpentHours")
        if hours:
            rolled += float(hours)
    return {
        "edpCount": len(leaves),
        "activeCount": sum(1 for n in leaves if n.get("active")),
        "eppCount": sum(n.get("eppCount") or 0 for n in leaves),
        "featureCount": sum(n.get("featureCount") or 0 for n in leaves),
        "storyCount": sum(n.get("storyCount") or 0 for n in leaves),
        "rolledSpentHours": round(rolled, 2),
        "uniqueSpentHours": unique_spent_hours(nodes),
    }


def wrap_unclassified(nodes: list[dict]) -> list[dict]:
    groups: dict[str, list] = OrderedDict()
    for n in nodes:
        groups.setdefault(n.get("theme") or "Other / ungrouped", []).append(n)
    return [
        {"type": "theme", "name": name, **tally(kids), "children": kids}
        for name, kids in groups.items()
    ]


def item_id(item: dict) -> str:
    edp = item.get("edp") or {}
    excel = item.get("excel") or {}
    return edp.get("key") or excel.get("summary") or ""


def build_review(products: list[dict], skipped_dupes: list[str], unique_count: int) -> dict:
    unclassified = next((p for p in products if p["name"] == "Unclassified"), None)
    themes = []
    active_unclassified = []
    if unclassified:
        for theme in unclassified.get("children") or []:
            kids = theme.get("children") or []
            themes.append({
                "name": theme["name"],
                "edpCount": len(kids),
                "activeCount": sum(1 for k in kids if k.get("active")),
            })
            for k in kids:
                if k.get("active"):
                    active_unclassified.append({
                        "key": k.get("key"),
                        "title": k.get("title"),
                        "theme": theme["name"],
                        "kind": k.get("kind"),
                        "roadmap": k.get("roadmap"),
                    })
    official = [
        {"name": p["name"], "edpCount": p["edpCount"], "activeCount": p["activeCount"]}
        for p in products if p["name"] != "Unclassified"
    ]
    suggested_tags = []
    title_mismatches = []
    seen_suggest = set()
    seen_mismatch = set()
    for p in products:
        for k in flatten_edps(p.get("children") or []):
            key = k.get("key") or k.get("title")
            if p["name"] == "Unclassified" and k.get("suggestedProduct"):
                if key in seen_suggest:
                    continue
                seen_suggest.add(key)
                suggested_tags.append({
                    "key": k.get("key"),
                    "title": k.get("title"),
                    "suggestedProduct": k.get("suggestedProduct"),
                    "reason": k.get("suggestReason"),
                    "active": bool(k.get("active")),
                    "roadmap": k.get("roadmap") or "",
                    "theme": k.get("theme") or "",
                })
            mismatch = k.get("titleMismatch")
            if mismatch and key not in seen_mismatch:
                seen_mismatch.add(key)
                title_mismatches.append({
                    "key": k.get("key"),
                    "title": k.get("title"),
                    "currentProduct": p["name"],
                    "titleSuggests": mismatch,
                    "reason": k.get("suggestReason"),
                    "active": bool(k.get("active")),
                    "roadmap": k.get("roadmap") or "",
                })
    return {
        "checkedOn": "2026-09-14",
        "uniqueItems": unique_count,
        "duplicateExcelRowsDropped": skipped_dupes,
        "productField": (
            "Live Jira Product Name (customfield_10331) matches the July Excel "
            "Product Name on every matched EDP. Empty in Excel is also empty in Jira."
        ),
        "officialProducts": official,
        "unclassifiedThemes": themes,
        "activeUnclassified": active_unclassified,
        "suggestedTags": suggested_tags,
        "titleMismatches": title_mismatches,
        "rule": (
            "Official product comes only from Jira/Excel Product Name. "
            "Unclassified items are grouped by title theme for navigation; "
            "that theme is not a Product Name. Suggested tags are review "
            "hints only and are not applied."
        ),
    }


def main() -> None:
    data = json.loads(SRC.read_text(encoding="utf-8"))
    buckets: dict[str, list] = OrderedDict((name, []) for name in PRODUCT_ORDER)
    seen_in: dict[str, list[str]] = {}
    seen_ids: set[str] = set()
    skipped_dupes: list[str] = []
    unique_count = 0
    for item in list(data.get("items") or []) + list(data.get("non_ebase") or []):
        ident = item_id(item)
        if ident in seen_ids:
            skipped_dupes.append(ident)
            continue
        seen_ids.add(ident)
        unique_count += 1
        node = compact_item(item)
        homes = products_for(item)
        hint = product_hint(node["title"])
        if hint:
            hname, reason = hint
            if homes == ["Unclassified"]:
                node["suggestedProduct"] = hname
                node["suggestReason"] = reason
            elif hname not in homes:
                node["titleMismatch"] = hname
                node["suggestReason"] = reason
        seen_in[ident] = homes
        for prod in homes:
            if prod not in buckets:
                buckets[prod] = []
            copy = dict(node)
            copy["productLabel"] = prod
            copy["alsoIn"] = [p for p in homes if p != prod]
            buckets[prod].append(copy)

    products = []
    for name, nodes in buckets.items():
        if not nodes:
            continue
        children = wrap_unclassified(nodes) if name == "Unclassified" else nodes
        products.append({
            "type": "product",
            "name": name,
            "official": name != "Unclassified",
            **tally(children),
            "children": children,
        })

    review = build_review(products, skipped_dupes, unique_count)
    (ROOT / "jira_map" / "classification_review.json").write_text(
        json.dumps(review, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    milestones = build_milestone_tree(products)
    for ms in milestones:
        uniq_sec = int((ms.get("time") or {}).get("ownSpentSec") or 0)
        t = dict(ms.get("time") or {})
        pretty = format_jira_time(uniq_sec) if uniq_sec else ""
        t["uniqueSpent"] = pretty
        t["rolledSpent"] = pretty
        ms["time"] = t

    payload = {
        "jiraBase": JIRA,
        "hierarchy": ["product", "theme", "edp", "epp", "feature", "story"],
        "products": products,
        "milestones": milestones,
        "review": review,
        "totals": {
            "products": len(products),
            "edp": sum(p["edpCount"] for p in products),
            "uniqueEdp": unique_count,
            "note": (
                "Official product = Jira/Excel Product Name. "
                "Unclassified is themed for the map only. "
                "An EDP tagged with two products appears under both. "
                "Time is Jira worklogs (8h = 1d). Feature totals include child defects "
                "via aggregatetimespent. EPP totals add the epic's own worklogs to child features. "
                "Shared EPPs are flagged; unique hours de-duplicate tickets. "
                "Delivery milestones group BRPaaS + Power Balancer EPPs (EET / VanHelder cut)."
            ),
            "time": data.get("time") or {},
        },
    }
    payload = apply_payload(payload, load_overlay(), load_budgets())
    update_history(payload)
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_JS.write_text(
        "window.ROADMAP_TREE = " + json.dumps(payload, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    print("products", [(p["name"], p["edpCount"], p["activeCount"]) for p in products])
    print("milestones", [(m["key"], m["eppCount"], m["featureCount"], m["storyCount"]) for m in milestones])
    print("hoursControl", payload.get("hoursControl"))
    print("wrote", OUT_JSON, "js", OUT_JS.stat().st_size)
    write_canvas(payload)


def strip_edp(edp: dict) -> dict:
    epps = []
    for epp in edp.get("children") or []:
        feats = [
            {
                "key": f.get("key"),
                "title": f.get("title"),
                "status": f.get("status"),
                "issuetype": f.get("issuetype"),
                "storyCount": f.get("storyCount") or 0,
                "rolledSpentHours": (f.get("time") or {}).get("rolledSpentHours"),
            }
            for f in epp.get("children") or []
        ]
        epps.append({
            "key": epp.get("key"),
            "title": epp.get("title"),
            "status": epp.get("status"),
            "method": epp.get("method"),
            "featureCount": epp.get("featureCount") or 0,
            "storyCount": epp.get("storyCount") or 0,
            "rolledSpentHours": (epp.get("time") or {}).get("rolledSpentHours"),
            "children": feats,
        })
    out = {
        "type": "edp",
        "key": edp.get("key"),
        "title": edp.get("title"),
        "status": edp.get("status"),
        "kind": edp.get("kind"),
        "roadmap": edp.get("roadmap"),
        "active": edp.get("active"),
        "alsoIn": edp.get("alsoIn") or [],
        "theme": edp.get("theme") or "",
        "classSource": edp.get("classSource") or "",
        "suggestedProduct": edp.get("suggestedProduct") or "",
        "titleMismatch": edp.get("titleMismatch") or "",
        "eppCount": edp.get("eppCount") or 0,
        "featureCount": edp.get("featureCount") or 0,
        "storyCount": edp.get("storyCount") or 0,
        "rolledSpentHours": (edp.get("time") or {}).get("rolledSpentHours"),
        "uniqueSpentHours": (edp.get("time") or {}).get("uniqueSpentHours"),
        "children": epps,
    }
    return out


def strip_stories(products: list) -> list:
    slim = []
    for prod in products:
        children = []
        for child in prod["children"]:
            if child.get("type") == "theme":
                children.append({
                    "type": "theme",
                    "name": child["name"],
                    "edpCount": child.get("edpCount") or 0,
                    "activeCount": child.get("activeCount") or 0,
                    "children": [strip_edp(e) for e in child.get("children") or []],
                })
            else:
                children.append(strip_edp(child))
        slim.append({
            "name": prod["name"],
            "official": prod.get("official", True),
            "edpCount": prod["edpCount"],
            "activeCount": prod["activeCount"],
            "eppCount": prod["eppCount"],
            "featureCount": prod["featureCount"],
            "storyCount": prod["storyCount"],
            "rolledSpentHours": prod.get("rolledSpentHours"),
            "uniqueSpentHours": prod.get("uniqueSpentHours"),
            "children": children,
        })
    return slim


def write_canvas(payload: dict) -> None:
    data = {
        "jiraBase": JIRA,
        "products": strip_stories(payload["products"]),
        "uniqueEdp": payload["totals"]["uniqueEdp"],
    }
    blob = json.dumps(data, ensure_ascii=False)
    canvas = Path(
        r"C:\Users\MihaiPostolache\.cursor\projects\c-Users-MihaiPostolache-Downloads-kpisss\canvases\product-delivery-tree.canvas.tsx"
    )
    if not canvas.parent.exists():
        return
    canvas.write_text(CANVAS_HEAD + blob + CANVAS_TAIL, encoding="utf-8")
    print("wrote canvas", canvas)


CANVAS_HEAD = r'''import {
  Callout,
  CollapsibleSection,
  H1,
  H2,
  Pill,
  Row,
  Stack,
  Stat,
  Text,
  useCanvasState,
} from "cursor/canvas";

type Kind = "all" | "active";

const DATA = '''

CANVAS_TAIL = r''' as const;

function label(key: string | undefined, title: string | undefined) {
  if (key && title) return key + "  ·  " + title;
  return key || title || "(untitled)";
}

export default function ProductDeliveryTree() {
  const [mode, setMode] = useCanvasState<Kind>("roadmap-tree-mode", "active");

  return (
    <Stack gap={16}>
      <Stack gap={6}>
        <H1>Product lines as an expandable tree</H1>
        <Text tone="secondary">
          Same hierarchy as the HTML mind map: product → EDP → EPP → feature.
          Stories stay in the HTML page. Expand a section to walk the next layer.
        </Text>
      </Stack>

      <Row gap={16} wrap>
        <Stat value={String(DATA.uniqueEdp)} label="Unique Excel items" />
        <Stat value={String(DATA.products.length)} label="Product-line buckets" />
        <Stat value="5" label="Levels in the HTML tree" />
      </Row>

      <Callout tone="info" title="Full diagram with Jira links">
        Open Roadmap_Delivery_Tree.html in the kpisss folder. That page expands
        through stories and every key is a Jira link.
      </Callout>

      <Row gap={8}>
        <Pill active={mode === "active"} onClick={() => setMode("active")}>
          Active EDPs
        </Pill>
        <Pill active={mode === "all"} onClick={() => setMode("all")}>
          All items
        </Pill>
      </Row>

      <H2>Expand a product, then an EDP, then an EPP</H2>
      {DATA.products.map((prod) => {
        const kids = prod.children.filter((e) => {
          if (e.type === "theme") {
            return e.children.some((x) => (mode === "all" ? true : x.active));
          }
          return mode === "all" ? true : e.active;
        });
        if (kids.length === 0) return null;
        const openDefault = prod.name === "BRP as a Service" || prod.name === "Power Balancer";
        return (
          <CollapsibleSection
            key={prod.name}
            title={prod.name}
            count={prod.edpCount}
            defaultOpen={openDefault}
            trailing={
              <Text size="small" tone="tertiary">
                {prod.official === false ? "no Product Name · " : ""}
                {prod.eppCount} EPP · {prod.featureCount} features
              </Text>
            }
          >
            {kids.map((child) =>
              child.type === "theme" ? (
                <CollapsibleSection
                  key={prod.name + child.name}
                  title={child.name}
                  count={child.edpCount}
                >
                  {child.children
                    .filter((e) => (mode === "all" ? true : e.active))
                    .map((edp) => (
                      <CollapsibleSection
                        key={prod.name + (edp.key || edp.title)}
                        title={label(edp.key, edp.title)}
                        count={edp.eppCount}
                        trailing={
                          <Text size="small" tone="tertiary">
                            {edp.kind} · {edp.roadmap || "unscheduled"} · {edp.featureCount} feat
                          </Text>
                        }
                      >
                        {edp.children.map((epp) => (
                          <CollapsibleSection
                            key={epp.key || epp.title}
                            title={label(epp.key, epp.title)}
                            count={epp.featureCount}
                            trailing={
                              <Text size="small" tone="tertiary">
                                {(epp.method || "") + " · " + (epp.status || "")}
                              </Text>
                            }
                          >
                            {epp.children.map((feat) => (
                              <Text key={feat.key || feat.title} size="small">
                                {label(feat.key, feat.title)}
                                {feat.status ? "  —  " + feat.status : ""}
                                {feat.storyCount ? "  (" + String(feat.storyCount) + " stories)" : ""}
                              </Text>
                            ))}
                          </CollapsibleSection>
                        ))}
                      </CollapsibleSection>
                    ))}
                </CollapsibleSection>
              ) : (
                <CollapsibleSection
                  key={prod.name + (child.key || child.title)}
                  title={label(child.key, child.title)}
                  count={child.eppCount}
                  trailing={
                    <Text size="small" tone="tertiary">
                      {child.kind} · {child.roadmap || "unscheduled"} · {child.featureCount} feat
                    </Text>
                  }
                >
                  {child.children.map((epp) => (
                    <CollapsibleSection
                      key={epp.key || epp.title}
                      title={label(epp.key, epp.title)}
                      count={epp.featureCount}
                      trailing={
                        <Text size="small" tone="tertiary">
                          {(epp.method || "") + " · " + (epp.status || "")}
                        </Text>
                      }
                    >
                      {epp.children.map((feat) => (
                        <Text key={feat.key || feat.title} size="small">
                          {label(feat.key, feat.title)}
                          {feat.status ? "  —  " + feat.status : ""}
                          {feat.storyCount ? "  (" + String(feat.storyCount) + " stories)" : ""}
                        </Text>
                      ))}
                    </CollapsibleSection>
                  ))}
                </CollapsibleSection>
              )
            )}
          </CollapsibleSection>
        );
      })}
    </Stack>
  );
}
'''


if __name__ == "__main__":
    main()
