import React from "react";
import { ArrowRight } from "lucide-react";

/**
 * The enemy, named once, between the hero and the project demo.
 *
 * One enemy: the closed AI studio. Five browser tabs was the 2024 pain and
 * the closed studios already solve it; what holds against them is their
 * models, their credits, and a project only their app opens
 * (NARRATIVE.md § The enemy). Deliberately low-chrome, so the demo that
 * follows lands harder.
 */

const locks = [
  {
    what: "Their models",
    how: "A list they picked. A better model ships and you wait for them to add it.",
  },
  {
    what: "Their credits",
    how: "Priced above what the model costs, spendable only on their list.",
  },
  {
    what: "Their project",
    how: "You get an exported video. The board, the takes, and the cut stay in their app.",
  },
];

export default function StatusQuoSection() {
  return (
    <section
      aria-labelledby="status-quo-title"
      className="relative py-16 sm:py-20"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-8 md:p-10">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,24rem)_1fr] lg:gap-12">
            <div>
              <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-rose-300/80">
                <span className="h-px w-8 bg-rose-400/50" />
                The closed studio
              </div>
              <h2
                id="status-quo-title"
                className="text-2xl font-bold tracking-tight text-white md:text-3xl"
              >
                They make the film.
                <br />
                Then they keep it.
              </h2>
              <p className="mt-4 text-slate-400 leading-relaxed">
                Runway, LTX Studio, Figma Weave and the rest will generate your
                trailer. When they raise the price or drop the model, the film
                goes with it. NodeTool hands the project back, on your keys.
              </p>
              <a
                href="#differences"
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-300 transition-colors hover:text-blue-200 focus-ring"
              >
                See how NodeTool compares
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>

            <ul className="space-y-5">
              {locks.map((l) => (
                <li
                  key={l.what}
                  className="flex gap-4 border-l border-slate-800 pl-5"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-200">
                      {l.what}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">
                      {l.how}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
