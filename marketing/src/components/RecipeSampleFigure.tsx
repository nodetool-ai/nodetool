import React from "react";
import Image from "next/image";
import type { RecipeSample } from "@/data/recipes";

interface RecipeSampleFigureProps {
  sample: RecipeSample;
  /** Recipe name, for alt text. */
  name: string;
}

/**
 * The recipe run against live models.
 *
 * A silent clip loops muted and plays itself; one that carries sound gets
 * controls and never autoplays, because a page that starts talking on load is
 * a page people close. Both cases keep `preload="none"` — the sample sits
 * below the fold and must not compete with the page's own LCP.
 */
export default function RecipeSampleFigure({
  sample,
  name,
}: RecipeSampleFigureProps) {
  return (
    <figure className="m-0">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 shadow-xl">
          <Image
            src={sample.image}
            alt={`Output from running the ${name} recipe`}
            width={1280}
            height={720}
            className="w-full"
          />
        </div>
        {sample.video && (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 shadow-xl lg:w-[280px]">
            <video
              className="w-full"
              poster={sample.poster ?? undefined}
              preload="none"
              playsInline
              controls={sample.hasAudio}
              autoPlay={!sample.hasAudio}
              muted={!sample.hasAudio}
              loop={!sample.hasAudio}
            >
              {sample.webm && <source src={sample.webm} type="video/webm" />}
              <source src={sample.video} type="video/mp4" />
            </video>
          </div>
        )}
      </div>
      <figcaption className="mt-5 max-w-3xl text-sm leading-relaxed text-slate-400">
        {sample.caption}
      </figcaption>
      <div className="mt-5">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Produced by
        </span>
        <ul className="mt-3 space-y-2">
          {sample.producedBy.map((model) => (
            <li
              key={model.shipped}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs"
            >
              <span className="rounded-md border border-white/10 bg-slate-950/60 px-2 py-1 font-mono text-slate-300">
                {model.ran}
              </span>
              {model.grade === "exact" && model.shipped === model.ran && (
                <span className="text-slate-500">as the workflow ships it</span>
              )}
              {model.grade === "exact" && model.shipped !== model.ran && (
                <span className="text-emerald-400/80">
                  the model{" "}
                  <span className="font-mono text-slate-500">
                    {model.shipped}
                  </span>{" "}
                  names, {model.why.replace(/^the same [^,]+, /, "")}
                </span>
              )}
              {model.grade === "upgrade" && (
                <span className="text-sky-400/80">
                  chosen over{" "}
                  <span className="font-mono text-slate-500">
                    {model.shipped}
                  </span>{" "}
                  — {model.why}
                </span>
              )}
              {model.grade === "substitute" && (
                <span className="text-amber-400/80">
                  stands in for{" "}
                  <span className="font-mono text-slate-500">
                    {model.shipped}
                  </span>{" "}
                  — {model.why}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
