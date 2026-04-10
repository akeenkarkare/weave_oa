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
# 1. Fetch data
python3 scripts/fetch.py

# 2. Analyze
python3 scripts/analyze.py

# 3. Dashboard
cd web && npm install && npm run dev
```
