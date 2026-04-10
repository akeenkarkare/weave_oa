"""
Compute per-engineer impact scores from data/raw.json.

Impact = weighted composite of five signals. Every score on the dashboard is
traceable to its components — no black-box numbers.

Signals (all normalized to 0-100 before weighting):

1. SHIPPED IMPACT (weight 0.30)
   - Merged PRs, weighted by "substance" (review_depth + PR context richness).
   - A 10-line fix reviewed by 3 people with a detailed body outscores a
     500-line refactor with no reviews and a 1-line description.
   - substance = log(1 + reviews_received) * (1 + min(body_len/500, 2))
   - NOTE: body-length is a proxy for context/effort in the PR description,
     not literal "quality" — we don't grade prose.

2. REVIEW LEVERAGE (weight 0.25)
   - Reviews given, weighted by the size of the PR reviewed (changedFiles).
   - Rewards engineers who unblock others, not just ship their own work.

3. ISSUE RESOLUTION WEIGHT (weight 0.20)
   - PRs that close issues, weighted by that issue's engagement
     (reactions + comments). Captures "solved things users cared about".

4. COLLABORATION BREADTH (weight 0.15)
   - Distinct collaborators: people they reviewed + people who reviewed them.
   - log-scaled to prevent dominance by high-volume authors.

5. CODE AREA BREADTH (weight 0.10)
   - Distinct top-level directories touched. Captures systems-level reach
     vs. narrow specialization. log-scaled.

Output: web/public/scored.json
"""

from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw.json"
OUT = ROOT / "web" / "public" / "scored.json"

BOTS = {
    "dependabot", "dependabot[bot]", "github-actions", "github-actions[bot]",
    "posthog-bot", "pre-commit-ci", "pre-commit-ci[bot]", "renovate",
    "renovate[bot]", "sentry-io", "sentry-io[bot]", "posthog-contributions-bot",
    "posthog-contributions-bot[bot]",
}

WEIGHTS = {
    "shipped": 0.30,
    "review": 0.25,
    "issue": 0.20,
    "collab": 0.15,
    "breadth": 0.10,
}


def login_of(obj):
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj.get("login")
    return None


def is_bot(login: Optional[str]) -> bool:
    if not login:
        return True
    return login.lower() in BOTS or login.endswith("[bot]")


def top_level_dir(path: str) -> str:
    if not path:
        return ""
    parts = path.split("/", 2)
    if len(parts) == 1:
        return "<root>"
    return parts[0]


def substance(pr: dict) -> float:
    reviews = pr.get("reviews", {}).get("nodes", []) or []
    non_self = [r for r in reviews if not is_bot(login_of(r.get("author")))]
    body = pr.get("bodyText") or ""
    body_factor = 1 + min(len(body) / 500.0, 2.0)
    review_factor = math.log(1 + len(non_self))
    return review_factor * body_factor


def normalize(values: dict, pct: float = 0.98) -> dict:
    """Normalize to 0-100 using a percentile as the cap.

    Using max() lets a single outlier (e.g. one extremely prolific reviewer)
    crush everyone else into near-zero. We use the 98th percentile as the
    ceiling — top contributors reach 100, the 1-2 outliers saturate at 100,
    and everyone else keeps meaningful differentiation."""
    if not values:
        return {}
    sorted_vals = sorted(values.values())
    if not sorted_vals or sorted_vals[-1] <= 0:
        return {k: 0.0 for k in values}
    idx = max(0, int(len(sorted_vals) * pct) - 1)
    cap = sorted_vals[idx] if sorted_vals[idx] > 0 else sorted_vals[-1]
    if cap <= 0:
        cap = sorted_vals[-1]
    return {k: min(100.0, 100.0 * v / cap) for k, v in values.items()}


