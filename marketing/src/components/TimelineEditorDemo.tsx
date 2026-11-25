"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { MousePointerClick } from "lucide-react";
import { useNearViewport } from "../lib/useNearViewport";

/**
 * The real timeline editor from the app, built read-only into
 * public/embed/timeline/ (`npm run build:timeline-embed` in web/). The page
 * shows the film's timeline screenshot until the visitor asks for the editor,
 * so the editor's scripts and fonts never load with the page.
 */
const EMBED_SRC = "/embed/timeline/timeline-embed.html";

const DEMO_FILMS = [
  { slug: "kite", name: "Kite", detail: "15 s · 16:9" },
  { slug: "serein", name: "Serein", detail: "26 s · 16:9" },
  { slug: "cadence", name: "Cadence", detail: "18 s · 9:16" },
] as const;

type DemoSlug = (typeof DEMO_FILMS)[number]["slug"];

export default function TimelineEditorDemo() {
  const [slug, setSlug] = useState<DemoSlug>("kite");
  const [opened, setOpened] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const near = useNearViewport(sectionRef);
  const film = DEMO_FILMS.find((entry) => entry.slug === slug) ?? DEMO_FILMS[0];

  return (
    <section
      ref={sectionRef}
      id="try-the-timeline"
      aria-labelledby="timeline-demo-title"
      className="relative scroll-mt-28 py-16 sm:py-24"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h2
              id="timeline-demo-title"
              className="text-3xl font-semibold tracking-tight text-slate-100 md:text-5xl"
            >
              Try the timeline editor.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-300">
              This is the editor from Studio, running in your browser with one of
              the films above. Play it, drag the playhead, zoom the tracks, and
              select a layer. Changes don&apos;t stick here.
            </p>
          </div>
          <div className="flex gap-2" role="group" aria-label="Timeline to open">
            {DEMO_FILMS.map((entry) => (
              <button
                key={entry.slug}
                type="button"
                aria-pressed={entry.slug === slug}
                onClick={() => setSlug(entry.slug)}
                className={`focus-ring rounded-lg border px-4 py-2 text-left motion-safe:transition-colors ${entry.slug === slug ? "border-amber-300 bg-slate-800" : "border-slate-700 bg-slate-950 hover:border-slate-400"}`}
              >
                <span className="block text-sm font-medium text-slate-100">{entry.name}</span>
                <span className="block text-xs text-slate-400">{entry.detail}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="relative h-[34rem] overflow-hidden rounded-2xl border border-slate-700 bg-[#0f0f17] sm:h-[38rem] lg:h-[44rem]">
          {opened ? (
            <iframe
              key={film.slug}
              src={`${EMBED_SRC}?film=${film.slug}`}
              title={`${film.name} open in NodeTool's timeline editor (read-only demo)`}
              className="h-full w-full"
              allow="autoplay; fullscreen"
            />
          ) : (
            <>
              {near ? (
                <Image
                  src={`/timelines/${film.slug}/timeline.webp`}
                  alt=""
                  fill
                  sizes="(min-width: 1280px) 1216px, 100vw"
                  className="object-cover object-top opacity-60"
                />
              ) : null}
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <button
                  type="button"
                  onClick={() => setOpened(true)}
                  className="focus-ring inline-flex min-h-12 items-center gap-2 rounded-full bg-slate-100 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg hover:bg-white"
                >
                  <MousePointerClick className="h-5 w-5" aria-hidden="true" />
                  Open {film.name} in the editor
                </button>
              </div>
            </>
          )}
        </div>
        <p className="mt-3 text-sm text-slate-400">
          The editor loads about 3 MB when you open it. It plays smoothest in a
          browser with WebGPU.
        </p>
      </div>
    </section>
  );
}
