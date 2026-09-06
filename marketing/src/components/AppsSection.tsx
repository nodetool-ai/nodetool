import React from "react";
import { ArrowRight } from "lucide-react";
import { recipeEntries } from "../data/recipes";
import type { RecipeStep } from "../data/recipes";

/**
 * "Apps for everything" (NARRATIVE.md § Apps for everything).
 *
 * A strip of small, single-purpose tools, each named for the job it does. The
 * tiles are derived from the steps of the shipped recipes rather than written
 * by hand, so every one of them opens a template that actually runs — the grid
 * can never drift into being aspirational.
 */

/** Every recipe step, deduped by template, in recipe order. */
function uniqueSteps(): RecipeStep[] {
  const seen = new Set<string>();
  const out: RecipeStep[] = [];
  for (const recipe of recipeEntries) {
    for (const step of recipe.steps) {
      if (seen.has(step.template)) continue;
      seen.add(step.template);
      out.push(step);
    }
  }
  return out;
}

/**
 * Tiles read best when the name is a verb phrase for the job ("Cut a Product
 * Out of Its Background"), so prefer those and fall back to the rest only if
 * there are not enough to fill the grid.
 */
const VERB_FIRST =
  /^(Cut|Put|Relight|Spin|Take|Write|Score|Localise|Localize|Transcribe|Generate|Remove|Add|Change|Upscale|Fan|Settle|Turn|Make|Build|Draft|Extract|Assemble|Subtitle)\b/;

const TILE_COUNT = 9;

function tiles(): RecipeStep[] {
  const all = uniqueSteps();
  const verbs = all.filter((s) => VERB_FIRST.test(s.name));
  const rest = all.filter((s) => !VERB_FIRST.test(s.name));
  return [...verbs, ...rest].slice(0, TILE_COUNT);
}

export default function AppsSection() {
  const items = tiles();

  return (
    <section
      aria-labelledby="apps-title"
      className="rhythm-section relative py-24"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <header className="scroll-fade max-w-3xl">
          <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
            <span className="h-px w-8 bg-emerald-300/60" />
            Apps
          </div>
          <h2
            id="apps-title"
            className="text-3xl md:text-5xl font-bold tracking-tight text-white"
          >
            Apps for everything.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-400">
            One job, one tool, one screen. Every app here is a shipped workflow
            with a form on top, so an operator runs it without opening the
            canvas.
          </p>
        </header>

        <div className="scroll-fade mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((step) => (
            <a
              key={step.template}
              href={step.route}
              className="group rounded-2xl border border-slate-800/70 bg-slate-950/40 p-5 transition-colors hover:border-emerald-500/40 hover:bg-slate-900/50 focus-ring"
            >
              <h3 className="text-base font-semibold tracking-tight text-white">
                {step.name}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {step.role}.
              </p>
            </a>
          ))}
        </div>

        <div className="scroll-fade mt-8">
          <a
            href="/apps"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-300 transition-colors hover:text-emerald-200 focus-ring"
          >
            View all apps
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
