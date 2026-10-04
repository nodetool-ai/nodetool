"use client";
import Image from "next/image";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  ListChecks,
  Move,
  Pause,
  Play,
  Type,
  Volume2
} from "lucide-react";
import {
  formatKey,
  formatSeconds,
  illustrationSrc
} from "@/data/adLibrary";
import type { AdBeat } from "@/data/adLibrary";
import { usePrefersReducedMotion } from "@/lib/useGridParallax";
import { BeatProgress } from "./BeatProgress";
import { useVideoBeatClock } from "./useVideoBeatClock";

/** The concept rendered as a NodeTool timeline, at the recipe's beat times. */
export interface AdVideo {
  readonly src: string;
  readonly poster: string;
}

interface AdBeatSequenceProps {
  readonly title: string;
  readonly beats: readonly AdBeat[];
  readonly video: AdVideo;
  /** Server-rendered recipe header shown above the beat sheet. */
  readonly children: ReactNode;
}

/**
 * A beat's start is often mid-entrance. Selecting a beat shows the frame a
 * moment later, once its type and pictures have landed.
 */
function settledMs(beat: AdBeat): number {
  return beat.start_ms + Math.min(700, (beat.end_ms - beat.start_ms) / 2);
}

/**
 * The beat sheet with the rendered ad as a sticky preview. Scrolling selects
 * the beat under the reading line and moves the video to it. Play runs the
 * video, and the beat sheet follows its playback position.
 */
