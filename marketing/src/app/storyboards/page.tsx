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
import { DEFAULT_OG_IMAGES } from "@/lib/defaultOgImage";
import PageUpdated from "@/components/PageUpdated";

// Checked against docs/storyboard-editor.md (Direct a screenplay, Render
// stills and clips, Takes, Change a still, Assemble a timeline, Assistant).
const EDITOR_STEPS = [
  {
    title: "Direct a brief",
    body: "Write the film in a sentence or two, add style and entities, and press Direct. The screenplay model writes the scenes and shots."
  },
  {
    title: "Render each shot",
    body: "Render stills and clips for the whole board or one shot, on the model you pick, with the estimated price shown before you confirm."
  },
  {
    title: "Keep every take",
    body: "Each render adds a take. Pick the current one, edit a still from a prompt, paint an area to change, upscale, or reframe."
  },
  {
    title: "Cut the timeline",
    body: "Create timeline turns the current stills and clips into a timeline where you can trim, split, and export."
  }
];

const entry = storyboardEntryPages[0];
export const metadata: Metadata = {
  title: entry.title,
  description: entry.description,
  alternates: { canonical: "https://nodetool.ai/storyboards" },
  openGraph: {
    images: DEFAULT_OG_IMAGES,
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
          name: "Example AI storyboards",
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
            AI storyboard generator
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
            NodeTool is an open-source AI storyboard generator. It turns a brief
            into scenes and shots, renders a still and a clip for each shot, and
            assembles them into a timeline you can edit. Here are{" "}
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
      <section
        aria-labelledby="editor-title"
        className="relative border-t border-white/10 py-20"
      >
        <div className="mx-auto grid max-w-7xl gap-10 px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:px-8">
          <div>
            <h2
              id="editor-title"
              className="text-3xl font-semibold tracking-tight text-white md:text-4xl"
            >
              What the storyboard editor does
            </h2>
            <p className="mt-4 max-w-sm leading-relaxed text-slate-300">
              The built-in agent can run every step for you, or work beside you
              on the board. Renders use your own provider keys.
            </p>
          </div>
          <ol className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {EDITOR_STEPS.map((step, index) => (
              <li key={step.title}>
                <h3 className="text-xl font-medium text-white">
                  {index + 1}. {step.title}
                </h3>
                <p className="mt-2 leading-relaxed text-slate-300">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
        <nav
          aria-label="Related pages"
          className="mx-auto mt-12 max-w-7xl px-6 lg:px-8"
        >
          <ul className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <li><a href="/ai-video-editor" className="focus-ring rounded text-amber-300 underline underline-offset-2 hover:text-amber-200">AI video editor</a></li>
            <li><a href="https://docs.nodetool.ai/storyboard-editor" className="focus-ring rounded text-amber-300 underline underline-offset-2 hover:text-amber-200">Storyboard Editor guide</a></li>
            <li><a href="/recipes" className="focus-ring rounded text-amber-300 underline underline-offset-2 hover:text-amber-200">Guided recipes</a></li>
            <li><a href="/ad-library" className="focus-ring rounded text-amber-300 underline underline-offset-2 hover:text-amber-200">Video ad templates</a></li>
          </ul>
        </nav>
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
    <div className="mx-auto max-w-7xl px-6 pb-12 lg:px-8">
      <PageUpdated route="/storyboards" className="text-sm text-slate-400" />
    </div>
    </MarketingPageShell>
  );
}
