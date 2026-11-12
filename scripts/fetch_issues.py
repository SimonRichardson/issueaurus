#!/usr/bin/env python3
"""Download GitHub issues for a repo and emit JSON, CSV and data.js for the site."""
import argparse
import csv
import difflib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

OVERRIDES = {
    18644: "CLI UX / status / output",
    18867: "OpenStack",
    18948: "Networking / spaces / TLS",
    18949: "Machine agent",
    19040: "Charms / hooks / relations",
    19188: "CLI UX / status / output",
    19498: "Machine agent",
    19692: "Other / needs triage",
    19746: "CLI UX / status / output",
    19832: "Controller / HA / dqlite",
    19999: "Machines / provisioning",
    20010: "Permissions / RBAC / users",
    20086: "Snap / packaging",
    20103: "Actions / exec",
    20146: "LXD / MicroCloud",
    20473: "Machines / provisioning",
    20706: "Charms / hooks / relations",
    20708: "Charms / hooks / relations",
    20816: "Controller / HA / dqlite",
    21643: "Networking / spaces / TLS",
    21660: "CLI UX / status / output",
    21819: "Bootstrap",
    21850: "Resources / OCI images",
    21877: "CLI UX / status / output",
    22006: "CLI UX / status / output",
    22083: "Kubernetes / CAAS",
    22156: "Kubernetes / CAAS",
    22169: "Performance",
    22305: "CLI UX / status / output",
    22578: "Controller / HA / dqlite",
    22579: "Networking / spaces / TLS",
    22627: "CLI UX / status / output",
    22679: "Charms / hooks / relations",
    22688: "CLI UX / status / output",
    22798: "Storage",
    22952: "Networking / spaces / TLS",
    22974: "Kubernetes / CAAS",
    23110: "Controller / HA / dqlite",
    23141: "Machines / provisioning",
    23257: "Controller / HA / dqlite",
    23329: "Clouds / credentials",
    23433: "Charms / hooks / relations",
    23456: "Kubernetes / CAAS",
    23502: "Kubernetes / CAAS",
    23556: "Charms / hooks / relations",
    23574: "CLI UX / status / output",
    23628: "CLI UX / status / output",
    23630: "Logging / debug-log",
    23649: "Performance",
    23708: "Machine agent",
    23743: "Charms / hooks / relations",
    19057: "JaaS / JIMM / identity",
    19058: "JaaS / JIMM / identity",
    22908: "Controller / HA / dqlite",
    22032: "Upgrades",
    22477: "Controller / HA / dqlite",
    21363: "Upgrades",
    23393: "Resources / OCI images",
    23467: "Resources / OCI images",
    20011: "Bundles",
    21475: "Bundles",
    22442: "Testing / CI",
    22526: "Testing / CI",
    23585: "Model migration",
}

