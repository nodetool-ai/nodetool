"use client";
import { useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import { categoryLabel, isVertical } from "@/data/storyboards";
import type { Storyboard } from "@/data/storyboards";

/**
 * A storyboard card: the film's poster above its title. The film plays muted
 * while the pointer or keyboard focus is on the card, and rests on its poster
 * otherwise. Decorative: the card's own text names the film.
 */
export function StoryboardCard({ board }: { board: Storyboard }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fit =
    board.aspectRatio === "16:9" ? "object-cover" : "object-contain";

  const play = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.muted = true;
    void video.play().catch(() => {});
  };
  const rest = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.pause();
    video.currentTime = 0;
  };

  return (
    <a
      href={board.route}
      onMouseEnter={play}
      onMouseLeave={rest}
      onFocus={play}
      onBlur={rest}
      className="focus-ring group flex flex-col rounded-2xl"
    >
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-white/10 transition-shadow duration-300 group-hover:shadow-[0_24px_60px_-20px_rgba(251,191,36,0.35)] group-hover:ring-amber-300/50 motion-reduce:transition-none">
        {fit === "object-contain" && (
          <div
            aria-hidden="true"
            className="absolute inset-0 scale-125 bg-cover bg-center opacity-60 blur-2xl"
            style={{ backgroundImage: `url(${board.video.poster.src})` }}
          />
        )}
        <video
          ref={videoRef}
          src={board.video.src}
          poster={board.video.poster.src}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden="true"
          className={`relative block h-full w-full ${fit}`}
        />
        <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 font-jetbrains text-[11px] font-medium text-white backdrop-blur">
          {board.aspectRatio} · {board.shots.length} shots
        </span>
      </div>
      <div className="flex flex-1 flex-col px-1 pt-5">
        <p className="text-xs font-medium text-amber-300">
          {categoryLabel(board.category)}
          {isVertical(board) && (
            <span className="ml-2 text-slate-500">Vertical</span>
          )}
        </p>
        <h3 className="mt-2 flex items-start justify-between gap-3 text-lg font-semibold leading-snug tracking-tight text-slate-100 transition-colors group-hover:text-white md:text-xl">
          {board.title}
          <ArrowUpRight
            className="mt-1 h-4 w-4 shrink-0 text-slate-500 transition-colors group-hover:text-amber-200"
            aria-hidden="true"
          />
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          {board.description}
        </p>
      </div>
    </a>
  );
}
