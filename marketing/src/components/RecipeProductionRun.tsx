import Image from "next/image";
import type { RecipeProductionRun as ProductionRun } from "@/data/recipes";

interface RecipeProductionRunProps {
  run: ProductionRun;
}

export default function RecipeProductionRun({ run }: RecipeProductionRunProps) {
  return (
    <section aria-labelledby="production-run-title" className="relative py-12">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="mb-7 flex flex-col gap-4 border-b border-white/10 pb-7 md:flex-row md:items-end md:justify-between">
          <div>
            <h2
              id="production-run-title"
              className="text-3xl font-semibold tracking-tight md:text-4xl"
            >
              Explore the example
            </h2>
            <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-300">
              {run.summary}
            </p>
          </div>
          <div className="shrink-0 rounded-full border border-amber-400/25 bg-amber-400/10 px-4 py-2 text-xs font-medium text-amber-200">
            {run.statusLabel}
          </div>
        </div>

        <div
          className={`grid items-start gap-8 ${run.video ? "lg:grid-cols-2" : ""}`}
        >
          {run.proof && (
            <figure className="min-w-0">
              <Image
                src={run.proof.src}
                alt={run.proof.alt}
                width={1600}
                height={900}
                sizes="(min-width: 1024px) 560px, 100vw"
                className="h-auto w-full rounded-xl bg-slate-900/40 object-contain"
              />
              {run.proof.caption && (
                <figcaption className="mt-3 text-sm leading-relaxed text-slate-400">
                  {run.proof.caption}
                </figcaption>
              )}
            </figure>
          )}

          {run.video && (
            <figure className="min-w-0">
              <video
                aria-label={run.video.caption}
                className="max-h-[560px] w-full rounded-xl bg-slate-900/40 object-contain"
                poster={run.video.poster}
                preload="metadata"
                playsInline
                controls
                muted={!run.video.hasAudio}
                loop={!run.video.hasAudio}
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
        </div>

        <p className="mt-5 text-sm text-slate-400">{run.provider}</p>

        <details className="mt-8 border-t border-white/10 pt-5">
          <summary className="focus-ring cursor-pointer rounded text-sm font-medium text-slate-300">
            About this example and its review status
          </summary>
          <div className="mt-6 grid gap-8 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                What was made
              </h3>
              <ul className="mt-4 space-y-3">
                {run.supportedClaims.map((claim) => (
                  <li
                    key={claim}
                    className="flex gap-3 text-sm leading-relaxed text-slate-300"
                  >
                    <span>{claim}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                Review notes
              </h3>
              <ul className="mt-4 space-y-3">
                {run.limitations.map((limitation) => (
                  <li
                    key={limitation}
                    className="flex gap-3 text-sm leading-relaxed text-slate-400"
                  >
                    <span>{limitation}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
