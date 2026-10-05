import type { Metadata } from "next";
import { ArrowDown } from "lucide-react";
import MarketingPageShell from "@/components/MarketingPageShell";
import JsonLd from "@/components/JsonLd";
import { StoryboardCard } from "@/components/storyboards/StoryboardCard";
import {
  STORYBOARD_CATEGORIES,
  storyboardEntryPages,
  storyboards
} from "@/data/storyboards";

const entry = storyboardEntryPages[0];
export const metadata: Metadata = {
  title: entry.title,
  description: entry.description,
  alternates: { canonical: "https://nodetool.ai/storyboards" },
  openGraph: {
    title: entry.title,
    description: entry.description,
    url: "https://nodetool.ai/storyboards"
  }
};

const FORMATS = Array.from(
  new Set(storyboards.map((board) => board.aspectRatio))
).join(" · ");

export default function StoryboardsPage() {
  return (
    <MarketingPageShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Example storyboards",
          itemListElement: storyboards.map((board, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: board.title,
            url: `https://nodetool.ai${board.route}`
          }))
        }}
      />
      <section aria-labelledby="storyboards-title" className="relative">
        <div className="relative mx-auto max-w-7xl px-6 pb-16 pt-10 lg:px-8 lg:pb-24 lg:pt-16">
          <p className="text-sm font-medium text-amber-300">
            Example storyboards
          </p>
          <h1
            id="storyboards-title"
            className="mt-5 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-tight text-white md:text-6xl xl:text-7xl"
          >
            Watch the film.
            <br />
            <span className="text-slate-400">Then see every shot.</span>
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-slate-300">
            {storyboards.length} short films, each with the storyboard behind
            it. Every page shows the shot list with its camera, timing, and
            direction. Open any of them in NodeTool and change a shot.
          </p>
          <a
            href="#films"
            className="focus-ring mt-10 inline-flex items-center gap-2 rounded-full bg-amber-400 px-6 py-3 font-medium text-slate-950 transition-colors hover:bg-amber-300"
          >
            Browse the films
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </a>
          <dl className="mt-14 grid max-w-lg grid-cols-3 gap-6 border-t border-white/10 pt-6">
            <div>
              <dt className="text-xs text-slate-400">Films</dt>
              <dd className="mt-1 text-lg font-semibold text-white sm:text-2xl">
                {storyboards.length}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Length</dt>
              <dd className="mt-1 text-lg font-semibold text-white sm:text-2xl">
                10–15s
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Formats</dt>
              <dd className="mt-1 whitespace-nowrap text-lg font-semibold text-white sm:text-2xl">
                {FORMATS}
              </dd>
            </div>
          </dl>
        </div>
      </section>
      <div id="films" className="scroll-mt-28">
        {STORYBOARD_CATEGORIES.map((category) => {
          const boards = storyboards.filter(
            (board) => board.category === category.id
          );
          if (boards.length === 0) {
            return null;
          }
          return (
            <section
              key={category.id}
              aria-labelledby={`category-${category.id}`}
              className="relative border-t border-white/10 py-20"
            >
              <div className="mx-auto max-w-7xl px-6 lg:px-8">
                <div className="mb-12 flex flex-col justify-between gap-3 md:flex-row md:items-end">
                  <h2
                    id={`category-${category.id}`}
                    className="text-3xl font-semibold tracking-tight text-white md:text-4xl"
                  >
                    {category.label}
                  </h2>
                  <p className="max-w-md text-sm leading-relaxed text-slate-400">
                    {category.blurb}
                  </p>
                </div>
                <ul className="grid gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
                  {boards.map((board) => (
                    <li key={board.slug}>
                      <StoryboardCard board={board} />
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          );
        })}
      </div>
    </MarketingPageShell>
  );
}
