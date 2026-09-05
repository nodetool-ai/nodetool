import React from "react";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { recipeEntries, sampleFidelity, type RecipeEntry } from "../data/recipes";
import { PROVIDER_DISPLAY } from "../data/providerDisplay";

/**
 * The jobs on the homepage: the four recipes, because each is a job with a
 * buyer, a real run against live models, and a chain that ships inside Studio.
 * The demo use cases stay on /use-cases.
 *
 * A card names the models the shipped chain calls and says "at provider list
 * prices". It never carries a dollar figure: no recorded run has produced one
 * yet, and an estimate that turns out wrong costs more than no number
 * (NARRATIVE.md § Jobs, not demos).
 */

function providersOf(recipe: RecipeEntry): string[] {
  const ids = new Set<string>();
  for (const step of recipe.steps) {
    for (const model of step.models) ids.add(model.provider);
  }
  return [...ids].map((id) => PROVIDER_DISPLAY[id]?.name ?? id);
}

function modelsOf(recipe: RecipeEntry): string[] {
  const ids = new Set<string>();
  for (const step of recipe.steps) {
    for (const model of step.models) ids.add(model.model);
  }
  return [...ids];
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export default function RecipeShowcase() {
  return (
    <section
      id="jobs"
      aria-labelledby="jobs-title"
      className="relative py-24 overflow-clip-safe"
    >
      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="scroll-fade mb-14 max-w-2xl">
          <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">
            <span className="h-px w-8 bg-amber-300/60" />
            The jobs
          </div>
          <h2
            id="jobs-title"
            className="text-3xl md:text-5xl font-bold tracking-tight text-white"
          >
            How teams are using NodeTool.
          </h2>
          <p className="mt-4 text-lg text-slate-400 leading-relaxed">
            Four jobs that run every week, each a real run against live models:
            what you end up holding, who it is for, the models the chain calls,
            and every workflow in it already installed with Studio. Opening a
            chain and reading every graph in it needs no key and no account.
            Running it bills the providers you chose, at their list prices.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {recipeEntries.map((recipe) => {
            const image = recipe.sample?.image ?? recipe.heroThumbnail;
            const providers = providersOf(recipe);
            const models = modelsOf(recipe);
            const fidelity = recipe.sample
              ? sampleFidelity(recipe.sample)
              : null;
            return (
              <article
                key={recipe.slug}
                className="scroll-fade group relative flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900/40 backdrop-blur-sm transition-colors hover:border-amber-500/40"
              >
                {image && (
                  <a href={recipe.route} className="block bg-slate-950">
                    <Image
                      src={image}
                      alt={`Output from running the ${recipe.name} recipe`}
                      width={1280}
                      height={720}
                      // A sample sheet is not 16:9; contain it rather than
                      // cropping a row of the run off the card.
                      className="aspect-video w-full object-contain"
                    />
                  </a>
                )}
                <div className="flex flex-1 flex-col p-6 lg:p-8">
                  <div className="text-sm text-slate-500">
                    For {recipe.audience.charAt(0).toLowerCase()}
                    {recipe.audience.slice(1).replace(/\.$/, "")}
                  </div>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                    {recipe.name}
                  </h3>
                  <p className="mt-3 text-slate-400 leading-relaxed">
                    {recipe.outcome}
                  </p>

                  {fidelity && (
                    <p className="mt-4 text-xs text-slate-500">
                      {fidelity.changed.length === 0
                        ? "The picture above is this chain run exactly as Studio ships it."
                        : `The picture above is this chain run for real, with ${fidelity.changed.length} of ${fidelity.total} models reached another way — the recipe page names which, and why.`}
                    </p>
                  )}

                  <p className="mt-2 text-xs text-slate-500">
                    {recipe.keys.length === 1
                      ? "One provider key to run it. None to read it."
                      : `${recipe.keys.length} provider keys to run the whole chain. None to read it.`}
                  </p>

                  <div className="mt-5">
                    <div className="text-xs text-slate-500">
                      Calls {joinNames(providers)}, on your keys, at list price
                    </div>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {models.map((model) => (
                        <li
                          key={model}
                          className="rounded-md border border-white/10 bg-slate-950/60 px-2 py-0.5 font-mono text-[11px] text-slate-300"
                        >
                          {model}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-4">
                    <a
                      href={recipe.route}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-300 transition-colors hover:text-amber-200 focus-ring"
                    >
                      Read the recipe
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <p className="mt-8 text-sm text-slate-500">
          Every recipe is built from the workflows that ship with Studio.{" "}
          <a
            href="/recipes"
            className="text-blue-300 underline decoration-blue-300/40 underline-offset-2 hover:text-blue-200"
          >
            All recipes
          </a>
          {" · "}
          <a
            href="/use-cases"
            className="text-blue-300 underline decoration-blue-300/40 underline-offset-2 hover:text-blue-200"
          >
            Single-surface demos
          </a>
        </p>
      </div>
    </section>
  );
}