export default function AdBeatSequence({
  title,
  beats,
  video,
  children
}: AdBeatSequenceProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const clock = useVideoBeatClock(videoRef, beats);
  const reducedMotion = usePrefersReducedMotion();
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const playingRef = useRef(false);
  playingRef.current = clock.playing;
  const { seek } = clock;
  const durationMs = beats[beats.length - 1].end_ms;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (playingRef.current) {
          return;
        }
        const hit = entries.find((entry) => entry.isIntersecting);
        if (!hit) {
          return;
        }
        const index = itemRefs.current.indexOf(hit.target as HTMLLIElement);
        if (index >= 0) {
          seek(settledMs(beats[index]));
        }
      },
      { rootMargin: "-35% 0px -60% 0px" }
    );
    for (const item of itemRefs.current) {
      if (item) {
        observer.observe(item);
      }
    }
    return () => observer.disconnect();
  }, [beats, seek]);

  const selectBeat = (index: number): void => {
    seek(settledMs(beats[index]));
    itemRefs.current[index]?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "center"
    });
  };

  const active = beats[clock.activeIndex];

  return (
    <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_auto] xl:gap-24">
      <div className="min-w-0">
        {children}
        <section
          id="beat-sheet"
          aria-labelledby="beats-title"
          className="scroll-mt-28 pt-20"
        >
          <div className="mb-12 flex flex-wrap items-baseline justify-between gap-4 border-b border-white/10 pb-6">
            <h2
              id="beats-title"
              className="text-3xl font-semibold tracking-tight text-white md:text-4xl"
            >
              Beat sheet
            </h2>
            <p className="font-jetbrains text-sm text-slate-400">
              {beats.length} beats · {formatSeconds(durationMs)}
            </p>
          </div>
          <figure className="mb-14 lg:hidden">
            <video
              src={video.src}
              poster={video.poster}
              controls
              muted
              playsInline
              preload="none"
              aria-label={`${title}, rendered from a NodeTool timeline`}
              className="mx-auto aspect-[9/16] w-full max-w-[340px] rounded-[1.5rem] bg-slate-900 object-cover ring-1 ring-white/15"
            />
            <figcaption className="mx-auto mt-3 max-w-[340px] text-xs leading-relaxed text-slate-500">
              Rendered from a NodeTool timeline at these beat times. The
              brand, copy and numbers are fictional.
            </figcaption>
          </figure>
          <ol>
            {beats.map((beat, index) => {
              const isActive = index === clock.activeIndex;
              const isLast = index === beats.length - 1;
              return (
                <li
                  key={beat.id}
                  ref={(node) => {
                    itemRefs.current[index] = node;
                  }}
                  aria-labelledby={beat.id}
                  className="relative grid grid-cols-[4.5rem_minmax(0,1fr)] gap-5 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-8 lg:grid-cols-[2.5rem_minmax(0,1fr)]"
                >
                  <div className="relative">
                    <Image
                      src={illustrationSrc(beat.id)}
                      alt=""
                      width={600}
                      height={1067}
                      sizes="96px"
                      className="aspect-[9/16] w-full rounded-lg object-cover ring-1 ring-white/10 lg:hidden"
                    />
                    <span
                      aria-hidden="true"
                      className={`hidden h-10 w-10 items-center justify-center rounded-full font-jetbrains text-sm font-medium transition-colors duration-300 motion-reduce:transition-none lg:flex ${
                        isActive
                          ? "bg-amber-300 text-slate-950"
                          : "bg-slate-950 text-slate-400 ring-1 ring-white/20"
                      }`}
                    >
                      {index + 1}
                    </span>
                    {!isLast && (
                      <span
                        aria-hidden="true"
                        className="absolute bottom-0 left-5 top-12 hidden w-px bg-white/10 lg:block"
                      />
                    )}
                  </div>
                  <div className={isLast ? "pb-4" : "pb-16"}>
                    <p className="font-jetbrains text-xs text-slate-400">
                      <span className="lg:hidden">Beat {index + 1} · </span>
                      {formatSeconds(beat.start_ms)}–
                      {formatSeconds(beat.end_ms)}
                      <span className="text-slate-600">
                        {" "}
                        · {formatSeconds(beat.end_ms - beat.start_ms)}
                      </span>
                    </p>
                    <h3
                      id={beat.id}
                      className={`mt-2 text-2xl font-semibold tracking-tight transition-colors duration-300 motion-reduce:transition-none ${
                        isActive ? "text-amber-200" : "text-white"
                      }`}
                    >
                      {formatKey(beat.role)}
                    </h3>
                    <p className="mt-3 max-w-2xl text-lg leading-relaxed text-slate-200">
                      {beat.composition}
                    </p>
                    <dl className="mt-6 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 md:grid-cols-3">
                      <BeatDetail icon={Move} label="Motion">
                        {beat.motion}
                      </BeatDetail>
                      <BeatDetail icon={Volume2} label="Sound">
                        {beat.audio_cue}
                      </BeatDetail>
                      <BeatDetail icon={ListChecks} label="Check">
                        {beat.qa}
                      </BeatDetail>
                    </dl>
                    <p className="mt-4 inline-flex items-center gap-2 text-xs text-slate-400">
                      <Type className="h-3.5 w-3.5" aria-hidden="true" />
                      Copy slot:
                      <span className="text-slate-200">
                        {formatKey(beat.copy_slot)}
                      </span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
      <aside aria-label="Sequence preview" className="hidden lg:block">
        <div
          className="sticky top-36"
          style={{ width: "min(340px, calc((100vh - 20rem) * 0.5625))" }}
        >
          <div className="relative overflow-hidden rounded-[2rem] shadow-[0_40px_90px_-40px_rgba(0,0,0,0.9)] ring-1 ring-white/15">
            <video
              ref={videoRef}
              src={video.src}
              poster={video.poster}
              muted
              playsInline
              preload="metadata"
              aria-label={`${title}, rendered from a NodeTool timeline`}
              className="block aspect-[9/16] w-full bg-slate-900 object-cover"
            />
            <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/55 to-transparent px-4 pb-10 pt-4 text-xs font-medium text-white">
              <span className="rounded-full bg-black/40 px-2.5 py-1 backdrop-blur">
                {formatKey(active.role)}
              </span>
              <span className="font-jetbrains">
                {clock.activeIndex + 1}/{beats.length}
              </span>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={clock.playing ? clock.pause : clock.play}
              aria-label={clock.playing ? "Pause preview" : "Play preview"}
              className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-950 transition-colors hover:bg-amber-200"
            >
              {clock.playing ? (
                <Pause className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Play className="ml-0.5 h-4 w-4" aria-hidden="true" />
              )}
            </button>
            <BeatProgress
              beats={beats}
              elapsedMs={clock.elapsedMs}
              onSelect={selectBeat}
              className="min-w-0 flex-1"
            />
            <span className="w-11 shrink-0 text-right font-jetbrains text-xs tabular-nums text-slate-400">
              {(clock.elapsedMs / 1000).toFixed(1)}s
            </span>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Rendered from a NodeTool timeline at these beat times. The brand,
            copy and numbers are fictional.
          </p>
        </div>
      </aside>
    </div>
  );
}

function BeatDetail({
  icon: Icon,
  label,
  children
}: {
  icon: typeof Move;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-slate-950 p-4">
      <dt className="flex items-center gap-2 text-xs font-medium text-slate-400">
        <Icon className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-2 text-sm leading-relaxed text-slate-200">
        {children}
      </dd>
    </div>
  );
}
