"use client";
import { useEffect, useState } from "react";
import { BeatFrame, BeatProgress } from "./BeatFrame";
import { useBeatClock, usePrefersReducedMotion } from "./useBeatClock";

export interface AdConceptSummary {
  readonly id: string;
  readonly title: string;
  readonly route: string;
  readonly objective: string;
  readonly goal: string;
  readonly complexity: string;
  readonly durationMs: number;
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

/** A concept card. Hover or focus plays the beats at their real timing. */
export function AdConceptCard({ concept }: { concept: AdConceptSummary }) {
  const lastIndex = concept.beats.length - 1;
  const clock = useBeatClock(concept.beats, {
    loop: true,
    initialMs: concept.beats[lastIndex].start_ms
  });
  const [armed, setArmed] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const start = (): void => {
    setArmed(true);
    if (!reducedMotion) {
      clock.seek(0);
      clock.play();
    }
  };
  const stop = (): void => {
    clock.pause();
    clock.seek(concept.beats[lastIndex].start_ms);
  };

  return (
    <a
      href={concept.route}
      onPointerEnter={start}
      onPointerLeave={stop}
      onFocus={start}
      onBlur={stop}
      className="focus-ring group flex flex-col rounded-2xl"
    >
      <div className="relative overflow-hidden rounded-2xl ring-1 ring-white/10 transition-shadow duration-300 group-hover:ring-amber-300/50 group-hover:shadow-[0_24px_60px_-20px_rgba(251,191,36,0.35)] motion-reduce:transition-none">
        <BeatFrame
          title={concept.title}
          beats={concept.beats}
          activeIndex={clock.activeIndex}
          loadAll={armed}
          sizes="(min-width: 1024px) 300px, (min-width: 640px) 45vw, 50vw"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent px-3 pb-3 pt-10">
          <BeatProgress
            beats={concept.beats}
            elapsedMs={clock.playing ? clock.elapsedMs : 0}
          />
        </div>
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

/** A frame that loops its beats on its own, for decorative use. */
export function AutoPlayFrame({
  concept,
  delayMs = 0,
  className = ""
}: {
  concept: AdConceptSummary;
  delayMs?: number;
  className?: string;
}) {
  const clock = useBeatClock(concept.beats, { loop: true });
  const reducedMotion = usePrefersReducedMotion();
  const { play, seek } = clock;
  const lastStart = concept.beats[concept.beats.length - 1].start_ms;

  useEffect(() => {
    if (reducedMotion) {
      seek(lastStart);
      return;
    }
    const timer = window.setTimeout(play, delayMs);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, play, seek, delayMs, lastStart]);

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-[1.75rem] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)] ring-1 ring-white/15">
        <BeatFrame
          title={concept.title}
          beats={concept.beats}
          activeIndex={clock.activeIndex}
          loadAll
          sizes="320px"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-4 pb-4 pt-12">
          <BeatProgress beats={concept.beats} elapsedMs={clock.elapsedMs} />
        </div>
      </div>
    </div>
  );
}