AREA_RULES = [
    ("Model migration", [r"\bmigrat"]),
    ("CMR / offers / SAAS", [r"\boffer", r"\bsaas\b", r"cross[- ]model", r"\bcmr\b", r"\bconsume\b"]),
    ("Secrets", [r"\bsecret"]),
    ("LXD / MicroCloud", [r"\blxd\b", r"\bmicrocloud\b"]),
    ("MAAS", [r"\bmaas\b"]),
    ("OpenStack", [r"\bopenstack\b"]),
    ("Azure", [r"\bazure\b"]),
    ("Google Cloud", [r"\bgce\b", r"google cloud"]),
    ("AWS", [r"\baws\b", r"\bec2\b", r"\bamazon\b"]),
    ("Proxy / airgap", [r"proxy", r"air[- ]?gap"]),
    ("Networking / spaces / TLS", [r"\bsubnet", r"\bspaces?\b", r"\bcidr\b", r"\bfan\b", r"\bipv6\b", r"\bdns\b", r"\bvlan\b", r"\bovn\b", r"\bsni\b", r"\bips?\b", r"\baddress", r"\btls\b"]),
    ("Storage", [r"\bstorage", r"\bvolume", r"\bfilesystem", r"\bmount\b", r"\bpvc\b", r"persistent ?volume", r"\bdisk\b"]),
    ("Kubernetes / CAAS", [r"\bk8s\b", r"kubernetes", r"\bcaas\b", r"\bpods?\b", r"\bpebble\b", r"kubelet", r"statefulset", r"sidecar", r"\bnamespace\b", r"load[ -]?balancer", r"admission webhook", r"\bmicrok8s\b", r"canonical k8s", r"service-type"]),
    ("Charms / hooks / relations", [r"\bhook", r"\brelation", r"\bcharm\b", r"\bcharmhub\b", r"\bleader\b", r"subordinate", r"\bpeers?\b", r"\bendpoint", r"\bintegrate\b", r"\bdatabag\b"]),
    ("Upgrades", [r"upgrad"]),
    ("Controller / HA / dqlite", [r"\bcontroller\b", r"\bha\b", r"high availability", r"\bdqlite\b", r"\bsplitbrain\b"]),
    ("Bootstrap", [r"bootstrap"]),
    ("Machines / provisioning", [r"\bmachines?\b", r"\bprovision", r"\bconstraints\b", r"\bnodes?\b", r"\bvmss\b"]),
    ("SSH", [r"\bssh\b", r"\bscp\b"]),
    ("Actions / exec", [r"\bactions?\b", r"\bexec\b"]),
    ("Logging / debug-log", [r"debug[- ]log", r"\blogs?\b"]),
    ("Performance", [r"expensive", r"\bslow\b", r"bottleneck", r"memory leak", r"too many", r"\bscaling\b"]),
    ("CLI UX / status / output", [r"\bcli\b", r"\boutput\b", r"\bcommand", r"\bflag\b", r"error message", r"\bstatus\b", r"\bmessag"]),
    ("Clouds / credentials", [r"\bclouds?\b", r"\bcredential"]),
    ("Testing / CI", [r"\bflak", r"\btest\b", r"\bci\b", r"github action", r"\bstress\b", r"jujubot"]),
    ("Snap / packaging", [r"\bsnap\b"]),
    ("JaaS / JIMM / identity", [r"\bjaas\b", r"\bjimm\b", r"\boidc\b", r"\bsso\b", r"\boauth\b"]),
    ("Permissions / RBAC / users", [r"\bpermission", r"\brbac\b", r"\bgrant\b", r"\brevoke\b", r"\buser", r"\bauthenticat"]),
    ("Bundles", [r"\bbundle"]),
    ("Resources / OCI images", [r"\bresource", r"oci[- ]image", r"\boci\b"]),
    ("Terraform", [r"terraform"]),
]

VERSION_LABELS = ["2.9", "3.5", "3.6", "3.6/LTS", "4.0", "4.1", "4.2", "main"]
KINDS = ["kind/bug", "kind/feature", "kind/doc", "kind/design", "kind/test"]
STATES = ["state/blocked", "state/in-progress", "state/incomplete",
           "state/will-not-fix", "state/wishlist", "state/workaround"]

CSV_COLUMNS = ["number", "title", "kind", "area", "versions", "labels", "states",
               "triaged", "needs_triage", "author", "assignees", "assigned",
               "in_progress", "staleness", "days_idle", "created", "updated",
               "comments", "duplicates", "resolution_verdict", "url"]

ASSESSMENT_FILE = Path(__file__).resolve().parent / "resolution_assessment.json"

# Manually confirmed duplicate pairs from triage (issue numbers). Only applied
# when both issues exist in the fetched set, so other repos are unaffected.
CURATED_DUPES = [
    (19188, 21877),
    (19800, 21458),
    (19800, 21459),
    (19832, 22706),
    (20706, 20708),
    (21359, 23654),
    (21359, 23656),
    (21359, 23657),
    (21823, 23121),
    (22442, 22521),
    (22690, 23745),
    (22798, 23146),
    (23139, 23465),
    (23400, 23534),
    (23584, 23585),
    (21458, 21459),
    (23656, 23657),
]

