import React from "react";
import type { ShowcaseEntry } from "@/data/showcase";

/**
 * Render one showcase asset (image or video) at a fixed aspect box. Plain
 * <img>/<video> so it works in static SSR without next/image remote config;
 * sources are same-origin (`/showcase/...`) or absolute media URLs.
 */
export default function ShowcaseMedia({
  entry,
  className = "",
  priority = false,
}: {
  entry: ShowcaseEntry;
  className?: string;
  priority?: boolean;
}) {
  const alt = entry.prompt || `${entry.model} output`;
  if (entry.mediaType === "video") {
    return (
      <video
        className={className}
        src={entry.src}
        poster={undefined}
        muted
        loop
        playsInline
        controls
        preload="metadata"
        aria-label={alt}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={entry.src}
      alt={alt}
      width={entry.width ?? undefined}
      height={entry.height ?? undefined}
      loading={priority ? "eager" : "lazy"}
    />
  );
}
