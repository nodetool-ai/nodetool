import React from "react";
import { siblings } from "../data/competitorEntries";

/**
 * In-content "Compare NodeTool with other tools" block, rendered on every
 * `/vs/*` and `/alternatives/*` page. Links each page to its siblings (all
 * other competitors, same-category first) so the comparison set is densely
 * interlinked — at least 8 sibling links per page (P3/C4).
 *
 * `basePath` keeps links within the same template ("/vs" or "/alternatives").
 */
export default function ComparisonMesh({
  currentSlug,
  basePath,
}: {
  currentSlug: string;
  basePath: "/vs" | "/alternatives";
}) {
  const links = siblings(currentSlug);

  return (
    <section
      aria-labelledby="mesh-title"
      className="mx-auto mt-16 max-w-5xl px-6"
    >
      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-8 md:p-10">
        <h2
          id="mesh-title"
          className="text-2xl font-semibold tracking-tight text-white"
        >
          Compare NodeTool with other tools
        </h2>
        <p className="mt-3 text-sm text-slate-400">
          See how NodeTool stacks up against the tools it&apos;s most often
          weighed against.
        </p>
        <ul className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((c) => (
            <li key={c.slug}>
              <a
                href={`${basePath}/${c.slug}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/70 bg-slate-900/40 px-4 py-3 text-sm text-slate-300 transition-colors hover:border-slate-700 hover:text-white focus-ring"
              >
                <span>
                  {basePath === "/alternatives"
                    ? `${c.name} alternatives`
                    : `NodeTool vs ${c.name}`}
                </span>
                <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                  {c.category}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
