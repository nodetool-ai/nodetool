import React from "react";
import { ArrowRight } from "lucide-react";

/**
 * The pain, stated once and briefly, between the hero and the demo.
 *
 * Deliberately low-chrome: no icon cards, no grid of features. It exists to
 * name the reader's current workflow so the demo that follows lands harder.
 */

const frictions = [
  {
    where: "Five tabs",
    what: "Midjourney for the still, Runway for the motion, ElevenLabs for the voice, Premiere to put it together.",
  },
  {
    where: "Export, import, repeat",
    what: "Every handoff costs you the thread — the prompt, the seed, the reason you made that choice.",
  },
  {
    where: "Credits you bought in advance",
    what: "Paid at a markup, spent on a list of models somebody else picked for you.",
  },
  {
    where: "The tool you rely on gets acquired",
    what: "Prices move, models disappear, and your work sits inside somebody else's roadmap.",
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
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-12">
            <div>
              <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-rose-300/80">
                <span className="h-px w-8 bg-rose-400/50" />
                The way it works today
              </div>
              <h2
                id="status-quo-title"
                className="text-2xl font-bold tracking-tight text-white md:text-3xl"
              >
                Making one piece
                <br />
                shouldn&apos;t take five subscriptions.
              </h2>
              <p className="mt-4 text-slate-400 leading-relaxed">
                Stop exporting. Start finishing. One canvas, your keys, and a
                workflow file that is yours to keep when the piece is done.
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
              {frictions.map((f) => (
                <li
                  key={f.where}
                  className="flex gap-4 border-l border-slate-800 pl-5"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-200">
                      {f.where}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">
                      {f.what}
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