GENERIC_STOPWORDS = set("""a an the of to for on in with without and or not no is are be
do does it its that this when while if using use used by from at as into than
then also only all any can cant dont doesnt should would will may might must
one""".split())


def norm_tokens(title):
    tokens = re.split(r"[^a-z0-9]+", title.lower())
    return [t for t in tokens if t and t not in GENERIC_STOPWORDS and t != "juju"]


def title_score(ta, tb):
    a, b = set(norm_tokens(ta)), set(norm_tokens(tb))
    if not a or not b:
        return 0.0
    jaccard = len(a & b) / len(a | b)
    seq = difflib.SequenceMatcher(None, " ".join(norm_tokens(ta)),
                                  " ".join(norm_tokens(tb))).ratio()
    return max(jaccard, seq)


def confidence_band(score):
    """Map a title-similarity score to a 1-5 confidence rating.

    Curated pairs are always 5/5. Auto-matched pairs only ever reach the
    same-area band (>= 0.5) or the cross-area band (>= 0.72), so:
      5 = near-identical titles (auto) or human-confirmed (curated)
      4 = very strong candidate
      3 = plausible candidate
      2 = weak candidate
      1 = borderline, verify manually
    """
    if score >= 0.70:
        return 5
    if score >= 0.60:
        return 4
    if score >= 0.55:
        return 3
    if score >= 0.52:
        return 2
    return 1


def detect_duplicates(records):
    """Attach a duplicates list to every record; return {(lo, hi): score_or_"curated"}."""
    by_num = {r["number"]: r for r in records}
    curated = {(min(a, b), max(a, b)) for a, b in CURATED_DUPES
                if a in by_num and b in by_num}
    pairs = {key: "curated" for key in curated}
    for i, ra in enumerate(records):
        for rb in records[i + 1:]:
            key = (min(ra["number"], rb["number"]), max(ra["number"], rb["number"]))
            if key in pairs:
                continue
            score = title_score(ra["title"], rb["title"])
            if score >= 0.72 or (score >= 0.5 and ra["area"] == rb["area"]):
                pairs[key] = round(score, 2)
    for r in records:
        r["duplicates"] = []
    for (a, b), score in pairs.items():
        for x, y in ((a, b), (b, a)):
            entry = {"number": y, "title": by_num[y]["title"]}
            if score == "curated":
                entry["score"] = None
                entry["source"] = "curated"
                entry["confidence"] = 5
            else:
                entry["score"] = score
                entry["source"] = "auto"
                entry["confidence"] = confidence_band(score)
            by_num[x]["duplicates"].append(entry)
    for r in records:
        r["duplicates"].sort(
            key=lambda d: (d["source"] != "curated", -d["confidence"], -(d["score"] or 0)))
    return pairs


def gh_api(path):
    result = subprocess.run(["gh", "api", path], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"gh api {path} failed:\n{result.stderr.strip()}")
    return json.loads(result.stdout)


def fetch_raw(repo, state, per_page, max_pages):
    raw = []
    pages = 0
    for page in range(1, max_pages + 1):
        items = gh_api(f"repos/{repo}/issues?state={state}&per_page={per_page}&page={page}")
        if not items:
            break
        pages += 1
        raw.extend(items)
    if pages == max_pages:
        print(f"warning: fetched {max_pages} pages without an empty page; "
              f"results may be truncated (raise --max-pages)", file=sys.stderr)
    return [i for i in raw if "pull_request" not in i]


def staleness_of(assignees, in_progress, updated_iso, now, stale_days):
    """Staleness model, in the two flavours requested:

    - unassigned-stale: nobody owns it and nobody has touched it recently
    - assigned-stale:    an assignee exists but no work signal (no
      state/in-progress label, no activity) for at least `stale_days`
    - in-progress:       declared work in progress, never marked stale
    - fresh:             touched within `stale_days`
    """
    days_idle = (now - datetime.fromisoformat(updated_iso)).days
    if in_progress:
        return "in-progress", days_idle
    if days_idle < stale_days:
        return "fresh", days_idle
    if assignees:
        return "assigned-stale", days_idle
    return "unassigned-stale", days_idle


