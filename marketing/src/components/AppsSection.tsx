import React from "react";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import {
  miniAppEntries,
  type MiniAppEntry,
  type MiniAppOutputExample,
} from "../data/miniApps";

/**
 * "Apps for everything" (NARRATIVE.md § Apps for everything).
 *
 * A strip of small, single-purpose tools, each named for the job it does. The
 * tiles come from the shipped mini-app catalog, so every card opens the actual
 * app rather than the workflow template behind it.
 */

const TILE_COUNT = 9;

function visualOutput(app: MiniAppEntry): MiniAppOutputExample | undefined {
  return (
    app.outputExamples.find((output) => output.kind === "image") ??
    app.outputExamples.find((output) => output.kind === "video")
  );
}

function tiles(): MiniAppEntry[] {
  return [...miniAppEntries]
    .filter((app) => visualOutput(app))
    .sort(
      (a, b) =>
        Number(b.featured) - Number(a.featured) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, TILE_COUNT);
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
            One job, one tool, one screen. Each app is a shipped workflow with
            a form on top, so an operator runs it without opening the canvas.
          </p>
        </header>

        <div className="scroll-fade mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((app) => {
            const output = visualOutput(app);
            return (
              <a
                key={app.slug}
                href={app.route}
                className="group overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950/40 transition-colors hover:border-emerald-500/40 hover:bg-slate-900/50 focus-ring"
              >
                {output?.kind === "image" && (
                  <Image
                    src={output.path}
                    alt={`${app.name}: ${output.label}`}
                    width={980}
                    height={700}
                    className="aspect-video w-full object-cover"
                  />
                )}
                {output?.kind === "video" && (
                  <video
                    src={output.path}
                    muted
                    playsInline
                    preload="metadata"
                    className="aspect-video w-full object-cover"
                  />
                )}
                <div className="p-5">
                  <h3 className="text-base font-semibold tracking-tight text-white">
                    {app.name}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    {app.tagline || app.summary}
                  </p>
                </div>
              </a>
            );
          })}
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
