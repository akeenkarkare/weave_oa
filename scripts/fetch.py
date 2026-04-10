"""
Fetch PostHog GitHub data for the last 90 days via the GraphQL API.

Strategy:
- PostHog is very high-volume (~3000 PRs/month). To cover 90 days within time
  budget, we fetch PRs sorted by UPDATED_AT desc and stop once we cross the
  90-day boundary. We keep the per-PR payload focused on signals we score on.

Pulls per PR:
- Author, state, timestamps, additions/deletions/changedFiles
- Body length (proxy for thoughtfulness)
- Reviews (reviewer, state) — leverage signal
- Files touched (first 20 paths) — code-area breadth
- Closing issue references with reactions + comment counts — issue-importance
"""

import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import urllib.request
import urllib.error

REPO_OWNER = "PostHog"
REPO_NAME = "posthog"
DAYS = 90
PAGE_SIZE = 50
MAX_PAGES = 400  # safety cap — 20000 PRs
OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "raw.json"
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"

GRAPHQL_URL = "https://api.github.com/graphql"


def load_token() -> str:
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text().splitlines():
            line = line.strip()
            if line.startswith("GITHUB_TOKEN="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    tok = os.environ.get("GITHUB_TOKEN")
    if tok:
        return tok
    sys.exit("no GITHUB_TOKEN in .env or env")


def gql(query: str, variables: dict, token: str, retries: int = 4) -> dict:
    payload = json.dumps({"query": query, "variables": variables}).encode()
    req = urllib.request.Request(
        GRAPHQL_URL,
        data=payload,
        headers={
            "Authorization": f"bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "weave-oa-posthog-impact",
        },
        method="POST",
    )
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read())
                if "errors" in data and data["errors"]:
                    print(f"  graphql errors: {data['errors'][:1]}", file=sys.stderr)
                    if not data.get("data") or not data["data"].get("repository"):
                        raise RuntimeError(data["errors"])
                return data
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="ignore")
            if e.code in (502, 503, 504) and attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
            if e.code == 403:
                print(f"  403, waiting 30s (attempt {attempt+1}): {body[:200]}", file=sys.stderr)
                time.sleep(30)
                continue
            raise RuntimeError(f"HTTP {e.code}: {body[:500]}")
        except Exception:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
            raise
    raise RuntimeError("gql: retries exhausted")


PR_QUERY = """
query($owner: String!, $name: String!, $cursor: String, $size: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: $size, after: $cursor, orderBy: {field: UPDATED_AT, direction: DESC}, states: [MERGED, CLOSED, OPEN]) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number
        title
        url
        state
        merged
        mergedAt
        createdAt
        updatedAt
        additions
        deletions
        changedFiles
        bodyText
        author { login }
        labels(first: 8) { nodes { name } }
        reviews(first: 20) {
          nodes {
            state
            author { login }
            submittedAt
          }
        }
        comments(first: 1) { totalCount }
        files(first: 20) {
          nodes { path }
        }
        closingIssuesReferences(first: 5) {
          nodes {
            number
            title
            reactions { totalCount }
            comments { totalCount }
          }
        }
      }
    }
  }
  rateLimit { remaining resetAt }
}
"""


def fetch_prs(token: str, since: datetime) -> list[dict]:
    prs: list[dict] = []
    cursor = None
    page = 0
    while True:
        page += 1
        data = gql(
            PR_QUERY,
            {"owner": REPO_OWNER, "name": REPO_NAME, "cursor": cursor, "size": PAGE_SIZE},
            token,
        )
        repo = data["data"]["repository"]
        rl = data["data"].get("rateLimit", {})
        conn = repo["pullRequests"]
        nodes = conn["nodes"]
        stop = False
        kept_this_page = 0
        oldest_updated = None
        for pr in nodes:
            updated = datetime.fromisoformat(pr["updatedAt"].replace("Z", "+00:00"))
            oldest_updated = updated
            if updated < since:
                stop = True
                continue
            prs.append(pr)
            kept_this_page += 1
        print(
            f"  page {page}: +{kept_this_page}/{len(nodes)} → {len(prs)} kept"
            f" | oldest={oldest_updated} | rl={rl.get('remaining')}",
            file=sys.stderr,
        )
        if stop:
            print("  reached 90-day boundary, stopping", file=sys.stderr)
            break
        if not conn["pageInfo"]["hasNextPage"]:
            break
        cursor = conn["pageInfo"]["endCursor"]
        if page >= MAX_PAGES:
            print(f"  hit {MAX_PAGES}-page cap", file=sys.stderr)
            break
    return prs


def main() -> None:
    token = load_token()
    since = datetime.now(timezone.utc) - timedelta(days=DAYS)
    print(f"fetching PRs for {REPO_OWNER}/{REPO_NAME} since {since.isoformat()}", file=sys.stderr)
    prs = fetch_prs(token, since)
    out = {
        "repo": f"{REPO_OWNER}/{REPO_NAME}",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "since": since.isoformat(),
        "days": DAYS,
        "pr_count": len(prs),
        "prs": prs,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out))
    print(f"wrote {len(prs)} PRs to {OUT_PATH}", file=sys.stderr)


if __name__ == "__main__":
    main()