def main() -> None:
    raw = json.loads(RAW.read_text())
    prs = raw["prs"]

    shipped = defaultdict(float)
    review_lev = defaultdict(float)
    issue_w = defaultdict(float)
    collab = defaultdict(set)
    dirs = defaultdict(set)
    # Track (author, issue#) to avoid double-counting when a single issue is
    # closed via multiple PRs by the same engineer.
    seen_issues: dict = defaultdict(set)

    # Top evidence per engineer — for "why" cards
    top_prs: dict[str, list] = defaultdict(list)
    top_reviews: dict[str, list] = defaultdict(list)
    top_issues: dict[str, list] = defaultdict(list)

    pr_stats = defaultdict(lambda: {
        "merged": 0, "opened": 0, "additions": 0, "deletions": 0,
        "reviews_given": 0, "issues_closed": 0,
    })

    author_meta: dict[str, dict] = {}

    for pr in prs:
        author = login_of(pr.get("author"))
        if is_bot(author):
            author = None

        # --- SHIPPED IMPACT ---
        if author and pr.get("merged"):
            s = substance(pr)
            shipped[author] += s
            pr_stats[author]["merged"] += 1
            pr_stats[author]["additions"] += pr.get("additions", 0) or 0
            pr_stats[author]["deletions"] += pr.get("deletions", 0) or 0
            top_prs[author].append({
                "number": pr["number"],
                "title": pr["title"],
                "url": pr["url"],
                "substance": round(s, 2),
                "reviews": len([r for r in (pr.get("reviews", {}).get("nodes") or []) if not is_bot(login_of(r.get("author")))]),
                "changedFiles": pr.get("changedFiles", 0),
            })

        if author:
            pr_stats[author]["opened"] += 1

        # --- REVIEW LEVERAGE ---
        reviews = pr.get("reviews", {}).get("nodes") or []
        seen_reviewers = set()
        for r in reviews:
            rlogin = login_of(r.get("author"))
            if is_bot(rlogin) or rlogin == author:
                continue
            if rlogin in seen_reviewers:
                continue
            seen_reviewers.add(rlogin)
            weight = math.log(1 + (pr.get("changedFiles") or 0))
            review_lev[rlogin] += weight
            pr_stats[rlogin]["reviews_given"] += 1
            top_reviews[rlogin].append({
                "number": pr["number"],
                "title": pr["title"],
                "url": pr["url"],
                "weight": round(weight, 2),
                "changedFiles": pr.get("changedFiles", 0),
                "author": author,
            })

        # --- COLLAB BREADTH (author ↔ reviewers) ---
        if author:
            for rlogin in seen_reviewers:
                collab[author].add(rlogin)
                collab[rlogin].add(author)

        # --- ISSUE RESOLUTION WEIGHT (only if merged) ---
        if author and pr.get("merged"):
            issues = pr.get("closingIssuesReferences", {}).get("nodes") or []
            for iss in issues:
                iss_num = iss.get("number")
                if iss_num in seen_issues[author]:
                    continue  # dedupe — one issue counts once per engineer
                seen_issues[author].add(iss_num)
                r = (iss.get("reactions") or {}).get("totalCount", 0)
                c = (iss.get("comments") or {}).get("totalCount", 0)
                w = 1 + r + 0.5 * c
                issue_w[author] += w
                pr_stats[author]["issues_closed"] += 1
                top_issues[author].append({
                    "number": iss_num,
                    "title": iss["title"],
                    "reactions": r,
                    "comments": c,
                    "weight": round(w, 2),
                    "via_pr": pr["number"],
                })

        # --- CODE AREA BREADTH ---
        if author:
            files = pr.get("files", {}).get("nodes") or []
            for f in files:
                d = top_level_dir(f.get("path", ""))
                if d:
                    dirs[author].add(d)

    # normalize
    n_shipped = normalize(dict(shipped))
    n_review = normalize(dict(review_lev))
    n_issue = normalize(dict(issue_w))
    collab_counts = {k: math.log(1 + len(v)) for k, v in collab.items()}
    n_collab = normalize(collab_counts)
    dir_counts = {k: math.log(1 + len(v)) for k, v in dirs.items()}
    n_breadth = normalize(dir_counts)

    all_authors = set()
    for d in (n_shipped, n_review, n_issue, n_collab, n_breadth):
        all_authors.update(d.keys())

    engineers = []
    for a in all_authors:
        sh = n_shipped.get(a, 0)
        rv = n_review.get(a, 0)
        iw = n_issue.get(a, 0)
        cb = n_collab.get(a, 0)
        br = n_breadth.get(a, 0)
        total = (
            WEIGHTS["shipped"] * sh
            + WEIGHTS["review"] * rv
            + WEIGHTS["issue"] * iw
            + WEIGHTS["collab"] * cb
            + WEIGHTS["breadth"] * br
        )
        stats = pr_stats[a]
        engineers.append({
            "login": a,
            "avatar": f"https://github.com/{a}.png?size=96",
            "profile": f"https://github.com/{a}",
            "score": round(total, 2),
            "components": {
                "shipped": round(sh, 2),
                "review": round(rv, 2),
                "issue": round(iw, 2),
                "collab": round(cb, 2),
                "breadth": round(br, 2),
            },
            "raw": {
                "shipped_raw": round(shipped.get(a, 0), 2),
                "review_raw": round(review_lev.get(a, 0), 2),
                "issue_raw": round(issue_w.get(a, 0), 2),
                "collaborators": len(collab.get(a, set())),
                "areas": sorted(list(dirs.get(a, set())))[:12],
                "area_count": len(dirs.get(a, set())),
            },
            "stats": {
                "merged_prs": stats["merged"],
                "opened_prs": stats["opened"],
                "reviews_given": stats["reviews_given"],
                "issues_closed": stats["issues_closed"],
                "additions": stats["additions"],
                "deletions": stats["deletions"],
            },
            "top_prs": sorted(top_prs.get(a, []), key=lambda x: -x["substance"])[:3],
            "top_reviews": sorted(top_reviews.get(a, []), key=lambda x: -x["weight"])[:3],
            "top_issues": sorted(top_issues.get(a, []), key=lambda x: -x["weight"])[:3],
        })

    engineers.sort(key=lambda e: -e["score"])

    # Trim to top 25 for the dashboard payload; keep only top 5 detail.
    top5 = engineers[:5]
    rest = engineers[5:25]

    out = {
        "repo": raw["repo"],
        "fetched_at": raw["fetched_at"],
        "since": raw["since"],
        "days": raw["days"],
        "pr_count": raw["pr_count"],
        "author_count": len(engineers),
        "weights": WEIGHTS,
        "top5": top5,
        "rest": [
            {"login": e["login"], "score": e["score"], "components": e["components"], "stats": e["stats"]}
            for e in rest
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2))
    print(f"wrote {len(engineers)} scored engineers ({len(top5)} in top5) to {OUT}")
    print("\nTop 5:")
    for e in top5:
        print(f"  {e['login']:25s} score={e['score']:6.2f}  "
              f"shipped={e['components']['shipped']:5.1f} "
              f"review={e['components']['review']:5.1f} "
              f"issue={e['components']['issue']:5.1f} "
              f"collab={e['components']['collab']:5.1f} "
              f"breadth={e['components']['breadth']:5.1f}")


if __name__ == "__main__":
    main()
