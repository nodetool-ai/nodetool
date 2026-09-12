import Image from "next/image";
import type { RecipeProductionRun as ProductionRun } from "@/data/recipes";

interface RecipeProductionRunProps {
  run: ProductionRun;
}

export default function RecipeProductionRun({ run }: RecipeProductionRunProps) {
  return (
    <section
      id="production-proof"
      aria-labelledby="production-run-title"
      className="relative scroll-mt-28 py-12"
    >
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="mb-7 flex flex-col gap-4 border-b border-white/10 pb-7 md:flex-row md:items-end md:justify-between">
          <div>
            <h2
              id="production-run-title"
              className="text-3xl font-semibold tracking-tight md:text-4xl"
            >
              {run.proofTitle}
            </h2>
            <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-300">
              {run.summary}
            </p>
          </div>
        </div>

        <div
          className={`grid items-start gap-8 ${run.video && run.proof ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]" : ""}`}
        >
          {run.video && (
            <figure className="mx-auto w-full min-w-0 max-w-sm">
              <video
                aria-label={run.video.caption}
                className="max-h-[640px] w-full rounded-xl bg-slate-900/40 object-contain"
                poster={run.video.poster}
                preload="metadata"
                playsInline
                controls
                muted={!run.video.hasAudio}
              >
                {run.video.webm && (
                  <source src={run.video.webm} type="video/webm" />
                )}
                <source src={run.video.mp4} type="video/mp4" />
              </video>
              <figcaption className="mt-3 text-sm leading-relaxed text-slate-400">
                {run.video.caption}
              </figcaption>
            </figure>
          )}
          {run.proof && (
            <figure className="min-w-0">
              <Image
                src={run.proof.src}
                alt={run.proof.alt}
                width={1600}
                height={900}
                sizes="(min-width: 1024px) 672px, calc(100vw - 48px)"
                className="h-auto w-full rounded-xl bg-slate-900/40 object-contain"
              />
              {run.proof.caption && (
                <figcaption className="mt-3 text-sm leading-relaxed text-slate-400">
                  {run.proof.caption}
                </figcaption>
              )}
            </figure>
          )}
        </div>

        <p className="mt-5 text-sm text-slate-400">{run.provider}</p>
      </div>
    </section>
  );
}
