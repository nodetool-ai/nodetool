"use client";
import { useRef } from "react";
import { useAutoplayInView } from "@/lib/useAutoplayInView";
import type { AdVideo } from "./AdBeatSequence";
import { BeatProgress } from "./BeatProgress";
import { useVideoBeatClock } from "./useVideoBeatClock";

export interface AdConceptSummary {
  readonly id: string;
  readonly title: string;
  readonly route: string;
  readonly objective: string;
  readonly goal: string;
  readonly complexity: string;
  readonly durationMs: number;
  readonly video: AdVideo;
  readonly beats: readonly {
    readonly id: string;
    readonly role: string;
    readonly start_ms: number;
    readonly end_ms: number;
  }[];
}

const COMPLEXITY_LEVEL: Record<string, number> = {
  simple: 1,
  moderate: 2,
  advanced: 3
};

export function ComplexityMeter({ complexity }: { complexity: string }) {
  const level = COMPLEXITY_LEVEL[complexity] ?? 1;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((step) => (
          <span
            key={step}
            className={`h-2.5 w-1 rounded-full ${
              step <= level ? "bg-amber-300" : "bg-white/15"
            }`}
          />
        ))}
      </span>
      <span className="capitalize">{complexity}</span>
    </span>
  );
}

/**
 * The rendered ad, muted and looping while at least half of it is on screen,
 * with its beats as a progress bar. Reduced motion leaves it on its poster,
 * the final frame. Decorative: the card's own text names the concept.
 */
function ConceptVideo({
  concept,
  className = ""
}: {
  concept: AdConceptSummary;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const clock = useVideoBeatClock(videoRef, concept.beats);
  useAutoplayInView(videoRef);
  return (
    <div className={`relative overflow-hidden bg-slate-900 ${className}`}>
      <video
        ref={videoRef}
        src={concept.video.src}
        poster={concept.video.poster}
        muted
        loop
        playsInline
        preload="none"
        aria-hidden="true"
        className="block aspect-[9/16] w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent px-3 pb-3 pt-10">
        <BeatProgress beats={concept.beats} elapsedMs={clock.elapsedMs} />
      </div>
    </div>
  );
}

/** A concept card: the rendered ad above its title, goal and complexity. */
export function AdConceptCard({ concept }: { concept: AdConceptSummary }) {
  return (
    <a
      href={concept.route}
      className="focus-ring group flex flex-col rounded-2xl"
    >
      <div className="relative">
        <ConceptVideo
          concept={concept}
          className="rounded-2xl ring-1 ring-white/10 transition-shadow duration-300 group-hover:shadow-[0_24px_60px_-20px_rgba(251,191,36,0.35)] group-hover:ring-amber-300/50 motion-reduce:transition-none"
        />
        <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 font-jetbrains text-[11px] font-medium text-white backdrop-blur">
          {concept.durationMs / 1000}s · {concept.beats.length} beats
        </span>
      </div>
      <div className="flex flex-1 flex-col px-1 pt-5">
        <p className="flex items-center gap-3 text-xs text-slate-400">
          <span className="font-jetbrains text-slate-500">
            {concept.id.slice(1)}
          </span>
          <span className="capitalize text-amber-300">{concept.goal}</span>
        </p>
        <h3 className="mt-2 text-lg font-semibold leading-snug tracking-tight text-slate-100 transition-colors group-hover:text-white md:text-xl">
          {concept.title}
        </h3>
        <p className="mt-2 hidden flex-1 text-sm leading-relaxed text-slate-400 sm:block">
          {concept.objective}
        </p>
        <p className="mt-4 text-xs text-slate-400">
          <ComplexityMeter complexity={concept.complexity} />
        </p>
      </div>
    </a>
  );
}

/** A rendered ad that plays on its own, for the library's hero. */
export function AutoPlayFrame({
  concept,
  className = ""
}: {
  concept: AdConceptSummary;
  className?: string;
}) {
  return (
    <div className={className}>
      <ConceptVideo
        concept={concept}
        className="rounded-[1.75rem] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)] ring-1 ring-white/15"
      />
    </div>
  );
}