def classify(issue, now, stale_days):
    labels = [l["name"] for l in issue["labels"]]
    label_set = set(labels)
    title = issue["title"]
    if issue["number"] in OVERRIDES:
        area = OVERRIDES[issue["number"]]
    elif "kind/doc" in label_set or title.lower().startswith(("doc:", "docs:", "documentation:")):
        area = "Documentation"
    else:
        area = next((name for name, pats in AREA_RULES
                     if any(re.search(p, title, re.I) for p in pats)), "Other / needs triage")
    kind = next((k.split("/", 1)[1] for k in KINDS if k in label_set), "-")
    assignees = [a["login"] for a in issue.get("assignees") or []]
    in_progress = "state/in-progress" in label_set
    staleness, days_idle = staleness_of(assignees, in_progress, issue["updated_at"], now, stale_days)
    return {
        "number": issue["number"],
        "title": title,
        "body": issue.get("body") or "",
        "labels": labels,
        "kind": kind,
        "area": area,
        "versions": [v for v in VERSION_LABELS if v in label_set],
        "states": [s.split("/", 1)[1] for s in STATES if s in label_set],
        "triaged": "triaged" in label_set,
        "needs_triage": "needs-triage" in label_set,
        "author": (issue.get("user") or {}).get("login", "unknown"),
        "assignees": assignees,
        "assigned": bool(assignees),
        "in_progress": in_progress,
        "staleness": staleness,
        "days_idle": days_idle,
        "created": issue["created_at"][:10],
        "updated": issue["updated_at"][:10],
        "comments": issue["comments"],
        "url": issue["html_url"],
    }


def load_assessment():
    """Load the curated resolution assessment (code-inspection verdicts)."""
    if not ASSESSMENT_FILE.exists():
        return None
    with open(ASSESSMENT_FILE, encoding="utf-8") as f:
        return json.load(f)


def attach_assessment(records, assessment):
    """Attach resolution verdicts to matching records; return (attached, missing)."""
    if not assessment:
        return 0, []
    verdicts = assessment["verdicts"]
    meta = {k: assessment[k] for k in ("assessed_at", "checkout", "method") if k in assessment}
    attached = 0
    missing = []
    by_num = {r["number"]: r for r in records}
    for num_str, v in verdicts.items():
        num = int(num_str)
        if num in by_num:
            by_num[num]["resolution"] = {
                "verdict": v["verdict"],
                "evidence": v["evidence"],
                **meta,
            }
            attached += 1
        else:
            missing.append(num)
    return attached, missing


