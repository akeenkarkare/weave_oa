const COMPONENTS = [
  {
    key: "shipped",
    label: "Shipped Impact",
    color: "bg-emerald-500",
    formula: "Σ merged PRs × log(1 + reviews) × (1 + min(body_len/500, 2))",
    rationale:
      "Work that actually shipped — but weighted by substance, not size. A 10-line fix reviewed deeply with a clear description outscores a 500-line refactor no one reviewed. Line counts are intentionally excluded because they're gameable and uncorrelated with value.",
  },
  {
    key: "review",
    label: "Review Leverage",
    color: "bg-sky-500",
    formula: "Σ reviews given × log(1 + changed_files of reviewed PR)",
    rationale:
      "Reviewing is often invisible but crucial. Engineers who unblock others by giving substantive reviews — especially on large or complex PRs — get credit for that leverage, weighted by the scope of the work they helped land.",
  },
  {
    key: "issue",
    label: "Issue Resolution Weight",
    color: "bg-amber-500",
    formula: "Σ closed issues × (1 + reactions + 0.5 × comments)",
    rationale:
      "Not all issues are equal. Issues with reactions and discussion represent things users and other engineers actually cared about. This captures who solved problems with real downstream demand.",
  },
  {
    key: "collab",
    label: "Collaboration Breadth",
    color: "bg-fuchsia-500",
    formula: "log(1 + distinct review partners)",
    rationale:
      "Impactful engineers tend to work across team boundaries. This counts distinct people an engineer either reviewed or was reviewed by — a proxy for how central they are in the collaboration graph. Log-scaled so volume doesn't dominate.",
  },
  {
    key: "breadth",
    label: "Code Area Breadth",
    color: "bg-rose-500",
    formula: "log(1 + distinct top-level directories touched)",
    rationale:
      "Engineers who can move across multiple systems often have outsized impact vs. narrow specialists — they're the ones stitching the product together. Log-scaled so touching 20 vs. 40 areas doesn't swamp every other signal.",
  },
];

export default function Methodology({ weights }: { weights: Record<string, number> }) {
  return (
    <section id="methodology" className="mt-10 rounded-xl border border-neutral-800 bg-neutral-900/40 p-6">
      <h2 className="text-lg font-semibold text-neutral-100">How this is calculated</h2>
      <p className="mt-1 text-sm text-neutral-400">
        Impact is a weighted composite of five signals. Each is normalized to 0–100 across all contributors, then
        combined with the weights shown below. Every number in this dashboard traces back to PRs, reviews, and issues
        you can click through to — no black-box scores.
      </p>

      <div className="mt-5 space-y-4">
        {COMPONENTS.map((c) => {
          const w = weights[c.key] ?? 0;
          return (
            <div key={c.key} className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${c.color}`} />
                  <h3 className="text-sm font-semibold text-neutral-100">{c.label}</h3>
                </div>
                <div className="font-mono text-xs text-neutral-400">
                  weight {(w * 100).toFixed(0)}%
                </div>
              </div>
              <code className="mt-2 block overflow-x-auto rounded bg-neutral-900 px-2 py-1 text-[11px] text-emerald-300">
                {c.formula}
              </code>
              <p className="mt-2 text-xs leading-relaxed text-neutral-400">{c.rationale}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-lg border border-neutral-800 bg-neutral-950/50 p-4 text-xs leading-relaxed text-neutral-400">
        <div className="mb-1 font-semibold text-neutral-300">What's intentionally excluded</div>
        <ul className="list-inside list-disc space-y-0.5">
          <li>Raw line counts (additions / deletions) — gameable, uncorrelated with value</li>
          <li>Commit count — a single PR can have 1 or 50 commits with no impact difference</li>
          <li>Bot accounts (dependabot, github-actions, renovate, etc.)</li>
          <li>Self-reviews — PRs where the author reviews their own code</li>
        </ul>
      </div>
    </section>
  );
}
