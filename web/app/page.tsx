import fs from "fs";
import path from "path";
import EngineerCard from "./components/EngineerCard";
import Methodology from "./components/Methodology";

type Component = {
  shipped: number;
  review: number;
  issue: number;
  collab: number;
  breadth: number;
};

type Engineer = {
  login: string;
  avatar: string;
  profile: string;
  score: number;
  components: Component;
  raw: {
    shipped_raw: number;
    review_raw: number;
    issue_raw: number;
    collaborators: number;
    areas: string[];
    area_count: number;
  };
  stats: {
    merged_prs: number;
    opened_prs: number;
    reviews_given: number;
    issues_closed: number;
    additions: number;
    deletions: number;
  };
  top_prs: Array<{ number: number; title: string; url: string; substance: number; reviews: number; changedFiles: number }>;
  top_reviews: Array<{ number: number; title: string; url: string; weight: number; changedFiles: number; author: string }>;
  top_issues: Array<{ number: number; title: string; reactions: number; comments: number; weight: number; via_pr: number }>;
};

type Payload = {
  repo: string;
  fetched_at: string;
  since: string;
  days: number;
  pr_count: number;
  author_count: number;
  weights: Record<string, number>;
  top5: Engineer[];
  rest: Array<{ login: string; score: number; components: Component; stats: Engineer["stats"] }>;
};

function loadData(): Payload | null {
  const p = path.join(process.cwd(), "public", "scored.json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function Home() {
  const data = loadData();

  if (!data) {
    return (
      <main className="mx-auto max-w-6xl p-8">
        <h1 className="text-2xl font-bold">PostHog Engineering Impact</h1>
        <p className="mt-2 text-neutral-400">
          Data not yet generated. Run <code className="rounded bg-neutral-800 px-1">python3 scripts/analyze.py</code>.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl p-6 lg:p-8">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">PostHog Engineering Impact</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Top 5 most impactful engineers — {fmtDate(data.since)} → {fmtDate(data.fetched_at)} ({data.days} days)
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Analyzed {data.pr_count.toLocaleString()} PRs from {data.author_count} contributors in{" "}
            <a
              href={`https://github.com/${data.repo}`}
              className="underline decoration-dotted hover:text-neutral-300"
              target="_blank"
              rel="noreferrer"
            >
              {data.repo}
            </a>
          </p>
        </div>
        <a
          href="#methodology"
          className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500"
        >
          How this is calculated ↓
        </a>
      </header>

      {/* Top 5 grid */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        {data.top5.map((e, i) => (
          <EngineerCard key={e.login} engineer={e} rank={i + 1} weights={data.weights} />
        ))}
      </section>

      {/* Runners up */}
      {data.rest.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-400">
            Runners up (6–{5 + data.rest.length})
          </h2>
          <div className="overflow-hidden rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900 text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Engineer</th>
                  <th className="px-3 py-2 text-right">Score</th>
                  <th className="px-3 py-2 text-right">Shipped</th>
                  <th className="px-3 py-2 text-right">Reviews</th>
                  <th className="px-3 py-2 text-right">Issues</th>
                  <th className="px-3 py-2 text-right">Collab</th>
                  <th className="px-3 py-2 text-right">Breadth</th>
                  <th className="px-3 py-2 text-right">Merged PRs</th>
                </tr>
              </thead>
              <tbody>
                {data.rest.map((r, i) => (
                  <tr key={r.login} className="border-t border-neutral-800 hover:bg-neutral-900/40">
                    <td className="px-3 py-2 text-neutral-500">{i + 6}</td>
                    <td className="px-3 py-2">
                      <a
                        href={`https://github.com/${r.login}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-neutral-200 hover:underline"
                      >
                        {r.login}
                      </a>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{r.score.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right font-mono text-neutral-400">{r.components.shipped.toFixed(0)}</td>
                    <td className="px-3 py-2 text-right font-mono text-neutral-400">{r.components.review.toFixed(0)}</td>
                    <td className="px-3 py-2 text-right font-mono text-neutral-400">{r.components.issue.toFixed(0)}</td>
                    <td className="px-3 py-2 text-right font-mono text-neutral-400">{r.components.collab.toFixed(0)}</td>
                    <td className="px-3 py-2 text-right font-mono text-neutral-400">{r.components.breadth.toFixed(0)}</td>
                    <td className="px-3 py-2 text-right font-mono text-neutral-400">{r.stats.merged_prs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Methodology weights={data.weights} />

      <footer className="mt-10 text-center text-xs text-neutral-600">
        Data: GitHub GraphQL API · Built for the Weave take-home · last fetch {fmtDate(data.fetched_at)}
      </footer>
    </main>
  );
}
