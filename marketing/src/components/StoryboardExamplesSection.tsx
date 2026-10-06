import Image from "next/image";
import { ArrowRight } from "lucide-react";
import {
  STORYBOARD_STILL,
  storyboardExamples
} from "../data/storyboardExamples";
import type { StoryboardExample } from "../data/storyboardExamples";

function totalSeconds(board: StoryboardExample): number {
  return board.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0);
}

export default function StoryboardExamplesSection() {
  return (
    <section
      id="storyboard-examples"
      aria-labelledby="storyboard-examples-title"
      className="relative py-24"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-3xl">
            <p className="text-sm font-medium text-amber-300">
              Example storyboards
            </p>
            <h2
              id="storyboard-examples-title"
              className="mt-4 text-3xl font-semibold tracking-tight text-slate-100 md:text-5xl"
            >
              Start from a directed board.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-300">
              Each board ships with NodeTool. Every shot has its action, lens,
              camera move, duration, and a rendered still, ready to animate.
            </p>
          </div>
          <a
            href="/recipes/storyboard-to-trailer"
            className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:border-amber-300/60 hover:text-amber-200"
          >
            Storyboard to trailer recipe
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
        <div className="flex flex-col gap-16">
          {storyboardExamples.map((board) => (
            <article
              key={board.slug}
              aria-labelledby={`storyboard-${board.slug}-title`}
            >
              <div className="mb-5 flex flex-col gap-2 border-t border-white/10 pt-5 md:flex-row md:items-baseline md:justify-between">
                <div>
                  <h3
                    id={`storyboard-${board.slug}-title`}
                    className="text-xl font-semibold tracking-tight text-slate-100"
                  >
                    {board.name}
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-400">
                    {board.brief}
                  </p>
                </div>
                <p className="shrink-0 text-sm text-amber-300">
                  {board.category} · {board.shots.length} shots ·{" "}
                  {totalSeconds(board)} seconds
                </p>
              </div>
              <ol
                className={`grid grid-cols-2 gap-3 sm:gap-4 ${board.shots.length > 3 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
              >
                {board.shots.map((shot, index) => (
                  <li
                    key={shot.slug}
                    className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60"
                  >
                    <Image
                      src={shot.image}
                      alt={shot.action}
                      width={STORYBOARD_STILL.width}
                      height={STORYBOARD_STILL.height}
                      sizes="(min-width: 1024px) 25vw, 50vw"
                      className="aspect-video w-full object-cover"
                    />
                    <div className="px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-3">
                      <p className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-jetbrains">Shot {index + 1}</span>
                        <span>{shot.durationSeconds}s</span>
                      </p>
                      <p className="mt-1 font-medium text-slate-100">
                        {shot.slug}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        {shot.framing} · {shot.lens} · {shot.movement}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
