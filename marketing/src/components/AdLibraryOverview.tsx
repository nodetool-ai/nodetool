import { ArrowDown, ArrowRight } from "lucide-react";
import { adRecipes } from "@/data/adLibrary";
import type { AdRecipe } from "@/data/adLibrary";
import {
  AdConceptCard,
  AutoPlayFrame
} from "./adLibrary/AdConceptCard";
import type { AdConceptSummary } from "./adLibrary/AdConceptCard";

interface AdLibraryOverviewProps {
  readonly compact?: boolean;
}

const HERO_CONCEPT_IDS = ["R07", "R01", "R04"];
const COMPACT_CONCEPT_IDS = ["R01", "R04", "R07", "R15"];

function toSummary(recipe: AdRecipe): AdConceptSummary {
  return {
    id: recipe.id,
    title: recipe.title,
    route: recipe.route,
    objective: recipe.objective,
    goal: recipe.selection.goal,
    complexity: recipe.selection.complexity,
    durationMs: recipe.duration_ms,
    video: { src: recipe.video.src, poster: recipe.video.poster },
    beats: recipe.beats.map(({ id, role, start_ms, end_ms }) => ({
      id,
      role,
      start_ms,
      end_ms
    }))
  };
}

function pick(ids: readonly string[]): AdConceptSummary[] {
  return ids.flatMap((id) => {
    const recipe = adRecipes.find((item) => item.id === id);
    return recipe ? [toSummary(recipe)] : [];
  });
}

const durations = adRecipes.map((recipe) => recipe.duration_ms / 1000);
const DURATION_RANGE = `${Math.min(...durations)}–${Math.max(...durations)}s`;

function ConceptGrid({ concepts }: { concepts: AdConceptSummary[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4 lg:gap-y-14">
      {concepts.map((concept) => (
        <li key={concept.id}>
          <AdConceptCard concept={concept} />
        </li>
      ))}
    </ul>
  );
}

function CompactOverview() {
  return (
    <section aria-labelledby="ad-library-title" className="relative py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-3xl">
            <p className="text-sm font-medium text-amber-300">
              Social ad library
            </p>
            <h2
              id="ad-library-title"
              className="mt-4 text-3xl font-semibold tracking-tight text-slate-100 md:text-5xl"
            >
              Ideas for your next social media ad.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-300">
              {adRecipes.length} short animated ad concepts. Each one shows what
              appears on screen, second by second, and was made as an editable
              NodeTool project.
            </p>
          </div>
          <a
            href="/ad-library"
            className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:border-amber-300/60 hover:text-amber-200"
          >
            Explore the ad library
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
        <ConceptGrid concepts={pick(COMPACT_CONCEPT_IDS)} />
      </div>
    </section>
  );
}

export default function AdLibraryOverview({
  compact = false
}: AdLibraryOverviewProps) {
  if (compact) {
    return <CompactOverview />;
  }
  const [left, center, right] = pick(HERO_CONCEPT_IDS);
  return (
    <>
      <section
        aria-labelledby="ad-library-title"
        className="relative overflow-hidden"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-[8%] top-[18%] h-[420px] w-[420px] rounded-full bg-amber-400/[0.07] blur-[100px]"
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-6 pb-20 pt-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:px-8 lg:pb-28 lg:pt-16">
          <div>
            <p className="text-sm font-medium text-amber-300">
              Social ad library
            </p>
            <h1
              id="ad-library-title"
              className="mt-5 text-5xl font-semibold leading-[1.02] tracking-tight text-white md:text-6xl xl:text-7xl"
            >
              A clear idea.
              <br />
              <span className="text-slate-400">An ad worth making.</span>
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-relaxed text-slate-300">
              {adRecipes.length} motion concepts for short social ads. Each one
              sets the timing, composition, copy budget, and assets, beat by
              beat, so the brief turns into a plan.
            </p>
            <a
              href="#concepts"
              className="focus-ring mt-10 inline-flex items-center gap-2 rounded-full bg-amber-400 px-6 py-3 font-medium text-slate-950 transition-colors hover:bg-amber-300"
            >
              Browse the concepts
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </a>
            <dl className="mt-14 grid max-w-lg grid-cols-3 gap-6 border-t border-white/10 pt-6">
              <div>
                <dt className="text-xs text-slate-400">Concepts</dt>
                <dd className="mt-1 text-lg font-semibold text-white sm:text-2xl">
                  {adRecipes.length}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Length</dt>
                <dd className="mt-1 text-lg font-semibold text-white sm:text-2xl">
                  {DURATION_RANGE}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Formats</dt>
                <dd className="mt-1 whitespace-nowrap text-lg font-semibold text-white sm:text-2xl">
                  9:16 · 4:5 · 1:1
                </dd>
              </div>
            </dl>
          </div>
          {center && (
            <div
              aria-hidden="true"
              className="relative mx-auto hidden h-[520px] w-full max-w-[480px] lg:block"
            >
              {left && (
                <AutoPlayFrame
                  concept={left}
                  className="absolute left-0 top-16 w-[190px] -rotate-6 opacity-70"
                />
              )}
              {right && (
                <AutoPlayFrame
                  concept={right}
                  className="absolute right-0 top-16 w-[190px] rotate-6 opacity-70"
                />
              )}
              <AutoPlayFrame
                concept={center}
                className="absolute left-1/2 top-0 w-[260px] -translate-x-1/2"
              />
            </div>
          )}
        </div>
      </section>
      <section
        id="concepts"
        aria-labelledby="concepts-title"
        className="relative scroll-mt-28 border-t border-white/10 py-20"
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mb-12 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <h2
              id="concepts-title"
              className="text-3xl font-semibold tracking-tight text-white md:text-4xl"
            >
              Pick a concept
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-slate-400">
              Each concept plays as a rendered NodeTool timeline at its beat
              timing. The brands, copy and numbers are fictional.
            </p>
          </div>
          <ConceptGrid concepts={adRecipes.map(toSummary)} />
          <p className="mt-20 max-w-2xl border-t border-white/10 pt-8 text-sm leading-relaxed text-slate-400">
            Looking for finished NodeTool projects with every step shown?
            Explore the{" "}
            <a
              className="focus-ring rounded text-amber-300 underline decoration-amber-300/40 underline-offset-4 hover:decoration-amber-300"
              href="/recipes"
            >
              recipe collection
            </a>
            .
          </p>
        </div>
      </section>
    </>
  );
}
