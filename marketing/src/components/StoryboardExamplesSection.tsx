import Image from "next/image";
import { ArrowRight } from "lucide-react";
import FilmDialogButton from "./FilmDialogButton";
import { storyboards } from "../data/storyboards";
import { storyboardExamples } from "../data/storyboardExamples";
import type { StoryboardExample } from "../data/storyboardExamples";

const pageSlugs = new Set<string>(storyboards.map((board) => board.slug));
const films = new Map<string, (typeof storyboards)[number]["video"]>(
  storyboards.map((board) => [board.slug, board.video])
);

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
              Start from a finished storyboard.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-300">
              These storyboards come with NodeTool. Each shot lists what
              happens, the lens, the camera movement, and the length, with a
              generated still image ready to turn into video.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <a
              href="/storyboards"
              className="focus-ring inline-flex items-center gap-2 rounded-full bg-amber-300 px-5 py-2.5 text-sm font-medium text-slate-950 transition-colors hover:bg-amber-200"
            >
              See all {storyboards.length} storyboards
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <a
              href="/recipes/storyboard-to-trailer"
              className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:border-amber-300/60 hover:text-amber-200"
            >
              Storyboard to trailer recipe
            </a>
          </div>
        </div>
        <div className="flex flex-col gap-16">
          {storyboardExamples.map((board) => {
            const film = films.get(board.slug);
            return (
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
                      {pageSlugs.has(board.slug) ? (
                        <a
                          href={`/storyboards/${board.slug}`}
                          className="focus-ring rounded transition-colors hover:text-amber-200"
                        >
                          {board.name}
                        </a>
                      ) : (
                        board.name
                      )}
                    </h3>
                    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-400">
                      {board.brief}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-3 md:items-end">
                    <p className="text-sm text-amber-300">
                      {board.category} · {board.shots.length} shots ·{" "}
                      {totalSeconds(board)} seconds
                    </p>
                    {film && (
                      <FilmDialogButton
                        title={board.name}
                        src={film.src}
                        poster={film.poster.src}
                        width={film.width}
                        height={film.height}
                      />
                    )}
                  </div>
                </div>
                <ol
                  className={`grid grid-cols-2 gap-3 sm:gap-4 ${board.shots.length >= 5 ? "lg:grid-cols-5" : board.shots.length > 3 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
                >
                  {board.shots.map((shot, index) => (
                    <li
                      key={shot.slug}
                      className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60"
                    >
                      <Image
                        src={shot.image}
                        alt={shot.action}
                        width={board.still.width}
                        height={board.still.height}
                        sizes="(min-width: 1024px) 20vw, 50vw"
                        className="h-auto w-full"
                      />
                      <div className="px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-3">
                        <p className="flex items-center justify-between text-xs text-slate-400">
                          <span className="font-jetbrains">
                            Shot {index + 1}
                          </span>
                          <span>{shot.durationSeconds}s</span>
                        </p>
                        <p className="mt-1 font-medium text-slate-100">
                          {shot.slug}
                        </p>
                        <p className="mt-1 text-xs text-amber-300/90">
                          {shot.framing} · {shot.movement}
                        </p>
                        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-400">
                          {shot.action}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