def write_outputs(records, out_dir, repo, state, stale_days):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    envelope = {
        "repo": repo,
        "state": state,
        "stale_days": stale_days,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "count": len(records),
        "issues": records,
    }
    with open(out_dir / "issues.json", "w", encoding="utf-8") as f:
        json.dump(envelope, f, ensure_ascii=False, indent=2)
        f.write("\n")
    with open(out_dir / "data.js", "w", encoding="utf-8") as f:
        f.write("window.ISSUES_DATA = ")
        f.write(json.dumps(envelope, ensure_ascii=False, separators=(",", ":")))
        f.write(";\n")
    with open(out_dir / "issues.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(CSV_COLUMNS)
        for r in records:
            writer.writerow([
                r["number"], r["title"], r["kind"], r["area"],
                "|".join(r["versions"]), "|".join(r["labels"]),
                "|".join(r["states"]), r["triaged"], r["needs_triage"],
                r["author"], "|".join(r["assignees"]), r["assigned"],
                r["in_progress"], r["staleness"], r["days_idle"],
                r["created"], r["updated"], r["comments"],
                "|".join(f"#{d['number']}({d['confidence']}/5"
                         + (f",{d['score']}" if d["score"] is not None else ",curated") + ")"
                         for d in r["duplicates"]),
                (r.get("resolution") or {}).get("verdict", ""),
                r["url"],
            ])
    return envelope


def print_summary(records):
    def tally(key):
        counts = {}
        for r in records:
            val = key(r)
            if isinstance(val, list):
                for v in val:
                    counts[v] = counts.get(v, 0) + 1
            elif val:
                counts[val] = counts.get(val, 0) + 1
        return counts

    for name, counts in [
        ("kind", tally(lambda r: r["kind"])),
        ("area", tally(lambda r: r["area"])),
        ("version", tally(lambda r: r["versions"])),
        ("triage", tally(lambda r: "triaged" if r["triaged"] else "needs-triage")),
        ("staleness", tally(lambda r: r["staleness"])),
    ]:
        top = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
        print(f"{name:>8}: " + " · ".join(f"{k}: {v}" for k, v in top))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default="juju/juju", help="owner/name (default: %(default)s)")
    parser.add_argument("--state", default="open", choices=["open", "closed", "all"],
                        help="issue state (default: %(default)s)")
    parser.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "data"),
                        help="output directory (default: %(default)s)")
    parser.add_argument("--per-page", type=int, default=100, help="API page size")
    parser.add_argument("--max-pages", type=int, default=50, help="safety cap on pages fetched")
    parser.add_argument("--stale-days", type=int, default=90,
                        help="idle days before an issue counts as stale (default: %(default)s)")
    args = parser.parse_args()

    raw = fetch_raw(args.repo, args.state, args.per_page, args.max_pages)
    now = datetime.now(timezone.utc)
    records = [classify(i, now, args.stale_days) for i in raw]
    pairs = detect_duplicates(records)
    assessment = load_assessment()
    attached, missing = attach_assessment(records, assessment)
    envelope = write_outputs(records, args.out, args.repo, args.state, args.stale_days)

    out_dir = Path(args.out)
    print(f"repo: {envelope['repo']} · state: {envelope['state']} · issues: {envelope['count']}")
    print(f"generated_at: {envelope['generated_at']}")
    print(f"wrote {out_dir / 'issues.json'} ({envelope['count']} issues)")
    print(f"wrote {out_dir / 'issues.csv'}")
    print(f"wrote {out_dir / 'data.js'}")
    print()
    print_summary(records)
    print()
    dup_issues = sum(1 for r in records if r["duplicates"])
    print(f"duplicates: {len(pairs)} pairs involving {dup_issues} issues")
    conf_tally = {}
    for score in pairs.values():
        conf = 5 if score == "curated" else confidence_band(score)
        conf_tally[conf] = conf_tally.get(conf, 0) + 1
    print("confidence: " + " · ".join(
        f"{c}/5: {conf_tally[c]}" for c in sorted(conf_tally, reverse=True)))

    def pair_sort_key(item):
        (a, b), score = item
        if score == "curated":
            return (0, 0, 0, a)
        return (1, -confidence_band(score), -score, a)

    by_num = {r["number"]: r for r in records}
    for (a, b), score in sorted(pairs.items(), key=pair_sort_key):
        if score == "curated":
            tag = "curated 5/5"
        else:
            tag = f"{confidence_band(score)}/5 {score}"
        print(f"  #{a} ~ #{b} [{tag}]  {by_num[a]['title']}  |  {by_num[b]['title']}")
    print()
    if assessment:
        print(f"resolution assessment: {attached} issues"
              + (f" ({len(missing)} assessed issues not in this dataset: "
                 f"{', '.join('#' + str(n) for n in sorted(missing))})" if missing else ""))
        verdict_tally = {}
        for r in records:
            v = (r.get("resolution") or {}).get("verdict")
            if v:
                verdict_tally[v] = verdict_tally.get(v, 0) + 1
        print("verdicts: " + " · ".join(
            f"{v}: {verdict_tally[v]}" for v in sorted(verdict_tally, key=lambda x: -verdict_tally[x])))


if __name__ == "__main__":
    main()