"use client";
import React, { useRef } from "react";
import { SURFACES as SURFACE_COPY } from "@/data/agentsPage";

interface Surface {
  title: string;
  body: string;
  poster: string;
  /** Base path of a recorded clip with .webm and .mp4 variants. */
  clip?: string;
}

const MEDIA: Record<string, { poster: string; clip?: string }> = {
  Workflows: { poster: "/screen_canvas.webp" },
  Storyboards: { poster: "/surface-storyboard-poster.webp", clip: "/surface-storyboard" },
  Timelines: { poster: "/surface-timeline-poster.webp", clip: "/surface-timeline" },
  Scripts: { poster: "/surface-script-poster.webp", clip: "/surface-script" },
  Sketches: { poster: "/surface-sketch-poster.webp", clip: "/surface-sketch" },
  "3D scenes": { poster: "/surface-3d-poster.webp", clip: "/surface-3d" },
  Games: { poster: "/surface-game-poster.webp", clip: "/surface-game" },
  Apps: { poster: "/screen_app_builder.png" },
};

const SURFACES: Surface[] = SURFACE_COPY.map((surface) => ({
  ...surface,
  ...MEDIA[surface.title],
}));

function SurfaceCard({ surface }: { surface: Surface }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const play = () => {
    const video = videoRef.current;
    if (!video || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    void video.play().catch(() => undefined);
  };

  const stop = () => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
  };

  return (
    <li
      className="group overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 transition-colors hover:border-slate-600"
      onMouseEnter={play}
      onMouseLeave={stop}
    >
      <div className="relative aspect-video overflow-hidden border-b border-slate-800 bg-slate-950">
        {surface.clip ? (
          <video
            ref={videoRef}
            poster={surface.poster}
            muted
            loop
            playsInline
            preload="none"
            aria-hidden
            className="no-desaturate h-full w-full object-cover"
          >
            <source src={`${surface.clip}.webm`} type="video/webm" />
            <source src={`${surface.clip}.mp4`} type="video/mp4" />
          </video>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={surface.poster}
            alt=""
            loading="lazy"
            decoding="async"
            className="no-desaturate h-full w-full object-cover object-left-top"
          />
        )}
      </div>
      <div className="px-5 py-4">
        <h3 className="font-semibold text-white">{surface.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-300">
          {surface.body}
        </p>
      </div>
    </li>
  );
}

export default function AgentSurfaceGrid() {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {SURFACES.map((surface) => (
        <SurfaceCard key={surface.title} surface={surface} />
      ))}
    </ul>
  );
}
