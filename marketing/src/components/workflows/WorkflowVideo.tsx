"use client";

import React, { useState } from "react";
import { Play } from "lucide-react";
import type { WorkflowMarketplaceEntry } from "@/lib/workflows/types";

interface WorkflowVideoProps {
  video: NonNullable<WorkflowMarketplaceEntry["video"]>;
  title: string;
}

export default function WorkflowVideo({ video, title }: WorkflowVideoProps) {
  const [playing, setPlaying] = useState(false);

  if (video.kind === "mp4") {
    return (
      <video
        controls
        preload="metadata"
        poster={video.poster}
        className="aspect-video w-full rounded-2xl bg-black ring-1 ring-white/10"
      >
        <source src={video.src} type="video/mp4" />
      </video>
    );
  }

  const poster = video.poster ?? `https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`;

  if (!playing) {
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        className="group relative aspect-video w-full overflow-hidden rounded-2xl ring-1 ring-white/10 transition-all hover:ring-blue-400/30"
        aria-label={`Play demo video for ${title}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={poster} alt={`${title} demo video`} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-neutral-900 shadow-2xl transition-transform group-hover:scale-110">
            <Play className="h-7 w-7 translate-x-0.5 fill-current" />
          </span>
        </div>
      </button>
    );
  }

  return (
    <iframe
      title={`${title} demo video`}
      src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0&modestbranding=1`}
      allow="autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
      className="aspect-video w-full rounded-2xl bg-black ring-1 ring-white/10"
    />
  );
}
