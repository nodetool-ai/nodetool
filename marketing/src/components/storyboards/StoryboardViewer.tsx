"use client";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Play } from "lucide-react";
import { formatTimecode, isVertical, shotStarts } from "@/data/storyboards";
import type { Storyboard } from "@/data/storyboards";
import { usePrefersReducedMotion } from "@/lib/useGridParallax";

interface StoryboardViewerProps {
  readonly board: Storyboard;
  /** Title, summary and facts. Sits beside a vertical film, above a wide one. */
  readonly children: ReactNode;
}

/** The shot that is on screen at `time`, given each shot's start. */
function shotAt(starts: readonly number[], time: number): number {
  let active = 0;
  starts.forEach((start, index) => {
    if (time >= start) {
      active = index;
    }
  });
  return active;
}

/**
 * The finished film first, then the storyboard behind it. A timeline under the
 * film shows its shots in proportion to their length. The shot on screen
 * stays marked, and any shot, in the timeline or below it, plays from its
 * first frame.
 */
export default function StoryboardViewer({
  board,
  children
}: StoryboardViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const reducedMotion = usePrefersReducedMotion();
  const starts = shotStarts(board);
  const active = shotAt(starts, time);
  const vertical = isVertical(board);
  const duration = board.video.duration;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    let frame = 0;
    const tick = () => {
      setTime(video.currentTime);
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      setTime(video.currentTime);
    };
    video.addEventListener("play", start);
    video.addEventListener("pause", stop);
    video.addEventListener("ended", stop);
    video.addEventListener("seeked", stop);
    return () => {
      cancelAnimationFrame(frame);
      video.removeEventListener("play", start);
      video.removeEventListener("pause", stop);
      video.removeEventListener("ended", stop);
      video.removeEventListener("seeked", stop);
    };
  }, []);

  const playShot = useCallback(
    (index: number) => {
      const video = videoRef.current;
      if (!video) {
        return;
      }
      video.currentTime = starts[index] + 0.01;
      void video.play().catch(() => {});
      video.scrollIntoView({
        block: "center",
        behavior: reducedMotion ? "auto" : "smooth"
      });
    },
    // `starts` is derived from the static board.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reducedMotion]
  );

  const player = (
    <div
      className={`overflow-hidden rounded-2xl bg-black shadow-[0_40px_90px_-40px_rgba(251,191,36,0.25)] ring-1 ring-white/15 ${
        vertical ? "mx-auto w-full max-w-[340px]" : "w-full"
      }`}
      style={{ aspectRatio: `${board.video.width} / ${board.video.height}` }}
    >
      <video
        ref={videoRef}
        src={board.video.src}
        poster={board.video.poster.src}
        controls
        playsInline
        preload="metadata"
        aria-label={`${board.title}, the finished film`}
        className="block h-full w-full"
      />
    </div>
  );

  const timeline = (
    <ol
      aria-label="Shots in the film"
      className="flex gap-1.5"
      style={{ minWidth: 0 }}
    >
      {board.shots.map((shot, index) => {
        const isActive = index === active;
        const length = (shot.seconds / board.plannedSeconds) * duration;
        const fill = isActive
          ? Math.min(1, Math.max(0, (time - starts[index]) / length))
          : index < active
            ? 1
            : 0;
        return (
          <li
            key={shot.number}
            style={{ flexGrow: shot.seconds, flexBasis: 0 }}
            className="min-w-0"
          >
            <button
              type="button"
              onClick={() => playShot(index)}
              aria-label={`Play shot ${shot.number}: ${shot.title}`}
              aria-current={isActive ? "true" : undefined}
              className="focus-ring group block w-full rounded-lg text-left"
            >
              <span className="block h-1.5 overflow-hidden rounded-full bg-white/15">
                <span
                  className="block h-full origin-left rounded-full bg-amber-300"
                  style={{ transform: `scaleX(${fill})` }}
                />
              </span>
              <span
                className={`mt-2 block truncate text-xs transition-colors ${
                  isActive
                    ? "text-amber-200"
                    : "text-slate-400 group-hover:text-slate-200"
                }`}
              >
                <span className="font-jetbrains">{shot.number}</span>
                <span className="hidden sm:inline"> · {shot.title}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );

  const panels = (
    <ol
      className={
        vertical
          ? "grid grid-cols-2 gap-x-4 gap-y-12 lg:grid-cols-4 lg:gap-x-6"
          : "space-y-20 md:space-y-28"
      }
    >
      {board.shots.map((shot, index) => {
        const isActive = index === active;
        const ratio = vertical ? "9 / 16" : `${board.video.width} / ${board.video.height}`;
        const still = (
          <div
            className={`relative overflow-hidden rounded-2xl bg-slate-900 ring-1 transition-shadow duration-300 motion-reduce:transition-none ${
              isActive
                ? "ring-amber-300/70 shadow-[0_24px_60px_-24px_rgba(251,191,36,0.4)]"
                : "ring-white/10"
            }`}
            style={{ aspectRatio: ratio }}
          >
            <Image
              src={shot.image.src}
              alt={`Shot ${shot.number}, ${shot.title}: the storyboard still`}
              width={shot.image.width}
              height={shot.image.height}
              sizes={
                vertical
                  ? "(min-width: 1024px) 25vw, 50vw"
                  : "(min-width: 768px) 58vw, 100vw"
              }
              className="h-full w-full object-cover"
            />
            <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 font-jetbrains text-[11px] font-medium text-white backdrop-blur">
              Shot {shot.number}
            </span>
          </div>
        );
        const text = (
          <div className={vertical ? "pt-5" : ""}>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-jetbrains text-xs text-slate-400">
              <span className="text-amber-300">
                {formatTimecode(starts[index])}
              </span>
              <span>{shot.seconds}s</span>
            </p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight text-white md:text-2xl">
              {shot.title}
            </h3>
            <dl className="mt-4 flex flex-wrap gap-2 text-xs">
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-slate-200">
                <dt className="sr-only">Framing</dt>
                <dd>{shot.framing}</dd>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-slate-200">
                <dt className="sr-only">Camera movement</dt>
                <dd>{shot.movement}</dd>
              </div>
            </dl>
            <p
              className={`mt-4 leading-relaxed text-slate-300 ${
                vertical ? "text-sm" : "text-base md:text-lg"
              }`}
            >
              {shot.action}
            </p>
            <button
              type="button"
              onClick={() => playShot(index)}
              className="focus-ring mt-5 inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:border-amber-300/60 hover:text-amber-200"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              Play this shot
            </button>
          </div>
        );
        if (vertical) {
          return (
            <li key={shot.number} className="flex flex-col">
              {still}
              {text}
            </li>
          );
        }
        const flip = index % 2 === 1;
        return (
          <li
            key={shot.number}
            className="grid items-center gap-8 md:grid-cols-12 md:gap-12"
          >
            <div className={`md:col-span-7 ${flip ? "md:order-2" : ""}`}>
              {still}
            </div>
            <div className={`md:col-span-5 ${flip ? "md:order-1" : ""}`}>
              {text}
            </div>
          </li>
        );
      })}
    </ol>
  );

  return (
    <>
      {vertical ? (
        <div className="grid items-center gap-12 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-20">
          <div>
            {player}
            <div className="mx-auto mt-5 max-w-[340px]">{timeline}</div>
          </div>
          <div>{children}</div>
        </div>
      ) : (
        <div>
          {children}
          <div className="mt-8">{player}</div>
          <div className="mt-5">{timeline}</div>
        </div>
      )}
      <section
        aria-labelledby="storyboard-heading"
        className="mt-24 border-t border-white/10 pt-16"
      >
        <h2
          id="storyboard-heading"
          className="text-3xl font-semibold tracking-tight text-white md:text-4xl"
        >
          The storyboard
        </h2>
        <p className="mt-3 max-w-2xl text-slate-400">
          {board.shots.length} shots, {board.plannedSeconds} seconds planned.
          Each still is the keyframe for its shot. The direction beside it
          describes the action and the camera.
        </p>
        <div className="mt-12">{panels}</div>
      </section>
    </>
  );
}
