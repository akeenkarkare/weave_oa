"use client";

import { useState } from "react";

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

const COMPONENT_META: Array<{
  key: keyof Component;
  label: string;
  color: string;
  description: string;
}> = [
  { key: "shipped", label: "Shipped", color: "bg-emerald-500", description: "Merged PRs weighted by review depth + description quality" },
  { key: "review", label: "Review", color: "bg-sky-500", description: "Reviews given, weighted by size of PR reviewed" },
  { key: "issue", label: "Issue", color: "bg-amber-500", description: "PRs closing issues, weighted by issue engagement (reactions + comments)" },
  { key: "collab", label: "Collab", color: "bg-fuchsia-500", description: "Distinct collaborators (review partners)" },
  { key: "breadth", label: "Breadth", color: "bg-rose-500", description: "Distinct top-level directories touched" },
];

function summary(e: Engineer): string {
  const c = e.components;
  const ranked = COMPONENT_META.map((m) => ({ ...m, val: c[m.key] })).sort((a, b) => b.val - a.val);
  const top = ranked[0];
  const stats = e.stats;

  if (top.key === "shipped") {
    return `Shipped ${stats.merged_prs} merged PRs with consistently deep reviews.`;
  }
  if (top.key === "review") {
    return `High-leverage reviewer — gave ${stats.reviews_given} reviews on others' work.`;
  }
  if (top.key === "issue") {
    return `Closed ${stats.issues_closed} high-engagement issues users cared about.`;
  }
  if (top.key === "collab") {
    return `Central collaborator — worked with ${e.raw.collaborators} distinct engineers.`;
  }
  return `Broad systems reach — touched ${e.raw.area_count} areas of the codebase.`;
}

export default function EngineerCard({
  engineer,
  rank,
  weights,
}: {
  engineer: Engineer;
  rank: number;
  weights: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const e = engineer;
  const scoreWidth = Math.min(100, e.score);

  return (
    <div className="flex flex-col rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 transition hover:border-neutral-700">
      {/* Rank + avatar */}
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-bold text-neutral-300">
          {rank}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={e.avatar}
          alt={e.login}
          className="h-12 w-12 shrink-0 rounded-full border border-neutral-700"
        />
        <div className="min-w-0 flex-1">
          <a
            href={e.profile}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-sm font-semibold text-neutral-100 hover:underline"
          >
            {e.login}
          </a>
          <div className="mt-0.5 flex items-baseline gap-1">
            <span className="font-mono text-xl font-bold text-neutral-50">{e.score.toFixed(1)}</span>
            <span className="text-xs text-neutral-500">/ 100</span>
          </div>
        </div>
      </div>

      {/* Why-they're-here summary */}
      <p className="mt-3 text-xs leading-snug text-neutral-300">{summary(e)}</p>

      {/* Component breakdown bars */}
      <div className="mt-3 space-y-1.5">
        {COMPONENT_META.map((m) => {
          const val = e.components[m.key];
          const weight = weights[m.key] ?? 0;
          return (
            <div key={m.key} title={`${m.description} · weight ${(weight * 100).toFixed(0)}%`}>
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-neutral-500">
                <span>{m.label}</span>
                <span className="font-mono">{val.toFixed(0)}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                <div className={`h-full ${m.color}`} style={{ width: `${val}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Stats row */}
      <div className="mt-3 grid grid-cols-2 gap-1 text-[10px] text-neutral-400">
        <div><span className="font-mono text-neutral-200">{e.stats.merged_prs}</span> merged</div>
        <div><span className="font-mono text-neutral-200">{e.stats.reviews_given}</span> reviews</div>
        <div><span className="font-mono text-neutral-200">{e.stats.issues_closed}</span> issues closed</div>
        <div><span className="font-mono text-neutral-200">{e.raw.area_count}</span> areas</div>
      </div>

      {/* Expand for evidence */}
      <button
        onClick={() => setOpen(!open)}
        className="mt-3 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-[10px] uppercase tracking-wide text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
      >
        {open ? "Hide" : "Show"} evidence
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-neutral-800 pt-3 text-xs">
          {e.top_prs.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                Top shipped PRs
              </div>
              <ul className="space-y-1">
                {e.top_prs.map((p) => (
                  <li key={p.number}>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-neutral-300 hover:text-neutral-100 hover:underline"
                      title={p.title}
                    >
                      #{p.number} {p.title}
                    </a>
                    <span className="text-[10px] text-neutral-500">
                      {p.reviews} reviews · {p.changedFiles} files · substance {p.substance}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {e.top_reviews.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                Top reviews given
              </div>
              <ul className="space-y-1">
                {e.top_reviews.map((r) => (
                  <li key={r.number}>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-neutral-300 hover:text-neutral-100 hover:underline"
                      title={r.title}
                    >
                      #{r.number} {r.title}
                    </a>
                    <span className="text-[10px] text-neutral-500">
                      by {r.author} · {r.changedFiles} files
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {e.top_issues.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                Top issues closed
              </div>
              <ul className="space-y-1">
                {e.top_issues.map((i) => (
                  <li key={i.number}>
                    <a
                      href={`https://github.com/PostHog/posthog/issues/${i.number}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-neutral-300 hover:text-neutral-100 hover:underline"
                      title={i.title}
                    >
                      #{i.number} {i.title}
                    </a>
                    <span className="text-[10px] text-neutral-500">
                      {i.reactions} reactions · {i.comments} comments
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {e.raw.areas.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                Areas touched ({e.raw.area_count})
              </div>
              <div className="flex flex-wrap gap-1">
                {e.raw.areas.slice(0, 10).map((a) => (
                  <span key={a} className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
                    {a}
                  </span>
                ))}
                {e.raw.area_count > 10 && (
                  <span className="text-[10px] text-neutral-500">+{e.raw.area_count - 10}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
