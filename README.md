# PostHog Engineering Impact Dashboard

Identifies the top 5 most impactful engineers at PostHog based on the last 90 days of activity in [PostHog/posthog](https://github.com/PostHog/posthog).

## Approach

Impact is measured as a weighted composite of five signals — not lines of code or commit count. See the in-dashboard "How this is calculated" section for the formula and the per-engineer breakdown.

## Structure

- `scripts/fetch.py` — Pulls PRs, reviews, issues from GitHub GraphQL API → `data/raw.json`
- `scripts/analyze.py` — Computes per-engineer impact scores → `web/public/scored.json`
- `web/` — Next.js dashboard (static, deployed to Vercel)

## Run locally

```bash
# 0. GitHub token — classic PAT with public_repo scope is enough.
#    Generate at: https://github.com/settings/tokens
echo "GITHUB_TOKEN=ghp_yourTokenHere" > .env

# 1. Fetch 90 days of PostHog PRs + reviews + linked issues (~4-6 min)
python3 scripts/fetch.py

# 2. Compute per-engineer impact scores
python3 scripts/analyze.py

# 3. Dashboard
cd web && npm install && npm run dev
```

`scripts/fetch.py` pulls PR metadata ordered by `UPDATED_AT` desc and stops when it crosses the 90-day boundary — this keeps rate-limit usage under ~400 points out of the 5000/hour budget on a single run.
